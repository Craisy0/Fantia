// Genera src/ui/icons.js con le icone Lucide (ISC) che usa l'app: solo i tracciati, niente libreria a runtime.
// Uso: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';

const names = ['clock', 'calendar-days', 'chart-column', 'sliders-horizontal', 'euro', 'wallet', 'target', 'calendar-check',
  'gauge', 'plus', 'chevron-left', 'chevron-right', 'trending-up', 'banknote'];
const body = (n) => readFileSync(new URL(`../node_modules/lucide-static/icons/${n}.svg`, import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?>/, '').replace(/<\/svg>/, '').replace(/\s*\n\s*/g, '').trim();

const out = names.map((n) => `  '${n}': '${body(n)}',`).join('\n');
writeFileSync(new URL('../src/ui/icons.js', import.meta.url), `// GENERATO da scripts/make-icons.mjs (Lucide, licenza ISC). Non modificare a mano.
export const ICONS = {
${out}
};

/** Icona SVG in linea: eredita il colore del testo. */
export const icon = (name, size = 24, extra = '') => \`<svg viewBox="0 0 24 24" width="\${size}" height="\${size}" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" \${extra}>\${ICONS[name]}</svg>\`;
`);
console.log('src/ui/icons.js scritto');
