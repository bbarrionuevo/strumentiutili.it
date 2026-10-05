// js/codice-contratto.js — Gli «elementi identificativi» dell'F24 ELIDE per
// l'imposta di registro sugli affitti.
//
// Risoluzione n. 14/E del 24 gennaio 2014 dell'Agenzia delle Entrate: per le
// annualita' successive, le cessioni, le risoluzioni e le proroghe si scrive il
// codice identificativo del contratto (17 caratteri, nella ricevuta di
// registrazione). Se non c'e', si compone un codice di 16 caratteri:
//   - caratteri 1-3: il codice dell'ufficio in cui e' registrato il contratto;
//   - caratteri 4-5: le ultime due cifre dell'anno di registrazione;
//   - caratteri 6-7: la serie, completata con zeri a sinistra;
//   - caratteri 8-13: il numero, completato con zeri a sinistra;
//   - caratteri 14-16: il sottonumero, se c'e', oppure «000».
// Esempio ufficiale: TMD, 2013, serie 3, numero 10725 = «TMD1303010725000».
// Funziona nel browser (window.CodiceContratto) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CodiceContratto = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function pulito(x) {
    return String(x == null ? '' : x).replace(/\s+/g, '').toUpperCase();
  }
  function zeri(x, n) {
    while (x.length < n) x = '0' + x;
    return x;
  }

  /**
   * @param {{ufficio, anno, serie, numero, sottonumero}} d gli estremi di registrazione
   * @returns {{codice: string, parti: string[], errori: string[], avvisi: string[]}}
   *   codice e' vuoto se c'e' almeno un errore
   */
  function componi(d) {
    d = d || {};
    var errori = [];
    var avvisi = [];
    var ufficio = pulito(d.ufficio);
    var anno = pulito(d.anno);
    var serie = pulito(d.serie);
    var numero = pulito(d.numero);
    var sotto = pulito(d.sottonumero);

    if (!/^[A-Z0-9]{3}$/.test(ufficio)) errori.push('Il codice dell’ufficio ha 3 caratteri (per esempio TMD).');
    if (!/^\d{4}$/.test(anno)) errori.push('Scrivi l’anno di registrazione con quattro cifre (per esempio 2013).');
    if (!/^[A-Z0-9]{1,2}$/.test(serie)) errori.push('La serie ha uno o due caratteri (nell’esempio ufficiale è 3).');
    if (!/^\d{1,6}$/.test(numero)) errori.push('Il numero di registrazione ha al massimo sei cifre.');
    if (sotto && !/^[A-Z0-9]{1,3}$/.test(sotto)) errori.push('Il sottonumero ha al massimo tre caratteri.');

    var parti = [ufficio, anno.slice(-2), zeri(serie, 2), zeri(numero, 6), sotto ? zeri(sotto, 3) : '000'];
    if (sotto && sotto.length < 3) {
      avvisi.push('Il sottonumero è stato completato con zeri a sinistra fino a tre caratteri, come la serie e il numero: confrontalo con la ricevuta.');
    }
    return { codice: errori.length ? '' : parti.join(''), parti: parti, errori: errori, avvisi: avvisi };
  }

  /** Vero se il testo ha la lunghezza di un codice valido: 17 (ricevuta) o 16 (composto). */
  function lunghezzaGiusta(codice) {
    var c = pulito(codice);
    return c.length === 17 || c.length === 16;
  }

  return { componi: componi, lunghezzaGiusta: lunghezzaGiusta };
});
