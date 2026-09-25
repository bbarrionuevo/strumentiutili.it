// tests/filigrana.test.js — La filigrana copre tutto il documento, il testo
// dice a chi e per cosa e' la copia, fronte e retro stanno su un A4.
const test = require('node:test');
const assert = require('node:assert');

const Fi = require('../js/filigrana.js');

test('il testo: finalita, destinatario, data e avviso', () => {
  assert.strictEqual(Fi.testo({ finalita: 'affitto', destinatario: 'Agenzia Rossi', data: '2026-09-25' }),
    'Copia per contratto di affitto – Agenzia Rossi – 25/09/2026 – non valida per altri usi');
  assert.strictEqual(Fi.testo({ finalita: 'iscrizione in palestra', data: '2026-09-25', avviso: false }),
    'Copia per iscrizione in palestra – 25/09/2026');
  assert.strictEqual(Fi.testo({}), 'Copia – non valida per altri usi');
  // niente a capo o caratteri di controllo che rompano la scritta; lunghezze limitate
  const t = Fi.testo({ finalita: 'x\ny'.repeat(50), destinatario: 'a\tb'.repeat(40) });
  assert.ok(!/[\n\t]/.test(t));
  assert.ok(t.length < 160);
  assert.ok(Fi.FINALITA.every((f) => Fi.testo({ finalita: f.id }).startsWith('Copia per ' + f.testo)));
});

// Ogni punto dell'immagine deve cadere su una fascia di scritte: nel
// riferimento ruotato, entro mezza interlinea da una riga e sotto una copia.
function coperto(w, h, larghezza, c, angolo) {
  const pos = Fi.tassellatura(w, h, larghezza, c, angolo);
  const a = angolo * Math.PI / 180;
  const passoY = c * 3.2, passoX = larghezza + c * 2;
  const righe = new Map();
  for (const p of pos) {
    const k = p.y.toFixed(6);
    if (!righe.has(k)) righe.set(k, []);
    righe.get(k).push(p.x);
  }
  const ys = [...righe.keys()].map(Number);
  let mancati = 0;
  for (let i = 0; i <= 40; i++) {
    for (let j = 0; j <= 40; j++) {
      const px = w * i / 40 - w / 2, py = h * j / 40 - h / 2;
      const qx = px * Math.cos(-a) - py * Math.sin(-a);
      const qy = px * Math.sin(-a) + py * Math.cos(-a);
      const y = ys.find((v) => Math.abs(v - qy) <= passoY / 2 + 1e-6);
      if (y === undefined) { mancati++; continue; }
      const xs = righe.get(y.toFixed(6));
      if (!xs.some((x) => x <= qx && qx < x + passoX)) mancati++;
    }
  }
  return { mancati, copie: pos.length };
}

test('la filigrana copre ogni punto, per foto verticali, orizzontali e angoli diversi', () => {
  for (const [w, h] of [[1600, 1000], [1000, 1600], [2000, 2000], [640, 400]]) {
    for (const angolo of [-30, -45, 0, 20]) {
      const c = Fi.corpo(w, h);
      const r = coperto(w, h, c * 30, c, angolo);
      assert.strictEqual(r.mancati, 0, w + 'x' + h + ' a ' + angolo + ' gradi');
      assert.ok(r.copie < 400, 'troppe copie: ' + r.copie);
    }
  }
});

test('corpo proporzionato e mai illeggibile; scala senza ingrandire', () => {
  assert.strictEqual(Fi.corpo(1600, 1000), 45);
  assert.ok(Fi.corpo(1600, 1000, 'grande') > Fi.corpo(1600, 1000) && Fi.corpo(1600, 1000, 'piccola') < Fi.corpo(1600, 1000));
  assert.strictEqual(Fi.corpo(100, 80), 14);
  assert.deepStrictEqual(Fi.scala(4000, 3000, 2000), { w: 2000, h: 1500, fattore: 0.5 });
  assert.deepStrictEqual(Fi.scala(800, 600, 2000), { w: 800, h: 600, fattore: 1 });
});

test('riquadri da oscurare: da due punti qualsiasi, dentro l immagine', () => {
  assert.deepStrictEqual(Fi.riquadro(300, 200, 100, 50, 1000, 800), { x: 100, y: 50, w: 200, h: 150 });
  assert.deepStrictEqual(Fi.riquadro(-50, -50, 100, 100, 1000, 800), { x: 0, y: 0, w: 100, h: 100 });
  assert.deepStrictEqual(Fi.riquadro(900, 700, 1200, 900, 1000, 800), { x: 900, y: 700, w: 100, h: 100 });
  assert.strictEqual(Fi.riquadro(10, 10, 11, 40, 1000, 800), null, 'un tocco non e un riquadro');
});

test('A4: una per foglio o fronte e retro insieme, dentro i margini e senza sovrapporsi', () => {
  const carta = { w: 1600, h: 1010 };
  const [W, H] = Fi.A4;
  const uno = Fi.impagina([carta, carta], false);
  assert.strictEqual(uno.length, 2);
  const insieme = Fi.impagina([carta, carta, carta], true);
  assert.deepStrictEqual(insieme.map((f) => f.length), [2, 1]);
  for (const foglio of uno.concat(insieme)) {
    for (const r of foglio) {
      assert.ok(r.x >= 39.9 && r.x + r.w <= W - 39.9 && r.y >= 39.9 && r.y + r.h <= H - 39.9, JSON.stringify(r));
      assert.ok(Math.abs(r.w / r.h - 1600 / 1010) < 1e-9, 'proporzioni conservate');
    }
    if (foglio.length === 2) assert.ok(foglio[0].y >= foglio[1].y + foglio[1].h, 'il fronte sta sopra il retro');
  }
  assert.deepStrictEqual(insieme[0].map((r) => r.indice), [0, 1]);
  assert.strictEqual(insieme[1][0].indice, 2);
});
