// js/sole.js — Alba, tramonto e mezzogiorno solare, per qualsiasi punto.
//
// Algoritmo della NOAA (il "Solar Calculator" del Global Monitoring
// Laboratory), con l'altezza di -0,833 gradi che tiene conto della
// rifrazione e del raggio del Sole: e' la definizione usata dagli
// almanacchi. Precisione di un minuto circa alle nostre latitudini.
//
// Restituisce istanti (millisecondi UTC): l'ora italiana la scrive chi
// mostra il risultato, con Intl e il fuso Europe/Rome, cosi' l'ora legale
// non si calcola due volte.
//
// Funziona nel browser (window.Sole) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Sole = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var RAD = Math.PI / 180;
  var MS_GIORNO = 86400000;

  function secoliGiuliani(jd) { return (jd - 2451545) / 36525; }

  function longitudineMedia(t) {
    var l = 280.46646 + t * (36000.76983 + t * 0.0003032);
    return ((l % 360) + 360) % 360;
  }
  function anomaliaMedia(t) { return 357.52911 + t * (35999.05029 - 0.0001537 * t); }
  function eccentricita(t) { return 0.016708634 - t * (0.000042037 + 0.0000001267 * t); }

  function equazioneDelCentro(t) {
    var m = anomaliaMedia(t) * RAD;
    return Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
      Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289;
  }

  function longitudineApparente(t) {
    var omega = 125.04 - 1934.136 * t;
    return longitudineMedia(t) + equazioneDelCentro(t) - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  }

  function obliquita(t) {
    var secondi = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
    var e0 = 23 + (26 + secondi / 60) / 60;
    return e0 + 0.00256 * Math.cos((125.04 - 1934.136 * t) * RAD);
  }

  function declinazione(t) {
    return Math.asin(Math.sin(obliquita(t) * RAD) * Math.sin(longitudineApparente(t) * RAD)) / RAD;
  }

  // Equazione del tempo, in minuti.
  function equazioneDelTempo(t) {
    var e = obliquita(t) * RAD, l0 = longitudineMedia(t) * RAD;
    var ecc = eccentricita(t), m = anomaliaMedia(t) * RAD;
    var y = Math.pow(Math.tan(e / 2), 2);
    var v = y * Math.sin(2 * l0) - 2 * ecc * Math.sin(m) + 4 * ecc * y * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) - 1.25 * ecc * ecc * Math.sin(2 * m);
    return 4 * v / RAD;
  }

  // Angolo orario (gradi) del Sole all'altezza h; null se non ci arriva mai.
  function angoloOrario(lat, dec, h) {
    var x = (Math.sin(h * RAD) - Math.sin(lat * RAD) * Math.sin(dec * RAD)) / (Math.cos(lat * RAD) * Math.cos(dec * RAD));
    if (x > 1) return { sempre: 'notte' };
    if (x < -1) return { sempre: 'giorno' };
    return { gradi: Math.acos(x) / RAD };
  }

  // Minuti dopo la mezzanotte UTC dell'evento: -1 alba, 0 mezzogiorno, +1 tramonto.
  function minutiUtc(jd0, lat, lon, verso, h) {
    var minuti = 720 - 4 * lon;   // prima stima: mezzogiorno solare medio
    for (var giro = 0; giro < 3; giro++) {
      var t = secoliGiuliani(jd0 + minuti / 1440);
      var mezzogiorno = 720 - 4 * lon - equazioneDelTempo(t);
      if (!verso) { minuti = mezzogiorno; continue; }
      var a = angoloOrario(lat, declinazione(t), h);
      if (a.sempre) return a;
      minuti = mezzogiorno + verso * 4 * a.gradi;
    }
    return { minuti: minuti };
  }

  /**
   * @param {string} data 'AAAA-MM-GG' (giorno civile)
   * @param {number} lat  gradi, nord positivo
   * @param {number} lon  gradi, est positivo
   * @returns {{ alba: number|null, tramonto: number|null, mezzogiorno: number, durata: number|null, sempre: string|null }}
   *          istanti in ms UTC; durata del giorno in minuti
   */
  function calcola(data, lat, lon) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data));
    if (!p || !(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) throw new Error('Dati non validi');
    var mezzanotte = Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3]));
    var jd0 = mezzanotte / MS_GIORNO + 2440587.5;
    var h = -0.833;
    var alba = minutiUtc(jd0, lat, lon, -1, h);
    var tramonto = minutiUtc(jd0, lat, lon, 1, h);
    var mezzo = minutiUtc(jd0, lat, lon, 0, h);
    var istante = function (r) { return r.minuti === undefined ? null : Math.round(mezzanotte + r.minuti * 60000); };
    var a = istante(alba), t = istante(tramonto);
    return {
      alba: a, tramonto: t, mezzogiorno: istante(mezzo),
      durata: a !== null && t !== null ? Math.round((t - a) / 60000) : null,
      sempre: alba.sempre || null
    };
  }

  // I capoluoghi di regione, per chi non vuole dare la posizione.
  var CITTA = [
    { nome: 'Ancona', lat: 43.6158, lon: 13.5189 },
    { nome: 'Aosta', lat: 45.7370, lon: 7.3201 },
    { nome: 'Bari', lat: 41.1171, lon: 16.8719 },
    { nome: 'Bologna', lat: 44.4949, lon: 11.3426 },
    { nome: 'Cagliari', lat: 39.2238, lon: 9.1217 },
    { nome: 'Campobasso', lat: 41.5603, lon: 14.6627 },
    { nome: 'Catanzaro', lat: 38.9098, lon: 16.5877 },
    { nome: 'Firenze', lat: 43.7696, lon: 11.2558 },
    { nome: 'Genova', lat: 44.4056, lon: 8.9463 },
    { nome: 'L’Aquila', lat: 42.3498, lon: 13.3995 },
    { nome: 'Milano', lat: 45.4642, lon: 9.1900 },
    { nome: 'Napoli', lat: 40.8518, lon: 14.2681 },
    { nome: 'Palermo', lat: 38.1157, lon: 13.3615 },
    { nome: 'Perugia', lat: 43.1107, lon: 12.3908 },
    { nome: 'Potenza', lat: 40.6404, lon: 15.8056 },
    { nome: 'Roma', lat: 41.9028, lon: 12.4964 },
    { nome: 'Torino', lat: 45.0703, lon: 7.6869 },
    { nome: 'Trento', lat: 46.0748, lon: 11.1217 },
    { nome: 'Trieste', lat: 45.6495, lon: 13.7768 },
    { nome: 'Venezia', lat: 45.4408, lon: 12.3155 }
  ];

  return { calcola: calcola, CITTA: CITTA, equazioneDelTempo: equazioneDelTempo, declinazione: declinazione };
});
