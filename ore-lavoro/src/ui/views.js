// Le quattro schermate. Ogni funzione restituisce HTML a partire dallo stato.
import {
  dateKey, dayOf, timeOf, addDays, weekStart, monthKey, monthRange, parseDay,
  fmtDuration, fmtMoney, fmtDay, fmtMonth,
} from '../core/time.js';
import { holidayName } from '../core/holidays.js';
import {
  daySummary, weekSummary, monthSummary, rangeSummary, payBalance, weekdayIndex,
} from '../core/calc.js';
import { icon } from './icons.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
/** "1 turno", "2 turni". */
export const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const hoursShort = (min) => (min / 60).toFixed(1).replace('.0', '').replace('.', ',');

// ---- Icone e pezzi condivisi -----------------------------------------------

const CHEVRON_L = icon('chevron-left');
const CHEVRON_R = icon('chevron-right');

/** Stato vuoto: un invito a fare qualcosa, non solo "niente qui". */
function empty(title, hint) {
  return `<div class="empty-state">
    <span class="ic big hours">${icon('clock', 28)}</span>
    <b>${title}</b>
    <small>${hint}</small>
  </div>`;
}

/** Ore e guadagno affiancati, senza puntini di mezzo. */
const sum = (min, money) => `<span class="sum"><b>${fmtDuration(min)}</b><em>${money}</em></span>`;

function shiftRow(item, currency) {
  const { shift } = item;
  const nextDay = dayOf(shift.end) !== dayOf(shift.start) ? ' <small>+1</small>' : '';
  return `<button class="row" data-action="edit-shift" data-id="${shift.id}">
    <span class="row-main"><b>${timeOf(shift.start)} – ${timeOf(shift.end)}${nextDay}</b>${shift.note ? `<small>${esc(shift.note)}</small>` : ''}</span>
    <span class="row-side"><b>${fmtDuration(item.net)}</b><small>${fmtMoney(item.pay, currency)}</small></span>
  </button>`;
}

function dayList(d, currency, emptyTitle, emptyHint) {
  const rows = d.shifts.map((x) => shiftRow(x, currency));
  return rows.length ? rows.join('') : empty(emptyTitle, emptyHint);
}

function addButtons(day) {
  return `<div class="btn-row">
    <button class="btn ghost" data-action="add-shift" data-day="${day}">+ Turno</button>
  </div>`;
}

/** Intensità del riempimento nel calendario: 1 (poche ore) … 4 (giornata lunga). */
const level = (min) => (min <= 120 ? 1 : min <= 300 ? 2 : min <= 480 ? 3 : 4);

const ic = (name, tone) => `<span class="ic ${tone}">${icon(name, 22)}</span>`;
const stat = (label, value, cls = '', glyph = '') => `<div class="stat ${cls}">${glyph}<div><small>${label}</small><b>${value}</b></div></div>`;
const pair = (label, value, cls = '', glyph = '') => `<div class="pair ${cls}">${glyph}<div><small>${label}</small><b>${value}</b></div></div>`;

function monthNav(ym) {
  return `<header class="month-nav">
    <button class="icon" data-action="month" data-step="-1" aria-label="Mese precedente">${CHEVRON_L}</button>
    <h1>${fmtMonth(ym)}</h1>
    <button class="icon" data-action="month" data-step="1" aria-label="Mese successivo">${CHEVRON_R}</button>
  </header>`;
}

/**
 * Quadrante: tacche dei minuti e delle ore e un anello che si riempie fino a 8 ore.
 * L'arco usa pathLength=100, quindi la lunghezza è direttamente la percentuale.
 */
