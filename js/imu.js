/**
 * js/imu.js - Motore di calcolo IMU
 * FIX PRODUZIONE: Fallback integrato per evitare errori se il JSON è undefined o incompleto
 */
(function () {
  'use strict';

  const CATEGORIE_LUSSO = ['A/1', 'A/8', 'A/9'];

  // Oggetto di fallback con tutte le regole 2026 integrate in caso di mancato caricamento del JSON
  const DEFAULT_CONFIG = {
    rivalutazioneRendita: { fabbricati: 1.05, terreni: 1.25 },
    moltiplicatori: {
      'A': 160, 'A/10': 80,
      'B': 140,
      'C/1': 55, 'C/2': 160, 'C/3': 140, 'C/4': 140, 'C/5': 140, 'C/6': 160, 'C/7': 160,
      'D': 65, 'D/5': 80,
      'TERRENO': 135
    },
    riduzioni: {
      immobileStoricoInagibile: 0.5,
      comodatoParenti: 0.5,
      canoneConcordatoImposta: 0.75
    },
    codiciTributo: {
      TERRENO: '3914',
      FABBRICATO_D: '3925',
      ALTRI_FABBRICATI: '3918'
    }
  };

  function safeNum(val) {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  }

  function getMoltiplicatore(categoria, config) {
    if (!categoria) return 160;
    const catUpper = categoria.toUpperCase().trim();
    if (config.moltiplicatori[catUpper]) return config.moltiplicatori[catUpper];
    const base = catUpper.charAt(0);
    return config.moltiplicatori[base] || 160;
  }

  function calcolaIMU(data, configImu) {
    // LO SCUDO DI PRODUZIONE: Se configImu è undefined, null, o senza moltiplicatori, usa i default!
    if (!configImu || !configImu.moltiplicatori) {
      configImu = DEFAULT_CONFIG;
    }

    const rendita = safeNum(data.rendita);
    const aliquota = safeNum(data.aliquota);
    const quota = safeNum(data.quota) || 100;
    const mesi = Math.min(12, Math.max(1, safeNum(data.mesi) || 12));
    const categoria = (data.categoria || 'A').toUpperCase().trim();

    let baseImponibile = 0;

    if (categoria === 'TERRENO') {
      baseImponibile = (rendita * configImu.rivalutazioneRendita.terreni) * (configImu.moltiplicatori.TERRENO || 135);
    } else {
      const moltiplicatore = getMoltiplicatore(categoria, configImu);
      baseImponibile = (rendita * configImu.rivalutazioneRendita.fabbricati) * moltiplicatore;
    }

    if (data.isStorico) {
      baseImponibile = baseImponibile * configImu.riduzioni.immobileStoricoInagibile;
    }

    if (data.isComodato && !CATEGORIE_LUSSO.includes(categoria) && categoria !== 'TERRENO') {
      baseImponibile = baseImponibile * configImu.riduzioni.comodatoParenti;
    }

    let impostaLorda = baseImponibile * (aliquota / 1000) * (quota / 100) * (mesi / 12);

    if (data.isConcordato && categoria !== 'TERRENO') {
      impostaLorda = impostaLorda * configImu.riduzioni.canoneConcordatoImposta;
    }

    const impostaAnnua = Math.round(impostaLorda);
    const acconto = Math.round(impostaLorda / 2);
    const saldo = impostaAnnua - acconto;

    return {
      renditaRivalutata: categoria === 'TERRENO' 
        ? (rendita * configImu.rivalutazioneRendita.terreni) 
        : (rendita * configImu.rivalutazioneRendita.fabbricati),
      baseImponibile: baseImponibile,
      impostaLorda: impostaLorda,
      impostaAnnua: impostaAnnua,
      acconto: acconto,
      saldo: saldo,
      codiceTributo: mapCodiceTributo(categoria, configImu.codiciTributo)
    };
  }

  function mapCodiceTributo(categoria, codici) {
    if (categoria === 'TERRENO') return codici.TERRENO;
    const c = categoria.charAt(0);
    if (c === 'D') return codici.FABBRICATO_D;
    return codici.ALTRI_FABBRICATI;
  }

  window.IMUCalculator = {
    calcola: calcolaIMU
  };

})();