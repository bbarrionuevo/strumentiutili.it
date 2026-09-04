const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const round2 = (value) => Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));

// Ricerca in tempo reale sulla pagina principale
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search');
  if (!searchInput) return;

  searchInput.addEventListener('input', (event) => {
    const query = event.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll('main section article');

    cards.forEach((card) => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(query) ? '' : 'none';
    });
  });
});

// --- Additional tools and calculators (privacy-first; all in-browser) ---

// --- Utility: IRPEF calculation (official scaglioni: 23% up to €28.000, 33% 28.001-50.000, 43% >50.000) ---
// js/main.js
function computeIRPEF(taxable) {
  const safeTaxable = Math.max(0, safeNumber(taxable, 0));
  let remaining = safeTaxable;
  let tax = 0;
  const bands = [
    { upTo: 28000, rate: 0.23 },
    { upTo: 50000, rate: 0.33 }, // Aggiornato al 33% per il 2026
    { upTo: Infinity, rate: 0.43 }
  ];
  let lower = 0;
  for (const b of bands) {
    const cap = (Number.isFinite(b.upTo) ? b.upTo : safeTaxable + 1) - lower;
    const taxed = Math.max(0, Math.min(remaining, cap));
    tax += taxed * b.rate;
    remaining -= taxed;
    lower = Number.isFinite(b.upTo) ? b.upTo : lower;
    if (remaining <= 0) break;
  }
  return Math.max(0, round2(tax));
}

// --- Detrazione per lavoro dipendente (approssimata) ---
// NOTE: la detrazione reale è complessa e dipende da reddito, carichi e normativa; qui si fornisce
// una funzione parametrizzabile che restituisce una detrazione stimata. Sostituire con la regola ufficiale se disponibile.
function computeDetrazioneLavoroDipendente(taxable) {
  const safeTaxable = Math.max(0, safeNumber(taxable, 0));
  if (safeTaxable <= 8000) return 1880;
  if (safeTaxable <= 15000) return Math.max(0, round2(1880 - ((safeTaxable - 8000) * 0.12)));
  if (safeTaxable <= 55000) return Math.max(0, round2(1200 - ((safeTaxable - 15000) * 0.02)));
  return 0;
}

// --- Salary calculator (client-side, privacy-first) ---
function calculateSalary(ral, paghe = 12, contract = 'standard', options = {}) {
  const safeRal = Math.max(0, safeNumber(ral, 0));
  const safePaghe = Math.max(1, safeNumber(paghe, 12));
  const inpsRate = 0.0919;
  const inps = round2(safeRal * inpsRate);

  const taxable = Math.max(0, round2(safeRal - inps));
  const irpef = computeIRPEF(taxable);

  // Apply detrazione by default unless explicitly disabled via options.applyDetrazione === false
  const detrazione = options.overrideDetrazione != null ? round2(safeNumber(options.overrideDetrazione, 0)) : (options.applyDetrazione === false ? 0 : computeDetrazioneLavoroDipendente(taxable));
  const irpefNet = Math.max(0, round2(irpef - detrazione));

  // Use regional 1.23% + comunal 0.80% = total 2.03% as requested
  const regionalRate = options.regionalRate != null ? safeNumber(options.regionalRate, 0.0123) : 0.0123;
  const comunalRate = options.comunalRate != null ? safeNumber(options.comunalRate, 0.008) : 0.008;
  const addizionali = round2(taxable * (regionalRate + comunalRate));

  const nettoAnnuo = round2(safeRal - inps - irpefNet - addizionali);
  const nettoMensile = round2(nettoAnnuo / safePaghe);

  return {
    ral: round2(safeRal),
    inps: round2(inps),
    taxable: round2(taxable),
    irpef: round2(irpef),
    detrazione: round2(detrazione),
    irpefNet: round2(irpefNet),
    addizionali: round2(addizionali),
    nettoAnnuo: round2(nettoAnnuo),
    nettoMensile: round2(nettoMensile)
  };
}

// --- Codice Fiscale logic is centralized in js/codice-fiscale.js ---

// --- IVA calculator (exact formulas with 2-decimals rounding) ---
function computeIVA(amount, ratePercent){
  const rate = safeNumber(ratePercent, 0) / 100;
  const base = safeNumber(amount, 0);
  const safeRate = Number.isFinite(rate) ? rate : 0;

  const withIVA_from_base = round2(base * (1 + safeRate));
  const iva_from_base = round2(withIVA_from_base - base);
  const total = round2(base);
  const withoutIVA_from_total = safeRate === 0 ? total : round2(total / (1 + safeRate));
  const iva_from_total = safeRate === 0 ? 0 : round2(total - withoutIVA_from_total);

  return {
    base: round2(base),
    withIVA: round2(withIVA_from_base),
    iva: round2(iva_from_base),
    withoutIVA: round2(base),
    total: round2(total),
    withoutIVA_from_total: round2(withoutIVA_from_total),
    iva_from_total: round2(iva_from_total),
    withIVA_from_total: round2(total)
  };
}

window.computeIVA = computeIVA;
window.calculateIVA = computeIVA;
window.calculateSalary = calculateSalary;
window.computeIRPEF = computeIRPEF;

