/* Asta Mantra — frontend, vanilla JS, nessuna dipendenza esterna */

const ROLE_ORDER = ['Por','Dc','B','Ds','Dd','E','M','C','W','T','A','Pc'];
const REPARTO = { Por:'POR', Dc:'DIF', B:'DIF', Ds:'DIF', Dd:'DIF', E:'DIF', M:'CEN', C:'CEN', W:'CEN', T:'CEN', A:'ATT', Pc:'ATT' };
const REPARTO_LABEL = { POR:'Portieri', DIF:'Difensori', CEN:'Centrocampisti', ATT:'Attaccanti' };
const TIER_ORDER = ['Top','Semi-Top','Terza','Quarta','Titolare "Scarso"','Outsider','Scomm.', null];
const TIER_CLASS = {
  'Top':'tier-top', 'Semi-Top':'tier-semitop', 'Terza':'tier-terza', 'Quarta':'tier-quarta',
  'Titolare "Scarso"':'tier-scarso', 'Outsider':'tier-outsider', 'Scomm.':'tier-scomm',
};

let PLAYERS = [];
let STATE = null;
let MIA = null;             // {squadra, obiettivi, formazione, note_giocatore} - personale, non condiviso
let MIA_IDENTITA = localStorage.getItem('mantra_identita') || null;
let CONFIG = null;
let SUMMARY = null;
let CONSIGLI = null;
let ACTIVE_TAB = 'players';
let FILTERS = { reparto: null, ruolo: null, stato: null, tier: '' };
let SORT_BY = 'prezzo_stimato';
let POPUP_PINNED_ID = null;
let INCASTRO_SHOWN_FOR = null;
let LAST_LOG_TS = null;

const $ = (sel, root=document) => root.querySelector(sel);
const $all = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function withSquadra(url) {
  if (!MIA_IDENTITA) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}squadra=${encodeURIComponent(MIA_IDENTITA)}`;
}

async function api(path, opts) {
  let url = path;
  let finalOpts = opts;
  if (opts && opts.method === 'POST') {
    try {
      const bodyObj = opts.body ? JSON.parse(opts.body) : {};
      if (MIA_IDENTITA && bodyObj.squadra === undefined) bodyObj.squadra = MIA_IDENTITA;
      finalOpts = Object.assign({}, opts, { body: JSON.stringify(bodyObj) });
    } catch (e) { /* body non JSON, lascio stare */ }
  } else {
    url = withSquadra(path);
  }
  const res = await fetch(url, finalOpts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.data = data;
    throw err;
  }
  return data;
}

function toast(msg, type='') {
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function refreshAll() {
  const [players, stateResp, summary, consigli] = await Promise.all([
    api('/api/players'), api('/api/state'), api('/api/summary'), api('/api/consigli'),
  ]);
  PLAYERS = players;
  STATE = stateResp.state;
  MIA = stateResp.mia;
  CONFIG = stateResp.config;
  SUMMARY = summary;
  CONSIGLI = consigli;
  renderIdentityBadge();
  renderHeader();
  renderLastMove();
  renderActiveTab();
  if (POPUP_PINNED_ID) refreshPopupContent();
}

/* ---------------- Identita' (multi-utente) ---------------- */
function renderIdentityBadge() {
  const el = $('#identityBadge');
  if (el) el.textContent = `👤 ${MIA_IDENTITA}`;
}

async function ensureIdentity() {
  if (MIA_IDENTITA) return;
  // stato "anonimo" solo per leggere l'elenco squadre condiviso, prima di scegliere chi sono
  const resp = await api('/api/state');
  const utentiApp = resp.config && resp.config.lega && resp.config.lega.utenti_app;
  const scelte = (utentiApp && utentiApp.length) ? utentiApp : resp.state.squadre;
  await openIdentityPicker(scelte);
}

function openIdentityPicker(squadre) {
  return new Promise(resolve => {
    const overlay = $('#identityOverlay');
    const list = $('#identityList');
    list.innerHTML = squadre.map(s => `<button data-pick-identity="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');
    overlay.classList.add('open');

    function scegli(nome) {
      nome = nome.trim();
      if (!nome) return;
      MIA_IDENTITA = nome;
      localStorage.setItem('mantra_identita', nome);
      overlay.classList.remove('open');
      list.removeEventListener('click', onListClick);
      newBtn.removeEventListener('click', onNewClick);
      resolve();
    }
    function onListClick(e) {
      const btn = e.target.closest('[data-pick-identity]');
      if (btn) scegli(btn.dataset.pickIdentity);
    }
    const input = $('#identityNewInput');
    const newBtn = $('#identityNewBtn');
    function onNewClick() { scegli(input.value); }
    list.addEventListener('click', onListClick);
    newBtn.addEventListener('click', onNewClick);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') scegli(input.value); });
  });
}

function setupIdentityBadge() {
  $('#identityBadge').addEventListener('click', async () => {
    localStorage.removeItem('mantra_identita');
    MIA_IDENTITA = null;
    await ensureIdentity();
    await refreshAll();
  });
}

/* ---------------- Header / budget ---------------- */
function renderHeader() {
  const s = SUMMARY;
  const el = $('#budgetStats');
  const pctSpeso = s.budget_totale ? Math.round(100 * s.speso / s.budget_totale) : 0;
  el.innerHTML = `
    <div class="stat"><span class="label">Budget</span><span class="value">${s.budget_totale}</span></div>
    <div class="stat"><span class="label">Speso</span><span class="value ${pctSpeso > 90 ? 'warn' : ''}">${s.speso}</span></div>
    <div class="stat"><span class="label">Rimanente</span><span class="value good">${s.rimanente}</span></div>
    <div class="stat"><span class="label">Slot</span><span class="value">${s.giocatori_presi}/${s.slot_totali}</span></div>
    <div class="stat"><span class="label">Media/slot</span><span class="value">${s.budget_medio_per_slot_rimanente}</span></div>
  `;
}

