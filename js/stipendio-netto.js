(function () {
  const INPS_RATE = 0.0919;
  const INPS_MAX_BASE = 119000; // Massimale INPS 2026
  const DEFAULT_REGIONAL_RATE = 0.0123;
  const DEFAULT_COMUNAL_RATE = 0.008;

  function safeNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function round2(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
  }

  function truncate4(value) {
    return Math.trunc(Number(value) * 10000) / 10000;
  }

  function formatEuro(value) {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(Number(value) || 0);
  }

  function computeIRPEF2026(imponibile) {
    const income = Math.max(0, safeNumber(imponibile, 0));

    if (income <= 28000) {
      return round2(income * 0.23);
    }

    if (income <= 50000) {
      // Aliquota del 33% per il secondo scaglione (28.000€ - 50.000€)
      return round2(6440 + ((income - 28000) * 0.33));
    }

    // Oltre i 50.000€: 13.700€ (6440 + 7260) + 43% sulla quota eccedente
    return round2(13700 + ((income - 50000) * 0.43));
  }

  function computeDetrazioneLavoroDipendente2026(imponibile) {
    const income = Math.max(0, safeNumber(imponibile, 0));
    let detrazione = 0;

    if (income <= 15000) {
      detrazione = Math.max(1955, 690);
    } else if (income <= 28000) {
      const ratio = truncate4((28000 - income) / 13000);
      detrazione = 1910 + (1190 * Math.max(0, ratio));
    } else if (income <= 50000) {
      const ratio = truncate4((50000 - income) / 22000);
      detrazione = 1910 * Math.max(0, ratio);
    }

    if (income >= 25000 && income <= 35000) {
      detrazione += 65;
    }

    return round2(Math.max(0, detrazione));
  }

  function computeCuneoFiscale2026(imponibile) {
    const income = Math.max(0, safeNumber(imponibile, 0));
    let bonusErogato = 0;
    let detrazioneUlteriore = 0;

    if (income < 8500) {
      bonusErogato = income * 0.071;
    } else if (income < 15000) {
      bonusErogato = income * 0.053;
    } else if (income < 20000) {
      bonusErogato = income * 0.048;
    } else if (income <= 32000) {
      detrazioneUlteriore = 1000;
    } else if (income <= 40000) {
      detrazioneUlteriore = 1000 * ((40000 - income) / 8000);
    }

    return {
      bonusErogato: round2(Math.max(0, bonusErogato)),
      detrazioneUlteriore: round2(Math.max(0, detrazioneUlteriore))
    };
  }

  function calculateSalary(ral, mensilita, options) {
    const safeRal = Math.max(0, safeNumber(ral, 0));
    const safeMensilita = Math.max(1, safeNumber(mensilita, 13));
    const config = options || {};
    const regionalRate = safeNumber(config.regionalRate, DEFAULT_REGIONAL_RATE);
    const comunalRate = safeNumber(config.comunalRate, DEFAULT_COMUNAL_RATE);
    const inpsBase = Math.min(safeRal, INPS_MAX_BASE);
    const inps = round2(inpsBase * INPS_RATE);
    const imponibileIrpef = round2(Math.max(0, safeRal - inps));
    const irpefLorda = computeIRPEF2026(imponibileIrpef);
    const detrazioneLavoro = config.applyDetrazione === false
      ? 0
      : computeDetrazioneLavoroDipendente2026(imponibileIrpef);
    const cuneo = computeCuneoFiscale2026(imponibileIrpef);
    const irpefNetta = round2(Math.max(0, irpefLorda - detrazioneLavoro - cuneo.detrazioneUlteriore));
    const addizionali = round2(imponibileIrpef * (regionalRate + comunalRate));
    const nettoAnnuo = round2(safeRal - inps - irpefNetta - addizionali + cuneo.bonusErogato);
    const nettoMensile = round2(nettoAnnuo / safeMensilita);

    return {
      ral: round2(safeRal),
      mensilita: safeMensilita,
      inpsBase: round2(inpsBase),
      inps,
      imponibileIrpef,
      irpefLorda,
      detrazioneLavoro: round2(detrazioneLavoro),
      bonusCuneo: cuneo.bonusErogato,
      detrazioneCuneo: cuneo.detrazioneUlteriore,
      irpefNetta,
      addizionali,
      nettoAnnuo,
      nettoMensile,
      regionalRate,
      comunalRate
    };
  }

  function renderSalaryResult(result) {
    const fields = {
      'res-inps-base': formatEuro(result.inpsBase),
      previdenza: formatEuro(result.inps),
      imponibile: formatEuro(result.imponibileIrpef),
      'irpef-lorda': formatEuro(result.irpefLorda),
      detrazione: formatEuro(result.detrazioneLavoro),
      cuneo: formatEuro(result.bonusCuneo || result.detrazioneCuneo),
      irpef: formatEuro(result.irpefNetta),
      addizionaliTot: formatEuro(result.addizionali),
      nettoAnnuale: formatEuro(result.nettoAnnuo),
      nettoMensile: formatEuro(result.nettoMensile)
    };

    Object.entries(fields).forEach(function ([id, value]) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    const cuneoLabel = document.getElementById('cuneo-label');
    if (cuneoLabel) {
      cuneoLabel.textContent = result.bonusCuneo > 0
        ? 'Bonus cuneo fiscale erogato'
        : 'Detrazione ulteriore cuneo';
    }

    const addRegEl = document.getElementById('addReg');
    const addComEl = document.getElementById('addCom');
    if (addRegEl) addRegEl.textContent = formatEuro(result.imponibileIrpef * result.regionalRate);
    if (addComEl) addComEl.textContent = formatEuro(result.imponibileIrpef * result.comunalRate);
  }

  function resetSalaryResult() {
    [
      'res-inps-base',
      'previdenza',
      'imponibile',
      'irpef-lorda',
      'detrazione',
      'cuneo',
      'irpef',
      'addReg',
      'addCom',
      'addizionaliTot',
      'nettoAnnuale',
      'nettoMensile'
    ].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
  }

  function bind() {
    if (typeof document === 'undefined') return;

    const calcBtn = document.getElementById('calcola');
    const resetBtn = document.getElementById('reset');
    if (!calcBtn) return;

    calcBtn.addEventListener('click', function () {
      const ral = safeNumber(document.getElementById('ral') && document.getElementById('ral').value, 0);
      const mensilita = safeNumber(document.getElementById('mensilita') && document.getElementById('mensilita').value, 13);
      const regionalRate = safeNumber(document.getElementById('regional-rate') && document.getElementById('regional-rate').value, 1.23) / 100;
      const comunalRate = safeNumber(document.getElementById('comunal-rate') && document.getElementById('comunal-rate').value, 0.8) / 100;
      const applyDetrazione = !!(document.getElementById('apply-detrazione') && document.getElementById('apply-detrazione').checked);

      if (ral <= 0) {
        window.alert('Inserisci una RAL valida.');
        return;
      }

      renderSalaryResult(calculateSalary(ral, mensilita, {
        regionalRate: regionalRate,
        comunalRate: comunalRate,
        applyDetrazione: applyDetrazione
      }));
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        const defaults = {
          ral: '',
          mensilita: '13',
          'regional-rate': '1.23',
          'comunal-rate': '0.80'
        };

        Object.entries(defaults).forEach(function ([id, value]) {
          const el = document.getElementById(id);
          if (el) el.value = value;
        });

        const applyDetrazione = document.getElementById('apply-detrazione');
        if (applyDetrazione) applyDetrazione.checked = true;
        resetSalaryResult();
      });
    }
  }

  const api = {
    INPS_RATE: INPS_RATE,
    INPS_MAX_BASE: INPS_MAX_BASE,
    computeIRPEF2026: computeIRPEF2026,
    computeDetrazioneLavoroDipendente2026: computeDetrazioneLavoroDipendente2026,
    computeCuneoFiscale2026: computeCuneoFiscale2026,
    calculateSalary: calculateSalary
  };

  window.StipendioNetto = api;
  window.calculateSalary = calculateSalary;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  bind();
})();
