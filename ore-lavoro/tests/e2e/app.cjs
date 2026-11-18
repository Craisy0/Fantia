// Prova nel browser con schermo da telefono: timbratura manuale, calendario, riepilogo, grafico, impostazioni,
// backup e ripristino, dati delle versioni precedenti. Gira in tema chiaro e scuro con l'orologio bloccato al 17/11/2026.
// Uso: npm run e2e   (richiede Chromium di Playwright: npx playwright install chromium)
const { chromium, devices } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = path.join(__dirname, 'out') + '/';
fs.mkdirSync(S, { recursive: true });
const URL = process.env.URL || 'file://' + path.resolve(__dirname, '../../dist/prova.html');

async function main(scheme) {
  const browser = await chromium.launch();
  const mk = async (init) => {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'it-IT', timezoneId: 'Europe/Rome', colorScheme: scheme });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
    await page.clock.install({ time: new Date('2026-11-17T08:00:00') });
    if (init) await page.addInitScript(init);
    await page.goto(URL);
    return page;
  };
  const page = await mk();
  const text = (sel) => page.locator(sel).innerText();
  const fill = (name, v) => page.fill(`dialog [name=${name}]`, v);

  // Oggi: niente cronometro, niente pause
  let body = await text('#view');
  assert.match(body, /Nessun turno oggi/);
  assert.equal(await page.locator('[data-action=clock-in],[data-action=pause-start]').count(), 0);

  // Oggi: un solo pulsante per aggiungere un turno (quello grande in alto)
  assert.equal(await page.locator('[data-action=add-shift]').count(), 1);
  assert.doesNotMatch(await text('.card >> nth=0'), /\+ Turno/);
  // Il font incluso nell'app è caricato davvero
  assert.equal(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px Inter'); }), true);

  // Turno manuale: niente tariffa, pausa o altro nel modulo
  await page.click('[data-action=add-shift] >> nth=0');
  assert.equal(await page.locator('dialog [name=rate], dialog [name=break]').count(), 0);
  await fill('start', '09:00'); await fill('end', '17:00');
  await page.click('dialog [type=submit]');
  body = await text('#view');
  assert.match(body, /8h 00m/); assert.match(body, /80,00/);
  await page.click('[data-action=add-shift] >> nth=0');
  await fill('start', '16:00'); await fill('end', '18:00');
  await page.click('dialog [type=submit]');
  assert.match(await text('dialog .error'), /sovrappone/);
  await fill('start', '22:00'); await fill('end', '02:00'); await fill('note', 'extra <b>bar</b>');
  await page.click('dialog [type=submit]');
  body = await text('#view');
  assert.match(body, /22:00 – 02:00/); assert.match(body, /extra <b>bar<\/b>/);
  assert.match(body, /12h 00m/); assert.match(body, /120,00/);   // 12 ore x 10 €, nessuna maggiorazione
  assert.doesNotMatch(body, /notte|straord|pausa|Entra|Esci|Assenza/i);
  assert.equal(await page.locator('[data-action=add-absence]').count(), 0);
  await page.screenshot({ path: S + '1-oggi.png', fullPage: true });

  // Modifica di un turno
  await page.click('.row >> nth=1');
  await fill('end', '01:00');
  await page.click('dialog [type=submit]');
  assert.match(await text('.row >> nth=1'), /3h 00m/);

  // Calendario: nessuna assenza, domeniche e festivi in rosso
  await page.click('[data-tab=calendario]');
  await page.click('[data-day="2026-11-17"]');
  body = await text('#view');
  assert.doesNotMatch(body, /Assenza|Ferie|Permesso|Malattia/);
  assert.equal(await page.locator('.cell .dot, .legend').count(), 0);
  await page.screenshot({ path: S + '3-calendario.png', fullPage: true });
  await page.click('[data-step="1"]');
  assert.match(await text('.month-nav h1'), /dicembre 2026/i);
  assert.equal(await page.locator('.cell.festive').count(), 7);
  await page.click('[data-step="-1"]');

  // Riepilogo
  await page.click('[data-tab=riepilogo]');
  await page.click('[data-action=add-payment]');
  await fill('amount', '100');
  await page.click('dialog [type=submit]');
  body = await text('#view');
  assert.match(body, /11h 00m/); assert.match(body, /110,00/); assert.match(body, /10,00/);  // 110 maturati, 100 ricevuti
  assert.doesNotMatch(body, /Assenze|Ferie|Malattia|Permessi|notturne|festive|Straordinari/);
  // Grafico mensile: toccando una colonna si legge il giorno
  assert.equal(await page.locator('.mcol').count(), 30);
  const cb0 = await page.locator('.mchart').boundingBox();
  const at = (n) => cb0.x + cb0.width * ((n - 0.5) / 30);
  await page.mouse.click(at(17), cb0.y + 60);
  assert.match(await text('.readout'), /mar 17 nov/i); assert.match(await text('.readout'), /11h 00m/);
  await page.mouse.click(at(18), cb0.y + 60);
  assert.match(await text('.readout'), /0h 00m/);
  // tastiera: il cursore si sposta con le frecce e annuncia il giorno
  await page.focus('.mchart'); await page.keyboard.press('ArrowRight');
  assert.match(await text('.readout'), /19 nov/i);
  assert.match(await page.getAttribute('.mchart', 'aria-valuetext'), /19 nov/i);
  assert.equal(await page.getAttribute('.mchart', 'aria-valuenow'), '19');
  await page.keyboard.press('Home');
  assert.match(await text('.readout'), /1 nov/i);
  // Scorrendo il dito (mouse premuto) sul grafico la lettura segue il giorno
  const cb = await page.locator('.mchart').boundingBox();
  await page.mouse.move(cb.x + cb.width * (16.5 / 30), cb.y + 60);
  await page.mouse.down();
  assert.match(await text('.readout'), /17 nov/i);
  await page.mouse.move(cb.x + cb.width * (11.5 / 30), cb.y + 60, { steps: 5 });
  assert.match(await text('.readout'), /12 nov/i);
  await page.mouse.up();
  assert.equal(await page.locator('.mcol.sel').count(), 1);
  await page.screenshot({ path: S + '5-riepilogo.png', fullPage: true });

  // Impostazioni: nella sezione Paga resta solo la tariffa oraria
  await page.click('[data-tab=impostazioni]');
  const paga = await page.locator('.card', { hasText: 'Paga' }).first().innerText();
  assert.match(paga, /Tariffa oraria/);
  assert.doesNotMatch(paga, /Maggiorazione|Domenica|Fascia|Straord/);
  assert.equal(await page.locator('[data-setting]').evaluateAll((els) => els.map((e) => e.dataset.setting).sort().join(',')),
    'monthlyTargetHours,rate,reminder.enabled,reminder.time');
  await page.fill('[data-setting=monthlyTargetHours]', '20'); await page.locator('[data-setting=monthlyTargetHours]').blur();
  await page.fill('[data-setting=rate]', '12.5'); await page.locator('[data-setting=rate]').blur();
  // Con turni già registrati a 10 €/h il cambio di tariffa chiede se ricalcolarli: qui si sceglie "solo i turni nuovi"
  assert.match(await text('#confirm'), /Applicare la nuova tariffa anche ai turni già registrati/);
  assert.match(await text('#confirm'), /da 10,00 € a 12,50 €/);
  await page.click('[data-answer=new]');
  await page.check('[data-setting="reminder.enabled"]');
  await page.click('[data-action=reminder-day][data-day="6"]');
  await page.screenshot({ path: S + '6-impostazioni.png', fullPage: true });
  // La tariffa nuova vale per i turni nuovi; quelli vecchi restano a 10 €/h
  await page.click('[data-tab=oggi]');
  await page.click('[data-action=add-shift] >> nth=0');
  await fill('day', '2026-11-18'); await fill('start', '08:00'); await fill('end', '10:00');
  await page.click('dialog [type=submit]');
  await page.click('[data-tab=riepilogo]');
  body = await text('#view');
  assert.match(body, /13h 00m/); assert.match(body, /135,00/);   // 110 + 2 ore x 12,5
  await page.click('[data-tab=calendario]');
  await page.click('[data-day="2026-11-18"]');
  await page.click('.row >> nth=0');
  await page.click('dialog [data-action=delete]'); await page.click('[data-answer=yes]');

  // Backup: esporta, cancella (annulla e conferma), ripristina, file non valido
  await page.click('[data-tab=impostazioni]');
  await page.click('[data-action=export]');
  const backup = await page.inputValue('#backup-text');
  assert.doesNotMatch(backup, /breakMin|overtime|longShift|pauseStart|absences|festivePct|nightPct|vacation/);
  await page.click('[data-box=close]');
  await page.click('[data-action=wipe]'); await page.click('[data-answer=no]');
  assert.match(await text('#view'), /2 turni e 1 pagamento/);
  await page.click('[data-action=wipe]'); await page.click('[data-answer=yes]');
  assert.match(await text('#view'), /0 turni e 0 pagamenti/);
  await page.click('[data-action=import]');
  await page.fill('#backup-text', backup);
  await page.click('[data-box=restore]'); await page.click('[data-answer=yes]');
  await page.waitForFunction(() => /2 turni e 1 pagamento/.test(document.body.innerText));
  assert.equal(await page.inputValue('[data-setting=rate]'), '12.5');
  await page.click('[data-action=import]');
  await page.fill('#backup-text', '{"a":1}');
  await page.click('[data-box=restore]');
  await page.waitForFunction(() => /non è un backup/.test(document.querySelector('#toast').innerText));

  // Eliminazione di un turno
  await page.click('[data-tab=calendario]');
  await page.click('[data-day="2026-11-17"]');
  await page.click('.row >> nth=1');
  await page.click('dialog [data-action=delete]'); await page.click('[data-answer=yes]');
  assert.equal(await page.locator('.row').count(), 1);
  assert.deepEqual(page.errors, []);

  // Cambio di tariffa: annulla / solo i nuovi / ricalcola i precedenti
  const simple = JSON.stringify({ version: 1, settings: { rate: 10, currency: '€', monthlyTargetHours: 0, reminder: { enabled: false, time: '18:00', days: [] } },
    shifts: [{ id: 'a', start: '2026-11-16T08:00', end: '2026-11-16T12:00', rate: 10, note: '' }, { id: 'b', start: '2026-11-17T08:00', end: '2026-11-17T12:00', rate: 10, note: '' }], payments: [] });
  const p3 = await mk(`if (!localStorage.getItem('ore-lavoro:v1')) localStorage.setItem('ore-lavoro:v1', ${JSON.stringify(simple)});`);
  const monthPay = async () => { await p3.click('[data-tab=riepilogo]'); return (await p3.innerText('.hero')).replace(/\s+/g, ' '); };
  const setRate = async (v) => { await p3.click('[data-tab=impostazioni]'); await p3.fill('[data-setting=rate]', v); await p3.locator('[data-setting=rate]').blur(); };
  assert.match(await monthPay(), /80,00/);                                   // 8 h x 10 €
  await setRate('15');
  assert.match(await p3.innerText('#confirm'), /2 turni hanno una tariffa diversa/);
  assert.match(await p3.innerText('#confirm'), /da 80,00 € a 120,00 €/);
  await p3.click('[data-answer=no]');                                          // annulla: il campo torna a 10
  assert.equal(await p3.inputValue('[data-setting=rate]'), '10');
  assert.match(await monthPay(), /80,00/);
  await setRate('15'); await p3.click('[data-answer=new]');                  // solo i nuovi: i vecchi restano a 10
  assert.equal(await p3.inputValue('[data-setting=rate]'), '15');
  assert.match(await monthPay(), /80,00/);
  await setRate('20');                                                         // ora i due turni sono ancora a 10
  assert.match(await p3.innerText('#confirm'), /da 80,00 € a 160,00 €/);
  await p3.click('[data-answer=all]');                                         // ricalcola tutti a 20 €/h
  assert.match(await p3.innerText('#toast'), /Tariffa applicata a 2 turni/);
  assert.match(await monthPay(), /160,00/);
  await p3.click('[data-tab=impostazioni]');                                   // stessa tariffa di nuovo: nessuna finestra
  await p3.fill('[data-setting=rate]', '20'); await p3.locator('[data-setting=rate]').blur();
  assert.equal(await p3.locator('#confirm[open]').count(), 0);
  assert.deepEqual(p3.errors, []);

  // Dati salvati dalle versioni precedenti: turno aperto scartato, assenze e campi vecchi ignorati
  const old = JSON.stringify({ version: 1,
    settings: { rate: 11, overtimePct: 25, festivePct: 30, nightPct: 15, vacationDaysPerYear: 20, longShiftHours: 10 },
    shifts: [
      { id: 'a', start: '2026-11-16T08:00', end: '2026-11-16T12:00', breakMin: 30, pauseStart: null, rate: 11, note: '' },
      { id: 'b', start: '2026-11-17T08:00', end: null, breakMin: 0, pauseStart: '2026-11-17T08:05', rate: 11, note: '' }],
    absences: [{ id: 'x', date: '2026-11-19', type: 'ferie', hours: 8, paid: true, rate: 11, note: '' }],
    payments: [] });
  const p2 = await mk(`if (!localStorage.getItem('ore-lavoro:v1')) localStorage.setItem('ore-lavoro:v1', ${JSON.stringify(old)});`);
  await p2.click('[data-tab=riepilogo]');
  const b2 = await p2.innerText('#view');
  assert.match(b2, /4h 00m/); assert.match(b2, /44,00/);           // 4 ore x 11 €, niente ferie pagate
  await p2.click('[data-tab=impostazioni]');
  assert.equal(await p2.inputValue('[data-setting=rate]'), '11');
  assert.match(await p2.innerText('#view'), /1 turno e 0 pagamenti/);
  assert.deepEqual(p2.errors, []);

  await browser.close();
  console.log(`E2E OK (${scheme})`);
}
(async () => { for (const scheme of ['light', 'dark']) await main(scheme); })()
  .catch((e) => { console.error('E2E FAIL', e.message); process.exit(1); });