const GOAL_MIN = 8 * 60;
function dialSvg(min) {
  const pct = Math.min(100, Math.round((min / GOAL_MIN) * 1000) / 10);
  return `<svg viewBox="0 0 240 240" aria-hidden="true" fill="none">
    <g transform="rotate(-90 120 120)">
      <circle class="tick-m" cx="120" cy="120" r="108" stroke-width="7" pathLength="60" stroke-dasharray="0.14 0.86" stroke-dashoffset="0.07"/>
      <circle class="tick-h" cx="120" cy="120" r="105.5" stroke-width="12" pathLength="12" stroke-dasharray="0.06 0.94" stroke-dashoffset="0.03"/>
      <circle class="arc-track" cx="120" cy="120" r="87" stroke-width="12"/>
      <circle class="arc sweep" cx="120" cy="120" r="87" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="${pct} 100"/>
    </g>
  </svg>`;
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

  const punch = `<section class="hero">
    <div class="dial" role="img" aria-label="${fmtDuration(d.netMin)} su 8 ore">
      ${dialSvg(d.netMin)}
      <div class="dial-c"><small>Ore di oggi</small><b class="${fmtDuration(d.netMin).length > 6 ? 'long' : ''}">${fmtDuration(d.netMin)}</b><span>${fmtMoney(d.pay, cur)}</span></div>
    </div>
    <button class="btn light big" data-action="add-shift" data-day="${today}">+ Aggiungi turno</button>
  </section>`;

  const max = Math.max(60, ...Array.from({ length: 7 }, (_, i) => daySummary(state, addDays(monday, i)).netMin));
  const bars = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const min = daySummary(state, day).netMin;
    return `<div class="bar ${day === today ? 'today' : ''}">
      <small>${min >= 1 ? hoursShort(min) : ''}</small>
      <div class="track"><i style="height:${Math.round((min / max) * 100)}%"></i></div><span>${'LMMGVSD'[i]}</span>
    </div>`;
  }).join('');

  return `<header class="title">
      <h1>${fmtDay(today)}</h1>${festa ? `<span class="chip festive">${festa}</span>` : ''}
    </header>
    ${punch}
    <section class="card">
      <h2>Turni di oggi</h2>
      ${dayList(d, cur, 'Nessun turno oggi', 'Tocca «Aggiungi turno» per registrare le ore.')}
    </section>
    <section class="card">
      <h2>Questa settimana ${sum(week.netMin, fmtMoney(week.pay, cur))}</h2>
      <div class="bars" role="img" aria-label="Ore lavorate in ogni giorno della settimana">${bars}</div>
    </section>
    <section class="card">
      <h2>${cap(fmtMonth(monthKey(today)))}</h2>
      <div class="stats">
        ${stat('Ore', fmtDuration(month.netMin), '', ic('clock', 'hours'))}
        ${stat('Guadagno', fmtMoney(month.pay, cur), '', ic('euro', 'money'))}
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
      d.festive ? 'festive' : '', d.netMin >= 1 ? `worked lv${level(d.netMin)}` : '',
    ].join(' ');
    cells.push(`<button class="${cls}" data-action="pick-day" data-day="${day}">
      <b>${parseDay(day).getDate()}</b><small>${d.netMin >= 1 ? hoursShort(d.netMin) : ''}</small>
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
      <h2>${cap(fmtDay(ui.day))} ${d.shifts.length ? sum(d.netMin, fmtMoney(d.pay, cur)) : ''}</h2>
      ${festa ? `<p><span class="chip festive">${festa}</span></p>` : ''}
      ${dayList(d, cur, 'Nessun turno in questo giorno', 'Usa «+ Turno» per aggiungerne uno.')}
      ${addButtons(ui.day)}
    </section>`;
}

// ---- Riepilogo -------------------------------------------------------------

/**
 * Ore di ogni giorno del mese. Un solo colore e una sola scala; la linea tratteggiata
 * segna le 8 ore. Toccando una colonna si legge il giorno (al posto dell'hover).
 */
/** Riga di lettura del grafico: giorno scelto, ore e guadagno. */
/** Testo letto dagli screen reader per il giorno scelto nel grafico. */
export function chartText(state, day) {
  const d = daySummary(state, day);
  return `${fmtDay(day, { short: true })}: ${fmtDuration(d.netMin)}, ${fmtMoney(d.pay, state.settings.currency)}`;
}

export function readoutHtml(state, day) {
  const d = daySummary(state, day);
  return `<span>${cap(fmtDay(day, { short: true }))}</span> ${sum(d.netMin, fmtMoney(d.pay, state.settings.currency))}`;
}

function monthChart(state, ym, sel) {
  const { from, to } = monthRange(ym);
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(daySummary(state, day));
  const maxMin = Math.max(480, ...days.map((x) => x.netMin));
  const cols = days.map((x) => `<div class="mcol ${x.day === sel ? 'sel' : ''}" data-day="${x.day}">
    <i class="${x.netMin >= 1 ? '' : 'none'}" style="height:${x.netMin >= 1 ? Math.max(3, Math.round((x.netMin / maxMin) * 100)) : 0}%"></i></div>`).join('');
  const ticks = [1, 8, 15, 22, 29].filter((n) => n <= days.length)
    .map((n) => `<span style="grid-column:${n}">${n}</span>`).join('');
  return `<div class="mchart-wrap">
      <div class="mchart" style="--n:${days.length}" role="slider" tabindex="0" aria-label="Ore di ogni giorno del mese"
        aria-valuemin="1" aria-valuemax="${days.length}" aria-valuenow="${days.findIndex((x) => x.day === sel) + 1}" aria-valuetext="${chartText(state, sel)}">
        <span class="mgrid" style="bottom:${(480 / maxMin) * 100}%"><em>8 h</em></span>${cols}
      </div>
      <div class="mticks" style="--n:${days.length}" aria-hidden="true">${ticks}</div>
    </div>
    <p class="readout" id="readout">${readoutHtml(state, sel)}</p>`;
}

/** Anello dell'obiettivo mensile. */
function ring(pct) {
  return `<div class="ringwrap" role="img" aria-label="${pct}% dell'obiettivo mensile">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="ring-track" cx="50" cy="50" r="42" pathLength="100"/>
      <circle class="ring-fill sweep" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="${Math.min(100, pct)} 100" transform="rotate(-90 50 50)"/>
    </svg><b>${pct}%</b></div>`;
}

export function summaryView(state, ui, now) {
  const s = state.settings;
  const cur = s.currency;
  const ym = ui.month;
  const year = ym.slice(0, 4);
  const m = monthSummary(state, ym);
  const y = rangeSummary(state, `${year}-01-01`, `${year}-12-31`);
  const bal = payBalance(state);
  const { from, to } = monthRange(ym);
  const today = dateKey(now);
  const payments = state.payments.filter((p) => p.date >= from && p.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date));
  const best = m.days.reduce((a, b) => (b.netMin > (a?.netMin ?? 0) ? b : a), null);
  const sel = ui.chartDay && ui.chartDay.startsWith(ym) ? ui.chartDay
    : (today.startsWith(ym) ? today : (best ? best.day : `${ym}-01`));

  const hoursBalance = m.hoursBalanceMin === null
    ? empty('Nessun obiettivo impostato', 'Inserisci le ore mensili in Impostazioni per vedere il saldo.')
    : `<div class="ring-row">
        ${ring(Math.round((m.netMin / m.targetMin) * 100))}
        <div class="pairs">
          ${pair('Obiettivo', fmtDuration(m.targetMin))}
          ${pair('Saldo ore', `${m.hoursBalanceMin > 0 ? '+' : ''}${fmtDuration(m.hoursBalanceMin)}`, m.hoursBalanceMin < 0 ? 'neg' : 'pos')}
        </div>
      </div>`;

  const paymentRows = payments.length ? payments.map((p) => `<button class="row" data-action="edit-payment" data-id="${p.id}">
      <span class="row-main"><b>${cap(fmtDay(p.date, { short: true }))}</b>${p.note ? `<small>${esc(p.note)}</small>` : ''}</span>
      <span class="row-side"><b>${fmtMoney(p.amount, cur)}</b></span>
    </button>`).join('') : empty('Nessun pagamento questo mese', 'Registra quanto hai ricevuto per calcolare il saldo.');

  return `${monthNav(ym)}
    <section class="hero compact">
      <svg class="hero-ring" viewBox="0 0 240 240" aria-hidden="true" fill="none">
        <g transform="rotate(-90 120 120)">
          <circle class="tick-m" cx="120" cy="120" r="108" stroke-width="7" pathLength="60" stroke-dasharray="0.14 0.86" stroke-dashoffset="0.07"/>
          <circle class="tick-h" cx="120" cy="120" r="105.5" stroke-width="12" pathLength="12" stroke-dasharray="0.06 0.94" stroke-dashoffset="0.03"/>
        </g>
      </svg>
      <p class="status">Guadagno del mese</p>
      <p class="clock">${fmtMoney(m.pay, cur)}</p>
      <p class="earning">${fmtDuration(m.netMin)} lavorate</p>
    </section>
    <section class="card">
      <h2>Ore al giorno</h2>
      ${monthChart(state, ym, sel)}
      <div class="pairs row-2">
        ${pair('Giorni lavorati', m.daysWorked, '', ic('calendar-check', 'hours'))}
        ${pair('Media al giorno', m.daysWorked ? fmtDuration(m.netMin / m.daysWorked) : '–', '', ic('gauge', 'hours'))}
      </div>
    </section>
    <section class="card">
      <h2>Saldo ore</h2>
      ${hoursBalance}
    </section>
    <section class="card">
      <h2>Saldo paga</h2>
      ${pair('Da incassare', fmtMoney(bal.due, cur), `big ${bal.due < 0 ? 'neg' : ''}`, ic('wallet', 'money'))}
      <div class="pairs row-2">
        ${pair('Maturato in totale', fmtMoney(bal.earned, cur), '', ic('trending-up', 'money'))}
        ${pair('Ricevuto in totale', fmtMoney(bal.paid, cur), '', ic('banknote', 'money'))}
      </div>
      <h3>Pagamenti del mese <span>${fmtMoney(m.payments, cur)}</span></h3>
      ${paymentRows}
      <div class="btn-row"><button class="btn ghost" data-action="add-payment">+ Pagamento ricevuto</button></div>
    </section>
    <section class="card">
      <h2>Anno ${year} ${sum(y.netMin, fmtMoney(y.pay, cur))}</h2>
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
      <div class="field stack"><span>Giorni</span><span class="chips">${dayChips}</span></div>
      ${native ? '' : '<p class="hint">Le notifiche funzionano solo nell\'app installata sul telefono.</p>'}
    </section>
    <section class="card">
      <h2>Backup</h2>
      <p class="hint">I dati sono salvati solo su questo telefono. Esporta un backup ogni tanto e conservalo altrove (Drive, email): serve se cambi o perdi il telefono.</p>
      <div class="btn-row">
        <button class="btn ghost" data-action="export">Esporta backup</button>
        <button class="btn ghost" data-action="import">Ripristina da file</button>
      </div>
      <p class="hint">Salvati: ${count(state.shifts.length, 'turno', 'turni')} e ${count(state.payments.length, 'pagamento', 'pagamenti')}.</p>
      <div class="btn-row"><button class="btn danger-ghost" data-action="wipe">Cancella tutti i dati</button></div>
    </section>
    <p class="version">Ore Lavoro 1.0.0</p>`;
}
