// js/rli-sanzioni.js — Sanzione e interessi per la registrazione tardiva di
// un contratto di locazione, con il ravvedimento operoso.
//
// Regole (violazioni dal 1° settembre 2024, art. 69 del TUR come modificato
// dai D.Lgs. 87/2024 e 81/2025; Agenzia delle Entrate, risoluzione n. 56 del
// 13 ottobre 2025):
//   - ritardo fino a 30 giorni: 45% dell'imposta di registro, minimo 150 euro;
//   - oltre 30 giorni: 120% dell'imposta, minimo 250 euro;
//   - per i contratti pluriennali con pagamento annuale, l'imposta e' quella
//     della prima annualita';
//   - ravvedimento (art. 13 D.Lgs. 472/1997): 1/10 entro 30 giorni, 1/9 entro
//     90, 1/8 entro un anno, 1/7 oltre;
//   - interessi al tasso legale, giorno per giorno, sull'imposta.
// Per le scadenze precedenti al 1° settembre 2024 valevano altre misure: il
// calcolo non le copre e lo dice. I numeri stanno in data/regole-fiscali-*.json.
// Funziona nel browser (window.RliSanzioni) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RliSanzioni = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var GIORNO = 86400000;

  // "AAAA-MM-GG" -> giorni dall'epoca, senza ore ne' fusi orari
  function giorni(iso) {
    var p = String(iso).split('-').map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / GIORNO);
  }
  function data(n) { return new Date(n * GIORNO).toISOString().slice(0, 10); }
  function euro(x) { return Math.round(x * 100 + 1e-9) / 100; }

  /**
   * @param {object} o
   *   imposta     imposta di registro della prima annualita' (per la cedolare secca: 0)
   *   cedolare    true se c'e' l'opzione per la cedolare secca
   *   stipula     "AAAA-MM-GG", la data da cui decorrono i 30 giorni
   *   pagamento   "AAAA-MM-GG", il giorno in cui si registra e si paga
   *   regole      rli_parametri.sanzioniRegistrazione
   *   tassi       { "2025": 0.02, "2026": 0.016 } tassi legali annui
   * @returns {{ scadenza, giorniRitardo, regime, sanzionePiena, frazione, sanzione, interessi }}
   */
  function calcola(o) {
    var r = o.regole;
    var scadenza = giorni(o.stipula) + (r.giorniPerRegistrare || 30);
    var ritardo = giorni(o.pagamento) - scadenza;
    var esito = { scadenza: data(scadenza), giorniRitardo: Math.max(0, ritardo), regime: 'in-tempo', sanzionePiena: 0, frazione: 1, sanzione: 0, interessi: 0 };
    if (ritardo <= 0) return esito;
    // la violazione e' il giorno dopo la scadenza
    if (data(scadenza + 1) < r.dal) { esito.regime = 'precedente'; return esito; }

    esito.regime = 'dal-2024';
    var fascia = ritardo <= 30 ? r.entro30giorni : r.oltre30giorni;
    esito.sanzionePiena = euro(o.cedolare ? fascia.minimo : Math.max(fascia.minimo, (o.imposta || 0) * fascia.percentuale));
    var frazione = r.ravvedimento.filter(function (f) { return f.giorniMax == null || ritardo <= f.giorniMax; })[0];
    esito.frazione = frazione.frazione;
    esito.sanzione = euro(esito.sanzionePiena * frazione.frazione);

    // interessi legali sull'imposta, anno per anno, dal giorno dopo la scadenza
    if (!o.cedolare && o.imposta > 0) {
      var totale = 0;
      for (var g = scadenza + 1; g <= scadenza + ritardo; g++) {
        var anno = data(g).slice(0, 4);
        var tasso = (o.tassi && o.tassi[anno] != null) ? o.tassi[anno] : (o.tassoVigente || 0);
        var bisestile = (Number(anno) % 4 === 0 && Number(anno) % 100 !== 0) || Number(anno) % 400 === 0;
        totale += o.imposta * tasso / (bisestile ? 366 : 365);
      }
      esito.interessi = euro(totale);
    }
    return esito;
  }

  return { calcola: calcola, giorni: giorni };
});
