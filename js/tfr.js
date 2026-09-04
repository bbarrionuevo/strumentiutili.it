(function () {
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

  function calculateTFR(ral, anni, imponibileInps) {
    const ralSafe = Math.max(0, safeNumber(ral, 0));
    const anniSafe = Math.max(0, safeNumber(anni, 0));
    const baseInps = Math.max(0, safeNumber(imponibileInps, ralSafe));
    const fondoGaranzia = round2(baseInps * 0.005);
    const quotaAnnua = round2((ralSafe / 13.5) - fondoGaranzia);
    const tfrLordo = round2(quotaAnnua * anniSafe);
    const tassazione = round2(tfrLordo * 0.23);
    const tfrNetto = round2(tfrLordo - tassazione);

    return {
      ral: round2(ralSafe),
      anni: anniSafe,
      imponibileInps: round2(baseInps),
      fondoGaranzia: fondoGaranzia,
      quotaAnnua: quotaAnnua,
      tfrLordo: tfrLordo,
      tassazione: tassazione,
      tfrNetto: tfrNetto
    };
  }

  function bind() {
    if (typeof document === 'undefined') return;

    const btn = document.getElementById('calcola-tfr');
    if (!btn) return;

    btn.addEventListener('click', function () {
      const ralEl = document.getElementById('ral');
      const anniEl = document.getElementById('anni-servizio');
      const imponibileEl = document.getElementById('imponibile-inps');
      const result = calculateTFR(
        ralEl && ralEl.value,
        anniEl && anniEl.value,
        imponibileEl && imponibileEl.value
      );

      const outputs = {
        'res-imponibile-inps': formatEuro(result.imponibileInps),
        'res-fondo-garanzia': formatEuro(result.fondoGaranzia),
        'res-quota': formatEuro(result.quotaAnnua),
        'res-lordo': formatEuro(result.tfrLordo),
        'res-tassa': formatEuro(result.tassazione),
        'res-netto': formatEuro(result.tfrNetto)
      };

      Object.entries(outputs).forEach(function ([id, value]) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      });
    });
  }

  const api = {
    calculateTFR: calculateTFR
  };

  window.TFRCalculator = api;
  window.calculateTFR = calculateTFR;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  bind();
})();
