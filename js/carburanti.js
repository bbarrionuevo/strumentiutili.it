// js/carburanti.js — I conti dello strumento "Prezzi carburanti oggi".
//
// I dati li prepara ogni giorno scripts/carburanti/aggiorna.js dagli open data
// del Ministero delle Imprese e del Made in Italy (data/vivi/carburanti/).
// Qui ci sono solo funzioni pure: leggere le righe dei prezzi, misurare le
// distanze, ordinare, stimare risparmio e costo di un viaggio. La posizione
// dell'utente, se la concede, resta nel browser: serve solo a questi conti.
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.Carburanti = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Stesso ordine delle righe di data/vivi/carburanti/prezzi/*.json
  const CARBURANTI = ['benzina', 'gasolio', 'gpl', 'metano'];
  const NOMI = { benzina: 'Benzina', gasolio: 'Gasolio', gpl: 'GPL', metano: 'Metano' };
  const UNITA = { benzina: 'litro', gasolio: 'litro', gpl: 'litro', metano: 'kg' };
  // GPL e metano si vendono quasi solo al servito: e' quello il prezzo di riferimento
  const MODO_TIPICO = { benzina: 'self', gasolio: 'self', gpl: 'servito', metano: 'servito' };

  /**
   * Prezzo in euro da una riga [bS, bV, gS, gV, gplS, gplV, mS, mV] in
   * millesimi. modo: 'self', 'servito' o 'migliore' (il piu' basso dei due).
   */
  function prezzo(riga, carb, modo) {
    const i = CARBURANTI.indexOf(carb);
    if (i < 0 || !Array.isArray(riga)) return null;
    const self = riga[i * 2], servito = riga[i * 2 + 1];
    const v = modo === 'self' ? self : modo === 'servito' ? servito
      : [self, servito].filter((x) => x !== null && x !== undefined).sort((a, b) => a - b)[0];
    return v === null || v === undefined ? null : v / 1000;
  }

  /** Distanza in km fra due punti (formula dell'emisenoverso). */
  function distanzaKm(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /**
   * Le province da caricare attorno a un punto: sempre la piu' vicina, piu'
   * quelle il cui centro sta entro `raggioKm`, al massimo `massimo`.
   */
  function provinceVicine(province, lat, lon, raggioKm, massimo) {
    const elenco = Object.entries(province || {})
      .filter(([, p]) => Array.isArray(p.centro))
      .map(([sigla, p]) => ({ sigla, km: distanzaKm(lat, lon, p.centro[0], p.centro[1]) }))
      .sort((a, b) => a.km - b.km);
    const fuori = elenco.filter((x, i) => i === 0 || x.km <= raggioKm);
    return fuori.slice(0, massimo || 4).map((x) => x.sigla);
  }

  /**
   * I distributori con un prezzo per il carburante scelto.
   * impianti: righe [id, nome, bandiera, indirizzo, comune, lat, lon, autostrada]
   * prezzi: { id: riga di 8 prezzi }
   * opzioni: { carb, modo, origine: {lat, lon} | null, raggioKm, ordine:
   *   'prezzo' | 'distanza', autostrade: bool, limite }
   */
  function elenca(impianti, prezzi, opzioni) {
    const o = Object.assign({ modo: 'self', ordine: 'prezzo', autostrade: false, limite: 30 }, opzioni);
    const fuori = [];
    for (const r of impianti || []) {
      const [id, nome, bandiera, indirizzo, comune, lat, lon, autostrada] = r;
      if (autostrada && !o.autostrade) continue;
      const p = prezzo(prezzi && prezzi[String(id)], o.carb, o.modo);
      if (p === null) continue;
      let km = null;
      if (o.origine && lat !== null && lon !== null) {
        km = distanzaKm(o.origine.lat, o.origine.lon, lat, lon);
        if (o.raggioKm && km > o.raggioKm) continue;
      } else if (o.origine && o.raggioKm) continue; // senza coordinate non si sa se e' vicino
      fuori.push({ id, nome, bandiera, indirizzo, comune, lat, lon, autostrada: !!autostrada, prezzo: p, km });
    }
    fuori.sort((a, b) => (o.ordine === 'distanza' && a.km !== null && b.km !== null
      ? a.km - b.km || a.prezzo - b.prezzo
      : a.prezzo - b.prezzo || (a.km !== null && b.km !== null ? a.km - b.km : 0)));
    return o.limite ? fuori.slice(0, o.limite) : fuori;
  }

  /** Quanto si risparmia su un pieno rispetto a un prezzo di riferimento (media). */
  function risparmio(quantita, prezzoScelto, riferimento) {
    if (![quantita, prezzoScelto, riferimento].every(Number.isFinite) || quantita <= 0) return null;
    return Math.round((riferimento - prezzoScelto) * quantita * 100) / 100;
  }

  /**
   * Costo di un viaggio: km percorsi, consumo in km con un litro (o un kg),
   * prezzo al litro. Con andataRitorno i km raddoppiano.
   */
  function costoViaggio(km, kmPerUnita, prezzoUnitario, andataRitorno) {
    if (![km, kmPerUnita, prezzoUnitario].every(Number.isFinite) || km <= 0 || kmPerUnita <= 0 || prezzoUnitario <= 0) return null;
    const totaleKm = andataRitorno ? km * 2 : km;
    const quantita = totaleKm / kmPerUnita;
    return { km: totaleKm, quantita: Math.round(quantita * 100) / 100, costo: Math.round(quantita * prezzoUnitario * 100) / 100 };
  }

  /**
   * Variazione della media nazionale rispetto al punto di `giorni` giorni prima
   * (o al piu' vicino precedente). null se la serie e' troppo corta.
   */
  function variazione(serie, carb, giorni) {
    if (!Array.isArray(serie) || serie.length < 2) return null;
    const ultimo = serie[serie.length - 1];
    if (!Number.isFinite(ultimo[carb])) return null;
    const limite = Date.parse(ultimo.d + 'T00:00:00Z') - giorni * 86400000;
    for (let i = serie.length - 2; i >= 0; i--) {
      if (Date.parse(serie[i].d + 'T00:00:00Z') <= limite && Number.isFinite(serie[i][carb])) {
        return { da: serie[i].d, differenza: Math.round((ultimo[carb] - serie[i][carb]) * 1000) / 1000 };
      }
    }
    return null;
  }

  /** Collegamento per le indicazioni stradali (si apre l'app di mappe del telefono). */
  function indicazioni(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return 'https://www.google.com/maps/dir/?api=1&destination=' + lat.toFixed(6) + ',' + lon.toFixed(6);
  }

  return { CARBURANTI, NOMI, UNITA, MODO_TIPICO, prezzo, distanzaKm, provinceVicine, elenca, risparmio, costoViaggio, variazione, indicazioni };
});
