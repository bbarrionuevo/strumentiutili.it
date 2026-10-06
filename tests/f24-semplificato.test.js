// tests/f24-semplificato.test.js — L'F24 semplificato e il suo calcolatore
// dell'IMU, riletti sulle fonti (ottobre 2026), perche' gli errori trovati
// non tornino.
//
// Fonti lette:
// - L. 160/2019, art. 1, commi 740-762 (Normattiva, testo vigente al
//   6/10/2026): esenzione dell'abitazione principale salvo A/1, A/8, A/9;
//   coefficienti del comma 745; detrazione di 200 euro del comma 749; acconto
//   pari all'imposta del primo semestre con le aliquote dell'anno prima e
//   saldo a conguaglio (comma 762);
// - D.Lgs. 147/2026, art. 26: abroga i commi 769-770 e scrive il comma
//   768-bis (dichiarazione IMU entro il 30 giugno dell'anno successivo);
// - L. 296/2006, art. 1, comma 166: tributi locali arrotondati all'euro;
// - avvertenze del modello ed esempio ufficiale del codice 3918 (H501, Roma).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./helpers/contenuti.js');
const { caricaScript, regoleFiscali } = require('./helpers/carica-script.js');
const F = require('../js/f24-semplificato-imu.js');

const { window } = caricaScript(['js/imu.js']);
const I = regoleFiscali().imu;
const imu = (d) => window.IMUCalculator.calcola(Object.assign({ quota: 100, mesi: 12 }, d), I);
const semplice = (x) => JSON.parse(JSON.stringify(x));
const PAGINA = 'cittadino-tasse/f24-editabile/f24-semplificato/index.html';
const leggi = (p) => fs.readFileSync(path.join(C.RADICE, p), 'utf8');

test('seconda casa A/2: acconto, saldo o tutto insieme', () => {
  const c = imu({ rendita: 750, categoria: 'A/2', aliquota: 10.6 });
  assert.strictEqual(c.baseImponibile, 126000);           // 750 × 1,05 × 160
  assert.strictEqual(c.impostaAnnua, 1336);               // 1.335,60
  const base = { anno: 2026, ente: 'h501' };
  assert.deepStrictEqual(semplice(F.righe(c, Object.assign({ rata: 'acconto' }, base))), [
    { sezione: 'EL', tributo: '3918', anno: '2026', numImmobili: '1', debito: '668,00', ente: 'H501', acconto: true }
  ]);
  assert.deepStrictEqual(semplice(F.righe(c, Object.assign({ rata: 'saldo' }, base))), [
    { sezione: 'EL', tributo: '3918', anno: '2026', numImmobili: '1', debito: '668,00', ente: 'H501', saldo: true }
  ]);
  // tutto entro il 16 giugno: si barrano sia «acc.» sia «saldo»
  const unica = F.righe(c, Object.assign({ rata: 'unica' }, base))[0];
  assert.strictEqual(unica.debito, '1336,00');
  assert.ok(unica.acconto && unica.saldo);
  // il saldo e' il conguaglio: si toglie l'acconto davvero versato
  assert.strictEqual(F.righe(c, Object.assign({ rata: 'saldo', accontoVersato: '700' }, base))[0].debito, '636,00');
  assert.deepStrictEqual(F.righe(c, Object.assign({ rata: 'saldo', accontoVersato: 1336 }, base)), []);
});

test('gruppo D: due righe, 3925 allo Stato e 3930 al Comune (prima finiva un testo nel codice tributo)', () => {
  const c = imu({ rendita: 10000, categoria: 'D/5', aliquota: 10.6 });
  assert.strictEqual(c.baseImponibile, 840000);           // 10.000 × 1,05 × 80
  const unica = F.righe(c, { rata: 'unica', anno: 2026 });
  assert.deepStrictEqual(semplice(unica.map((r) => [r.tributo, r.debito])), [['3925', '6384,00'], ['3930', '2520,00']]);
  const acconto = F.righe(c, { rata: 'acconto', anno: 2026 });
  assert.deepStrictEqual(semplice(acconto.map((r) => [r.tributo, r.debito])), [['3925', '3192,00'], ['3930', '1260,00']]);
  for (const r of [...unica, ...acconto]) assert.match(r.tributo, /^\d{4}$/);
});

