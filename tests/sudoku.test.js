// tests/sudoku.test.js — Il sudoku del giorno: uguale per tutti, una sola
// soluzione, livelli misurati con le tecniche che servono.
const test = require('node:test');
const assert = require('node:assert');

const S = require('../js/sudoku.js');
const F = require('../js/festivita.js');

test('stessa data e livello, stesso sudoku; date diverse, sudoku diversi', () => {
  const a = S.delGiorno('2026-09-24', 'medio');
  const b = S.delGiorno('2026-09-24', 'medio');
  assert.deepStrictEqual(a.griglia, b.griglia);
  assert.notDeepStrictEqual(S.delGiorno('2026-09-25', 'medio').griglia, a.griglia);
  assert.notDeepStrictEqual(S.delGiorno('2026-09-24', 'facile').griglia, a.griglia);
});

// Se questi cambiano, cambia il sudoku di tutti: e' voluto solo se si cambia
// il generatore apposta (e allora chi sta giocando oggi perde la partita).
test('le griglie del 24 settembre 2026 non cambiano fra una versione e l altra', () => {
  const attese = {
    facile: '108092600000506800657030209071000400080609010002000390405060783006304000003270904',
    medio: '930008000601000304050010900020034080000080000090520040002090050405000702000100036',
    difficile: '760004008000008000900600170000040060015000430030020000041007009000300000300400087'
  };
  for (const [livello, griglia] of Object.entries(attese)) {
    assert.strictEqual(S.delGiorno('2026-09-24', livello).griglia.join(''), griglia, livello);
  }
});

test('un mese di sudoku: soluzione unica, simmetrici, livelli rispettati', () => {
  let data = '2026-10-01';
  for (let k = 0; k < 31; k++, data = F.aggiungi(data, 1)) {
    for (const livello of S.LIVELLI) {
      const r = S.delGiorno(data, livello);
      const etichetta = data + ' ' + livello;
      assert.strictEqual(S.contaSoluzioni(r.griglia, 2), 1, etichetta + ': piu soluzioni');
      assert.ok(S.valida(r.soluzione), etichetta);
      r.griglia.forEach((v, i) => {
        if (v) assert.strictEqual(v, r.soluzione[i], etichetta + ': indizio diverso dalla soluzione');
        assert.strictEqual(!v, !r.griglia[80 - i], etichetta + ': non simmetrico');
      });
      const indizi = r.griglia.filter(Boolean).length;
      assert.strictEqual(indizi, r.indizi);
      const logica = S.risolviLogico(r.griglia);
      assert.ok(logica.risolto, etichetta + ': serve tirare a indovinare');
      assert.deepStrictEqual(logica.griglia, r.soluzione);
      if (livello === 'facile') assert.ok(indizi >= 36 && logica.tecniche.join() === 'singoli', etichetta);
      if (livello === 'medio') assert.ok(indizi >= 28 && indizi <= 32 && logica.tecniche.join() === 'singoli', etichetta);
      if (livello === 'difficile') assert.ok(logica.tecniche.length >= 2 && indizi < 32, etichetta + ' ' + logica.tecniche);
    }
  }
});

test('risolutore: griglia vuota con tante soluzioni, griglia impossibile senza', () => {
  assert.strictEqual(S.contaSoluzioni(new Array(81).fill(0), 2), 2);
  const rotta = new Array(81).fill(0);
  rotta[0] = 5; rotta[1] = 5;
  assert.strictEqual(S.contaSoluzioni(rotta, 2), 0);
  const r = S.delGiorno('2027-01-01', 'difficile');
  assert.deepStrictEqual(S.risolvi(r.griglia), r.soluzione);
});

test('conflitti: le caselle con lo stesso numero in riga, colonna o riquadro', () => {
  const v = new Array(81).fill(0);
  v[0] = 3; v[8] = 3;          // stessa riga
  v[20] = 7; v[72 + 2] = 7;    // stessa colonna (2)
  v[30] = 9; v[40] = 9;        // stesso riquadro centrale
  v[80] = 1;                   // da solo
  assert.deepStrictEqual(S.conflitti(v), [0, 8, 20, 30, 40, 74]);
  assert.deepStrictEqual(S.conflitti(S.delGiorno('2026-09-24', 'facile').soluzione), []);
});

