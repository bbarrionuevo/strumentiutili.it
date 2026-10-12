// tests/compilatori-prerender.test.js — Il primo passo dei compilatori e' gia'
// nell'HTML (scripts/prerendi-compilatori.js). Prima il pannello restava vuoto
// finche' lo script non scaricava lo schema, poi cresceva di colpo e la pagina
// sotto scendeva: CLS 0,42 sul telefono nella misura della domenica sull'F24
// Elide (ottobre 2026). Se uno schema cambia e la pagina non viene riscritta,
// il passo scritto non corrisponde piu' a quello che disegna lo script.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../scripts/prerendi-compilatori.js');

const RADICE = path.join(__dirname, '..');
const compilatori = () => P.pagine()
  .map((f) => ({ f: path.relative(RADICE, f), html: fs.readFileSync(f, 'utf8') }))
  .filter((p) => p.html.includes('id="mp-app"'));

test('compilatori: il primo passo scritto nella pagina e\' quello dello schema di oggi', () => {
  const pagine = compilatori();
  assert.ok(pagine.length >= 15, 'trovate solo ' + pagine.length + ' pagine con un compilatore');
  const indietro = pagine.filter((p) => P.trasforma(p.html) !== p.html).map((p) => p.f);
  assert.deepStrictEqual(indietro, [], 'Esegui: node scripts/prerendi-compilatori.js');
});

test('compilatori: il pannello non parte vuoto', () => {
  for (const p of compilatori()) {
    const schema = JSON.parse(fs.readFileSync(path.join(RADICE, p.html.match(/data-schema="\/([^"]+)"/)[1]), 'utf8'));
    // senza data-modello (modelli di partita IVA) il compilatore parte dal primo
    const scelto = p.html.match(/<section id="mp-app"[^>]*data-modello="([^"]+)"/);
    const modello = scelto ? scelto[1] : Object.keys(schema.modelli)[0];
    const passi = schema.modelli[modello].passi;
    const corpo = p.html.match(/<div id="mp-corpo">([\s\S]*?)<\/div>\s*<div id="mp-nav"/)[1];
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    assert.ok(corpo.includes('<h2 class="mp-titolo">' + esc(passi[0].titolo) + '</h2>'), p.f + ': manca il primo passo');
    assert.ok(/data-campo="/.test(corpo), p.f + ': il primo passo non ha campi');
    assert.match(p.html, new RegExp('<span class="mp-conta">Passo 1 di ' + passi.length + '</span>'), p.f);
    const elenco = p.html.match(/<nav\b[^>]*id="mp-passi"[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.strictEqual((elenco.match(/data-vai="/g) || []).length, passi.length, p.f + ': elenco dei passi');
  }
});

test('compilatori: quello che si scrive prima che arrivi lo script non si perde', () => {
  const js = fs.readFileSync(path.join(RADICE, 'js', 'compilatore-moduli.js'), 'utf8');
  const avvio = js.slice(js.indexOf("document.addEventListener('DOMContentLoaded'"));
  // i campi gia' scritti si leggono prima di ridisegnare, e il cursore resta dov'era
  assert.ok(avvio.indexOf('tieniScrittiPrima();') > 0);
  assert.ok(avvio.indexOf('tieniScrittiPrima();') < avvio.indexOf('renderMantenendoFuoco();'));
  assert.doesNotMatch(avvio, /\n\s*render\(\);/);
  // il passo scritto c'e' subito: le prove e il generatore delle immagini
  // aspettano il segnale che il compilatore e' partito
  assert.ok(avvio.indexOf("app.dataset.pronto = '1';") > avvio.indexOf('renderMantenendoFuoco();'));
  const pilotati = fs.readdirSync(path.join(RADICE, 'scripts')).filter((f) => /^(prova-.*|genera-esempi-moduli)\.py$/.test(f));
  for (const f of pilotati) {
    const codice = fs.readFileSync(path.join(RADICE, 'scripts', f), 'utf8');
    if (codice.includes('#mp-corpo .mp-titolo')) assert.match(codice, /#mp-app\[data-pronto\] #mp-corpo \.mp-titolo/, f);
  }
});
