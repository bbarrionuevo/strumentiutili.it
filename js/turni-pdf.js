// js/turni-pdf.js — I turni in PDF: un foglio A4 orizzontale per mese, con il
// turno di ogni giorno nel suo colore, la legenda e le ore del mese.
//
// La griglia e' la stessa del calendario da stampare (js/calendario-pdf.js,
// paginaMese): cambia solo cosa si scrive dentro le caselle. Vettoriale, si
// stampa nitido e pesa pochi KB.
//
// Funziona nel browser (window.TurniPdf) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TurniPdf = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function rgb(PDFLib, hex) {
    var n = parseInt(String(hex || '#64748b').slice(1), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  function orario(t) { return t && t.inizio ? t.inizio + '–' + t.fine : ''; }

  function numero(n) { return String(Math.round(n * 100) / 100).replace('.', ','); }

  /**
   * @param {object} PDFLib  la libreria pdf-lib
   * @param {object} F       js/festivita.js
   * @param {object} CP      js/calendario-pdf.js
   * @param {object} T       js/turni.js
   * @param {object} schema  lo schema dei turni
   * @param {object} opzioni { anno, mese, mesi: quanti mesi (1-12), titolo?: testo in alto }
   * @returns {Promise<Uint8Array>}
   */
  function crea(PDFLib, F, CP, T, schema, opzioni) {
    var o = opzioni || {};
    var mesi = Math.max(1, Math.min(12, o.mesi || 1));
    if (!Number.isInteger(o.anno) || !Number.isInteger(o.mese) || o.mese < 1 || o.mese > 12) {
      return Promise.reject(new Error('Mese non valido'));
    }
    var problema = T.problema(schema);
    if (problema) return Promise.reject(new Error(problema));
    var titolo = CP.winAnsi(String(o.titolo || '')).slice(0, 60);

    return PDFLib.PDFDocument.create().then(function (doc) {
      doc.setTitle('Turni' + (titolo ? ' - ' + titolo : ''));
      doc.setAuthor('StrumentiUtili.it');
      doc.setCreator('StrumentiUtili.it');
      doc.setLanguage('it-IT');
      return Promise.all([doc.embedFont(PDFLib.StandardFonts.Helvetica), doc.embedFont(PDFLib.StandardFonts.HelveticaBold)])
        .then(function (fonti) {
          var font = fonti[0], grassetto = fonti[1];
          var C = CP.colori(PDFLib);
          var bianco = PDFLib.rgb(1, 1, 1);
          var festiviPerAnno = {};

          for (var k = 0; k < mesi; k++) {
            var anno = o.anno + Math.floor((o.mese - 1 + k) / 12);
            var mese = ((o.mese - 1 + k) % 12) + 1;
            if (!festiviPerAnno[anno]) festiviPerAnno[anno] = F.mappaFestivita(anno);
            var festivi = festiviPerAnno[anno];
            var giorni = T.mese(schema, anno, mese, festivi);
            var perData = {};
            giorni.forEach(function (g) { perData[g.data] = g; });

            var info = CP.paginaMese(PDFLib, doc, F, font, grassetto, anno, mese,
              { settimane: false, lune: false }, festivi, {
                firma: 'strumentiutili.it — calendario turni',
                cella: function (p, d, x, yTop, cw, ch) {
                  var g = perData[d];
                  if (!g || !g.tipo) return;
                  var h = Math.min(22, ch * 0.34);
                  var y = yTop - 24 - h;
                  p.drawRectangle({ x: x + 4, y: y, width: cw - 8, height: h, color: rgb(PDFLib, g.tipo.colore) });
                  var etichetta = g.sigla + '  ' + CP.winAnsi(g.tipo.nome);
                  p.drawText(CP.adatta(etichetta, grassetto, 8.5, cw - 16), { x: x + 8, y: y + h - 10, size: 8.5, font: grassetto, color: bianco });
                  if (g.tipo.inizio) p.drawText(orario(g.tipo), { x: x + 8, y: y + 3, size: 7, font: font, color: bianco });
                  if (g.cambio) p.drawText('cambio', { x: x + cw - 34, y: yTop - 16, size: 6.5, font: font, color: C.tenue });
                }
              });

            var p = info.pagina, W = info.larghezza, H = info.altezza, M = info.margine;
            if (titolo) {
              var wt = grassetto.widthOfTextAtSize(titolo, 12);
              p.drawText(titolo, { x: W - M - wt, y: H - M - 16, size: 12, font: grassetto, color: C.testo });
            }

            // Legenda sotto il titolo, a destra: i turni usati nel mese.
            var usati = {};
            giorni.forEach(function (g) { if (g.tipo) usati[g.sigla] = g.tipo; });
            var voci = Object.keys(usati).map(function (s) {
              var t = usati[s];
              return { colore: t.colore, testo: s + ' ' + CP.winAnsi(t.nome) + (t.inizio ? ' ' + orario(t) : '') };
            });
            var xl = W - M;
            voci.reverse().forEach(function (v) {
              var w = font.widthOfTextAtSize(v.testo, 7.5) + 14;
              xl -= w;
              p.drawRectangle({ x: xl, y: H - M - 36, width: 8, height: 8, color: rgb(PDFLib, v.colore) });
              p.drawText(v.testo, { x: xl + 11, y: H - M - 35, size: 7.5, font: font, color: C.tenue });
              xl -= 8;
            });

            var r = T.riepilogo(giorni);
            var sintesi = 'Ore: ' + numero(r.ore) + '   Turni: ' + r.lavorati + '   Notti: ' + r.notti +
              '   Domeniche: ' + r.domenicheLavorate + '   Festivi: ' + r.festiviLavorati;
            var ws = font.widthOfTextAtSize(sintesi, 8);
            p.drawText(sintesi, { x: W - M - ws, y: 14, size: 8, font: grassetto, color: C.testo });
          }
          return doc.save();
        });
    });
  }

  return { crea: crea };
});
