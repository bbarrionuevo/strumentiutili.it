// js/data-loader.js — Caricatore centralizzato regole fiscali
(function () {
  'use strict';

  let regoleCache = null;

  async function getRegoleFiscali() {
    if (regoleCache) return regoleCache;
    try {
      const res = await fetch('/data/regole-fiscali-2026.json');
      if (!res.ok) throw new Error('Impossibile caricare le regole fiscali.');
      regoleCache = await res.json();
      return regoleCache;
    } catch (err) {
      console.error('[DataLoader] Errore caricamento JSON:', err);
      return null;
    }
  }

  window.StrumentiData = {
    getRegoleFiscali
  };
})();