// tests/spazio.test.js — Recenti, preferiti e "cancella tutto".
const test = require('node:test');
const assert = require('node:assert');

const S = require('../js/spazio.js');

// Stessa interfaccia di localStorage.
function archivio(iniziale) {
  const m = new Map(Object.entries(iniziale || {}));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _mappa: m
  };
}

test('i recenti: il piu nuovo in cima, senza doppioni, al massimo 8', () => {
  const s = S.crea(archivio());
  for (let i = 1; i <= 10; i++) s.registraVisita('/pdf/strumento-' + i + '/', 'Strumento ' + i, i);
  s.registraVisita('/pdf/strumento-5/', 'Strumento 5', 99);
  const r = s.recenti();
  assert.strictEqual(r.length, 8);
  assert.strictEqual(r[0].percorso, '/pdf/strumento-5/');
  assert.strictEqual(r.filter((x) => x.percorso === '/pdf/strumento-5/').length, 1);
});

test('la stella: fissa e sfissa', () => {
  const s = S.crea(archivio());
  assert.strictEqual(s.alterna('/pdf/unisci-pdf/', 'Unire PDF'), true);
  assert.strictEqual(s.eFissato('/pdf/unisci-pdf/'), true);
  assert.strictEqual(s.alterna('/pdf/unisci-pdf/', 'Unire PDF'), false);
  assert.strictEqual(s.eFissato('/pdf/unisci-pdf/'), false);
});

test('"Per te": prima i fissati, poi i recenti non fissati', () => {
  const s = S.crea(archivio());
  s.registraVisita('/a/uno/', 'Uno', 1);
  s.registraVisita('/a/due/', 'Due', 2);
  s.registraVisita('/a/tre/', 'Tre', 3);
  s.alterna('/a/uno/', 'Uno');
  assert.deepStrictEqual(s.perTe(6).map((x) => [x.percorso, x.fissato]),
    [['/a/uno/', true], ['/a/tre/', false], ['/a/due/', false]]);
  assert.strictEqual(s.perTe(2).length, 2);
});

test('una voce manomessa non puo diventare un link verso fuori', () => {
  const a = archivio({ su_spazio_recenti: JSON.stringify([
    { percorso: 'https://truffa.example/', titolo: 'Truffa' },
    { percorso: '//truffa.example/', titolo: 'Truffa' },
    { percorso: '/pdf/unisci-pdf/', titolo: 'Unire PDF' },
    { percorso: '/pdf/x/', titolo: '' }
  ]) });
  const s = S.crea(a);
  assert.deepStrictEqual(s.recenti().map((x) => x.percorso), ['/pdf/unisci-pdf/']);
  s.registraVisita('javascript:alert(1)', 'x');
  assert.deepStrictEqual(s.recenti().map((x) => x.percorso), ['/pdf/unisci-pdf/']);
});

test('dati illeggibili non rompono niente', () => {
  const s = S.crea(archivio({ su_spazio_recenti: '{non json', su_spazio_fissati: '"stringa"' }));
  assert.deepStrictEqual(s.recenti(), []);
  assert.deepStrictEqual(s.fissati(), []);
  assert.deepStrictEqual(S.crea(null).recenti(), [], 'senza localStorage (navigazione privata bloccata)');
});

test('cancella tutto: tutte le chiavi del sito, nessuna di altri', () => {
  const a = archivio({
    su_form_data__cittadino_tasse_calcolo_imu_: '{"rendita":"500"}',
    su_spazio_recenti: '[]',
    su_compilatore_moduli: '{}',
    'transformers-cache': 'di una libreria',
    altro_sito: 'x'
  });
  const s = S.crea(a);
  assert.strictEqual(s.cancellaTutto(), 3);
  assert.deepStrictEqual([...a._mappa.keys()].sort(), ['altro_sito', 'transformers-cache']);
});
