// Calcolo di ore, maggiorazioni, guadagni e saldi. Nessuna dipendenza dal DOM.
import { MIN, parseStamp, parseDay, dayOf, addDays, monthRange } from './time.js';
import { isFestive } from './holidays.js';

/** Minuti di [start, end) che cadono nella fascia notturna (es. 22:00-06:00). */
export function nightMinutes(start, end, nightStart = '22:00', nightEnd = '06:00') {
  if (nightStart === nightEnd || end <= start) return 0;
  const [sh, sm] = nightStart.split(':').map(Number);
  const [eh, em] = nightEnd.split(':').map(Number);
  const crosses = eh * 60 + em <= sh * 60 + sm;
  let total = 0;
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
  while (day < end) {
    const ws = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm);
    const we = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (crosses ? 1 : 0), eh, em);
    const overlap = Math.min(end, we) - Math.max(start, ws);
    if (overlap > 0) total += overlap;
    day.setDate(day.getDate() + 1);
  }
  return total / MIN;
}

/** Minuti di un turno e quanti cadono nella fascia notturna. */
export function shiftMinutes(shift, settings) {
  const start = parseStamp(shift.start);
  const end = parseStamp(shift.end);
  return {
    net: Math.max(0, (end - start) / MIN),
    night: nightMinutes(start, end, settings.nightStart, settings.nightEnd),
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Riepilogo di un giorno. Le maggiorazioni festiva e notturna si sommano
 * sulla tariffa base del turno.
 */
export function daySummary(state, day) {
  const s = state.settings;
  const shifts = state.shifts.filter((x) => dayOf(x.start) === day)
    .sort((a, b) => a.start.localeCompare(b.start));
  const festive = isFestive(day, s.sundayFestive);
  const out = {
    day, festive, netMin: 0, nightMin: 0, festiveMin: 0,
    workPay: 0, absencePay: 0, pay: 0, shifts: [], absences: [],
  };
  for (const shift of shifts) {
    const m = shiftMinutes(shift, s);
    const hourly = (shift.rate ?? s.rate) / 60;
    const pay = m.net * hourly
      + (festive ? m.net * hourly * (s.festivePct / 100) : 0)
      + m.night * hourly * (s.nightPct / 100);
    out.shifts.push({ shift, ...m, pay: round2(pay) });
    out.netMin += m.net;
    out.nightMin += m.night;
    if (festive) out.festiveMin += m.net;
    out.workPay += pay;
  }
  for (const a of state.absences.filter((x) => x.date === day)) {
    out.absences.push(a);
    if (a.paid) out.absencePay += a.hours * (a.rate ?? s.rate);
  }
  out.workPay = round2(out.workPay);
  out.absencePay = round2(out.absencePay);
  out.pay = round2(out.workPay + out.absencePay);
  return out;
}

/** Totali su un intervallo di giorni, estremi inclusi. */
export function rangeSummary(state, from, to) {
  const days = new Set();
  for (const x of state.shifts) { const d = dayOf(x.start); if (d >= from && d <= to) days.add(d); }
  for (const a of state.absences) if (a.date >= from && a.date <= to) days.add(a.date);
  const tot = {
    from, to, netMin: 0, nightMin: 0, festiveMin: 0, workPay: 0, absencePay: 0,
    pay: 0, daysWorked: 0, shiftCount: 0,
    absences: { ferie: 0, permesso: 0, malattia: 0 }, absenceHours: 0, days: [],
  };
  for (const day of [...days].sort()) {
    const d = daySummary(state, day);
    tot.days.push(d);
    tot.netMin += d.netMin; tot.nightMin += d.nightMin;
    tot.festiveMin += d.festiveMin; tot.workPay += d.workPay; tot.absencePay += d.absencePay;
    tot.shiftCount += d.shifts.length;
    if (d.shifts.length) tot.daysWorked += 1;
    for (const a of d.absences) {
      tot.absences[a.type] += a.type === 'permesso' ? a.hours : 1;
      tot.absenceHours += a.hours;
    }
  }
  tot.workPay = round2(tot.workPay);
  tot.absencePay = round2(tot.absencePay);
  tot.pay = round2(tot.workPay + tot.absencePay);
  return tot;
}

export function monthSummary(state, ym) {
  const { from, to } = monthRange(ym);
  const sum = rangeSummary(state, from, to);
  const target = state.settings.monthlyTargetHours * 60;
  sum.targetMin = target;
  sum.hoursBalanceMin = target > 0 ? sum.netMin - target : null;
  sum.payments = round2(state.payments.filter((p) => p.date >= from && p.date <= to)
    .reduce((t, p) => t + p.amount, 0));
  return sum;
}

export function weekSummary(state, monday) {
  return rangeSummary(state, monday, addDays(monday, 6));
}

/** Saldo paga complessivo: tutto il maturato meno tutti i pagamenti ricevuti. */
export function payBalance(state) {
  const earned = rangeSummary(state, '0000-01-01', '9999-12-31').pay;
  const paid = round2(state.payments.reduce((t, p) => t + p.amount, 0));
  return { earned, paid, due: round2(earned - paid) };
}

/** Ferie dell'anno: spettanti, godute, residue (in giorni). */
export function vacationBalance(state, year) {
  const used = state.absences.filter((a) => a.type === 'ferie' && a.date.startsWith(`${year}-`)).length;
  const allowance = state.settings.vacationDaysPerYear;
  return { allowance, used, left: allowance - used };
}

export const weekdayIndex = (key) => (parseDay(key).getDay() + 6) % 7; // lunedì = 0