test('la data e quella italiana, anche a cavallo della mezzanotte', () => {
  assert.strictEqual(S.oggiInItalia(new Date('2026-09-24T21:59:00Z')), '2026-09-24');   // 23:59 in Italia
  assert.strictEqual(S.oggiInItalia(new Date('2026-09-24T22:00:00Z')), '2026-09-25');   // mezzanotte (ora legale)
  assert.strictEqual(S.oggiInItalia(new Date('2026-12-31T23:30:00Z')), '2027-01-01');   // ora solare: +1
});

test('input sbagliati', () => {
  assert.throws(() => S.delGiorno('24/09/2026', 'medio'), /Data non valida/);
  assert.throws(() => S.delGiorno('2026-09-24', 'impossibile'), /Livello non valido/);
});

test('serie: giorni di fila, solo con il sudoku di oggi', () => {
  let s = S.aggiornaSerie(null, '2026-09-24', '2026-09-24');
  assert.deepStrictEqual(s, { ultima: '2026-09-24', giorni: 1, record: 1, risolti: 1 });
  s = S.aggiornaSerie(s, '2026-09-24', '2026-09-24');            // secondo livello, stesso giorno
  assert.deepStrictEqual([s.giorni, s.risolti], [1, 2]);
  s = S.aggiornaSerie(s, '2026-09-25', '2026-09-25');
  s = S.aggiornaSerie(s, '2026-09-26', '2026-09-26');
  assert.deepStrictEqual([s.giorni, s.record], [3, 3]);
  s = S.aggiornaSerie(s, '2026-09-20', '2026-09-27');            // archivio: conta come risolto, non come serie
  assert.deepStrictEqual([s.giorni, s.ultima, s.risolti], [3, '2026-09-26', 5]);
  assert.strictEqual(S.serieAttuale(s, '2026-09-27'), 3, 'ieri ha giocato: la serie e ancora viva');
  assert.strictEqual(S.serieAttuale(s, '2026-09-28'), 0, 'saltato un giorno');
  s = S.aggiornaSerie(s, '2026-09-29', '2026-09-29');
  assert.deepStrictEqual([s.giorni, s.record], [1, 3]);
  // a cavallo di mese e anno
  assert.strictEqual(S.giornoPrima('2027-01-01'), '2026-12-31');
  assert.strictEqual(S.giornoPrima('2028-03-01'), '2028-02-29');
  assert.deepStrictEqual(S.aggiornaSerie({ ultima: '2026-12-31', giorni: 9, record: 9, risolti: 20 }, '2027-01-01', '2027-01-01').giorni, 10);
  // dati rovinati nel localStorage
  assert.deepStrictEqual(S.aggiornaSerie({ giorni: 'x', record: null }, '2026-09-24', '2026-09-24'), { ultima: '2026-09-24', giorni: 1, record: 1, risolti: 1 });
});

test('tempo e messaggio da condividere', () => {
  assert.strictEqual(S.formatoTempo(0), '0:00');
  assert.strictEqual(S.formatoTempo(452), '7:32');
  assert.strictEqual(S.formatoTempo(3723), '1:02:03');
  assert.strictEqual(S.testoCondivisione({ data: '2026-09-24', livello: 'medio', tempo: 452, aiuti: 0, serie: 3 }),
    'Sudoku del giorno 24/09/2026 · Medio\n✅ Risolto in 7:32 senza aiuti\n🔥 3 giorni di fila\nhttps://strumentiutili.it/utilita-web/sudoku-del-giorno/');
  assert.ok(S.testoCondivisione({ data: '2026-09-24', livello: 'difficile', tempo: 60, aiuti: 1, serie: 1 }).includes('con 1 aiuto\nhttps'));
});
