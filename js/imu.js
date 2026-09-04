/**
 * js/imu.js - Motore di calcolo IMU 2026
 * Conforme alle specifiche per il Modello F24 Semplificato
 */
(function () {
  'use strict';

  // Moltiplicatori Catastali 2026
  const MOLTIPLICATORI = {
    'A': 160, 'A/10': 80,
    'B': 140,
    'C/1': 55, 'C/2': 160, 'C/6': 160, 'C/7': 160, 'C/3': 140, 'C/4': 140, 'C/5': 140,
    'D': 65, 'D/5': 80
  };

  const CATEGORIE_LUSSO = ['A/1', 'A/8', 'A/9'];

  function safeNum(val) {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  }

  function getMoltiplicatore(categoria) {
    if (!categoria) return 160;
    const catUpper = categoria.toUpperCase().trim();
    if (MOLTIPLICATORI[catUpper]) return MOLTIPLICATORI[catUpper];
    
    // Fallback alla lettera base (es. se A/2 non c'è, prende A)
    const base = catUpper.charAt(0);
    return MOLTIPLICATORI[base] || 160;
  }

  /**
   * Calcola l'IMU annuale e le rate (Acconto/Saldo)
   * 
   * @param {Object} data 
   * @param {number} data.rendita - Rendita catastale o Reddito Dominicale
   * @param {string} data.categoria - Categoria catastale (es. A/2, C/1, TERRENO)
   * @param {number} data.aliquota - Aliquota comunale in millesimi (es. 10.6)
   * @param {number} data.quota - Quota di possesso in percentuale (es. 50 per 50%)
   * @param {number} data.mesi - Mesi di possesso nel corso dell'anno (1-12)
   * @param {boolean} data.isStorico - Immobile storico o inagibile (riduzione 50% base)
   * @param {boolean} data.isComodato - Comodato d'uso a parenti (riduzione 50% base)
   * @param {boolean} data.isConcordato - Canone concordato (riduzione 25% imposta)
   */
  function calcolaIMU(data) {
    const rendita = safeNum(data.rendita);
    const aliquota = safeNum(data.aliquota);
    const quota = safeNum(data.quota) || 100;
    const mesi = Math.min(12, Math.max(1, safeNum(data.mesi) || 12));
    const categoria = (data.categoria || 'A').toUpperCase().trim();

    let baseImponibile = 0;

    // 1. Determinazione Base Imponibile
    if (categoria === 'TERRENO') {
      // Regola Terreni Agricoli: Rivalutazione 25% e Moltiplicatore 135
      baseImponibile = (rendita * 1.25) * 135;
    } else {
      // Regola Fabbricati: Rivalutazione 5% e Moltiplicatore specifico
      const moltiplicatore = getMoltiplicatore(categoria);
      baseImponibile = (rendita * 1.05) * moltiplicatore;
    }

    // 2. Riduzioni Base Imponibile (Modificatori di Stato)
    if (data.isStorico) {
      baseImponibile = baseImponibile * 0.5;
    }

    if (data.isComodato && !CATEGORIE_LUSSO.includes(categoria) && categoria !== 'TERRENO') {
      baseImponibile = baseImponibile * 0.5;
    }

    // 3. Calcolo Imposta Lorda Proporzionale
    // Aliquota è in millesimi (/1000)
    let impostaLorda = baseImponibile * (aliquota / 1000) * (quota / 100) * (mesi / 12);

    // 4. Riduzioni Imposta Diretta
    if (data.isConcordato && categoria !== 'TERRENO') {
      // Canone Concordato: sconto del 25% sull'imposta
      impostaLorda = impostaLorda * 0.75;
    }

    // 5. Arrotondamento Legale (All'unità di Euro più vicina, senza decimali)
    const impostaAnnua = Math.round(impostaLorda);

    // 6. Calcolo Rate (Acconto 50%, Saldo 50%)
    // L'arrotondamento va fatto sulla singola rata
    const acconto = Math.round(impostaLorda / 2);
    const saldo = impostaAnnua - acconto;

    return {
      renditaRivalutata: categoria === 'TERRENO' ? (rendita * 1.25) : (rendita * 1.05),
      baseImponibile: baseImponibile,
      impostaLorda: impostaLorda,
      impostaAnnua: impostaAnnua,
      acconto: acconto,
      saldo: saldo,
      codiceTributo: mapCodiceTributo(categoria)
    };
  }

  // Mappa automatica per agevolare il riempimento del F24 Semplificato
  function mapCodiceTributo(categoria) {
    if (categoria === 'TERRENO') return '3914';
    const c = categoria.charAt(0);
    if (c === 'D') return '3925'; // Immobili uso produttivo
    return '3918'; // Altri fabbricati (C, B, A eccetto prima casa lusso)
  }

  // Esposizione Globale
  window.IMUCalculator = {
    calcola: calcolaIMU,
    MOLTIPLICATORI: MOLTIPLICATORI
  };

})();