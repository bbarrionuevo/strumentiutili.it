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

test('generatore XML: il codice fiscale del cliente non si salva e i vecchi valori si cancellano', () => {
  const pagina = fs.readFileSync(path.join(RADICE, 'fisco-professioni', 'generatore-xml-fatturapa', 'index.html'), 'utf8');
  assert.match(pagina, /id="cliente-id"[^>]*data-no-save/);
  const codice = fs.readFileSync(path.join(RADICE, 'js', 'storage-helper.js'), 'utf8');
  const pulizia = codice.slice(codice.indexOf('Dati sensibili salvati'), codice.indexOf('const tutti'));
  assert.match(pulizia, /data-no-save/, 'i valori salvati prima di data-no-save restano nel browser');
});

// Il calcolo condiviso con un link (pulsante [data-condividi] delle calcolatrici)
const L = window.AppStorage.linkCalcolo;
const campo = (o) => Object.assign({ tagName: 'INPUT', type: 'number', id: '', name: '', value: '', defaultValue: '', checked: false, defaultChecked: false,
  hasAttribute: () => false, closest: () => null, attr: {}, getAttribute(k) { return this.attr[k] || null; }, setAttribute(k, v) { this.attr[k] = v; } }, o);

test('link del calcolo: solo numeri, date e opzioni esistenti; niente testo che finisca nella pagina', () => {
  assert.strictEqual(L.valoreAmmesso(campo({}), '35000'), '35000');
  assert.strictEqual(L.valoreAmmesso(campo({}), ' 1 234,50 '), '1234,50');
  assert.strictEqual(L.valoreAmmesso(campo({}), '<img src=x onerror=alert(1)>'), null);
  assert.strictEqual(L.valoreAmmesso(campo({}), '1e9'), null);
  assert.strictEqual(L.valoreAmmesso(campo({ type: 'text' }), 'Mario Rossi'), null);
  assert.strictEqual(L.valoreAmmesso(campo({ type: 'date' }), '1970-05-12'), '1970-05-12');
  assert.strictEqual(L.valoreAmmesso(campo({ type: 'date' }), '12/05/1970'), null);
  assert.strictEqual(L.valoreAmmesso(campo({ type: 'checkbox' }), '1'), '1');
  assert.strictEqual(L.valoreAmmesso(campo({ type: 'checkbox' }), 'si'), null);
  assert.strictEqual(L.valoreAmmesso(campo({ type: 'email' }), '3'), null);
  const menu = campo({ tagName: 'SELECT', type: 'select-one', options: [{ value: 'puglia' }, { value: 'veneto' }] });
  assert.strictEqual(L.valoreAmmesso(menu, 'veneto'), 'veneto');
  assert.strictEqual(L.valoreAmmesso(menu, 'javascript:alert(1)'), null);
});

test('link del calcolo: dentro solo i valori cambiati, mai codici fiscali o IBAN', () => {
  const campi = [
    campo({ id: 'ral', value: '35000', defaultValue: '' }),
    campo({ id: 'mensilita', value: '13', defaultValue: '13' }),                       // non cambiato
    campo({ id: 'f24-cf', type: 'text', value: '12345678901', defaultValue: '' }),   // sensibile per nome
    campo({ id: 'iban', type: 'text', value: '1234', defaultValue: '' }),
    campo({ id: 'nome', type: 'text', value: 'Mario', defaultValue: '' }),            // testo: non va nel link
    campo({ id: 'tredicesima', type: 'checkbox', checked: true, defaultChecked: false })
  ];
  // (gli array arrivano dal contesto dello script: si confrontano come testo)
  assert.strictEqual(JSON.stringify(L.valoriDelCalcolo(campi)), JSON.stringify([['ral', '35000'], ['tredicesima', '1']]));
});

test('link del calcolo: i valori arrivano nei campi giusti e solo se ammessi', () => {
  const campi = [campo({ id: 'ral' }), campo({ id: 'eta', type: 'text' }), campo({ id: 'cf', type: 'text' }), campo({ id: 'giorni' })];
  const cambiati = L.valoriDalLink(campi, '?ral=42000&eta=67&cf=12345678901&giorni=%3Cscript%3E');
  assert.strictEqual(cambiati.map((x) => x.id).join(','), 'ral,eta');
  assert.strictEqual(campi[0].value, '42000');
  assert.strictEqual(campi[0].getAttribute('data-da-url'), '1');
  assert.strictEqual(campi[2].value, '');
  assert.strictEqual(campi[3].value, '');
});
