// Controlla i contrasti dei colori in src/tokens.css, in tema chiaro e scuro.
// Testo: almeno 4,5:1. Elementi grafici (bordi dei campi, barre, anello, interruttori): almeno 3:1.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
const block = (re) => Object.fromEntries([...css.match(re)[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const light = block(/\n:root \{([\s\S]*?)\n\}/);
const dark = block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, pct) => a.map((v, i) => Math.round(v * pct + b[i] * (1 - pct))); // pct di `a` su `b`

let bad = 0;
const fail = (name, msg) => { bad += 1; console.log(`✗ ${name}: ${msg}`); };

for (const [name, t] of [['chiaro', light], ['scuro', dark]]) {
  const c = (k) => rgb(t[k]);
  const check = (label, fg, bg, min) => { const r = ratio(fg, bg); if (r < min) fail(name, `${label} = ${r.toFixed(2)} (minimo ${min})`); };
  const white = [255, 255, 255];

  // Testo su superfici
  for (const bg of ['bg', 'surface', 'surface-2']) {
    check(`text su ${bg}`, c('text'), c(bg), 4.5);
    check(`muted su ${bg}`, c('muted'), c(bg), 4.5);
  }
  // Il titolo sta sullo sfondo con l'alone indaco (caso peggiore: alone al 58%)
  check('text sull\'alone indaco', c('text'), mix(c('glow-1'), c('bg'), 0.58), 4.5);
  check('muted sull\'alone indaco', c('muted'), mix(c('glow-1'), c('bg'), 0.58), 4.5);
  check('text sull\'alone verde acqua', c('text'), mix(c('glow-2'), c('bg'), 0.46), 4.5);
  check('toast (bg su text)', c('bg'), c('text'), 4.5);
  // Accento
  check('on-accent su accent', white, c('accent'), 4.5);
  check('accent-ink su accent-soft', c('accent-ink'), c('accent-soft'), 4.5);
  check('accent-ink su surface', c('accent-ink'), c('surface'), 4.5);
  check('accent-ink su surface-2', c('accent-ink'), c('surface-2'), 4.5);
  // Scheda principale (testo bianco, caso peggiore: stop più chiaro del gradiente)
  for (const stop of ['hero-a', 'hero-b', 'hero-c']) check(`bianco su ${stop}`, white, c(stop), 4.5);
  check('testo attenuato (92% bianco) su hero-a', mix(white, c('hero-a'), 0.92), c('hero-a'), 4.5);
  check('pulsante chiaro: hero-c su bianco', c('hero-c'), white, 4.5);
  // Verde acqua (paga) e pericolo
  check('money su surface', c('money'), c('surface'), 4.5);
  check('money su surface-2', c('money'), c('surface-2'), 4.5);
  check('money-ink su money-soft', c('money-ink'), c('money-soft'), 4.5);
  check('danger su surface', c('danger'), c('surface'), 4.5);
  check('danger su surface-2', c('danger'), c('surface-2'), 4.5);
  check('danger su danger-soft', c('danger'), c('danger-soft'), 4.5);
  check('on-danger su danger-solid', c('on-danger'), c('danger-solid'), 4.5);
  // Elementi grafici: 3:1
  for (const bg of ['surface', 'surface-2']) check(`outline su ${bg}`, c('outline'), c(bg), 3);
  for (const bg of ['surface', 'surface-2', 'line']) check(`mark su ${bg}`, c('mark'), c(bg), 3);
  check('accent su surface', c('accent'), c('surface'), 3);
  for (const k of ['bar', 'bar-hi']) {
    check(`${k} su guida`, c(k), c('line'), 3);
    check(`${k} su scheda`, c(k), c('surface'), 3);
  }
  check('mark su guida (anello)', c('mark'), c('line'), 3);
  check('icona money su money-soft', c('money-ink'), c('money-soft'), 3);
  // Giorni del calendario: numero e ore sui quattro livelli di riempimento (il rosso non si usa sul numero)
  [14, 26, 40, 54].forEach((p, i) => check(`text su calendario livello ${i + 1}`, c('text'), mix(c('accent'), c('surface'), p / 100), 4.5));
  check('puntino festivo su surface (anello)', c('danger'), c('surface'), 3);
}
console.log(bad ? `${bad} coppie sotto la soglia` : 'Tutti i contrasti sono sufficienti');
process.exit(bad ? 1 : 0);
