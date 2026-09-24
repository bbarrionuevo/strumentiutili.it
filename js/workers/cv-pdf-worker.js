/*
 * js/workers/cv-pdf-worker.js
 * Impaginazione PDF del CV ATS fuori dal thread principale.
 * Helvetica (font standard PDF): testo estraibile carattere per carattere, nessuna legatura.
 */
'use strict';

var erroreMotore = null;
try {
  importScripts('/vendor/jspdf@2.5.1/jspdf.umd.min.js');
} catch (e) {
  erroreMotore = 'Impossibile caricare il motore PDF. Verifica la connessione e riprova.';
}

var COLORE = {
  testo: [17, 24, 39],
  secondario: [75, 85, 99],
  linea: [156, 163, 175]
};

function componiPdf(m) {
  var doc = new self.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
  var W = doc.internal.pageSize.getWidth();
  var H = doc.internal.pageSize.getHeight();
  var MARGINE = 56;
  var LARGHEZZA = W - MARGINE * 2;
  var y = MARGINE;

  doc.setProperties({
    title: m.meta.titolo,
    subject: 'Curriculum Vitae',
    author: m.nome,
    keywords: m.meta.paroleChiave,
    creator: 'StrumentiUtili.it - Generatore CV ATS'
  });
  doc.setLanguage('it-IT');

  function spazio(altezza) {
    if (y + altezza > H - MARGINE) {
      doc.addPage();
      y = MARGINE;
    }
  }

  function stile(dimensione, peso, colore) {
    doc.setFont('helvetica', peso);
    doc.setFontSize(dimensione);
    doc.setTextColor(colore[0], colore[1], colore[2]);
  }

  function scrivi(testo, dimensione, peso, colore, dopo) {
    if (!testo) return;
    stile(dimensione, peso, colore);
    var interlinea = dimensione * 1.35;
    var righe = doc.splitTextToSize(testo, LARGHEZZA);
    for (var i = 0; i < righe.length; i++) {
      spazio(interlinea);
      doc.text(righe[i], MARGINE, y + dimensione);
      y += interlinea;
    }
    y += dopo || 0;
  }

  function scriviPunto(testo, dimensione) {
    stile(dimensione, 'normal', COLORE.testo);
    var rientro = 11;
    var interlinea = dimensione * 1.35;
    var righe = doc.splitTextToSize(testo, LARGHEZZA - rientro);
    for (var i = 0; i < righe.length; i++) {
      spazio(interlinea);
      if (i === 0) doc.text('•', MARGINE + 2, y + dimensione);
      doc.text(righe[i], MARGINE + rientro, y + dimensione);
      y += interlinea;
    }
  }

  // Fototessera: fascia dedicata e centrata, nessun testo le scorre accanto
  if (m.foto) {
    var fw = 80, fh = 103;
    doc.addImage(m.foto, 'JPEG', (W - fw) / 2, y, fw, fh);
    y += fh + 14;
  }

  scrivi(m.nome, 20, 'bold', COLORE.testo, 2);
  scrivi(m.titolo, 12, 'normal', COLORE.testo, 3);
  scrivi(m.contatti, 9.5, 'normal', COLORE.secondario, 0);
  scrivi(m.link, 9.5, 'normal', COLORE.secondario, 0);
  y += 6;

  m.sezioni.forEach(function (sezione) {
    // Il titolo di sezione non resta mai orfano in fondo alla pagina
    spazio(12.5 * 1.35 + 8 + 3 * 13.5);
    y += 8;
    scrivi(sezione.titolo, 12.5, 'bold', COLORE.testo, 0);
    doc.setDrawColor(COLORE.linea[0], COLORE.linea[1], COLORE.linea[2]);
    doc.setLineWidth(0.6);
    doc.line(MARGINE, y + 1, W - MARGINE, y + 1);
    y += 7;

    sezione.voci.forEach(function (voce) {
      spazio(3 * 13.5);
      scrivi(voce.titolo, 10.5, 'bold', COLORE.testo, 0);
      scrivi(voce.sottotitolo, 10, 'normal', COLORE.testo, 0);
      scrivi(voce.periodo, 9.5, 'normal', COLORE.secondario, 1);
      (voce.paragrafi || []).forEach(function (p) {
        if (p.tipo === 'punto') scriviPunto(p.testo, 10);
        else scrivi(p.testo, 10, 'normal', COLORE.testo, 0);
      });
      scrivi(voce.nota, 9.5, 'normal', COLORE.secondario, 0);
      y += 7;
    });
  });

  if (m.gdpr) {
    y += 10;
    scrivi(m.gdpr, 8.5, 'normal', COLORE.secondario, 0);
  }

  return doc.output('arraybuffer');
}

self.onmessage = function (event) {
  var dati = event.data || {};
  if (erroreMotore || !self.jspdf) {
    self.postMessage({ type: 'error', id: dati.id, msg: erroreMotore || 'Motore PDF non disponibile.' });
    return;
  }
  try {
    var buffer = componiPdf(dati.modello);
    self.postMessage({ type: 'success', id: dati.id, buffer: buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', id: dati.id, msg: (err && err.message) || 'Errore nella generazione del PDF.' });
  }
};
