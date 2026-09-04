(function () {
  const FORFETTARIO_LIMIT = 85000;
  const INPS_MAX_BASE = 119000;
  const MINIMALE_REDDITO = 18415;
  const SOGLIA_ALIQUOTA_SUPERIORE = 56224;

  const CONTRIBUTION_RULES = {
    professionisti: {
      label: 'Professionisti / Consulenti',
      coefficiente: 0.78,
      type: 'gestione-separata',
      aliquota: 0.2607
    },
    digital: {
      label: 'Attività digitali / IT',
      coefficiente: 0.86,
      type: 'gestione-separata',
      aliquota: 0.2607
    },
    artigiani: {
      label: 'Artigiani',
      coefficiente: 0.67,
      type: 'artigiani',
      quotaFissa: 4521.36,
      aliquota1: 0.24,
      aliquota2: 0.25
    },
    commercianti: {
      label: 'Commercianti',
      coefficiente: 0.4,
      type: 'commercianti',
      quotaFissa: 4611.64,
      aliquota1: 0.2448,
      aliquota2: 0.2548
    }
  };

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

  function computeContributiArtigianiCommercianti(rule, baseContributiva) {
    const base = Math.max(0, safeNumber(baseContributiva, 0));

    if (base <= 0) {
      return {
        quotaFissa: 0,
        quotaVariabile: 0,
        totale: 0
      };
    }

    if (base <= MINIMALE_REDDITO) {
      return {
        quotaFissa: round2(rule.quotaFissa),
        quotaVariabile: 0,
        totale: round2(rule.quotaFissa)
      };
    }

    const fascia1 = Math.max(0, Math.min(base, SOGLIA_ALIQUOTA_SUPERIORE) - MINIMALE_REDDITO);
    const fascia2 = Math.max(0, base - SOGLIA_ALIQUOTA_SUPERIORE);
    const quotaVariabile = round2((fascia1 * rule.aliquota1) + (fascia2 * rule.aliquota2));
    const totale = round2(rule.quotaFissa + quotaVariabile);

    return {
      quotaFissa: round2(rule.quotaFissa),
      quotaVariabile: quotaVariabile,
      totale: totale
    };
  }

  function calculatePartitaIva(fatturato, regimeKey, attivitaKey) {
    const ricavi = Math.max(0, safeNumber(fatturato, 0));
    const regime = regimeKey === 'new' ? 0.05 : 0.15;
    const rule = CONTRIBUTION_RULES[attivitaKey] || CONTRIBUTION_RULES.professionisti;
    const baseImponibile = round2(ricavi * rule.coefficiente);
    const baseContributiva = round2(Math.min(baseImponibile, INPS_MAX_BASE));
    const fuoriLimite = ricavi > FORFETTARIO_LIMIT;

    let dettaglioInps = {
      quotaFissa: 0,
      quotaVariabile: 0,
      totale: 0
    };

    if (rule.type === 'gestione-separata') {
      dettaglioInps.totale = round2(baseContributiva * rule.aliquota);
    } else {
      dettaglioInps = computeContributiArtigianiCommercianti(rule, baseContributiva);
    }

    const totaleInps = round2(dettaglioInps.totale);
    const imponibileImposta = round2(Math.max(0, baseImponibile - totaleInps));
    const impostaSostitutiva = round2(imponibileImposta * regime);
    const totaleTrattenute = round2(totaleInps + impostaSostitutiva);
    const nettoAnno = round2(ricavi - totaleTrattenute);
    const nettoMese = round2(nettoAnno / 12);

    return {
      fatturato: round2(ricavi),
      coefficiente: rule.coefficiente,
      categoria: rule.label,
      baseImponibile: baseImponibile,
      baseContributiva: baseContributiva,
      inps: totaleInps,
      dettaglioInps: dettaglioInps,
      imponibileImposta: imponibileImposta,
      impostaSostitutiva: impostaSostitutiva,
      totaleTrattenute: totaleTrattenute,
      nettoAnno: nettoAnno,
      nettoMese: nettoMese,
      fuoriLimite: fuoriLimite,
      aliquotaImposta: regime
    };
  }

  function renderWarning(isVisible) {
    const warn = document.getElementById('warn-limite');
    if (!warn) return;

    if (!isVisible) {
      warn.className = 'hidden';
      warn.textContent = '';
      return;
    }

    warn.className = 'mt-4 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800';
    warn.innerHTML = '<strong>Attenzione:</strong> con ricavi superiori a € 85.000 esci dal perimetro del regime forfettario e la simulazione va letta come avviso preliminare.';
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

    renderWarning(result.fuoriLimite);
  }

  function bind() {
    if (typeof document === 'undefined') return;

    const btn = document.getElementById('calcola-partita-iva');
    if (!btn) return;

    btn.addEventListener('click', function () {
      const result = calculatePartitaIva(
        document.getElementById('fatturato') && document.getElementById('fatturato').value,
        document.getElementById('anni-attivita') && document.getElementById('anni-attivita').value,
        document.getElementById('ateco') && document.getElementById('ateco').value
      );

      renderResult(result);
    });
  }

  const api = {
    FORFETTARIO_LIMIT: FORFETTARIO_LIMIT,
    INPS_MAX_BASE: INPS_MAX_BASE,
    MINIMALE_REDDITO: MINIMALE_REDDITO,
    SOGLIA_ALIQUOTA_SUPERIORE: SOGLIA_ALIQUOTA_SUPERIORE,
    calculatePartitaIva: calculatePartitaIva
  };

  window.PartitaIvaForfettaria = api;
  window.calculatePartitaIva = calculatePartitaIva;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  bind();
})();
