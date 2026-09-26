// js/partita-iva.js — Calcolo del regime forfettario (regole lette dal JSON)
(function () {
  'use strict';

  function safeNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function round2(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
  }

  function formatEuro(value) {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(Number(value) || 0);
  }

  // 1. Le regole del JSON nella forma che usa la pagina
  function getContributionRules(config) {
    return {
      professionisti: {
        label: 'Professionisti / Consulenti',
        coefficiente: config.coefficientiAteco.PROFESSIONALS_SCIENTIFIC_TECHNICAL,
        type: 'gestione-separata',
        aliquota: config.inps.gestioneSeparataAliquota
      },
      digital: {
        label: 'Attività digitali / IT',
        // Servizi IT (es. ATECO 62-63) rientrano in "altre attività economiche": coefficiente 67%, non l'86% di edilizia/immobiliare
        coefficiente: config.coefficientiAteco.OTHER_ACTIVITIES,
        type: 'gestione-separata',
        aliquota: config.inps.gestioneSeparataAliquota
      },
      artigiani: {
        label: 'Artigiani',
        coefficiente: config.coefficientiAteco.OTHER_ACTIVITIES,
        type: 'artigiani',
        quotaFissa: config.inps.artigiani.quotaFissaMaternita,
        aliquota1: config.inps.artigiani.aliquotaFascia1,
        aliquota2: config.inps.artigiani.aliquotaFascia2
      },
      commercianti: {
        label: 'Commercianti',
        coefficiente: config.coefficientiAteco.COMMERCE_WHOLESALE_RETAIL,
        type: 'commercianti',
        quotaFissa: config.inps.commercianti.quotaFissaMaternita,
        aliquota1: config.inps.commercianti.aliquotaFascia1,
        aliquota2: config.inps.commercianti.aliquotaFascia2
      }
    };
  }

  function computeContributiArtigianiCommercianti(rule, baseContributiva, configInps) {
    const base = Math.max(0, safeNumber(baseContributiva, 0));

    if (base <= 0) {
      return { quotaFissa: 0, quotaVariabile: 0, totale: 0 };
    }

    if (base <= configInps.minimale2026) {
      return {
        quotaFissa: round2(rule.quotaFissa),
        quotaVariabile: 0,
        totale: round2(rule.quotaFissa)
      };
    }

    const fascia1 = Math.max(0, Math.min(base, configInps.sogliaAliquotaSuperiore) - configInps.minimale2026);
    const fascia2 = Math.max(0, base - configInps.sogliaAliquotaSuperiore);
    
    const quotaVariabile = round2((fascia1 * rule.aliquota1) + (fascia2 * rule.aliquota2));
    const totale = round2(rule.quotaFissa + quotaVariabile);

    return {
      quotaFissa: round2(rule.quotaFissa),
      quotaVariabile: quotaVariabile,
      totale: totale
    };
  }

  function calculatePartitaIva(fatturato, regimeKey, attivitaKey, configPartitaIva) {
    const ricavi = Math.max(0, safeNumber(fatturato, 0));
    const regimeRate = regimeKey === 'new' ? configPartitaIva.aliquoteImposta.startup : configPartitaIva.aliquoteImposta.standard;
    
    const rules = getContributionRules(configPartitaIva);
    const rule = rules[attivitaKey] || rules.professionisti;
    
    const baseImponibile = round2(ricavi * rule.coefficiente);
    const baseContributiva = round2(Math.min(baseImponibile, configPartitaIva.inps.massimale2026));

    let alertLevel = 'OK';
    if (ricavi > configPartitaIva.limitiFatturato.uscitaImmediata) {
      alertLevel = 'DANGER_100K';
    } else if (ricavi > configPartitaIva.limitiFatturato.ordinarioAnnuo) {
      alertLevel = 'WARN_85K';
    }

    let dettaglioInps = { quotaFissa: 0, quotaVariabile: 0, totale: 0 };

    if (rule.type === 'gestione-separata') {
      dettaglioInps.totale = round2(baseContributiva * rule.aliquota);
    } else {
      dettaglioInps = computeContributiArtigianiCommercianti(rule, baseContributiva, configPartitaIva.inps);
    }

    const totaleInps = round2(dettaglioInps.totale);
    const imponibileImposta = round2(Math.max(0, baseImponibile - totaleInps));
    const impostaSostitutiva = round2(imponibileImposta * regimeRate);
    
    const totaleTrattenute = round2(totaleInps + impostaSostitutiva);
    const nettoAnno = round2(ricavi - totaleTrattenute);
    const nettoMese = round2(nettoAnno / 12);

    return {
      fatturato: round2(ricavi),
      coefficiente: rule.coefficiente,
      categoria: rule.label,
      isGestioneSeparata: rule.type === 'gestione-separata',
      baseImponibile: baseImponibile,
      baseContributiva: baseContributiva,
      inps: totaleInps,
      dettaglioInps: dettaglioInps,
      imponibileImposta: imponibileImposta,
      impostaSostitutiva: impostaSostitutiva,
      totaleTrattenute: totaleTrattenute,
      nettoAnno: nettoAnno,
      nettoMese: nettoMese,
      alertLevel: alertLevel,
      aliquotaImposta: regimeRate
    };
  }

  function renderWarning(alertLevel) {
    const warn = document.getElementById('warn-limite');
    if (!warn) return;

    if (alertLevel === 'OK') {
      warn.classList.add('hidden');
      warn.innerHTML = '';
      return;
    }

    warn.classList.remove('hidden');
    warn.className = 'mt-4 rounded-lg p-4 text-sm font-medium border';
    
    if (alertLevel === 'WARN_85K') {
      warn.classList.add('bg-orange-50', 'border-orange-300', 'text-orange-800');
      warn.innerHTML = '⚠️ <strong>Attenzione:</strong> Ricavi oltre soglia ordinaria. Decadrai dal regime forfettario dal <strong>1° gennaio successivo</strong>.';
    } else if (alertLevel === 'DANGER_100K') {
      warn.classList.add('bg-rose-50', 'border-rose-300', 'text-rose-800');
      warn.innerHTML = '🚨 <strong>Allerta Fiscale:</strong> Ricavi oltre soglia massima. <strong>Fuoriuscita immediata</strong> dal regime con applicazione IVA.';
    }
  }

  function renderResult(result) {
    const fields = {
      'res-fatturato': formatEuro(result.fatturato),
      'res-coeff': String(Math.round(result.coefficiente * 100)) + '%',
      'res-base': formatEuro(result.baseImponibile),
      'res-base-previdenza': formatEuro(result.baseContributiva),
      'res-inps': formatEuro(result.inps),
      'res-inps-fissa': formatEuro(result.dettaglioInps.quotaFissa),
      'res-inps-variabile': formatEuro(result.dettaglioInps.quotaVariabile),
      'res-imponibile-imposta': formatEuro(result.imponibileImposta),
      'res-imposta': formatEuro(result.impostaSostitutiva),
      'res-netto-anno': formatEuro(result.nettoAnno),
      'res-netto-mese': formatEuro(result.nettoMese)
    };

    Object.entries(fields).forEach(function ([id, value]) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    const rowBasePrev = document.getElementById('row-base-prev');
    const rowInpsFissa = document.getElementById('row-inps-fissa');
    const rowInpsVar = document.getElementById('row-inps-var');

    if (result.baseContributiva !== result.baseImponibile && rowBasePrev) {
        rowBasePrev.classList.remove('hidden');
    } else if (rowBasePrev) {
        rowBasePrev.classList.add('hidden');
    }

    if (!result.isGestioneSeparata && rowInpsFissa && rowInpsVar) {
        rowInpsFissa.classList.remove('hidden');
        rowInpsVar.classList.remove('hidden');
    } else if (rowInpsFissa && rowInpsVar) {
        rowInpsFissa.classList.add('hidden');
        rowInpsVar.classList.add('hidden');
    }

    renderWarning(result.alertLevel);
  }

  function bind() {
    if (typeof document === 'undefined') return;

    const btn = document.getElementById('calcola-partita-iva');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      
      let regole = null;
      try {
          regole = await window.StrumentiData.getRegoleFiscali();
          if (!regole) throw new Error('Regole fiscali non disponibili.');
      } catch (e) {
          console.error("Errore nel caricamento delle regole fiscali:", e);
          alert("Impossibile caricare le aliquote. Riprova più tardi.");
          return;
      }

      const result = calculatePartitaIva(
        document.getElementById('fatturato') && document.getElementById('fatturato').value,
        document.getElementById('anni-attivita') && document.getElementById('anni-attivita').value,
        document.getElementById('ateco') && document.getElementById('ateco').value,
        regole.partitaIvaForfettario
      );

      renderResult(result);
    });
  }

  window.PartitaIvaForfettaria = {
    calculatePartitaIva: calculatePartitaIva
  };

  bind();
})();