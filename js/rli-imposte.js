// js/rli-imposte.js — Imposta di registro e bollo per registrare un affitto.
//
// Solo aritmetica, niente pagina: lo usano il compilatore del modello RLI
// (js/rli.js), la guida sulla registrazione dell'affitto (scripts/guide/) e
// i test.
//
// Regole (data/regole-fiscali-2026.json, rli_parametri; D.P.R. 131/1986):
//   - registro: 2% del canone annuo (L2, canone concordato: sul 70%); per i
//     fondi rustici (T2, T3) lo 0,5%; mai meno di 67 euro;
//   - bollo: 16 euro ogni quattro facciate, per ogni copia;
//   - con la cedolare secca non si pagano ne' registro ne' bollo.
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
   * @param {object} dati   { canone (annuo), tipo: 'L1'|'L2'|'S1'|'T2'|'T3', cedolare, pagine, copie }
   * @param {object} regole rli_parametri
   * @returns {{registro:number, bollo:number, fogli:number, base:number, minimoApplicato:boolean}}
   */
  function calcola(dati, regole) {
    var canone = parseFloat(dati.canone) || 0;
    if (dati.cedolare) return { registro: 0, bollo: 0, fogli: 0, base: 0, minimoApplicato: false };

    var calcolato = 0;
    var base = canone;
    if (dati.tipo === 'T2' || dati.tipo === 'T3') {
      calcolato = canone * 0.005;
    } else {
      var p = regole.codiciContratto[dati.tipo];
      if (p) {
        base = canone * p.moltiplicatoreImponibile;
        calcolato = base * p.aliquota;
      }
    }
    var registro = Math.max(regole.impostaRegistroMinima, calcolato);

    var pagine = parseInt(dati.pagine, 10) || 4;
    var copie = parseInt(dati.copie, 10) || 2;
    var fogli = Math.ceil(pagine / 4);

    return {
      registro: centesimi(registro),
      bollo: centesimi(fogli * regole.impostaBolloFoglio * copie),
      fogli: fogli,
      base: centesimi(base),
      minimoApplicato: calcolato < regole.impostaRegistroMinima
    };
  }

  return { calcola: calcola };
});
