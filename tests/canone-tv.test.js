// tests/canone-tv.test.js — Le date del canone TV.
//
// I casi vengono dagli esempi scritti nelle istruzioni ufficiali dell'Agenzia
// delle Entrate e dalla scheda "Dichiarazione sostitutiva" per il 2026.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/canone-tv.js');

test('quadro A: le date della scheda dell’Agenzia per il 2026', () => {
  // "dal 1 luglio 2025 al 2 febbraio 2026 esonera per l'intero anno 2026"
  assert.deepStrictEqual(C.effettoNonDetenzione('2025-07-01'), { anno: 2026, periodo: 'intero', termine: '2026-02-02' });
  assert.deepStrictEqual(C.effettoNonDetenzione('2026-02-02'), { anno: 2026, periodo: 'intero', termine: '2026-02-02' });
  // "dal 3 febbraio al 30 giugno 2026 esonera per il secondo semestre 2026"
  assert.strictEqual(C.effettoNonDetenzione('2026-02-03').periodo, 'secondo');
  assert.strictEqual(C.effettoNonDetenzione('2026-06-30').periodo, 'secondo');
  assert.strictEqual(C.effettoNonDetenzione('2026-06-30').anno, 2026);
});

test('quadro A: l’esempio delle istruzioni (dal 1 luglio 2022 al 31 gennaio 2023)', () => {
  assert.deepStrictEqual(C.effettoNonDetenzione('2022-07-01'), { anno: 2023, periodo: 'intero', termine: '2023-01-31' });
  assert.deepStrictEqual(C.effettoNonDetenzione('2023-01-31'), { anno: 2023, periodo: 'intero', termine: '2023-01-31' });
  assert.strictEqual(C.effettoNonDetenzione('2023-02-01').periodo, 'secondo');
});

test('quadro A presentato oggi, a fine settembre 2026, vale per tutto il 2027', () => {
  const r = C.effettoNonDetenzione('2026-09-27');
  assert.strictEqual(r.anno, 2027);
  assert.strictEqual(r.periodo, 'intero');
  // il 31 gennaio 2027 e' una domenica
  assert.strictEqual(r.termine, '2027-02-01');
  assert.strictEqual(C.termineGennaio(2028), '2028-01-31');
});

test('over 75: gli esempi delle istruzioni', () => {
  // 75 anni il 10 dicembre 2019 o il 10 gennaio 2020 -> tutto il 2020
  assert.strictEqual(C.esenzioneOver75('1944-12-10', 2020).periodo, 'intero');
  assert.strictEqual(C.esenzioneOver75('1945-01-10', 2020).periodo, 'intero');
  // 75 anni il 10 febbraio 2020 -> secondo semestre 2020
  assert.strictEqual(C.esenzioneOver75('1945-02-10', 2020).periodo, 'secondo');
  assert.strictEqual(C.esenzioneOver75('1945-07-31', 2020).periodo, 'secondo');
  assert.strictEqual(C.esenzioneOver75('1945-08-01', 2020).periodo, 'nessuno');
  assert.strictEqual(C.esenzioneOver75('1945-08-01', 2021).periodo, 'intero');
  assert.strictEqual(C.esenzioneOver75('1945-02-10', 2020).compleanno75, '2020-02-10');
});

test('over 75: chi e’ nato il 29 febbraio', () => {
  assert.strictEqual(C.esenzioneOver75('1952-02-29', 2027).compleanno75, '2027-03-01');
  assert.strictEqual(C.esenzioneOver75('1952-02-29', 2027).periodo, 'secondo');
});

test('la soglia di reddito: 6.713,98 fino al 2017, poi 8.000', () => {
  assert.strictEqual(C.sogliaReddito(2017), 6713.98);
  assert.strictEqual(C.sogliaReddito(2018), 8000);
  assert.strictEqual(C.sogliaReddito(2027), 8000);
});

test('date sbagliate non producono risultati', () => {
  for (const x of ['', null, '2026-02-30', '31/01/2026', 'abc']) {
    assert.strictEqual(C.effettoNonDetenzione(x), null, String(x));
    assert.strictEqual(C.esenzioneOver75(x, 2027), null, String(x));
  }
  assert.strictEqual(C.esenzioneOver75('1950-01-01', 'x'), null);
  assert.strictEqual(C.sogliaReddito('x'), null);
});

test('le cifre del canone vengono dalla scheda dell’Agenzia e le pagine le usano uguali', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const radice = path.resolve(__dirname, '..');
  const T = JSON.parse(fs.readFileSync(path.join(radice, 'data', 'regole-fiscali-2026.json'), 'utf8')).canone_tv;
  assert.strictEqual(T.importo_annuo, 90);
  assert.strictEqual(T.rate_in_bolletta, 10);
  assert.match(T.fonte, /^https:\/\/www\.agenziaentrate\.gov\.it\/portale\/schede\/agevolazioni\/canone-tv\//);
  assert.strictEqual(T.esenzione_over_75.soglia_reddito, 8000);
  assert.strictEqual(C.sogliaReddito(2026), T.esenzione_over_75.soglia_reddito);
  for (const p of ['disdetta-canone-rai', 'esenzione-canone-rai-over-75', 'rimborso-canone-rai']) {
    const html = fs.readFileSync(path.join(radice, 'cittadino-tasse', p, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /\b(70|100|110) euro l&rsquo;anno/, p + ': importo diverso da quello ufficiale');
    assert.match(html, /cp22\.canonetv@postacertificata\.rai\.it|Casella postale 22/, p + ': manca il recapito ufficiale');
  }
});
