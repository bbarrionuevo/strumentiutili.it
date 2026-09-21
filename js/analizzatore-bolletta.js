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

  // Stato corrente: consente il ricalcolo dopo una correzione manuale dell'utente
  let currentData = null;

  // 2. Caricamento dinamico dei parametri dal JSON locale
  async function loadMarketParameters() {
    try {
      const data = await window.StrumentiData.getRegoleFiscali();
      if (!data) throw new Error('Regole fiscali non disponibili.');
      
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
    makeResultsEditable();
  });

  // --- CORREZIONE MANUALE E REATTIVITÀ ---
  function parseEditedNumber(rawText) {
    if (!rawText) return null;
    let cleaned = String(rawText).replace(/[^0-9.,-]/g, '').trim();
    if (!cleaned) return null;

    if (cleaned.includes(',') && cleaned.includes('.')) {
      cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    }

    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function makeResultsEditable() {
    // res-fissi mostra il totale ANNUO, mentre il modello dati conserva il costo mensile
    const campi = [
      { el: resKwh, apply: (v) => { currentData.costoKwh = v; } },
      { el: resFissi, apply: (v) => { currentData.quotaFissaMensile = v === null ? null : v / 12; } }
    ];

    campi.forEach(campo => {
      if (!campo.el) return;
      campo.el.setAttribute('contenteditable', 'true');
      campo.el.style.cursor = 'text';

      campo.el.addEventListener('blur', () => {
        if (!currentData) return;
        campo.apply(parseEditedNumber(campo.el.textContent));
        runEvaluationLogic(currentData);
      });

      campo.el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          campo.el.blur();
        }
      });
    });
  }

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
      currentData = null;
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
          const ocrResult = await runOcrWorker(imageBlobUrl);
          rawText = ocrResult.text;
          URL.revokeObjectURL(imageBlobUrl);
        }
      } else {
        // TENTATIVO 2: Immagine diretta -> Worker OCR
        const imageBlobUrl = URL.createObjectURL(file);
        const ocrResult = await runOcrWorker(imageBlobUrl);
        rawText = ocrResult.text;
        URL.revokeObjectURL(imageBlobUrl);
      }

      updateProgress('Analisi tariffe e algoritmi ARERA in corso...');
      currentData = parseBollettaText(rawText);
      runEvaluationLogic(currentData);

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
  const OCR_SCADENZA_MS = 180000;

  function runOcrWorker(imageBlobUrl) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('/js/workers/ocr-worker.js');
      const scadenza = setTimeout(() => {
        try { worker.terminate(); } catch (e) { /* già terminato */ }
        reject(new Error('La lettura del documento sta impiegando troppo tempo: riprova con un\'immagine più piccola o inserisci i dati a mano.'));
      }, OCR_SCADENZA_MS);
      const chiudi = () => clearTimeout(scadenza);
      worker.onmessage = function(e) {
        const data = e.data;
        if (data.type === 'progress') {
          updateProgress(`Riconoscimento ottico: ${data.pct}%`);
        } else if (data.type === 'status') {
          updateProgress(data.msg);
        } else if (data.type === 'success') {
          chiudi();
          worker.terminate();
          resolve({ text: data.text || '', words: data.words || [], numericText: data.numericText || '' });
        } else if (data.type === 'error') {
          chiudi();
          worker.terminate();
          reject(new Error(data.msg));
        }
      };
      worker.onerror = function (err) {
        chiudi();
        worker.terminate();
        reject(new Error((err && err.message) || 'Il motore OCR si è interrotto in modo imprevisto.'));
      };
      worker.postMessage({ imageBlobUrl: imageBlobUrl, lang: 'ita' });
    });
  }

  // --- PARSER SINTATTICO CON SANITIZZAZIONE E OCR SANITY CHECK ---
  function parseBollettaText(text) {
    let result = { costoKwh: null, quotaFissaMensile: null, fasce: {}, multiorario: false };
    if (!text) return result;

    let normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
    // Correzione Typo OCR: Se legge "o,185" o "O,185", lo forza a "0,185"
    normalizedText = normalizedText.replace(/(^|\s)[oO]([.,][0-9]+)/g, '$10$2');

    const kwhMatch = normalizedText.match(/([0-9]{1,2}[.,][0-9]{2,5})\s*(?:€|euro|eur)\s*\/?\s*kwh/);
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

    const fissaMatch = normalizedText.match(/([0-9]{1,3}[.,][0-9]{2})\s*(?:€|euro|eur)\s*\/?\s*mese/);
    if (fissaMatch) {
        result.quotaFissaMensile = parseFloat(fissaMatch[1].replace(',', '.'));
    }

    // FASCE ORARIE (contratto multiorario): F1 punte, F2 intermedie, F3 fuori punta
    ['f1', 'f2', 'f3'].forEach(fascia => {
      const match = normalizedText.match(new RegExp(fascia + '[^0-9]{0,25}([0-9]{1,2}[.,][0-9]{2,5})'));
      if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        // Scarta letture fuori scala invece di correggerle a tentativi
        if (val > 0 && val <= 2.0) result.fasce[fascia] = val;
      }
    });
    result.multiorario = Object.keys(result.fasce).length >= 2;

    return result;
  }

  // Applica lo stato visivo del verdetto in modo idempotente: con classList.replace()
  // un secondo rendering (dopo una correzione manuale) resterebbe bloccato sul colore precedente.
  function setVerdettoStyle(contenitoreClass, titoloClass, testoClass) {
    resVerdetto.parentElement.className = contenitoreClass;
    const titolo = resVerdetto.parentElement.querySelector('h3');
    if (titolo) {
      titolo.classList.remove('text-indigo-900', 'text-gray-900', 'text-rose-900', 'text-emerald-900');
      titolo.classList.add(titoloClass);
    }
    resVerdetto.className = testoClass;
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
      
      resVerdetto.innerHTML = "Analisi interrotta. I dati estratti non sono sufficienti per emettere una valutazione tariffaria sicura. <b>Puoi inserire manualmente il prezzo €/kWh cliccando sul valore qui sopra.</b>";
      setVerdettoStyle(
        "bg-gray-50 border border-gray-200 rounded-xl p-5 mt-4",
        "text-gray-900",
        "text-sm text-gray-800 leading-relaxed font-medium"
      );

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

    // DIAGNOSTICA FASCE ORARIE (contratto multiorario)
    if (data.multiorario && data.fasce.f1 && data.fasce.f3) {
      const deltaFasce = ((data.fasce.f1 - data.fasce.f3) / data.fasce.f3) * 100;
      if (deltaFasce > 10) {
        alerts.push({
          severity: "INFO",
          message: `📅 <b>Tariffa multioraria:</b> la fascia F1 (${data.fasce.f1.toFixed(3).replace('.', ',')} €/kWh) costa il <b>${deltaFasce.toFixed(0)}% in più</b> della F3 (${data.fasce.f3.toFixed(3).replace('.', ',')} €/kWh). Sposta lavatrice, lavastoviglie e forno alle <b>sere dopo le 19, ai weekend e ai festivi</b> per pagare meno.`
        });
      }
    }

    const stiliAlert = {
      CRITICAL: 'bg-red-50 text-red-800 border-red-200',
      WARNING: 'bg-orange-50 text-orange-800 border-orange-200',
      INFO: 'bg-blue-50 text-blue-800 border-blue-200'
    };

    alerts.forEach(alert => {
        const el = document.createElement('div');
        el.className = `p-4 text-sm font-medium rounded-lg border ${stiliAlert[alert.severity] || 'bg-emerald-50 text-emerald-800 border-emerald-200'}`;
        el.innerHTML = alert.message;
        alertsContainer.appendChild(el);
    });

    if (isBadTariff) {
      resVerdetto.innerHTML = "Stai pagando troppo. <strong>Confronta le offerte sul Portale ARERA</strong> per cambiare gestore.";
      setVerdettoStyle(
        "bg-rose-50 border border-rose-200 rounded-xl p-5 mt-4",
        "text-rose-900",
        "text-sm text-rose-800 leading-relaxed font-medium"
      );
    } else {
      resVerdetto.innerHTML = "Ottimo, le condizioni del tuo contratto luce sono vantaggiose.";
      setVerdettoStyle(
        "bg-emerald-50 border border-emerald-200 rounded-xl p-5 mt-4",
        "text-emerald-900",
        "text-sm text-emerald-800 leading-relaxed font-medium"
      );
    }
  }
})();