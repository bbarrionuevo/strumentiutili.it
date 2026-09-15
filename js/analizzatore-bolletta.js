// js/analizzatore-bolletta.js — Scanner Bolletta Luce 3.0 con Worker, Fast-Extraction, Sanity Check e JSON Dinamico
(function () {
  'use strict';

  const dropArea = document.getElementById('drop-area');
  const fileInput = document.getElementById('file-input');
  const loadingState = document.getElementById('loading-state');
  const progressText = loadingState ? loadingState.querySelector('p') : null;
  const resultsDashboard = document.getElementById('results-dashboard');
  
  const resKwh = document.getElementById('res-kwh');
  const resFissi = document.getElementById('res-fissi');
  const resVerdetto = document.getElementById('res-verdetto');
  const alertsContainer = document.getElementById('alerts-container');
  const btnReset = document.getElementById('btn-reset');

  // 1. Parametri di Mercato 2026 (Valori di Fallback iniziale)
  let PUN_MEDIO_STIMATO_KWH = 0.125; 
  let SPREAD_MAXIMO_FISIOLOGICO = 0.04; 
  let QUOTA_FISSA_MAXIMA_ANUAL = 120.00;

  // 2. Caricamento dinamico dei parametri dal JSON locale
  async function loadMarketParameters() {
    try {
      const response = await fetch('/data/regole-fiscali-2026.json');
      if (!response.ok) throw new Error('File JSON non trovato o inaccessibile.');
      const data = await response.json();
      
      if (data.mercato_energia_2026) {
        PUN_MEDIO_STIMATO_KWH = data.mercato_energia_2026.pun_medio_stimato_kwh;
        SPREAD_MAXIMO_FISIOLOGICO = data.mercato_energia_2026.spread_massimo_fisiologico;
        QUOTA_FISSA_MAXIMA_ANUAL = data.mercato_energia_2026.quota_fissa_massima_annua;
        console.log(`[StrumentiUtili] Parametri energia aggiornati al: ${data.mercato_energia_2026.ultimo_aggiornamento}`);
      }
    } catch (error) {
      console.warn('[StrumentiUtili] Impossibile caricare il JSON dei parametri. Verranno utilizzati i valori di default.', error);
    }
  }

  // Avvia il caricamento dei parametri appena il DOM è pronto
  document.addEventListener('DOMContentLoaded', () => {
    loadMarketParameters();
  });

  // 3. Gestione Eventi UI (Drag & Drop, Click)
  if (dropArea && fileInput) {
    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('bg-indigo-100'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('bg-indigo-100'));
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault(); dropArea.classList.remove('bg-indigo-100');
      if (e.dataTransfer.files.length) startAnalysis(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function() {
      if (this.files.length) startAnalysis(this.files[0]);
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      resultsDashboard.classList.add('hidden');
      dropArea.classList.remove('hidden');
      fileInput.value = '';
    });
  }

  function updateProgress(msg) {
    if (progressText) progressText.textContent = msg;
  }

  // 4. Flusso Principale di Analisi
  async function startAnalysis(file) {
    dropArea.classList.add('hidden');
    loadingState.classList.remove('hidden');
    alertsContainer.innerHTML = '';
    updateProgress('Avvio analisi documento...');

    try {
      let rawText = '';

      if (file.type === 'application/pdf') {
        // TENTATIVO 1: Estrazione Veloce Nativa (Zero CPU)
        rawText = await extractNativePdfText(file);
        
        // Se il PDF è una scansione e non ha testo, usiamo il Canvas + Worker OCR
        if (rawText.length < 50) {
          updateProgress('PDF scansionato rilevato. Preparazione OCR...');
          const imageBlobUrl = await renderPdfToImageBlob(file);
          rawText = await runOcrWorker(imageBlobUrl);
          URL.revokeObjectURL(imageBlobUrl); 
        }
      } else {
        // TENTATIVO 2: Immagine diretta -> Worker OCR
        const imageBlobUrl = URL.createObjectURL(file);
        rawText = await runOcrWorker(imageBlobUrl);
        URL.revokeObjectURL(imageBlobUrl);
      }

      updateProgress('Analisi tariffe e algoritmi ARERA in corso...');
      const extractedData = parseBollettaText(rawText);
      runEvaluationLogic(extractedData);

    } catch (error) {
      console.error(error);
      alert("Errore durante l'elaborazione: " + error.message);
      if (btnReset) btnReset.click();
    } finally {
      loadingState.classList.add('hidden');
    }
  }

  // --- ESTRAZIONE NATIVA (FAST PATH) ---
  async function extractNativePdfText(file) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js non disponibile.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let fullText = '';
    // Legge fino a 2 pagine
    const maxPages = Math.min(pdf.numPages, 2);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + ' ';
    }
    return fullText.trim();
  }

  // --- RENDER PDF -> IMMAGINE (Per OCR) ---
  async function renderPdfToImageBlob(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pageNum = pdf.numPages >= 2 ? 2 : 1; 
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return new Promise(resolve => canvas.toBlob(blob => resolve(URL.createObjectURL(blob)), 'image/jpeg', 0.9));
  }

  // --- ESECUZIONE WORKER OCR ---
  function runOcrWorker(imageBlobUrl) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('/js/workers/ocr-worker.js'); 
      worker.onmessage = function(e) {
        const data = e.data;
        if (data.type === 'progress') {
          updateProgress(`Riconoscimento ottico: ${data.pct}%`);
        } else if (data.type === 'status') {
          updateProgress(data.msg);
        } else if (data.type === 'success') {
          resolve(data.text);
        } else if (data.type === 'error') {
          reject(new Error(data.msg));
        }
      };
      worker.postMessage({ imageBlobUrl: imageBlobUrl, lang: 'ita' });
    });
  }

  // --- PARSER SINTATTICO CON SANITIZZAZIONE E OCR SANITY CHECK ---
  function parseBollettaText(text) {
    let result = { costoKwh: null, quotaFissaMensile: null };
    if (!text) return result;

    let normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
    // Correzione Typo OCR: Se legge "o,185" o "O,185", lo forza a "0,185"
    normalizedText = normalizedText.replace(/(^|\s)[oO]([.,][0-9]+)/g, '$10$2');

    const kwhMatch = normalizedText.match(/([0-9]{1,2}[.,][0-9]{2,5})\s*(?:€\/?kwh|euro\/?kwh|€\/kwh)/);
    if (kwhMatch) {
        let valStr = kwhMatch[1].replace(',', '.');
        let val = parseFloat(valStr);

        // SANITY CHECK: Corregge letture allucinate dall'OCR (es. 6,185 -> 0,185)
        if (val > 2.0) {
            valStr = "0" + valStr.substring(1);
            val = parseFloat(valStr);
        }
        result.costoKwh = val;
    }

    const fissaMatch = normalizedText.match(/([0-9]{1,3}[.,][0-9]{2})\s*(?:€\/?mese|euro\/?mese)/);
    if (fissaMatch) {
        result.quotaFissaMensile = parseFloat(fissaMatch[1].replace(',', '.'));
    }

    return result;
  }

  // --- LOGICA VALUTATIVA E RENDERING (CON GESTIONE ERRORI) ---
  function runEvaluationLogic(data) {
    resultsDashboard.classList.remove('hidden');
    alertsContainer.innerHTML = '';
    
    // ERRORE ELEGANTE SE NON TROVA I DATI
    if (!data.costoKwh) {
      if (resKwh) resKwh.textContent = "--";
      if (resFissi) resFissi.textContent = "--";
      
      alertsContainer.innerHTML = `
        <div class="p-4 text-sm font-medium rounded-lg border bg-orange-50 text-orange-800 border-orange-200">
          ⚠️ <b>Dati non rilevati.</b> L'algoritmo non è riuscito a leggere il costo della materia energia. Assicurati di aver caricato lo <b>"Scontrino dell'Energia" (solitamente a Pagina 2)</b> e che il documento sia nitido e non tagliato.
        </div>
      `;
      
      resVerdetto.innerHTML = "Analisi interrotta. I dati estratti non sono sufficienti per emettere una valutazione tariffaria sicura.";
      resVerdetto.parentElement.className = "bg-gray-50 border border-gray-200 rounded-xl p-5 mt-4";
      resVerdetto.parentElement.querySelector('h3').classList.replace('text-indigo-900', 'text-gray-900');
      resVerdetto.className = "text-sm text-gray-800 leading-relaxed font-medium";
      
      return; 
    }

    // ANALISI REALE
    let alerts = []; 
    let isBadTariff = false;

    let costoMateriaPrima = data.costoKwh;
    if (resKwh) resKwh.textContent = costoMateriaPrima.toFixed(3).replace('.', ',');

    if (costoMateriaPrima > (PUN_MEDIO_STIMATO_KWH + SPREAD_MAXIMO_FISIOLOGICO)) {
        let delta = (costoMateriaPrima - PUN_MEDIO_STIMATO_KWH).toFixed(3).replace('.', ',');
        alerts.push({ severity: "CRITICAL", message: `⚠️ <b>Attenzione!</b> Sovrapprezzo di <b>${delta} €/kWh</b> rispetto al mercato all'ingrosso. Ricarico abusivo.` });
        isBadTariff = true;
    } else {
        alerts.push({ severity: "SUCCESS", message: `✅ Costo dell'energia in linea con il mercato.` });
    }

    if (data.quotaFissaMensile) {
      let costoFijoAnual = data.quotaFissaMensile * 12;
      if (resFissi) resFissi.textContent = costoFijoAnual.toFixed(2).replace('.', ',');

      if (costoFijoAnual > QUOTA_FISSA_MAXIMA_ANUAL) {
          alerts.push({ severity: "WARNING", message: `🟠 <b>Costi fissi elevati:</b> paghi <b>${costoFijoAnual.toFixed(2).replace('.', ',')} €/anno</b> di mantenimento. Limite consigliato: < 120 €.` });
          isBadTariff = true;
      } else {
          alerts.push({ severity: "SUCCESS", message: `✅ Quota fissa commerciale eccellente.` });
      }
    } else {
      if (resFissi) resFissi.textContent = "N/D";
    }

    alerts.forEach(alert => {
        const el = document.createElement('div');
        el.className = `p-4 text-sm font-medium rounded-lg border ${ alert.severity === 'CRITICAL' ? 'bg-red-50 text-red-800 border-red-200' : alert.severity === 'WARNING' ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200' }`;
        el.innerHTML = alert.message;
        alertsContainer.appendChild(el);
    });

    if (isBadTariff) {
      resVerdetto.innerHTML = "Stai pagando troppo. <strong>Confronta le offerte sul Portale ARERA</strong> per cambiare gestore.";
      resVerdetto.parentElement.className = "bg-rose-50 border border-rose-200 rounded-xl p-5 mt-4";
      resVerdetto.parentElement.querySelector('h3').classList.replace('text-indigo-900', 'text-rose-900');
      resVerdetto.className = "text-sm text-rose-800 leading-relaxed font-medium";
    } else {
      resVerdetto.innerHTML = "Ottimo, le condizioni del tuo contratto luce sono vantaggiose.";
      resVerdetto.parentElement.className = "bg-emerald-50 border border-emerald-200 rounded-xl p-5 mt-4";
      resVerdetto.parentElement.querySelector('h3').classList.replace('text-indigo-900', 'text-emerald-900');
      resVerdetto.className = "text-sm text-emerald-800 leading-relaxed font-medium";
    }
  }
})();