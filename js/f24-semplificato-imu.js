// js/f24-semplificato-imu.js — Dal calcolo dell'IMU (js/imu.js) alle righe
// del modello F24 semplificato.
//
// Funzioni pure, collaudate in tests/f24-semplificato.test.js. Le regole:
// - avvertenze del modello: sezione EL, codice catastale del Comune, «acc.»
//   per l'acconto, «saldo» per il saldo, entrambe se si paga tutto in una
//   volta, numero degli immobili, importo al netto della detrazione, che va
//   nella sua colonna;
// - esempio ufficiale del codice 3918: la rateazione dell'IMU non si compila;
// - L. 160/2019, art. 1, comma 762: acconto entro il 16 giugno, saldo entro
//   il 16 dicembre, oppure tutto entro il 16 giugno;
// - comma 744 e 753: per il gruppo D due righe, 3925 allo Stato e 3930 al
//   Comune (calcolate da js/imu.js);
// - L. 296/2006, art. 1, comma 166: i tributi locali si pagano arrotondati
//   all'euro.
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.F24SemplificatoImu = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 668 -> "668,00": sul modello gli importi hanno sempre i centesimi. */
  function importo(n) {
    return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  }

  const leggiEuro = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  /**
   * Le righe da aggiungere al modello per una rata.
   *
   * @param {Object} calcolo  il risultato di IMUCalculator.calcola
   * @param {Object} opzioni  { rata: 'acconto' | 'saldo' | 'unica',
   *                            accontoVersato (solo per il saldo, euro),
   *                            anno, ente (codice catastale), immobili }
   * @returns {Array<Object>} sottocampo del modello -> valore; vuoto se per
   *                          quella rata non c'e' niente da versare
   */
  function righe(calcolo, opzioni) {
    if (!calcolo || calcolo.esente) return [];
    const o = opzioni || {};
    const rata = ['acconto', 'saldo', 'unica'].includes(o.rata) ? o.rata : 'unica';
    const parti = calcolo.ripartizione && calcolo.ripartizione.length
      ? calcolo.ripartizione.map((r) => ({ codice: r.codice, annua: r.importo, lordo: r.lordo }))
      : [{ codice: calcolo.codiceTributo, annua: calcolo.impostaAnnua, lordo: calcolo.impostaNetta }];
    // l'acconto versato davvero conta solo con una riga: con le due righe
    // del gruppo D ogni quota ha il suo acconto
    const versato = parti.length === 1 ? leggiEuro(o.accontoVersato) : null;
    const detrazione = calcolo.detrazione || 0;
    const detrazioneAcconto = Math.round(detrazione / 2 * 100) / 100;

    return parti.map((p) => {
      const acconto = Math.round(p.lordo / 2);
      let debito = p.annua;
      let detr = detrazione;
      if (rata === 'acconto') { debito = acconto; detr = detrazioneAcconto; }
      if (rata === 'saldo') { debito = p.annua - (versato === null ? acconto : versato); detr = detrazione - detrazioneAcconto; }
      return { codice: p.codice, debito, detr };
    }).filter((p) => p.debito > 0).map((p) => {
      const riga = {
        sezione: 'EL',
        tributo: p.codice,
        anno: String(o.anno || ''),
        numImmobili: String(o.immobili || 1),
        debito: importo(Math.round(p.debito))
      };
      const ente = String(o.ente || '').trim().toUpperCase();
      if (/^[A-Z]\d{3}$/.test(ente)) riga.ente = ente;
      if (rata !== 'saldo') riga.acconto = true;
      if (rata !== 'acconto') riga.saldo = true;
      if (p.detr > 0) riga.detrazione = importo(p.detr);
      return riga;
    });
  }

  return { righe, importo };
});
