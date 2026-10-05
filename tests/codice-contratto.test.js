// tests/codice-contratto.test.js — Il codice di 16 caratteri da scrivere negli
// «elementi identificativi» dell'F24 ELIDE quando manca il codice del contratto
// di 17 caratteri. Regola ed esempio sono quelli della risoluzione n. 14/E del
// 24 gennaio 2014 dell'Agenzia delle Entrate: ufficio (3 caratteri), ultime due
// cifre dell'anno di registrazione, serie (2) e numero (6) completati con zeri
// a sinistra, sottonumero oppure «000». Esempio ufficiale: ufficio TMD, anno
// 2013, serie 3, numero 10725, senza sottonumero = «TMD1303010725000».
const test = require('node:test');
const assert = require('node:assert');

const K = require('../js/codice-contratto.js');

test('l\'esempio della risoluzione 14/E', () => {
  const r = K.componi({ ufficio: 'TMD', anno: '2013', serie: '3', numero: '10725', sottonumero: '' });
  assert.deepStrictEqual(r.errori, []);
  assert.strictEqual(r.codice, 'TMD1303010725000');
  assert.strictEqual(r.codice.length, 16);
  assert.deepStrictEqual(r.parti, ['TMD', '13', '03', '010725', '000']);
});

test('spazi, minuscole e numeri gia\' completi', () => {
  const r = K.componi({ ufficio: ' tmd ', anno: 2013, serie: '03', numero: '010725', sottonumero: undefined });
  assert.strictEqual(r.codice, 'TMD1303010725000');
});

test('serie alfanumerica e sottonumero presente', () => {
  const r = K.componi({ ufficio: 'TMD', anno: '2026', serie: '3T', numero: '123', sottonumero: '1' });
  assert.deepStrictEqual(r.errori, []);
  assert.deepStrictEqual(r.parti, ['TMD', '26', '3T', '000123', '001']);
  assert.ok(r.avvisi.some((a) => /sottonumero/i.test(a)), 'il sottonumero completato con zeri va segnalato');
  assert.strictEqual(r.codice.length, 16);
});

test('dati mancanti o troppo lunghi: nessun codice', () => {
  const casi = [
    { ufficio: 'TM', anno: '2013', serie: '3', numero: '10725' },
    { ufficio: 'TMD', anno: '13', serie: '3', numero: '10725' },
    { ufficio: 'TMD', anno: '2013', serie: '', numero: '10725' },
    { ufficio: 'TMD', anno: '2013', serie: '123', numero: '10725' },
    { ufficio: 'TMD', anno: '2013', serie: '3', numero: '1234567' },
    { ufficio: 'TMD', anno: '2013', serie: '3', numero: '' },
    { ufficio: 'TMD', anno: '2013', serie: '3', numero: '10725', sottonumero: '1234' }
  ];
  for (const c of casi) {
    const r = K.componi(c);
    assert.strictEqual(r.codice, '', JSON.stringify(c));
    assert.ok(r.errori.length > 0, JSON.stringify(c));
  }
});

test('il codice del contratto di 17 caratteri', () => {
  assert.strictEqual(K.lunghezzaGiusta('TMD1303010725000'), true, '16 caratteri: il codice composto');
  assert.strictEqual(K.lunghezzaGiusta('ABCDEFGHIJKLMNOPQ'), true, '17 caratteri: il codice della ricevuta');
  assert.strictEqual(K.lunghezzaGiusta(' ABCD EFGH IJKL MNOPQ '), true, 'gli spazi copiati dalla ricevuta non contano');
  assert.strictEqual(K.lunghezzaGiusta('ABCDEFGHIJKLMNOP1Q'), false);
  assert.strictEqual(K.lunghezzaGiusta(''), false);
});

// --- i codici del ravvedimento nelle pagine ----------------------------------
//
// Per la risoluzione 14/E, 1507 e 1508 sono sanzione e interessi della prima
// registrazione tardiva; 1509 e 1510 quelli di annualita' e adempimenti
// successivi. Il sito scriveva «1507 (sanzione) e 1509 (interessi)» per
// un'annualita' in ritardo: qui si controlla che l'errore non torni.
const C = require('./helpers/contenuti.js');
const fs = require('node:fs');
const path = require('node:path');

test('nessuna pagina mette insieme 1507 e 1509 come sanzione e interessi', () => {
  const sbagliate = C.tutteLePagine()
    .filter((p) => /\b1507\b[^.;]{0,40}\b1509\b/.test(C.testoVisibile(p.html)))
    .map((p) => p.percorso);
  assert.deepStrictEqual(sbagliate, []);
});

test('la pagina dell\'F24 ELIDE ha il compositore del codice e l\'esempio compilato', () => {
  const html = fs.readFileSync(path.join(C.RADICE, 'cittadino-tasse/f24-editabile/f24-elide/index.html'), 'utf8');
  for (const id of ['cc-form', 'cc-ufficio', 'cc-anno', 'cc-serie', 'cc-numero', 'cc-sottonumero', 'cc-codice', 'cc-usa']) {
    assert.ok(html.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.ok(html.includes('src="/js/codice-contratto.js"') && html.includes('src="/js/codice-contratto-ui.js"'));
  const img = html.match(/<img src="(\/assets\/esempi\/[^"]+\.webp)" width="(\d+)" height="(\d+)"/);
  assert.ok(img, 'immagine d\'esempio con larghezza e altezza (niente salti della pagina)');
  assert.ok(fs.existsSync(path.join(C.RADICE, img[1])), img[1] + ' non esiste: rilancia scripts/genera-esempi-moduli.py');
  assert.match(html, /dati inventati/);
});