function renderLastMove() {
  const el = $('#lastMove');
  if (!el) return;
  const picks = (STATE.log || []).filter(e => e.azione === 'pick');
  if (!picks.length) {
    el.innerHTML = `<span class="tag">Live</span> <span class="small-muted">Nessuna assegnazione ancora — l'asta non è iniziata</span>`;
    return;
  }
  const last = picks[picks.length - 1];
  const isNew = LAST_LOG_TS !== null && last.ts > LAST_LOG_TS;
  LAST_LOG_TS = last.ts;
  const mine = last.squadra === MIA_IDENTITA;
  el.innerHTML = `<span class="tag">Ultimo</span> <b>${escapeHtml(last.nome)}</b> → ${mine ? '<b style="color:var(--success)">te (' + escapeHtml(last.squadra) + ')</b>' : escapeHtml(last.squadra)} per <b>${last.prezzo}cr</b> <span class="small-muted">(${picks.length} assegnati finora)</span>`;
  if (isNew) {
    el.classList.remove('flash');
    void el.offsetWidth; // riavvia l'animazione anche se la classe era gia' presente
    el.classList.add('flash');
  }
}

/* ---------------- Tabs ---------------- */
function setupTabs() {
  $all('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      ACTIVE_TAB = btn.dataset.tab;
      $all('nav.tabs button').forEach(b => b.classList.toggle('active', b === btn));
      applySidebarVisibility();
      renderActiveTab();
    });
  });
  applySidebarVisibility();
}

function applySidebarVisibility() {
  const showSidebar = ACTIVE_TAB === 'players';
  $('#sidebar').style.display = showSidebar ? '' : 'none';
  document.querySelector('main').classList.toggle('no-sidebar', !showSidebar);
}

function renderActiveTab() {
  const content = $('#content');
  let html;
  if (ACTIVE_TAB === 'players') html = renderPlayersTab();
  else if (ACTIVE_TAB === 'roster') html = renderRosterTab();
  else if (ACTIVE_TAB === 'teams') html = renderTeamsTab();
  else if (ACTIVE_TAB === 'log') html = renderLogTab();
  else if (ACTIVE_TAB === 'settings') html = renderSettingsTab();
  content.innerHTML = `<div class="content-inner">${html}</div>`;
  bindDynamicHandlers();
}

/* ---------------- Sidebar filters ---------------- */
function setupSidebar() {
  const repartoEl = $('#filterReparto');
  repartoEl.innerHTML = ['Tutti','POR','DIF','CEN','ATT'].map(r =>
    `<div class="chip ${(!FILTERS.reparto && r==='Tutti') || FILTERS.reparto===r ? 'active':''}" data-reparto="${r}">${r}</div>`).join('');
  repartoEl.addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    FILTERS.reparto = chip.dataset.reparto === 'Tutti' ? null : chip.dataset.reparto;
    FILTERS.ruolo = null;
    setupSidebar(); renderActiveTab();
  });

  const ruoli = FILTERS.reparto ? ROLE_ORDER.filter(r => REPARTO[r] === FILTERS.reparto) : ROLE_ORDER;
  const ruoloEl = $('#filterRuolo');
  ruoloEl.innerHTML = ['Tutti', ...ruoli].map(r =>
    `<div class="chip ${(!FILTERS.ruolo && r==='Tutti') || FILTERS.ruolo===r ? 'active':''}" data-ruolo="${r}">${r}</div>`).join('');
  ruoloEl.addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    FILTERS.ruolo = chip.dataset.ruolo === 'Tutti' ? null : chip.dataset.ruolo;
    setupSidebar(); renderActiveTab();
  });

  const statoEl = $('#filterStato');
  const statoOpts = [['Tutti',null],['Disponibili','disponibili'],['Presi','presi'],['Miei','miei'],['Obiettivi','obiettivi']];
  statoEl.innerHTML = statoOpts.map(([label,val]) =>
    `<div class="chip ${FILTERS.stato===val ? 'active':''}" data-stato="${val ?? ''}">${label}</div>`).join('');
  statoEl.addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    FILTERS.stato = chip.dataset.stato || null;
    setupSidebar(); renderActiveTab();
  });

  const tierEl = $('#filterTier');
  tierEl.innerHTML = ['<option value="">Tutte le fasce</option>', ...TIER_ORDER.filter(Boolean).map(t => `<option value="${t}">${t}</option>`)].join('');
  tierEl.value = FILTERS.tier || '';
  tierEl.onchange = () => { FILTERS.tier = tierEl.value; renderActiveTab(); };

  $('#sortBy').value = SORT_BY;
  $('#sortBy').onchange = e => { SORT_BY = e.target.value; renderActiveTab(); };

  $('#resetFiltersBtn').onclick = () => {
    FILTERS = { reparto: null, ruolo: null, stato: null, tier: '' };
    SORT_BY = 'prezzo_stimato';
    setupSidebar(); renderActiveTab();
  };
}

function applyFilters(list) {
  let out = list;
  if (FILTERS.reparto) out = out.filter(p => p.reparti.includes(FILTERS.reparto));
  if (FILTERS.ruolo) out = out.filter(p => p.ruoli.includes(FILTERS.ruolo));
  if (FILTERS.tier) out = out.filter(p => p.tier_carmy === FILTERS.tier);
  if (FILTERS.stato === 'disponibili') out = out.filter(p => !p.preso);
  else if (FILTERS.stato === 'presi') out = out.filter(p => p.preso);
  else if (FILTERS.stato === 'miei') out = out.filter(p => p.preso && p.squadra_acquirente === MIA_IDENTITA);
  else if (FILTERS.stato === 'obiettivi') out = out.filter(p => !!p.obiettivo);
  out = out.slice().sort((a, b) => {
    if (SORT_BY === 'nome') return a.nome.localeCompare(b.nome);
    const av = a[SORT_BY] ?? -1, bv = b[SORT_BY] ?? -1;
    return bv - av;
  });
  return out;
}

