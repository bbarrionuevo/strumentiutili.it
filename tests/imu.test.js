// tests/imu.test.js — Il motore dell'IMU (js/imu.js).
// Casi calcolati a mano: rendita × 1,05 × coefficiente × aliquota (per mille)
// × quota × mesi/12, con le riduzioni di legge (L. 160/2019).
const test = require('node:test');
const assert = require('node:assert');
const { caricaScript, regoleFiscali } = require('./helpers/carica-script.js');

const { window } = caricaScript(['js/imu.js']);
const I = regoleFiscali().imu;
const imu = (d) => window.IMUCalculator.calcola(Object.assign({ quota: 100, mesi: 12 }, d), I);

test('seconda casa: rendita 900, A/2, 10,6 per mille', () => {
  const r = imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6 });
  assert.strictEqual(r.baseImponibile, 151200);           // 900 × 1,05 × 160
  assert.ok(Math.abs(r.impostaLorda - 1602.72) < 1e-9);
  assert.strictEqual(r.impostaAnnua, 1603);
  assert.strictEqual(r.acconto, 801);
  assert.strictEqual(r.saldo, 802);
  assert.strictEqual(r.codiceTributo, '3918');
});

test('comodato e canone concordato', () => {
  assert.strictEqual(imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6, isComodato: true }).impostaAnnua, 801);   // base al 50%
  assert.strictEqual(imu({ rendita: 700, categoria: 'A/3', aliquota: 10.6, isConcordato: true }).impostaAnnua, 935); // 1.246,56 × 75%
  // il comodato non vale per le abitazioni di lusso
  assert.strictEqual(imu({ rendita: 900, categoria: 'A/8', aliquota: 6, isComodato: true }).baseImponibile, 151200);
});

test('quota e mesi di possesso', () => {
  const r = imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6, quota: 50, mesi: 6 });
  assert.strictEqual(r.impostaAnnua, 401);  // 1.602,72 × 50% × 6/12 = 400,68
  assert.strictEqual(r.acconto, 200);
  assert.strictEqual(r.saldo, 201);
});

test('gruppo D: 0,76% allo Stato (3925), il resto al Comune (3930)', () => {
  const r = imu({ rendita: 4000, categoria: 'D/7', aliquota: 10.6 });
  assert.strictEqual(r.baseImponibile, 273000);           // 4.000 × 1,05 × 65
  assert.strictEqual(r.impostaAnnua, 2894);
  // JSON: gli oggetti vengono da un altro contesto vm, con altri prototipi
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.ripartizione.map(({ codice, ente, importo }) => ({ codice, ente, importo })))), [
    { codice: '3925', ente: 'Stato', importo: 2075 },
    { codice: '3930', ente: 'Comune', importo: 819 }
  ]);
  // le quote prima dell'arrotondamento servono a dividere acconto e saldo
  assert.ok(Math.abs(r.ripartizione[0].lordo - 2074.8) < 1e-9);       // 273.000 × 7,6‰
});

test('terreni e negozi', () => {
  assert.strictEqual(imu({ rendita: 1000, categoria: 'TERRENO', aliquota: 7.6 }).baseImponibile, 1000 * 1.25 * 135);
  assert.strictEqual(imu({ rendita: 1000, categoria: 'C/1', aliquota: 10.6 }).baseImponibile, 1000 * 1.05 * 55);
  assert.strictEqual(imu({ rendita: 1000, categoria: 'TERRENO', aliquota: 7.6 }).codiceTributo, '3914');
});

