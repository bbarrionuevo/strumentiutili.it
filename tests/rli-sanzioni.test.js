// tests/rli-sanzioni.test.js — Registrazione tardiva di un contratto di
// locazione: 45% (minimo 150 €) fino a 30 giorni, 120% (minimo 250 €) oltre,
// ridotti con il ravvedimento (1/10, 1/9, 1/8, 1/7), piu' gli interessi
// legali. Fonte: Agenzia delle Entrate, risoluzione n. 56 del 13/10/2025 e
// scheda "Ravvedimento - Come regolarizzare". Prima lo strumento applicava
// il 25%, senza minimi.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = require('../js/rli-sanzioni.js');
const regole = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'regole-fiscali-2026.json'), 'utf8'));
const S = regole.rli_parametri.sanzioniRegistrazione;
const T = regole.ravvedimento.tassiStoriciLegali;

// firma il 1° marzo 2026: si registra entro il 31 marzo
const conta = (pagamento, imposta, cedolare) => R.calcola({ imposta, cedolare: !!cedolare, stipula: '2026-03-01', pagamento, regole: S, tassi: T, tassoVigente: 0.016 });

test('in tempo: nessuna sanzione, anche con la firma nel futuro', () => {
  assert.deepStrictEqual([conta('2026-03-31', 600).sanzione, conta('2026-03-31', 600).giorniRitardo], [0, 0]);
  assert.strictEqual(conta('2026-02-01', 600).sanzione, 0, 'una data futura non e un ritardo');
  assert.strictEqual(conta('2026-03-31', 600).scadenza, '2026-03-31');
});

test('fino a 30 giorni: 45% con minimo 150 €, ridotto a 1/10', () => {
  const piccolo = conta('2026-04-20', 192);          // 45% di 192 = 86,40 < 150
  assert.strictEqual(piccolo.giorniRitardo, 20);
  assert.strictEqual(piccolo.sanzionePiena, 150);
  assert.strictEqual(piccolo.sanzione, 15);
  const grande = conta('2026-04-20', 600);           // 45% di 600 = 270
  assert.strictEqual(grande.sanzionePiena, 270);
  assert.strictEqual(grande.sanzione, 27);
});

test('oltre 30 giorni: 120% con minimo 250 €, ridotto a 1/9, 1/8, 1/7', () => {
  assert.strictEqual(conta('2026-05-30', 600).sanzione, 80);        // 60 giorni: 720 / 9
  assert.strictEqual(conta('2026-10-17', 600).sanzione, 90);        // 200 giorni: 720 / 8
  assert.strictEqual(conta('2027-05-05', 600).sanzione, 102.86);    // 400 giorni: 720 / 7
  assert.strictEqual(conta('2026-05-30', 100).sanzionePiena, 250);  // 120% di 100 = 120 < 250
  assert.strictEqual(conta('2026-05-30', 100).sanzione, 27.78);
});

test('interessi legali sull imposta, giorno per giorno', () => {
  // 600 € al 1,6% per 60 giorni = 1,58 €
  assert.strictEqual(conta('2026-05-30', 600).interessi, 1.58);
  assert.strictEqual(conta('2026-05-30', 0, true).interessi, 0, 'con la cedolare non c e imposta');
});

test('cedolare secca: i minimi, ridotti', () => {
  assert.strictEqual(conta('2026-04-20', 0, true).sanzione, 15);
  assert.strictEqual(conta('2026-05-30', 0, true).sanzione, 27.78);
});

test('scadenze prima del 1° settembre 2024: il calcolo lo dice e non inventa', () => {
  const vecchio = R.calcola({ imposta: 600, cedolare: false, stipula: '2024-06-01', pagamento: '2026-03-01', regole: S, tassi: T });
  assert.strictEqual(vecchio.regime, 'precedente');
  assert.strictEqual(vecchio.sanzione, 0);
  // il primo giorno di violazione e' il 1° settembre 2024: vale gia' il regime nuovo
  const confine = R.calcola({ imposta: 600, cedolare: false, stipula: '2024-08-01', pagamento: '2024-09-10', regole: S, tassi: T });
  assert.strictEqual(confine.scadenza, '2024-08-31');
  assert.strictEqual(confine.regime, 'dal-2024');
});

test('la pagina usa il modulo e non la vecchia sanzione del 25%', () => {
  const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'rli.js'), 'utf8');
  assert.ok(!/ravvedimento\.sanzioneBase/.test(ui));
  assert.ok(!/Math\.abs\(dataOggi - dataStipula\)/.test(ui));
  assert.match(ui, /RliSanzioni\.calcola/);
  const pagina = fs.readFileSync(path.join(__dirname, '..', 'cittadino-tasse', 'modello-rli', 'index.html'), 'utf8');
  const ordine = [...pagina.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ordine.indexOf('rli-sanzioni.js') >= 0 && ordine.indexOf('rli-sanzioni.js') < ordine.indexOf('rli.js'));
  assert.match(pagina, /il 45% dell&rsquo;imposta di registro \(minimo 150 &euro;\)/);
});
