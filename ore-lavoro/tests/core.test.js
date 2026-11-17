import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDuration, weekStart, monthRange, addMonths, parseStamp, addDays } from '../src/core/time.js';
import { easter, holidayName, isFestive } from '../src/core/holidays.js';
import { nightMinutes, daySummary, monthSummary, weekSummary, payBalance, vacationBalance } from '../src/core/calc.js';
import * as store from '../src/core/store.js';
import { dateKey } from '../src/core/time.js';

const at = (s) => parseStamp(s);
function stateWith(shifts = [], settings = {}) {
  const st = store.emptyState();
  Object.assign(st.settings, settings);
  for (const s of shifts) store.saveShift(st, { rate: st.settings.rate, ...s });
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
  assert.equal(isFestive('2026-11-22', false), false);  // domenica non festiva
  assert.equal(isFestive('2026-11-17'), false);
});

test('minuti notturni', () => {
  assert.equal(nightMinutes(at('2026-11-17T08:00'), at('2026-11-17T17:00')), 0);
  assert.equal(nightMinutes(at('2026-11-17T20:00'), at('2026-11-18T02:00')), 240);
  assert.equal(nightMinutes(at('2026-11-17T04:00'), at('2026-11-17T08:00')), 120);
  assert.equal(nightMinutes(at('2026-11-17T21:00'), at('2026-11-18T07:00')), 480);
  assert.equal(nightMinutes(at('2026-11-17T00:00'), at('2026-11-17T05:00'), '01:00', '04:00'), 180);
});

test('giorno normale: 8 ore a 10 €/h = 80 €', () => {
  const st = stateWith([{ start: '2026-11-17T08:00', end: '2026-11-17T17:00', breakMin: 60 }]);
  const d = daySummary(st, '2026-11-17');
  assert.equal(d.netMin, 480);
  assert.equal(d.overtimeMin, 0);
  assert.equal(d.pay, 80);
});

test('straordinario oltre la soglia, anche su due turni', () => {
  const st = stateWith([
    { start: '2026-11-17T06:00', end: '2026-11-17T12:00' },
    { start: '2026-11-17T13:00', end: '2026-11-17T17:00' },
  ]);
  const d = daySummary(st, '2026-11-17');
  assert.equal(d.netMin, 600);
  assert.equal(d.overtimeMin, 120);
  assert.equal(d.shifts[0].overtime, 0);
  assert.equal(d.shifts[1].overtime, 120);
  assert.equal(d.pay, 100 + 2 * 10 * 0.25);
});

test('soglia 0 disattiva lo straordinario', () => {
  const st = stateWith([{ start: '2026-11-17T06:00', end: '2026-11-17T18:00' }], { overtimeAfterHours: 0 });
  assert.equal(daySummary(st, '2026-11-17').overtimeMin, 0);
});

test('festivo e notturno si sommano; il turno resta nel giorno di inizio', () => {
  // sabato 21 -> domenica 22: appartiene al sabato, quindi non festivo
  const st = stateWith([{ start: '2026-11-21T20:00', end: '2026-11-22T02:00' }]);
  const sat = daySummary(st, '2026-11-21');
  assert.equal(sat.netMin, 360);
  assert.equal(sat.nightMin, 240);
  assert.equal(sat.pay, 60 + 4 * 10 * 0.15);
  assert.equal(daySummary(st, '2026-11-22').netMin, 0);
  // Natale di giorno: +30%
  const xmas = stateWith([{ start: '2026-12-25T09:00', end: '2026-12-25T13:00' }]);
  assert.equal(daySummary(xmas, '2026-12-25').pay, 52);
});

test('la pausa riduce i minuti notturni in proporzione', () => {
  const st = stateWith([{ start: '2026-11-17T22:00', end: '2026-11-18T02:00', breakMin: 60 }]);
  const d = daySummary(st, '2026-11-17');
  assert.equal(d.netMin, 180);
  assert.equal(d.nightMin, 180);
});

test('la tariffa salvata nel turno non cambia con le impostazioni', () => {
  const st = stateWith([{ start: '2026-11-17T08:00', end: '2026-11-17T10:00' }]);
  st.settings.rate = 20;
  assert.equal(daySummary(st, '2026-11-17').pay, 20);
});