/* ---------------- Players tab ---------------- */
function renderPlayersTab() {
  const list = applyFilters(PLAYERS);
  const rows = list.map(playerRow).join('');
  return `
    <div class="small-muted" style="margin-bottom:8px">${list.length} giocatori (di ${PLAYERS.length} totali)</div>
    <table class="players">
      <thead><tr>
        <th style="width:210px">Giocatore</th>
        <th>Ruoli</th>
        <th>Fascia</th>
        <th>Profilo</th>
        <th>Prezzo</th>
        <th>FMV</th>
        <th>Stato</th>
        <th style="width:190px">Azioni</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="empty-state">Nessun giocatore corrisponde ai filtri</td></tr>`}</tbody>
    </table>
  `;
}

function roleBadges(ruoli) {
  const colors = { POR:'var(--por)', DIF:'var(--dif)', CEN:'var(--cen)', ATT:'var(--att)' };
  return `<div class="role-badges">${ruoli.map(r =>
    `<span class="role-badge" style="background:${colors[REPARTO[r]]}">${r}</span>`).join('')}</div>`;
}

function tierPill(tier) {
  if (!tier) return `<span class="small-muted">—</span>`;
  const cls = TIER_CLASS[tier] || 'tier-none';
  return `<span class="tier-pill" style="background:var(--${cls})">${tier}</span>`;
}

function profiloTags(archetipi) {
  if (!archetipi || !archetipi.length) return '';
  const seen = new Set();
  return archetipi.filter(a => a.profilo && !seen.has(a.profilo) && seen.add(a.profilo))
    .map(a => `<span class="profilo-tag">${a.profilo.slice(0,4)}</span>`).join('');
}

function playerRow(p) {
  const takenClass = p.preso ? (p.squadra_acquirente === MIA_IDENTITA ? 'taken mine' : 'taken') : '';
  const statusHtml = p.preso
    ? (p.squadra_acquirente === MIA_IDENTITA
        ? `<span class="badge-mine">MIA · ${p.prezzo_pagato}cr</span>`
        : `<span class="badge-taken">${escapeHtml(p.squadra_acquirente)} · ${p.prezzo_pagato}cr</span>`)
    : `<span class="badge-free">Libero</span>`;

  const actions = p.preso
    ? `<button class="btn small danger" data-action="undo" data-id="${p.id}">Annulla</button>`
    : `<div class="inline-assign">
        <select data-role="team-select">${STATE.squadre.map(s => `<option ${s===MIA_IDENTITA?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select>
        <input type="number" min="1" placeholder="cr" data-role="price-input" value="${p.prezzo_stimato || ''}" />
        <button class="btn small primary" data-action="pick" data-id="${p.id}">Assegna</button>
      </div>`;

  return `<tr class="${takenClass}">
    <td class="name-cell">
      <button class="star-btn ${p.obiettivo ? 'active' : ''}" data-action="star" data-id="${p.id}" title="Obiettivo">${p.obiettivo ? '★' : '☆'}</button>
      <span class="nome nome-link" data-popup="${p.id}">${escapeHtml(p.nome)}</span>
      <span class="team">${escapeHtml(p.team || '')}</span>
    </td>
    <td>${roleBadges(p.ruoli)}</td>
    <td>${tierPill(p.tier_carmy)}</td>
    <td>${profiloTags(p.archetipi)}</td>
    <td>${p.prezzo_stimato ?? '—'}</td>
    <td>${p.fmv ? p.fmv.toFixed(2) : '—'}</td>
    <td class="status-cell">${statusHtml}</td>
    <td>${actions}</td>
  </tr>`;
}

function bindDynamicHandlers() {
  $all('[data-action="pick"]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.id;
    const row = btn.closest('tr');
    const team = row.querySelector('[data-role="team-select"]').value;
    const price = row.querySelector('[data-role="price-input"]').value;
    if (!price) { toast('Inserisci un prezzo', 'error'); return; }
    try {
      const res = await api('/api/pick', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id, team, price }) });
      toast(`${res.giocatore.nome} assegnato a ${team} per ${price}`, 'success');
      await refreshAll();
    } catch (e) { toast(e.message, 'error'); }
  }));

  $all('[data-action="undo"]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api('/api/undo', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: btn.dataset.id }) });
      toast('Assegnazione annullata');
      await refreshAll();
    } catch (e) { toast(e.message, 'error'); }
  }));

  $all('[data-action="star"]').forEach(btn => btn.addEventListener('click', async () => {
    const active = btn.classList.contains('active');
    try {
      await api('/api/target', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: btn.dataset.id, azione: active ? 'remove' : 'set', priorita: 2 }) });
      await refreshAll();
    } catch (e) { toast(e.message, 'error'); }
  }));

  $all('[data-action="undo-last"]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      const res = await api('/api/undo-last', { method: 'POST' });
      toast(`Annullato: ${res.annullato.nome}`);
      await refreshAll();
    } catch (e) { toast(e.message, 'error'); }
  }));

  $all('[data-action="save-teams"]').forEach(btn => btn.addEventListener('click', saveTeamNames));
  $all('[data-action="save-config"]').forEach(btn => btn.addEventListener('click', saveConfig));
  $all('[data-action="add-team-row"]').forEach(btn => btn.addEventListener('click', () => {
    $('#teamNamesList').insertAdjacentHTML('beforeend', teamNameRowHtml('', false));
  }));
  const changeBtn = $('#changeIdentityBtn');
  if (changeBtn) changeBtn.addEventListener('click', async () => {
    localStorage.removeItem('mantra_identita');
    MIA_IDENTITA = null;
    await ensureIdentity();
    await refreshAll();
  });

  bindFormationHandlers();
}

/* ---------------- Formazione ---------------- */
function bindFormationHandlers() {
  const moduloSel = $('#moduloSelect');
  if (moduloSel) moduloSel.addEventListener('change', async () => {
    try {
      // le chiavi degli slot dipendono dal modulo (linea/posizione): cambiare modulo senza
      // azzerarle rischierebbe di lasciare un giocatore in uno slot con un ruolo richiesto diverso
      await api('/api/formazione', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ modulo: moduloSel.value, slot: {} }) });
      await refreshAll();
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function setSlot(slotKey, playerId) {
  const current = Object.assign({}, (MIA.formazione && MIA.formazione.slot) || {});
  if (playerId) current[slotKey] = playerId; else delete current[slotKey];
  try {
    await api('/api/formazione', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ slot: current }) });
    closeSlotPicker();
    await refreshAll();
  } catch (e) { toast(e.message, 'error'); }
}

function closeSlotPicker() {
  $('#slotPicker').classList.remove('open');
}

