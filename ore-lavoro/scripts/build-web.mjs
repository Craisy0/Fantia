// Crea una pagina unica (dist/prova.html) con stile e codice incorporati,
// per provare l'app nel browser senza installare l'APK.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const assets = readdirSync('dist/assets');
const read = (re) => readFileSync(`dist/assets/${assets.find((f) => re.test(f))}`, 'utf8');
// Il font viene incorporato come data URI: la pagina unica non ha altri file.
const css = read(/^index-.*\.css$/).replace(/url\(([^)]*?\.woff2)\)/g, (_, path) => {
  const file = path.replace(/^["']|["']$/g, '').replace(/^\.?\//, '').replace(/^assets\//, '');
  return `url(data:font/woff2;base64,${readFileSync(`dist/assets/${file}`).toString('base64')})`;
});
const js = read(/^index-.*\.js$/).replaceAll('</script', '<\\/script');
const body = readFileSync('index.html', 'utf8').match(/<body>([\s\S]*?)<script/)[1].trim();

writeFileSync('dist/prova.html', `<title>Ore Lavoro</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}
/* La pagina ospite aggiunge già il margine superiore di sicurezza. */
:root { --top: 0px; }</style>
${body}
<script type="module">${js}</script>
`);
console.log('dist/prova.html pronto');
