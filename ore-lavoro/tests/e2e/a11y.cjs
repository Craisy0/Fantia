// Controllo di accessibilità con axe-core su ogni schermata e sul modulo del turno, in tema chiaro e scuro.
// I "da verificare" sui contrasti sono sfondi sfumati o sovrapposti che axe non sa calcolare: li copre `npm run contrast`.
// Uso: npm run a11y   (DETAIL=1 elenca anche i "da verificare")
const { chromium, devices } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const path = require('path');
const URL = process.env.URL || 'file://' + path.resolve(__dirname, '../../dist/prova.html');
(async () => {
  const b = await chromium.launch();
  const sample = { version: 1, settings: { rate: 10, currency: '€', monthlyTargetHours: 120, reminder: { enabled: true, time: '18:00', days: [1, 2, 3, 4, 5] } },
    shifts: [['2026-11-02', 8], ['2026-11-03', 6], ['2026-11-12', 10], ['2026-11-17', 5], ['2026-11-22', 4]].map(([d, h], i) => ({ id: 's' + i, start: `${d}T08:00`, end: `${d}T${String(8 + h).padStart(2, '0')}:00`, rate: 10, note: i === 2 ? 'cantiere' : '' })),
    payments: [{ id: 'p1', date: '2026-11-10', amount: 150, note: 'acconto' }] };
  let total = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], locale: 'it-IT', timezoneId: 'Europe/Rome', colorScheme: scheme });
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date('2026-11-17T20:00:00') });
    await p.addInitScript((j) => localStorage.setItem('ore-lavoro:v1', j), JSON.stringify(sample));
    await p.goto(URL); await p.waitForTimeout(1300);
    const run = async (label) => {
      const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const inc = r.incomplete.map((i) => `${i.id}(${i.nodes.length})`).join(', ');
      if (process.env.DETAIL) for (const i of r.incomplete) for (const n of i.nodes) console.log(`   ? ${i.id} ${n.target.join(' ')} :: ${(n.any[0] && n.any[0].message || '').slice(0, 150)}`);
      console.log(`[${scheme}] ${label}: ${r.violations.length} violazioni${inc ? ` | da verificare: ${inc}` : ''}`);
      for (const v of r.violations) { total += 1; console.log(`   ✗ ${v.id} [${v.impact}] ${v.help}`); for (const n of v.nodes.slice(0, 3)) console.log(`      ${n.target.join(' ')} :: ${(n.failureSummary || '').split('\n').slice(1, 3).join(' ').slice(0, 170)}`); }
    };
    await run('Oggi');
    for (const [tab, label] of [['calendario', 'Calendario'], ['riepilogo', 'Riepilogo'], ['impostazioni', 'Impostazioni']]) {
      await p.click(`[data-tab=${tab}]`); await p.waitForTimeout(1300); await run(label);
    }
    await p.click('[data-tab=oggi]'); await p.waitForTimeout(400);
    await p.click('[data-action=add-shift]'); await p.waitForTimeout(500); await run('Modulo turno');
    await p.click('[data-action=close-sheet]');
    await ctx.close();
  }
  await b.close();
  console.log(total ? `\nTOTALE: ${total} violazioni` : '\nNessuna violazione');
  process.exit(total ? 1 : 0);
})();
