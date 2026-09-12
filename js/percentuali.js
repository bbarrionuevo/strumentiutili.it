(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {

    // Funzione helper per formattare numeri (massimo 2 decimali, senza .00 inutili)
    const formatNumber = (num) => {
      if (isNaN(num) || !isFinite(num)) return "0";
      return Number(num % 1 === 0 ? num : num.toFixed(2)).toString();
    };

    // 1. Calcolo Diretto
    const calc1Perc = document.getElementById('calc1-perc');
    const calc1Val = document.getElementById('calc1-val');
    const calc1Res = document.getElementById('calc1-res');

    const updateCalc1 = () => {
      const p = parseFloat(calc1Perc.value);
      const v = parseFloat(calc1Val.value);
      if (!isNaN(p) && !isNaN(v)) {
        calc1Res.textContent = formatNumber((p * v) / 100);
      } else {
        calc1Res.textContent = "0";
      }
    };
    calc1Perc.addEventListener('input', updateCalc1);
    calc1Val.addEventListener('input', updateCalc1);


    // 2. Sconto / Ricarico
    const calc2Val = document.getElementById('calc2-val');
    const calc2Op = document.getElementById('calc2-op');
    const calc2Perc = document.getElementById('calc2-perc');
    const calc2Res = document.getElementById('calc2-res');
    const calc2Diff = document.getElementById('calc2-diff');

    const updateCalc2 = () => {
      const v = parseFloat(calc2Val.value);
      const p = parseFloat(calc2Perc.value);
      const op = calc2Op.value;

      if (!isNaN(p) && !isNaN(v)) {
        const diff = (v * p) / 100;
        const res = op === '-' ? v - diff : v + diff;
        calc2Res.textContent = formatNumber(res);
        calc2Diff.textContent = op === '-' ? `-${formatNumber(diff)}` : `+${formatNumber(diff)}`;
      } else {
        calc2Res.textContent = "0";
        calc2Diff.textContent = "0";
      }
    };
    calc2Val.addEventListener('input', updateCalc2);
    calc2Op.addEventListener('change', updateCalc2);
    calc2Perc.addEventListener('input', updateCalc2);


    // 3. Incidenza
    const calc3Part = document.getElementById('calc3-part');
    const calc3Tot = document.getElementById('calc3-tot');
    const calc3Res = document.getElementById('calc3-res');

    const updateCalc3 = () => {
      const part = parseFloat(calc3Part.value);
      const tot = parseFloat(calc3Tot.value);
      
      if (!isNaN(part) && !isNaN(tot) && tot !== 0) {
        calc3Res.textContent = formatNumber((part / tot) * 100);
      } else {
        calc3Res.textContent = "0";
      }
    };
    calc3Part.addEventListener('input', updateCalc3);
    calc3Tot.addEventListener('input', updateCalc3);


    // 4. Variazione Percentuale
    const calc4Old = document.getElementById('calc4-old');
    const calc4New = document.getElementById('calc4-new');
    const calc4Res = document.getElementById('calc4-res');

    const updateCalc4 = () => {
      const oldV = parseFloat(calc4Old.value);
      const newV = parseFloat(calc4New.value);
      
      if (!isNaN(oldV) && !isNaN(newV) && oldV !== 0) {
        const res = ((newV - oldV) / oldV) * 100;
        calc4Res.textContent = (res > 0 ? "+" : "") + formatNumber(res);
        calc4Res.className = res > 0 
          ? "text-3xl font-extrabold text-emerald-600 break-all" 
          : (res < 0 ? "text-3xl font-extrabold text-red-500 break-all" : "text-3xl font-extrabold text-gray-600 break-all");
      } else {
        calc4Res.textContent = "0";
        calc4Res.className = "text-3xl font-extrabold text-emerald-600 break-all";
      }
    };
    calc4Old.addEventListener('input', updateCalc4);
    calc4New.addEventListener('input', updateCalc4);

  });
})();