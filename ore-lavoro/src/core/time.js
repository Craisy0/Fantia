// Utilità su date e durate. Tutte le date sono in ora locale del telefono.
// Formati: giorno "YYYY-MM-DD", istante "YYYY-MM-DDTHH:MM[:SS]".

const pad = (n) => String(n).padStart(2, '0');

export const MIN = 60000;

export function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toStamp(d) {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "YYYY-MM-DD" -> Date a mezzanotte locale (new Date("YYYY-MM-DD") sarebbe UTC). */
export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function parseStamp(s) {
  const [day, time = '00:00'] = s.split('T');
  const [h, mi, se = 0] = time.split(':').map(Number);
  const d = parseDay(day);
  d.setHours(h, mi, se, 0);
  return d;
}

export const dayOf = (stamp) => stamp.slice(0, 10);
export const timeOf = (stamp) => stamp.slice(11, 16);

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Lunedì della settimana che contiene il giorno. */
export function weekStart(key) {
  const d = parseDay(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}

export const monthKey = (key) => key.slice(0, 7);

export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { from: `${ym}-01`, to: dateKey(new Date(y, m, 0)) };
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Minuti -> "8h 05m". */
export function fmtDuration(min) {
  const sign = min < 0 ? '-' : '';
  const m = Math.round(Math.abs(min));
  return `${sign}${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

/** Millisecondi -> "08:05:09" per il cronometro. */
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function fmtMoney(n, currency = '€') {
  const v = Math.round(n * 100) / 100;
  return `${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
  'settembre', 'ottobre', 'novembre', 'dicembre'];

export function fmtDay(key, { short = false } = {}) {
  const d = parseDay(key);
  const g = GIORNI[d.getDay()];
  const m = MESI[d.getMonth()];
  return short ? `${g.slice(0, 3)} ${d.getDate()} ${m.slice(0, 3)}` : `${g} ${d.getDate()} ${m}`;
}

export function fmtMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MESI[m - 1]} ${y}`;
}
