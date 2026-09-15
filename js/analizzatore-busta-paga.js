// js/analizzatore-busta-paga.js — Analisi Busta Paga OCR e PDF Client-Side
(function () {
  'use strict';

  const dropArea = document.getElementById('drop-area');
  const fileInput = document.getElementById('file-input');
  const loadingState = document.getElementById('loading-state');
  const progressText = loadingState ? loadingState.querySelector('p') : null;
  const resultsDashboard = document.getElementById('results-dashboard');
  const alertsContainer = document.getElementById('alerts-container');
  const btnReset = document.getElementById('btn-reset');

  const resLordo = document.getElementById('res-lordo');
  const resNetto = document.getElementById('res-netto');
  const resFerie = document.getElementById('res-ferie');
  const resTfr = document.getElementById('res-tfr');

  // Parametri di default (Verranno sovrascritti dal JSON)
  let ALIQUOTA_INPS = 0.0919;
  let SOGLIA_CUNEO = 40000;

  async function loadFiscalParameters() {
    try {
      const response = await fetch('/data/regole-fiscali-2026.json');
      if (!response.ok) throw new Error('File JSON non trovato.');
      const data = await response.json();
      if (data.busta_paga_2026) {
        ALIQUOTA_INPS = data.busta_paga_2026.aliquota_inps_base || 0.0919;
        console.log(`[StrumentiUtili] Regole Busta Paga caricate correttamente.`);
      }
    } catch (error) {
      console.warn('Uso i parametri fiscali di default.', error);
    }
  }

  document.addEventListener('DOMContentLoaded', loadFiscalParameters);

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

  async function startAnalysis(file) {
    dropArea.classList.add('hidden');
    loadingState.classList.remove('hidden');
    alertsContainer.innerHTML = '';
    updateProgress('Avvio analisi documento...');

    try {
      let rawText = '';

      if (file.type === 'application/pdf') {
        rawText = await extractNativePdfText(file);
        if (rawText.length < 100) {
          updateProgress('PDF scansionato rilevato. Avvio motore OCR...');
          const imageBlobUrl = await renderPdfToImageBlob(file);
          rawText = await runOcrWorker(imageBlobUrl);
          URL.revokeObjectURL(imageBlobUrl); 
        }
      } else {
        const imageBlobUrl = URL.createObjectURL(file);
        rawText = await runOcrWorker(imageBlobUrl);
        URL.revokeObjectURL(imageBlobUrl);
      }

      updateProgress('Decodifica delle voci contabili...');
      const extractedData = parseBustaPaga(rawText);
      runEvaluationLogic(extractedData);

    } catch (error) {
      console.error(error);
      alert("Errore durante l'elaborazione: " + error.message);
      if (btnReset) btnReset.click();
    } finally {
      loadingState.classList.add('hidden');
    }
  }

  async function extractNativePdfText(file) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js non disponibile.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let fullText = '';
    // La busta paga è solitamente a pagina 1
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    fullText = textContent.items.map(item => item.str).join(' ');
    return fullText.trim();
  }

  async function renderPdfToImageBlob(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return new Promise(resolve => canvas.toBlob(blob => resolve(URL.createObjectURL(blob)), 'image/jpeg', 0.9));
  }

  function runOcrWorker(imageBlobUrl) {
    return new Promise((resolve, reject) => {
      // Riutilizziamo l'ocr-worker.js che avevamo creato per la bolletta
      const worker = new Worker('/js/workers/ocr-worker.js'); 
      worker.onmessage = function(e) {
        const data = e.data;
        if (data.type === 'progress') {
          updateProgress(`Lettura ottica: ${data.pct}%`);
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

 // --- PARSER BUSTA PAGA (Fuzzy Matching + Sanity Check) ---
  function parseBustaPaga(text) {
    let result = { lordo: null, netto: null, ferie: null, tfr: null };
    if (!text) return result;

    let normalizedText = text.toLowerCase().replace(/\s+/g, ' ');

    // Espresiones regulares "Fuzzy": 
    // Busca la palabra clave, ignora hasta 25 caracteres que NO sean números (ruido OCR), 
    // y captura la primera cifra con decimales.
    
    const nettoMatch = normalizedText.match(/netto[^0-9]{0,25}([0-9]{1,5}[.,][0-9]{2})/);
    if (nettoMatch) result.netto = parseFloat(nettoMatch[1].replace(',', '.'));

    const lordoMatch = normalizedText.match(/lordo[^0-9]{0,25}([0-9]{1,5}[.,][0-9]{2})/);
    if (lordoMatch) result.lordo = parseFloat(lordoMatch[1].replace(',', '.'));

    const ferieMatch = normalizedText.match(/ferie[^0-9]{0,25}([0-9]{1,3}[.,]?[0-9]{0,2})/);
    if (ferieMatch) result.ferie = parseFloat(ferieMatch[1].replace(',', '.'));

    const tfrMatch = normalizedText.match(/tfr[^0-9]{0,25}([0-9]{1,5}[.,][0-9]{2})/);
    if (tfrMatch) result.tfr = parseFloat(tfrMatch[1].replace(',', '.'));

    // Sanity Checks OCR (Corrección de alucinaciones extremas)
    if (result.netto && result.netto > 10000) result.netto = null; 
    if (result.lordo && result.lordo > 15000) result.lordo = null;
    
    return result;
  }

  // --- RENDERING RISULTATI ---
  function runEvaluationLogic(data) {
    resultsDashboard.classList.remove('hidden');
    alertsContainer.innerHTML = '';
    
    if (!data.netto && !data.lordo) {
      if (resNetto) resNetto.textContent = "--";
      alertsContainer.innerHTML = `
        <div class="p-4 text-sm font-medium rounded-lg border bg-orange-50 text-orange-800 border-orange-200">
          ⚠️ <b>Lettura fallita.</b> L'algoritmo non è riuscito a rilevare le voci contabili. Assicurati che il PDF non abbia password o che la foto sia nitida.
        </div>`;
      return; 
    }

    if (resNetto) resNetto.textContent = data.netto ? `€ ${data.netto.toFixed(2).replace('.', ',')}` : "N/D";
    if (resLordo) resLordo.textContent = data.lordo ? `€ ${data.lordo.toFixed(2).replace('.', ',')}` : "N/D";
    if (resFerie) resFerie.textContent = data.ferie ? `${data.ferie} Ore` : "N/D";
    if (resTfr) resTfr.textContent = data.tfr ? `€ ${data.tfr.toFixed(2).replace('.', ',')}` : "N/D";

    // Analisi Cuneo Fiscale (Semplificata)
    if (data.lordo) {
      const ralStimata = data.lordo * 13; // Stima grossolana a 13 mensilità
      if (ralStimata < SOGLIA_CUNEO) {
        alertsContainer.innerHTML += `
          <div class="p-4 text-sm font-medium rounded-lg border bg-emerald-50 text-emerald-800 border-emerald-200">
            ✅ <b>Sgravio Cuneo Fiscale Rilevato:</b> In base al tuo reddito lordo stimato (< 40.000 €), hai diritto all'applicazione del taglio del cuneo fiscale (Legge di Bilancio 2026). Controlla che nella sezione ritenute sia presente il beneficio!
          </div>`;
      } else {
        alertsContainer.innerHTML += `
          <div class="p-4 text-sm font-medium rounded-lg border bg-blue-50 text-blue-800 border-blue-200">
            ℹ️ <b>Scaglione IRPEF Massimo:</b> Il tuo reddito supera la soglia del Cuneo Fiscale. La tua imposta marginale sarà calcolata sugli scaglioni massimi (33% e 43%).
          </div>`;
      }
    }
  }

})();