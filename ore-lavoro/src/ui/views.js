// Le quattro schermate. Ogni funzione restituisce HTML a partire dallo stato.
import {
  dateKey, dayOf, timeOf, addDays, weekStart, monthKey, monthRange, parseDay,
  fmtDuration, fmtMoney, fmtDay, fmtMonth,
} from '../core/time.js';
import { holidayName } from '../core/holidays.js';
import {
  daySummary, weekSummary, monthSummary, rangeSummary, payBalance, weekdayIndex,
} from '../core/calc.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// ---- Pezzi condivisi -------------------------------------------------------

function shiftRow(item, currency) {
  const { shift } = item;
  const nextDay = dayOf(shift.end) !== dayOf(shift.start) ? ' <small>+1</small>' : '';
  const tags = [
    shift.note ? esc(shift.note) : '',
  ].filter(Boolean).join(' · ');
  return `<button class="row" data-action="edit-shift" data-id="${shift.id}">
    <span class="row-main"><b>${timeOf(shift.start)} – ${timeOf(shift.end)}${nextDay}</b>${tags ? `<small>${tags}</small>` : ''}</span>
    <span class="row-side"><b>${fmtDuration(item.net)}</b><small>${fmtMoney(item.pay, currency)}</small></span>
  </button>`;
}

function dayList(d, currency, emptyText) {
  const rows = d.shifts.map((x) => shiftRow(x, currency));
  return rows.length ? rows.join('') : `<p class="empty">${emptyText}</p>`;
}

function addButtons(day) {
  return `<div class="btn-row">
    <button class="btn ghost" data-action="add-shift" data-day="${day}">+ Turno</button>
  </div>`;
}

const stat = (label, value, cls = '') => `<div class="stat ${cls}"><small>${label}</small><b>${value}</b></div>`;

function monthNav(ym) {
  return `<header class="month-nav">
    <button class="icon" data-action="month" data-step="-1" aria-label="Mese precedente">‹</button>
    <h1>${fmtMonth(ym)}</h1>
    <button class="icon" data-action="month" data-step="1" aria-label="Mese successivo">›</button>
  </header>`;
}

// ---- Oggi ------------------------------------------------------------------

export function todayView(state, now) {
  const cur = state.settings.currency;
  const today = dateKey(now);
  const d = daySummary(state, today);
  const monday = weekStart(today);
  const week = weekSummary(state, monday);
  const month = monthSummary(state, monthKey(today));
  const festa = holidayName(today);

  const punch = `<section class="punch">
    <p class="status">${d.shifts.length ? 'Ore di oggi' : 'Nessun turno registrato oggi'}</p>
    <p class="clock ${d.netMin >= 1 ? '' : 'idle'}">${fmtDuration(d.netMin)}</p>
    <p class="earning">${fmtMoney(d.pay, cur)}</p>
    <button class="btn primary big" data-action="add-shift" data-day="${today}">+ Aggiungi turno</button>
  </section>`;

  const max = Math.max(60, ...Array.from({ length: 7 }, (_, i) => daySummary(state, addDays(monday, i)).netMin));
  const bars = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const min = daySummary(state, day).netMin;
    const label = 'LMMGVSD'[i];
    return `<div class="bar ${day === today ? 'today' : ''}">
      <small>${min >= 1 ? (min / 60).toFixed(1).replace('.', ',').replace(',0', '') : ''}</small>
      <i style="height:${Math.round((min / max) * 100)}%"></i><span>${label}</span>
    </div>`;
  }).join('');

  return `<header class="title">
      <h1>${fmtDay(today)}</h1>${festa ? `<span class="chip festive">${festa}</span>` : ''}
    </header>
    ${punch}
    <section class="card">
      <h2>Oggi</h2>
      ${dayList(d, cur, 'Nessun turno registrato oggi.')}
      ${addButtons(today)}
    </section>
    <section class="card">
      <h2>Questa settimana <span>${fmtDuration(week.netMin)} · ${fmtMoney(week.pay, cur)}</span></h2>
      <div class="bars">${bars}</div>
    </section>
    <section class="card">
      <h2>${cap(fmtMonth(monthKey(today)))}</h2>
      <div class="stats">
        ${stat('Ore', fmtDuration(month.netMin))}
        ${stat('Guadagno', fmtMoney(month.pay, cur))}
      </div>
    </section>`;
}