function openSlotPicker(slotEl) {
  const key = slotEl.dataset.slotKey;
  const ruoliSlot = slotEl.dataset.ruoli.split(',');
  const slotMap = (MIA.formazione && MIA.formazione.slot) || {};
  const current = slotMap[key];
  const mine = PLAYERS.filter(p => p.preso && p.squadra_acquirente === MIA_IDENTITA);
  const usedGlobal = new Set(Object.values(slotMap).filter(Boolean));
  const pool = mine.filter(p => p.ruoli.some(r => ruoliSlot.includes(r)) && (!usedGlobal.has(p.id) || p.id === current));

  const picker = $('#slotPicker');
  picker.innerHTML = `
    <div class="small-muted" style="padding:8px 12px;border-bottom:1px solid var(--border)">Ruolo: ${ruoliSlot.join(' o ')}</div>
    ${current ? `<div class="option remove" data-clear-slot="${key}">✕ Svuota slot</div>` : ''}
    ${pool.map(p => `<div class="option ${p.id === current ? 'current' : ''}" data-set-slot="${key}" data-player="${p.id}">
        <span>${escapeHtml(p.nome)}</span><span class="small-muted">${p.ruoli.join('/')} · ${p.prezzo_pagato}cr</span>
      </div>`).join('') || '<div class="option small-muted">Nessun giocatore di questo ruolo in rosa</div>'}
  `;
  picker.classList.add('open');
  positionFloating(picker, slotEl);
}

function positionFloating(panel, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const w = panel.offsetWidth || 250;
  let left = Math.min(rect.left, window.innerWidth - w - 10);
  left = Math.max(10, left);
  panel.style.left = left + 'px';
  panel.style.top = (rect.bottom + 6) + 'px';
  requestAnimationFrame(() => {
    const pr = panel.getBoundingClientRect();
    if (pr.bottom > window.innerHeight - 10) panel.style.top = Math.max(10, rect.top - pr.height - 6) + 'px';
  });
}

function setupSlotPicker() {
  document.addEventListener('click', e => {
    const opt = e.target.closest('#slotPicker .option');
    if (opt) {
      if (opt.dataset.clearSlot) setSlot(opt.dataset.clearSlot, null);
      else if (opt.dataset.setSlot) setSlot(opt.dataset.setSlot, opt.dataset.player);
      return;
    }
    const slotEl = e.target.closest('.pitch-slot');
    if (slotEl) { openSlotPicker(slotEl); return; }
    if (!e.target.closest('#slotPicker')) closeSlotPicker();
  });
}

/* ---------------- Roster tab ---------------- */
function renderRosterTab() {
  const mine = PLAYERS.filter(p => p.preso && p.squadra_acquirente === MIA_IDENTITA);
  const byReparto = { POR: [], DIF: [], CEN: [], ATT: [] };
  mine.forEach(p => { const rep = REPARTO[p.ruoli[0]] || 'CEN'; byReparto[rep].push(p); });

  const cards = ['POR','DIF','CEN','ATT'].map(rep => {
    const target = SUMMARY.target_per_reparto_slot[rep] || 0;
    const speso = SUMMARY.per_reparto_mio[rep].speso;
    const n = SUMMARY.per_reparto_mio[rep].n;
    const pct = target ? Math.min(100, Math.round(100 * n / target)) : 0;
    const color = { POR:'var(--por)', DIF:'var(--dif)', CEN:'var(--cen)', ATT:'var(--att)' }[rep];
    const list = byReparto[rep].map(p => `<li><span class="nome-link" data-popup="${p.id}">${escapeHtml(p.nome)}</span><span class="p">${p.prezzo_pagato}cr</span></li>`).join('')
      || '<li class="small-muted">Nessun giocatore ancora</li>';
    return `<div class="dept-card">
      <h4>${REPARTO_LABEL[rep]} <span class="small-muted">${n}/${target}</span></h4>
      <div class="progress-bar"><div style="width:${pct}%;background:${color}"></div></div>
      <div class="meta">Speso: ${speso}cr · target ${SUMMARY.target_pct[rep]}% budget</div>
      <ul class="roster-list">${list}</ul>
    </div>`;
  }).join('');

  const targets = PLAYERS.filter(p => p.obiettivo && !p.preso)
    .sort((a,b) => (a.obiettivo.priorita||9) - (b.obiettivo.priorita||9));
  const targetsHtml = targets.length ? `<table class="players"><thead><tr><th>Giocatore</th><th>Ruoli</th><th>Fascia</th><th>Prezzo</th><th>Nota</th></tr></thead><tbody>
    ${targets.map(p => `<tr><td class="name-cell"><span class="nome nome-link" data-popup="${p.id}">${escapeHtml(p.nome)}</span></td><td>${roleBadges(p.ruoli)}</td><td>${tierPill(p.tier_carmy)}</td><td>${p.prezzo_stimato ?? '—'}</td><td class="small-muted">${escapeHtml(p.obiettivo.nota||'')}</td></tr>`).join('')}
  </tbody></table>` : `<div class="empty-state">Nessun obiettivo segnato ancora — clicca la stella ★ sui giocatori che ti interessano</div>`;

  return `
    <h3 style="margin-top:0">Rosa — ${escapeHtml(MIA_IDENTITA)}</h3>
    <div class="roster-grid">${cards}</div>

    <h3>Suddivisione budget</h3>
    ${renderBudgetChart()}

    <h3>Formazione</h3>
    ${renderFormationSection()}

    <h3>Consigli live</h3>
    ${renderConsigli()}

    <h3>I miei obiettivi ancora disponibili</h3>
    ${targetsHtml}
  `;
}

function donutSvg(frac) {
  const r = 58, c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, frac)) * c;
  return `<svg width="150" height="150" viewBox="0 0 150 150">
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--bg-elev-2)" stroke-width="16" />
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--accent)" stroke-width="16"
      stroke-dasharray="${dash} ${c - dash}" stroke-linecap="round" transform="rotate(-90 75 75)" />
  </svg>`;
}

function barRow(rep, color) {
  const speso = SUMMARY.per_reparto_mio[rep].speso;
  const totale = SUMMARY.budget_totale || 1;
  const targetPct = SUMMARY.target_pct[rep];
  const fillPct = Math.min(100, (speso / totale) * 100);
  return `<div class="bar-row">
    <span>${REPARTO_LABEL[rep]}</span>
    <div class="track"><div class="fill" style="width:${fillPct}%;background:${color}"></div><div class="target-mark" style="left:${targetPct}%" title="target ${targetPct}%"></div></div>
    <span class="small-muted">${speso}cr · target ${targetPct}%</span>
  </div>`;
}

