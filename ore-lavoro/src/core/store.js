// Stato dell'app: forma dei dati, operazioni, salvataggio e backup.
import { toStamp, parseStamp, MIN } from './time.js';

export const VERSION = 1;
export const STORAGE_KEY = 'ore-lavoro:v1';
export const ABSENCE_TYPES = ['ferie', 'permesso', 'malattia'];

export function defaultSettings() {
  return {
    rate: 10, currency: '€',
    overtimeAfterHours: 8, overtimePct: 25,
    festivePct: 30, sundayFestive: true,
    nightPct: 15, nightStart: '22:00', nightEnd: '06:00',
    monthlyTargetHours: 0, vacationDaysPerYear: 0, dayHours: 8,
    reminder: { enabled: false, time: '18:00', days: [1, 2, 3, 4, 5] },
    longShiftHours: 10,
  };
}

export function emptyState() {
  return { version: VERSION, settings: defaultSettings(), shifts: [], absences: [], payments: [] };
}

let counter = 0;
export function newId() {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min;

/**
 * Controlla e ripulisce dati letti da disco o da un file di backup.
 * Lancia un errore con messaggio leggibile se il file non è utilizzabile.
 */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.shifts)) {
    throw new Error('Il file non è un backup di Ore Lavoro.');
  }
  if (raw.version > VERSION) throw new Error('Backup creato da una versione più recente dell\'app.');
  const base = defaultSettings();
  const s = { ...base, ...(raw.settings || {}) };
  s.reminder = { ...base.reminder, ...((raw.settings || {}).reminder || {}) };
  for (const k of Object.keys(base)) if (typeof s[k] !== typeof base[k]) s[k] = base[k];

  const shifts = raw.shifts.map((x) => {
    if (!STAMP.test(x.start) || (x.end != null && !STAMP.test(x.end))) throw new Error('Turno con orario non valido.');
    if (x.end && x.end < x.start) throw new Error('Turno con fine precedente all\'inizio.');
    return {
      id: String(x.id || newId()), start: x.start, end: x.end || null,
      breakMin: num(x.breakMin) ? x.breakMin : 0,
      pauseStart: !x.end && STAMP.test(x.pauseStart || '') ? x.pauseStart : null,
      rate: num(x.rate) ? x.rate : s.rate, note: String(x.note || ''),
    };
  });
  if (shifts.filter((x) => !x.end).length > 1) throw new Error('Più di un turno aperto.');
  const absences = (raw.absences || []).map((a) => {
    if (!DAY.test(a.date) || !ABSENCE_TYPES.includes(a.type)) throw new Error('Assenza non valida.');
    return {
      id: String(a.id || newId()), date: a.date, type: a.type,
      hours: num(a.hours) ? a.hours : s.dayHours, paid: Boolean(a.paid),
      rate: num(a.rate) ? a.rate : s.rate, note: String(a.note || ''),
    };
  });
  const payments = (raw.payments || []).map((p) => {
    if (!DAY.test(p.date) || !num(p.amount)) throw new Error('Pagamento non valido.');
    return { id: String(p.id || newId()), date: p.date, amount: p.amount, note: String(p.note || '') };
  });
  return { version: VERSION, settings: s, shifts, absences, payments };
}

export function load(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    return text ? normalize(JSON.parse(text)) : emptyState();
  } catch {
    return emptyState();
  }
}

export function save(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportBackup(state, now = new Date()) {
  return JSON.stringify({ app: 'ore-lavoro', exportedAt: toStamp(now), ...state }, null, 2);
}

export function importBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('Il file non è leggibile.'); }
  return normalize(raw);
}

// ---- Timbratura -----------------------------------------------------------

export const openShift = (state) => state.shifts.find((x) => !x.end) || null;

export function clockIn(state, now = new Date()) {
  if (openShift(state)) throw new Error('C\'è già un turno in corso.');
  const shift = {
    id: newId(), start: toStamp(now), end: null, breakMin: 0, pauseStart: null,
    rate: state.settings.rate, note: '',
  };
  state.shifts.push(shift);
  return shift;
}

