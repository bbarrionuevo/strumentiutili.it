// js/formato-numeri.js — Lettura e formattazione dei numeri in convenzione italiana
// Centralizza il parsing usato dagli strumenti: l'utente italiano digita indifferentemente
// "2,99", "2.99" o "1.234,56" e in tutti i casi deve ottenere il valore corretto.
(function () {
  'use strict';

  // Gruppi di migliaia con il punto: "1.234" o "12.500.000" (nessuna virgola presente)
  const SOLO_MIGLIAIA = /^\d{1,3}(\.\d{3})+$/;

  function parse(valore) {
    if (valore === null || valore === undefined) return null;
    if (typeof valore === 'number') return Number.isFinite(valore) ? valore : null;

    // Si tengono solo cifre, separatori e segno: cadono €, kWh, spazi e caratteri letti male dall'OCR
    let testo = String(valore).replace(/\s/g, '').replace(/[^0-9.,-]/g, '');
    if (!testo) return null;

    const negativo = testo.startsWith('-');
    testo = testo.replace(/-/g, '');

    const haVirgola = testo.includes(',');
    const haPunto = testo.includes('.');

    if (haVirgola && haPunto) {
      // Vince come separatore decimale l'ultimo dei due: 1.234,56 (it) e 1,234.56 (en)
      testo = testo.lastIndexOf(',') > testo.lastIndexOf('.')
        ? testo.replace(/\./g, '').replace(',', '.')
        : testo.replace(/,/g, '');
    } else if (haVirgola) {
      // Più virgole significano migliaia: 1,234,567
      const pezzi = testo.split(',');
      testo = pezzi.length > 2 ? pezzi.join('') : testo.replace(',', '.');
    } else if (haPunto) {
      // "1.234" sono milleduecentotrentaquattro, "1.5" è uno virgola cinque
      if (SOLO_MIGLIAIA.test(testo)) testo = testo.replace(/\./g, '');
      else if (testo.split('.').length > 2) testo = testo.replace(/\./g, '');
    }

    const numero = parseFloat(testo);
    if (!Number.isFinite(numero)) return null;
    return negativo ? -numero : numero;
  }

  // parse con vincoli: restituisce null quando il valore non è utilizzabile nel calcolo
  function parseValido(valore, opzioni) {
    const o = opzioni || {};
    const n = parse(valore);
    if (n === null) return null;
    if (o.min !== undefined && n < o.min) return null;
    if (o.max !== undefined && n > o.max) return null;
    if (o.positivo && n <= 0) return null;
    return n;
  }

  const formattatore = (decimali, opzioni) => new Intl.NumberFormat('it-IT', Object.assign({
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali
  }, opzioni || {}));

  function numero(n, decimali) {
    if (!Number.isFinite(n)) return '—';
    return formattatore(decimali === undefined ? 2 : decimali).format(n);
  }

  function euro(n, decimali) {
    if (!Number.isFinite(n)) return '—';
    return formattatore(decimali === undefined ? 2 : decimali, { style: 'currency', currency: 'EUR' }).format(n);
  }

  // Prezzi unitari e tariffe: sotto il centesimo servono più decimali per non azzerare il valore
  function euroPreciso(n) {
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1) return euro(n, 2);
    if (Math.abs(n) >= 0.01) return euro(n, 3);
    return euro(n, 4);
  }

  // Numero con decimali adattivi, senza simbolo di valuta: serve ai prezzi unitari,
  // dove l'unità di misura ("€/kg") viene aggiunta dal chiamante
  function numeroPreciso(n) {
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1) return numero(n, 2);
    if (Math.abs(n) >= 0.01) return numero(n, 3);
    return numero(n, 4);
  }

  function kwh(n, decimali) {
    if (!Number.isFinite(n)) return '—';
    return numero(n, decimali === undefined ? 2 : decimali) + ' kWh';
  }

  function percentuale(n, decimali) {
    if (!Number.isFinite(n)) return '—';
    return numero(n, decimali === undefined ? 1 : decimali) + '%';
  }

  // Durata in ore e minuti a partire dalle ore decimali (1,42 → "1 h 25 min")
  function durata(ore) {
    if (!Number.isFinite(ore) || ore <= 0) return '—';
    const totaleMinuti = Math.round(ore * 60);
    const h = Math.floor(totaleMinuti / 60);
    const m = totaleMinuti % 60;
    if (h === 0) return m + ' min';
    return h + ' h ' + String(m).padStart(2, '0') + ' min';
  }

  window.SuNumeri = { parse, parseValido, numero, numeroPreciso, euro, euroPreciso, kwh, percentuale, durata };
})();