// Saldo di dicembre a conguaglio. L. 160/2019, art. 1, comma 762: la prima rata
// e' l'imposta del primo semestre con l'aliquota dei dodici mesi dell'anno
// precedente; il saldo si versa «a conguaglio» con le aliquote del prospetto
// pubblicato sul sito del Dipartimento delle finanze al 28 ottobre (comma 767).
// Ogni versamento si arrotonda all'euro (L. 296/2006, art. 1, comma 166).
test('saldo a conguaglio: il Comune alza l\'aliquota da 8,6 a 10,6 per mille', () => {
  // A/2 con rendita 600: base 600 × 1,05 × 160 = 100.800 €
  // acconto di giugno con l'aliquota dell'anno prima: 100.800 × 8,6‰ / 2 = 433,44 → 433 €
  assert.strictEqual(imu({ rendita: 600, categoria: 'A/2', aliquota: 8.6 }).acconto, 433);
  // imposta dell'anno con la nuova aliquota: 100.800 × 10,6‰ = 1.068,48 €
  const r = imu({ rendita: 600, categoria: 'A/2', aliquota: 10.6, accontoVersato: 433 });
  assert.strictEqual(r.impostaAnnua, 1068);
  assert.strictEqual(r.acconto, 433);
  assert.strictEqual(r.saldo, 635);          // 1.068,48 − 433 = 635,48 → 635 €
  assert.strictEqual(r.eccedenza, 0);
});

test('saldo a conguaglio: acconto piu\' alto dell\'imposta, saldo zero e differenza da chiedere a rimborso', () => {
  // aliquota scesa da 10,6 a 4 per mille: acconto 100.800 × 10,6‰ / 2 = 534,24 → 534 €
  // imposta dell'anno 100.800 × 4‰ = 403,20 €: niente saldo, 130,80 € versati in piu'
  const r = imu({ rendita: 600, categoria: 'A/2', aliquota: 4, accontoVersato: 534 });
  assert.strictEqual(r.saldo, 0);
  assert.strictEqual(r.eccedenza, 131);
});

test('saldo: senza acconto indicato restano due rate uguali, con acconto zero tutto a dicembre', () => {
  const meta = imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6, accontoVersato: '' });
  assert.deepStrictEqual([meta.acconto, meta.saldo, meta.eccedenza], [801, 802, 0]);
  const tutto = imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6, accontoVersato: 0 });
  assert.deepStrictEqual([tutto.acconto, tutto.saldo], [0, 1603]);
});

test('pagina IMU: il saldo di dicembre a conguaglio, con il campo per l\'acconto versato', () => {
  const fs = require('node:fs');
  const C = require('./helpers/contenuti.js');
  const s = fs.readFileSync(require('node:path').join(__dirname, '..', 'cittadino-tasse', 'calcolo-imu', 'index.html'), 'utf8');
  const t = C.testoVisibile(s);
  // prima la pagina diceva solo «due rate, il 16 giugno e il 16 dicembre» e il
  // calcolatore divideva sempre a meta', anche con l'aliquota cambiata
  assert.match(s, /<label for="calc-acconto"[^>]*>Acconto già versato a giugno/);
  assert.match(t, /aliquota e la detrazione dell’anno precedente/);
  assert.match(t, /alla data del 28 ottobre \(L\. 160\/2019, art\. 1, comma 762\)/);
  assert.match(t, /1\.068,48 − 433 = 635,48 €, cioè 635 €/);
  assert.match(t, /entro cinque anni dal versamento/);
  assert.ok((s.match(/<table\b/g) || []).length >= 2, 'tabelle di rate e coefficienti');
  assert.match(s, /href="https:\/\/www\.finanze\.gov\.it\/it\/fiscalita\/fiscalita-regionale-e-locale\/Imposta-municipale-propria-IMU\/"/);
  // domande visibili uguali a quelle dei dati strutturati
  const ld = JSON.parse(s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage').mainEntity.map((q) => q.name);
  const guida = s.slice(s.indexOf('id="guida"'));
  const visibili = [...guida.matchAll(/<summary[^>]*>([\s\S]*?)<span/g)].map((m) => C.testoVisibile(m[1]).trim());
  assert.deepStrictEqual(visibili, faq);
  assert.strictEqual(faq.length, 7);
});
