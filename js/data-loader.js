// js/data-loader.js — Caricatore centralizzato delle regole fiscali.
//
// Unico punto da cui passa data/regole-fiscali-2026.json (~43 KB): prima ogni
// calcolatrice se lo scaricava per conto suo, quindi una pagina con due
// strumenti lo prendeva due volte.
(function () {
  'use strict';

  var PERCORSO = '/data/regole-fiscali-2026.json';

  var regoleCache = null;
  var richiestaInCorso = null;

  // Restituisce le regole, o null se non si riescono a caricare.
  // Le chiamate concorrenti condividono la stessa richiesta: la promessa in
  // volo viene riusata invece di far partire un secondo fetch.
  function getRegoleFiscali() {
    if (regoleCache) return Promise.resolve(regoleCache);
    if (richiestaInCorso) return richiestaInCorso;

    richiestaInCorso = fetch(PERCORSO)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' su ' + PERCORSO);
        return res.json();
      })
      .then(function (dati) {
        regoleCache = dati;
        richiestaInCorso = null;
        return dati;
      })
      .catch(function (err) {
        // La richiesta fallita non resta in cache: il prossimo tentativo riprova.
        richiestaInCorso = null;
        console.error('[DataLoader] Errore caricamento regole fiscali:', err);
        return null;
      });

    return richiestaInCorso;
  }

  window.StrumentiData = {
    getRegoleFiscali: getRegoleFiscali
  };
})();
