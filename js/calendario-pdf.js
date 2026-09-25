// js/calendario-pdf.js — Il calendario da stampare, in PDF vettoriale.
//
// Due formati su A4:
//   - annuale: tutto l'anno su un foglio verticale, con l'elenco delle feste;
//   - mensile: un foglio orizzontale per mese, con le caselle grandi per
//     scrivere, le feste per nome, le fasi lunari e il numero di settimana.
//
// Le date vengono da js/festivita.js; il disegno e' pdf-lib, passato da fuori
// (window.PDFLib nel browser, vendor/ nei test), cosi' questo file non
// dipende da come la libreria e' stata caricata. Tutto vettoriale: si stampa
// nitido a qualsiasi dimensione e il file pesa pochi KB.
//
// Funziona nel browser (window.CalendarioPdf) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CalendarioPdf = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var A4 = [595.28, 841.89];
  var GIORNI = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  var GIORNI_LUNGHI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

  function colori(PDFLib) {
    return {
      testo: PDFLib.rgb(0.07, 0.09, 0.15),
      tenue: PDFLib.rgb(0.42, 0.45, 0.5),
      linea: PDFLib.rgb(0.82, 0.84, 0.87),
      rosso: PDFLib.rgb(0.8, 0.12, 0.12),
      arancio: PDFLib.rgb(0.8, 0.42, 0.05),
      sfondoFesta: PDFLib.rgb(0.99, 0.94, 0.94),
      indaco: PDFLib.rgb(0.31, 0.27, 0.9)
    };
  }

  function centra(pagina, testo, font, corpo, x, larghezza, y, colore) {
    var w = font.widthOfTextAtSize(testo, corpo);
    pagina.drawText(testo, { x: x + (larghezza - w) / 2, y: y, size: corpo, font: font, color: colore });
  }

  // Taglia un testo con i puntini se non entra nella larghezza data.
  function adatta(testo, font, corpo, larghezza) {
    if (font.widthOfTextAtSize(testo, corpo) <= larghezza) return testo;
    var t = testo;
    while (t.length > 1 && font.widthOfTextAtSize(t + '…', corpo) > larghezza) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }

  // Le quattro fasi come piccoli dischi, con la parte in ombra piena: disco
  // pieno la luna nuova, vuoto la piena, mezzo pieno i quarti.
  function luna(PDFLib, pagina, fase, cx, cy, r, colore) {
    if (fase === 'nuova') { pagina.drawCircle({ x: cx, y: cy, size: r, color: colore }); return; }
    pagina.drawCircle({ x: cx, y: cy, size: r, borderColor: colore, borderWidth: 0.8 });
    if (fase === 'piena') return;
    // Dall'Italia il primo quarto e' illuminato a destra (ombra a sinistra),
    // l'ultimo a sinistra. Nel tracciato SVG l'asse y scende: l'arco da sopra
    // a sotto con sweep 0 passa a sinistra, con sweep 1 a destra.
    var sweep = fase === 'primo-quarto' ? 0 : 1;
    var path = 'M 0 ' + (-r) + ' A ' + r + ' ' + r + ' 0 0 ' + sweep + ' 0 ' + r + ' Z';
    pagina.drawSvgPath(path, { x: cx, y: cy, color: colore });
  }

  // I caratteri standard del PDF (Helvetica) scrivono solo WinAnsi: Latin-1
  // piu' qualche segno tipografico. Un nome scritto a mano con un emoji o in
  // cirillico farebbe fallire pdf-lib: quei caratteri si tolgono.
  var WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function winAnsi(testo) {
    var fuori = '';
    for (var i = 0; i < testo.length; i++) {
      var c = testo.charCodeAt(i);
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.indexOf(testo[i]) >= 0) fuori += testo[i];
    }
    return fuori.replace(/\s+/g, ' ').trim();
  }

  function opzioniComplete(o) {
    var x = o || {};
    var patrono = null;
    if (x.patrono && x.patrono.md) {
      patrono = { md: x.patrono.md, nome: winAnsi(String(x.patrono.nome || '')).slice(0, 60) || 'Santo patrono' };
    }
    return {
      anno: x.anno,
      formato: x.formato === 'mensile' ? 'mensile' : 'annuale',
      settimane: x.settimane !== false,
      lune: x.lune !== false,
      ricorrenze: x.ricorrenze !== false,
      patrono: patrono
    };
  }

  // ---------------------------------------------------------------- annuale

  function annuale(PDFLib, doc, F, font, grassetto, o, festivi) {
    var C = colori(PDFLib);
    var p = doc.addPage(A4);
    var W = A4[0], H = A4[1], M = 36;
    centra(p, 'Calendario ' + o.anno, grassetto, 26, 0, W, H - M - 22, C.testo);

    var colonne = 3, righe = 4;
    var gx = 14, gy = 10;
    var bw = (W - 2 * M - (colonne - 1) * gx) / colonne;
    var top = H - M - 44;
    var altezzaGriglia = 590;
    var bh = (altezzaGriglia - (righe - 1) * gy) / righe;
    var cw = (bw - (o.settimane ? 14 : 0)) / 7;
    var ox = o.settimane ? 14 : 0;

    for (var m = 1; m <= 12; m++) {
      var col = (m - 1) % colonne, riga = Math.floor((m - 1) / colonne);
      var x0 = M + col * (bw + gx), y0 = top - riga * (bh + gy);
      p.drawText(F.NOMI_MESI[m - 1], { x: x0 + ox + 2, y: y0 - 14, size: 11, font: grassetto, color: C.indaco });
      GIORNI.forEach(function (g, i) {
        centra(p, g, grassetto, 7.5, x0 + ox + i * cw, cw, y0 - 28, i === 6 ? C.rosso : C.tenue);
      });
      F.grigliaMese(o.anno, m).forEach(function (r, ri) {
        var y = y0 - 42 - ri * 14.5;
        if (o.settimane) p.drawText(String(r.settimana), { x: x0 + 1, y: y, size: 6, font: font, color: C.tenue });
        r.giorni.forEach(function (d, i) {
          if (!d) return;
          var festa = festivi[d];
          var rosso = i === 6 || (festa && festa.some(function (f) { return f.tipo === 'nazionale'; }));
          var colore = rosso ? C.rosso : (festa ? C.arancio : C.testo);
          centra(p, String(Number(d.slice(8))), festa || i === 6 ? grassetto : font, 8.5, x0 + ox + i * cw, cw, y, colore);
        });
      });
    }

    // Elenco delle feste in fondo al foglio, su due colonne.
    var elenco = F.festivita(o.anno, o.patrono);
    var yEl = top - altezzaGriglia - 20;
    p.drawText('Festività ' + o.anno, { x: M, y: yEl, size: 10, font: grassetto, color: C.testo });
    var meta = Math.ceil(elenco.length / 2);
    elenco.forEach(function (f, i) {
      var colonna = i < meta ? 0 : 1;
      var y = yEl - 14 - (i % meta) * 11;
      var giorno = Number(f.data.slice(8)) + ' ' + F.NOMI_MESI[Number(f.data.slice(5, 7)) - 1].toLowerCase() +
        ' (' + GIORNI_LUNGHI[F.giornoSettimana(f.data)].toLowerCase() + ')';
      var x = M + colonna * ((W - 2 * M) / 2);
      p.drawText(giorno, { x: x, y: y, size: 8, font: grassetto, color: f.tipo === 'patrono' ? C.arancio : C.rosso });
      p.drawText(adatta(f.nome, font, 8, (W - 2 * M) / 2 - 120), { x: x + 118, y: y, size: 8, font: font, color: C.testo });
    });
    p.drawText('strumentiutili.it — calendario da stampare', { x: M, y: 22, size: 7, font: font, color: C.linea });
  }

  // ---------------------------------------------------------------- mensile

  // Una pagina A4 orizzontale con la griglia del mese. La usa anche il
  // calendario dei turni (js/turni-pdf.js), che passa in "extra":
  //   cella(pagina, data, x, yTop, larghezza, altezza)  per disegnare dentro ogni giorno;
  //   firma                                              il testo in basso a sinistra.
  function paginaMese(PDFLib, doc, F, font, grassetto, anno, m, o, festivi, extra) {
    var C = colori(PDFLib);
    var x0 = extra || {};
    var fasi = o.fasi || {};
    var ricorrenze = o.ricorrenzeMappa || {};
    var W = A4[1], H = A4[0], M = 30;
    var p = doc.addPage([W, H]);
    p.drawText(F.NOMI_MESI[m - 1] + ' ' + anno, { x: M, y: H - M - 20, size: 24, font: grassetto, color: C.testo });
    var righe = F.grigliaMese(anno, m);
    var ox = o.settimane ? 18 : 0;
    var top = H - M - 44;
    var cw = (W - 2 * M - ox) / 7;
    var ch = (top - 18 - M - 14) / righe.length;

    GIORNI_LUNGHI.forEach(function (g, i) {
      centra(p, g, grassetto, 9, M + ox + i * cw, cw, top - 12, i === 6 ? C.rosso : C.tenue);
    });
    righe.forEach(function (r, ri) {
      var yTop = top - 18 - ri * ch;
      if (o.settimane) {
        centra(p, String(r.settimana), font, 7, M, ox, yTop - ch / 2 - 3, C.tenue);
      }
      r.giorni.forEach(function (d, i) {
        var x = M + ox + i * cw;
        var festa = d && festivi[d];
        p.drawRectangle({
          x: x, y: yTop - ch, width: cw, height: ch,
          borderColor: C.linea, borderWidth: 0.6,
          color: festa ? C.sfondoFesta : undefined
        });
        if (!d) return;
        var rosso = i === 6 || (festa && festa.some(function (f) { return f.tipo === 'nazionale'; }));
        p.drawText(String(Number(d.slice(8))), {
          x: x + 6, y: yTop - 18, size: 14, font: grassetto,
          color: rosso ? C.rosso : (festa ? C.arancio : C.testo)
        });
        // Dal basso verso l'alto: prima le ricorrenze in grigio, poi le feste.
        var scritte = (ricorrenze[d] || []).map(function (nome) { return { nome: nome, colore: C.tenue }; }).reverse()
          .concat((festa || []).map(function (f) { return { nome: f.nome, colore: f.tipo === 'patrono' ? C.arancio : C.rosso }; }).reverse());
        scritte.forEach(function (r, k) {
          p.drawText(adatta(r.nome, font, 7, cw - 10), { x: x + 6, y: yTop - ch + 6 + k * 9, size: 7, font: font, color: r.colore });
        });
        if (fasi[d]) luna(PDFLib, p, fasi[d], x + cw - 11, yTop - 12, 4.5, C.tenue);
        if (x0.cella) x0.cella(p, d, x, yTop, cw, ch);
      });
    });
    p.drawText(x0.firma || 'strumentiutili.it — calendario da stampare', { x: M, y: 14, size: 7, font: font, color: C.linea });
    if (o.lune) {
      var legenda = [['nuova', 'luna nuova'], ['primo-quarto', 'primo quarto'], ['piena', 'luna piena'], ['ultimo-quarto', 'ultimo quarto']];
      var xl = W - M - 300;
      legenda.forEach(function (l, i) {
        luna(PDFLib, p, l[0], xl + i * 75, 17, 3.5, C.tenue);
        p.drawText(l[1], { x: xl + i * 75 + 7, y: 14, size: 7, font: font, color: C.tenue });
      });
    }
    return { pagina: p, margine: M, larghezza: W, altezza: H };
  }

  function mensile(PDFLib, doc, F, font, grassetto, o, festivi) {
    var fasi = {};
    if (o.lune) F.fasiLunari(o.anno).forEach(function (f) { fasi[f.data] = f.fase; });
    var ricorrenze = {};
    if (o.ricorrenze) F.ricorrenze(o.anno).forEach(function (r) { (ricorrenze[r.data] = ricorrenze[r.data] || []).push(r.breve || r.nome); });
    var om = Object.assign({}, o, { fasi: fasi, ricorrenzeMappa: ricorrenze });
    for (var m = 1; m <= 12; m++) paginaMese(PDFLib, doc, F, font, grassetto, o.anno, m, om, festivi);
  }

  /**
   * @param {object} PDFLib  la libreria pdf-lib
   * @param {object} F       js/festivita.js
   * @param {object} opzioni { anno, formato: 'annuale'|'mensile', settimane, lune, ricorrenze, patrono: { md, nome } }
   * @returns {Promise<Uint8Array>}
   */
  function crea(PDFLib, F, opzioni) {
    var o = opzioniComplete(opzioni);
    if (!Number.isInteger(o.anno) || o.anno < 1900 || o.anno > 2200) return Promise.reject(new Error('Anno non valido'));
    var festivi = F.mappaFestivita(o.anno, o.patrono);
    return PDFLib.PDFDocument.create().then(function (doc) {
      doc.setTitle('Calendario ' + o.anno);
      doc.setAuthor('StrumentiUtili.it');
      doc.setCreator('StrumentiUtili.it');
      doc.setLanguage('it-IT');
      return Promise.all([doc.embedFont(PDFLib.StandardFonts.Helvetica), doc.embedFont(PDFLib.StandardFonts.HelveticaBold)])
        .then(function (fonti) {
          if (o.formato === 'mensile') mensile(PDFLib, doc, F, fonti[0], fonti[1], o, festivi);
          else annuale(PDFLib, doc, F, fonti[0], fonti[1], o, festivi);
          return doc.save();
        });
    });
  }

  return { crea: crea, winAnsi: winAnsi, paginaMese: paginaMese, colori: colori, adatta: adatta, centra: centra };
});
