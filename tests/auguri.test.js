// tests/auguri.test.js — Il biglietto di auguri: testi, a capo, corpo che si
// adatta, righe dentro il quadrato. Il disegno vero si guarda nel browser.
const test = require('node:test');
const assert = require('node:assert');

const A = require('../js/auguri.js');

// Una misura finta ma credibile: ogni carattere largo 0,55 volte il corpo.
const corpoDa = (f) => Number(/(\d+)px/.exec(f)[1]);
const misuraFont = (t, f) => t.length * corpoDa(f) * 0.55;
const misura = (t, c) => t.length * c * 0.55;

test('i testi dei due biglietti', () => {
  assert.deepStrictEqual(A.testi({ tipo: 'onomastico', nome: ' Giuseppe ', data: '19 marzo', santo: 'San Giuseppe' }),
    { titolo: 'Buon onomastico', nome: 'Giuseppe!', sotto: '19 marzo · San Giuseppe' });
  assert.deepStrictEqual(A.testi({ tipo: 'compleanno', nome: 'Anna' }), { titolo: 'Buon compleanno', nome: 'Anna!', sotto: 'Tanti auguri di cuore' });
  assert.strictEqual(A.testi({ tipo: 'onomastico', nome: '' }).nome, '');
  assert.strictEqual(A.testi({ nome: 'x'.repeat(80) }).nome.length, 41, 'nome tagliato a 40 caratteri');
});

test('a capo per parole', () => {
  const m = (t) => misura(t, 10);
  assert.deepStrictEqual(A.aCapo('uno due tre quattro', m, 50), ['uno due', 'tre', 'quattro']);
  assert.deepStrictEqual(A.aCapo('', m, 50), []);
});

test('il corpo scende finche il testo sta nelle righe', () => {
  const corto = A.adatta('Anna!', misura, 860, 150, 64, 2);
  assert.deepStrictEqual([corto.corpo, corto.righe], [150, ['Anna!']]);
  const lungo = A.adatta('Maria Francesca Benedetta!', misura, 860, 150, 64, 2);
  assert.ok(lungo.corpo < 150 && lungo.righe.length <= 2);
  lungo.righe.forEach((r) => assert.ok(misura(r, lungo.corpo) <= 860));
  // una parola sola lunghissima: al minimo e coi puntini, mai fuori dal bordo
  const enorme = A.adatta('Supercalifragilistichespiralidoso'.repeat(3) + '!', misura, 860, 150, 64, 2);
  assert.strictEqual(enorme.corpo, 64);
  assert.ok(enorme.righe[0].endsWith('…'));
  enorme.righe.forEach((r) => assert.ok(misura(r, 64) <= 860, r));
});

test('le righe stanno dentro il quadrato, in ordine dall alto', () => {
  for (const o of [
    { tipo: 'onomastico', nome: 'Giuseppe', data: '19 marzo', santo: 'San Giuseppe' },
    { tipo: 'onomastico', nome: 'Maria Francesca Benedetta', data: '12 settembre', santo: 'Santissimo Nome di Maria' },
    { tipo: 'compleanno', nome: 'Lu' },
    { tipo: 'onomastico', nome: '' }
  ]) {
    const righe = A.impagina(o, misuraFont);
    assert.ok(righe.length >= (o.nome ? 2 : 1), JSON.stringify(o));
    righe.forEach((r, i) => {
      assert.ok(r.y > 100 && r.y < A.LATO - 110, r.testo + ' y=' + r.y);
      if (i) assert.ok(r.y > righe[i - 1].y);
      assert.ok(misuraFont(r.testo, r.font) <= A.LATO - 220, r.testo);
    });
  }
});

test('coriandoli: sempre uguali per lo stesso nome, lontani dal testo', () => {
  assert.deepStrictEqual(A.coriandoli('Giuseppe', 20), A.coriandoli('Giuseppe', 20));
  assert.notDeepStrictEqual(A.coriandoli('Giuseppe', 20), A.coriandoli('Anna', 20));
  for (const c of A.coriandoli('Anna', 200)) {
    assert.ok(c.x >= 0 && c.x <= A.LATO && c.y >= 0 && c.y <= A.LATO);
    const alBordo = c.y < 150 || c.y > A.LATO - 150 || c.x < 90 || c.x > A.LATO - 90;
    assert.ok(alBordo, 'coriandolo in mezzo al testo');
  }
  assert.deepStrictEqual(Object.keys(A.TEMI), ['oro', 'cielo', 'rosa', 'notte']);
});
