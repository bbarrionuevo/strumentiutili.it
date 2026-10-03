// js/heic.js — Le parti pure del convertitore di foto HEIC dell'iPhone.
//
// Riconoscere un file HEIC/HEIF dall'intestazione (non dall'estensione), dare
// un nome ai file convertiti senza doppioni, ridurre le dimensioni se richiesto
// e decidere quante conversioni fare in parallelo. La decodifica vera la fa
// libheif in WebAssembly dentro js/workers/heic-worker.js; l'interfaccia e' in
// js/heic-ui.js. Nessun file lascia il dispositivo.
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.Heic = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Marchi del box "ftyp" delle immagini HEIF: foto (heic, heix, mif1),
  // sequenze e Live Photo (hevc, hevx, msf1), varianti multilivello.
  const MARCHI = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1'];

  /** true se i primi byte sono quelli di un file HEIC/HEIF. */
  function eHeic(byte) {
    if (!byte || byte.length < 16) return false;
    const testo = (da, a) => String.fromCharCode.apply(null, Array.from(byte.slice(da, a)));
    if (testo(4, 8) !== 'ftyp') return false;
    const lunghezza = ((byte[0] << 24) >>> 0) + (byte[1] << 16) + (byte[2] << 8) + byte[3];
    const fine = Math.min(byte.length, Math.max(16, lunghezza));
    if (MARCHI.includes(testo(8, 12))) return true;
    // marchi compatibili: dopo marchio principale (4 byte) e versione (4 byte)
    for (let i = 16; i + 4 <= fine; i += 4) if (MARCHI.includes(testo(i, i + 4))) return true;
    return false;
  }

  const ESTENSIONE = { jpeg: 'jpg', png: 'png', webp: 'webp' };

  /** I nomi dei file convertiti, nello stesso ordine, senza doppioni. */
  function nomiUscita(nomi, formato) {
    const est = ESTENSIONE[formato] || 'jpg';
    const usati = new Map();
    return (nomi || []).map((n) => {
      const base = String(n || 'foto').replace(/\.(heic|heif|hif)$/i, '') || 'foto';
      const chiave = base.toLowerCase();
      const volte = (usati.get(chiave) || 0) + 1;
      usati.set(chiave, volte);
      return (volte > 1 ? `${base} (${volte})` : base) + '.' + est;
    });
  }

  /** Larghezza e altezza finali: il lato lungo non supera maxLato (0 = nessun limite). */
  function dimensioni(larghezza, altezza, maxLato) {
    const lato = Math.max(larghezza, altezza);
    if (!maxLato || lato <= maxLato) return { larghezza, altezza };
    const k = maxLato / lato;
    return { larghezza: Math.max(1, Math.round(larghezza * k)), altezza: Math.max(1, Math.round(altezza * k)) };
  }

  /** Quante conversioni in parallelo: un processore resta libero per la pagina, al massimo 4. */
  function lavoratori(quanteFoto, processori) {
    if (!quanteFoto) return 0;
    const disponibili = Math.max(1, (processori || 3) - 1);
    return Math.max(1, Math.min(quanteFoto, disponibili, 4));
  }

  /** Il riepilogo della conversione: foto riuscite, errori, byte prima e dopo, secondi. */
  function riepilogo(esiti, ms) {
    const ok = (esiti || []).filter((e) => !e.errore);
    return {
      convertite: ok.length,
      errori: (esiti || []).length - ok.length,
      prima: ok.reduce((s, e) => s + (e.prima || 0), 0),
      dopo: ok.reduce((s, e) => s + (e.dopo || 0), 0),
      secondi: Math.round((ms || 0) / 100) / 10
    };
  }

  return { MARCHI, eHeic, nomiUscita, dimensioni, lavoratori, riepilogo };
});
