// tests/donazioni.test.js — «Offrimi un caffè»: un link, mai uno script di terzi.
//
// Brian ha aperto la pagina di Buy Me a Coffee (verificata il 5/10/2026:
// risponde 200 con il suo nome). Il pulsante del loro sito carica codice di
// buymeacoffee.com a ogni visita e su telefono copre il contenuto: qui c'e'
// solo un link, nel piede di ogni pagina e dopo lo scaricamento di un modello.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../scripts/build-layout.js');

const RADICE = path.join(__dirname, '..');
const CAFFE = 'https://buymeacoffee.com/strumentiutili.it';

test('il link per il caffe\' e\' nel piede di ogni pagina, verso la pagina verificata', () => {
  const senza = L.pagineAttive().filter((p) => {
    const html = fs.readFileSync(p.assoluto, 'utf8');
    const piede = html.slice(html.indexOf('<footer'));
    return !piede.includes('<a href="' + CAFFE + '" target="_blank" rel="noopener" data-caffe');
  }).map((p) => p.rel);
  assert.deepStrictEqual(senza, []);
});

test('nessuna pagina carica script o iframe di Buy Me a Coffee', () => {
  const con = [];
  (function giro(dir) {
    for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'vendor', 'tests'].includes(v.name)) continue;
      const f = path.join(dir, v.name);
      if (v.isDirectory()) giro(f);
      else if (/\.(html|js)$/.test(v.name) && /<(script|iframe)[^>]+buymeacoffee|cdnjs\.buymeacoffee/i.test(fs.readFileSync(f, 'utf8'))) con.push(path.relative(RADICE, f));
    }
  })(RADICE);
  assert.deepStrictEqual(con, []);
});

test('i widget per gli altri siti non chiedono il caffe\'', () => {
  for (const w of ['stipendio-netto', 'bollo-auto']) {
    assert.ok(!fs.readFileSync(path.join(RADICE, 'widget', w, 'index.html'), 'utf8').includes('buymeacoffee'), w);
  }
});

test('dopo lo scaricamento di un modello, il compilatore riusa il link del piede', () => {
  const codice = fs.readFileSync(path.join(RADICE, 'js', 'compilatore-moduli.js'), 'utf8');
  assert.match(codice, /querySelector\('footer a\[data-caffe\]'\)/);
  assert.ok(!codice.includes('buymeacoffee'), 'l\'indirizzo sta in un posto solo: scripts/build-layout.js');
});

test('la privacy spiega il link del caffe\'', () => {
  assert.match(fs.readFileSync(path.join(RADICE, 'politica-sulla-privacy.html'), 'utf8'), /Offrimi un caffè<\/strong>» è un semplice link/);
});
