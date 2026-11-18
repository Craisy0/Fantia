import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDuration, weekStart, monthRange, addMonths, parseStamp, addDays } from '../src/core/time.js';
import { easter, holidayName, isFestive } from '../src/core/holidays.js';
import { daySummary, monthSummary, weekSummary, payBalance } from '../src/core/calc.js';
import * as store from '../src/core/store.js';
import { dateKey } from '../src/core/time.js';

const at = (s) => parseStamp(s);
function stateWith(shifts = [], settings = {}) {
  const st = store.emptyState();
  Object.assign(st.settings, settings);
  for (const s of shifts) store.saveShift(st, s);
  return st;
}

test('tempo: formati e intervalli', () => {
  assert.equal(fmtDuration(485), '8h 05m');
  assert.equal(fmtDuration(-90), '-1h 30m');
  assert.equal(weekStart('2026-11-17'), '2026-11-16'); // martedì -> lunedì
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // domenica -> lunedì
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('festività italiane', () => {
  assert.equal(dateKey(easter(2026)), '2026-04-05');
  assert.equal(dateKey(easter(2027)), '2027-03-28');
  assert.equal(holidayName('2026-04-06'), 'Lunedì dell\'Angelo');
  assert.equal(holidayName('2026-12-25'), 'Natale');
  assert.equal(holidayName('2026-10-04'), 'San Francesco');
  assert.equal(holidayName('2025-10-04'), null);
  assert.equal(isFestive('2026-11-22'), true);          // domenica
  assert.equal(isFestive('2026-12-25'), true);          // Natale
  assert.equal(isFestive('2026-11-17'), false);
});

test('giorno normale: 8 ore a 10 €/h = 80 €', () => {
  const st = stateWith([{ start: '2026-11-17T08:00', end: '2026-11-17T16:00' }]);
  const d = daySummary(st, '2026-11-17');
  assert.equal(d.netMin, 480);
  assert.equal(d.pay, 80);
});

test('più turni nello stesso giorno si sommano, senza maggiorazioni', () => {
  const st = stateWith([
    { start: '2026-11-17T06:00', end: '2026-11-17T12:00' },
    { start: '2026-11-17T13:00', end: '2026-11-17T17:00' },
  ]);
  const d = daySummary(st, '2026-11-17');
  assert.equal(d.netMin, 600);
  assert.equal(d.shifts.length, 2);
  assert.equal(d.pay, 100);
});

test('la tariffa si fissa alla creazione del turno e non cambia con le impostazioni', () => {
  const st = stateWith([{ start: '2026-11-17T08:00', end: '2026-11-17T10:00' }]);
  st.settings.rate = 20;
  store.saveShift(st, { start: '2026-11-18T08:00', end: '2026-11-18T10:00' });
  assert.equal(daySummary(st, '2026-11-17').pay, 20);
  assert.equal(daySummary(st, '2026-11-18').pay, 40);
  // modificare un turno esistente non gli cambia la tariffa
  store.saveShift(st, { id: st.shifts[0].id, start: '2026-11-17T08:00', end: '2026-11-17T11:00' });
  assert.equal(daySummary(st, '2026-11-17').pay, 30);
});

test('domeniche e festivi non cambiano la paga', () => {
  const st = stateWith([
    { start: '2026-12-25T09:00', end: '2026-12-25T13:00' },
    { start: '2026-11-21T22:00', end: '2026-11-22T02:00' },
  ]);
  assert.equal(daySummary(st, '2026-12-25').pay, 40);
  assert.equal(daySummary(st, '2026-11-21').pay, 40);
});

test('validazione dei turni manuali', () => {
  const st = stateWith([{ start: '2026-11-17T08:00', end: '2026-11-17T12:00' }]);
  const bad = (x, msg) => assert.throws(() => store.saveShift(st, x), msg);
  bad({ start: '2026-11-17T12:00', end: '2026-11-17T11:00' }, /dopo/);
  bad({ start: '2026-11-17T11:00', end: '2026-11-17T13:00' }, /sovrappone/);
  bad({ start: '2026-11-18T08:00', end: '2026-11-19T09:00' }, /24 ore/);
  // turno adiacente ammesso; modifica dello stesso turno ammessa
  store.saveShift(st, { start: '2026-11-17T12:00', end: '2026-11-17T13:00' });
  store.saveShift(st, { id: st.shifts[0].id, start: '2026-11-17T07:00', end: '2026-11-17T12:00' });
  assert.equal(st.shifts.length, 2);
  assert.equal(st.shifts[0].start, '2026-11-17T07:00');
});

test('riepiloghi e saldi', () => {
  const st = stateWith([
    { start: '2026-11-16T08:00', end: '2026-11-16T16:00' },
    { start: '2026-11-17T08:00', end: '2026-11-17T12:00' },
    { start: '2026-12-01T08:00', end: '2026-12-01T12:00' },
  ], { monthlyTargetHours: 20 });
  store.savePayment(st, { date: '2026-11-30', amount: 50 });

  const m = monthSummary(st, '2026-11');
  assert.equal(m.netMin, 720);
  assert.equal(m.daysWorked, 2);
  assert.equal(m.pay, 120);
  assert.equal(m.hoursBalanceMin, 720 - 1200);
  assert.equal(m.payments, 50);
  assert.equal(weekSummary(st, '2026-11-16').netMin, 720);
  assert.deepEqual(payBalance(st), { earned: 160, paid: 50, due: 110 });
  assert.equal(monthSummary(stateWith(), '2026-11').hoursBalanceMin, null);
});

test('backup: andata e ritorno, file non validi rifiutati', () => {
  const st = stateWith([{ start: '2026-11-17T08:00', end: '2026-11-17T12:00', note: 'bar' }], { rate: 12.5 });
  store.savePayment(st, { date: '2026-11-30', amount: 50 });
  const back = store.importBackup(store.exportBackup(st));
  assert.deepEqual(back, st);
  assert.throws(() => store.importBackup('ciao'), /leggibile/);
  assert.throws(() => store.importBackup('{"a":1}'), /non è un backup/);
  assert.throws(() => store.importBackup(JSON.stringify({ version: 99, shifts: [] })), /più recente/);
  assert.throws(() => store.importBackup(JSON.stringify({ shifts: [{ start: 'x', end: 'y' }] })), /non valido/);
  // un backup vecchio senza alcune impostazioni riceve i valori predefiniti
  const old = store.importBackup(JSON.stringify({ version: 1, settings: { rate: 9 }, shifts: [] }));
  assert.equal(old.settings.rate, 9);
  assert.equal(old.settings.monthlyTargetHours, 0);
  assert.deepEqual(old.settings.reminder.days, [1, 2, 3, 4, 5]);
});

test('salvataggio su storage e dati corrotti', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(store.load(storage), store.emptyState());
  const st = stateWith([{ start: '2026-11-17T08:00', end: '2026-11-17T12:00' }]);
  store.save(storage, st);
  assert.deepEqual(store.load(storage), st);
  mem.set(store.STORAGE_KEY, '{rotto');
  assert.deepEqual(store.load(storage), store.emptyState());
});

test('backup delle versioni precedenti: turni aperti scartati, assenze e campi vecchi ignorati', () => {
  const old = store.importBackup(JSON.stringify({
    version: 1,
    settings: { rate: 11, overtimePct: 25, festivePct: 30, nightPct: 15, vacationDaysPerYear: 20, longShiftHours: 10 },
    shifts: [
      { id: 'a', start: '2026-11-17T08:00', end: '2026-11-17T12:00', breakMin: 30, pauseStart: null, rate: 11, note: '' },
      { id: 'b', start: '2026-11-18T08:00', end: null, breakMin: 0, pauseStart: null, rate: 11, note: '' },
    ],
    absences: [{ id: 'x', date: '2026-11-19', type: 'ferie', hours: 8, paid: true, rate: 11, note: '' }],
    payments: [],
  }));
  assert.equal(old.shifts.length, 1);
  assert.deepEqual(Object.keys(old.shifts[0]).sort(), ['end', 'id', 'note', 'rate', 'start']);
  assert.deepEqual(Object.keys(old).sort(), ['payments', 'settings', 'shifts', 'version']);
  assert.deepEqual(Object.keys(old.settings).sort(), ['currency', 'monthlyTargetHours', 'rate', 'reminder']);
  assert.equal(old.settings.rate, 11);
  assert.equal(daySummary(old, '2026-11-17').pay, 44);
});
