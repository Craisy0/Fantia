// Genera src/tokens.css dalle scale di Radix Colors (MIT), mappate sui nomi che usa l'app.
// Radix: passo 1-2 sfondi, 3-5 componenti, 6-8 bordi, 9 colore pieno, 11 testo, 12 testo forte.
// Uso: npm run tokens   (poi npm run contrast per verificare i contrasti)
import * as R from '@radix-ui/colors';
import { writeFileSync } from 'node:fs';

const step = (scale, n) => Object.values(R[scale])[n - 1];
const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => `#${hex2(a).map((v, i) => Math.round(v * (1 - t) + hex2(b)[i] * t).toString(16).padStart(2, '0')).join('')}`;

const light = {
  bg: '#f3f4f8', surface: step('indigo', 1), 'surface-2': step('indigo', 3), // sfondo: grigio chiarissimo uniforme, come nei primi test
  line: step('indigo', 4), outline: step('slate', 10),
  text: step('indigo', 12), muted: mix(step('slate', 11), step('slate', 12), 0.2),
  accent: step('indigo', 9), 'on-accent': '#ffffff', 'accent-soft': step('indigo', 4), 'accent-ink': step('indigo', 11),
  mark: step('indigo', 9), bar: step('indigo', 9), 'bar-hi': mix(step('indigo', 9), step('indigo', 12), 0.62),
  'hero-a': step('indigo', 9), 'hero-b': mix(step('indigo', 9), step('indigo', 12), 0.4), 'hero-c': mix(step('indigo', 9), step('indigo', 12), 0.62),
  'on-hero': '#ffffff',
  money: mix(step('teal', 11), step('teal', 12), 0.3), 'money-soft': step('teal', 3), 'money-ink': step('teal', 12),
  danger: mix(step('tomato', 11), step('tomato', 12), 0.2), 'danger-soft': step('tomato', 3), 'danger-solid': step('tomato', 11), 'on-danger': '#ffffff',
  knob: '#ffffff',
};
const dark = {
  bg: step('indigoDark', 1), surface: mix(step('indigoDark', 2), step('indigoDark', 3), 0.55), 'surface-2': mix(step('indigoDark', 3), step('indigoDark', 4), 0.5),
  line: step('indigoDark', 4), outline: step('slateDark', 10),
  text: step('indigoDark', 12), muted: mix(step('slateDark', 11), step('slateDark', 12), 0.35),
  accent: step('indigoDark', 9), 'on-accent': '#ffffff', 'accent-soft': step('indigoDark', 5), 'accent-ink': step('indigoDark', 11),
  mark: step('indigoDark', 11), bar: step('indigoDark', 10), 'bar-hi': step('indigoDark', 11),
  'hero-a': step('indigo', 9), 'hero-b': mix(step('indigo', 9), step('indigo', 12), 0.45), 'hero-c': mix(step('indigo', 9), step('indigo', 12), 0.7),
  'on-hero': '#ffffff',
  money: step('tealDark', 11), 'money-soft': step('tealDark', 4), 'money-ink': step('tealDark', 12),
  danger: step('tomatoDark', 11), 'danger-soft': step('tomatoDark', 3), 'danger-solid': step('tomato', 11), 'on-danger': '#ffffff',
  knob: '#ffffff',
};
const block = (t, pad) => Object.entries(t).map(([k, v]) => `${pad}--${k}: ${v};`).join('\n');

writeFileSync(new URL('../src/tokens.css', import.meta.url), `/* GENERATO da scripts/make-tokens.mjs (Radix Colors, MIT). Non modificare a mano. */
:root {
${block(light, '  ')}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${block(dark, '    ')}
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
${block(dark, '  ')}
  color-scheme: dark;
}
`);
console.log('src/tokens.css scritto');
