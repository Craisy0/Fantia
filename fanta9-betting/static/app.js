(function () {
  'use strict';

  const LS_SQUADRA = 'fanta9_squadra';
  const SS_ADMIN_PW = 'fanta9_admin_pw';

  let stato = null; // ultima risposta di /api/state
  let carrelloSchedina = []; // selezioni non ancora confermate: {mercato_id, esito, quota, label, titolo_mercato, giornata}

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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

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
    el('#nome-lega').textContent = stato.lega || 'Gottabet';
    renderIdentita();
    renderSquadreOptions();
    renderMercati();
    renderSchedinaBarra();
    renderGiocate();
    renderClassifica();
    if (adminPassword()) {
      renderAdminMercati();
      renderAdminSchedine();
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
    cont.innerHTML = mercati.map(m => renderMercatoCard(m, giocate)).join('');

    all('.esito-btn').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => toggleSelezione(btn));
    });
  }

  function renderMercatoCard(m, giocate) {
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

    const nota = giaGiocata
      ? `<div class="hint">Hai gia' giocato la schedina della giornata ${m.giornata}.</div>`
      : '';

    return `<div class="mercato-card" data-giornata="${m.giornata}">
      <h3>${escapeHtml(m.titolo)} <span class="mercato-stato ${m.stato}">${m.stato}</span></h3>
      <div class="esiti-riga">${esitiHtml}</div>
      ${nota}
    </div>`;
  }

  function toggleSelezione(btn) {
    const mercatoId = Number(btn.dataset.mercatoId);
    const esito = btn.dataset.esito;
    const quota = Number(btn.dataset.quota);
    const label = btn.dataset.label;
    const card = btn.closest('.mercato-card');
    const giornata = Number(card.dataset.giornata);
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
    let vincita = Math.round(importo * quota * 100) / 100;
    if (tetto != null && vincita > tetto) {
      div.textContent = `Vincita potenziale: ${tetto.toFixed(2)} FM (tetto massimo per scommessa, sarebbe ${vincita.toFixed(2)})`;
    } else {
      div.textContent = `Vincita potenziale: ${vincita.toFixed(2)} FM`;
    }
  }

  // ---------------------------------------------------------------------
  // Tab "Le mie giocate"
  // ---------------------------------------------------------------------

  function renderGiocate() {
    const cont = el('#lista-giocate');
    const squadra = squadraAttuale();
    if (!squadra) { cont.innerHTML = '<p class="hint">Scegli prima la tua squadra.</p>'; return; }
    const schedine = (stato.mie_schedine || []).slice().sort((a, b) => b.id - a.id);
    if (!schedine.length) { cont.innerHTML = '<p class="hint">Non hai ancora giocato nessuna schedina.</p>'; return; }
    cont.innerHTML = schedine.map(s => {
      const legs = s.selezioni.map(sel => `${escapeHtml(sel.label_esito)} — ${escapeHtml(sel.titolo_mercato)} @ ${sel.quota.toFixed(2)}`).join('<br>');
      let dettaglio = `${s.importo} FM @ quota totale ${s.quota_totale.toFixed(2)}`;
      if (s.stato === 'vinta') dettaglio += ` → vinti ${s.vincita} FM`;
      if (s.stato === 'persa') dettaglio += ' → persi';
      return `<div class="giocata-card">
        <div><b>Schedina giornata ${s.giornata}</b><br><span class="hint">${legs}</span><br><span class="hint">${dettaglio}</span></div>
        <div class="giocata-stato ${s.stato}">${s.stato}</div>
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
      renderAdminSchedine();
      renderAdminLog();
    } else {
      el('#admin-login').classList.remove('hidden');
      el('#admin-panel').classList.add('hidden');
    }
  }

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
        <p><b>1X2</b>: 1 → ${r['1x2'].quota_1.toFixed(2)} · X → ${r['1x2'].quota_x.toFixed(2)} · 2 → ${r['1x2'].quota_2.toFixed(2)}</p>`;
      el('#btn-pubblica-h2h').classList.remove('hidden');
    });
    el('#btn-pubblica-h2h').addEventListener('click', async () => {
      if (!ultimaAnteprima) return;
      const r = await post('/api/admin/crea-mercato-h2h', {
        admin_password: adminPassword(),
        squadra_a: ultimaAnteprima.squadra_a, squadra_b: ultimaAnteprima.squadra_b, giornata: ultimaAnteprima.giornata,
      });
      if (r.errore) { alert(r.errore); return; }
      alert('Mercato pubblicato.');
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
      const squadra = squadraAttuale();
      const importo = Number(el('#schedina-importo').value);
      const erroreEl = el('#schedina-errore');
      erroreEl.textContent = '';
      if (!squadra) { erroreEl.textContent = 'Scegli prima la tua squadra.'; return; }
      if (!carrelloSchedina.length) { erroreEl.textContent = 'Aggiungi almeno una selezione.'; return; }
      if (!importo || importo <= 0) { erroreEl.textContent = 'Indica quanti fantamilioni puntare.'; return; }
      const giornata = carrelloSchedina[0].giornata;
      const selezioni = carrelloSchedina.map(s => ({ mercato_id: s.mercato_id, esito: s.esito }));
      const r = await post('/api/schedina', { squadra, giornata, selezioni, importo });
      if (r.errore) { erroreEl.textContent = r.errore; return; }
      carrelloSchedina = [];
      el('#modal-schedina').classList.remove('open');
      el('#schedina-importo').value = '';
      await ricarica();
      alert(`Schedina giocata! Vincita potenziale: ${r.vincita_potenziale} FM.`);
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
    initSchedina();
    ricarica();
  });
})();