// --- PDF Merge (using PDFLib loaded via CDN) ---
async function mergePDFFiles(fileList) {
  const msgEl = document.getElementById('pdf-msg');
  msgEl && (msgEl.textContent = 'Unione in corso (tutto in locale)...');
  const mergedPdf = await PDFLib.PDFDocument.create();
  for (const file of fileList) {
    const arr = await file.arrayBuffer();
    const src = await PDFLib.PDFDocument.load(arr);
    const copied = await mergedPdf.copyPages(src, src.getPageIndices());
    copied.forEach(p=> mergedPdf.addPage(p));
  }
  const out = await mergedPdf.save();
  const blob = new Blob([out],{type:'application/pdf'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'merged.pdf'; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  msgEl && (msgEl.textContent = 'Download preparato.');
}

// --- Web Worker helper: prefer worker for heavy calculations if available ---
function runSalaryCalculationInWorker(payload, onMessage){
  if (!window.Worker) {
    onMessage({ type:'result', result: calculateSalary(payload.ral, payload.paghe, payload.contract) });
    return;
  }
  const worker = new Worker('/js/workers/worker-sample.js');
  worker.postMessage({ action:'computeSalary', payload });
  worker.onmessage = (ev)=>{
    onMessage(ev.data);
    worker.terminate();
  };
}

// --- DOM wiring: works across index and tool pages if elements are present ---
document.addEventListener('DOMContentLoaded', ()=>{
  // Salary on index search card? also for dedicated page
  const salaryBtn = document.getElementById('salary-calc');
  if (salaryBtn){
    salaryBtn.addEventListener('click', ()=>{
      const ral = Number(document.getElementById('ral').value || 0);
      const paghe = Number(document.getElementById('paghe').value || 12);
      const contract = document.getElementById('contract').value;
      const resultEl = document.getElementById('salary-result');
      resultEl.textContent = 'Calcolo in corso...';
      runSalaryCalculationInWorker({ral,paghe,contract}, (msg)=>{
        if (msg.type === 'result') {
          const r = msg.result;
          resultEl.innerHTML = `<strong>Netto annuo:</strong> € ${r.nettoAnnuo} — <strong>Netto per paga:</strong> € ${r.nettoMensile}<br><small>IRPEF: € ${r.irpef} — INPS: € ${r.inps}</small>`;
        }
      });
    });
  }

  // Codice fiscale
  const cfBtn = document.getElementById('cf-gen');
  if (cfBtn){
    cfBtn.addEventListener('click', ()=>{
      const nome = document.getElementById('nome').value.trim();
      const cognome = document.getElementById('cognome').value.trim();
      const data = document.getElementById('data-nascita').value;
      const sesso = document.getElementById('sesso').value;
      const comune = document.getElementById('comune').value.trim();
      const out = document.getElementById('cf-result');
      if (!nome||!cognome||!data){ out.textContent = 'Completa nome, cognome e data.'; return; }
      const cf = generateCodiceFiscale(nome,cognome,data,sesso,comune);
      const validObj = validateCodiceFiscale(cf);
      out.innerHTML = `<div><strong>Codice Fiscale:</strong> <code>${cf}</code></div><div class="mt-2">Valido (controllo sintattico): ${validObj && validObj.valid ? 'Sì' : 'No'}</div>`;
    });
  }

  // IVA
  const ivaBtn = document.getElementById('iva-calc');
  if (ivaBtn){
    ivaBtn.addEventListener('click', ()=>{
      const amount = Number(document.getElementById('iva-amount').value || 0);
      const rate = Number(document.getElementById('iva-rate').value || 22);
      const res = computeIVA(amount,rate);
      document.getElementById('iva-result').innerHTML = `<div>Imponibile: € ${res.withoutIVA.toFixed(2)}</div><div>IVA (${rate}%): € ${res.iva.toFixed(2)}</div><div>Totale: € ${res.withIVA.toFixed(2)}</div>`;
    });
  }

  // PDF merge
  const pdfInput = document.getElementById('pdf-files');
  const pdfDrop = document.getElementById('pdf-drop');
  const pdfMergeBtn = document.getElementById('pdf-merge');
  if (pdfInput && pdfMergeBtn){
    pdfMergeBtn.addEventListener('click', async ()=>{
      const files = Array.from(pdfInput.files || []);
      if (files.length < 2) { document.getElementById('pdf-msg').textContent = 'Seleziona almeno 2 PDF.'; return; }
      await mergePDFFiles(files);
    });
    // Drag & drop
    if (pdfDrop){
      pdfDrop.addEventListener('dragover', (e)=>{ e.preventDefault(); pdfDrop.classList.add('bg-gray-100'); });
      pdfDrop.addEventListener('dragleave', ()=> pdfDrop.classList.remove('bg-gray-100'));
      pdfDrop.addEventListener('drop', (e)=>{
        e.preventDefault(); pdfDrop.classList.remove('bg-gray-100');
        const files = Array.from(e.dataTransfer.files || []).filter(f=>f.type==='application/pdf');
        if (files.length) {
          // Set to input for user confirmation
          // Can't set FileList directly; show count and keep files in-memory
          pdfInput.files = e.dataTransfer.files;
          document.getElementById('pdf-msg').textContent = `${files.length} file PDF pronti. Premi 'Unisci e Scarica'.`;
        }
      });
    }
  }

});
