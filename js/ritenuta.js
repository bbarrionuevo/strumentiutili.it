document.addEventListener('DOMContentLoaded', function () {
  const modeSelect = document.getElementById('calculation-mode');
  const typeSelect = document.getElementById('tipo-prestazione');
  const amountInput = document.getElementById('amount');
  const rimborsiInput = document.getElementById('rimborsi');
  const includeBollo = document.getElementById('include-bollo');
  const includeRivalsa = document.getElementById('include-rivalsa');
  const annualeInput = document.getElementById('compensi-annuali');
  const amountLabel = document.getElementById('amount-label');
  const btn = document.getElementById('calcola-ritenuta');
  const professionistaOptions = document.getElementById('professionista-options');
  const occasionaleOptions = document.getElementById('occasionale-options');
  const warningEl = document.getElementById('inps-warning');

  function safeNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function round2(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
  }

  function money(value) {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(Number(value || 0));
  }

  function computeScenario(config) {
    const type = config.type === 'occasionale' ? 'occasionale' : 'professionista';
    const compenso = Math.max(0, safeNumber(config.compenso, 0));
    const rimborsi = Math.max(0, safeNumber(config.rimborsi, 0));
    const rivalsa = type === 'professionista' && config.includeRivalsa ? round2(compenso * 0.04) : 0;
    const baseRitenuta = round2(type === 'professionista' ? compenso + rivalsa : compenso);
    const ritenuta = round2(baseRitenuta * 0.20);
    const compensiPregressi = type === 'occasionale' ? Math.max(0, safeNumber(config.compensiPregressi, 0)) : 0;
    const eccedenzaNuova = type === 'occasionale'
      ? Math.max(0, compenso - Math.max(0, 5000 - compensiPregressi))
      : 0;
    const contributiInpsTotali = round2(eccedenzaNuova * 0.33);
    const quotaLavoratoreInps = round2(contributiInpsTotali / 3);
    const subtotaleDocumento = round2(compenso + rivalsa + rimborsi);
    const bollo = config.includeBollo && subtotaleDocumento > 77.47 ? 2 : 0;
    const totaleDocumento = round2(subtotaleDocumento + bollo);
    const netto = round2(totaleDocumento - ritenuta - quotaLavoratoreInps);

    return {
      tipo: type,
      compenso: round2(compenso),
      rimborsi: round2(rimborsi),
      rivalsa: round2(rivalsa),
      baseRitenuta: baseRitenuta,
      ritenuta: ritenuta,
      bollo: bollo,
      quotaLavoratoreInps: quotaLavoratoreInps,
      contributiInpsTotali: contributiInpsTotali,
      eccedenzaNuova: round2(eccedenzaNuova),
      compensiPregressi: round2(compensiPregressi),
      totaleDocumento: totaleDocumento,
      netto: netto
    };
  }

  function solveCompensoFromNet(config) {
    const target = Math.max(0, safeNumber(config.targetNetto, 0));
    let low = 0;
    let high = Math.max(1000, target * 3 + 10000);
    let scenario = computeScenario({
      type: config.type,
      compenso: high,
      rimborsi: config.rimborsi,
      includeBollo: config.includeBollo,
      includeRivalsa: config.includeRivalsa,
      compensiPregressi: config.compensiPregressi
    });

    while (scenario.netto < target) {
      high *= 2;
      scenario = computeScenario({
        type: config.type,
        compenso: high,
        rimborsi: config.rimborsi,
        includeBollo: config.includeBollo,
        includeRivalsa: config.includeRivalsa,
        compensiPregressi: config.compensiPregressi
      });
      if (high > 10000000) break;
    }

    for (let i = 0; i < 60; i += 1) {
      const mid = (low + high) / 2;
      const current = computeScenario({
        type: config.type,
        compenso: mid,
        rimborsi: config.rimborsi,
        includeBollo: config.includeBollo,
        includeRivalsa: config.includeRivalsa,
        compensiPregressi: config.compensiPregressi
      });

      if (current.netto < target) {
        low = mid;
      } else {
        high = mid;
        scenario = current;
      }
    }

    return computeScenario({
      type: config.type,
      compenso: high,
      rimborsi: config.rimborsi,
      includeBollo: config.includeBollo,
      includeRivalsa: config.includeRivalsa,
      compensiPregressi: config.compensiPregressi
    });
  }

  function calculate() {
    const mode = modeSelect ? modeSelect.value : 'lordo-netto';
    const type = typeSelect ? typeSelect.value : 'professionista';
    const amount = Math.max(0, safeNumber(amountInput && amountInput.value, 0));
    const rimborsi = Math.max(0, safeNumber(rimborsiInput && rimborsiInput.value, 0));
    const compensiPregressi = Math.max(0, safeNumber(annualeInput && annualeInput.value, 0));

    const result = mode === 'netto-lordo'
      ? solveCompensoFromNet({
        type: type,
        targetNetto: amount,
        rimborsi: rimborsi,
        includeBollo: !!(includeBollo && includeBollo.checked),
        includeRivalsa: !!(includeRivalsa && includeRivalsa.checked),
        compensiPregressi: compensiPregressi
      })
      : computeScenario({
        type: type,
        compenso: amount,
        rimborsi: rimborsi,
        includeBollo: !!(includeBollo && includeBollo.checked),
        includeRivalsa: !!(includeRivalsa && includeRivalsa.checked),
        compensiPregressi: compensiPregressi
      });

    const outputs = {
      'res-lordo': money(result.compenso),
      'res-rivalsa': money(result.rivalsa),
      'res-base-ritenuta': money(result.baseRitenuta),
      'res-ritenuta': money(result.ritenuta),
      'res-inps-lavoratore': money(result.quotaLavoratoreInps),
      'res-marca': money(result.bollo),
      'res-netto': money(result.netto)
    };

    Object.entries(outputs).forEach(function ([id, value]) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    if (warningEl) {
      if (result.tipo === 'occasionale' && (result.compensiPregressi + result.compenso) > 5000) {
        warningEl.className = 'mt-3 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800';
        warningEl.textContent = 'Superata la franchigia annua di € 5.000: la quota eccedente sconta il 33% INPS, di cui 1/3 resta a carico del prestatore ed è già detratto dal netto.';
      } else {
        warningEl.className = 'hidden';
        warningEl.textContent = '';
      }
    }
  }

  function updateUi() {
    const type = typeSelect ? typeSelect.value : 'professionista';
    const mode = modeSelect ? modeSelect.value : 'lordo-netto';

    if (professionistaOptions) {
      professionistaOptions.style.display = type === 'professionista' ? '' : 'none';
      professionistaOptions.classList.toggle('hidden', type !== 'professionista');
    }

    if (occasionaleOptions) {
      occasionaleOptions.style.display = type === 'occasionale' ? '' : 'none';
      occasionaleOptions.classList.toggle('hidden', type !== 'occasionale');
    }

    if (amountLabel) {
      amountLabel.textContent = mode === 'lordo-netto' ? 'Compenso lordo (€)' : 'Netto desiderato (€)';
    }
  }

  if (typeSelect) typeSelect.addEventListener('change', function () { updateUi(); calculate(); });
  if (modeSelect) modeSelect.addEventListener('change', function () { updateUi(); calculate(); });
  if (amountInput) amountInput.addEventListener('input', calculate);
  if (rimborsiInput) rimborsiInput.addEventListener('input', calculate);
  if (annualeInput) annualeInput.addEventListener('input', calculate);
  if (includeBollo) includeBollo.addEventListener('change', calculate);
  if (includeRivalsa) includeRivalsa.addEventListener('change', calculate);
  if (btn) btn.addEventListener('click', calculate);

  updateUi();
  calculate();
});
