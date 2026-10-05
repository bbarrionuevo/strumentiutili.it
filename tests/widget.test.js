// tests/widget.test.js — I calcolatori da mettere sui siti degli altri.
//
// Una pagina /widget/ sta dentro un <iframe> su un blog o un forum. Il link
// a StrumentiUtili.it nel codice da incollare sta FUORI dall'iframe: e' quello
// che porta lettori e che Google conta. Dentro: niente annunci (AdSense non
// li vuole nei siti degli altri), niente cookie, noindex.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const leggi = (...p) => fs.readFileSync(path.join(RADICE, ...p), 'utf8');

const WIDGET = [
  { nome: 'stipendio-netto', strumento: '/lavoro-contratti/stipendio-netto/', calcolo: 'stipendio', script: ['/js/irpef.js', '/js/stipendio-netto.js'] },
  { nome: 'bollo-auto', strumento: '/cittadino-tasse/calcolo-bollo-auto/', calcolo: 'bollo', script: ['/js/bollo-calcolo.js'] }
];

test('pagine widget: noindex, niente annunci ne\' consenso, fuori dal sitemap', () => {
  const sitemap = leggi('sitemap.xml');
  for (const w of WIDGET) {
    const html = leggi('widget', w.nome, 'index.html');
    assert.match(html, /<meta name="robots" content="noindex, follow" \/>/, w.nome);
    assert.ok(!/adsbygoogle|googlesyndication|su-ad|pubblicita\.js|fundingchoices/.test(html), w.nome + ': annunci dentro il widget');
    assert.ok(!sitemap.includes('/widget/'), 'i widget non vanno nel sitemap');
  }
});

test('pagine widget: stesso motore della pagina completa e firma verso lo strumento', () => {
  const ui = leggi('js', 'widget.js');
  for (const w of WIDGET) {
    const html = leggi('widget', w.nome, 'index.html');
    assert.match(html, new RegExp('<form data-widget="' + w.calcolo + '"'), w.nome);
    assert.ok(ui.includes(w.calcolo + ': '), 'js/widget.js non sa calcolare ' + w.calcolo);
    for (const s of ['/js/data-loader.js', ...w.script, '/js/widget.js']) assert.ok(html.includes('<script src="' + s + '"></script>'), w.nome + ': manca ' + s);
    // il link apre lo strumento completo in una scheda nuova, non dentro l'iframe
    assert.match(html, new RegExp('<a href="https://strumentiutili\\.it' + w.strumento.replace(/\//g, '\\/') + '" target="_blank" rel="noopener">'), w.nome);
    // ogni campo ha la sua etichetta
    const campi = [...html.matchAll(/<(?:input|select)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(campi.length >= 2);
    for (const id of campi) assert.ok(html.includes('<label for="' + id + '"'), w.nome + ': ' + id + ' senza etichetta');
  }
});

test('codice da incollare: iframe del widget e link allo strumento fuori dall\'iframe', () => {
  for (const w of WIDGET) {
    const pagina = leggi(w.strumento.slice(1), 'index.html');
    const m = pagina.match(/<textarea id="incorpora-codice"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(m, w.strumento + ': manca il codice da incollare');
    const codice = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    assert.match(codice, new RegExp('<iframe src="https://strumentiutili\\.it/widget/' + w.nome + '/" title="[^"]+"'));
    const dopo = codice.slice(codice.indexOf('</iframe>'));
    assert.ok(dopo.includes('<a href="https://strumentiutili.it' + w.strumento + '">'), w.strumento + ': il link deve stare fuori dall\'iframe');
    assert.match(pagina, /data-copia="incorpora-codice"/);
  }
});

test('nessuna intestazione impedisce di mettere i widget in un iframe', () => {
  const vercel = JSON.parse(leggi('vercel.json'));
  const intestazioni = JSON.stringify(vercel.headers || []);
  assert.ok(!/X-Frame-Options|frame-ancestors/i.test(intestazioni), 'X-Frame-Options o frame-ancestors bloccherebbero i widget');
});
