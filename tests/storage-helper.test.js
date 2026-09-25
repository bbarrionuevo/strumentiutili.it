// tests/storage-helper.test.js — Quali campi non si salvano mai nel browser.
// I modelli (F24, RLI, AA9...) chiamano i campi in camelCase e con i punti:
// prima il filtro li lasciava passare e codici fiscali e IBAN finivano in
// localStorage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { caricaScript, RADICE } = require('./helpers/carica-script.js');

const { window } = caricaScript(['js/storage-helper.js']);
const sensibile = window.AppStorage.campoSensibile;

test('codici fiscali, IBAN e password si riconoscono in ogni forma di nome', () => {
  for (const k of [
    'cf', 'f24-cf', 'codice_fiscale', 'codiceFiscale', 'iban', 'ibanEstero', 'password',
    'f24-ordinario.contribuente.cf', 'f24-ordinario.contribuente.cfCoobbligato',
    'modello-rli.garanti.cfSecondoGarante', 'aa4-8.altri.altroCf2', 'aa5-6.soci.cf3',
    'rappCf', 'delegatoCf', 'cfRichiedenteEnte', 'numero-carta', 'pinCode'
  ]) assert.ok(sensibile(k), k);
});

test('i campi normali si salvano', () => {
  for (const k of ['cfu', 'reddito', 'f24-ordinario.erario.0.importo', 'cartella', 'spinta', 'anzianita', 'nome', 'cognome', 'capoluogo'])
    assert.ok(!sensibile(k), k);
});

test('ogni campo con codice fiscale o IBAN dei modelli viene escluso', () => {
  const dir = path.join(RADICE, 'data');
  let visti = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^modell.*-schema\.json$/.test(x))) {
    const ids = [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids.filter((x) => /(^|[a-z])(cf|Cf|iban|Iban)([A-Z0-9]|$)|codiceFiscale/.test(x))) {
      visti++;
      assert.ok(sensibile('modello.passo.' + id), f + ': ' + id);
    }
  }
  assert.ok(visti > 40, 'trovati solo ' + visti + ' campi');
});

test('lettere di dimissioni e modello RLI non salvano il codice fiscale', () => {
  for (const js of ['hr-dimissioni', 'rli']) {
    const codice = fs.readFileSync(path.join(RADICE, 'js', js + '.js'), 'utf8');
    const salva = codice.slice(codice.indexOf('function saveState'), codice.indexOf('function loadState'));
    assert.ok(salva.length > 50, js);
    assert.ok(!/\bcf\w*\s*:/i.test(salva), js + ': saveState salva ancora un codice fiscale');
  }
});
