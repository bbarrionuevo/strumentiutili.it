// js/ravvedimento-calcolo.js — Il conto del ravvedimento operoso per un
// versamento omesso o tardivo: sanzione ridotta e interessi legali.
//
// Solo aritmetica, niente pagina: lo usano il calcolatore
// (js/ravvedimento.js), la guida sul ravvedimento (scripts/guide/) e i test.
//
// Le misure dipendono da quando e' stata commessa la violazione (il giorno
// dopo la scadenza): dal 1° settembre 2024 (D.Lgs. 87/2024) la sanzione e' del
// 25% (12,5% entro 90 giorni) e l'ultima riduzione e' 1/7 oltre un anno; prima
// era del 30% (15%) con 1/7 fino a due anni e 1/6 oltre. Le percentuali gia'
// ridotte stanno in data/regole-fiscali-2026.json (ravvedimento), come nelle
// tabelle dell'Agenzia delle Entrate.
//
// Funziona nel browser (window.RavvedimentoCalcolo) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RavvedimentoCalcolo = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var GIORNO = 86400000;

  // "AAAA-MM-GG" -> giorni dall'epoca, senza ore ne' fusi orari
  function giorni(iso) {
    var p = String(iso).split('-').map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / GIORNO);
  }
  function data(n) { return new Date(n * GIORNO).toISOString().slice(0, 10); }
  function centesimi(x) { return Math.round(x * 100 + 1e-9) / 100; }

  /** La percentuale di sanzione ridotta per quel ritardo, con l'etichetta della fascia. */
  function sanzioneRidotta(giorniRitardo, scadenzaIso, config) {
    var giornoDopo = data(giorni(scadenzaIso) + 1);
    var nuove = giornoDopo >= (config.dataNuoveSanzioni || '2024-09-01');
    var fasce = nuove || !config.frazioniTemporaliSanzionePrecedenti
      ? config.frazioniTemporaliSanzione : config.frazioniTemporaliSanzionePrecedenti;

    var precedente = 0;
    for (var i = 0; i < fasce.length; i++) {
      var fascia = fasce[i];
      if (fascia.giorniMax === null || giorniRitardo <= fascia.giorniMax) {
        // il ravvedimento «sprint» cresce ogni giorno
        var aliquota = fascia.logicaIncrementaleGiornaliera ? giorniRitardo * fascia.tassoApplicato : fascia.tassoApplicato;
        var oltre = precedente === 365 ? '1 anno' : precedente === 730 ? '2 anni' : precedente + ' gg';
        var maxLabel = fascia.giorniMax ? 'Entro ' + fascia.giorniMax + ' gg' : 'Oltre ' + oltre;
        var tipo = fascia.tipo.charAt(0).toUpperCase() + fascia.tipo.slice(1);
        return {
          aliquota: aliquota,
          fascia: fascia.tipo,
          nuove: nuove,
          etichetta: '(' + tipo + ' - ' + maxLabel + (nuove ? '' : ', regole prima del 1° settembre 2024') + ')'
        };
      }
      precedente = fascia.giorniMax;
    }
    return { aliquota: 0, fascia: '', nuove: nuove, etichetta: '' };
  }

  /** Interessi al tasso legale di ogni anno, dal giorno dopo la scadenza al pagamento compreso. */
  function interessi(importo, scadenzaIso, pagamentoIso, config) {
    var totale = 0;
    for (var g = giorni(scadenzaIso) + 1; g <= giorni(pagamentoIso); g++) {
      var anno = data(g).slice(0, 4);
      var tasso = config.tassiStoriciLegali[anno] !== undefined ? config.tassiStoriciLegali[anno] : config.tassoInteresseLegaleVigente;
      var n = Number(anno);
      var giorniAnno = (n % 4 === 0 && (n % 100 !== 0 || n % 400 === 0)) ? 366 : 365;
      totale += importo * tasso / giorniAnno;
    }
    return centesimi(totale);
  }

  /**
   * @param {object} dati   { importo, scadenza: 'AAAA-MM-GG', pagamento: 'AAAA-MM-GG', tributo: 'IRPEF'|'IVA'|'IMU'|'ALTRO' }
   * @param {object} config ravvedimento del file delle regole
   * @returns {object|null} null se il pagamento precede la scadenza
   */
  function calcola(dati, config) {
    var importo = Number(dati.importo) || 0;
    var ritardo = giorni(dati.pagamento) - giorni(dati.scadenza);
    if (ritardo < 0) return null;
    var s = sanzioneRidotta(ritardo, dati.scadenza, config);
    var sanzione = centesimi(importo * s.aliquota);
    var int = interessi(importo, dati.scadenza, dati.pagamento, config);
    var codici = config.codiciTributo[dati.tributo] || config.codiciTributo.IRPEF;
    return {
      giorni: ritardo,
      aliquota: s.aliquota,
      fascia: s.fascia,
      nuove: s.nuove,
      etichetta: s.etichetta,
      sanzione: sanzione,
      interessi: int,
      totale: centesimi(importo + sanzione + int),
      codici: codici
    };
  }

  return { calcola: calcola, sanzioneRidotta: sanzioneRidotta, interessi: interessi };
});
