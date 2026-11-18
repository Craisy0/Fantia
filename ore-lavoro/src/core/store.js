// Stato dell'app: forma dei dati, operazioni, salvataggio e backup.
import { parseStamp, toStamp, MIN } from './time.js';

export const VERSION = 1;
export const STORAGE_KEY = 'ore-lavoro:v1';

export function defaultSettings() {
  return {
    rate: 10, currency: '€',
    monthlyTargetHours: 0,
    reminder: { enabled: false, time: '18:00', days: [1, 2, 3, 4, 5] },
  };
}

export function emptyState() {
  return { version: VERSION, settings: defaultSettings(), shifts: [], payments: [] };
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
  const given = raw.settings || {};
  const s = {};
  for (const k of Object.keys(base)) s[k] = typeof given[k] === typeof base[k] ? given[k] : base[k];
  s.reminder = { ...base.reminder, ...(given.reminder || {}) };

  // I turni "in corso" delle versioni precedenti (senza fine) vengono scartati; assenze e
  // impostazioni che non esistono più vengono ignorate.
  const shifts = raw.shifts.filter((x) => x.end).map((x) => {
    if (!STAMP.test(x.start) || !STAMP.test(x.end)) throw new Error('Turno con orario non valido.');
    if (x.end < x.start) throw new Error('Turno con fine precedente all\'inizio.');
    return { id: String(x.id || newId()), start: x.start, end: x.end, rate: num(x.rate) ? x.rate : s.rate, note: String(x.note || '') };
  });
  const payments = (raw.payments || []).map((p) => {
    if (!DAY.test(p.date) || !num(p.amount)) throw new Error('Pagamento non valido.');
    return { id: String(p.id || newId()), date: p.date, amount: p.amount, note: String(p.note || '') };
  });
  return { version: VERSION, settings: s, shifts, payments };
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

// ---- Inserimento e modifica manuale ---------------------------------------

/** Altri turni che si sovrappongono a [start, end). */
export function overlapping(state, start, end, ignoreId = null) {
  return state.shifts.filter((x) => x.id !== ignoreId && x.start < end && x.end > start);
}

/**
 * Salva un turno. Un turno nuovo prende la tariffa delle impostazioni di adesso;
 * uno già esistente conserva la sua, così cambiare tariffa non riscrive il passato.
 */
export function saveShift(state, { id = null, start, end, note = '' }) {
  if (!STAMP.test(start) || !STAMP.test(end)) throw new Error('Inserisci data e orari.');
  if (end <= start) throw new Error('La fine deve essere dopo l\'inizio.');
  if ((parseStamp(end) - parseStamp(start)) / MIN > 24 * 60) throw new Error('Un turno non può durare più di 24 ore.');
  if (overlapping(state, start, end, id).length) throw new Error('Si sovrappone a un altro turno.');
  const existing = id && state.shifts.find((x) => x.id === id);
  if (existing) return Object.assign(existing, { start, end, note: note.trim() });
  const shift = { id: newId(), start, end, rate: state.settings.rate, note: note.trim() };
  state.shifts.push(shift);
  return shift;
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