// ---- Calendario ------------------------------------------------------------

export function calendarView(state, ui, now) {
  const cur = state.settings.currency;
  const ym = ui.month;
  const { from, to } = monthRange(ym);
  const today = dateKey(now);
  const cells = [];
  for (let i = 0; i < weekdayIndex(from); i += 1) cells.push('<span class="cell blank"></span>');
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const d = daySummary(state, day);
    const cls = [
      'cell', day === today ? 'today' : '', day === ui.day ? 'selected' : '',
      d.festive ? 'festive' : '', d.netMin >= 1 ? 'worked' : '',
    ].join(' ');
    const hours = d.netMin >= 1 ? (d.netMin / 60).toFixed(1).replace('.0', '').replace('.', ',') : '';
    cells.push(`<button class="${cls}" data-action="pick-day" data-day="${day}">
      <b>${parseDay(day).getDate()}</b><small>${hours}</small>
    </button>`);
  }
  const d = daySummary(state, ui.day);
  const festa = holidayName(ui.day);
  return `${monthNav(ym)}
    <section class="card calendar">
      <div class="weekdays">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}</div>
      <div class="grid">${cells.join('')}</div>
    </section>
    <section class="card">
      <h2>${cap(fmtDay(ui.day))} <span>${fmtDuration(d.netMin)} · ${fmtMoney(d.pay, cur)}</span></h2>
      ${festa ? `<p><span class="chip festive">${festa}</span></p>` : ''}
      ${dayList(d, cur, 'Nessuna registrazione in questo giorno.')}
      ${addButtons(ui.day)}
    </section>`;
}

// ---- Riepilogo -------------------------------------------------------------

export function summaryView(state, ui, now) {
  const s = state.settings;
  const cur = s.currency;
  const ym = ui.month;
  const year = ym.slice(0, 4);
  const m = monthSummary(state, ym);
  const y = rangeSummary(state, `${year}-01-01`, `${year}-12-31`);
  const bal = payBalance(state);
  const { from, to } = monthRange(ym);
  const payments = state.payments.filter((p) => p.date >= from && p.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date));

  const hoursBalance = m.hoursBalanceMin === null
    ? '<p class="hint">Imposta un obiettivo di ore mensili nelle impostazioni per vedere il saldo ore.</p>'
    : `<div class="stats">
        ${stat('Obiettivo', fmtDuration(m.targetMin))}
        ${stat('Saldo ore', `${m.hoursBalanceMin > 0 ? '+' : ''}${fmtDuration(m.hoursBalanceMin)}`, m.hoursBalanceMin < 0 ? 'neg' : 'pos')}
      </div>
      <div class="progress"><i style="width:${Math.min(100, Math.round((m.netMin / m.targetMin) * 100))}%"></i></div>`;

  const paymentRows = payments.length ? payments.map((p) => `<button class="row" data-action="edit-payment" data-id="${p.id}">
      <span class="row-main"><b>${fmtDay(p.date, { short: true })}</b>${p.note ? `<small>${esc(p.note)}</small>` : ''}</span>
      <span class="row-side"><b>${fmtMoney(p.amount, cur)}</b></span>
    </button>`).join('') : '<p class="empty">Nessun pagamento registrato in questo mese.</p>';

  return `${monthNav(ym)}
    <section class="card">
      <h2>Ore e guadagni</h2>
      <div class="stats">
        ${stat('Ore lavorate', fmtDuration(m.netMin), 'wide')}
        ${stat('Guadagno', fmtMoney(m.pay, cur), 'wide')}
        ${stat('Giorni lavorati', m.daysWorked)}
        ${stat('Media al giorno', m.daysWorked ? fmtDuration(m.netMin / m.daysWorked) : '–')}
      </div>
    </section>
    <section class="card">
      <h2>Saldo ore</h2>
      ${hoursBalance}
    </section>
    <section class="card">
      <h2>Saldo paga</h2>
      <div class="stats">
        ${stat('Da incassare', fmtMoney(bal.due, cur), `wide ${bal.due < 0 ? 'neg' : ''}`)}
        ${stat('Maturato in totale', fmtMoney(bal.earned, cur))}
        ${stat('Ricevuto in totale', fmtMoney(bal.paid, cur))}
      </div>
      <h3>Pagamenti del mese <span>${fmtMoney(m.payments, cur)}</span></h3>
      ${paymentRows}
      <div class="btn-row"><button class="btn ghost" data-action="add-payment">+ Pagamento ricevuto</button></div>
    </section>
    <section class="card">
      <h2>Anno ${year}</h2>
      <div class="stats">
        ${stat('Ore lavorate', fmtDuration(y.netMin))}
        ${stat('Guadagno', fmtMoney(y.pay, cur))}
      </div>
    </section>`;
}

