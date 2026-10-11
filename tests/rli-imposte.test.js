// tests/rli-imposte.test.js — Registro e bollo per registrare un affitto.
// Casi calcolati a mano con rli_parametri di data/regole-fiscali-2026.json.
const test = require('node:test');
const assert = require('node:assert');
const I = require('../js/rli-imposte.js');
const { regoleFiscali, caricaScript } = require('./helpers/carica-script.js');

const R = regoleFiscali().rli_parametri;

test('registro: 2% del canone annuo, 70% della base per il canone concordato', () => {
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L1' }, R).registro, 192);
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L2' }, R).registro, 134.4);  // 9.600 × 70% × 2%
  assert.strictEqual(I.calcola({ canone: 18000, tipo: 'S1' }, R).registro, 360);
});

test('mai meno di 67 euro, anche per i fondi rustici allo 0,5%', () => {
  const basso = I.calcola({ canone: 3000, tipo: 'L1' }, R);
  assert.strictEqual(basso.registro, 67);
  assert.strictEqual(basso.minimoApplicato, true);
  // T1 e' il fondo rustico ordinario (0,50%); prima lo strumento usava T2,
  // che nelle istruzioni e' il fondo rustico agevolato a imposta fissa
  assert.strictEqual(I.calcola({ canone: 10000, tipo: 'T1' }, R).registro, 67);    // 50 → 67
  assert.strictEqual(I.calcola({ canone: 20000, tipo: 'T1' }, R).registro, 100);   // 0,5%
});

// Tabella del quadro A nelle istruzioni del modello RLI (Agenzia delle
// Entrate, 20 ottobre 2025) e Tariffa parte I, art. 5, del D.P.R. 131/1986.
test('immobile strumentale con locatore soggetto a IVA (S2): 1%', () => {
  assert.strictEqual(I.calcola({ canone: 24000, tipo: 'S2' }, R).registro, 240);
});

test('terreni e aree non edificabili, cave e torbiere (T3): 2%, non 0,5%', () => {
  assert.strictEqual(I.calcola({ canone: 10000, tipo: 'T3' }, R).registro, 200);
});

test('imposta fissa per L3, L4, S3, T2 e T4, qualunque sia il canone', () => {
  for (const [tipo, euro] of [['L3', 67], ['L4', 200], ['S3', 200], ['T2', 67], ['T4', 67]]) {
    for (const canone of [1000, 50000]) {
      const r = I.calcola({ canone, tipo }, R);
      assert.strictEqual(r.registro, euro, tipo + ' con canone ' + canone);
      assert.strictEqual(r.fissa, true, tipo);
      assert.strictEqual(r.minimoApplicato, false, tipo);
    }
  }
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L1' }, R).fissa, false);
});

test('un codice che non esiste non diventa un importo inventato', () => {
  assert.throws(() => I.calcola({ canone: 10000, tipo: 'X9' }, R), /codice/i);
});

test('motore e compilatore usano gli stessi undici codici, con la stessa imposta', () => {
  const schema = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'data', 'modello-rli-schema.json'), 'utf8'));
  const voci = schema.tabelle.tipologiaContratto;
  assert.deepStrictEqual(voci.map((v) => v.value), ['L1', 'L2', 'L3', 'L4', 'S1', 'S2', 'S3', 'T1', 'T2', 'T3', 'T4']);
  for (const v of voci) {
    const r = I.calcola({ canone: 100000, tipo: v.value }, R);   // canone alto: niente minimo
    const fissa = v.label.match(/€ (\d+)\)/);
    if (fissa) {
      assert.strictEqual(r.registro, Number(fissa[1]), v.label);
    } else {
      const pct = Number(v.label.match(/registro (\d+(?:,\d+)?)%/)[1].replace(',', '.'));
      const base = /sul 70%/.test(v.label) ? 70000 : 100000;
      assert.strictEqual(r.registro, Math.round(base * pct) / 100, v.label);
    }
  }
});

test('bollo: 16 euro ogni quattro facciate, per copia', () => {
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L1', pagine: 4, copie: 2 }, R).bollo, 32);
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L1', pagine: 5, copie: 2 }, R).bollo, 64);
  assert.strictEqual(I.calcola({ canone: 9600, tipo: 'L1', pagine: 8, copie: 3 }, R).bollo, 96);
});

test('con la cedolare secca niente registro e niente bollo', () => {
  const r = I.calcola({ canone: 9600, tipo: 'L1', cedolare: true, pagine: 8, copie: 2 }, R);
  assert.strictEqual(r.registro, 0);
  assert.strictEqual(r.bollo, 0);
});

test('il compilatore RLI usa questo motore', () => {
  const sorgente = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'rli.js'), 'utf8');
  assert.match(sorgente, /window\.RliImposte\.calcola\(/);
  assert.doesNotMatch(sorgente, /canone \* 0\.005/, 'il conto non deve essere duplicato nella pagina');
  assert.ok(caricaScript(['js/rli-imposte.js']).window.RliImposte);
});

test('il simulatore della pagina offre gli undici codici e non ripete il conto', () => {
  const pagina = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'cittadino-tasse', 'modello-rli', 'index.html'), 'utf8');
  const sel = pagina.slice(pagina.indexOf('id="rli-tipo-contratto"'), pagina.indexOf('</select>', pagina.indexOf('id="rli-tipo-contratto"')));
  assert.deepStrictEqual([...sel.matchAll(/<option value="([LST]\d)"/g)].map((m) => m[1]),
    ['L1', 'L2', 'L3', 'L4', 'S1', 'S2', 'S3', 'T1', 'T2', 'T3', 'T4']);
  // T2 e' il fondo rustico agevolato a imposta fissa, non il fondo rustico ordinario
  assert.doesNotMatch(pagina, /T2 - Affitto fondi rustici|0\.005|tipo === 'T2'/);
  const ui = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'rli.js'), 'utf8');
  assert.match(ui, /SuGuidaLive\['guida-rli-canone'\]/, 'l\'esempio sotto il campo usa il motore');
});
