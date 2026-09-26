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
    const data = await window.StrumentiData.getRegoleFiscali();
    if (!data) throw new Error('Regole fiscali non disponibili.');
    regole = data.naspi_parametri_2026;
    calculateNaspi();
  } catch (err) {
    console.error("Errore nel caricamento delle regole fiscali:", err);
  }

  function calculateNaspi() {
    if (!regole || !window.NaspiCalcolo) return;

    // Reset UI
    alertRequisiti.classList.add('hidden');
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-gray-400 text-sm">Compila i dati per generare il piano...</td></tr>';
    outImportoBase.textContent = "€ 0,00";
    outDurata.textContent = "0 mesi";
    outTotaleLordo.textContent = "€ 0,00";

    // Il conto e' in js/naspi-calcolo.js, lo stesso usato dalla guida e dai test.
    const r = window.NaspiCalcolo.calcola({
      eta: inEta.value,
      retribuzione: inRetribuzione.value,
      settimane: inSettimane.value,
      scomputo: inScomputo.value
    }, regole);

    if (r.esito === 'settimane_insufficienti') {
      alertRequisiti.classList.remove('hidden');
      return;
    }
    if (r.esito !== 'ok') return;

    const fmt = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    outImportoBase.textContent = fmt(r.importoBase);
    outDurata.textContent = `${r.mesi} mesi (${Math.floor(r.settimaneSpettanti)} sett.)`;
    outTotaleLordo.textContent = fmt(r.totale);

    if (tableBody) {
      tableBody.innerHTML = '';
      const frag = document.createDocumentFragment();
      r.piano.forEach(row => {
        const isDecalage = row.mese >= r.mesePartenzaDecalage;
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