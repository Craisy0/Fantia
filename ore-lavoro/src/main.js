// Avvio dell'app: stato, navigazione, azioni e moduli di inserimento.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import * as store from './core/store.js';
import { dateKey, dayOf, timeOf, addDays, addMonths, monthKey } from './core/time.js';
import { todayView, calendarView, summaryView, settingsView, liveClock, esc, ABSENCE_LABEL } from './ui/views.js';
import { syncReminders, askPermission } from './platform/notifications.js';
import { exportFile } from './platform/files.js';

const native = Capacitor.isNativePlatform();
const $ = (sel) => document.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');

let state = store.load(localStorage);
const today = dateKey(new Date());
const ui = { tab: 'oggi', month: monthKey(today), day: today };

const TABS = [
  ['oggi', 'Oggi', '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>'],
  ['calendario', 'Calendario', '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  ['riepilogo', 'Riepilogo', '<path d="M5 20V10M12 20V4M19 20v-7"/>'],
  ['impostazioni', 'Impostazioni', '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'],
];

// ---- Disegno ---------------------------------------------------------------

function render() {
  const now = new Date();
  view.innerHTML = {
    oggi: () => todayView(state, now),
    calendario: () => calendarView(state, ui, now),
    riepilogo: () => summaryView(state, ui, now),
    impostazioni: () => settingsView(state, native),
  }[ui.tab]();
  $('#tabs').innerHTML = TABS.map(([id, label, icon]) => `<button class="${id === ui.tab ? 'on' : ''}" data-action="tab" data-tab="${id}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>${label}
  </button>`).join('');
}

let lastMinute = -1;
function tick() {
  if (ui.tab !== 'oggi' || sheet.open) return;
  const now = new Date();
  // Una volta al minuto si ridisegna tutto: totali del giorno e cambio data.
  if (now.getMinutes() !== lastMinute) { lastMinute = now.getMinutes(); render(); return; }
  const live = liveClock(state, now);
  if (!live) return;
  for (const [id, text] of [['live-clock', live.clock], ['live-pay', live.pay], ['live-pause', live.pause]]) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

/** Salva, riallinea i promemoria e ridisegna. */
function commit({ redraw = true } = {}) {
  store.save(localStorage, state);
  syncReminders(state);
  if (redraw) render();
}

/** Esegue un'operazione sui dati mostrando l'eventuale errore all'utente. */
function attempt(fn) {
  try { fn(); return true; } catch (err) { toast(err.message); return false; }
}

// ---- Moduli ----------------------------------------------------------------

const numberOf = (v) => (v === '' ? NaN : Number(String(v).replace(',', '.')));

function openSheet(title, body, { kind, id = '' }) {
  sheet.innerHTML = `<form method="dialog" data-kind="${kind}" data-id="${id}">
    <h2>${title}</h2>
    ${body}
    <p class="error" hidden></p>
    <div class="btn-row">
      ${id ? '<button type="button" class="btn danger-ghost" data-action="delete">Elimina</button>' : ''}
      <button type="button" class="btn ghost" data-action="close-sheet">Annulla</button>
      <button type="submit" class="btn primary">Salva</button>
    </div>
  </form>`;
  sheet.showModal();
}

const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;

function shiftSheet(shift, day) {
  const s = state.settings;
  const open = shift && !shift.end;
  const d = shift ? dayOf(shift.start) : day;
  const body = `
    ${field('Giorno', `<input name="day" type="date" required value="${d}">`)}
    ${field('Inizio', `<input name="start" type="time" required value="${shift ? timeOf(shift.start) : ''}">`)}
    ${open ? '' : field('Fine', `<input name="end" type="time" required value="${shift ? timeOf(shift.end) : ''}">`)}
    ${field('Pausa (minuti)', `<input name="break" type="number" inputmode="numeric" min="0" step="1" value="${shift ? shift.breakMin : 0}">`)}
    ${open ? '' : field(`Tariffa (${s.currency}/h)`, `<input name="rate" type="number" inputmode="decimal" min="0" step="0.01" value="${shift ? shift.rate : s.rate}">`)}
    ${field('Nota', `<input name="note" type="text" maxlength="80" value="${shift ? esc(shift.note) : ''}" placeholder="facoltativa">`)}
    ${open ? '' : '<p class="hint">Se la fine è prima dell\'inizio, il turno termina il giorno dopo.</p>'}`;
  openSheet(open ? 'Turno in corso' : shift ? 'Modifica turno' : 'Nuovo turno', body, { kind: 'shifts', id: shift?.id });
}

function absenceSheet(absence, day) {
  const s = state.settings;
  const type = absence?.type ?? 'ferie';
  const options = store.ABSENCE_TYPES.map((t) => `<option value="${t}" ${t === type ? 'selected' : ''}>${ABSENCE_LABEL[t]}</option>`).join('');
  const body = `
    ${field('Giorno', `<input name="day" type="date" required value="${absence?.date ?? day}">`)}
    ${field('Tipo', `<select name="type">${options}</select>`)}
    ${field('Ore', `<input name="hours" type="number" inputmode="decimal" min="0.5" max="24" step="0.5" value="${absence?.hours ?? s.dayHours}">`)}
    ${field('Retribuita', `<input name="paid" type="checkbox" class="switch" ${absence?.paid ? 'checked' : ''}>`)}
    ${field('Nota', `<input name="note" type="text" maxlength="80" value="${absence ? esc(absence.note) : ''}" placeholder="facoltativa">`)}`;
  openSheet(absence ? 'Modifica assenza' : 'Nuova assenza', body, { kind: 'absences', id: absence?.id });
}

function paymentSheet(payment) {
  const body = `
    ${field('Data', `<input name="day" type="date" required value="${payment?.date ?? dateKey(new Date())}">`)}
    ${field(`Importo (${state.settings.currency})`, `<input name="amount" type="number" inputmode="decimal" min="0" step="0.01" required value="${payment?.amount ?? ''}">`)}
    ${field('Nota', `<input name="note" type="text" maxlength="80" value="${payment ? esc(payment.note) : ''}" placeholder="facoltativa">`)}`;
  openSheet(payment ? 'Modifica pagamento' : 'Pagamento ricevuto', body, { kind: 'payments', id: payment?.id });
}

function submitSheet(form) {
  const f = Object.fromEntries(new FormData(form));
  const id = form.dataset.id || null;
  const kind = form.dataset.kind;
  if (kind === 'shifts') {
    const start = `${f.day}T${f.start}`;
    const existing = id && state.shifts.find((x) => x.id === id);
    if (existing && !existing.end) {
      store.updateOpenShift(state, { start, breakMin: numberOf(f.break || '0'), note: f.note });
    } else {
      const endDay = f.end <= f.start ? addDays(f.day, 1) : f.day;
      store.saveShift(state, {
        id, start, end: `${endDay}T${f.end}`, breakMin: numberOf(f.break || '0'), rate: numberOf(f.rate), note: f.note,
      });
    }
    ui.day = f.day;
  } else if (kind === 'absences') {
    store.saveAbsence(state, { id, date: f.day, type: f.type, hours: numberOf(f.hours), paid: f.paid === 'on', note: f.note });
    ui.day = f.day;
  } else {
    store.savePayment(state, { id, date: f.day, amount: numberOf(f.amount), note: f.note });
  }
  if (ui.tab === 'calendario') ui.month = monthKey(ui.day);
}

sheet.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    submitSheet(e.target);
    sheet.close();
    commit();
  } catch (err) {
    const box = sheet.querySelector('.error');
    box.textContent = err.message;
    box.hidden = false;
  }
});

