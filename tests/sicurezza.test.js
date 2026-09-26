// tests/sicurezza.test.js — Controlli contro le falle trovate nella revisione
// del 25 settembre 2026: testo dei file caricati finito nell'HTML senza
// essere "disinnescato" e pdf.js senza la protezione per il CVE-2024-4367.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');

function* fileJs(dir) {
  for (const voce of fs.readdirSync(path.join(RADICE, dir), { withFileTypes: true })) {
    const rel = path.join(dir, voce.name);
    if (voce.isDirectory()) yield* fileJs(rel);
    else if (voce.name.endsWith('.js')) yield rel;
  }
}

// pdf.js 3.x esegue codice JavaScript costruito dai font di un PDF se non gli
// si dice di non farlo: un PDF preparato apposta poteva eseguire script nella
// pagina (CVE-2024-4367). Ogni apertura di PDF deve spegnere quella strada.
test('ogni getDocument di pdf.js ha isEvalSupported: false', () => {
  const problemi = [];
  let trovati = 0;
  for (const f of fileJs('js')) {
    const testo = leggi(f);
    for (const m of testo.matchAll(/getDocument\(\{[^{}]*\}\)/g)) {
      trovati++;
      if (!/isEvalSupported:\s*false/.test(m[0])) problemi.push(f + ': ' + m[0]);
    }
    // anche le chiamate scritte in un altro modo (con una variabile)
    for (const m of testo.matchAll(/getDocument\((?!\{)[^)]*\)/g)) problemi.push(f + ': chiamata senza opzioni esplicite ' + m[0]);
  }
  assert.ok(trovati >= 17, 'trovate solo ' + trovati + ' chiamate: il test non sta guardando');
  assert.deepStrictEqual(problemi, []);
});

// La fattura elettronica arriva da chi l'ha emessa: un campo come
// <Descrizione>&lt;img src=x onerror=...&gt;</Descrizione> non deve diventare HTML.
test('il visualizzatore della fattura passa ogni campo da esc() prima dell HTML', () => {
  const codice = leggi('js/fattura.js');
  assert.match(codice, /function esc\(/);
  const sospetti = [];
  for (const m of codice.matchAll(/\$\{([^{}`]*)\}/g)) {
    const espr = m[1].trim();
    if (/^(esc|money)\(/.test(espr)) continue;
    if (/^(righeHtml|riepilogoHtml|pagamentiHtml|indirizzo|cap|comune|prov|nazione)$/.test(espr)) continue;
    sospetti.push(espr);
  }
  // le condizioni ammesse contengono a loro volta esc()
  const nonProtetti = sospetti.filter((s) => !/esc\(/.test(s));
  assert.deepStrictEqual(nonProtetti, []);
});

test('nomi di file e di prodotti entrano nella pagina solo come testo', () => {
  assert.ok(!/innerHTML\s*=\s*`[^`]*\$\{f\.name\}/.test(leggi('js/convertitore-immagini.js')));
  const prezzo = leggi('js/prezzo-unitario.js');
  for (const m of prezzo.matchAll(/innerHTML\s*=\s*`([^`]*)`/g)) {
    assert.ok(!/\$\{(migliore|peggiore|r)\.nome\}/.test(m[1]), m[1]);
  }
});
