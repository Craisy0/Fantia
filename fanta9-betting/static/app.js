(function () {
  'use strict';

  const LS_SQUADRA = 'fanta9_squadra';
  const SS_ADMIN_PW = 'fanta9_admin_pw';

  let stato = null; // ultima risposta di /api/state

  function squadraAttuale() {
    return localStorage.getItem(LS_SQUADRA) || null;
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

  // ---------------------------------------------------------------------
  // Caricamento stato + render
  // ---------------------------------------------------------------------

  async function ricarica() {
    const squadra = squadraAttuale();
    const qs = squadra ? `?squadra=${encodeURIComponent(squadra)}` : '';
    stato = await get('/api/state' + qs);
    renderTutto();
  }

  function renderTutto() {
    el('#nome-lega').textContent = stato.lega || 'Fanta 9';
    renderIdentita();
    renderSquadreOptions();
    renderMercati();
    renderGiocate();
    renderClassifica();
    if (adminPassword()) {
      renderAdminMercati();
      renderAdminLog();
    }
  }

  function renderIdentita() {
    const squadra = squadraAttuale();
    if (!squadra) {
      el('#modal-identita').classList.add('open');
      el('#badge-squadra').textContent = 'Chi sei?';
      el('#badge-saldo').textContent = '';
      return;
    }
    el('#modal-identita').classList.remove('open');
    el('#badge-squadra').textContent = squadra;
    const saldo = stato.mio_saldo;
    el('#badge-saldo').textContent = saldo != null ? `${saldo.toFixed(0)} FM` : '';
  }

  function renderSquadreOptions() {
    const squadre = stato.squadre || [];
    const opts = squadre.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    el('#select-squadra').innerHTML = opts;
    el('#h2h-squadra-a').innerHTML = opts;
    el('#h2h-squadra-b').innerHTML = opts;
    el('#correzione-squadra').innerHTML = opts;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------------------------------------------------------------
  // Tab "Scommesse aperte"
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
    cont.innerHTML = mercati.map(renderMercatoCard).join('');

    all('.esito-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mercatoId = Number(btn.dataset.mercatoId);
        const box = el(`#bet-box-${mercatoId}`);
        if (!box) return;
        all(`.esito-btn[data-mercato-id="${mercatoId}"]`).forEach(b => b.classList.remove('selezionato'));
        btn.classList.add('selezionato');
        box.dataset.esito = btn.dataset.esito;
        box.querySelector('.bet-esito-label').textContent = btn.querySelector('.label').textContent;
        box.classList.add('open');
      });
    });

    all('.btn-piazza').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mercatoId = Number(btn.dataset.mercatoId);
        const box = el(`#bet-box-${mercatoId}`);
        const esito = box.dataset.esito;
        const importo = Number(box.querySelector('.bet-importo').value);
        const squadra = squadraAttuale();
        if (!squadra) { alert('Scegli prima la tua squadra.'); return; }
        if (!esito) { alert('Scegli un esito.'); return; }
        const r = await post('/api/scommessa', { squadra, mercato_id: mercatoId, esito, importo });
        if (r.errore) { alert(r.errore); return; }
        await ricarica();
      });
    });
  }

  function renderMercatoCard(m) {
    const mia = squadraAttuale();
    const mieBets = (stato.mie_scommesse || []).filter(s => s.mercato_id === m.id);
    const esitiHtml = m.esiti.map(e => {
      let classi = 'esito-btn';
      if (m.stato === 'risolto') classi += (e.chiave === m.esito_vincente ? ' vincente' : ' perdente');
      return `<button class="${classi}" data-mercato-id="${m.id}" data-esito="${escapeHtml(e.chiave)}" ${m.stato !== 'aperto' ? 'disabled' : ''}>
        <span class="label">${escapeHtml(e.label)}</span>
        <span class="quota">${e.quota.toFixed(2)}</span>
      </button>`;
    }).join('');

    const betBox = m.stato === 'aperto' ? `
      <div class="bet-box" id="bet-box-${m.id}">
        <span>Punta su <b class="bet-esito-label"></b>:</span>
        <input type="number" class="bet-importo" min="1" step="1" placeholder="Fantamilioni">
        <button class="btn-piazza primario" data-mercato-id="${m.id}">Piazza scommessa</button>
      </div>` : '';

    const mieBetsHtml = mieBets.length ? `<div class="hint">Tue giocate su questo mercato: ${
      mieBets.map(s => `${s.importo} FM su "${s.esito}" (${s.stato})`).join(', ')
    }</div>` : '';

    return `<div class="mercato-card">
      <h3>${escapeHtml(m.titolo)} <span class="mercato-stato ${m.stato}">${m.stato}</span></h3>
      <div class="esiti-riga">${esitiHtml}</div>
      ${betBox}
      ${mieBetsHtml}
    </div>`;
  }

  // ---------------------------------------------------------------------
  // Tab "Le mie giocate"
  // ---------------------------------------------------------------------

  function renderGiocate() {
    const cont = el('#lista-giocate');
    const squadra = squadraAttuale();
    if (!squadra) { cont.innerHTML = '<p class="hint">Scegli prima la tua squadra.</p>'; return; }
    const bets = (stato.mie_scommesse || []).slice().sort((a, b) => b.id - a.id);
    if (!bets.length) { cont.innerHTML = '<p class="hint">Non hai ancora piazzato nessuna scommessa.</p>'; return; }
    const mercatiById = {};
    (stato.mercati || []).forEach(m => { mercatiById[m.id] = m; });
    cont.innerHTML = bets.map(b => {
      const m = mercatiById[b.mercato_id];
      const titolo = m ? m.titolo : `Mercato #${b.mercato_id}`;
      const esitoLabel = m ? (m.esiti.find(e => e.chiave === b.esito) || {}).label || b.esito : b.esito;
      let dettaglio = `${b.importo} FM @ ${b.quota.toFixed(2)}`;
      if (b.stato === 'vinta') dettaglio += ` → vinti ${b.vincita} FM`;
      if (b.stato === 'persa') dettaglio += ' → persi';
      return `<div class="giocata-card">
        <div><b>${escapeHtml(titolo)}</b><br><span class="hint">${escapeHtml(esitoLabel)} — ${dettaglio}</span></div>
        <div class="giocata-stato ${b.stato}">${b.stato}</div>
      </div>`;
    }).join('');
  }

  // ---------------------------------------------------------------------
  // Tab "Classifica"
  // ---------------------------------------------------------------------

  function renderClassifica() {
    const body = el('#classifica-body');
    const righe = stato.classifica || [];
    body.innerHTML = righe.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.squadra)}</td><td>${r.saldo.toFixed(0)}</td></tr>`).join('');
  }

  // ---------------------------------------------------------------------
  // Tab "Admin"
  // ---------------------------------------------------------------------

  function mostraPannelloAdminSeLoggato() {
    if (adminPassword()) {
      el('#admin-login').classList.add('hidden');
      el('#admin-panel').classList.remove('hidden');
      renderAdminMercati();
      renderAdminLog();
    } else {
      el('#admin-login').classList.remove('hidden');
      el('#admin-panel').classList.add('hidden');
    }
  }

  async function renderAdminMercati() {
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
      if (!confirm(`Risolvere il mercato #${id} con esito "${select.value}"? Pagherà subito le vincite.`)) return;
      const r = await post('/api/admin/risolvi-mercato', { admin_password: adminPassword(), mercato_id: id, esito_vincente: select.value });
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

  function initTabs() {
    all('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        all('.tab-btn').forEach(b => b.classList.remove('active'));
        all('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        el(`#tab-${btn.dataset.tab}`).classList.add('active');
        if (btn.dataset.tab === 'admin') mostraPannelloAdminSeLoggato();
      });
    });
  }

  function initIdentita() {
    el('#btn-conferma-identita').addEventListener('click', async () => {
      const squadra = el('#select-squadra').value;
      localStorage.setItem(LS_SQUADRA, squadra);
      await ricarica();
    });
    el('#btn-cambia-identita').addEventListener('click', () => {
      localStorage.removeItem(LS_SQUADRA);
      renderIdentita();
    });
  }

  function initAdminLogin() {
    el('#btn-admin-login').addEventListener('click', async () => {
      const pw = el('#admin-password').value;
      const r = await post('/api/admin/verifica-password', { admin_password: pw });
      if (r.errore) { el('#admin-login-errore').textContent = r.errore; return; }
      sessionStorage.setItem(SS_ADMIN_PW, pw);
      el('#admin-login-errore').textContent = '';
      mostraPannelloAdminSeLoggato();
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
      if (r.mercati_risolti && r.mercati_risolti.length) msg += ` Risolti ${r.mercati_risolti.length} mercati automaticamente.`;
      alert(msg);
      el('#import-testo').value = '';
      el('#import-risultato').innerHTML = '';
      el('#btn-conferma-import').disabled = true;
      await ricarica();
    });
  }

  const FONTE_LABEL = {
    proiezione_fantalab: 'proiezione FantaLab di questa giornata',
    media_storica: 'media delle giornate storiche importate',
    default: 'valore di default (nessun dato disponibile)',
  };

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

  function initH2H() {
    let ultimaAnteprima = null;
    el('#btn-anteprima-h2h').addEventListener('click', async () => {
      const squadra_a = el('#h2h-squadra-a').value;
      const squadra_b = el('#h2h-squadra-b').value;
      const giornata = Number(el('#h2h-giornata').value);
      if (!giornata) { alert('Indica il numero di giornata.'); return; }
      if (squadra_a === squadra_b) { alert('Scegli due squadre diverse.'); return; }
      const params = new URLSearchParams({ admin_password: adminPassword(), squadra_a, squadra_b, giornata });
      const r = await get('/api/admin/anteprima-h2h?' + params.toString());
      const cont = el('#h2h-anteprima');
      if (r.errore) { cont.innerHTML = `<p class="errore">${escapeHtml(r.errore)}</p>`; el('#btn-pubblica-h2h').classList.add('hidden'); return; }
      ultimaAnteprima = r;
      cont.innerHTML = `
        <p class="hint">
          ${escapeHtml(squadra_a)}: ${r.lambda_a} gol attesi (fonte: ${FONTE_LABEL[r.fonte_a] || r.fonte_a})<br>
          ${escapeHtml(squadra_b)}: ${r.lambda_b} gol attesi (fonte: ${FONTE_LABEL[r.fonte_b] || r.fonte_b})
        </p>
        <p><b>1X2</b>: 1 → ${r['1x2'].quota_1.toFixed(2)} · X → ${r['1x2'].quota_x.toFixed(2)} · 2 → ${r['1x2'].quota_2.toFixed(2)}</p>
        <p><b>Over/Under</b>: ${r.over_under.map(o => `linea ${o.linea} (Over ${o.quota_over.toFixed(2)} / Under ${o.quota_under.toFixed(2)})`).join(' · ')}</p>`;
      el('#btn-pubblica-h2h').classList.remove('hidden');
    });
    el('#btn-pubblica-h2h').addEventListener('click', async () => {
      if (!ultimaAnteprima) return;
      const r = await post('/api/admin/crea-mercato-h2h', {
        admin_password: adminPassword(),
        squadra_a: ultimaAnteprima.squadra_a, squadra_b: ultimaAnteprima.squadra_b, giornata: ultimaAnteprima.giornata,
      });
      if (r.errore) { alert(r.errore); return; }
      alert(`Pubblicati ${r.mercati.length} mercati.`);
      el('#h2h-anteprima').innerHTML = '';
      el('#btn-pubblica-h2h').classList.add('hidden');
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

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initIdentita();
    initAdminLogin();
    initImportPunti();
    initProiezioni();
    initH2H();
    initCustom();
    initCorrezioneSaldo();
    initCambiaPassword();
    ricarica();
  });
})();
