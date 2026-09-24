// js/pdf-righe.js — Da un PDF a righe di testo, e date che siano date davvero.
//
// Questo file non sa niente di estratti conto o di multe: e' l'impalcatura che
// serve a chiunque debba leggere un documento della pubblica amministrazione nel
// browser. E' nato dentro js/estratto-import.js ed e' stato tirato fuori quando
// e' servito una seconda volta, perche' contiene due correzioni pagate care:
//
//   1. **Le pagine ruotate.** Molti PDF della PA hanno page.rotate === 90. Nelle
//      coordinate grezze di pdf.js le celle di una riga condividono la X e
//      cambiano la Y: raggruppando per Y si ottengono le COLONNE, e da un
//      documento perfettamente valido non si riconosce niente. Le coordinate
//      devono passare per la matrice della vista.
//
//   2. **Le date che non esistono.** 31/02 e 16/13 hanno la forma giusta. Senza
//      un controllo, new Date le fa scivolare al mese dopo in silenzio, e un
//      conteggio di termini sbagliato di due giorni non lo scopre nessuno.
//
// Duplicare queste due cose significherebbe correggerle una volta sola la
// prossima volta.
//
// Funziona nel browser (window.PdfRighe) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PdfRighe = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // ------------------------------------------------------------------- date

  // Una data con la forma giusta non e' per forza una data. Il controllo e' un
  // giro di andata e ritorno: se i componenti che rimette fuori Date non sono
  // quelli che sono entrati, la data non esiste.
  function esiste(anno, mese, giorno) {
    if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return false;
    var d = new Date(anno, mese - 1, giorno);
    return d.getFullYear() === anno && d.getMonth() === mese - 1 && d.getDate() === giorno;
  }

  function iso(anno, mese, giorno) {
    var a = Number(anno), m = Number(mese);
    if (!Number.isFinite(a) || !Number.isFinite(m) || m < 1 || m > 12) return null;
    var testa = String(a) + '-' + String(m).padStart(2, '0');
    if (giorno === undefined || giorno === null || giorno === '') return testa;
    var g = Number(giorno);
    if (!esiste(a, m, g)) return null;
    return testa + '-' + String(g).padStart(2, '0');
  }

  // Accetta 2020-01-31, 31/01/2020, 31-01-2020 e 2020-03 (anno e mese soltanto).
  function normalizzaData(testo) {
    var t = String(testo || '').trim();
    if (!t) return null;

    var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(m[1], m[2], m[3]);

    var ita = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (ita) return iso(ita[3], ita[2], ita[1]);

    var annoMese = t.match(/^(\d{4})[\/\-.](\d{1,2})$/);
    if (annoMese) return iso(annoMese[1], annoMese[2]);

    return null;
  }

  var RE_DATA = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{4}-\d{2}-\d{2})\b/g;

  // Tutte le date che compaiono in una riga, nell'ordine in cui compaiono e
  // nella forma in cui erano scritte: chi chiama decide che farne.
  function dateInTesto(testo) {
    var t = String(testo || '');
    RE_DATA.lastIndex = 0;
    var fuori = [], m;
    while ((m = RE_DATA.exec(t)) !== null) fuori.push(m[1]);
    return fuori;
  }

  // ------------------------------------------------------------------ righe

  // Un PDF non ha il concetto di riga: ha pezzi di testo con una posizione.
  // Si raggruppano per coordinata verticale e si ordinano per orizzontale.
  function righeDaContenuto(items, tolleranza) {
    var soglia = tolleranza || 2;
    var gruppi = [];
    (items || []).forEach(function (it) {
      var y = it.transform ? it.transform[5] : 0;
      var x = it.transform ? it.transform[4] : 0;
      var g = null;
      for (var i = 0; i < gruppi.length; i++) {
        if (Math.abs(gruppi[i].y - y) <= soglia) { g = gruppi[i]; break; }
      }
      if (!g) { g = { y: y, pezzi: [] }; gruppi.push(g); }
      g.pezzi.push({ x: x, testo: it.str || '' });
    });

    gruppi.sort(function (a, b) { return b.y - a.y; });          // dall'alto in basso
    return gruppi.map(function (g) {
      g.pezzi.sort(function (a, b) { return a.x - b.x; });        // da sinistra a destra
      return g.pezzi.map(function (p) { return p.testo; }).join(' ').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  // Porta i frammenti nello spazio della pagina come si vede, tenendo conto
  // della rotazione. La Y viene invertita perche' nello spazio della vista
  // cresce verso il basso, mentre righeDaContenuto ordina dall'alto come nello
  // spazio del PDF.
  function itemsInVista(pagina, items, lib) {
    var vp = null;
    try { vp = pagina.getViewport({ scale: 1 }); } catch (e) { vp = null; }
    if (!vp || !vp.transform || !lib || !lib.Util || !lib.Util.transform) return items || [];

    return (items || []).map(function (it) {
      if (!it.transform) return it;
      var m = lib.Util.transform(vp.transform, it.transform);
      return { str: it.str, transform: [m[0], m[1], m[2], m[3], m[4], -m[5]] };
    });
  }

  // Le parole che restituisce l'OCR hanno un riquadro, non una matrice: qui
  // prendono la stessa forma dei frammenti di pdf.js, cosi una foto e un PDF
  // possono passare per lo stesso lettore di righe invece che per due.
  function itemsDaParole(parole) {
    return (parole || [])
      .filter(function (p) { return p && String(p.text || '').trim(); })
      .map(function (p) {
        return { str: p.text, transform: [1, 0, 0, 1, Number(p.x0) || 0, -(Number(p.y0) || 0)] };
      });
  }

  // Legge tutte le pagine di un PDF e ne restituisce le righe, gia' raddrizzate.
  // `pdfjs` si passa da fuori: questo modulo non scarica niente.
  function righeDaPdf(dati, pdfjs) {
    var lib = pdfjs || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
    if (!lib) return Promise.reject(new Error('[PdfRighe] pdf.js non disponibile.'));

    return lib.getDocument({ data: dati }).promise.then(function (doc) {
      var numeri = [];
      for (var i = 1; i <= doc.numPages; i++) numeri.push(i);

      return Promise.all(numeri.map(function (n) {
        return doc.getPage(n).then(function (pg) {
          return pg.getTextContent().then(function (c) {
            return itemsInVista(pg, c.items, lib);
          });
        });
      })).then(function (perPagina) {
        var righe = [];
        perPagina.forEach(function (items) { righe = righe.concat(righeDaContenuto(items)); });
        return righe;
      });
    });
  }

  return {
    esiste: esiste,
    iso: iso,
    normalizzaData: normalizzaData,
    dateInTesto: dateInTesto,
    righeDaContenuto: righeDaContenuto,
    itemsInVista: itemsInVista,
    itemsDaParole: itemsDaParole,
    righeDaPdf: righeDaPdf
  };
});
