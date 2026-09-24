// tests/intonazione.test.js — L'accordatore su segnali sintetici: sinusoidi,
// corde ricche di armoniche, fondamentale debole, rumore e silenzio.
const test = require('node:test');
const assert = require('node:assert');

const I = require('../js/intonazione.js');

// Rumore riproducibile (mulberry32): un generatore lineare congruenziale
// fatto con i numeri in virgola mobile degenera e crea periodicita' finte.
function casuale(seme) {
  let a = seme;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
}

// Un suono "da corda": fondamentale piu' armoniche, con fase fissa.
function segnale(f, sr, n, o) {
  const opz = o || {};
  const armoniche = opz.armoniche || [1];
  const rumore = casuale(opz.seme || 1);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    armoniche.forEach((a, k) => { v += a * Math.sin(2 * Math.PI * f * (k + 1) * i / sr + k); });
    x[i] = (opz.ampiezza || 0.3) * v / armoniche.length + (opz.rumore || 0) * rumore();
  }
  return x;
}

test('sinusoidi: La 440 e le corde della chitarra entro un cent', () => {
  for (const sr of [44100, 48000]) {
    for (const f of [82.41, 110, 146.83, 196, 246.94, 329.63, 440, 880]) {
      const r = I.yin(segnale(f, sr, 4096), sr);
      assert.ok(r, f + ' Hz a ' + sr);
      assert.ok(Math.abs(I.cent(r.frequenza, f)) < 1, f + ' Hz letto ' + r.frequenza.toFixed(3));
    }
  }
});

test('corde vere: armoniche forti non ingannano sull ottava', () => {
  // Mi basso della chitarra con la seconda armonica piu' forte della fondamentale
  const mi = I.yin(segnale(82.41, 48000, 4096, { armoniche: [0.6, 1, 0.7, 0.5, 0.3, 0.2] }), 48000);
  assert.ok(Math.abs(I.cent(mi.frequenza, 82.41)) < 3, 'letto ' + mi.frequenza);
  // La del basso (55 Hz), fondamentale quasi assente come negli altoparlanti piccoli
  const la = I.yin(segnale(55, 48000, 4096, { armoniche: [0.15, 1, 0.8, 0.5] }), 48000);
  assert.ok(Math.abs(I.cent(la.frequenza, 55)) < 5, 'letto ' + la.frequenza);
  // Mi cantino del violino
  const e5 = I.yin(segnale(659.26, 44100, 4096, { armoniche: [1, 0.8, 0.6, 0.4] }), 44100);
  assert.ok(Math.abs(I.cent(e5.frequenza, 659.26)) < 2);
});

test('con il rumore di fondo: mai un errore d ottava, pochi cent', () => {
  const timbri = [[1, 0.5, 0.3], [0.6, 1, 0.7, 0.5, 0.3, 0.2], [0.15, 1, 0.8, 0.5]];
  for (let seme = 1; seme <= 6; seme++) {
    for (const armoniche of timbri) {
      for (const f of [41.2, 55, 82.41, 110, 196, 329.63, 440, 659.26, 987.77]) {
        const r = I.yin(segnale(f, 48000, 4096, { armoniche, rumore: 0.03, seme }), 48000);
        assert.ok(r, f + ' Hz');
        const c = I.cent(r.frequenza, f);
        assert.ok(Math.abs(c) < 8, f + ' Hz, seme ' + seme + ', ' + JSON.stringify(armoniche) + ': ' + c.toFixed(1) + ' cent');
      }
    }
  }
});

test('il Si grave del basso a 5 corde (31 Hz) con la finestra lunga', () => {
  // Nel browser: 8192 campioni a 48 kHz dimezzati a 4096 a 24 kHz.
  const x = I.dimezza(segnale(30.87, 48000, 8192, { armoniche: [1, 0.8, 0.5, 0.3], rumore: 0.02 }));
  const r = I.yin(x, 24000, { fMin: 25, fMax: 200 });
  assert.ok(Math.abs(I.cent(r.frequenza, 30.87)) < 5, r.frequenza);
});

test('silenzio e rumore bianco: nessuna nota', () => {
  assert.strictEqual(I.yin(new Float32Array(4096), 48000), null);
  assert.strictEqual(I.yin(segnale(440, 48000, 4096, { ampiezza: 0.001 }), 48000), null, 'troppo piano');
  const rumore = segnale(1, 48000, 4096, { ampiezza: 0, rumore: 0.3 });
  const r = I.yin(rumore, 48000);
  assert.ok(r === null || r.chiarezza < 0.7, 'il rumore non e una nota');
});

test('dimezzare il campionamento (per i telefoni lenti) non cambia la nota', () => {
  const x = segnale(110, 48000, 4096, { armoniche: [1, 0.6, 0.4] });
  const r = I.yin(I.dimezza(x), 24000);
  assert.ok(Math.abs(I.cent(r.frequenza, 110)) < 2, r.frequenza);
});

test('nomi delle note, ottave e cent', () => {
  const la = I.nota(440);
  assert.deepStrictEqual([la.nome, la.inglese, la.ottava, Math.round(la.cent)], ['La', 'A', 4, 0]);
  const mi = I.nota(82.41);
  assert.deepStrictEqual([mi.nome, mi.ottava], ['Mi', 2]);
  const crescente = I.nota(445);
  assert.strictEqual(crescente.nome, 'La');
  assert.ok(Math.abs(crescente.cent - 19.56) < 0.05, 'La a 445 Hz: +19,6 cent');
  assert.strictEqual(I.nota(277.18).nome, 'Do♯');
  // diapason a 432 Hz
  assert.ok(Math.abs(I.nota(432, 432).cent) < 1e-9);
  assert.strictEqual(I.nota(0), null);
});

test('accordature: la corda piu vicina e quanto manca', () => {
  const c = I.cordaPiuVicina(108, 'chitarra');
  assert.strictEqual(c.indice, 1);                     // La, seconda corda dal basso
  assert.ok(c.cent < -30 && c.cent > -40, 'calante di circa 32 cent: ' + c.cent);
  assert.strictEqual(I.cordaPiuVicina(73.4, 'chitarra-drop-d').nota.nome, 'Re');
  assert.strictEqual(I.cordaPiuVicina(392, 'ukulele').nota.nome, 'Sol');
  for (const [k, a] of Object.entries(I.ACCORDATURE)) {
    assert.ok(a.nome && a.corde.length >= 4, k);
    a.corde.forEach((m) => assert.ok(m >= 20 && m <= 80, k + ' ' + m));
  }
  assert.strictEqual(I.cordaPiuVicina(440, 'arpa'), null);
});

test('mediana delle letture', () => {
  assert.strictEqual(I.mediana([440, 441, 880, 439, 440]), 440);
  assert.strictEqual(I.mediana([1, 2]), 1.5);
  assert.strictEqual(I.mediana([]), null);
});
