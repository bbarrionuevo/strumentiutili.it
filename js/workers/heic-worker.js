// js/workers/heic-worker.js — Converte una foto HEIC/HEIF in JPG, PNG o WebP.
//
// Gira in un Web Worker: la pagina ne avvia uno per processore libero (vedi
// Heic.lavoratori) e le foto si convertono in parallelo senza bloccare lo
// schermo. libheif (WebAssembly, vendor/libheif@1.23.2) decodifica, un
// OffscreenCanvas ridimensiona se richiesto e codifica. Il file non lascia il
// dispositivo: entra come ArrayBuffer ed esce come Blob.
//
// Messaggio in entrata: { id, byte: ArrayBuffer, formato: 'jpeg'|'png'|'webp', qualita: 0..1, maxLato }
// In uscita: { id, blob, larghezza, altezza, originale: [w, h], altre, ms } oppure { id, errore }
'use strict';

importScripts('/js/heic.js', '/vendor/libheif@1.23.2/libheif.js');

var LIBRERIA = null;

// Con wasmBinary gia' scaricato, onRuntimeInitialized puo' arrivare prima che
// la fabbrica restituisca il modulo: si aspetta il giro successivo.
function libreria() {
  if (!LIBRERIA) {
    LIBRERIA = fetch('/vendor/libheif@1.23.2/libheif.wasm')
      .then(function (r) { if (!r.ok) throw new Error('libreria non disponibile (' + r.status + ')'); return r.arrayBuffer(); })
      .then(function (binario) {
        return new Promise(function (ok) {
          var pronto = false, modulo = null;
          var fine = function () { if (pronto && modulo) ok(modulo); };
          modulo = self.libheif({ wasmBinary: binario, onRuntimeInitialized: function () { pronto = true; setTimeout(fine, 0); } });
          fine();
        });
      });
    LIBRERIA.catch(function () { LIBRERIA = null; }); // al prossimo file si riprova
  }
  return LIBRERIA;
}

function pixel(immagine) {
  var w = immagine.get_width(), h = immagine.get_height();
  return new Promise(function (ok, ko) {
    immagine.display({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }, function (out) {
      if (!out) ko(new Error('la foto non si decodifica'));
      else ok(new ImageData(out.data, w, h));
    });
  });
}

self.onmessage = function (e) {
  var m = e.data || {};
  var inizio = performance.now();
  var immagini = [];
  libreria()
    .then(function (lib) {
      immagini = new lib.HeifDecoder().decode(new Uint8Array(m.byte));
      if (!immagini || !immagini.length) throw new Error('nessuna immagine nel file');
      return pixel(immagini[0]);
    })
    .then(function (dati) {
      var w = dati.width, h = dati.height;
      var tela = new OffscreenCanvas(w, h);
      tela.getContext('2d').putImageData(dati, 0, 0);
      var d = self.Heic.dimensioni(w, h, m.maxLato || 0);
      var finale = tela;
      if (d.larghezza !== w || d.altezza !== h) {
        finale = new OffscreenCanvas(d.larghezza, d.altezza);
        var c = finale.getContext('2d');
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(tela, 0, 0, d.larghezza, d.altezza);
      }
      var opzioni = { type: 'image/' + (m.formato || 'jpeg') };
      if (m.formato !== 'png') opzioni.quality = m.qualita || 0.9;
      return finale.convertToBlob(opzioni).then(function (blob) {
        return { blob: blob, larghezza: d.larghezza, altezza: d.altezza, originale: [w, h] };
      });
    })
    .then(function (r) {
      self.postMessage({ id: m.id, blob: r.blob, larghezza: r.larghezza, altezza: r.altezza, originale: r.originale, altre: immagini.length - 1, ms: Math.round(performance.now() - inizio) });
    })
    .catch(function (err) {
      self.postMessage({ id: m.id, errore: String((err && err.message) || err) });
    })
    .then(function () {
      // la memoria del WebAssembly non si libera da sola
      for (var i = 0; i < immagini.length; i++) { try { immagini[i].free(); } catch (x) { /* gia' liberata */ } }
    });
};
