// js/tfr.js — Calcolo TFR Liquidazione (JSON Decoupled & No Fallbacks)
(function () {
  'use strict';

  function safeNumber(value, fallback = 0) {
    const num = parseFloat(value);
    return isNaN(num) ? fallback : num;
  }

  // Arrotondamento bancario a 2 decimali
  function round2(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
  }

  function formatEuro(value) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value || 0);
  }

  // IRPEF: delegata al motore condiviso js/irpef.js. La versione precedente
  // indicizzava scaglioni[0..2] a mano, quindi un quarto scaglione nel JSON
  // sarebbe stato ignorato.
  const motoreIrpef = (typeof window !== 'undefined' && window.StrumentiIrpef) ||
    (typeof self !== 'undefined' && self.StrumentiIrpef) || null;

  function computeIRPEF(imponibile, configIrpef) {
    if (!motoreIrpef) {
      throw new Error('[TFR] js/irpef.js non caricato.');
    }
    return motoreIrpef.computeIRPEF(imponibile, configIrpef);
  }

  // Funzione Principale TFR
  function calculateTFR(ral, imponibileInps, anni, regole) {
    const ralSafe = Math.max(0, safeNumber(ral, 0));
    const baseInps = Math.max(0, safeNumber(imponibileInps, ralSafe));
    const anniSafe = Math.max(0, safeNumber(anni, 0));

    // Estrae i nodi corretti dal JSON
    const tfrConf = regole.tfr;
    const irpefConf = regole.irpef;

    // 1. Fondo di Garanzia INPS (es. 0.5%)
    const fondoGaranzia = round2(baseInps * tfrConf.rivalsaInps);

    // 2. Quota annua (RAL / 13.5 - Fondo Garanzia)
    const quotaAnnua = round2((ralSafe / tfrConf.divisoreFisso) - fondoGaranzia);

    // 3. TFR Lordo Accumulato
    const tfrLordo = round2(quotaAnnua * anniSafe);

    // 4. Tassazione Separata (TUIR)
    let tassazione = 0;
    let aliquotaEffettiva = irpefConf.scaglioni[0].aliquota; // Minimo legale 23%

    if (tfrLordo > 0 && anniSafe > 0) {
      const redditoRiferimento = (tfrLordo / anniSafe) * 12;
      const irpefTeorica = computeIRPEF(redditoRiferimento, irpefConf);
      
      const aliquotaMedia = redditoRiferimento > 0 ? (irpefTeorica / redditoRiferimento) : aliquotaEffettiva;
      
      // L'aliquota media non può mai essere inferiore al primo scaglione (23%)
      aliquotaEffettiva = Math.max(aliquotaEffettiva, aliquotaMedia);
      
      tassazione = round2(tfrLordo * aliquotaEffettiva);
    }

    // 5. TFR Netto
    const tfrNetto = round2(tfrLordo - tassazione);

    return {
      imponibileInps: baseInps,
      fondoGaranzia: fondoGaranzia,
      quotaAnnua: Math.max(0, quotaAnnua),
      tfrLordo: tfrLordo,
      aliquotaApplicata: round2(aliquotaEffettiva * 100),
      tassazione: tassazione,
      tfrNetto: tfrNetto
    };
  }

  function bind() {
    if (typeof document === 'undefined') return;

    const btn = document.getElementById('calcola-tfr');
    if (!btn) return;

    btn.addEventListener('click', async function (e) {
      e.preventDefault();

      // 1. CARICAMENTO RIGOROSO DEL JSON
      let regole = null;
      try {
          regole = await window.StrumentiData.getRegoleFiscali();
          if (!regole) throw new Error('Regole fiscali non disponibili.');
      } catch (err) {
          console.error("Errore di rete durante il caricamento del JSON:", err);
      }

      // 2. LA REGOLA D'ORO: Niente JSON? Niente calcolo. Nessun fallback inventato.
      if (!regole || !regole.tfr || !regole.irpef) {
          alert("Errore: Impossibile caricare i parametri fiscali e previdenziali aggiornati. Verifica la connessione e riprova.");
          return;
      }

      const ralEl = document.getElementById('ral');
      const imponibileEl = document.getElementById('imponibile-inps');
      const anniEl = document.getElementById('anni-servizio');

      const ral = ralEl ? ralEl.value : 0;
      const imponibileInps = imponibileEl ? imponibileEl.value : ral;
      const anni = anniEl ? anniEl.value : 0;

      if (ral <= 0 || anni <= 0) {
          alert('Inserisci una RAL e Anni di servizio validi per procedere.');
          return;
      }

      // 3. ESECUZIONE
      const result = calculateTFR(ral, imponibileInps, anni, regole);

      // 4. AGGIORNAMENTO UI
      const outputs = {
        'res-imponibile-inps': formatEuro(result.imponibileInps),
        'res-fondo-garanzia': formatEuro(result.fondoGaranzia),
        'res-quota': formatEuro(result.quotaAnnua),
        'res-lordo': formatEuro(result.tfrLordo),
        'res-tassa': `${formatEuro(result.tassazione)} (${result.aliquotaApplicata}%)`,
        'res-netto': formatEuro(result.tfrNetto)
      };

      Object.entries(outputs).forEach(function ([id, value]) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      });
    });
  }

  // Esportazione
  window.TFRCalculator = {
    calculateTFR: calculateTFR
  };

  document.addEventListener('DOMContentLoaded', bind);
})();