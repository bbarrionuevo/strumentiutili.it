// worker-sample.js — Web Worker to offload heavy tasks (salary calc example)
self.addEventListener('message', (ev)=>{
  const { action, payload } = ev.data || {};
  if (action === 'computeSalary'){
    const { ral=0, paghe=12, contract='standard' } = payload || {};
    // replicate same logic as main thread (keeps worker independent)
    const inpsRate = 0.0919;
    const inps = Number((ral * inpsRate).toFixed(2));
    const taxable = Math.max(0, ral - inps);
    function computeIRPEF(taxable){
      const bands = [
        { upTo: 28000, rate: 0.23 },
        { upTo: 50000, rate: 0.33 },
        { upTo: Infinity, rate: 0.43 }
      ];
      let remaining = taxable; let tax = 0; let lower = 0;
      for (const b of bands){
        const cap = b.upTo - lower;
        const taxed = Math.max(0, Math.min(remaining, cap));
        tax += taxed * b.rate; remaining -= taxed; lower = b.upTo; if (remaining<=0) break;
      }
      return Number(tax.toFixed(2));
    }
    function computeDetrazione(taxable){
      if (taxable <= 8000) return 1880;
      if (taxable <= 15000) return Math.max(0, 1880 - ((taxable - 8000) * 0.12));
      if (taxable <= 55000) return Math.max(0, 1200 - ((taxable - 15000) * 0.02));
      return 0;
    }
    const irpef = computeIRPEF(taxable);
    const detrazione = computeDetrazione(taxable);
    const irpefNet = Math.max(0, irpef - detrazione);
    const regionalRate = 0.0161; const comunalRate = 0.008;
    const addizionali = Number((taxable * (regionalRate + comunalRate)).toFixed(2));
    const nettoAnnuo = Number((ral - inps - irpefNet - addizionali).toFixed(2));
    const nettoMensile = Number((nettoAnnuo / paghe).toFixed(2));
    const result = { ral: Number(ral.toFixed(2)), inps, taxable: Number(taxable.toFixed(2)), irpef, detrazione, irpefNet, addizionali, nettoAnnuo, nettoMensile };
    self.postMessage({ type: 'result', result });
  }
});
