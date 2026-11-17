// Festività nazionali italiane.
import { dateKey, parseDay } from './time.js';

/** Domenica di Pasqua (algoritmo gregoriano anonimo). */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const FISSE = {
  '01-01': 'Capodanno', '01-06': 'Epifania', '04-25': 'Liberazione', '05-01': 'Festa del lavoro',
  '06-02': 'Festa della Repubblica', '08-15': 'Ferragosto', '11-01': 'Ognissanti',
  '12-08': 'Immacolata', '12-25': 'Natale', '12-26': 'Santo Stefano',
};

/** Nome della festività, oppure null. */
export function holidayName(key) {
  const year = Number(key.slice(0, 4));
  const md = key.slice(5);
  if (FISSE[md]) return FISSE[md];
  // San Francesco: festa nazionale dal 2026 (L. 151/2025).
  if (md === '10-04' && year >= 2026) return 'San Francesco';
  const e = easter(year);
  if (key === dateKey(e)) return 'Pasqua';
  e.setDate(e.getDate() + 1);
  if (key === dateKey(e)) return 'Lunedì dell\'Angelo';
  return null;
}

export const isSunday = (key) => parseDay(key).getDay() === 0;

export function isFestive(key, sundayFestive = true) {
  return holidayName(key) !== null || (sundayFestive && isSunday(key));
}
