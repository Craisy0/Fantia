// Controlla i contrasti dei colori in src/style.css, in tema chiaro e scuro.
// Testo: almeno 4,5:1. Elementi grafici (bordi dei campi, interruttori): almeno 3:1.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const block = (re) => Object.fromEntries([...css.match(re)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const light = block(/\n:root \{([\s\S]*?)\n\}/);
const dark = block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, pct) => a.map((v, i) => Math.round(v * pct + b[i] * (1 - pct)));

const pairs = [
  // [primo piano, sfondo, minimo, descrizione]
  ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text', 'surface-2', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'surface', 4.5], ['muted', 'surface-2', 4.5],
  ['on-accent', 'accent', 4.5], ['accent-ink', 'accent-soft', 4.5], ['accent-ink', 'surface', 4.5],
  ['on-hero', 'hero', 4.5], ['on-hero-muted', 'hero', 4.5],
  ['danger', 'surface', 4.5], ['danger', 'danger-soft', 4.5], ['danger', 'surface-2', 4.5], ['on-danger', 'danger', 4.5],
  ['ok', 'surface-2', 4.5], ['bg', 'text', 4.5],
  ['outline', 'surface', 3],  ['outline', 'surface-2', 3], ['accent', 'surface', 3], ['accent', 'surface-2', 3],
];
// Barre dei grafici: il tono dei giorni passati (--bar = accento 86% su surface-2) contro guida e scheda.
const bar = (t) => mix(rgb(t.accent), rgb(t["surface-2"]), 0.86);
const barChecks = [['line', 'guida delle barre'], ['surface', 'scheda']];
// Giorni del calendario: numero (text) e ore (text) sui quattro livelli di riempimento.
const levels = [14, 26, 40, 54];

let bad = 0;
for (const [name, t] of [['chiaro', light], ['scuro', dark]]) {
  for (const [fg, bg, min] of pairs) {
    const r = ratio(rgb(t[fg]), rgb(t[bg]));
    if (r < min) { bad += 1; console.log(`✗ ${name}: ${fg} su ${bg} = ${r.toFixed(2)} (minimo ${min})`); }
  }
  for (const [bgName, label] of barChecks) {
    const r = ratio(bar(t), rgb(t[bgName]));
    if (r < 3) { bad += 1; console.log(`✗ ${name}: barre su ${label} = ${r.toFixed(2)} (minimo 3)`); }
  }
  levels.forEach((p, i) => {
    const bg = mix(rgb(t.accent), rgb(t.surface), p / 100);
    // I festivi si segnano con un puntino rosso con anello `surface`, non con il colore del numero.
    for (const fg of ['text']) {
      const r = ratio(rgb(t[fg]), bg);
      if (r < 4.5) { bad += 1; console.log(`✗ ${name}: ${fg} su calendario livello ${i + 1} = ${r.toFixed(2)} (minimo 4.5)`); }
    }
  });
}
console.log(bad ? `${bad} coppie sotto la soglia` : 'Tutti i contrasti sono sufficienti');
process.exit(bad ? 1 : 0);
