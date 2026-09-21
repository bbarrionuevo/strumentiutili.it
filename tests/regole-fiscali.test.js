// tests/regole-fiscali.test.js — Integrità di data/regole-fiscali-2026.json.
// È la fonte di verità di tutte le calcolatrici: se si rompe qui, si rompe
// ovunque. Questi test non congelano valori, controllano la forma dei dati.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { caricaScript, regoleFiscali, RADICE } = require('./helpers/carica-script.js');

const { window } = caricaScript(['js/irpef.js']);
const IRPEF = window.StrumentiIrpef;
const regole = regoleFiscali();

test('il file e JSON valido con i metadati attesi', () => {
  assert.strictEqual(typeof regole.meta, 'object');
  assert.strictEqual(regole.meta.anno, 2026);
  assert.match(String(regole.meta.versione), /^\d+\.\d+\.\d+$/);
});

test('gli scaglioni IRPEF sono coerenti', () => {
  const scaglioni = regole.irpef.scaglioni;
  assert.ok(Array.isArray(scaglioni) && scaglioni.length >= 2, 'servono almeno due scaglioni');

  // limiti crescenti, ultimo aperto
  let precedente = 0;
  scaglioni.forEach((s, i) => {
    const ultimo = i === scaglioni.length - 1;
    if (ultimo) {
      assert.strictEqual(s.limite, null, 'l ultimo scaglione deve avere limite null');
    } else {
      assert.ok(typeof s.limite === 'number' && s.limite > precedente,
        `limite non crescente nello scaglione ${i}`);
      precedente = s.limite;
    }
    assert.ok(s.aliquota > 0 && s.aliquota < 1, `aliquota fuori scala nello scaglione ${i}`);
  });

  // aliquote progressive
  for (let i = 1; i < scaglioni.length; i++) {
    assert.ok(scaglioni[i].aliquota >= scaglioni[i - 1].aliquota,
      `l aliquota cala nello scaglione ${i}: non sarebbe progressiva`);
  }
});

test('il campo base di ogni scaglione e coerente con il calcolo progressivo', () => {
  // Array.from: il risultato nasce nel contesto vm, quindi ha un altro
  // Array.prototype e deepStrictEqual lo rifiuterebbe anche se vuoto.
  const incoerenze = Array.from(IRPEF.verificaBasiScaglioni(regole.irpef));
  assert.strictEqual(incoerenze.length, 0,
    'aggiornate le aliquote senza aggiornare le basi: ' + JSON.stringify(incoerenze));
});

test('le aliquote locali medie sono plausibili', () => {
  const locali = regole.irpef.aliquoteMedieLocali;
  assert.ok(locali.regionale > 0 && locali.regionale < 0.05, 'addizionale regionale fuori scala');
  assert.ok(locali.comunale >= 0 && locali.comunale < 0.02, 'addizionale comunale fuori scala');
});

test('le tariffe del bollo auto presenti sono numericamente valide', () => {
  const regioni = regole.bollo_auto_2026.regioni;
  const nomi = Object.keys(regioni);
  assert.ok(nomi.includes('nazionale'), 'manca la tariffa nazionale di ripiego');
  for (const nome of nomi) {
    const classi = regioni[nome].classi_euro;
    assert.ok(classi && Object.keys(classi).length > 0, `nessuna classe euro per ${nome}`);
    for (const [classe, tariffe] of Object.entries(classi)) {
      assert.ok(Number.isFinite(tariffe.tariffa_base) && tariffe.tariffa_base > 0,
        `tariffa_base non valida in ${nome}/${classe}`);
      assert.ok(Number.isFinite(tariffe.tariffa_eccedente) && tariffe.tariffa_eccedente > 0,
        `tariffa_eccedente non valida in ${nome}/${classe}`);
      assert.ok(tariffe.tariffa_eccedente >= tariffe.tariffa_base,
        `in ${nome}/${classe} la tariffa oltre i 100 kW e piu bassa di quella base`);
    }
  }
});

test('i parametri TFR sono presenti e sensati', () => {
  assert.ok(regole.tfr.divisoreFisso > 13 && regole.tfr.divisoreFisso < 14,
    'il divisore del TFR deve essere circa 13,5');
  assert.ok(regole.tfr.rivalsaInps >= 0 && regole.tfr.rivalsaInps < 0.05);
});

test('nessun valore numerico e NaN o Infinity in tutto il file', () => {
  const problemi = [];
  (function scorri(nodo, percorso) {
    if (typeof nodo === 'number') {
      if (!Number.isFinite(nodo)) problemi.push(percorso);
    } else if (nodo && typeof nodo === 'object') {
      for (const [chiave, valore] of Object.entries(nodo)) {
        scorri(valore, percorso ? `${percorso}.${chiave}` : chiave);
      }
    }
  })(regole, '');
  assert.deepStrictEqual(problemi, []);
});

// PROBLEMA NOTO, non ancora risolto: esistono 20 pagine regionali ma solo 3
// regioni hanno tariffe proprie nel JSON (campania, lazio, toscana). Le altre
// 17 ricadono sulla tariffa nazionale in js/bollo-auto.js:42, pur promettendo
// nel titolo e nell H1 un calcolo regionale. Il test resta come promemoria:
// segnala a ogni esecuzione senza bloccare la suite.
test('ogni pagina regionale del bollo auto ha tariffe proprie', { todo: 'mancano le tariffe di 17 regioni su 20' }, () => {
  const regioni = Object.keys(regole.bollo_auto_2026.regioni);
  const cartelle = fs.readdirSync(path.join(RADICE, 'cittadino-tasse'))
    .filter((n) => n.startsWith('calcolo-bollo-auto-'))
    .map((n) => n.replace('calcolo-bollo-auto-', ''));

  const senzaTariffe = cartelle.filter((slug) => !regioni.includes(slug));
  assert.deepStrictEqual(senzaTariffe, [],
    'pagine regionali che calcolano in realta la tariffa nazionale: ' + senzaTariffe.join(', '));
});

// Questo invece deve valere sempre: ogni pagina generata deve almeno comparire
// nell elenco regioniSEO, altrimenti e una pagina orfana anche nei dati.
test('ogni pagina regionale corrisponde a una voce di regioniSEO', () => {
  const slugSEO = Object.values(regole.bollo_auto_2026.regioniSEO).map((r) => r.slug);
  const cartelle = fs.readdirSync(path.join(RADICE, 'cittadino-tasse'))
    .filter((n) => n.startsWith('calcolo-bollo-auto-'))
    .map((n) => n.replace('calcolo-bollo-auto-', ''));
  const sconosciute = cartelle.filter((slug) => !slugSEO.includes(slug));
  assert.deepStrictEqual(sconosciute, [], 'pagine senza voce in regioniSEO: ' + sconosciute.join(', '));
});
