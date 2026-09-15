(function () {
  'use strict';

  // ==============================================================
  // DOM
  // ==============================================================
  var dropArea = null;
  var fileInput = null;
  var loadingState = null;
  var progressText = null;
  var resultsDashboard = null;
  var alertsContainer = null;
  var btnReset = null;
  var resLordo = null;
  var resNetto = null;
  var resFerie = null;
  var resTfr = null;
  var ALIQUOTA_INPS = 0.0919;
  var SOGLIA_CUNEO = 40000;

  // ==============================================================
  // INIT
  // ==============================================================
  document.addEventListener('DOMContentLoaded', function () {
    initAnalyzer();
  });

  async function initAnalyzer() {
    cacheDom();
    if (!dropArea || !fileInput) {
      console.warn('[Busta Paga] Elementi DOM non trovati.');
      return;
    }
    bindEvents();
    await loadFiscalParameters();
    console.log('[Busta Paga] Analizzatore inizializzato correttamente.');
  }

  function cacheDom() {
    dropArea = document.getElementById('drop-area');
    fileInput = document.getElementById('file-input');
    loadingState = document.getElementById('loading-state');
    progressText = loadingState ? loadingState.querySelector('p') : null;
    resultsDashboard = document.getElementById('results-dashboard');
    alertsContainer = document.getElementById('alerts-container');
    btnReset = document.getElementById('btn-reset');
    resLordo = document.getElementById('res-lordo');
    resNetto = document.getElementById('res-netto');
    resFerie = document.getElementById('res-ferie');
    resTfr = document.getElementById('res-tfr');
  }

  // ==============================================================
  // FISCAL PARAMETERS
  // ==============================================================
  async function loadFiscalParameters() {
    try {
      var response = await fetch('/data/regole-fiscali-2026.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('File JSON non trovato.');
      var data = await response.json();
      if (data && data.busta_paga_2026) {
        var jsonRate = Number(data.busta_paga_2026.aliquota_inps_base);
        if (Number.isFinite(jsonRate) && jsonRate > 0 && jsonRate < 1) {
          ALIQUOTA_INPS = jsonRate;
        }
      }
    } catch (error) {
      console.warn('[Busta Paga] Uso parametri fiscali di default.', error);
    }
  }

  // ==============================================================
  // EVENTS
  // ==============================================================
  function bindEvents() {
    dropArea.addEventListener('click', function (event) {
      if (event.target && event.target.tagName !== 'INPUT' && event.target.tagName !== 'LABEL') {
        fileInput.click();
      }
    });

    dropArea.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
      }
    });

    dropArea.addEventListener('dragover', function (event) {
      event.preventDefault();
      dropArea.classList.add('bg-indigo-100');
    });

    dropArea.addEventListener('dragleave', function () {
      dropArea.classList.remove('bg-indigo-100');
    });

    dropArea.addEventListener('drop', function (event) {
      event.preventDefault();
      dropArea.classList.remove('bg-indigo-100');
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        startAnalysis(event.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', function () {
      if (this.files && this.files.length) {
        startAnalysis(this.files[0]);
      }
    });

    if (btnReset) btnReset.addEventListener('click', resetAnalyzer);
  }

  function resetAnalyzer() {
    if (resultsDashboard) resultsDashboard.classList.add('hidden');
    if (dropArea) dropArea.classList.remove('hidden');
    if (loadingState) loadingState.classList.add('hidden');
    if (alertsContainer) alertsContainer.innerHTML = '';
    if (fileInput) fileInput.value = '';
  }

  function updateProgress(message) {
    if (progressText) progressText.textContent = message;
  }

  // ==============================================================
  // START ANALYSIS
  // ==============================================================
  async function startAnalysis(file) {
    if (!file || !dropArea || !loadingState) return;

    dropArea.classList.add('hidden');
    loadingState.classList.remove('hidden');
    if (alertsContainer) alertsContainer.innerHTML = '';
    updateProgress('Avvio analisi documento...');

    try {
      var ocrResult = {
        text: '',
        words: [],
        numericText: '',
        confidence: 0,
        fields: { lordo: null, netto: null, ferie: null, tfr: null }
      };

      if (file.type === 'application/pdf') {
        updateProgress('Lettura del PDF...');
        var rawPdfText = await extractNativePdfText(file);
        
        if (!rawPdfText || rawPdfText.length < 100) {
          updateProgress('PDF scansionato rilevato. Avvio OCR...');
          var imageBlobUrl = await renderPdfToImageBlob(file);
          try {
            ocrResult = await runOcrWorker(imageBlobUrl);
          } finally {
            URL.revokeObjectURL(imageBlobUrl);
          }
        } else {
          ocrResult.text = rawPdfText;
        }
      } else {
        updateProgress('Preparazione immagine...');
        var imageUrl = URL.createObjectURL(file);
        try {
          ocrResult = await runOcrWorker(imageUrl);
        } finally {
          URL.revokeObjectURL(imageUrl);
        }
      }

      updateProgress('Decodifica spaziale delle voci contabili...');
      var extractedData = parseBustaPaga(ocrResult);
      
      runEvaluationLogic(extractedData);

    } catch (error) {
      console.error('[Busta Paga] Errore durante analisi:', error);
      alert("Errore durante l'elaborazione: " + (error && error.message ? error.message : 'Errore sconosciuto.'));
      resetAnalyzer();
    } finally {
      loadingState.classList.add('hidden');
    }
  }

  // ==============================================================
  // OCR WORKER
  // ==============================================================
  function runOcrWorker(imageBlobUrl) {
    return new Promise(function (resolve, reject) {
      var worker;
      try {
        worker = new Worker('/js/workers/ocr-worker.js');
      } catch (error) {
        reject(new Error('Impossibile avviare il motore OCR.'));
        return;
      }

      var finished = false;
      function cleanup() {
        try { worker.terminate(); } catch (error) {}
      }

      worker.onmessage = function (event) {
        var data = event.data || {};
        if (data.type === 'progress') {
          updateProgress('Lettura ottica: ' + (Number(data.pct) || 0) + '%');
          return;
        }
        if (data.type === 'status') {
          updateProgress(String(data.msg || ''));
          return;
        }
        if (data.type === 'success') {
          if (finished) return;
          finished = true;
          cleanup();
          resolve({
            text: typeof data.text === 'string' ? data.text : '',
            words: Array.isArray(data.words) ? data.words : [],
            numericText: typeof data.numericText === 'string' ? data.numericText : '',
            confidence: Number(data.confidence) || 0,
            fields: data.fields && typeof data.fields === 'object'
              ? {
                  lordo: Number.isFinite(Number(data.fields.lordo)) ? Number(data.fields.lordo) : null,
                  netto: Number.isFinite(Number(data.fields.netto)) ? Number(data.fields.netto) : null,
                  ferie: Number.isFinite(Number(data.fields.ferie)) ? Number(data.fields.ferie) : null,
                  tfr: Number.isFinite(Number(data.fields.tfr)) ? Number(data.fields.tfr) : null
                }
              : { lordo: null, netto: null, ferie: null, tfr: null }
          });
          return;
        }
        if (data.type === 'error') {
          if (finished) return;
          finished = true;
          cleanup();
          reject(new Error(data.msg || 'Errore OCR.'));
        }
      };

      worker.onerror = function () {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Errore nel worker OCR.'));
      };

      worker.postMessage({
        imageBlobUrl: imageBlobUrl,
        lang: 'ita'
      });
    });
  }

  // ==============================================================
  // PARSER PRINCIPALE (Logica a 3 Livelli)
  // ==============================================================
  function parseBustaPaga(ocrResult) {
    var result = {
        lordo: null,
        netto: null,
        ferie: null,
        tfr: null
    };

    if (!ocrResult) {
        return result;
    }

    /*
     * 1. PRIORITÀ ASSOLUTA: OCR NUMERICO MIRATO
     */
    if (ocrResult.fields && typeof ocrResult.fields === 'object') {
        var fields = ocrResult.fields;
        if (Number.isFinite(Number(fields.lordo)) && Number(fields.lordo) > 0) result.lordo = Number(fields.lordo);
        if (Number.isFinite(Number(fields.netto)) && Number(fields.netto) > 0) result.netto = Number(fields.netto);
        if (Number.isFinite(Number(fields.ferie)) && Number(fields.ferie) >= 0) result.ferie = Number(fields.ferie);
        if (Number.isFinite(Number(fields.tfr)) && Number(fields.tfr) > 0) result.tfr = Number(fields.tfr);
    }

    /*
     * 2. FALLBACK: SPATIAL OCR GENERALE (Bounding Boxes)
     */
    var words = Array.isArray(ocrResult.words) ? ocrResult.words : [];
    if (words.length > 0) {
        if (result.lordo === null) result.lordo = findValueSpatially(words, ['lordo', 'retribuzione', 'lardo']);
        if (result.netto === null) result.netto = findValueSpatially(words, ['netto', 'pagare']);
        if (result.ferie === null) result.ferie = findValueSpatially(words, ['ferie', 'rol']);
        if (result.tfr === null) result.tfr = findValueSpatially(words, ['tfr', 'fondo']);
    }

    /*
     * 3. FALLBACK TESTUALE
     */
    var text = ocrResult.text || '';
    var numericText = ocrResult.numericText || '';
    var combinedText = normalizeOcrText(text + '\n' + numericText);

    if (result.lordo === null) {
        result.lordo = findAmountNearLabels(combinedText, ['lordo', 'retribuzione']);
    }

    if (result.netto === null) {
        result.netto = findAmountNearLabels(combinedText, ['netto', 'pagare']);
    }

    if (result.tfr === null) {
        result.tfr = findAmountNearLabels(combinedText, ['tfr', 'fondo']);
    }

    /*
     * 4. FERIE (Fallback Regex)
     */
    if (result.ferie === null) {
        var ferieMatch = combinedText.match(/(?:ferie|rol)[^0-9]{0,40}(\d+(?:[.,]\d+)?)/i);
        if (ferieMatch) {
            result.ferie = parseItalianMoney(ferieMatch[1]);
        }
    }

    /*
     * 5. INFERENZA (Escluso il Netto per sicurezza)
     */
    var amounts = extractAllMoneyValues(combinedText);
    
    if (result.lordo === null) {
        result.lordo = inferGrossFromAmounts(amounts, result);
    }
    if (result.tfr === null) {
        result.tfr = inferTfrFromAmounts(amounts, result);
    }

    /*
     * 6. NORMALIZZAZIONE E SANITY CHECK
     */
    if (result.lordo !== null) result.lordo = Number(result.lordo);
    if (result.netto !== null) result.netto = Number(result.netto);
    if (result.ferie !== null) result.ferie = Number(result.ferie);
    if (result.tfr !== null) result.tfr = Number(result.tfr);

    if (result.lordo !== null && result.netto !== null) {
        var ratio = result.netto / result.lordo;
        if (result.netto <= 0 || result.lordo <= 0 || ratio >= 1 || ratio < 0.25) {
            console.warn('[Busta Paga] Netto scartato per valore non plausibile:', result.netto, 'lordo:', result.lordo, 'ratio:', ratio);
            result.netto = null;
        }
    }

    if (result.tfr !== null && result.netto !== null) {
        if (Math.abs(result.tfr - result.netto) < 0.01) {
            result.tfr = null;
        }
    }

    if (result.lordo !== null && (!Number.isFinite(result.lordo) || result.lordo <= 0 || result.lordo > 1000000)) result.lordo = null;
    if (result.netto !== null && (!Number.isFinite(result.netto) || result.netto <= 0 || result.netto > 1000000)) result.netto = null;
    if (result.ferie !== null && (!Number.isFinite(result.ferie) || result.ferie < 0)) result.ferie = null;
    if (result.tfr !== null && (!Number.isFinite(result.tfr) || result.tfr < 0 || result.tfr > 10000000)) result.tfr = null;

    console.log('[Busta Paga] DATI ESTRATTI:', result);
    return result;
  }

  // ==============================================================
  // HELPER: RICERCA SPAZIALE GEOMETRICA (ROI)
  // ==============================================================
  function findValueSpatially(words, labels) {
    if (!words || !words.length) return null;

    for (var j = 0; j < labels.length; j++) {
      var label = labels[j].toLowerCase();
      var targetIdx = words.findIndex(function(w) {
        return w.text.toLowerCase().indexOf(label) !== -1;
      });

      if (targetIdx !== -1) {
        var targetWord = words[targetIdx];
        var toleranceY = 25; // Tolleranza verticale in pixel

        var candidates = words.filter(function(w) {
          return w.x0 > targetWord.x1 && Math.abs(w.y0 - targetWord.y0) <= toleranceY;
        });

        candidates.sort(function(a, b) { return a.x0 - b.x0; });

        for (var i = 0; i < candidates.length; i++) {
          var val = parseItalianMoney(candidates[i].text);
          if (val !== null) return val;
        }
      }
    }
    return null;
  }

  // ==============================================================
  // TEXT HELPERS
  // ==============================================================
  function normalizeOcrText(text) {
    var value = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    value = value.replace(/[|]/g, 'I').replace(/[€]/g, '€').replace(/\u00a0/g, ' ');
    value = value.replace(/(\d)\s*\.\s*(\d{3})(?=\s*[,.]\s*\d{2}\b)/g, '$1.$2');
    value = value.replace(/(\d)\s+(?=\d{3}(?:[,.]\d{2})?\b)/g, '$1');
    return value.replace(/[ \t]+/g, ' ').trim();
  }

  function canonicalText(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function extractAllMoneyValues(text) {
    var candidates = [];
    var regex = /(?:€\s*)?((?:\d{1,3}(?:[.\s]\d{3})+|\d{1,7})(?:[,.]\d{2}))/g;
    var match;
    while ((match = regex.exec(String(text || ''))) !== null) {
      var value = parseItalianMoney(match[1]);
      if (value !== null) candidates.push(value);
    }
    return candidates;
  }

  function parseItalianMoney(token) {
    if (!token) return null;
    var value = String(token).trim().replace(/\s/g, '');
    if (value.indexOf(',') !== -1 && value.indexOf('.') !== -1) {
      if (value.lastIndexOf(',') > value.lastIndexOf('.')) {
        value = value.replace(/\./g, '').replace(',', '.');
      } else {
        value = value.replace(/,/g, '');
      }
    } else if (value.indexOf(',') !== -1) {
      value = value.replace(',', '.');
    } else if ((value.match(/\./g) || []).length > 1) {
      var lastDot = value.lastIndexOf('.');
      value = value.slice(0, lastDot).replace(/\./g, '') + '.' + value.slice(lastDot + 1);
    }
    var number = Number(value);
    return Number.isFinite(number) ? roundMoney(number) : null;
  }

  function findAmountNearLabels(text, labels) {
    for (var i = 0; i < labels.length; i++) {
      var label = canonicalText(labels[i]);
      var index = canonicalText(text).indexOf(label);
      if (index === -1) continue;
      var fragment = String(text).slice(index, index + 120);
      var candidates = extractAllMoneyValues(fragment);
      if (candidates.length) return candidates[0];
    }
    return null;
  }

  // ==============================================================
  // INFERENCE
  // ==============================================================
  function inferGrossFromAmounts(amounts, current) {
    if (!amounts || !amounts.length) return null;
    var candidates = amounts.filter(function (amount) {
      if (amount <= 500 || amount > 50000) return false;
      if (current.tfr !== null && nearlyEqual(amount, current.tfr)) return false;
      if (current.netto !== null && amount <= current.netto) return false;
      return true;
    });
    if (!candidates.length) return null;
    candidates.sort(function (a, b) { return a - b; });
    return candidates[0];
  }

  function inferTfrFromAmounts(amounts, current) {
    if (!amounts || !amounts.length) return null;
    var candidates = amounts.filter(function (amount) {
      if (amount < 1000 || amount > 10000000) return false;
      if (current.netto !== null && nearlyEqual(amount, current.netto)) return false;
      if (current.lordo !== null && nearlyEqual(amount, current.lordo)) return false;
      return true;
    });
    if (!candidates.length) return null;
    candidates.sort(function (a, b) { return b - a; });
    return candidates[0];
  }

  // ==============================================================
  // MATH & RENDERING
  // ==============================================================
  function normalizeDetectedMoney(value) {
    return value !== null && Number.isFinite(Number(value)) ? roundMoney(value) : null;
  }
  function normalizeDetectedNumber(value) {
    return value !== null && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : null;
  }
  function roundMoney(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
  }
  function nearlyEqual(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.01;
  }
  function formatEuro(value) {
    return '€ ' + Number(value).toFixed(2).replace('.', ',');
  }
  function formatHours(value) {
    return Number(value).toFixed(2).replace(/0+$/, '').replace(/,$/, '').replace('.', ',') + ' Ore';
  }

  function runEvaluationLogic(data) {
    if (!resultsDashboard) return;
    resultsDashboard.classList.remove('hidden');
    if (alertsContainer) alertsContainer.innerHTML = '';

    if (!data || (data.netto === null && data.lordo === null && data.ferie === null && data.tfr === null)) {
      if (resNetto) resNetto.textContent = '--';
      if (resLordo) resLordo.textContent = 'N/D';
      if (resFerie) resFerie.textContent = 'N/D';
      if (resTfr) resTfr.textContent = 'N/D';
      if (alertsContainer) {
        alertsContainer.innerHTML = createAlert(
          'orange', '⚠️', 'Lettura fallita.',
          'L algoritmo non è riuscito a rilevare le voci. Assicurati che la foto sia nitida e che le etichette siano leggibili.'
        );
      }
      return;
    }

    if (resLordo) resLordo.textContent = data.lordo !== null ? formatEuro(data.lordo) : 'N/D';
    if (resNetto) resNetto.textContent = data.netto !== null ? formatEuro(data.netto) : 'N/D';
    if (resFerie) resFerie.textContent = data.ferie !== null ? formatHours(data.ferie) : 'N/D';
    if (resTfr) resTfr.textContent = data.tfr !== null ? formatEuro(data.tfr) : 'N/D';

    if (data.lordo !== null) {
      var ralStimata = data.lordo * 13;
      if (ralStimata < SOGLIA_CUNEO) {
        if (alertsContainer) {
          alertsContainer.innerHTML += createAlert(
            'green', '✅', 'Sgravio Cuneo Fiscale Rilevato:',
            'In base al reddito lordo mensile rilevato, potresti rientrare nel taglio del cuneo fiscale.'
          );
        }
      }
    }

    var detectedCount = (data.lordo ? 1 : 0) + (data.netto ? 1 : 0) + (data.ferie ? 1 : 0) + (data.tfr ? 1 : 0);
    if (detectedCount < 4 && alertsContainer) {
      alertsContainer.innerHTML += createAlert(
        'orange', '⚠️', 'Lettura parziale:',
        'Alcuni dati potrebbero non essere stati riconosciuti per la qualità del documento. Controlla i valori evidenziati prima di utilizzarli.'
      );
    }
  }

  function createAlert(type, icon, title, text) {
    var classes = {
      green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      orange: 'bg-orange-50 text-orange-800 border-orange-200',
      blue: 'bg-blue-50 text-blue-800 border-blue-200'
    };
    return '<div class="p-4 text-sm font-medium rounded-lg border ' + (classes[type] || classes.orange) + '">' + icon + ' <b>' + title + '</b> ' + text + '</div>';
  }

  // ==============================================================
  // PDF.JS INTEGRATION
  // ==============================================================
  async function extractNativePdfText(file) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js non disponibile.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    var buffer = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    var page = await pdf.getPage(1);
    var textContent = await page.getTextContent();
    return textContent.items.map(function (item) { return item.str || ''; }).join(' ').trim();
  }

  async function renderPdfToImageBlob(file) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js non disponibile.');
    var buffer = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    var page = await pdf.getPage(1);
    var viewport = page.getViewport({ scale: 2.5 });
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    var context = canvas.getContext('2d', { willReadFrequently: false });
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('Impossibile creare immagine PDF.'));
        resolve(URL.createObjectURL(blob));
      }, 'image/jpeg', 0.94);
    });
  }

})();