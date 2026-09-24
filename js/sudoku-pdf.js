// js/sudoku-pdf.js — I sudoku del giorno da stampare, in PDF vettoriale.
//
// Pagina 1: i sudoku scelti, grandi abbastanza per scriverci a penna.
// Pagina 2: le soluzioni, piu' piccole. Il disegno e' pdf-lib, passato da
// fuori come per js/calendario-pdf.js.
//
// Funziona nel browser (window.SudokuPdf) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SudokuPdf = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var A4 = [595.28, 841.89];

  function griglia(PDFLib, pagina, font, valori, x, y, lato) {
    var nero = PDFLib.rgb(0.07, 0.09, 0.15);
    var grigio = PDFLib.rgb(0.62, 0.65, 0.7);
    var c = lato / 9;
    for (var k = 0; k <= 9; k++) {
      var spesso = k % 3 === 0;
      var opz = { thickness: spesso ? 1.6 : 0.5, color: spesso ? nero : grigio };
      pagina.drawLine(Object.assign({ start: { x: x + k * c, y: y }, end: { x: x + k * c, y: y - lato } }, opz));
      pagina.drawLine(Object.assign({ start: { x: x, y: y - k * c }, end: { x: x + lato, y: y - k * c } }, opz));
    }
    var corpo = c * 0.58;
    for (var i = 0; i < 81; i++) {
      if (!valori[i]) continue;
      var testo = String(valori[i]);
      var w = font.widthOfTextAtSize(testo, corpo);
      pagina.drawText(testo, {
        x: x + (i % 9) * c + (c - w) / 2,
        y: y - Math.floor(i / 9) * c - c / 2 - corpo * 0.35,
        size: corpo, font: font, color: nero
      });
    }
  }

  function centra(pagina, testo, font, corpo, x, larghezza, y, colore) {
    var w = font.widthOfTextAtSize(testo, corpo);
    pagina.drawText(testo, { x: x + (larghezza - w) / 2, y: y, size: corpo, font: font, color: colore });
  }

  // Dove vanno le griglie: una grande al centro, due affiancate, tre con la
  // terza centrata sotto.
  function posizioni(n, W, alto) {
    if (n === 1) return [{ x: (W - 420) / 2, y: alto, lato: 420 }];
    var lato = 240, gap = (W - 2 * lato) / 3;
    var p = [{ x: gap, y: alto, lato: lato }, { x: 2 * gap + lato, y: alto, lato: lato }];
    if (n === 3) p.push({ x: (W - lato) / 2, y: alto - lato - 70, lato: lato });
    return p;
  }

  /**
   * @param {object} PDFLib
   * @param {object[]} sudoku  risultati di Sudoku.delGiorno
   * @param {object}   o       { titolo, nomiLivelli: { facile: 'Facile', ... } }
   * @returns {Promise<Uint8Array>}
   */
  function crea(PDFLib, sudoku, o) {
    var opz = o || {};
    if (!sudoku || !sudoku.length || sudoku.length > 3) return Promise.reject(new Error('Da 1 a 3 sudoku'));
    var nomi = opz.nomiLivelli || {};
    var W = A4[0], H = A4[1];
    var nero = PDFLib.rgb(0.07, 0.09, 0.15), tenue = PDFLib.rgb(0.42, 0.45, 0.5);
    return PDFLib.PDFDocument.create().then(function (doc) {
      doc.setTitle(opz.titolo || 'Sudoku del giorno');
      doc.setAuthor('StrumentiUtili.it');
      doc.setCreator('StrumentiUtili.it');
      doc.setLanguage('it-IT');
      return Promise.all([doc.embedFont(PDFLib.StandardFonts.Helvetica), doc.embedFont(PDFLib.StandardFonts.HelveticaBold)])
        .then(function (fonti) {
          var font = fonti[0], grassetto = fonti[1];
          var p1 = doc.addPage(A4);
          centra(p1, opz.titolo || 'Sudoku del giorno', grassetto, 22, 0, W, H - 60, nero);
          centra(p1, 'Metti i numeri da 1 a 9: una volta sola in ogni riga, colonna e riquadro.', font, 10, 0, W, H - 80, tenue);
          posizioni(sudoku.length, W, H - 130).forEach(function (pos, i) {
            var s = sudoku[i];
            p1.drawText(nomi[s.livello] || s.livello, { x: pos.x, y: pos.y + 10, size: 12, font: grassetto, color: nero });
            griglia(PDFLib, p1, grassetto, s.griglia, pos.x, pos.y, pos.lato);
          });
          p1.drawText('strumentiutili.it/utilita-web/sudoku-del-giorno — un sudoku nuovo ogni giorno', { x: 40, y: 30, size: 8, font: font, color: tenue });

          var p2 = doc.addPage(A4);
          centra(p2, 'Soluzioni', grassetto, 16, 0, W, H - 60, nero);
          var lato = 160, gap = (W - 3 * lato) / 4;
          sudoku.forEach(function (s, i) {
            var x = gap + i * (lato + gap), y = H - 110;
            p2.drawText(nomi[s.livello] || s.livello, { x: x, y: y + 8, size: 10, font: grassetto, color: nero });
            griglia(PDFLib, p2, font, s.soluzione, x, y, lato);
          });
          return doc.save();
        });
    });
  }

  return { crea: crea };
});