function renderBudgetChart() {
  const frac = SUMMARY.budget_totale ? SUMMARY.speso / SUMMARY.budget_totale : 0;
  return `<div class="chart-row">
    <div class="donut-wrap">${donutSvg(frac)}<div class="donut-center"><span class="big">${SUMMARY.rimanente}</span><span class="lbl">rimanenti</span></div></div>
    <div class="bar-rows">
      ${barRow('POR', 'var(--por)')}
      ${barRow('DIF', 'var(--dif)')}
      ${barRow('CEN', 'var(--cen)')}
      ${barRow('ATT', 'var(--att)')}
    </div>
  </div>
  <p class="small-muted" style="margin-top:-8px">La barra colorata è quanto hai speso in quel reparto (in % sul budget totale); la lineetta bianca è il target consigliato.</p>`;
}

function initials(nome) {
  const parts = String(nome || '').trim().split(/\s+/);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function rowLeftPositions(n) {
  if (n <= 1) return [50];
  const margin = Math.max(10, 42 - n * 6);
  const step = (100 - margin * 2) / (n - 1);
  return Array.from({ length: n }, (_, i) => margin + step * i);
}

function renderFormationSection() {
  if (!CONFIG.moduli || !CONFIG.moduli.length) return '<div class="empty-state">Nessun modulo configurato</div>';
  const modulo = (MIA.formazione && MIA.formazione.modulo) || CONFIG.moduli[0].nome;
  const modConf = CONFIG.moduli.find(m => m.nome === modulo) || CONFIG.moduli[0];
  const slotMap = (MIA.formazione && MIA.formazione.slot) || {};
  const mine = PLAYERS.filter(p => p.preso && p.squadra_acquirente === MIA_IDENTITA);
  const byId = Object.fromEntries(mine.map(p => [p.id, p]));

  const colors = { POR: 'var(--por)', DIF: 'var(--dif)', CEN: 'var(--cen)', ATT: 'var(--att)' };

  let slots = '';
  (modConf.linee || []).forEach((linea, lineaIdx) => {
    const lefts = rowLeftPositions(linea.slot.length);
    linea.slot.forEach((ruoli, slotIdx) => {
      const key = `L${lineaIdx}-S${slotIdx}`;
      const pid = slotMap[key];
      const p = pid ? byId[pid] : null;
      const rep = REPARTO[ruoli[0]] || 'CEN';
      const label = ruoli.join('/');
      slots += `<div class="pitch-slot ${p ? 'filled' : 'empty'}" data-slot-key="${key}" data-ruoli="${ruoli.join(',')}" style="left:${lefts[slotIdx]}%; top:${linea.top}%;">
        <div class="pitch-card-avatar">
          <span class="pitch-role-tag" style="background:${colors[rep]}">${label}</span>
          ${p ? initials(p.nome) : '+'}
        </div>
        <span class="pitch-name">${p ? escapeHtml(p.nome) : 'Vuoto'}</span>
        ${p ? `<span class="pitch-price">${p.prezzo_pagato}cr</span>` : ''}
      </div>`;
    });
  });

  const startingIds = new Set(Object.values(slotMap).filter(Boolean));
  const bench = mine.filter(p => !startingIds.has(p.id));

  return `
    <div class="formation-head">
      <label class="small-muted">Modulo</label>
      <select id="moduloSelect">${CONFIG.moduli.map(m => `<option value="${escapeHtml(m.nome)}" ${m.nome===modulo?'selected':''}>${escapeHtml(m.nome)}</option>`).join('')}</select>
      <span class="small-muted">${mine.length}/${CONFIG.rosa.totale_giocatori} in rosa · clicca uno slot per assegnare</span>
    </div>
    <div class="pitch-wrap">
      <div class="pitch">
        <div class="pitch-box top"></div>
        <div class="pitch-box bottom"></div>
        <div class="pitch-line-h"></div>
        <div class="pitch-circle"></div>
        ${slots}
      </div>
    </div>
    <h5 style="margin:16px 0 4px">Panchina (${bench.length})</h5>
    <div class="bench-row">${
      bench.map(p => `<div class="bench-card nome-link" data-popup="${p.id}">
          <span class="avatar">${initials(p.nome)}</span>
          <span class="name">${escapeHtml(p.nome)}</span>
          <span class="small-muted">${p.ruoli.join('/')}</span>
        </div>`).join('') || '<span class="small-muted">Nessuno — sono tutti titolari o non hai ancora giocatori</span>'
    }</div>
  `;
}

function renderConsigli() {
  if (!CONSIGLI || !CONSIGLI.consigli || !CONSIGLI.consigli.length) {
    return `<div class="empty-state">Tutti i reparti hanno raggiunto lo slot target 🎉</div>`;
  }
  return CONSIGLI.consigli.map(r => `
    <div class="consiglio-card">
      <div class="head">
        <span class="titolo">${REPARTO_LABEL[r.reparto]} <span class="urgenza-badge urgenza-${r.urgenza}">${r.urgenza}</span></span>
        <span class="small-muted">${r.slot_mancanti} slot mancanti · ~${r.budget_medio_per_slot}cr/slot disponibili</span>
      </div>
      <div class="consiglio-players">
        ${r.suggeriti.length ? r.suggeriti.map(p => `<div class="consiglio-player nome-link" data-popup="${p.id}">
          <span class="nome">${p.obiettivo ? '★ ' : ''}${escapeHtml(p.nome)}</span>
          <span class="meta">${p.ruoli.join('/')} · ${p.tier_carmy || '—'} · ${p.prezzo_stimato ?? '—'}cr</span>
        </div>`).join('') : '<span class="small-muted">Nessun disponibile in questa fascia di prezzo — alza il budget/slot in Impostazioni o punta su occasioni più care</span>'}
      </div>
    </div>`).join('');
}

/* ---------------- Teams tab ---------------- */
function renderTeamsTab() {
  const teams = STATE.squadre.slice().sort((a, b) => {
    if (a === MIA_IDENTITA) return -1;
    if (b === MIA_IDENTITA) return 1;
    const sa = SUMMARY.per_squadra[a] || { speso: 0 };
    const sb = SUMMARY.per_squadra[b] || { speso: 0 };
    return sb.speso - sa.speso;
  });
  const cards = teams.map(sq => {
    const info = SUMMARY.per_squadra[sq] || { speso: 0, giocatori: 0 };
    const rimanente = SUMMARY.budget_totale - info.speso;
    const pctSpeso = SUMMARY.budget_totale ? Math.min(100, Math.round(100 * info.speso / SUMMARY.budget_totale)) : 0;
    const players = PLAYERS.filter(p => p.preso && p.squadra_acquirente === sq)
      .sort((a, b) => (b.prezzo_pagato || 0) - (a.prezzo_pagato || 0));
    const isMine = sq === MIA_IDENTITA;
    const colors = { POR: 'var(--por)', DIF: 'var(--dif)', CEN: 'var(--cen)', ATT: 'var(--att)' };
    return `<div class="dept-card" style="${isMine ? 'border-color:var(--accent)' : ''}">
      <div class="team-card-head">
        <span class="tname">${escapeHtml(sq)} ${isMine ? '<span class="small-muted">(io)</span>' : ''}</span>
        <span class="small-muted">${info.giocatori}/${CONFIG.rosa.totale_giocatori} · media ${info.giocatori ? Math.round(info.speso/info.giocatori) : 0}cr</span>
      </div>
      <div class="team-budget-bar"><div style="width:${pctSpeso}%;background:${pctSpeso>90?'var(--danger)':'var(--accent)'}"></div></div>
      <div class="meta">Speso ${info.speso}cr · Rimanente <b>${rimanente}cr</b></div>
      <ul class="roster-list">${players.map(p => `<li>
          <span><span class="team-mini-role" style="background:${colors[p.reparti[0]]}">${p.ruoli[0]}</span><span class="nome-link" data-popup="${p.id}">${escapeHtml(p.nome)}</span></span>
          <span class="p">${p.prezzo_pagato}cr</span>
        </li>`).join('') || '<li class="small-muted">Nessun acquisto</li>'}</ul>
    </div>`;
  }).join('');
  return `<div class="teams-grid">${cards}</div>`;
}

/* ---------------- Popup giocatore ---------------- */
function popupContent(p) {
  const stats = [
    ['Presenze', p.presenze], ['Gol', p.gol], ['Assist', p.assist],
    ['FMV', p.fmv ? p.fmv.toFixed(2) : '—'], ['Amm.', p.ammonizioni], ['Esp.', p.espulsioni],
  ];
  const statoNota = p.preso
    ? `${p.squadra_acquirente === MIA_IDENTITA ? 'Tua' : escapeHtml(p.squadra_acquirente)} · pagato ${p.prezzo_pagato}cr`
    : `Libero · stima ${p.prezzo_stimato ?? '—'}cr`;
  return `
    <button class="close-x" data-action="close-popup">✕</button>
    <h4>${escapeHtml(p.nome)} ${tierPill(p.tier_carmy)}</h4>
    <div class="sub">${escapeHtml(p.team || '')}${p.allenatore ? ' · all. ' + escapeHtml(p.allenatore) : ''}</div>
    ${roleBadges(p.ruoli)}
    <div class="stat-grid">${stats.map(([l, n]) => `<div><span class="n">${n ?? '—'}</span><span class="l">${l}</span></div>`).join('')}</div>
    ${p.calendario ? `<div class="calendario-badge cal-${p.calendario.difficolta}">📅 Prime 8 giornate: <b>${p.calendario.difficolta}</b></div>` : ''}
    ${p.note && p.note.length ? `<div class="tags">${p.note.map(n => `<span>${escapeHtml(n)}</span>`).join('')}</div>` : ''}
    ${p.nota_ricerca ? `<div class="ricerca">🔎 ${escapeHtml(p.nota_ricerca)}</div>` : ''}
    ${p.commenti && p.commenti.length ? `<div class="commento">"${escapeHtml(p.commenti[0])}"</div>` : ''}
    <div class="small-muted" style="margin-top:8px">${statoNota}</div>
    ${p.preso && p.squadra_acquirente === MIA_IDENTITA
      ? `<button class="btn small" style="margin-top:8px;width:100%" data-action="show-incastro" data-id="${p.id}">🔄 Chi si incastra bene con lui?</button>
         <div id="incastroResult"></div>`
      : ''}
  `;
}

async function showIncastro(id) {
  const box = $('#incastroResult');
  if (!box) return;
  INCASTRO_SHOWN_FOR = id;
  box.innerHTML = '<div class="small-muted" style="padding:6px 0">Calcolo sulle 38 giornate...</div>';
  try {
    const d = await api('/api/incastro?id=' + encodeURIComponent(id) + '&limit=5');
    if (!d.giornate_difficili_riferimento.length) {
      box.innerHTML = `<div class="small-muted" style="padding:6px 0">${escapeHtml(d.riferimento)} non ha giornate "difficili" da coprire secondo il calendario.</div>`;
      return;
    }
    box.innerHTML = `
      <div class="small-muted" style="margin:6px 0">${d.giornate_difficili_riferimento.length} giornate difficili per ${escapeHtml(d.riferimento_team)}: G${d.giornate_difficili_riferimento.join(', G')}</div>
      ${d.candidati.length ? d.candidati.map(c => `
        <div class="incastro-row">
          <span class="nome-link" data-popup="${c.id}">${escapeHtml(c.nome)}</span>
          <span class="small-muted">${escapeHtml(c.team)} · ${c.prezzo_stimato ?? '—'}cr</span>
          <span class="copertura-badge">${c.copertura}</span>
        </div>`).join('') : '<div class="small-muted">Nessun giocatore libero dello stesso ruolo copre le sue giornate difficili</div>'}
    `;
  } catch (e) {
    box.innerHTML = `<div class="small-muted" style="color:var(--danger)">${escapeHtml(e.message)}</div>`;
  }
}

function openPopupFor(el) {
  const id = el.dataset.popup;
  const p = PLAYERS.find(pl => pl.id === id);
  if (!p) return;
  if (INCASTRO_SHOWN_FOR !== id) INCASTRO_SHOWN_FOR = null;
  const pop = $('#playerPopup');
  pop.innerHTML = popupContent(p);
  pop.classList.add('open');
  positionPopup(el);
}

function positionPopup(el) {
  const pop = $('#playerPopup');
  const rect = el.getBoundingClientRect();
  const popW = 300;
  let left = Math.min(rect.left, window.innerWidth - popW - 10);
  left = Math.max(10, left);
  pop.style.left = left + 'px';
  pop.style.top = (rect.bottom + 6) + 'px';
  requestAnimationFrame(() => {
    const popRect = pop.getBoundingClientRect();
    if (popRect.bottom > window.innerHeight - 10) {
      pop.style.top = Math.max(10, rect.top - popRect.height - 6) + 'px';
    }
  });
}

function refreshPopupContent() {
  const p = PLAYERS.find(pl => pl.id === POPUP_PINNED_ID);
  if (!p) { hidePopup(); return; }
  const pop = $('#playerPopup');
  if (!pop.classList.contains('open')) return;
  pop.innerHTML = popupContent(p);
  // il refresh automatico ricostruisce il popup da zero: se l'utente aveva appena
  // aperto l'incastro calendario (fetch asincrono), senza questo si perdeva ad ogni poll
  if (INCASTRO_SHOWN_FOR === p.id) showIncastro(p.id);
}

function hidePopup() {
  $('#playerPopup').classList.remove('open');
  POPUP_PINNED_ID = null;
  INCASTRO_SHOWN_FOR = null;
}

function setupPopup() {
  let hoverTimer = null;
  document.addEventListener('mouseover', e => {
    if (POPUP_PINNED_ID) return;
    const el = e.target.closest('[data-popup]');
    if (!el) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => openPopupFor(el), 280);
  });
  document.addEventListener('mouseout', e => {
    if (POPUP_PINNED_ID) return;
    const el = e.target.closest('[data-popup]');
    if (!el) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => { if (!POPUP_PINNED_ID) hidePopup(); }, 180);
  });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-action="close-popup"]')) { hidePopup(); return; }
    const incastroBtn = e.target.closest('[data-action="show-incastro"]');
    if (incastroBtn) { showIncastro(incastroBtn.dataset.id); return; }
    const el = e.target.closest('[data-popup]');
    if (el) { openPopupFor(el); POPUP_PINNED_ID = el.dataset.popup; return; }
    if (e.target.closest('#playerPopup')) return;
    if (POPUP_PINNED_ID) hidePopup();
  });
}

