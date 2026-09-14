// js/mutuo.js — Simulatore Rata Mutuo e TAEG 2026 (Zero-Backend)
document.addEventListener('DOMContentLoaded', async () => {
  const inCapital = document.getElementById('calc-capitale');
  const inAnni = document.getElementById('calc-anni');
  const inTan = document.getElementById('calc-tan');
  const inFinalita = document.getElementById('calc-finalita');
  
  const outRata = document.getElementById('res-rata');
  const outTaeg = document.getElementById('res-taeg');
  const outInteressi = document.getElementById('res-interessi');
  const outTotale = document.getElementById('res-totale');
  const tableBody = document.getElementById('piano-ammortamento-body');
  
  let regole = null;

  try {
    const response = await fetch('/data/regole-fiscali-2026.json');
    const data = await response.json();
    regole = data.mutuo_francese_2026;
    calculateMutuo();
  } catch (err) {
    console.error("Errore regole fiscali:", err);
  }

  function calculateTAEG(netCapital, payment, n) {
    let i = payment / netCapital; 
    let iteration = 0;
    while (iteration < 100) {
      let f = payment * (1 - Math.pow(1 + i, -n)) / i - netCapital;
      let df = payment * (n * Math.pow(1 + i, -n - 1) * i - (1 - Math.pow(1 + i, -n))) / (i * i);
      let i_next = i - f / df;
      if (Math.abs(i_next - i) < 1e-7) {
        i = i_next;
        break;
      }
      i = i_next;
      iteration++;
    }
    return (Math.pow(1 + i, 12) - 1) * 100; 
  }

  function calculateMutuo() {
    if (!regole) return;

    const C = parseFloat(inCapital.value) || 0;
    const anni = parseInt(inAnni.value) || 0;
    const TAN = parseFloat(inTan.value) || 0;
    const isPrimaCasa = inFinalita.value === 'prima_casa';

    if (C <= 0 || anni <= 0) return;

    const n = anni * 12;
    let rata = 0;
    let totalInteressi = 0;
    let pianoAmmortamento = [];

    if (TAN === 0) {
      rata = C / n;
      totalInteressi = 0;
      let residuo = C;
      for (let k = 1; k <= n; k++) {
        residuo -= rata;
        pianoAmmortamento.push({ k, rata, quotaInteressi: 0, quotaCapitale: rata, residuo: Math.max(0, residuo) });
      }
    } else {
      const i = (TAN / 100) / 12;
      rata = C * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
      
      let residuo = C;
      for (let k = 1; k <= n; k++) {
        let quotaInteressi = residuo * i;
        let quotaCapitale = rata - quotaInteressi;
        residuo -= quotaCapitale;
        totalInteressi += quotaInteressi;
        pianoAmmortamento.push({ k, rata, quotaInteressi, quotaCapitale, residuo: Math.max(0, residuo) });
      }
    }

    // Costi accessori per TAEG
    let istruttoria = Math.max(regole.costi_bancari_standard.istruttoria.minimo, 
                      Math.min(C * regole.costi_bancari_standard.istruttoria.percentuale, 
                               regole.costi_bancari_standard.istruttoria.massimo));
    let impostaSostitutiva = C * (isPrimaCasa ? regole.imposta_sostitutiva.prima_casa : regole.imposta_sostitutiva.seconda_casa);
    let netCapital = C - istruttoria - regole.costi_bancari_standard.perizia_fissa - impostaSostitutiva;
    
    let assicurazioneMensile = C * regole.costi_bancari_standard.assicurazione_antincendio_annua_rate / 12;
    let monthlyPaymentTAEG = rata + regole.costi_bancari_standard.incasso_rata_mensile + assicurazioneMensile;
    
    let taeg = calculateTAEG(netCapital, monthlyPaymentTAEG, n);

    // Render Dashboard
    const fmt = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    outRata.textContent = fmt(rata);
    outTaeg.textContent = taeg.toFixed(2) + '%';
    outInteressi.textContent = fmt(totalInteressi);
    outTotale.textContent = fmt(C + totalInteressi + istruttoria + regole.costi_bancari_standard.perizia_fissa + impostaSostitutiva);

    // Render Table (limit rendering to 360 rows max for performance)
    if(tableBody) {
        tableBody.innerHTML = '';
        const frag = document.createDocumentFragment();
        pianoAmmortamento.forEach(row => {
          const tr = document.createElement('tr');
          tr.className = "border-b border-gray-100 hover:bg-gray-50 text-sm";
          tr.innerHTML = `
            <td class="py-2 px-3 text-center">${row.k}</td>
            <td class="py-2 px-3 text-right font-mono text-gray-900 font-semibold">${fmt(row.rata)}</td>
            <td class="py-2 px-3 text-right font-mono text-rose-600">${fmt(row.quotaInteressi)}</td>
            <td class="py-2 px-3 text-right font-mono text-emerald-600">${fmt(row.quotaCapitale)}</td>
            <td class="py-2 px-3 text-right font-mono text-gray-500">${fmt(row.residuo)}</td>
          `;
          frag.appendChild(tr);
        });
        tableBody.appendChild(frag);
    }
  }

  const inputs = [inCapital, inAnni, inTan, inFinalita];
  inputs.forEach(inp => { if(inp) inp.addEventListener('input', calculateMutuo); });
});