// js/bollo-calcolo.js — Il conto del bollo auto e del superbollo.
//
// Solo aritmetica, niente pagina: lo usano il calcolatore
// (js/bollo-auto.js), la guida sul bollo (scripts/guide/) e i test. Cosi' il
// numero scritto in una guida e quello mostrato dallo strumento non possono
// divergere.
//
// Regole (le tariffe sono in data/regole-fiscali-2026.json, bollo_auto_2026):
//   - si conta la parte intera dei kW del libretto (185,8 kW -> 185);
//   - fino a 100 kW una tariffa per kW; per ogni kW oltre i 100 una tariffa
//     piu' alta, entrambe secondo la classe Euro e la Regione di residenza;
//   - oltre i 185 kW si aggiunge il superbollo erariale, per ogni kW in piu',
//     con la tariffa che scende con gli anni dalla costruzione.
//
// Funziona nel browser (window.BolloCalcolo) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BolloCalcolo = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function centesimi(x) {
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  /**
   * @param {object} dati    { kw, classe: 'euro_4_5_6'|..., regione: slug o '', anni }
   * @param {object} regole  bollo_auto_2026 del file delle regole
   * @returns {{kw:number, bollo:number, superbollo:number, totale:number,
   *            origine:string, tariffe:object|null, tariffaSuperbollo:number}}
   *   origine: 'regionale' (tariffa propria caricata), 'nazionale' (la Regione
   *   usa quella nazionale), 'nazionale_provvisoria' (la Regione ha tariffe
   *   proprie non ancora caricate), 'da_scegliere' (nessuna Regione indicata).
   */
  function calcola(dati, regole) {
    var kw = Math.max(0, Math.floor(Number(dati.kw) || 0));
    var regione = dati.regione || '';
    var anni = Math.max(0, Math.floor(Number(dati.anni) || 0));

    var propria = regione && regione !== 'nazionale' ? regole.regioni[regione] : null;
    var conTariffaPropria = (regole.regioni_con_tariffa_propria || []).indexOf(regione) !== -1;
    var origine = !regione ? 'da_scegliere'
      : propria ? 'regionale'
      : conTariffaPropria ? 'nazionale_provvisoria' : 'nazionale';

    var tabella = (propria || regole.regioni.nazionale).classi_euro;
    var tariffe = tabella[dati.classe] || null;

    var bollo = 0;
    if (tariffe && kw > 0) {
      bollo = kw <= 100
        ? kw * tariffe.tariffa_base
        : 100 * tariffe.tariffa_base + (kw - 100) * tariffe.tariffa_eccedente;
    }

    var s = regole.superbollo;
    var tariffaSuperbollo = 0;
    var superbollo = 0;
    if (kw > s.franchigia_kw) {
      for (var i = 0; i < s.scaglioni_riduzione.length; i++) {
        var f = s.scaglioni_riduzione[i];
        if (anni >= f.anni_min && anni <= f.anni_max) { tariffaSuperbollo = f.tariffa_kw; break; }
      }
      superbollo = (kw - s.franchigia_kw) * tariffaSuperbollo;
    }

    return {
      kw: kw,
      bollo: centesimi(bollo),
      superbollo: centesimi(superbollo),
      totale: centesimi(bollo + superbollo),
      origine: origine,
      tariffe: tariffe,
      tariffaSuperbollo: tariffaSuperbollo
    };
  }

  return { calcola: calcola };
});
