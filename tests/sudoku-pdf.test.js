// tests/sudoku-pdf.test.js — I sudoku da stampare: due pagine, i numeri
// giusti nelle griglie e le soluzioni a parte.
const test = require('node:test');
const assert = require('node:assert');

const PDFLib = require('../vendor/pdf-lib@1.17.1/pdf-lib.min.js');
const S = require('../js/sudoku.js');
const P = require('../js/sudoku-pdf.js');

async function testiPerPagina(byte) {
  const doc = await PDFLib.PDFDocument.load(byte);
  return doc.getPages().map((p) => {
    const c = p.node.Contents();
    const flussi = c instanceof PDFLib.PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
    const sorgente = flussi.map((f) => Buffer.from(PDFLib.decodePDFRawStream(f).decode()).toString('latin1')).join('\n');
    return [...sorgente.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1'));
  });
}

const cifre = (testi) => testi.filter((t) => /^[1-9]$/.test(t)).length;

test('i tre sudoku di oggi: griglie a pagina 1, soluzioni a pagina 2', async () => {
  const sudoku = S.LIVELLI.map((l) => S.delGiorno('2026-09-24', l));
  const byte = await P.crea(PDFLib, sudoku, { titolo: 'Sudoku del 24/09/2026', nomiLivelli: S.NOMI_LIVELLI });
  const doc = await PDFLib.PDFDocument.load(byte);
  assert.strictEqual(doc.getPageCount(), 2);
  assert.strictEqual(doc.getTitle(), 'Sudoku del 24/09/2026');
  const [p1, p2] = await testiPerPagina(byte);
  assert.ok(p1.includes('Facile') && p1.includes('Medio') && p1.includes('Difficile'));
  const indizi = sudoku.reduce((n, s) => n + s.indizi, 0);
  assert.strictEqual(cifre(p1), indizi, 'a pagina 1 solo gli indizi');
  assert.strictEqual(cifre(p2), 81 * 3, 'a pagina 2 le soluzioni intere');
  assert.ok(byte.length < 40000, byte.length + ' byte');
});

test('un sudoku solo, e i limiti', async () => {
  const byte = await P.crea(PDFLib, [S.delGiorno('2026-09-24', 'medio')], {});
  const [p1] = await testiPerPagina(byte);
  assert.strictEqual(cifre(p1), S.delGiorno('2026-09-24', 'medio').indizi);
  await assert.rejects(P.crea(PDFLib, [], {}), /Da 1 a 3/);
});
