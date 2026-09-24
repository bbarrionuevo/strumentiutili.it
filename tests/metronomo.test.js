// tests/metronomo.test.js — Il metronomo deve essere a tempo: colpi giusti,
// accenti giusti, nessuna deriva dopo un'ora, cambi di tempo senza buchi.
const test = require('node:test');
const assert = require('node:assert');

const M = require('../js/metronomo.js');

function suona(stato, da, a, passo) {
  const colpi = [];
  for (let t = da; t < a; t += passo) colpi.push(...M.pianifica(stato, t + 0.1));
  return colpi;
}

test('120 BPM in 4/4: un colpo ogni mezzo secondo, accento sul primo', () => {
  const s = M.avvia({ bpm: 120, misura: '4/4' }, 10);
  const c = M.pianifica(s, 12);
  assert.deepStrictEqual(c.map((x) => x.tempo), [10, 10.5, 11, 11.5]);
  assert.deepStrictEqual(c.map((x) => x.tipo), ['forte', 'debole', 'debole', 'debole']);
  assert.deepStrictEqual(M.pianifica(s, 12.6).map((x) => [x.tempo, x.tipo]), [[12, 'forte'], [12.5, 'debole']]);
});

test('suddivisioni e tempi composti', () => {
  const ottavi = M.pianifica(M.avvia({ bpm: 60, misura: '2/4', suddivisione: 2 }, 0), 2);
  assert.deepStrictEqual(ottavi.map((x) => x.tipo), ['forte', 'sotto', 'debole', 'sotto']);
  assert.deepStrictEqual(ottavi.map((x) => x.tempo), [0, 0.5, 1, 1.5]);
  const terzine = M.pianifica(M.avvia({ bpm: 60, misura: '4/4', suddivisione: 3 }, 0), 1);
  assert.strictEqual(terzine.length, 3);
  assert.ok(Math.abs(terzine[1].tempo - 1 / 3) < 1e-12);
  const seiOttavi = M.pianifica(M.avvia({ bpm: 180, misura: '6/8' }, 0), 2);
  assert.deepStrictEqual(seiOttavi.map((x) => x.tipo), ['forte', 'debole', 'debole', 'medio', 'debole', 'debole']);
  const setteOttavi = M.MISURE['7/8'];
  assert.strictEqual(setteOttavi.length, 7);
  assert.deepStrictEqual(setteOttavi.map((x, i) => x === 'debole' ? null : i).filter((x) => x !== null), [0, 2, 4]);   // 2+2+3
});

test('un ora a 97 BPM, pianificando ogni 25 ms: nessuna deriva', () => {
  const s = M.avvia({ bpm: 97, misura: '3/4' }, 5);
  const colpi = suona(s, 5, 5 + 3600, 0.025);
  const passo = 60 / 97;
  assert.strictEqual(colpi.length, Math.ceil((3600 + 0.1) / passo));
  colpi.forEach((c, i) => assert.ok(Math.abs(c.tempo - (5 + i * passo)) < 1e-9, 'colpo ' + i));
  // nessun colpo doppio o saltato
  for (let i = 1; i < colpi.length; i++) assert.ok(Math.abs(colpi[i].tempo - colpi[i - 1].tempo - passo) < 1e-9);
  assert.strictEqual(colpi.filter((c) => c.tipo === 'forte').length, Math.ceil(colpi.length / 3));
});

test('cambiare BPM mentre suona: nessun buco, la misura continua', () => {
  const s = M.avvia({ bpm: 120, misura: '4/4' }, 0);
  const prima = M.pianifica(s, 1.1);             // colpi a 0, 0.5, 1 (battiti 1, 2, 3)
  assert.strictEqual(prima.length, 3);
  const n = M.cambia(s, { bpm: 60 });
  const dopo = M.pianifica(n, 4.6);
  assert.strictEqual(dopo[0].tempo, 1.5, 'il colpo gia previsto resta al suo posto');
  assert.deepStrictEqual(dopo.map((x) => x.battito), [3, 0, 1, 2]);
  assert.deepStrictEqual(dopo.map((x) => x.tempo), [1.5, 2.5, 3.5, 4.5]);
  // cambiare misura riparte dal primo battito
  const m = M.cambia(n, { misura: '3/4' });
  assert.deepStrictEqual(M.pianifica(m, 7.6).map((x) => [x.tempo, x.tipo]), [[5.5, 'forte'], [6.5, 'debole'], [7.5, 'debole']]);
});

test('cambiare BPM a meta di una suddivisione: si riparte dal battito dopo', () => {
  const s = M.avvia({ bpm: 60, misura: '4/4', suddivisione: 2 }, 0);
  M.pianifica(s, 0.6);                           // colpi a 0 (battito 1) e 0.5 (sotto)
  const n = M.cambia(s, { bpm: 120 });
  const c = M.pianifica(n, 1.6);
  assert.deepStrictEqual(c.map((x) => [x.tempo, x.battito, x.tipo]), [[1, 1, 'debole'], [1.25, 1, 'sotto'], [1.5, 2, 'debole']]);
});

test('tap tempo: mediana dei tocchi, pausa lunga ricomincia', () => {
  assert.strictEqual(M.bpmDaTocchi([0, 500, 1000, 1500]), 120);
  assert.strictEqual(M.bpmDaTocchi([0, 490, 1010, 1500, 2000, 2510]), 120, 'tocchi imprecisi');
  assert.strictEqual(M.bpmDaTocchi([0, 1000, 5000, 5600, 6200]), 100, 'dopo la pausa conta solo il nuovo gruppo');
  assert.strictEqual(M.bpmDaTocchi([7000]), null);
  assert.strictEqual(M.bpmDaTocchi([0, 100]), 250, 'limite massimo');
});

test('limiti e indicazioni di tempo in italiano', () => {
  assert.strictEqual(M.limita(10), 30);
  assert.strictEqual(M.limita(999), 250);
  assert.strictEqual(M.limita('abc'), 100);
  assert.strictEqual(M.limita(119.6), 120);
  const nomi = { 30: 'Grave', 50: 'Largo', 60: 'Larghetto', 70: 'Adagio', 90: 'Andante', 110: 'Moderato', 120: 'Allegro', 160: 'Vivace', 180: 'Presto', 220: 'Prestissimo' };
  for (const [bpm, nome] of Object.entries(nomi)) assert.strictEqual(M.nomeTempo(Number(bpm)), nome, bpm);
  assert.strictEqual(M.avvia({ bpm: 90, misura: '13/16', suddivisione: 7 }, 0).misura, '4/4');
});