test('abitazione principale: esente, salvo A/1, A/8 e A/9 con codice 3912 e detrazione', () => {
  const casa = imu({ rendita: 900, categoria: 'A/2', aliquota: 6, isAbitazionePrincipale: true });
  assert.strictEqual(casa.esente, true);
  assert.deepStrictEqual(F.righe(casa, { rata: 'unica', anno: 2026 }), []);
  assert.strictEqual(imu({ rendita: 120, categoria: 'C/6', aliquota: 6, isAbitazionePrincipale: true }).esente, true);

  const lusso = imu({ rendita: 2000, categoria: 'A/1', aliquota: 6, isAbitazionePrincipale: true });
  assert.strictEqual(lusso.codiceTributo, '3912');
  assert.strictEqual(lusso.impostaLorda, 2016);           // 336.000 × 6‰
  assert.strictEqual(lusso.detrazione, 200);
  assert.strictEqual(lusso.impostaAnnua, 1816);
  const unica = F.righe(lusso, { rata: 'unica', anno: 2026, ente: 'H501' })[0];
  assert.strictEqual(unica.debito, '1816,00');            // al netto della detrazione
  assert.strictEqual(unica.detrazione, '200,00');
  const acconto = F.righe(lusso, { rata: 'acconto', anno: 2026 })[0];
  assert.deepStrictEqual(semplice([acconto.debito, acconto.detrazione]), ['908,00', '100,00']);
  // la detrazione si rapporta ai mesi
  assert.strictEqual(imu({ rendita: 2000, categoria: 'A/8', aliquota: 6, mesi: 6, isAbitazionePrincipale: true }).detrazione, 100);
  // la pertinenza dell'abitazione di lusso paga con il 3912
  const box = imu({ rendita: 120, categoria: 'C/6', aliquota: 6, isAbitazionePrincipale: true, abitazioneDiLusso: true });
  assert.strictEqual(box.codiceTributo, '3912');
  assert.strictEqual(box.detrazione, 0);
});

test('importi all\'euro, scritti con i centesimi', () => {
  const box = imu({ rendita: 95, categoria: 'C/6', aliquota: 10.6 });
  assert.strictEqual(box.impostaAnnua, 169);              // 169,18
  assert.deepStrictEqual(semplice(F.righe(box, { rata: 'acconto', anno: 2026 }).map((r) => r.debito)), ['85,00']);
  assert.deepStrictEqual(semplice(F.righe(box, { rata: 'saldo', anno: 2026 }).map((r) => r.debito)), ['84,00']);
  assert.strictEqual(F.importo(52), '52,00');
});

test('le categorie del calcolatore hanno il coefficiente del comma 745', () => {
  const html = leggi(PAGINA);
  const gruppi = [...html.matchAll(/<optgroup label="Coefficiente (\d+)[^"]*">([\s\S]*?)<\/optgroup>/g)];
  assert.ok(gruppi.length >= 5, 'mancano i gruppi di categorie');
  const viste = [];
  for (const [, coeff, opzioni] of gruppi) {
    for (const [, cat] of opzioni.matchAll(/<option value="([^"]+)"/g)) {
      viste.push(cat);
      const c = imu({ rendita: 1000, categoria: cat, aliquota: 10 });
      assert.strictEqual(Math.round(c.baseImponibile / 1050), Number(coeff), cat);
    }
  }
  for (const cat of ['A/1', 'A/2', 'A/8', 'A/9', 'A/10', 'B/1', 'C/1', 'C/2', 'C/3', 'C/6', 'C/7', 'D/1', 'D/5', 'D/8']) {
    assert.ok(viste.includes(cat), 'manca ' + cat);
  }
});

test('la pagina non ripete gli errori trovati', () => {
  const html = leggi(PAGINA);
  const testo = C.testoVisibile(html);
  // codice catastale non verificato: si usa quello dell'esempio ufficiale
  assert.doesNotMatch(html, /L219/);
  // l'acconto usa sempre le aliquote dell'anno prima, non solo se il Comune
  // non ha ancora pubblicato quelle nuove (comma 762)
  assert.doesNotMatch(testo, /non ha ancora pubblicato quella dell'anno/);
  assert.match(testo, /aliquot[ae] (e la detrazione )?dell[’']anno precedente/);
  // il ponte usa il modulo collaudato qui, non scrive piu' un testo nel codice tributo
  assert.match(html, /src="\/js\/f24-semplificato-imu\.js"/);
  assert.match(html, /F24SemplificatoImu\.righe/);
  assert.match(testo, /comma 166/);
  assert.match(testo, /768-bis/);
  for (const id of ['campo-per-campo', 'codici', 'acconto-saldo', 'compensazione', 'dove-si-paga', 'esempi', 'errori']) {
    assert.ok(html.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(html, /src="\/assets\/esempi\/f24-semplificato-imu-tari\.webp"/);
});

// D.Lgs. 147/2026: i commi 769 e 770 non ci sono piu'; la dichiarazione IMU
// e' ora al comma 768-bis
test('nessuna pagina cita i commi 769-770 abrogati come regola della dichiarazione IMU', () => {
  for (const p of C.tutteLePagine()) {
    const t = C.testoVisibile(p.html);
    // si possono nominare solo come commi sostituiti o abrogati
    const senzaAbrogati = t.replace(/(al posto dei|abrogazione dei|abroga i) commi 769/g, '');
    assert.doesNotMatch(senzaAbrogati, /comm[ai] 769/, p.percorso);
    if (/dichiarazione IMU[^.]{0,80}30 giugno/.test(t)) assert.match(t, /768-bis/, p.percorso);
  }
});

test('la guida IMU: chi eredita a luglio non paga l\'acconto di giugno', () => {
  const g = leggi('guide/imu-2026/index.html');
  assert.match(C.testoVisibile(g), /primo semestre/);
  assert.doesNotMatch(C.testoVisibile(g), /di acconto e [\d.,]+ (&euro;|€) di saldo/);
});
