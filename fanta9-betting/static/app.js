(function () {
  'use strict';

  const LS_IDENTITA = 'fanta9_identita';
  const SS_ADMIN_PW = 'fanta9_admin_pw';

  let stato = null; // ultima risposta di /api/state
  let carrelloSchedina = []; // selezioni non ancora confermate: {mercato_id, esito, quota, label, titolo_mercato, giornata}
  let selezioneIdentita = null; // squadra scelta nello step 1 del login, in attesa di password

  function identitaAttuale() {
    try { return JSON.parse(localStorage.getItem(LS_IDENTITA)); } catch (e) { return null; }
  }

  function adminPassword() {
    return sessionStorage.getItem(SS_ADMIN_PW) || null;
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    let data;
    try { data = await res.json(); } catch (e) { data = { errore: 'risposta non valida dal server' }; }
    if (!res.ok && !data.errore && !data.error) data.errore = `errore ${res.status}`;
    return data;
  }

  function get(path) { return api(path); }
  function post(path, body) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  function el(sel) { return document.querySelector(sel); }
  function all(sel) { return Array.from(document.querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------------------------------------------------------------
  // Caricamento stato + render
  // ---------------------------------------------------------------------

  async function ricarica() {
    const identita = identitaAttuale();
    const token = identita && identita.tipo === 'squadra' ? identita.token : null;
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    stato = await get('/api/state' + qs);
    renderTutto();
  }

  function renderTutto() {
    el('#nome-lega').textContent = stato.lega || 'Gottabet';
    renderSquadreOptions();
    renderIdentita();
    renderMercati();
    renderSchedinaBarra();
    renderGiocate();
    renderClassifica();
    if (adminPassword()) {
      renderAdminMercati();
      renderAdminSchedine();
      renderAdminLog();
      renderAdminAccessi();
    }
  }

  function mostraTabs(tabsDaMostrare) {
    all('.tab-btn').forEach(btn => btn.classList.toggle('hidden', !tabsDaMostrare.includes(btn.dataset.tab)));
    const attivoVisibile = all('.tab-btn').find(b => b.classList.contains('active') && !b.classList.contains('hidden'));
    if (!attivoVisibile) {
      const primo = all('.tab-btn').find(b => tabsDaMostrare.includes(b.dataset.tab));
      if (primo) primo.click();
    }
  }

  function renderIdentita() {
    const identita = identitaAttuale();
    if (!identita) {
      el('#modal-identita').classList.add('open');
      el('#badge-squadra').textContent = 'Chi sei?';
      el('#badge-saldo').textContent = '';
      return;
    }
    el('#modal-identita').classList.remove('open');
    if (identita.tipo === 'admin') {
      el('#badge-squadra').textContent = 'Admin';
      el('#badge-saldo').textContent = '';
      el('#btn-notifiche').classList.add('hidden');
      mostraTabs(['admin']);
    } else {
      el('#badge-squadra').textContent = identita.squadra;
      const saldo = stato.mio_saldo;
      el('#badge-saldo').textContent = saldo != null ? `${saldo.toFixed(0)} FM` : '';
      mostraTabs(['scommesse', 'giocate', 'classifica']);
      if (pushSupportato()) {
        el('#btn-notifiche').classList.remove('hidden');
        aggiornaBottoneNotifiche();
      }
    }
  }

  function renderSquadreOptions() {
    const squadre = stato.squadre || [];
    const opts = squadre.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    el('#select-squadra').innerHTML = opts + '<option value="Admin">— Admin —</option>';
    el('#correzione-squadra').innerHTML = opts;
  }

  function giornateGiaGiocate() {
    return new Set((stato.mie_schedine || []).map(s => s.giornata));
  }

  // ---------------------------------------------------------------------
  // Tab "Scommesse aperte" + schedina
  // ---------------------------------------------------------------------

  function renderMercati() {
    const cont = el('#lista-mercati');
    const mercati = (stato.mercati || []).slice().sort((a, b) => {
      const rank = { aperto: 0, chiuso: 1, risolto: 2 };
      return (rank[a.stato] - rank[b.stato]) || (b.id - a.id);
    });
    if (!mercati.length) {
      cont.innerHTML = '<p class="hint">Nessuna scommessa ancora creata. Chiedi all\'admin di pubblicarne una.</p>';
      return;
    }
    const giocate = giornateGiaGiocate();
    const gruppi = [];
    const indice = new Map();
    mercati.forEach(m => {
      const chiave = m.tipo === 'girone_andata' ? 'girone_andata' : (m.giornata != null ? `g${m.giornata}` : 'libere');
      if (!indice.has(chiave)) {
        const titolo = m.tipo === 'girone_andata' ? "Vincitore girone d'andata"
          : (m.giornata != null ? `Giornata ${m.giornata}` : 'Libere');
        indice.set(chiave, gruppi.length);
        gruppi.push({ titolo, giornata: m.giornata, tipo: m.tipo, mercati: [] });
      }
      gruppi[indice.get(chiave)].mercati.push(m);
    });
    cont.innerHTML = gruppi.map(g => {
      const statiUnici = new Set(g.mercati.map(m => m.stato));
      const statoComune = statiUnici.size === 1 ? [...statiUnici][0] : null;
      const badge = statoComune ? `<span class="mercato-stato ${statoComune}">${statoComune}</span>` : '';
      const testoNota = g.tipo === 'girone_andata'
        ? 'Hai già scelto il tuo vincitore del girone d\'andata: si può giocare una sola volta.'
        : 'Hai già giocato la schedina di questa giornata.';
      const nota = giocate.has(g.giornata) ? `<p class="giornata-nota">${testoNota}</p>` : '';
      return `
      <div class="giornata-gruppo">
        <div class="giornata-head">
          <h2 class="giornata-titolo">${escapeHtml(g.titolo)}</h2>
          ${badge}
        </div>
        ${nota}
        ${g.mercati.map(m => renderMercatoCard(m, giocate, statoComune !== null)).join('')}
      </div>`;
    }).join('');

    all('.esito-btn').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => toggleSelezione(btn));
    });
  }

  function renderMercatoCard(m, giocate, nascondiStato) {
    const giaGiocata = giocate.has(m.giornata);
    const esitiHtml = m.esiti.map(e => {
      let classi = 'esito-btn';
      if (m.stato === 'risolto') classi += (e.chiave === m.esito_vincente ? ' vincente' : ' perdente');
      const inCarrello = carrelloSchedina.some(s => s.mercato_id === m.id && s.esito === e.chiave);
      if (inCarrello) classi += ' selezionato';
      const disabilitato = m.stato !== 'aperto' || giaGiocata;
      return `<button class="${classi}" data-mercato-id="${m.id}" data-esito="${escapeHtml(e.chiave)}"
                data-quota="${e.quota}" data-label="${escapeHtml(e.label)}" ${disabilitato ? 'disabled' : ''}>
        <span class="label">${escapeHtml(e.label)}</span>
        <span class="quota">${e.quota.toFixed(2)}</span>
      </button>`;
    }).join('');

    const badge = nascondiStato ? '' : ` <span class="mercato-stato ${m.stato}">${m.stato}</span>`;

    return `<div class="mercato-card" data-giornata="${m.giornata != null ? m.giornata : ''}">
      <h3>${escapeHtml(m.titolo)}${badge}</h3>
      <div class="esiti-riga">${esitiHtml}</div>
    </div>`;
  }

  function toggleSelezione(btn) {
    const mercatoId = Number(btn.dataset.mercatoId);
    const esito = btn.dataset.esito;
    const quota = Number(btn.dataset.quota);
    const label = btn.dataset.label;
    const card = btn.closest('.mercato-card');
    const giornataAttr = card.dataset.giornata;
    const giornata = giornataAttr === '' ? null : Number(giornataAttr);
    const titoloMercato = card.querySelector('h3').firstChild.textContent.trim();

    const giaInCarrello = carrelloSchedina.find(s => s.mercato_id === mercatoId && s.esito === esito);
    if (giaInCarrello) {
      carrelloSchedina = carrelloSchedina.filter(s => !(s.mercato_id === mercatoId && s.esito === esito));
    } else {
      if (carrelloSchedina.length && carrelloSchedina[0].giornata !== giornata) {
        alert(`La schedina puo' contenere solo selezioni della stessa giornata. Hai gia' selezioni per la giornata ${carrelloSchedina[0].giornata}: svuota la schedina prima di sceglierne una diversa.`);
        return;
      }
      carrelloSchedina = carrelloSchedina.filter(s => s.mercato_id !== mercatoId); // un solo esito per mercato
      carrelloSchedina.push({ mercato_id: mercatoId, esito, quota, label, titolo_mercato: titoloMercato, giornata });
    }
    renderMercati();
    renderSchedinaBarra();
  }

  function quotaTotaleCarrello() {
    return carrelloSchedina.reduce((tot, s) => tot * s.quota, 1);
  }

  function renderSchedinaBarra() {
    const barra = el('#barra-schedina');
    if (!carrelloSchedina.length) { barra.classList.add('hidden'); return; }
    barra.classList.remove('hidden');
    el('#schedina-conteggio').textContent = carrelloSchedina.length;
    el('#schedina-quota-mini').textContent = quotaTotaleCarrello().toFixed(2);
  }

  function renderModalSchedina() {
    const cont = el('#schedina-selezioni');
    if (!carrelloSchedina.length) {
      cont.innerHTML = '<p class="hint">Nessuna selezione. Torna alle scommesse aperte e tocca una quota.</p>';
    } else {
      cont.innerHTML = carrelloSchedina.map((s, i) => `
        <div class="schedina-riga">
          <div class="info"><b>${escapeHtml(s.label)}</b>${escapeHtml(s.titolo_mercato)}</div>
          <div><span class="quota">${s.quota.toFixed(2)}</span><button class="btn-rimuovi-sel" data-i="${i}">✕</button></div>
        </div>`).join('');
      all('.btn-rimuovi-sel').forEach(btn => btn.addEventListener('click', () => {
        carrelloSchedina.splice(Number(btn.dataset.i), 1);
        renderModalSchedina();
        renderMercati();
        renderSchedinaBarra();
      }));
    }
    el('#schedina-giornata').textContent = carrelloSchedina.length ? carrelloSchedina[0].giornata : '-';
    el('#schedina-quota-totale').textContent = quotaTotaleCarrello().toFixed(2);
    aggiornaVincitaPotenzialeSchedina();
  }

  function aggiornaVincitaPotenzialeSchedina() {
    const importo = Number(el('#schedina-importo').value) || 0;
    const div = el('#schedina-vincita-potenziale');
    if (!importo || !carrelloSchedina.length) { div.textContent = ''; return; }
    const quota = quotaTotaleCarrello();
    const tetto = stato.vincita_massima_per_scommessa;
    let vincita = Math.floor(importo * quota);
    if (tetto != null && vincita > Math.floor(tetto)) {
      div.textContent = `Vincita potenziale: ${Math.floor(tetto)} FM (tetto massimo, sarebbe ${vincita})`;
    } else {
      div.textContent = `Vincita potenziale: ${vincita} FM`;
    }
  }

  // ---------------------------------------------------------------------
  // Tab "Le mie giocate"
  // ---------------------------------------------------------------------

  const ETICHETTE_STATO_SCHEDINA = { in_corso: 'In corso', vinta: 'Vinta', persa: 'Persa' };

  function renderGiocate() {
    const cont = el('#lista-giocate');
    const identita = identitaAttuale();
    if (!identita || identita.tipo !== 'squadra') { cont.innerHTML = '<p class="hint">Scegli prima la tua squadra.</p>'; return; }
    const schedine = (stato.mie_schedine || []).slice().sort((a, b) => b.id - a.id);
    if (!schedine.length) { cont.innerHTML = '<p class="hint">Non hai ancora giocato nessuna schedina.</p>'; return; }
    cont.innerHTML = schedine.map(s => {
      const selezioniHtml = s.selezioni.map(sel => `
        <div class="giocata-sel">
          <div class="giocata-sel-info">
            <span class="giocata-sel-esito">${escapeHtml(sel.label_esito)}</span>
            <span class="giocata-sel-mercato">${escapeHtml(sel.titolo_mercato)}</span>
          </div>
          <span class="giocata-sel-quota">${sel.quota.toFixed(2)}</span>
        </div>`).join('');

      let etichettaEsito, valoreEsito, classeEsito;
      if (s.stato === 'vinta') {
        etichettaEsito = 'Vincita'; valoreEsito = `${s.vincita} FM`; classeEsito = 'vinta';
      } else if (s.stato === 'persa') {
        etichettaEsito = 'Vincita'; valoreEsito = '0 FM'; classeEsito = 'persa';
      } else {
        let potenziale = Math.floor(s.importo * s.quota_totale);
        const tetto = stato.vincita_massima_per_scommessa;
        if (tetto != null) potenziale = Math.min(potenziale, Math.floor(tetto));
        etichettaEsito = 'Potenziale'; valoreEsito = `${potenziale} FM`; classeEsito = 'in_corso';
      }

      return `<div class="giocata-card stato-${s.stato}">
        <div class="giocata-head">
          <span class="giocata-giornata">Giornata ${s.giornata}</span>
          <span class="giocata-badge ${s.stato}">${ETICHETTE_STATO_SCHEDINA[s.stato]}</span>
        </div>
        <div class="giocata-selezioni">${selezioniHtml}</div>
        <div class="giocata-riepilogo">
          <div><span class="hint">Puntata</span><b>${s.importo} FM</b></div>
          <div><span class="hint">Quota</span><b>${s.quota_totale.toFixed(2)}</b></div>
          <div><span class="hint">${etichettaEsito}</span><b class="valore ${classeEsito}">${valoreEsito}</b></div>
        </div>
      </div>`;
    }).join('');
  }

  // ---------------------------------------------------------------------
  // Tab "Classifica"
  // ---------------------------------------------------------------------

  const MEDAGLIE = { 1: '🥇', 2: '🥈', 3: '🥉' };

  function renderClassifica() {
    const cont = el('#classifica-lista');
    const righe = stato.classifica || [];
    cont.innerHTML = righe.map((r, i) => {
      const pos = i + 1;
      const medaglia = MEDAGLIE[pos];
      const classeMedaglia = pos <= 3 ? ` medaglia-${pos}` : '';
      return `<div class="classifica-riga${classeMedaglia}">
        <span class="classifica-pos">${medaglia || pos}</span>
        <span class="classifica-squadra">${escapeHtml(r.squadra)}</span>
        <span class="classifica-saldo">${r.saldo.toFixed(0)} <small>FM</small></span>
      </div>`;
    }).join('');
  }

  // ---------------------------------------------------------------------
  // Tab "Admin"
  // ---------------------------------------------------------------------

  function renderAdminMercati() {
    const cont = el('#admin-mercati-lista');
    const mercati = (stato.mercati || []).slice().sort((a, b) => b.id - a.id);
    if (!mercati.length) { cont.innerHTML = '<p class="hint">Nessun mercato creato.</p>'; return; }
    cont.innerHTML = mercati.map(m => {
      const esitiOpts = m.esiti.map(e => `<option value="${escapeHtml(e.chiave)}">${escapeHtml(e.label)}</option>`).join('');
      const azioni = m.stato === 'risolto' ? '<span class="hint">risolto</span>' : `
        <button class="mini-btn btn-chiudi-riapri" data-id="${m.id}" data-chiudi="${m.stato === 'aperto'}">${m.stato === 'aperto' ? 'Chiudi' : 'Riapri'}</button>
        <button class="mini-btn btn-elimina" data-id="${m.id}">Elimina</button>
        <select class="risolvi-select" data-id="${m.id}">${esitiOpts}</select>
        <button class="mini-btn btn-risolvi" data-id="${m.id}">Risolvi</button>
      `;
      return `<div class="mercato-card">
        <h3>#${m.id} ${escapeHtml(m.titolo)} <span class="mercato-stato ${m.stato}">${m.stato}</span></h3>
        <div class="mercato-meta">${m.esiti.map(e => `${escapeHtml(e.label)}: ${e.quota.toFixed(2)}`).join(' · ')}${m.esito_vincente ? ' · vincente: ' + escapeHtml(m.esito_vincente) : ''}</div>
        <div>${azioni}</div>
      </div>`;
    }).join('');

    all('.btn-chiudi-riapri').forEach(btn => btn.addEventListener('click', async () => {
      const chiudi = btn.dataset.chiudi === 'true';
      const path = chiudi ? '/api/admin/chiudi-mercato' : '/api/admin/riapri-mercato';
      const r = await post(path, { admin_password: adminPassword(), mercato_id: Number(btn.dataset.id) });
      if (r.errore) { alert(r.errore); return; }
      await ricarica();
    }));
    all('.btn-elimina').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Eliminare questo mercato?')) return;
      const r = await post('/api/admin/elimina-mercato', { admin_password: adminPassword(), mercato_id: Number(btn.dataset.id) });
      if (r.errore) { alert(r.errore); return; }
      await ricarica();
    }));
    all('.btn-risolvi').forEach(btn => btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const select = document.querySelector(`.risolvi-select[data-id="${id}"]`);
      if (!confirm(`Risolvere il mercato #${id} con esito "${select.value}"? Pagherà subito le schedine vincenti.`)) return;
      const r = await post('/api/admin/risolvi-mercato', { admin_password: adminPassword(), mercato_id: id, esito_vincente: select.value });
      if (r.errore) { alert(r.errore); return; }
      await ricarica();
    }));
  }

  async function renderAdminSchedine() {
    const cont = el('#admin-schedine-lista');
    const params = new URLSearchParams({ admin_password: adminPassword() });
    const schedine = await get('/api/admin/schedine?' + params.toString());
    if (!Array.isArray(schedine)) { cont.innerHTML = `<p class="errore">${escapeHtml(schedine.errore || 'errore')}</p>`; return; }
    disegnaAdminSchedine(schedine);
    disegnaChiHaGiocato(schedine);
  }

  function disegnaChiHaGiocato(schedine) {
    const cont = el('#admin-chi-ha-giocato');
    const squadre = stato.squadre || [];
    const giornateConMercati = (stato.mercati || []).map(m => m.giornata).filter(g => g != null);
    const giornataTarget = giornateConMercati.length ? Math.max(...giornateConMercati) : null;
    if (giornataTarget == null) { cont.innerHTML = '<p class="hint">Nessuna giornata pubblicata ancora.</p>'; return; }
    const perSquadra = {};
    schedine.filter(s => s.giornata === giornataTarget).forEach(s => { perSquadra[s.squadra] = s; });
    cont.innerHTML = `<p class="hint"><b>Giornata ${giornataTarget}</b></p>` + squadre.map(sq => {
      const s = perSquadra[sq];
      const stato_ = s
        ? `<span class="accesso-stato si">giocata — ${s.importo} FM @ ${s.quota_totale.toFixed(2)}${s.stato !== 'in_corso' ? ' — ' + s.stato : ''}</span>`
        : '<span class="accesso-stato no">non ancora</span>';
      return `<div class="accesso-riga"><span>${escapeHtml(sq)}</span>${stato_}</div>`;
    }).join('');
  }

  function disegnaAdminSchedine(schedine) {
    const cont = el('#admin-schedine-lista');
    schedine = schedine.slice().sort((a, b) => b.id - a.id);
    if (!schedine.length) { cont.innerHTML = '<p class="hint">Nessuna schedina giocata.</p>'; return; }
    cont.innerHTML = schedine.map(s => {
      const legs = s.selezioni.map(sel => `${escapeHtml(sel.label_esito)} @ ${sel.quota.toFixed(2)}`).join(' + ');
      const azione = s.stato === 'in_corso'
        ? `<button class="mini-btn btn-elimina-schedina" data-id="${s.id}">Elimina (rimborsa)</button>`
        : `<span class="hint">${s.stato}${s.vincita ? ' — vinti ' + s.vincita + ' FM' : ''}</span>`;
      return `<div class="mercato-card">
        <h3>#${s.id} ${escapeHtml(s.squadra)} — giornata ${s.giornata}</h3>
        <div class="mercato-meta">${legs} = quota ${s.quota_totale.toFixed(2)} · puntati ${s.importo} FM</div>
        <div>${azione}</div>
      </div>`;
    }).join('');
    all('.btn-elimina-schedina').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Eliminare questa schedina e rimborsare la puntata?')) return;
      const r = await post('/api/admin/elimina-schedina', { admin_password: adminPassword(), schedina_id: Number(btn.dataset.id) });
      if (r.errore) { alert(r.errore); return; }
      await ricarica();
    }));
  }

  function renderAdminAccessi() {
    const cont = el('#admin-accessi-lista');
    const squadre = stato.squadre || [];
    const registrate = stato.squadre_registrate || {};
    cont.innerHTML = squadre.map(sq => {
      const reg = registrate[sq];
      return `<div class="accesso-riga">
        <span>${escapeHtml(sq)}</span>
        <span class="accesso-stato ${reg ? 'si' : 'no'}">${reg ? 'registrata' : 'non registrata'}</span>
        ${reg ? `<button class="mini-btn btn-reset-accesso" data-squadra="${escapeHtml(sq)}">Resetta password</button>` : ''}
      </div>`;
    }).join('');
    all('.btn-reset-accesso').forEach(btn => btn.addEventListener('click', async () => {
      const squadra = btn.dataset.squadra;
      if (!confirm(`Resettare la password di ${squadra}? Al prossimo accesso potrà impostarne una nuova.`)) return;
      const r = await post('/api/admin/reset-password-squadra', { admin_password: adminPassword(), squadra });
      if (r.errore) { alert(r.errore); return; }
      await ricarica();
    }));
  }

  async function renderAdminLog() {
    const cont = el('#admin-log');
    const log = await get('/api/log');
    cont.innerHTML = log.slice().reverse().map(l => `<div>[${l.ts}] ${escapeHtml(l.testo)}</div>`).join('');
  }

  function aggiungiRigaEsitoCustom(label, quota) {
    const cont = el('#custom-esiti');
    const div = document.createElement('div');
    div.className = 'custom-esito-riga';
    div.innerHTML = `<input type="text" class="custom-esito-label" placeholder="Esito (es. Vince Squadra 3)" value="${label ? escapeHtml(label) : ''}">
      <input type="number" class="custom-esito-quota" placeholder="Quota (es. 2.50)" step="0.01" value="${quota || ''}">
      <button class="mini-btn btn-rimuovi-esito">✕</button>`;
    div.querySelector('.btn-rimuovi-esito').addEventListener('click', () => div.remove());
    cont.appendChild(div);
  }

  // ---------------------------------------------------------------------
  // Event listeners statici
  // ---------------------------------------------------------------------

  function initPopover(btnSel, popSel) {
    const btn = el(btnSel);
    const pop = el(popSel);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!pop.classList.contains('hidden') && e.target !== btn && !pop.contains(e.target)) {
        pop.classList.add('hidden');
      }
    });
  }

  function initTabs() {
    all('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        all('.tab-btn').forEach(b => b.classList.remove('active'));
        all('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        el(`#tab-${btn.dataset.tab}`).classList.add('active');
      });
    });
  }

  function mostraStepPassword(squadra) {
    el('#identita-step-1').classList.add('hidden');
    el('#identita-step-2').classList.remove('hidden');
    el('#identita-errore').textContent = '';
    el('#identita-recupero').classList.add('hidden');
    el('#identita-password').value = '';
    el('#identita-password-conferma').value = '';
    const titolo = el('#identita-step-2-titolo');
    const hint = el('#identita-step-2-hint');
    const conferma = el('#identita-password-conferma');
    const dimenticata = el('#btn-password-dimenticata');
    if (squadra === 'Admin') {
      titolo.textContent = 'Password admin';
      hint.textContent = '';
      conferma.classList.add('hidden');
      dimenticata.classList.add('hidden');
    } else {
      const registrata = stato && stato.squadre_registrate && stato.squadre_registrate[squadra];
      if (registrata) {
        titolo.textContent = `Ciao, ${squadra}`;
        hint.textContent = 'Inserisci la tua password.';
        conferma.classList.add('hidden');
        dimenticata.classList.remove('hidden');
      } else {
        titolo.textContent = `Benvenuto, ${squadra}`;
        hint.textContent = 'Primo accesso: imposta una password (almeno 4 caratteri).';
        conferma.classList.remove('hidden');
        dimenticata.classList.add('hidden');
      }
    }
    el('#identita-password').focus();
  }

  async function eseguiLogin() {
    const squadra = selezioneIdentita;
    const pw = el('#identita-password').value;
    const erroreEl = el('#identita-errore');
    erroreEl.textContent = '';
    if (squadra === 'Admin') {
      const r = await post('/api/admin/verifica-password', { admin_password: pw });
      if (r.errore) { erroreEl.textContent = r.errore; return; }
      sessionStorage.setItem(SS_ADMIN_PW, pw);
      localStorage.setItem(LS_IDENTITA, JSON.stringify({ tipo: 'admin' }));
      selezioneIdentita = null;
      await ricarica();
      return;
    }
    const registrata = stato && stato.squadre_registrate && stato.squadre_registrate[squadra];
    if (!registrata) {
      const conferma = el('#identita-password-conferma').value;
      if (pw.length < 4) { erroreEl.textContent = 'La password deve avere almeno 4 caratteri.'; return; }
      if (pw !== conferma) { erroreEl.textContent = 'Le due password non coincidono.'; return; }
    }
    const r = await post('/api/login', { squadra, password: pw });
    if (r.errore) { erroreEl.textContent = r.errore; return; }
    localStorage.setItem(LS_IDENTITA, JSON.stringify({ tipo: 'squadra', squadra: r.squadra, token: r.token }));
    selezioneIdentita = null;
    await ricarica();
  }

  function initIdentita() {
    el('#btn-avanti-identita').addEventListener('click', () => {
      selezioneIdentita = el('#select-squadra').value;
      mostraStepPassword(selezioneIdentita);
    });
    el('#btn-indietro-identita').addEventListener('click', () => {
      selezioneIdentita = null;
      el('#identita-step-2').classList.add('hidden');
      el('#identita-step-1').classList.remove('hidden');
    });
    el('#btn-password-dimenticata').addEventListener('click', () => {
      el('#identita-recupero').classList.remove('hidden');
    });
    el('#btn-conferma-identita').addEventListener('click', eseguiLogin);
    [el('#identita-password'), el('#identita-password-conferma')].forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') eseguiLogin(); });
    });
    el('#btn-cambia-identita').addEventListener('click', async () => {
      const identita = identitaAttuale();
      if (identita && identita.tipo === 'squadra') {
        post('/api/logout', { token: identita.token });
      }
      localStorage.removeItem(LS_IDENTITA);
      sessionStorage.removeItem(SS_ADMIN_PW);
      selezioneIdentita = null;
      el('#identita-step-2').classList.add('hidden');
      el('#identita-step-1').classList.remove('hidden');
      await ricarica();
    });
  }

  function initImportPunti() {
    el('#btn-anteprima-import').addEventListener('click', async () => {
      const testo = el('#import-testo').value;
      const r = await post('/api/admin/anteprima-import-punti', { admin_password: adminPassword(), testo });
      const cont = el('#import-risultato');
      if (r.errore) { cont.innerHTML = `<p class="errore">${escapeHtml(r.errore)}</p>`; return; }
      const tuttoOk = r.righe.every(x => x.ok);
      cont.innerHTML = r.righe.map(x => x.ok
        ? `<div>✅ ${escapeHtml(x.squadra)}: ${x.punti} punti</div>`
        : `<div class="errore">❌ "${escapeHtml(x.riga)}" — ${escapeHtml(x.errore)}</div>`).join('');
      el('#btn-conferma-import').disabled = !tuttoOk || !r.righe.length;
    });
    el('#btn-conferma-import').addEventListener('click', async () => {
      const giornata = Number(el('#import-giornata').value);
      const testo = el('#import-testo').value;
      if (!giornata) { alert('Indica il numero di giornata.'); return; }
      const r = await post('/api/admin/importa-punti', { admin_password: adminPassword(), giornata, testo });
      if (r.errore) { alert(r.errore); return; }
      let msg = 'Punteggi importati.';
      if (r.mercati_risolti && r.mercati_risolti.length) {
        msg += ` Risolti ${r.mercati_risolti.length} mercati automaticamente.`;
        msg += '\nControlla "Schedine giocate" qui sopra per vedere chi ha vinto e quanto è stato pagato.';
      }
      alert(msg);
      el('#import-testo').value = '';
      el('#import-risultato').innerHTML = '';
      el('#btn-conferma-import').disabled = true;
      await ricarica();
    });
  }

  function initProiezioni() {
    el('#btn-anteprima-proiezioni').addEventListener('click', async () => {
      const testo = el('#proiezioni-testo').value;
      const r = await post('/api/admin/anteprima-import-proiezioni', { admin_password: adminPassword(), testo });
      const cont = el('#proiezioni-risultato');
      if (r.errore) { cont.innerHTML = `<p class="errore">${escapeHtml(r.errore)}</p>`; return; }
      const tuttoOk = r.righe.every(x => x.ok);
      cont.innerHTML = r.righe.map(x => x.ok
        ? `<div>✅ ${escapeHtml(x.squadra)}: ${x.punti_proiettati} punti proiettati${x.indice_schierabilita != null ? ' (I.S. ' + x.indice_schierabilita + ')' : ''}</div>`
        : `<div class="errore">❌ "${escapeHtml(x.riga)}" — ${escapeHtml(x.errore)}</div>`).join('');
      el('#btn-conferma-proiezioni').disabled = !tuttoOk || !r.righe.length;
    });
    el('#btn-conferma-proiezioni').addEventListener('click', async () => {
      const giornata = Number(el('#proiezioni-giornata').value);
      const testo = el('#proiezioni-testo').value;
      if (!giornata) { alert('Indica il numero di giornata.'); return; }
      const r = await post('/api/admin/importa-proiezioni', { admin_password: adminPassword(), giornata, testo });
      if (r.errore) { alert(r.errore); return; }
      alert('Proiezioni salvate: verranno usate per calcolare le quote dei testa a testa di questa giornata.');
      el('#proiezioni-testo').value = '';
      el('#proiezioni-risultato').innerHTML = '';
      el('#btn-conferma-proiezioni').disabled = true;
    });
  }

  function initCalendario() {
    el('#btn-anteprima-calendario').addEventListener('click', async () => {
      const giornata = Number(el('#calendario-giornata').value);
      const cont = el('#calendario-anteprima');
      if (!giornata) { alert('Indica il numero di giornata.'); return; }
      const params = new URLSearchParams({ admin_password: adminPassword(), giornata });
      const incontri = await get('/api/admin/calendario?' + params.toString());
      if (!Array.isArray(incontri)) { cont.innerHTML = `<p class="errore">${escapeHtml(incontri.errore || 'errore')}</p>`; el('#btn-pubblica-calendario').classList.add('hidden'); return; }
      if (!incontri.length) { cont.innerHTML = '<p class="errore">Nessun incontro nel calendario per questa giornata.</p>'; el('#btn-pubblica-calendario').classList.add('hidden'); return; }
      cont.innerHTML = '<ul>' + incontri.map(i => `<li>${escapeHtml(i.a)} vs ${escapeHtml(i.b)}</li>`).join('') + '</ul>';
      el('#btn-pubblica-calendario').classList.remove('hidden');
      el('#btn-pubblica-calendario').dataset.giornata = giornata;
    });
    el('#btn-pubblica-calendario').addEventListener('click', async () => {
      const giornata = Number(el('#btn-pubblica-calendario').dataset.giornata);
      const r = await post('/api/admin/pubblica-giornata', { admin_password: adminPassword(), giornata });
      if (r.errore) { alert(r.errore); return; }
      let msg = `Pubblicati ${r.mercati_creati.length} mercati.`;
      if (r.incontri_saltati_gia_esistenti.length) msg += ` Saltati (già esistenti): ${r.incontri_saltati_gia_esistenti.join(', ')}.`;
      alert(msg);
      el('#calendario-anteprima').innerHTML = '';
      el('#btn-pubblica-calendario').classList.add('hidden');
      await ricarica();
    });
  }

  function initGironeAndata() {
    el('#btn-calcola-girone-andata').addEventListener('click', async () => {
      const cont = el('#girone-andata-risultato');
      const btnPubblica = el('#btn-pubblica-girone-andata');
      cont.innerHTML = '<p class="hint">Calcolo in corso…</p>';
      btnPubblica.classList.add('hidden');
      const params = new URLSearchParams({ admin_password: adminPassword() });
      const r = await get('/api/admin/quote-girone-andata?' + params.toString());
      if (!r.ok) { cont.innerHTML = `<p class="errore">${escapeHtml(r.errore || 'errore')}</p>`; return; }
      const righe = r.quote.map(q => `<li>${escapeHtml(q.squadra)} — quota <b>${q.quota}</b> (${(q.probabilita * 100).toFixed(1)}%)</li>`).join('');
      cont.innerHTML = `<p class="hint">Giornata fine girone: ${r.giornata_fine} · partite ancora da giocare: ${r.partite_da_giocare} · simulazioni: ${r.n_simulazioni}</p><ul>${righe}</ul>`;
      btnPubblica.classList.remove('hidden');
    });
    el('#btn-pubblica-girone-andata').addEventListener('click', async () => {
      if (!confirm("Pubblicare la scommessa \"Vincitore girone d'andata\" con queste quote?")) return;
      const r = await post('/api/admin/pubblica-girone-andata', { admin_password: adminPassword() });
      if (r.errore) { alert(r.errore); return; }
      alert('Scommessa pubblicata.');
      el('#girone-andata-risultato').innerHTML = '';
      el('#btn-pubblica-girone-andata').classList.add('hidden');
      await ricarica();
    });
  }

  function initCustom() {
    aggiungiRigaEsitoCustom();
    aggiungiRigaEsitoCustom();
    el('#btn-aggiungi-esito').addEventListener('click', () => aggiungiRigaEsitoCustom());
    el('#btn-pubblica-custom').addEventListener('click', async () => {
      const titolo = el('#custom-titolo').value.trim();
      const giornataRaw = el('#custom-giornata').value;
      const giornata = giornataRaw ? Number(giornataRaw) : null;
      const esiti = all('.custom-esito-riga').map(div => ({
        label: div.querySelector('.custom-esito-label').value.trim(),
        quota: Number(div.querySelector('.custom-esito-quota').value),
      })).filter(e => e.label);
      const r = await post('/api/admin/crea-mercato-custom', { admin_password: adminPassword(), titolo, giornata, esiti });
      if (r.errore) { alert(r.errore); return; }
      alert('Scommessa libera pubblicata.');
      el('#custom-titolo').value = '';
      el('#custom-giornata').value = '';
      el('#custom-esiti').innerHTML = '';
      aggiungiRigaEsitoCustom();
      aggiungiRigaEsitoCustom();
      await ricarica();
    });
  }

  function initCorrezioneSaldo() {
    el('#btn-correggi-saldo').addEventListener('click', async () => {
      const squadra = el('#correzione-squadra').value;
      const delta = el('#correzione-delta').value;
      const motivo = el('#correzione-motivo').value;
      const r = await post('/api/admin/correggi-saldo', { admin_password: adminPassword(), squadra, delta, motivo });
      if (r.errore) { alert(r.errore); return; }
      el('#correzione-delta').value = '';
      el('#correzione-motivo').value = '';
      await ricarica();
    });
  }

  function initCambiaPassword() {
    el('#btn-cambia-password').addEventListener('click', async () => {
      const nuova_password = el('#nuova-password').value;
      const r = await post('/api/admin/cambia-password', { admin_password: adminPassword(), nuova_password });
      if (r.errore) { alert(r.errore); return; }
      sessionStorage.setItem(SS_ADMIN_PW, nuova_password);
      el('#nuova-password').value = '';
      alert('Password cambiata.');
    });
  }

  function initBackup() {
    el('#btn-scarica-backup').addEventListener('click', async () => {
      const params = new URLSearchParams({ admin_password: adminPassword() });
      const dati = await get('/api/export?' + params.toString());
      if (dati.errore) { el('#backup-errore').textContent = dati.errore; return; }
      el('#backup-errore').textContent = '';
      const blob = new Blob([JSON.stringify(dati, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const bollino = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `gottabet-backup-${bollino}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    el('#btn-ripristina-backup').addEventListener('click', async () => {
      const erroreEl = el('#backup-errore');
      erroreEl.textContent = '';
      const file = el('#ripristina-file').files[0];
      if (!file) { erroreEl.textContent = 'Scegli prima un file di backup.'; return; }
      let backup;
      try {
        backup = JSON.parse(await file.text());
      } catch (e) {
        erroreEl.textContent = 'Il file scelto non è un JSON valido.';
        return;
      }
      if (!confirm('Ripristinare questo backup? Sovrascrive saldi, mercati, schedine e password attuali.')) return;
      const r = await post('/api/admin/ripristina-backup', { admin_password: adminPassword(), backup });
      if (r.errore) { erroreEl.textContent = r.errore; return; }
      el('#ripristina-file').value = '';
      alert('Backup ripristinato.');
      await ricarica();
    });
  }

  // ---------------------------------------------------------------------
  // Notifiche push del browser (lato squadra: attiva/disattiva sul dispositivo)
  // ---------------------------------------------------------------------

  function pushSupportato() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  function base64UrlToUint8Array(base64Url) {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  async function sottoscrizioneAttuale() {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg) return null;
      return await reg.pushManager.getSubscription();
    } catch (e) {
      return null;
    }
  }

  async function aggiornaBottoneNotifiche() {
    const btn = el('#btn-notifiche');
    const sub = await sottoscrizioneAttuale();
    btn.textContent = sub ? '🔕 disattiva notifiche' : '🔔 notifiche';
  }

  async function attivaNotifiche() {
    const identita = identitaAttuale();
    const permesso = await Notification.requestPermission();
    if (permesso !== 'granted') {
      alert('Permesso negato: le notifiche restano disattivate. Puoi riprovare dalle impostazioni del browser.');
      return;
    }
    const { chiave_pubblica } = await get('/api/push/chiave-pubblica');
    if (!chiave_pubblica) { alert('Notifiche non configurate sul server.'); return; }
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(chiave_pubblica),
    });
    const r = await post('/api/push/sottoscrivi', { token: identita.token, subscription: sub.toJSON() });
    if (r.errore) { alert(r.errore); return; }
    await aggiornaBottoneNotifiche();
  }

  async function disattivaNotifiche() {
    const identita = identitaAttuale();
    const sub = await sottoscrizioneAttuale();
    if (sub) {
      await post('/api/push/annulla', { token: identita.token, endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    await aggiornaBottoneNotifiche();
  }

  function initPush() {
    if (!pushSupportato()) return;
    el('#btn-notifiche').addEventListener('click', async () => {
      const sub = await sottoscrizioneAttuale();
      if (sub) {
        await disattivaNotifiche();
      } else {
        try {
          await attivaNotifiche();
        } catch (e) {
          alert('Non è stato possibile attivare le notifiche su questo dispositivo/browser.');
        }
      }
    });
  }

  // ---------------------------------------------------------------------
  // Notifiche push (lato admin: promemoria a chi non ha giocato)
  // ---------------------------------------------------------------------

  function initAdminNotifiche() {
    const risultatoEl = el('#notifiche-risultato');
    const mostraRisultato = (r) => {
      if (r.errore) { risultatoEl.innerHTML = `<p class="errore">${escapeHtml(r.errore)}</p>`; return; }
      if (r.nota) { risultatoEl.innerHTML = `<p class="hint">${escapeHtml(r.nota)}</p>`; return; }
      const squadre = r.squadre_avvisate || Object.keys(r.risultati || {});
      const elenco = squadre.map(sq => {
        const esito = r.risultati && r.risultati[sq];
        const dettaglio = esito && esito.nessuna_sottoscrizione ? ' (nessuna notifica attiva)' : '';
        return `<li>${escapeHtml(sq)}${dettaglio}</li>`;
      }).join('');
      risultatoEl.innerHTML = elenco ? `<p class="hint">Avvisate:</p><ul>${elenco}</ul>` : '<p class="hint">Nessuno da avvisare.</p>';
    };
    el('#btn-ricorda-schedina').addEventListener('click', async () => {
      const r = await post('/api/admin/ricorda-schedina', { admin_password: adminPassword() });
      mostraRisultato(r);
    });
    el('#btn-ricorda-girone-andata').addEventListener('click', async () => {
      const r = await post('/api/admin/ricorda-girone-andata', { admin_password: adminPassword() });
      mostraRisultato(r);
    });
    el('#btn-invia-notifica').addEventListener('click', async () => {
      const titolo = el('#notifica-titolo').value.trim() || undefined;
      const testo = el('#notifica-testo').value.trim();
      if (!testo) { alert('Scrivi un messaggio da inviare.'); return; }
      const r = await post('/api/admin/notifica', { admin_password: adminPassword(), titolo, testo });
      mostraRisultato(r);
      if (r.ok) el('#notifica-testo').value = '';
    });
  }

  function initSchedina() {
    el('#barra-schedina').addEventListener('click', () => {
      renderModalSchedina();
      el('#modal-schedina').classList.add('open');
    });
    el('#btn-chiudi-schedina').addEventListener('click', () => {
      el('#modal-schedina').classList.remove('open');
    });
    el('#btn-svuota-schedina').addEventListener('click', () => {
      carrelloSchedina = [];
      renderModalSchedina();
      renderMercati();
      renderSchedinaBarra();
    });
    el('#schedina-importo').addEventListener('input', aggiornaVincitaPotenzialeSchedina);
    el('#btn-conferma-schedina').addEventListener('click', async () => {
      const identita = identitaAttuale();
      const importo = Number(el('#schedina-importo').value);
      const erroreEl = el('#schedina-errore');
      erroreEl.textContent = '';
      if (!identita || identita.tipo !== 'squadra') { erroreEl.textContent = 'Scegli prima la tua squadra.'; return; }
      if (!carrelloSchedina.length) { erroreEl.textContent = 'Aggiungi almeno una selezione.'; return; }
      if (!importo || importo <= 0) { erroreEl.textContent = 'Indica quanti fantamilioni puntare.'; return; }
      const giornata = carrelloSchedina[0].giornata;
      const selezioni = carrelloSchedina.map(s => ({ mercato_id: s.mercato_id, esito: s.esito }));
      const r = await post('/api/schedina', { token: identita.token, giornata, selezioni, importo });
      if (r.errore) { erroreEl.textContent = r.errore; return; }
      carrelloSchedina = [];
      el('#modal-schedina').classList.remove('open');
      el('#schedina-importo').value = '';
      await ricarica();
      alert(`Schedina giocata! Vincita potenziale: ${r.vincita_potenziale} FM.`);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initPopover('#btn-info-scommesse', '#popover-info-scommesse');
    initTabs();
    initIdentita();
    initImportPunti();
    initProiezioni();
    initCalendario();
    initGironeAndata();
    initCustom();
    initCorrezioneSaldo();
    initCambiaPassword();
    initBackup();
    initPush();
    initAdminNotifiche();
    initSchedina();
    ricarica();
  });
})();
