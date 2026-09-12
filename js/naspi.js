// js/naspi.js — Motore di calcolo NASpI 2026 (Zero-Backend)
document.addEventListener('DOMContentLoaded', async () => {
  const inEta = document.getElementById('calc-eta');
  const inRetribuzione = document.getElementById('calc-retribuzione');
  const inSettimane = document.getElementById('calc-settimane');
  const inScomputo = document.getElementById('calc-scomputo');
  
  const alertRequisiti = document.getElementById('alert-requisiti');
  
  const outImportoBase = document.getElementById('res-importo-base');
  const outDurata = document.getElementById('res-durata');
  const outTotaleLordo = document.getElementById('res-totale-lordo');
  const tableBody = document.getElementById('piano-naspi-body');
  
  let regole = null;

  try {
    const response = await fetch('/data/regole-fiscali-2026.json');
    const data = await response.json();
    regole = data.naspi_parametri_2026;
    calculateNaspi();
  } catch (err) {
    console.error("Errore nel caricamento delle regole fiscali:", err);
  }

  function calculateNaspi() {
    if (!regole) return;

    const eta = parseInt(inEta.value) || 0;
    const retribuzione = parseFloat(inRetribuzione.value) || 0;
    const settimane = parseInt(inSettimane.value) || 0;
    const scomputo = parseInt(inScomputo.value) || 0;

    // Reset UI
    alertRequisiti.classList.add('hidden');
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-gray-400 text-sm">Compila i dati per generare il piano...</td></tr>';
    outImportoBase.textContent = "€ 0,00";
    outDurata.textContent = "0 mesi";
    outTotaleLordo.textContent = "€ 0,00";

    if (eta <= 0 || retribuzione <= 0 || settimane <= 0) return;

    // 1. Controllo Requisiti Minimi (13 settimane)
    if (settimane < regole.requisiti.settimane_minime_richieste) {
      alertRequisiti.classList.remove('hidden');
      return;
    }

    // 2. Calcolo Retribuzione Media Mensile (RMM)
    const rmm = (retribuzione / settimane) * regole.coefficiente_mensilizzazione;

    // 3. Calcolo Importo Base (con massimale INPS)
    let importoBase = 0;
    if (rmm <= regole.soglia_retribuzione_inps) {
      importoBase = rmm * regole.aliquota_base;
    } else {
      importoBase = (regole.soglia_retribuzione_inps * regole.aliquota_base) + 
                    ((rmm - regole.soglia_retribuzione_inps) * regole.aliquota_eccedenza);
    }
    
    // Tetto Massimo
    importoBase = Math.min(importoBase, regole.massimale_mensile_inps);

    // 4. Calcolo Durata (metà delle settimane lavorate, meno quelle già fruite)
    const settimaneValide = Math.max(0, settimane - scomputo);
    const settimaneSpettanti = Math.min(settimaneValide / 2, regole.requisiti.settimane_massime_fruibili);
    const mesiDurata = Math.floor(settimaneSpettanti / regole.coefficiente_mensilizzazione);

    if (mesiDurata <= 0) return;

    // 5. Generazione Piano Mensile e Decalage
    const mesePartenzaDecalage = eta >= regole.decalage.soglia_eta_anni 
                                 ? regole.decalage.mese_partenza_over55 
                                 : regole.decalage.mese_partenza_standard;

    let totaleLordoSpettante = 0;
    let pianoMensile = [];
    let importoCorrente = importoBase;

    for (let m = 1; m <= mesiDurata; m++) {
      let decurtazione = 0;
      
      // Applica il decalage del 3% dal mese stabilito
      if (m >= mesePartenzaDecalage) {
        // La riduzione è cumulativa sul mese precedente
        const riduzione = importoCorrente * regole.decalage.percentuale_decurtazione;
        decurtazione = riduzione;
        importoCorrente = importoCorrente - riduzione;
      }
      
      totaleLordoSpettante += importoCorrente;
      
      pianoMensile.push({
        mese: m,
        lordo: importoCorrente,
        taglio: decurtazione
      });
    }

    // 6. Rendering UI
    const fmt = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    outImportoBase.textContent = fmt(importoBase);
    outDurata.textContent = `${mesiDurata} mesi (${Math.floor(settimaneSpettanti)} sett.)`;
    outTotaleLordo.textContent = fmt(totaleLordoSpettante);

    // Rendering Tabella
    if(tableBody) {
      tableBody.innerHTML = '';
      const frag = document.createDocumentFragment();
      pianoMensile.forEach(row => {
        const isDecalage = row.mese >= mesePartenzaDecalage;
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-100 hover:bg-gray-50 text-sm";
        tr.innerHTML = `
          <td class="py-2 px-3 text-center font-medium">${row.mese}° Mese</td>
          <td class="py-2 px-3 text-center">
            ${isDecalage ? '<span class="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-xs">-3% applicato</span>' : '<span class="text-gray-400 text-xs">Pieno</span>'}
          </td>
          <td class="py-2 px-3 text-right font-mono text-rose-500">${row.taglio > 0 ? '-' + fmt(row.taglio) : '€ 0,00'}</td>
          <td class="py-2 px-3 text-right font-mono text-gray-900 font-bold">${fmt(row.lordo)}</td>
        `;
        frag.appendChild(tr);
      });
      tableBody.appendChild(frag);
    }
  }

  // Event Listeners (Persistenza via storage-helper.js)
  const inputs = [inEta, inRetribuzione, inSettimane, inScomputo];
  inputs.forEach(inp => { if(inp) inp.addEventListener('input', calculateNaspi); });
});