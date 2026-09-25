// tests/parametri-url.test.js — La voce gia' scelta dall'indirizzo
// (?regione=lombardia, ?ccnl=metalmeccanici): js/parametri-url.js.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/parametri-url.js');

const REGIONI = ['nazionale', 'lazio', 'lombardia', 'valle_aosta'];

test('prende il valore solo se e una delle opzioni', () => {
  assert.strictEqual(P.valore('?regione=lombardia', 'regione', REGIONI), 'lombardia');
  assert.strictEqual(P.valore('?regione=Lombardia%20', 'regione', REGIONI), 'lombardia');
  assert.strictEqual(P.valore('?regione=valle_aosta&x=1', 'regione', REGIONI), 'valle_aosta');
  assert.strictEqual(P.valore('?regione=atlantide', 'regione', REGIONI), null);
  assert.strictEqual(P.valore('?ccnl=commercio', 'regione', REGIONI), null);
  assert.strictEqual(P.valore('', 'regione', REGIONI), null);
});

test('imposta i menu marcati e li segna, cosi i valori ricordati non li sovrascrivono', () => {
  function menu(parametro, opzioni) {
    const attr = { 'data-parametro': parametro };
    return {
      value: opzioni[0], options: opzioni.map((v) => ({ value: v })),
      getAttribute: (k) => (k in attr ? attr[k] : null),
      setAttribute: (k, v) => { attr[k] = v; }
    };
  }
  const regione = menu('regione', REGIONI);
  const ccnl = menu('ccnl', ['commercio', 'metalmeccanici']);
  const doc = { querySelectorAll: () => [regione, ccnl] };
  const fatti = P.applica(doc, '?regione=lombardia&ccnl=inventato');
  assert.deepStrictEqual(fatti, [regione]);
  assert.strictEqual(regione.value, 'lombardia');
  assert.ok(P.daUrl(regione));
  assert.strictEqual(ccnl.value, 'commercio');
  assert.ok(!P.daUrl(ccnl));
});
