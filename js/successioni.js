// js/successioni.js — Calcolo Quote Ereditarie 2026 (Zero-Backend)
document.addEventListener('DOMContentLoaded', async () => {
  const inTestamento = document.getElementById('calc-testamento');
  const inConiuge = document.getElementById('calc-coniuge');
  const inFigli = document.getElementById('calc-figli');
  const inAscendenti = document.getElementById('calc-ascendenti');
  
  const inRelictum = document.getElementById('calc-relictum');
  const inDebiti = document.getElementById('calc-debiti');
  const inDonatum = document.getElementById('calc-donatum');
  
  const outMassa = document.getElementById('res-massa');
  const tableBody = document.getElementById('quote-body');
  
  let regole = null;

  try {
    const response = await fetch('/data/regole-fiscali-2026.json');
    const data = await response.json();
    regole = data.successioni_italia_2026;
    calculateEredita();
  } catch (err) {
    console.error("Errore JSON regole fiscali:", err);
  }

  const fmt = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  function formatFraction(n, d) {
    if (n === 0) return "0";
    if (n === d) return "Intera Eredità (1/1)";
    const div = gcd(n, d);
    return `${n/div}/${d/div}`;
  }

  function calculateEredita() {
    if (!regole) return;

    const hasTestamento = inTestamento.value === 'si';
    const coniuge = inConiuge.value; // 'si', 'no', 'separato_addebito'
    const numFigli = parseInt(inFigli.value) || 0;
    const hasAscendenti = inAscendenti.value === 'si';

    const relictum = parseFloat(inRelictum.value) || 0;
    const debiti = parseFloat(inDebiti.value) || 0;
    const donatum = parseFloat(inDonatum.value) || 0;

    // Regola Riunione Fittizia: Max(0, Relictum - Debiti) + Donatum
    const nettoAsse = Math.max(0, relictum - debiti);
    const massa = nettoAsse + donatum;
    outMassa.textContent = fmt(massa);

    if (massa <= 0 && relictum <= 0) {
      if(tableBody) tableBody.innerHTML = '<tr><td colspan="3" class="py-8 text-center text-gray-400 text-sm">Inserisci i dati del patrimonio...</td></tr>';
      return;
    }

    let quote = [];
    const hasConiugeValido = (coniuge === 'si');

    if (hasTestamento) {
      // SUCCESSIONE TESTAMENTARIA (Quota di Legittima + Disponibile)
      const rt = regole.regole_legittima_testamento;
      let scenario = null;

      if (hasConiugeValido && numFigli === 0 && !hasAscendenti) scenario = rt.solo_coniuge;
      else if (hasConiugeValido && numFigli === 1) scenario = rt.coniuge_un_figlio;
      else if (hasConiugeValido && numFigli >= 2) scenario = rt.coniuge_due_o_piu_figli;
      else if (!hasConiugeValido && numFigli === 1) scenario = rt.un_figlio_senza_coniuge;
      else if (!hasConiugeValido && numFigli >= 2) scenario = rt.piu_figli_senza_coniuge;
      else if (hasConiugeValido && numFigli === 0 && hasAscendenti) scenario = rt.coniuge_ascendenti;
      else if (!hasConiugeValido && numFigli === 0 && hasAscendenti) scenario = rt.solo_ascendenti;

      if (scenario) {
        if (scenario.coniuge_num > 0) quote.push({ erede: "Coniuge Superstite", q_n: scenario.coniuge_num, q_d: scenario.coniuge_den });
        if (scenario.figli_totale_num > 0) quote.push({ erede: `Figli (da dividere per ${numFigli})`, q_n: scenario.figli_totale_num, q_d: scenario.figli_totale_den });
        if (scenario.ascendenti_num > 0) quote.push({ erede: "Ascendenti (Genitori/Nonni)", q_n: scenario.ascendenti_num, q_d: scenario.ascendenti_den });
        if (scenario.disponibile_num > 0) quote.push({ erede: "Quota Disponibile (Testamento)", q_n: scenario.disponibile_num, q_d: scenario.disponibile_den, isDisponibile: true });
      } else {
        // Nessun legittimario
        quote.push({ erede: "Quota Disponibile (Piena Libertà Testamentaria)", q_n: 1, q_d: 1, isDisponibile: true });
      }

    } else {
      // SUCCESSIONE LEGITTIMA (Senza Testamento - 100% distribuito)
      const rl = regole.regole_legittima_senza_testamento;
      
      if (hasConiugeValido && numFigli === 0 && !hasAscendenti) {
        quote.push({ erede: "Coniuge Superstite", q_n: rl.solo_coniuge.coniuge_num, q_d: rl.solo_coniuge.coniuge_den });
      } else if (hasConiugeValido && numFigli === 1) {
        quote.push({ erede: "Coniuge Superstite", q_n: rl.coniuge_un_figlio.coniuge_num, q_d: rl.coniuge_un_figlio.coniuge_den });
        quote.push({ erede: "Figlio Unico", q_n: rl.coniuge_un_figlio.figli_num, q_d: rl.coniuge_un_figlio.figli_den });
      } else if (hasConiugeValido && numFigli >= 2) {
        quote.push({ erede: "Coniuge Superstite", q_n: rl.coniuge_piu_figli.coniuge_num, q_d: rl.coniuge_piu_figli.coniuge_den });
        quote.push({ erede: `Figli (da dividere per ${numFigli})`, q_n: rl.coniuge_piu_figli.figli_num, q_d: rl.coniuge_piu_figli.figli_den });
      } else if (!hasConiugeValido && numFigli > 0) {
        quote.push({ erede: `Figli (da dividere per ${numFigli})`, q_n: rl.solo_figli.figli_num, q_d: rl.solo_figli.figli_den });
      } else if (hasConiugeValido && numFigli === 0 && hasAscendenti) {
        quote.push({ erede: "Coniuge Superstite", q_n: rl.coniuge_e_ascendenti.coniuge_num, q_d: rl.coniuge_e_ascendenti.coniuge_den });
        quote.push({ erede: "Ascendenti e Fratelli", q_n: rl.coniuge_e_ascendenti.ascendenti_num, q_d: rl.coniuge_e_ascendenti.ascendenti_den });
      } else if (!hasConiugeValido && numFigli === 0 && hasAscendenti) {
        quote.push({ erede: "Ascendenti e Fratelli", q_n: rl.solo_ascendenti.ascendenti_num, q_d: rl.solo_ascendenti.ascendenti_den });
      } else {
        quote.push({ erede: "Parenti fino al 6° grado o Stato Italiano", q_n: 1, q_d: 1 });
      }
    }

    // Rendering Tabella
    if(tableBody) {
      tableBody.innerHTML = '';
      const frag = document.createDocumentFragment();
      quote.forEach(q => {
        const valEuro = massa * (q.q_n / q.q_d);
        const fractionStr = formatFraction(q.q_n, q.q_d);
        
        const tr = document.createElement('tr');
        tr.className = `border-b border-gray-100 hover:bg-gray-50 text-sm ${q.isDisponibile ? 'bg-indigo-50/30' : ''}`;
        tr.innerHTML = `
          <td class="py-3 px-4 font-medium text-gray-800">${q.erede} ${q.isDisponibile ? '✨' : ''}</td>
          <td class="py-3 px-4 text-center font-mono text-indigo-600 font-bold">${fractionStr}</td>
          <td class="py-3 px-4 text-right font-mono text-gray-900 font-bold">${fmt(valEuro)}</td>
        `;
        frag.appendChild(tr);
      });
      tableBody.appendChild(frag);
    }
  }

  // Interazioni UI: Se ci sono figli, gli ascendenti non ereditano (Art. 536 cc)
  inFigli.addEventListener('input', () => {
    if(parseInt(inFigli.value) > 0) {
      inAscendenti.value = 'no';
      inAscendenti.disabled = true;
    } else {
      inAscendenti.disabled = false;
    }
  });

  const inputs = [inTestamento, inConiuge, inFigli, inAscendenti, inRelictum, inDebiti, inDonatum];
  inputs.forEach(inp => { if(inp) inp.addEventListener('input', calculateEredita); });
});