// js/naspi-calcolo.js — Il conto della NASpI: importo, durata e riduzione mensile.
//
// Solo aritmetica, niente pagina: lo usano il calcolatore (js/naspi.js), la
// guida sulle dimissioni (scripts/guide/) e i test.
//
// Regole (in data/regole-fiscali-2026.json, naspi_parametri_2026; D.Lgs.
// 22/2015 e Legge 234/2021):
//   - retribuzione media mensile = retribuzione imponibile degli ultimi
//     quattro anni / settimane di contributi × 4,33;
//   - importo: 75% fino alla soglia, piu' il 25% della parte che la supera,
//     senza superare il massimale mensile;
//   - durata: meta' delle settimane di contributi degli ultimi quattro anni
//     (tolte quelle gia' usate per una NASpI precedente), al massimo 104;
//   - dal sesto mese (dall'ottavo con 55 anni compiuti) l'assegno cala del 3%
//     ogni mese rispetto al mese prima.
//
// Funziona nel browser (window.NaspiCalcolo) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NaspiCalcolo = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {object} dati   { eta, retribuzione, settimane, scomputo }
   * @param {object} regole naspi_parametri_2026
   * @returns {object} { esito: 'ok'|'dati_mancanti'|'settimane_insufficienti'|'nessun_mese',
   *   rmm, importoBase, settimaneSpettanti, mesi, mesePartenzaDecalage, piano: [{mese, lordo, taglio}], totale }
   */
  function calcola(dati, regole) {
    var eta = parseInt(dati.eta, 10) || 0;
    var retribuzione = parseFloat(dati.retribuzione) || 0;
    var settimane = parseInt(dati.settimane, 10) || 0;
    var scomputo = parseInt(dati.scomputo, 10) || 0;
    var vuoto = { rmm: 0, importoBase: 0, settimaneSpettanti: 0, mesi: 0, mesePartenzaDecalage: 0, piano: [], totale: 0 };

    if (eta <= 0 || retribuzione <= 0 || settimane <= 0) return Object.assign({ esito: 'dati_mancanti' }, vuoto);
    if (settimane < regole.requisiti.settimane_minime_richieste) return Object.assign({ esito: 'settimane_insufficienti' }, vuoto);

    var rmm = (retribuzione / settimane) * regole.coefficiente_mensilizzazione;
    var importoBase = rmm <= regole.soglia_retribuzione_inps
      ? rmm * regole.aliquota_base
      : regole.soglia_retribuzione_inps * regole.aliquota_base +
        (rmm - regole.soglia_retribuzione_inps) * regole.aliquota_eccedenza;
    importoBase = Math.min(importoBase, regole.massimale_mensile_inps);

    var settimaneValide = Math.max(0, settimane - scomputo);
    var settimaneSpettanti = Math.min(settimaneValide / 2, regole.requisiti.settimane_massime_fruibili);
    var mesi = Math.floor(settimaneSpettanti / regole.coefficiente_mensilizzazione);

    var mesePartenzaDecalage = eta >= regole.decalage.soglia_eta_anni
      ? regole.decalage.mese_partenza_over55
      : regole.decalage.mese_partenza_standard;

    var piano = [];
    var totale = 0;
    var corrente = importoBase;
    for (var m = 1; m <= mesi; m++) {
      var taglio = 0;
      // La riduzione si calcola sull'importo del mese prima: e' cumulativa
      if (m >= mesePartenzaDecalage) {
        taglio = corrente * regole.decalage.percentuale_decurtazione;
        corrente -= taglio;
      }
      totale += corrente;
      piano.push({ mese: m, lordo: corrente, taglio: taglio });
    }

    return {
      esito: mesi > 0 ? 'ok' : 'nessun_mese',
      rmm: rmm,
      importoBase: importoBase,
      settimaneSpettanti: settimaneSpettanti,
      mesi: mesi,
      mesePartenzaDecalage: mesePartenzaDecalage,
      piano: piano,
      totale: totale
    };
  }

  return { calcola: calcola };
});
