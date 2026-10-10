// tests/compilatore-valori.test.js — Come il compilatore dei modelli controlla
// e scrive gli importi. Prima un importo senza decimali accettava la virgola
// e la toglieva: «650,74» finiva nel PDF come 65074, cento volte di piu'
// (la rendita catastale del quadro C dell'RLI, il volume d'affari dell'AA9).
const test = require('node:test');
const assert = require('node:assert');
const { caricaScript } = require('./helpers/carica-script.js');

const C = caricaScript(['js/compilatore-moduli.js']).window.CompilatoreModuli;

test('un importo senza decimali accetta il punto delle migliaia ma non la virgola', () => {
  assert.strictEqual(C.controllaValore('importo', '9600'), null);
  assert.strictEqual(C.controllaValore('importo', '9.600'), null);
  assert.match(C.controllaValore('importo', '9600,50'), /senza decimali/);
  assert.match(C.controllaValore('importo', '650,74'), /senza decimali/);
  assert.strictEqual(C.perModello('9.600', 'importo'), '9600');
});

test('un importo con i centesimi si scrive con la virgola', () => {
  assert.strictEqual(C.controllaValore('euro', '650,74'), null);
  assert.strictEqual(C.perModello('650,74', 'euro'), '650,74');
});

test('una percentuale di possesso puo\' avere due decimali, fino a 100', () => {
  for (const v of ['100', '50', '33,33', '33.33', '50%']) assert.strictEqual(C.controllaValore('percentuale', v), null, v);
  for (const v of ['120', '33,333', 'meta']) assert.match(C.controllaValore('percentuale', v), /percentuale/, v);
  assert.strictEqual(C.perModello('33.33', 'percentuale'), '33,33');
  assert.strictEqual(C.perModello('100', 'percentuale'), '100');
});

test('RLI: rendita catastale con i centesimi e quota di possesso in percentuale', () => {
  const schema = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'data', 'modello-rli-schema.json'), 'utf8'));
  const passi = schema.modelli.RLI.passi;
  const sotto = (passo, gruppo, id) => passi.find((p) => p.id === passo).ripetibili.find((g) => g.id === gruppo).sottocampi.find((c) => c.id === id);
  assert.strictEqual(sotto('immobili', 'immobile', 'renditaCatastale').type, 'euro');
  assert.strictEqual(sotto('cedolare', 'riga', 'possesso').type, 'percentuale');
  // nel modello in vigore la casella e' «N. fogli del contratto», non «N. pagine»
  const fogli = passi.find((p) => p.id === 'registrazione').campi.find((c) => c.id === 'nPagine');
  assert.match(fogli.label, /fogli/);
});

test('lo zero davanti alle caselline da due cifre non tocca il testo libero', () => {
  const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'compilatore-moduli.js'), 'utf8');
  // il numero civico 1 nel quadro C dell'RLI usciva «01»
  assert.match(js, /max === 2 && \/\^\\d\$\/\.test\(valore\) && !liberi\.has\(nome\)/);
  assert.ok((js.match(/liberi\.add\(/g) || []).length >= 2, 'campi semplici e righe ripetibili');
});
