// Calcolo di ore, guadagni e saldi. Nessuna dipendenza dal DOM.
import { MIN, parseStamp, parseDay, dayOf, addDays, monthRange } from './time.js';
import { isFestive } from './holidays.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** Minuti di un turno. */
export const shiftMinutes = (shift) => Math.max(0, (parseStamp(shift.end) - parseStamp(shift.start)) / MIN);

/** Riepilogo di un giorno: ore per tariffa oraria del turno. */
export function daySummary(state, day) {
  const shifts = state.shifts.filter((x) => dayOf(x.start) === day)
    .sort((a, b) => a.start.localeCompare(b.start));
  const out = { day, festive: isFestive(day), netMin: 0, pay: 0, shifts: [] };
  for (const shift of shifts) {
    const net = shiftMinutes(shift);
    const pay = round2((net / 60) * shift.rate);
    out.shifts.push({ shift, net, pay });
    out.netMin += net;
    out.pay += pay;
  }
  out.pay = round2(out.pay);
  return out;
}

/** Totali su un intervallo di giorni, estremi inclusi. */
export function rangeSummary(state, from, to) {
  const days = new Set();
  for (const x of state.shifts) { const d = dayOf(x.start); if (d >= from && d <= to) days.add(d); }
  const tot = { from, to, netMin: 0, pay: 0, daysWorked: 0, shiftCount: 0, days: [] };
  for (const day of [...days].sort()) {
    const d = daySummary(state, day);
    tot.days.push(d);
    tot.netMin += d.netMin;
    tot.pay += d.pay;
    tot.shiftCount += d.shifts.length;
    tot.daysWorked += 1;
  }
  tot.pay = round2(tot.pay);
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

export const weekdayIndex = (key) => (parseDay(key).getDay() + 6) % 7; // lunedì = 0
