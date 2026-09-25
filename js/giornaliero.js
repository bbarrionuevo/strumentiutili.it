// js/giornaliero.js — Quello che serve a tutti i giochi "del giorno".
//
// - la data di oggi in Italia, cosi' il gioco cambia a mezzanotte ora
//   italiana per tutti, anche per chi e' all'estero;
// - numeri pseudo-casuali da un seme di testo, uguali su ogni browser:
//   stesso seme, stesso gioco, senza server;
// - la serie di giorni di fila.
//
// Le date sono stringhe 'AAAA-MM-GG'. Funziona nel browser
// (window.Giornaliero) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Giornaliero = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // ------------------------------------------------------------ casualita'

  // cyrb128 + sfc32: seme da una stringa, poi numeri pseudo-casuali uguali
  // su qualsiasi motore JavaScript (solo Math.imul e operazioni a 32 bit).
  function cyrb128(testo) {
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (var i = 0, k; i < testo.length; i++) {
      k = testo.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }

  /** Una funzione che restituisce numeri fra 0 e 1, sempre gli stessi per lo stesso seme. */
  function casuale(seme) {
    var s = cyrb128(seme), a = s[0], b = s[1], c = s[2], d = s[3];
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------ date

  function testo(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  function utc(data) {
    var p = String(data).split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }

  /** La data di oggi in Italia: lo stesso gioco per tutti, anche all'estero. */
  function oggiInItalia(adesso) {
    var d = adesso || new Date();
    try {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      var v = {};
      p.forEach(function (x) { v[x.type] = x.value; });
      if (v.year && v.month && v.day) return v.year + '-' + v.month + '-' + v.day;
    } catch (e) { /* Intl senza fusi orari: si usa quello del dispositivo */ }
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** La data spostata di n giorni (anche negativi). */
  function spostaGiorni(data, n) {
    var d = utc(data);
    d.setUTCDate(d.getUTCDate() + n);
    return testo(d);
  }

  function giornoPrima(data) { return spostaGiorni(data, -1); }

  /** Quanti giorni da a a b (negativo se b viene prima). */
  function giorniFra(a, b) {
    return Math.round((utc(b) - utc(a)) / 86400000);
  }

  function valida(data) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(data)) && testo(utc(data)) === data;
  }

  // ------------------------------------------------------------ serie

  function copia(serie) {
    var s = serie && typeof serie === 'object' ? serie : {};
    return {
      ultima: typeof s.ultima === 'string' ? s.ultima : null,
      giorni: Number(s.giorni) || 0,
      record: Number(s.record) || 0,
      risolti: Number(s.risolti) || 0
    };
  }

  /**
   * La serie di giorni di fila con il gioco del giorno risolto.
   * Conta solo il gioco di oggi: rifare quelli dei giorni prima non
   * allunga la serie (se no basterebbe l'archivio).
   * @param {object} serie { ultima: 'AAAA-MM-GG', giorni, record, risolti }
   * @param {string} data  il giorno del gioco appena risolto
   * @param {string} oggi  la data di oggi in Italia
   */
  function aggiornaSerie(serie, data, oggi) {
    var fuori = copia(serie);
    fuori.risolti++;
    if (data !== oggi || fuori.ultima === oggi) return fuori;
    fuori.giorni = fuori.ultima === giornoPrima(oggi) ? fuori.giorni + 1 : 1;
    fuori.ultima = oggi;
    fuori.record = Math.max(fuori.record, fuori.giorni);
    return fuori;
  }

  /**
   * Il gioco di oggi e' andato male: la serie torna a zero (il record resta).
   * I giochi dei giorni prima non la toccano.
   */
  function interrompiSerie(serie, data, oggi) {
    var fuori = copia(serie);
    if (data !== oggi || fuori.ultima === oggi) return fuori;
    fuori.giorni = 0;
    fuori.ultima = oggi;
    return fuori;
  }

  /** La serie come la vede l'utente oggi: se ieri non ha giocato, e' zero. */
  function serieAttuale(serie, oggi) {
    if (!serie || !serie.ultima) return 0;
    return serie.ultima === oggi || serie.ultima === giornoPrima(oggi) ? Number(serie.giorni) || 0 : 0;
  }

  return {
    casuale: casuale, oggiInItalia: oggiInItalia,
    spostaGiorni: spostaGiorni, giornoPrima: giornoPrima, giorniFra: giorniFra, valida: valida,
    aggiornaSerie: aggiornaSerie, interrompiSerie: interrompiSerie, serieAttuale: serieAttuale
  };
});