/* ---------------- Log tab ---------------- */
function renderLogTab() {
  const entries = STATE.log.slice().reverse();
  const items = entries.map(e => {
    const time = new Date(e.ts * 1000).toLocaleTimeString('it-IT');
    let txt = '';
    if (e.azione === 'pick') txt = `<b>${escapeHtml(e.nome)}</b> assegnato a ${escapeHtml(e.squadra)} per ${e.prezzo}cr`;
    else if (e.azione === 'undo' || e.azione === 'undo-last') txt = `Annullato: <b>${escapeHtml(e.nome)}</b>`;
    return `<li>[${time}] ${txt}</li>`;
  }).join('');
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 style="margin:0">Log asta (${entries.length})</h3>
      <button class="btn small" data-action="undo-last">Annulla ultima assegnazione</button>
    </div>
    <ul class="log-feed">${items || '<li class="small-muted">Nessuna azione registrata</li>'}</ul>
  `;
}

/* ---------------- Settings tab ---------------- */
function teamNameRowHtml(name, isMine) {
  return `<div class="team-name-row">
    <input type="text" value="${escapeHtml(name)}" data-team-input />
    ${isMine ? '<span class="small-muted">(tu)</span>' : ''}
  </div>`;
}

function renderSettingsTab() {
  const teamRows = STATE.squadre.map(s => teamNameRowHtml(s, s === MIA_IDENTITA)).join('');
  const rp = CONFIG.regole_punteggio;
  const bs = CONFIG.budget_strategy;
  const rs = CONFIG.rosa;
  return `
    <div class="settings-grid">
      <div class="card">
        <h4>La tua identità</h4>
        <p class="small-muted">Sei collegato come <b>${escapeHtml(MIA_IDENTITA)}</b>: rosa, obiettivi e formazione che vedi sono i tuoi. Se un amico usa questa stessa app (stesso server, stessa asta), sceglie un'identità diversa e non si sovrascrivono a vicenda.</p>
        <button class="btn small" id="changeIdentityBtn">Cambia identità</button>
      </div>

      <div class="card">
        <h4>Squadre della lega (10 partecipanti)</h4>
        <div id="teamNamesList">${teamRows}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn small" data-action="add-team-row">+ Aggiungi squadra</button>
          <button class="btn small primary" data-action="save-teams">Salva squadre</button>
        </div>
        <p class="small-muted">Rinomina "Team 2".."Team 10" con i nomi reali quando li scopri il giorno dell'asta.</p>
      </div>

      <div class="card">
        <h4>Budget &amp; rosa</h4>
        <div class="field-row"><label>Budget iniziale</label><input type="number" id="cfgBudget" value="${CONFIG.lega.budget_iniziale}" /></div>
        <div class="field-row"><label>Slot totali rosa</label><input type="number" id="cfgSlotTot" value="${rs.totale_giocatori}" /></div>
        <div class="field-row"><label>Slot POR target</label><input type="number" id="cfgSlotPOR" value="${rs.target_per_reparto.POR}" /></div>
        <div class="field-row"><label>Slot DIF target</label><input type="number" id="cfgSlotDIF" value="${rs.target_per_reparto.DIF}" /></div>
        <div class="field-row"><label>Slot CEN target</label><input type="number" id="cfgSlotCEN" value="${rs.target_per_reparto.CEN}" /></div>
        <div class="field-row"><label>Slot ATT target</label><input type="number" id="cfgSlotATT" value="${rs.target_per_reparto.ATT}" /></div>
        <hr style="border-color:var(--border)" />
        <div class="field-row"><label>% budget POR</label><input type="number" id="cfgPctPOR" value="${bs.target_pct.POR}" /></div>
        <div class="field-row"><label>% budget DIF</label><input type="number" id="cfgPctDIF" value="${bs.target_pct.DIF}" /></div>
        <div class="field-row"><label>% budget CEN</label><input type="number" id="cfgPctCEN" value="${bs.target_pct.CEN}" /></div>
        <div class="field-row"><label>% budget ATT</label><input type="number" id="cfgPctATT" value="${bs.target_pct.ATT}" /></div>
        <button class="btn small primary" data-action="save-config" style="margin-top:8px">Salva impostazioni</button>
      </div>

      <div class="card">
        <h4>Regole di punteggio (modificabili)</h4>
        <div class="field-row"><label>Gol fatto</label><span>${rp.gol_fatto}</span></div>
        <div class="field-row"><label>Assist</label><span>${rp.assist}</span></div>
        <div class="field-row"><label>Ammonizione</label><span>${rp.ammonizione}</span></div>
        <div class="field-row"><label>Espulsione</label><span>${rp.espulsione}</span></div>
        <div class="field-row"><label>Rigore segnato</label><span>${rp.rigore_segnato}</span></div>
        <div class="field-row"><label>Rigore sbagliato</label><span>${rp.rigore_sbagliato}</span></div>
        <div class="field-row"><label>Rigore parato (Por)</label><span>${rp.rigore_parato}</span></div>
        <div class="field-row"><label>Gol subito (Por)</label><span>${rp.gol_subito_portiere}</span></div>
        <div class="field-row"><label>Imbattibilità (Por)</label><span>${rp.imbattibilita_portiere}</span></div>
        <p class="small-muted">${rp.modificatore_difesa.note}</p>
      </div>

      <div class="card">
        <h4>API live (per interazione rapida)</h4>
        <p class="small-muted">Il server espone endpoint REST su questa stessa porta, utili per aggiornare l'asta da terminale mentre la segui a voce:</p>
        <p class="small-muted"><code>POST /api/pick {query, team, price}</code><br/>
        <code>POST /api/undo {query}</code><br/>
        <code>GET /api/suggest?ruolo=Pc&budget_max=50</code><br/>
        <code>GET /api/search?q=nome</code><br/>
        <code>GET /api/consigli</code> — suggerimenti live per reparto<br/>
        <code>POST /api/formazione {modulo, slot}</code><br/>
        <code>GET /api/incastro?id=X</code> — chi copre le giornate difficili di un tuo giocatore<br/>
        <code>POST /api/reload-data</code> — ricarica players/config/allenatori/note da disco senza riavviare</p>
        <p class="small-muted">Ogni chiamata può includere <code>squadra=NOME</code> (query per i GET, campo nel body per i POST) per dire di quale rosa si sta parlando — se non lo specifichi uso l'identità corrente del browser.</p>
      </div>
    </div>
  `;
}

async function saveTeamNames() {
  const inputs = $all('[data-team-input]');
  const oldNames = STATE.squadre;
  const newNames = inputs.map(i => i.value.trim()).filter(Boolean);
  const renameMap = {};
  oldNames.forEach((old, idx) => { if (newNames[idx] && newNames[idx] !== old) renameMap[old] = newNames[idx]; });
  try {
    await api('/api/team-names', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ squadre: newNames, rename_map: renameMap }) });
    if (renameMap[MIA_IDENTITA]) {
      MIA_IDENTITA = renameMap[MIA_IDENTITA];
      localStorage.setItem('mantra_identita', MIA_IDENTITA);
    }
    toast('Squadre salvate', 'success');
    await refreshAll();
  } catch (e) { toast(e.message, 'error'); }
}

async function saveConfig() {
  const body = {
    lega: { budget_iniziale: Number($('#cfgBudget').value) },
    rosa: {
      totale_giocatori: Number($('#cfgSlotTot').value),
      target_per_reparto: {
        POR: Number($('#cfgSlotPOR').value), DIF: Number($('#cfgSlotDIF').value),
        CEN: Number($('#cfgSlotCEN').value), ATT: Number($('#cfgSlotATT').value),
      },
    },
    budget_strategy: {
      target_pct: {
        POR: Number($('#cfgPctPOR').value), DIF: Number($('#cfgPctDIF').value),
        CEN: Number($('#cfgPctCEN').value), ATT: Number($('#cfgPctATT').value),
      },
    },
  };
  try {
    await api('/api/config', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast('Impostazioni salvate', 'success');
    await refreshAll();
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- Search box ---------------- */
function setupSearch() {
  const input = $('#searchInput');
  const results = $('#searchResults');
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) { results.classList.remove('open'); return; }
    debounceTimer = setTimeout(async () => {
      const list = await api('/api/search?q=' + encodeURIComponent(q));
      results.innerHTML = list.map(p => `
        <div class="search-result-row" data-goto="${p.id}">
          ${roleBadges(p.ruoli)}
          <span style="flex:1">${escapeHtml(p.nome)} <span class="small-muted">${escapeHtml(p.team||'')}</span></span>
          ${tierPill(p.tier_carmy)}
          <span class="small-muted">${p.prezzo_stimato ?? '—'}cr</span>
          ${p.preso ? `<span class="small-muted">(${escapeHtml(p.squadra_acquirente)})</span>` : ''}
        </div>`).join('') || '<div class="search-result-row small-muted">Nessun risultato</div>';
      results.classList.add('open');
    }, 150);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) results.classList.remove('open');
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') { results.classList.remove('open'); input.blur(); }
  });
  results.addEventListener('click', e => {
    const row = e.target.closest('[data-goto]'); if (!row) return;
    results.classList.remove('open');
    input.value = '';
    ACTIVE_TAB = 'players';
    $all('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === 'players'));
    $('#sidebar').style.display = '';
    FILTERS = { reparto: null, ruolo: null, stato: null, tier: '' };
    setupSidebar();
    renderActiveTab();
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${row.dataset.goto}"]`);
      if (el) { el.closest('tr').scrollIntoView({ block: 'center', behavior: 'smooth' }); el.closest('tr').style.background = 'rgba(79,209,197,.15)'; }
    }, 50);
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function isEditingSomething() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return false;
  // la barra di ricerca vive fuori da #content e non blocca il refresh della tabella
  return !!el.closest('#content');
}

async function pollTick() {
  if (isEditingSomething()) return; // non travolgere un prezzo/nome che si sta digitando
  await refreshAll();
}

async function init() {
  setupTabs();
  setupSearch();
  setupPopup();
  setupSlotPicker();
  setupIdentityBadge();
  await ensureIdentity();
  await refreshAll();
  setupSidebar();
  setInterval(pollTick, 5000);
}

init().catch(e => toast('Errore di avvio: ' + e.message, 'error'));
