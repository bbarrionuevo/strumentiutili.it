// js/rli-imposte.js — Imposta di registro e bollo per registrare un affitto.
//
// Solo aritmetica, niente pagina: lo usano il compilatore del modello RLI
// (js/rli.js), la guida sulla registrazione dell'affitto (scripts/guide/) e
// i test.
//
// Regole (data/regole-fiscali-2026.json, rli_parametri): la tabella dei
// codici del quadro A nelle istruzioni del modello RLI e la Tariffa parte I,
// art. 5, del D.P.R. 131/1986.
//   - registro in percentuale (codiciContratto): 2% per L1, S1 e T3, 2% sul
//     70% del canone per L2, 1% per S2, 0,50% per T1 (fondo rustico); mai
//     meno di 67 euro (nota II dell'art. 5);
//   - imposta fissa (codiciImpostaFissa): 67 euro per L3, T2 e T4, 200 euro
//     per L4 e S3, qualunque sia il canone;
//   - bollo: 16 euro ogni quattro facciate, per ogni copia;
//   - con la cedolare secca non si pagano ne' registro ne' bollo.
// Per i codici T l'importo da indicare e' il corrispettivo dell'intera
// durata (istruzioni RLI, «Importo del canone»): il conto non cambia.
//
// Funziona nel browser (window.RliImposte) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RliImposte = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function centesimi(x) {
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  /**
   * @param {object} dati   { canone (annuo; per i codici T il corrispettivo
   *                          dell'intera durata), tipo: uno degli undici codici
   *                          L1-L4, S1-S3, T1-T4, cedolare, pagine, copie }
   * @param {object} regole rli_parametri
   * @returns {{registro:number, bollo:number, fogli:number, base:number, minimoApplicato:boolean, fissa:boolean}}
   */
  function calcola(dati, regole) {
    var canone = parseFloat(dati.canone) || 0;
    if (dati.cedolare) return { registro: 0, bollo: 0, fogli: 0, base: 0, minimoApplicato: false, fissa: false };

    var fisse = regole.codiciImpostaFissa || {};
    var p = regole.codiciContratto[dati.tipo];
    if (!p && !Object.prototype.hasOwnProperty.call(fisse, dati.tipo)) {
      throw new Error('Codice del contratto sconosciuto: ' + dati.tipo);
    }

    var fissa = !p;
    var base = canone;
    var calcolato = 0;
    var registro;
    if (fissa) {
      registro = fisse[dati.tipo];
    } else {
      base = canone * p.moltiplicatoreImponibile;
      calcolato = base * p.aliquota;
      registro = Math.max(regole.impostaRegistroMinima, calcolato);
    }

    var pagine = parseInt(dati.pagine, 10) || 4;
    var copie = parseInt(dati.copie, 10) || 2;
    var fogli = Math.ceil(pagine / 4);

    return {
      registro: centesimi(registro),
      bollo: centesimi(fogli * regole.impostaBolloFoglio * copie),
      fogli: fogli,
      base: centesimi(base),
      minimoApplicato: !fissa && calcolato < regole.impostaRegistroMinima,
      fissa: fissa
    };
  }

  return { calcola: calcola };
});
