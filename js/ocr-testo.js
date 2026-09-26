// js/ocr-testo.js — Testo e parole da una foto o da un PDF scansionato.
//
// Perche' esiste, visto che il sito ha gia' due OCR: js/ocr.js e' legato al DOM
// della sua pagina e restituisce una stringa; js/ocr-campi.js rifiuta i PDF e
// dipende da window.SuNumeri. Quello che serve qui e' una terza cosa: le PAROLE
// con le loro coordinate, per immagini e per PDF, senza dipendere da nessuna
// pagina.
//
// Le coordinate sono il punto. Con quelle, le parole di una foto prendono la
// stessa forma dei frammenti di pdf.js (PdfRighe.itemsDaParole) e passano per lo
// stesso lettore di righe: un parser solo, due strade d'ingresso, una sola
// suite di test. Senza, servirebbero due estrattori da tenere allineati.
//
// Il motore vero e' js/workers/ocr-worker.js, che era gia' il migliore dei tre:
// doppia passata, punteggio semantico e riquadri per parola. Qui non si
// reimplementa niente, si apre una porta.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OcrTesto = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var WORKER = '/js/workers/ocr-worker.js';
  var TIMEOUT_MS = 180000;      // l'OCR di un PDF di piu' pagine e' lento
  var DPI = 300;                // Tesseract lavora bene intorno ai 300 DPI
  var LATO_MASSIMO = 3500;      // oltre, la memoria di un telefono non basta

  // Parole di un verbale: il worker le usa per scegliere fra le due passate di
  // riconoscimento quella che ha capito di piu'.
  var PAROLE_VERBALE = ['verbale', 'violazione', 'notifica', 'codice della strada',
                        'sanzione', 'prefetto', 'giudice di pace', 'misura ridotta',
                        'decurtazione', 'accertamento', 'spese di notifica'];

  // ------------------------------------------------------------ parte pura

  // Le pagine arrivano una per una, ognuna con coordinate che ripartono da zero:
  // unite cosi' com'erano, l'ultima riga di pagina 1 e la prima di pagina 2
  // finirebbero sulla stessa riga. Ogni pagina viene spostata sotto la
  // precedente, con un margine che nessuna interlinea puo' colmare.
  function unisciPagine(pagine, margine) {
    var salto = margine || 10000;
    var fuori = [];
    (pagine || []).forEach(function (parole, indice) {
      var scarto = indice * salto;
      (parole || []).forEach(function (p) {
        fuori.push({
          text: p.text,
          confidence: p.confidence,
          x0: p.x0,
          y0: (Number(p.y0) || 0) + scarto,
          x1: p.x1,
          y1: (Number(p.y1) || 0) + scarto
        });
      });
    });
    return fuori;
  }

  function confidenzaMedia(parole) {
    if (!parole || !parole.length) return 0;
    var somma = 0;
    for (var i = 0; i < parole.length; i++) somma += (parole[i].confidence || 0);
    return somma / parole.length;
  }

  // ------------------------------------------------- immagini e rasterizzazione

  function canvasInBlobUrl(canvas) {
    return new Promise(function (risolvi, rifiuta) {
      canvas.toBlob(function (blob) {
        if (!blob) return rifiuta(new Error('Conversione dell’immagine non riuscita.'));
        risolvi(URL.createObjectURL(blob));
      }, 'image/jpeg', 0.92);
    });
  }

  // Una pagina di PDF diventa un'immagine grande abbastanza perche' l'OCR la
  // legga. Stessa proporzione usata da js/ocr.js, con un tetto piu' basso:
  // qui le pagine possono essere molte.
  function paginaSuCanvas(page) {
    var base = page.getViewport({ scale: 1 });
    var scala = Math.min(DPI / 72, LATO_MASSIMO / Math.max(base.width, base.height));
    var viewport = page.getViewport({ scale: scala });
    var canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
      return canvas;
    });
  }

  // ------------------------------------------------------------------ worker

  function eseguiWorker(blobUrl, opzioni) {
    return new Promise(function (risolvi, rifiuta) {
      var worker;
      try { worker = new Worker(WORKER); }
      catch (e) { return rifiuta(new Error('Motore OCR non disponibile su questo browser.')); }

      var chiudi = function () {
        clearTimeout(timer);
        try { worker.terminate(); } catch (e) { /* gia' terminato */ }
      };
      var timer = setTimeout(function () {
        chiudi();
        rifiuta(new Error('La lettura sta impiegando troppo tempo: inserisci i dati a mano.'));
      }, TIMEOUT_MS);

      worker.onmessage = function (evento) {
        var d = evento.data || {};
        if (d.type === 'progress' && opzioni.onProgresso) opzioni.onProgresso(opzioni.prefisso + d.pct + '%');
        else if (d.type === 'status' && opzioni.onProgresso) opzioni.onProgresso(opzioni.prefisso + d.msg);
        else if (d.type === 'success') { chiudi(); risolvi({ testo: d.text || '', parole: d.words || [] }); }
        else if (d.type === 'error') { chiudi(); rifiuta(new Error(d.msg || 'Errore durante la lettura.')); }
      };
      worker.onerror = function (err) {
        chiudi();
        rifiuta(new Error((err && err.message) || 'Il motore OCR si è interrotto.'));
      };

      worker.postMessage({
        imageBlobUrl: blobUrl,
        lang: opzioni.lingua || 'ita',
        keywords: opzioni.parole || PAROLE_VERBALE
      });
    });
  }

  function leggiUnaImmagine(blobUrl, opzioni) {
    return eseguiWorker(blobUrl, opzioni).then(function (esito) {
      URL.revokeObjectURL(blobUrl);
      return esito;
    }, function (errore) {
      URL.revokeObjectURL(blobUrl);
      throw errore;
    });
  }

  // ----------------------------------------------------------------- ingresso

  // `file`: immagine o PDF. `pdfjs` serve solo per i PDF e si passa da fuori:
  // questo modulo non scarica librerie.
  function leggi(file, opzioni) {
    var o = opzioni || {};
    if (!file) return Promise.reject(new Error('Nessun file da leggere.'));

    var pdf = /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf';
    if (!pdf) {
      if (o.onProgresso) o.onProgresso('Lettura dell’immagine…');
      return leggiUnaImmagine(URL.createObjectURL(file), { onProgresso: o.onProgresso, prefisso: '', lingua: o.lingua, parole: o.parole })
        .then(function (e) {
          return { testo: e.testo, parole: e.parole, confidenza: confidenzaMedia(e.parole), pagine: 1 };
        });
    }

    var lib = o.pdfjs || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
    if (!lib) return Promise.reject(new Error('Lettore PDF non disponibile.'));

    return file.arrayBuffer()
      .then(function (dati) { return lib.getDocument({ data: new Uint8Array(dati), isEvalSupported: false }).promise; })
      .then(function (doc) {
        var testi = [], perPagina = [];

        // Le pagine si fanno una alla volta di proposito: rasterizzarle tutte
        // insieme a 300 DPI esaurirebbe la memoria di un telefono.
        function passo(n) {
          if (n > doc.numPages) {
            var parole = unisciPagine(perPagina);
            return { testo: testi.join('\n'), parole: parole, confidenza: confidenzaMedia(parole), pagine: doc.numPages };
          }
          if (o.onProgresso) o.onProgresso('Pagina ' + n + ' di ' + doc.numPages + ': preparazione…');
          return doc.getPage(n)
            .then(paginaSuCanvas)
            .then(function (canvas) {
              return canvasInBlobUrl(canvas).then(function (url) {
                return leggiUnaImmagine(url, {
                  onProgresso: o.onProgresso,
                  prefisso: 'Pagina ' + n + ' di ' + doc.numPages + ': ',
                  lingua: o.lingua,
                  parole: o.parole
                }).then(function (esito) {
                  canvas.width = 0;          // libera la memoria prima della prossima
                  testi.push(esito.testo);
                  perPagina.push(esito.parole);
                  return passo(n + 1);
                });
              });
            });
        }
        return passo(1);
      });
  }

  return {
    leggi: leggi,
    unisciPagine: unisciPagine,
    confidenzaMedia: confidenzaMedia,
    PAROLE_VERBALE: PAROLE_VERBALE
  };
});