// ---- Impostazioni ----------------------------------------------------------

export function settingsView(state, native) {
  const s = state.settings;
  const numField = (key, label, unit, step = '1') => `<label class="field">
    <span>${label}</span>
    <span class="input-unit"><input type="number" inputmode="decimal" min="0" step="${step}" data-setting="${key}" value="${s[key]}"><em>${unit}</em></span>
  </label>`;
  const days = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
  const dayChips = [1, 2, 3, 4, 5, 6, 0].map((i) => `<button class="chip toggle ${s.reminder.days.includes(i) ? 'on' : ''}"
    data-action="reminder-day" data-day="${i}">${days[i]}</button>`).join('');

  return `<header class="title"><h1>Impostazioni</h1></header>
    <section class="card">
      <h2>Paga</h2>
      ${numField('rate', 'Tariffa oraria', `${s.currency}/h`, '0.01')}
      <p class="hint">La nuova tariffa vale per i turni che registri da ora in poi. Quelli già registrati mantengono la loro.</p>
    </section>
    <section class="card">
      <h2>Obiettivo</h2>
      ${numField('monthlyTargetHours', 'Obiettivo ore mensili', 'h')}
    </section>
    <section class="card">
      <h2>Promemoria</h2>
      <label class="field"><span>Ricordami di registrare le ore</span>
        <input type="checkbox" class="switch" data-setting="reminder.enabled" ${s.reminder.enabled ? 'checked' : ''}></label>
      <label class="field"><span>Orario</span>
        <input type="time" data-setting="reminder.time" value="${s.reminder.time}"></label>
      <div class="field"><span>Giorni</span><span class="chips">${dayChips}</span></div>
      ${native ? '' : '<p class="hint">Le notifiche funzionano solo nell\'app installata sul telefono.</p>'}
    </section>
    <section class="card">
      <h2>Backup</h2>
      <p class="hint">I dati sono salvati solo su questo telefono. Esporta un backup ogni tanto e conservalo altrove (Drive, email): serve se cambi o perdi il telefono.</p>
      <div class="btn-row">
        <button class="btn ghost" data-action="export">Esporta backup</button>
        <button class="btn ghost" data-action="import">Ripristina da file</button>
      </div>
      <p class="hint">${state.shifts.length} turni · ${state.payments.length} pagamenti</p>
      <div class="btn-row"><button class="btn danger-ghost" data-action="wipe">Cancella tutti i dati</button></div>
    </section>
    <p class="version">Ore Lavoro 1.0.0</p>`;
}