function closePause(shift, now) {
  if (!shift.pauseStart) return;
  shift.breakMin += Math.max(0, Math.round((now - parseStamp(shift.pauseStart)) / MIN));
  shift.pauseStart = null;
}

export function startPause(state, now = new Date()) {
  const shift = openShift(state);
  if (!shift || shift.pauseStart) throw new Error('Nessun turno attivo da mettere in pausa.');
  shift.pauseStart = toStamp(now);
  return shift;
}

export function endPause(state, now = new Date()) {
  const shift = openShift(state);
  if (!shift || !shift.pauseStart) throw new Error('Nessuna pausa in corso.');
  closePause(shift, now);
  return shift;
}

export function clockOut(state, now = new Date()) {
  const shift = openShift(state);
  if (!shift) throw new Error('Nessun turno in corso.');
  closePause(shift, now);
  shift.end = toStamp(now);
  return shift;
}

// ---- Inserimento e modifica manuale ---------------------------------------

/** Altri turni che si sovrappongono a [start, end). */
export function overlapping(state, start, end, ignoreId = null) {
  return state.shifts.filter((x) => x.id !== ignoreId && x.start < end && (x.end || '9999') > start);
}

export function saveShift(state, { id = null, start, end, breakMin = 0, rate, note = '' }) {
  if (!STAMP.test(start) || !STAMP.test(end)) throw new Error('Inserisci data e orari.');
  if (end <= start) throw new Error('La fine deve essere dopo l\'inizio.');
  const gross = (parseStamp(end) - parseStamp(start)) / MIN;
  if (gross > 24 * 60) throw new Error('Un turno non può durare più di 24 ore.');
  if (!num(breakMin) || breakMin >= gross) throw new Error('La pausa deve essere più corta del turno.');
  if (!num(rate)) throw new Error('Tariffa non valida.');
  if (overlapping(state, start, end, id).length) throw new Error('Si sovrappone a un altro turno.');
  const data = { start, end, breakMin, pauseStart: null, rate, note: note.trim() };
  const existing = id && state.shifts.find((x) => x.id === id);
  if (existing) return Object.assign(existing, data);
  const shift = { id: newId(), ...data };
  state.shifts.push(shift);
  return shift;
}

export function saveAbsence(state, { id = null, date, type, hours, paid = false, note = '' }) {
  if (!DAY.test(date)) throw new Error('Inserisci la data.');
  if (!ABSENCE_TYPES.includes(type)) throw new Error('Tipo di assenza non valido.');
  if (!num(hours) || hours <= 0 || hours > 24) throw new Error('Ore non valide.');
  const data = { date, type, hours, paid: Boolean(paid), note: note.trim() };
  const existing = id && state.absences.find((x) => x.id === id);
  if (existing) return Object.assign(existing, data);
  const absence = { id: newId(), rate: state.settings.rate, ...data };
  state.absences.push(absence);
  return absence;
}

export function savePayment(state, { id = null, date, amount, note = '' }) {
  if (!DAY.test(date)) throw new Error('Inserisci la data.');
  if (!num(amount) || amount <= 0) throw new Error('Importo non valido.');
  const data = { date, amount, note: note.trim() };
  const existing = id && state.payments.find((x) => x.id === id);
  if (existing) return Object.assign(existing, data);
  const payment = { id: newId(), ...data };
  state.payments.push(payment);
  return payment;
}

export function remove(state, kind, id) {
  state[kind] = state[kind].filter((x) => x.id !== id);
}

/** Corregge il turno in corso (es. timbratura dimenticata). */
export function updateOpenShift(state, { start, breakMin = 0, note = '' }, now = new Date()) {
  const shift = openShift(state);
  if (!shift) throw new Error('Nessun turno in corso.');
  if (!STAMP.test(start)) throw new Error('Inserisci data e ora di inizio.');
  if (parseStamp(start) > now) throw new Error('L\'inizio non può essere nel futuro.');
  if (!num(breakMin)) throw new Error('Pausa non valida.');
  if (overlapping(state, start, toStamp(now), shift.id).length) throw new Error('Si sovrappone a un altro turno.');
  return Object.assign(shift, { start, breakMin, note: note.trim() });
}
