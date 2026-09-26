// tests/date-italia.test.js — Le date che gli strumenti propongono e
// calcolano: "oggi" e' quello italiano (non la data UTC, che di notte e'
// ancora ieri) e aggiungere mesi non sconfina nel mese dopo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');
const FILE = ['js/ravvedimento.js', 'js/interessi-moratori.js', 'js/ricevuta-occasionale.js', 'js/fatturapa.js', 'js/hr-dimissioni.js'];

// Estrae una funzione dichiarata in cima a uno script del browser.
function funzione(sorgente, nome) {
  const i = sorgente.indexOf('function ' + nome + '(');
  assert.ok(i >= 0, nome + ' non trovata');
  let livello = 0, j = sorgente.indexOf('{', i);
  for (; j < sorgente.length; j++) {
    if (sorgente[j] === '{') livello++;
    else if (sorgente[j] === '}' && --livello === 0) break;
  }
  return sorgente.slice(i, j + 1);
}

test('nessuno strumento propone la data UTC come "oggi"', () => {
  for (const f of FILE) {
    const s = leggi(f);
    // la data UTC di adesso (quella costruita con Date.UTC va bene)
    assert.ok(!/(new Date\(\)|\btoday)\.toISOString\(\)/.test(s), f + ': toISOString per la data di oggi');
    assert.ok(!/valueAsDate\s*=\s*new Date\(\)/.test(s), f + ': valueAsDate usa la data UTC');
    assert.match(s, /oggiInItalia\(\)/, f);
  }
});

test('oggi in Italia: a mezzanotte e mezza del 26 e il 26, non il 25', () => {
  const codice = funzione(leggi('js/ravvedimento.js'), 'oggiInItalia');
  class Finto extends Date { constructor(...a) { super(...(a.length ? a : ['2026-09-25T22:30:00Z'])); } }
  const oggi = new Function('Date', codice + '; return oggiInItalia();')(Finto);
  assert.strictEqual(oggi, '2026-09-26');
  // d'inverno l'Italia e' a UTC+1
  class Inverno extends Date { constructor(...a) { super(...(a.length ? a : ['2026-01-31T23:15:00Z'])); } }
  assert.strictEqual(new Function('Date', codice + '; return oggiInItalia();')(Inverno), '2026-02-01');
});

test('preavviso di dimissioni: i mesi non sconfinano', () => {
  const aggiungiMesi = new Function(funzione(leggi('js/hr-dimissioni.js'), 'aggiungiMesi') + '; return aggiungiMesi;')();
  const g = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  assert.strictEqual(g(aggiungiMesi(new Date(2026, 0, 31), 1)), '2026-2-28');
  assert.strictEqual(g(aggiungiMesi(new Date(2028, 0, 31), 1)), '2028-2-29');
  assert.strictEqual(g(aggiungiMesi(new Date(2026, 7, 31), 1)), '2026-9-30');
  assert.strictEqual(g(aggiungiMesi(new Date(2026, 2, 15), 2)), '2026-5-15');
  assert.strictEqual(g(aggiungiMesi(new Date(2026, 10, 30), 3)), '2027-2-28');
  // decorrenza "dal 1 del mese dopo": niente setMonth sul 31
  assert.ok(!/setMonth\(dataInizioCalcolo\.getMonth\(\) \+ 1\)/.test(leggi('js/hr-dimissioni.js')));
});

// Ravvedimento per omesso o tardivo versamento: le percentuali delle tabelle
// dell'Agenzia delle Entrate, prima e dopo il 1° settembre 2024.
test('ravvedimento: misure nuove e precedenti al 1° settembre 2024', () => {
  const regole = JSON.parse(leggi('data/regole-fiscali-2026.json')).ravvedimento;
  const calcola = new Function('configRavv', funzione(leggi('js/ravvedimento.js'), 'calcolaSanzioneRidotta') + '; return calcolaSanzioneRidotta;')(regole);
  const pct = (g, scad) => Math.round(calcola(g, scad).aliquota * 10000) / 100;
  // dal 1° settembre 2024
  assert.deepStrictEqual([2, 20, 60, 200, 500].map((g) => pct(g, '2025-06-16')), [0.17, 1.25, 1.39, 3.13, 3.57]);
  assert.match(calcola(500, '2025-06-16').etichetta, /Oltre 1 anno/);
  // prima: 30% (15% entro 90 giorni), 1/7 fino a due anni e 1/6 oltre
  assert.deepStrictEqual([2, 20, 60, 200, 500, 800].map((g) => pct(g, '2024-06-17')), [0.2, 1.5, 1.67, 3.75, 4.29, 5]);
  assert.match(calcola(800, '2024-06-17').etichetta, /Oltre 2 anni, regole prima del 1° settembre 2024/);
  // il confine: la violazione e' il giorno dopo la scadenza
  assert.strictEqual(pct(20, '2024-08-31'), 1.25);
  assert.strictEqual(pct(20, '2024-08-30'), 1.5);
});
