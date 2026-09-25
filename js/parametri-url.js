// js/parametri-url.js — Una scelta gia' fatta dal link.
//
// Un menu marcato data-parametro="regione" prende il valore da
// ?regione=lombardia nell'indirizzo, se tra le opzioni c'e'. Serve ai vecchi
// indirizzi delle pagine per regione, professione o contratto, che ora portano
// allo strumento con la voce gia' scelta, e a chi condivide un link.
//
// Il valore si imposta subito, prima che gli strumenti leggano il modulo;
// js/storage-helper.js e i salvataggi dei singoli strumenti non lo
// sovrascrivono con quello ricordato (vedi daUrl).
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ParametriUrl = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /** Il valore da impostare, o null se il parametro manca o non e' un'opzione. */
  function valore(cerca, nome, opzioni) {
    var v = new URLSearchParams(cerca || '').get(nome);
    if (v === null) return null;
    v = v.trim().toLowerCase();
    return opzioni.indexOf(v) !== -1 ? v : null;
  }

  /** true se il campo ha preso il valore dall'indirizzo: non va sovrascritto. */
  function daUrl(el) {
    return !!(el && el.getAttribute && el.getAttribute('data-da-url') === '1');
  }

  function applica(doc, cerca) {
    var fatti = [];
    Array.prototype.forEach.call(doc.querySelectorAll('select[data-parametro]'), function (sel) {
      var opzioni = Array.prototype.map.call(sel.options, function (o) { return o.value; });
      var v = valore(cerca, sel.getAttribute('data-parametro'), opzioni);
      if (v === null) return;
      sel.value = v;
      sel.setAttribute('data-da-url', '1');
      fatti.push(sel);
    });
    return fatti;
  }

  if (typeof document !== 'undefined' && typeof location !== 'undefined') {
    var fatti = applica(document, location.search);
    if (fatti.length) {
      // a pagina pronta, gli strumenti ricalcolano con la voce scelta
      window.addEventListener('load', function () {
        fatti.forEach(function (sel) { sel.dispatchEvent(new Event('change', { bubbles: true })); });
      });
    }
  }

  return { valore: valore, applica: applica, daUrl: daUrl };
});