// ---- Azioni ----------------------------------------------------------------

const actions = {
  tab: (el) => { ui.tab = el.dataset.tab; render(); view.scrollTop = 0; window.scrollTo(0, 0); },
  'clock-in': () => attempt(() => store.clockIn(state)) && commit(),
  'clock-out': () => attempt(() => store.clockOut(state)) && commit(),
  'pause-start': () => attempt(() => store.startPause(state)) && commit(),
  'pause-end': () => attempt(() => store.endPause(state)) && commit(),
  month: (el) => {
    ui.month = addMonths(ui.month, Number(el.dataset.step));
    ui.day = ui.month === monthKey(dateKey(new Date())) ? dateKey(new Date()) : `${ui.month}-01`;
    render();
  },
  'pick-day': (el) => { ui.day = el.dataset.day; render(); },
  'add-shift': (el) => shiftSheet(null, el.dataset.day),
  'edit-shift': (el) => shiftSheet(state.shifts.find((x) => x.id === el.dataset.id)),
  'add-absence': (el) => absenceSheet(null, el.dataset.day),
  'edit-absence': (el) => absenceSheet(state.absences.find((x) => x.id === el.dataset.id)),
  'add-payment': () => paymentSheet(null),
  'edit-payment': (el) => paymentSheet(state.payments.find((x) => x.id === el.dataset.id)),
  'close-sheet': () => sheet.close(),
  delete: (el) => {
    const form = el.closest('form');
    if (!confirm('Eliminare questa registrazione?')) return;
    store.remove(state, form.dataset.kind, form.dataset.id);
    sheet.close();
    commit();
  },
  'reminder-day': (el) => {
    const day = Number(el.dataset.day);
    const days = state.settings.reminder.days;
    state.settings.reminder.days = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    commit();
  },
  export: async () => {
    try {
      await exportFile(`ore-lavoro-${dateKey(new Date())}.json`, store.exportBackup(state));
    } catch (err) { toast(`Esportazione non riuscita: ${err.message}`); }
  },
  import: () => $('#file').click(),
  wipe: () => {
    if (!confirm('Cancellare TUTTI i dati dell\'app? L\'operazione non si può annullare.')) return;
    if (!confirm('Confermi? Turni, assenze, pagamenti e impostazioni verranno eliminati.')) return;
    state = store.emptyState();
    commit();
    toast('Dati cancellati.');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

// Impostazioni: ogni campo si salva appena modificato.
view.addEventListener('change', async (e) => {
  const key = e.target.dataset.setting;
  if (!key) return;
  const el = e.target;
  let value;
  if (el.type === 'checkbox') value = el.checked;
  else if (el.type === 'number') {
    value = numberOf(el.value);
    if (!Number.isFinite(value) || value < 0) { toast('Valore non valido.'); render(); return; }
  } else {
    value = el.value;
    if (!value) { render(); return; }
  }
  if (key === 'reminder.enabled' && value && native && !(await askPermission())) {
    toast('Permesso notifiche negato: attivalo dalle impostazioni di Android.');
    value = false;
  }
  if (key.startsWith('reminder.')) state.settings.reminder[key.slice(9)] = value;
  else state.settings[key] = value;
  commit({ redraw: el.type === 'checkbox' });
});

$('#file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const next = store.importBackup(await file.text());
    const msg = `Il backup contiene ${next.shifts.length} turni, ${next.absences.length} assenze e ${next.payments.length} pagamenti.\n\nSostituire i dati attuali?`;
    if (!confirm(msg)) return;
    state = next;
    commit();
    toast('Backup ripristinato.');
  } catch (err) { toast(err.message); }
});

// ---- Ciclo di vita ---------------------------------------------------------

setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheet.open) render(); });

if (native) {
  App.addListener('backButton', () => {
    if (sheet.open) sheet.close();
    else if (ui.tab !== 'oggi') actions.tab({ dataset: { tab: 'oggi' } });
    else App.minimizeApp();
  });
}

render();
syncReminders(state);
