// tests/registro-atti.test.js — Le pagine dei modelli per registrare
// contratti e atti (RLI, 69, RAP), riscritte sulle istruzioni ufficiali, le
// schede dell'Agenzia e Normattiva (ottobre 2026). Ogni test ferma un errore
// che c'era nella versione precedente.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./helpers/contenuti.js');

const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const RLI = 'cittadino-tasse/modello-rli/index.html';

test('RLI: la guida ha le sezioni e il modello compilato', () => {
  const s = leggi(RLI);
  for (const id of ['chi-quando', 'quanto-si-paga', 'esempi', 'cedolare', 'campo-per-campo', 'adempimenti', 'ritardi', 'dal-2027']) {
    assert.ok(s.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(s, /src="\/assets\/esempi\/rli-cedolare-l1\.webp" width="1100" height="\d+"/);
});

test('RLI: L2 e cedolare al 10% solo nei comuni ad alta tensione abitativa', () => {
  const t = C.testoVisibile(leggi(RLI));
  // prima: «L2 - Locazione abitativa agevolata (3+2)» e «il 10% con il canone
  // concordato», senza la condizione del comune (L. 431/1998 art. 8;
  // D.Lgs. 23/2011 art. 3, c. 2; istruzioni RLI)
  assert.doesNotMatch(t, /agevolata \(3\+2\)|o il 10% con il canone concordato/);
  // ogni volta che si parla di L2 con il 70% o le agevolazioni, il comune ad
  // alta tensione abitativa compare li' accanto
  for (const m of t.matchAll(/\bL2\b/g)) {
    const pezzo = t.slice(Math.max(0, m.index - 120), m.index + 220);
    if (/70%|agevolazion/.test(pezzo)) assert.match(pezzo, /alta tensione abitativa/, pezzo);
  }
  assert.match(t, /10% per i contratti a canone concordato su abitazioni nei comuni con carenza di abitazioni/);
});

test('RLI: niente affermazioni senza fonte, e quelle corrette al loro posto', () => {
  const t = C.testoVisibile(leggi(RLI));
  // la detrazione per l'inquilino legata alla registrazione non era verificata
  assert.doesNotMatch(t, /non pu[oò] avere le detrazioni/);
  // l'agente immobiliare e' obbligato per i contratti mediati (TUR art. 10, d-bis)
  assert.match(t, /agente immobiliare per i contratti conclusi con la sua mediazione/);
  // la raccomandata non serve se la rinuncia e' gia' nel contratto (istruzioni RLI)
  assert.match(t, /La raccomandata non serve se la rinuncia è già scritta nel contratto/);
  // con la cedolare la risoluzione e' gratuita solo se tutti i locatori l'avevano
  assert.match(t, /se tutti i locatori l’avevano scelta/);
  // il termine: firma o decorrenza, se anteriore (scheda dell'Agenzia)
  assert.match(t, /30 giorni dalla firma, oppure dalla decorrenza del contratto se è anteriore/);
});

test('RLI: l\'esempio del terreno e quello del minimo tornano col motore', () => {
  const I = require('../js/rli-imposte.js');
  const R = JSON.parse(leggi('data/regole-fiscali-2026.json')).rli_parametri;
  assert.strictEqual(I.calcola({ canone: 42000, tipo: 'T1' }, R).registro, 210);    // FAQ dell'Agenzia, 7 × 6.000
  assert.strictEqual(I.calcola({ canone: 3000, tipo: 'L1' }, R).registro, 67);
  assert.strictEqual(I.calcola({ canone: 7200, tipo: 'L2', pagine: 4, copie: 2 }, R).registro, 100.8);
  const t = C.testoVisibile(leggi(RLI));
  assert.match(t, /0,50% di 42\.000 = 210 €/);
  assert.match(t, /7\.200 × 70% × 2% = 100,80 €/);
});