test('timbratura con pausa', () => {
  const st = store.emptyState();
  store.clockIn(st, at('2026-11-17T08:00:10'));
  assert.throws(() => store.clockIn(st, at('2026-11-17T08:01')));
  store.startPause(st, at('2026-11-17T12:00'));
  // a metà pausa il netto è fermo a 4 ore
  assert.equal(Math.round(daySummary(st, '2026-11-17', at('2026-11-17T12:20:10')).netMin), 240);
  store.endPause(st, at('2026-11-17T12:30'));
  store.startPause(st, at('2026-11-17T16:50'));
  const shift = store.clockOut(st, at('2026-11-17T17:00:10')); // uscita durante una pausa
  assert.equal(shift.breakMin, 40);
  assert.equal(shift.pauseStart, null);
  assert.equal(Math.round(daySummary(st, '2026-11-17').netMin), 500);
  assert.equal(store.openShift(st), null);
  assert.throws(() => store.clockOut(st));
});

test('validazione dei turni manuali', () => {
  const st = stateWith([{ start: '2026-11-17T08:00', end: '2026-11-17T12:00' }]);
  const bad = (x, msg) => assert.throws(() => store.saveShift(st, { rate: 10, ...x }), msg);
  bad({ start: '2026-11-17T12:00', end: '2026-11-17T11:00' }, /dopo/);
  bad({ start: '2026-11-17T11:00', end: '2026-11-17T13:00' }, /sovrappone/);
  bad({ start: '2026-11-18T08:00', end: '2026-11-18T09:00', breakMin: 60 }, /pausa/);
  bad({ start: '2026-11-18T08:00', end: '2026-11-19T09:00' }, /24 ore/);
  // turno adiacente ammesso; modifica dello stesso turno ammessa
  store.saveShift(st, { start: '2026-11-17T12:00', end: '2026-11-17T13:00', rate: 10 });
  store.saveShift(st, { id: st.shifts[0].id, start: '2026-11-17T07:00', end: '2026-11-17T12:00', rate: 10 });
  assert.equal(st.shifts.length, 2);
  assert.equal(st.shifts[0].start, '2026-11-17T07:00');
});

test('riepiloghi, assenze e saldi', () => {
  const st = stateWith([
    { start: '2026-11-16T08:00', end: '2026-11-16T16:00' },
    { start: '2026-11-17T08:00', end: '2026-11-17T12:00' },
    { start: '2026-12-01T08:00', end: '2026-12-01T12:00' },
  ], { monthlyTargetHours: 20, vacationDaysPerYear: 10 });
  store.saveAbsence(st, { date: '2026-11-18', type: 'ferie', hours: 8, paid: true });
  store.saveAbsence(st, { date: '2026-11-19', type: 'permesso', hours: 2 });
  store.saveAbsence(st, { date: '2026-11-20', type: 'malattia', hours: 8 });
  store.savePayment(st, { date: '2026-11-30', amount: 150 });

  const m = monthSummary(st, '2026-11');
  assert.equal(m.netMin, 720);
  assert.equal(m.daysWorked, 2);
  assert.equal(m.workPay, 120);
  assert.equal(m.absencePay, 80);
  assert.equal(m.pay, 200);
  assert.equal(m.hoursBalanceMin, 720 - 1200);
  assert.deepEqual(m.absences, { ferie: 1, permesso: 2, malattia: 1 });
  assert.equal(m.payments, 150);
  assert.equal(weekSummary(st, '2026-11-16').netMin, 720);
  assert.deepEqual(payBalance(st), { earned: 240, paid: 150, due: 90 });
  assert.deepEqual(vacationBalance(st, 2026), { allowance: 10, used: 1, left: 9 });
  assert.equal(monthSummary(stateWith(), '2026-11').hoursBalanceMin, null);
});

test('backup: andata e ritorno, file non validi rifiutati', () => {
  const st = stateWith([{ start: '2026-11-17T08:00', end: '2026-11-17T12:00', note: 'bar' }], { rate: 12.5 });
  store.clockIn(st, at('2026-11-18T08:00'));
  store.savePayment(st, { date: '2026-11-30', amount: 50 });
  const back = store.importBackup(store.exportBackup(st));
  assert.deepEqual(back, st);
  assert.throws(() => store.importBackup('ciao'), /leggibile/);
  assert.throws(() => store.importBackup('{"a":1}'), /non è un backup/);
  assert.throws(() => store.importBackup(JSON.stringify({ version: 99, shifts: [] })), /più recente/);
  assert.throws(() => store.importBackup(JSON.stringify({ shifts: [{ start: 'x' }] })), /non valido/);
  // un backup vecchio senza alcune impostazioni riceve i valori predefiniti
  const old = store.importBackup(JSON.stringify({ version: 1, settings: { rate: 9 }, shifts: [] }));
  assert.equal(old.settings.rate, 9);
  assert.equal(old.settings.overtimePct, 25);
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
