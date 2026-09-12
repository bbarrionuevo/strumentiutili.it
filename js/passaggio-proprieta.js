// js/passaggio-proprieta.js — Motore IPT e Costi PRA 2026 (Zero-Backend)
document.addEventListener('DOMContentLoaded', async () => {
  const inputVeicolo = document.getElementById('calc-veicolo');
  const inputKw = document.getElementById('calc-kw');
  const inputProvincia = document.getElementById('calc-provincia');
  const inputAgenzia = document.getElementById('calc-agenzia');
  
  const outFissi = document.getElementById('res-fissi');
  const outIpt = document.getElementById('res-ipt');
  const outAgenzia = document.getElementById('res-agenzia');
  const outTotale = document.getElementById('res-totale');
  
  let regole = null;

  try {
    const response = await fetch('/data/regole-fiscali-2026.json');
    const data = await response.json();
    regole = data.passaggio_proprieta_2026;
    calculateCosti(); 
  } catch (err) {
    console.error("Errore nel caricamento delle regole fiscali:", err);
  }

  function calculateCosti() {
    if (!regole) return;

    const tipoVeicolo = inputVeicolo.value; // 'auto' o 'moto'
    const kwInput = parseFloat(inputKw.value) || 0;
    const kw = Math.floor(kwInput); // Troncamento legale
    
    const provincia = inputProvincia.value;
    const usaAgenzia = inputAgenzia.checked;

    let costiFissi = regole.costi_fissi_ministeriali.totale_standard; // 85.20€ fissi
    let costoIpt = 0;
    let costoAgenzia = 0;

    // 1. Calcolo IPT
    if (tipoVeicolo === 'moto') {
      // Le moto sono esenti da IPT variabile, pagano solo una quota fissa ridotta
      costoIpt = regole.ipt_parametri_base.ipt_fissa_moto_max;
    } 
    else if (tipoVeicolo === 'auto' && kw > 0) {
      let iptBase = 0;
      
      if (kw <= regole.ipt_parametri_base.soglia_potenza_kw) {
        iptBase = regole.ipt_parametri_base.quota_fissa_nazionale;
      } else {
        iptBase = kw * regole.ipt_parametri_base.tariffa_kw_eccedente;
      }

      // Applica Maggiorazione Provinciale
      const maggiorazione = (regole.province_maggiorazioni[provincia] !== undefined) 
                            ? regole.province_maggiorazioni[provincia] 
                            : regole.province_maggiorazioni["DEFAULT"];
      
      const iptCalcolata = iptBase * (1 + maggiorazione);
      
      // Regola legale: L'IPT provinciale va arrotondata all'euro intero (Art. 1, c. 166, L. 296/2006)
      costoIpt = Math.round(iptCalcolata);
    }

    // 2. Costo Agenzia (Pratica STA)
    if (usaAgenzia) {
      costoAgenzia = 100.00;
    }

    const totale = costiFissi + costoIpt + costoAgenzia;

    // Rendering UI
    const fmt = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    
    outFissi.textContent = fmt(costiFissi);
    outIpt.textContent = fmt(costoIpt);
    
    if (usaAgenzia) {
      outAgenzia.textContent = fmt(costoAgenzia);
      outAgenzia.parentElement.classList.remove('hidden');
      outAgenzia.parentElement.classList.add('flex');
    } else {
      outAgenzia.parentElement.classList.add('hidden');
      outAgenzia.parentElement.classList.remove('flex');
    }

    outTotale.textContent = fmt(totale);
  }

  // Event Listeners (Persistenza via storage-helper.js)
  const inputs = [inputVeicolo, inputKw, inputProvincia, inputAgenzia];
  inputs.forEach(inp => {
    if(inp) inp.addEventListener('input', calculateCosti);
  });

  // UI UX: Nascondi i kW per le moto
  if(inputVeicolo) {
    inputVeicolo.addEventListener('change', (e) => {
      const kwContainer = document.getElementById('container-kw');
      if (e.target.value === 'moto') {
        kwContainer.classList.add('opacity-50', 'pointer-events-none');
        inputKw.value = ''; // Pulisce il campo
      } else {
        kwContainer.classList.remove('opacity-50', 'pointer-events-none');
      }
      calculateCosti();
    });
  }
});