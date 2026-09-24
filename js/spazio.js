// js/spazio.js — "Il tuo spazio": strumenti recenti, preferiti e cancellazione.
//
// Il sito non ha account ne' server, quindi la memoria di chi torna vive solo
// nel suo browser: gli strumenti usati di recente, quelli fissati con la
// stella, i valori lasciati nei calcolatori. E' quello che trasforma una
// visita singola in un'abitudine, e deve restare sotto il controllo di chi la
// genera: tutto qui dentro si cancella con un comando, e nient'altro esce dal
// dispositivo.
//
// Tutte le chiavi del sito cominciano con "su_" (vedi js/storage-helper.js):
// "cancella tutto" vuol dire tutte quelle, e nessuna di altri siti o librerie.
//
// Funziona nel browser (window.Spazio) e in Node, dove si passa un archivio
// finto con la stessa interfaccia di localStorage.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Spazio = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var PREFISSO = 'su_';
  var CHIAVE_RECENTI = 'su_spazio_recenti';
  var CHIAVE_FISSATI = 'su_spazio_fissati';
  var MAX_RECENTI = 8;
  var MAX_FISSATI = 24;

  function archivioPredefinito() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  function crea(archivio) {
    var a = archivio === undefined ? archivioPredefinito() : archivio;

    function leggi(chiave) {
      if (!a) return [];
      try {
        var v = JSON.parse(a.getItem(chiave) || '[]');
        return Array.isArray(v) ? v.filter(valida) : [];
      } catch (e) { return []; }
    }
    function scrivi(chiave, elenco) {
      if (!a) return;
      try { a.setItem(chiave, JSON.stringify(elenco)); } catch (e) { /* spazio pieno o bloccato */ }
    }
    // Solo percorsi del sito: una voce manomessa non deve poter diventare un
    // link verso fuori nella home.
    function valida(v) {
      return v && typeof v.percorso === 'string' && /^\/[a-z0-9\-/]*\/$/.test(v.percorso) &&
        typeof v.titolo === 'string' && v.titolo.length > 0 && v.titolo.length <= 200;
    }
    function voce(percorso, titolo, ora) {
      return { percorso: String(percorso), titolo: String(titolo).trim().slice(0, 200), ora: ora == null ? Date.now() : ora };
    }

    return {
      registraVisita: function (percorso, titolo, ora) {
        var v = voce(percorso, titolo, ora);
        if (!valida(v)) return;
        var elenco = leggi(CHIAVE_RECENTI).filter(function (x) { return x.percorso !== v.percorso; });
        elenco.unshift(v);
        scrivi(CHIAVE_RECENTI, elenco.slice(0, MAX_RECENTI));
      },
      recenti: function () { return leggi(CHIAVE_RECENTI); },

      fissati: function () { return leggi(CHIAVE_FISSATI); },
      eFissato: function (percorso) {
        return leggi(CHIAVE_FISSATI).some(function (x) { return x.percorso === percorso; });
      },
      // Restituisce il nuovo stato: true se ora e' fissato.
      alterna: function (percorso, titolo, ora) {
        var elenco = leggi(CHIAVE_FISSATI);
        var gia = elenco.some(function (x) { return x.percorso === percorso; });
        if (gia) {
          scrivi(CHIAVE_FISSATI, elenco.filter(function (x) { return x.percorso !== percorso; }));
          return false;
        }
        var v = voce(percorso, titolo, ora);
        if (!valida(v)) return false;
        elenco.unshift(v);
        scrivi(CHIAVE_FISSATI, elenco.slice(0, MAX_FISSATI));
        return true;
      },

      // Per la riga "Per te" della home: prima i fissati, poi i recenti non
      // fissati, senza doppioni.
      perTe: function (quanti) {
        var fissati = leggi(CHIAVE_FISSATI);
        var visti = {};
        fissati.forEach(function (x) { visti[x.percorso] = true; });
        var recenti = leggi(CHIAVE_RECENTI).filter(function (x) { return !visti[x.percorso]; });
        return fissati.map(function (x) { return Object.assign({ fissato: true }, x); })
          .concat(recenti.map(function (x) { return Object.assign({ fissato: false }, x); }))
          .slice(0, quanti || 6);
      },

      chiavi: function () {
        var fuori = [];
        if (!a) return fuori;
        try {
          for (var i = 0; i < a.length; i++) {
            var k = a.key(i);
            if (k && k.indexOf(PREFISSO) === 0) fuori.push(k);
          }
        } catch (e) { /* archivio non leggibile */ }
        return fuori;
      },
      // Cancella tutto quello che il sito ha salvato, e solo quello.
      cancellaTutto: function () {
        var chiavi = this.chiavi();
        chiavi.forEach(function (k) { try { a.removeItem(k); } catch (e) { /* niente */ } });
        return chiavi.length;
      }
    };
  }

  var predefinito = crea();
  predefinito.crea = crea;
  predefinito.PREFISSO = PREFISSO;
  return predefinito;
});
