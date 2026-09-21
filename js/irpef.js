// js/irpef.js — Motore IRPEF condiviso: unica fonte di verità per il calcolo
// progressivo dell'imposta. Gli scaglioni arrivano sempre da
// data/regole-fiscali-2026.json: qui non c'è nessuna aliquota scritta nel codice.
//
// Funziona nel browser (window.StrumentiIrpef), dentro un Web Worker
// (self.StrumentiIrpef) e in Node (module.exports), così i test girano senza
// browser.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StrumentiIrpef = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function safeNumber(value, fallback) {
    var num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function round2(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
  }

  // Ordina gli scaglioni per limite crescente e mette per ultimo quello aperto
  // (limite null). Non assume quanti siano: aggiungerne uno al JSON basta.
  function normalizzaScaglioni(configIrpef) {
    if (!configIrpef || !Array.isArray(configIrpef.scaglioni) || !configIrpef.scaglioni.length) {
      throw new Error('[IRPEF] Scaglioni mancanti: regole fiscali non caricate.');
    }

    var scaglioni = configIrpef.scaglioni.map(function (s, i) {
      var aliquota = safeNumber(s.aliquota, NaN);
      if (!Number.isFinite(aliquota)) {
        throw new Error('[IRPEF] Aliquota non valida nello scaglione ' + i + '.');
      }
      return {
        limite: s.limite === null || s.limite === undefined ? Infinity : safeNumber(s.limite, NaN),
        aliquota: aliquota
      };
    });

    scaglioni.forEach(function (s, i) {
      if (!Number.isFinite(s.limite) && s.limite !== Infinity) {
        throw new Error('[IRPEF] Limite non valido nello scaglione ' + i + '.');
      }
    });

    scaglioni.sort(function (a, b) { return a.limite - b.limite; });

    if (scaglioni[scaglioni.length - 1].limite !== Infinity) {
      throw new Error('[IRPEF] Manca lo scaglione aperto (limite null).');
    }

    return scaglioni;
  }

  // Imposta lorda progressiva. Ogni scaglione tassa solo la quota di reddito
  // che gli compete; nessun indice fisso, nessun fallback con numeri scritti
  // a mano.
  function computeIRPEF(imponibile, configIrpef) {
    var income = Math.max(0, safeNumber(imponibile, 0));
    if (income === 0) return 0;

    var scaglioni = normalizzaScaglioni(configIrpef);
    var imposta = 0;
    var limiteInferiore = 0;

    for (var i = 0; i < scaglioni.length; i++) {
      var limiteSuperiore = scaglioni[i].limite;
      var quota = Math.min(income, limiteSuperiore) - limiteInferiore;
      if (quota <= 0) break;
      imposta += quota * scaglioni[i].aliquota;
      if (income <= limiteSuperiore) break;
      limiteInferiore = limiteSuperiore;
    }

    return round2(imposta);
  }

  // Aliquota media effettiva, usata dalla tassazione separata del TFR.
  function computeAliquotaMedia(imponibile, configIrpef) {
    var income = Math.max(0, safeNumber(imponibile, 0));
    if (income <= 0) return normalizzaScaglioni(configIrpef)[0].aliquota;
    return computeIRPEF(income, configIrpef) / income;
  }

  // Verifica che il campo `base` del JSON (imposta accumulata all'inizio dello
  // scaglione) sia coerente con il calcolo progressivo. Serve ai test: se
  // qualcuno aggiorna le aliquote e si dimentica le basi, se ne accorge subito.
  function verificaBasiScaglioni(configIrpef) {
    var scaglioni = normalizzaScaglioni(configIrpef);
    var incoerenze = [];
    var accumulato = 0;
    var limiteInferiore = 0;

    for (var i = 0; i < scaglioni.length; i++) {
      var dichiarata = configIrpef.scaglioni[i] ? configIrpef.scaglioni[i].base : undefined;
      if (dichiarata !== undefined && round2(dichiarata) !== round2(accumulato)) {
        incoerenze.push({ scaglione: i, dichiarata: dichiarata, calcolata: round2(accumulato) });
      }
      if (!Number.isFinite(scaglioni[i].limite)) break;
      accumulato += (scaglioni[i].limite - limiteInferiore) * scaglioni[i].aliquota;
      limiteInferiore = scaglioni[i].limite;
    }

    return incoerenze;
  }

  return {
    computeIRPEF: computeIRPEF,
    computeAliquotaMedia: computeAliquotaMedia,
    verificaBasiScaglioni: verificaBasiScaglioni,
    normalizzaScaglioni: normalizzaScaglioni,
    round2: round2,
    safeNumber: safeNumber
  };
});
