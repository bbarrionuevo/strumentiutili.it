// tests/indicizzazione.test.js — Quali pagine vanno su Google e quali no.
//
// Il 5/10/2026 Search Console teneva nell'indice 4 pagine su 127: dopo il
// trasloco di settembre Google non si fida del sito e ne prende poche. Le
// pagine fuori dal tema (fisco, lavoro, documenti, PDF, burocrazia) lo
// confondono: giochi, musica, calorie, il santo del giorno. Restano online
// per chi le usa e nella ricerca del sito, ma con noindex, fuori dal sitemap
// e senza annunci (regola della revisione AdSense: niente annunci su pagine
// noindex, vedi tests/layout.test.js). Mai cambiare indirizzo: nessun 301.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const leggi = (...p) => fs.readFileSync(path.join(RADICE, ...p), 'utf8');

const FUORI_TEMA = [
  '/utilita-web/sudoku-del-giorno/',
  '/utilita-web/parola-del-giorno/',
  '/utilita-web/accordatore/',
  '/utilita-web/metronomo/',
  '/utilita-web/calcolo-bmr/',
  '/utilita-web/santo-del-giorno/'
];

test('le pagine fuori tema: noindex con i link seguiti, fuori dal sitemap, senza annunci', () => {
  const sitemap = leggi('sitemap.xml');
  for (const u of FUORI_TEMA) {
    const html = leggi(u.slice(1), 'index.html');
    assert.match(html, /<meta name="robots" content="noindex, follow" \/>/, u);
    assert.ok(!sitemap.includes('<loc>https://strumentiutili.it' + u + '</loc>'), u + ' e\' ancora nel sitemap');
    assert.ok(!html.includes('class="su-ad '), u + ' ha ancora un riquadro pubblicitario');
    // il canonical resta quello della pagina: non si manda Google altrove
    assert.match(html, new RegExp('<link rel="canonical" href="https://strumentiutili\\.it' + u.replace(/\//g, '\\/') + '"'), u);
  }
});

test('le pagine fuori tema restano raggiungibili: ricerca del sito e categoria', () => {
  const indice = leggi('data', 'strumenti.json');
  const categoria = leggi('utilita-web', 'index.html');
  for (const u of FUORI_TEMA) {
    assert.ok(indice.includes('"' + u + '"'), u + ' non si trova piu\' con la ricerca del sito');
    assert.ok(categoria.includes('href="' + u + '"'), u + ' non e\' piu\' nella categoria');
  }
});

test('nessun\'altra pagina del sitemap ha noindex', () => {
  const sitemap = leggi('sitemap.xml');
  const pagine = [...sitemap.matchAll(/<loc>https:\/\/strumentiutili\.it([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(pagine.length > 100);
  const conNoindex = pagine.filter((u) => {
    const f = u === '/' ? 'index.html' : path.join(u.slice(1), u.endsWith('/') ? 'index.html' : '');
    try { return /<meta name="robots" content="[^"]*noindex/.test(leggi(f)); } catch (e) { return false; }
  });
  assert.deepStrictEqual(conNoindex, []);
});
