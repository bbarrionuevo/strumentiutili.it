// tests/etichette.test.js — Ogni campo di un modulo ha un nome leggibile.
//
// Chi usa un lettore di schermo sente il nome del campo, non il testo che gli
// sta accanto: un <input> senza etichetta diventa "campo di testo, vuoto".
// Vale per le pagine pubblicate e per i campi che il JavaScript crea dopo
// (righe della fattura, immobili del modello RLI, veicoli del bollo...).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { RADICE, tutteLePagine } = require('./helpers/contenuti.js');

const CAMPO = /<(input|select|textarea)\b([^>]*)>/g;
const SENZA_ETICHETTA = /type=["'](hidden|submit|button|reset|image)["']/;
const CON_NOME = /aria-label=|aria-labelledby=|title=/;

// Gli intervalli di testo che stanno dentro un <label>…</label>: un campo li'
// dentro prende il nome dall'etichetta che lo avvolge.
function dentroEtichette(testo) {
  return [...testo.matchAll(/<label\b[\s\S]*?<\/label>/g)].map((m) => [m.index, m.index + m[0].length]);
}

// Cerca i campi senza nome. `id` e `for` si confrontano come testo grezzo,
// cosi' funziona anche con i modelli JS ('id="' + id + '-kw"').
function campiSenzaNome(testo) {
  const perFor = new Set([...testo.matchAll(/\sfor=(["'])(.*?)\1/g)].map((m) => m[2]));
  const dentro = dentroEtichette(testo);
  const fuori = [];
  for (const m of testo.matchAll(CAMPO)) {
    const attributi = m[2];
    if (SENZA_ETICHETTA.test(attributi)) continue;
    // un <input type="file"> nascosto si apre da un pulsante con il suo nome
    if (/type=["']file["']/.test(attributi) && /\shidden(\s|>|=|$)|class=["'][^"']*\b(hidden|sr-only)\b/.test(attributi)) continue;
    if (CON_NOME.test(attributi)) continue;
    const id = (attributi.match(/\sid=(["'])(.*?)\1/) || [])[2];
    if (id && perFor.has(id)) continue;
    if (dentro.some(([inizio, fine]) => m.index > inizio && m.index < fine)) continue;
    fuori.push(m[1] + (id ? '#' + id : ''));
  }
  return fuori;
}

test('nelle pagine pubblicate ogni campo ha un’etichetta', () => {
  const errori = [];
  for (const p of tutteLePagine()) {
    const mancanti = campiSenzaNome(p.html);
    if (mancanti.length) errori.push(p.percorso + ': ' + mancanti.join(', '));
  }
  assert.deepStrictEqual(errori, [], 'campi senza etichetta:\n' + errori.join('\n'));
});

test('anche i campi creati dal JavaScript hanno un nome', () => {
  const cartella = path.join(RADICE, 'js');
  const errori = [];
  for (const nome of fs.readdirSync(cartella).filter((f) => f.endsWith('.js')).sort()) {
    // i commenti descrivono i campi ("<select> Tipo Documento"): non contano
    const codice = fs.readFileSync(path.join(cartella, nome), 'utf8')
      .split('\n').filter((riga) => !/^\s*(\/\/|\*)/.test(riga)).join('\n');
    const mancanti = campiSenzaNome(codice);
    if (mancanti.length) errori.push('js/' + nome + ': ' + mancanti.join(', '));
  }
  assert.deepStrictEqual(errori, [], 'campi senza nome nei modelli JS:\n' + errori.join('\n'));
});

test('il controllo riconosce davvero un campo senza etichetta', () => {
  assert.deepStrictEqual(campiSenzaNome('<input type="text" id="a">'), ['input#a']);
  assert.deepStrictEqual(campiSenzaNome('<label for="a">A</label><input id="a">'), []);
  assert.deepStrictEqual(campiSenzaNome('<label>A <select></select></label>'), []);
  assert.deepStrictEqual(campiSenzaNome('<textarea aria-label="Testo"></textarea>'), []);
  assert.deepStrictEqual(campiSenzaNome('<input type="file" class="hidden">'), []);
});
