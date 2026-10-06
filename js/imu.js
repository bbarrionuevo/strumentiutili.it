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
      ABITAZIONE_PRINCIPALE: '3912',
      TERRENO: '3914',
      FABBRICATO_D: '3925',
      FABBRICATO_D_COMUNE: '3930',
      ALTRI_FABBRICATI: '3918'
    },
    aliquotaStatoD: 7.6,
    detrazioneAbitazionePrincipale: 200
  };

  // Le pertinenze dell'abitazione principale: una per categoria (L. 160/2019,
  // art. 1, comma 741, lettera b).
  const PERTINENZE = ['C/2', 'C/6', 'C/7'];

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

    // L'abitazione principale e le sue pertinenze non pagano, salvo le
    // categorie A/1, A/8 e A/9 (comma 740): per queste codice 3912 e
    // detrazione di 200 euro l'anno, rapportata ai mesi (comma 749).
    const pertinenza = PERTINENZE.includes(categoria);
    const abitazione = categoria.charAt(0) === 'A' && categoria !== 'A/10';
    const principale = !!data.isAbitazionePrincipale && (abitazione || pertinenza);
    const principaleTassata = principale &&
      (CATEGORIE_LUSSO.includes(categoria) || (pertinenza && !!data.abitazioneDiLusso));
    if (principale && !principaleTassata) {
      return {
        esente: true,
        motivo: 'abitazione principale',
        renditaRivalutata: rendita * configImu.rivalutazioneRendita.fabbricati,
        baseImponibile: 0, impostaLorda: 0, detrazione: 0, impostaNetta: 0,
        impostaAnnua: 0, acconto: 0, saldo: 0, codiceTributo: '', ripartizione: null
      };
    }

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

    // la detrazione si toglie fino a concorrenza dell'imposta; chi la divide
    // con altri comproprietari che ci abitano indica la propria parte
    let detrazione = 0;
    if (principaleTassata) {
      const annua = data.detrazione === undefined || data.detrazione === null || data.detrazione === ''
        ? (CATEGORIE_LUSSO.includes(categoria) ? (configImu.detrazioneAbitazionePrincipale || 200) : 0)
        : safeNum(data.detrazione);
      detrazione = Math.min(impostaLorda, Math.max(0, annua) * mesi / 12);
    }
    const impostaNetta = impostaLorda - detrazione;

    // I tributi locali si pagano arrotondati all'euro (L. 296/2006, art. 1,
    // comma 166)
    const impostaAnnua = Math.round(impostaNetta);

    // Gruppo D (tranne D/10, rurali): lo 0,76% va allo Stato con il 3925, la
    // parte in piu' fino all'aliquota del Comune con il 3930.
    let ripartizione = null;
    if (categoria.charAt(0) === 'D' && categoria !== 'D10' && categoria !== 'D/10') {
      const statoPerMille = Math.min(aliquota, configImu.aliquotaStatoD || 7.6);
      const statoLordo = aliquota > 0 ? impostaNetta * statoPerMille / aliquota : 0;
      const stato = Math.round(statoLordo);
      const codici = configImu.codiciTributo || {};
      ripartizione = [{ codice: codici.FABBRICATO_D || '3925', ente: 'Stato', importo: stato, lordo: statoLordo }];
      if (impostaAnnua - stato > 0) ripartizione.push({ codice: codici.FABBRICATO_D_COMUNE || '3930', ente: 'Comune', importo: impostaAnnua - stato, lordo: impostaNetta - statoLordo });
    }
    // acconto e saldo a meta': vale quando il possesso e l'aliquota non
    // cambiano nell'anno (comma 762)
    const acconto = Math.round(impostaNetta / 2);
    const saldo = impostaAnnua - acconto;

    return {
      renditaRivalutata: categoria === 'TERRENO' 
        ? (rendita * configImu.rivalutazioneRendita.terreni) 
        : (rendita * configImu.rivalutazioneRendita.fabbricati),
      baseImponibile: baseImponibile,
      impostaLorda: impostaLorda,
      detrazione: detrazione,
      impostaNetta: impostaNetta,
      impostaAnnua: impostaAnnua,
      acconto: acconto,
      saldo: saldo,
      codiceTributo: ripartizione && ripartizione.length > 1
        ? ripartizione.map((r) => r.codice + ' (' + r.ente + ', ' + r.importo + ' €)').join(' + ')
        : (principaleTassata ? (configImu.codiciTributo.ABITAZIONE_PRINCIPALE || '3912') : mapCodiceTributo(categoria, configImu.codiciTributo)),
      ripartizione: ripartizione
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