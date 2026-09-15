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
    if (!response.ok) {
      throw new Error('File JSON non trovato.');
    }
    var data = await response.json();
    if (data && data.busta_paga_2026) {
      var jsonRate = Number(data.busta_paga_2026.aliquota_inps_base);
      if (Number.isFinite(jsonRate) && jsonRate > 0 && jsonRate < 1) {
        ALIQUOTA_INPS = jsonRate;
      }
    }
    console.log('[StrumentiUtili] Regole Busta Paga caricate.');
  } catch (error) {
    console.warn('[Busta Paga] Uso parametri fiscali di default.', error);
  }
}

// ==============================================================
// EVENTS
// ==============================================================
function bindEvents() {
  dropArea.addEventListener('click', function () {
    fileInput.click();
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

  if (btnReset) {
    btnReset.addEventListener('click', resetAnalyzer);
  }
}

function resetAnalyzer() {
  if (resultsDashboard) {
    resultsDashboard.classList.add('hidden');
  }
  if (dropArea) {
    dropArea.classList.remove('hidden');
  }
  if (loadingState) {
    loadingState.classList.add('hidden');
  }
  if (alertsContainer) {
    alertsContainer.innerHTML = '';
  }
  if (fileInput) {
    fileInput.value = '';
  }
}

// ==============================================================
// UI PROGRESS
// ==============================================================
function updateProgress(message) {
  if (progressText) {
    progressText.textContent = message;
  }
}

// ==============================================================
// START ANALYSIS
// ==============================================================
async function startAnalysis(file) {
  if (!file) return;
  if (!dropArea || !loadingState) return;

  dropArea.classList.add('hidden');
  loadingState.classList.remove('hidden');
  if (alertsContainer) alertsContainer.innerHTML = '';
  updateProgress('Avvio analisi documento...');

  try {
    var rawText = '';

    // ----------------------------------------------------------
    // PDF
    // ----------------------------------------------------------
    if (file.type === 'application/pdf') {
      updateProgress('Lettura del PDF...');
      rawText = await extractNativePdfText(file);
      console.log('[Busta Paga] Testo PDF nativo:', rawText);

      if (!rawText || rawText.length < 100) {
        updateProgress('PDF scansionato rilevato. Avvio OCR...');
        var imageBlobUrl = await renderPdfToImageBlob(file);
        try {
          rawText = await runOcrWorker(imageBlobUrl);
        } finally {
          URL.revokeObjectURL(imageBlobUrl);
        }
      }
    } else {
      // --------------------------------------------------------
      // IMAGE
      // --------------------------------------------------------
      updateProgress('Preparazione immagine...');
      var imageUrl = URL.createObjectURL(file);
      try {
        rawText = await runOcrWorker(imageUrl);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    }

    console.log('==================================================');
    console.log('[Busta Paga] TESTO OCR GREZZO:');
    console.log(rawText);
    console.log('==================================================');

    updateProgress('Decodifica delle voci contabili...');
    var extractedData = parseBustaPaga(rawText);
    console.log('[Busta Paga] DATI ESTRATTI:', extractedData);
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
// PDF NATIVE TEXT
// ==============================================================
async function extractNativePdfText(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js non disponibile.');
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

  var buffer = await file.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  var fullText = '';

  var page = await pdf.getPage(1);
  var textContent = await page.getTextContent();
  
  fullText = textContent.items.map(function (item) {
    return item.str || '';
  }).join(' ');

  return fullText.trim();
}

// ==============================================================
// PDF -> IMAGE
// ==============================================================
async function renderPdfToImageBlob(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js non disponibile.');
  }

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
      if (!blob) {
        reject(new Error('Impossibile creare immagine PDF.'));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/jpeg', 0.94);
  });
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
        updateProgress('Lettura ottica: ' + safeInteger(data.pct, 0) + '%');
        return;
      }
      if (data.type === 'status') {
        updateProgress(String(data.msg || ''));
        return;
      }
      if (data.type === 'success') {
        if (finished) return;
        finished = true;
        var text = typeof data.text === 'string' ? data.text : '';
        cleanup();
        resolve(text);
        return;
      }
      if (data.type === 'error') {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error(data.msg || 'Errore OCR.'));
      }
    };

    worker.onerror = function (error) {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('Errore nel worker OCR.'));
    };

    worker.postMessage({ imageBlobUrl: imageBlobUrl, lang: 'ita' });
  });
}

// ==============================================================
// PARSER PRINCIPALE
// ==============================================================
function parseBustaPaga(text) {
  var result = { lordo: null, netto: null, ferie: null, tfr: null };

  if (typeof text !== 'string' || !text.trim()) {
    return result;
  }

  var normalized = normalizeOcrText(text);
  var lines = normalized.split('\n').map(function (line) {
    return line.trim();
  }).filter(function (line) {
    return line.length > 0;
  });

  console.log('[Busta Paga] TESTO NORMALIZZATO:', normalized);

  // 1. CERCA I VALORI DIRETTAMENTE VICINO ALLE ETICHETTE
  result.lordo = findLabeledAmount(lines, ['totale lordo', 'lordo totale', 'retribuzione lorda', 'retribuzione', 'lordo']);
  result.netto = findLabeledAmount(lines, ['netto in busta', 'netto a pagare', 'netto da pagare', 'netto pagato', 'netto mensile', 'netto', 'net']);
  result.ferie = findLabeledNumber(lines, ['ferie residue', 'ferie resid', 'ferie', 'rol residue', 'rol resid', 'rol']);
  result.tfr = findLabeledAmount(lines, ['fondo tfr', 'totale tfr', 'tfr maturato', 'tfr accantonato', 'tfr', 'fondo', 'accantonato']);

  // 2. FALLBACK SUL TESTO INTERO
  if (result.lordo === null) {
    result.lordo = findAmountNearLabels(normalized, ['totale lordo', 'lordo totale', 'retribuzione lorda', 'retribuzione', 'lordo']);
  }
  if (result.netto === null) {
    result.netto = findAmountNearLabels(normalized, ['netto in busta', 'netto a pagare', 'netto da pagare', 'netto', 'net', 'busta', 'pagare']);
  }
  if (result.ferie === null) {
    result.ferie = findNumberNearLabels(normalized, ['ferie residue', 'ferie', 'rol']);
  }
  if (result.tfr === null) {
    result.tfr = findAmountNearLabels(normalized, ['fondo tfr', 'tfr maturato', 'tfr', 'fondo', 'accantonato']);
  }

  // 3. ESTRAE TUTTI GLI IMPORTI PRESENTI
  var amounts = extractAllMoneyValues(normalized);
  console.log('[Busta Paga] Importi trovati:', amounts);

  // 4. FALLBACK INTELLIGENTE
  if (result.lordo === null) result.lordo = inferGrossFromAmounts(amounts, result);
  if (result.netto === null) result.netto = inferNetFromAmounts(amounts, result);
  if (result.ferie === null) result.ferie = inferHoursFromText(normalized);
  if (result.tfr === null) result.tfr = inferTfrFromAmounts(amounts, result);

  // 5. CORREZIONE / SANITY CHECK
  result.lordo = normalizeDetectedMoney(result.lordo);
  result.netto = normalizeDetectedMoney(result.netto);
  result.ferie = normalizeDetectedNumber(result.ferie);
  result.tfr = normalizeDetectedMoney(result.tfr);

  if (result.lordo !== null && result.netto !== null) {
    var ratio = result.netto / result.lordo;
    if (result.netto <= 0 || result.lordo <= 0 || ratio >= 1 || ratio < 0.25) {
      console.warn('[Busta Paga] Netto scartato per sanity check:', result.netto);
      var alternativeNet = inferNetFromAmounts(amounts, { lordo: result.lordo, netto: null, ferie: result.ferie, tfr: result.tfr });
      if (alternativeNet !== null && alternativeNet < result.lordo) {
        result.netto = alternativeNet;
      } else {
        result.netto = null;
      }
    }
  }

  if (result.tfr !== null && result.netto !== null && nearlyEqual(result.tfr, result.netto)) {
    result.tfr = null;
  }

  if (result.lordo !== null && (result.lordo <= 0 || result.lordo > 1000000)) result.lordo = null;
  if (result.netto !== null && (result.netto <= 0 || result.netto > 1000000)) result.netto = null;
  if (result.tfr !== null && (result.tfr <= 0 || result.tfr > 10000000)) result.tfr = null;
  if (result.ferie !== null && (result.ferie < 0 || result.ferie > 1000)) result.ferie = null;

  return result;
}

// ==============================================================
// OCR NORMALIZATION
// ==============================================================
function normalizeOcrText(text) {
  var value = String(text || '');
  value = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  value = value.replace(/[|]/g, 'I').replace(/[€]/g, '€').replace(/\u00a0/g, ' ');
  value = value.replace(/(\d)\s*\.\s*(\d{3})(?=\s*[,.]\s*\d{2}\b)/g, '$1.$2');
  value = value.replace(/(\d)\s+(?=\d{3}(?:[,.]\d{2})?\b)/g, '$1');
  value = value.replace(/[ \t]+/g, ' ');
  value = value.split('\n').map(function (line) { return line.trim(); }).join('\n');
  return value;
}

// ==============================================================
// LABEL SEARCH
// ==============================================================
function findLabeledAmount(lines, labels) {
  var best = null;
  for (var i = 0; i < lines.length; i++) {
    var line = canonicalText(lines[i]);
    for (var j = 0; j < labels.length; j++) {
      var label = canonicalText(labels[j]);
      if (line.indexOf(label) === -1) continue;

      var sameLine = extractMoneyCandidates(lines[i]);
      if (sameLine.length) {
        var value = chooseClosestNumberAfterLabel(lines[i], label, sameLine);
        if (value !== null) return value;
        return sameLine[0];
      }

      for (var next = 1; next <= 2; next++) {
        if (i + next >= lines.length) break;
        var nextCandidates = extractMoneyCandidates(lines[i + next]);
        if (nextCandidates.length) return nextCandidates[0];
      }
    }
  }
  return best;
}

function findLabeledNumber(lines, labels) {
  for (var i = 0; i < lines.length; i++) {
    var line = canonicalText(lines[i]);
    for (var j = 0; j < labels.length; j++) {
      var label = canonicalText(labels[j]);
      if (line.indexOf(label) === -1) continue;

      var candidates = extractGenericNumberCandidates(lines[i]);
      if (candidates.length) return candidates[candidates.length - 1];

      for (var next = 1; next <= 2; next++) {
        if (i + next >= lines.length) break;
        var nextValues = extractGenericNumberCandidates(lines[i + next]);
        if (nextValues.length) return nextValues[0];
      }
    }
  }
  return null;
}

// ==============================================================
// LABEL SEARCH IN FULL TEXT
// ==============================================================
function findAmountNearLabels(text, labels) {
  for (var i = 0; i < labels.length; i++) {
    var label = canonicalText(labels[i]);
    var index = canonicalText(text).indexOf(label);
    if (index === -1) continue;

    var fragment = String(text).slice(index, index + 120);
    var candidates = extractMoneyCandidates(fragment);
    if (candidates.length) return candidates[0];
  }
  return null;
}

function findNumberNearLabels(text, labels) {
  for (var i = 0; i < labels.length; i++) {
    var label = canonicalText(labels[i]);
    var normalized = canonicalText(text);
    var index = normalized.indexOf(label);
    if (index === -1) continue;

    var fragment = String(text).slice(index, index + 80);
    var candidates = extractGenericNumberCandidates(fragment);
    if (candidates.length) return candidates[0];
  }
  return null;
}

// ==============================================================
// MONEY EXTRACTION
// ==============================================================
function extractMoneyCandidates(text) {
  var candidates = [];
  var regex = /(?:€\s*)?((?:\d{1,3}(?:[.\s]\d{3})+|\d{1,7})(?:[,.]\d{2}))/g;
  var match;
  while ((match = regex.exec(String(text || ''))) !== null) {
    var value = parseItalianMoney(match[1]);
    if (value !== null) candidates.push(value);
  }
  return candidates;
}

function extractAllMoneyValues(text) {
  return extractMoneyCandidates(text);
}

function parseItalianMoney(token) {
  if (token === null || token === undefined) return null;
  var value = String(token).trim().replace(/\s/g, '');
  if (!value) return null;

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
  if (!Number.isFinite(number)) return null;
  return roundMoney(number);
}

// ==============================================================
// GENERIC NUMBER EXTRACTION
// ==============================================================
function extractGenericNumberCandidates(text) {
  var candidates = [];
  var regex = /\b\d{1,5}(?:[.,]\d{1,2})?\b/g;
  var match;
  while ((match = regex.exec(String(text || ''))) !== null) {
    var token = match[0];
    var parsed = parseFloat(token.replace(',', '.'));
    if (!Number.isFinite(parsed)) continue;
    if (parsed >= 1900 && parsed <= 2100 && /^\d{4}$/.test(token)) continue;
    candidates.push(parsed);
  }
  return candidates;
}

// ==============================================================
// FALLBACK INFERENCE
// ==============================================================
function inferGrossFromAmounts(amounts, current) {
  if (!amounts || !amounts.length) return null;
  var candidates = amounts.filter(function (amount) {
    if (amount <= 500) return false;
    if (current.tfr !== null && nearlyEqual(amount, current.tfr)) return false;
    if (current.netto !== null && amount <= current.netto) return false;
    return (amount <= 50000);
  });
  if (!candidates.length) return null;
  candidates.sort(function (a, b) { return a - b; });
  return candidates[0];
}

function inferNetFromAmounts(amounts, current) {
  if (!amounts || !amounts.length) return null;
  var gross = current.lordo;
  var candidates = amounts.filter(function (amount) {
    if (amount <= 100) return false;
    if (current.tfr !== null && nearlyEqual(amount, current.tfr)) return false;
    if (gross !== null) {
      if (amount >= gross) return false;
      var ratio = amount / gross;
      if (ratio < 0.30 || ratio > 0.99) return false;
    }
    return true;
  });
  if (!candidates.length) return null;
  candidates.sort(function (a, b) {
    if (gross !== null) {
      return Math.abs(gross - b) - Math.abs(gross - a);
    }
    return b - a;
  });
  return candidates[0];
}

function inferTfrFromAmounts(amounts, current) {
  if (!amounts || !amounts.length) return null;
  var candidates = amounts.filter(function (amount) {
    if (amount < 1000) return false;
    if (current.netto !== null && nearlyEqual(amount, current.netto)) return false;
    if (current.lordo !== null && nearlyEqual(amount, current.lordo)) return false;
    return (amount <= 10000000);
  });
  if (!candidates.length) return null;
  candidates.sort(function (a, b) { return b - a; });
  return candidates[0];
}

function inferHoursFromText(text) {
  var regex = /(?:ferie|rol)[^0-9]{0,50}(\d{1,3}(?:[.,]\d{1,2})?)/i;
  var match = String(text || '').match(regex);
  if (!match) return null;
  var value = parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

// ==============================================================
// HELPERS
// ==============================================================
function chooseClosestNumberAfterLabel(line, label, values) {
  if (!values || !values.length) return null;
  var normalizedLine = canonicalText(line);
  var normalizedLabel = canonicalText(label);
  var index = normalizedLine.indexOf(normalizedLabel);
  if (index === -1) return values[0];

  var fragment = normalizedLine.slice(index + normalizedLabel.length);
  var candidates = extractMoneyCandidates(fragment);
  if (candidates.length) return candidates[0];
  return values[0];
}

function canonicalText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bbu sta\b/g, 'busta')
    .replace(/\bbosta\b/g, 'busta')
    .replace(/\bbusta\b/g, 'busta')
    .replace(/\bl ardo\b/g, 'lordo')
    .replace(/\biordo\b/g, 'lordo')
    .replace(/\blardo\b/g, 'lordo')
    .replace(/\briet to\b/g, 'netto')
    .replace(/\brietto\b/g, 'netto')
    .replace(/\bn etto\b/g, 'netto');
}

function normalizeDetectedMoney(value) {
  if (value === null || value === undefined) return null;
  var number = Number(value);
  if (!Number.isFinite(number)) return null;
  return roundMoney(number);
}

function normalizeDetectedNumber(value) {
  if (value === null || value === undefined) return null;
  var number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function roundMoney(value) {
  return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.01;
}

function safeInteger(value, fallback) {
  var number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

// ==============================================================
// RENDER RESULT
// ==============================================================
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
        'L algoritmo non è riuscito a rilevare le principali voci della busta paga. Assicurati che la foto sia nitida e che le etichette siano leggibili.'
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
          'In base al reddito lordo mensile rilevato e alla stima annuale, il reddito potrebbe rientrare nella soglia configurata. Controlla nella sezione ritenute della busta paga che il beneficio sia effettivamente applicato.'
        );
      }
    } else {
      if (alertsContainer) {
        alertsContainer.innerHTML += createAlert(
          'blue', 'ℹ️', 'Verifica del Cuneo Fiscale:',
          'La stima del reddito supera la soglia configurata nel sistema. Per una verifica completa sono necessari i dati fiscali effettivi della busta paga e del reddito annuale.'
        );
      }
    }
  }

  var detectedCount = 0;
  if (data.lordo !== null) detectedCount++;
  if (data.netto !== null) detectedCount++;
  if (data.ferie !== null) detectedCount++;
  if (data.tfr !== null) detectedCount++;

  if (detectedCount < 4 && alertsContainer) {
    alertsContainer.innerHTML += createAlert(
      'orange', '⚠️', 'Lettura parziale:',
      'Alcuni dati potrebbero non essere stati riconosciuti. Controlla i valori evidenziati prima di utilizzarli.'
    );
  }
}

// ==============================================================
// FORMATTING
// ==============================================================
function formatEuro(value) {
  return '€ ' + Number(value).toFixed(2).replace('.', ',');
}

function formatHours(value) {
  return Number(value).toFixed(2).replace(/0+$/, '').replace(/,$/, '').replace('.', ',') + ' Ore';
}

function createAlert(type, icon, title, text) {
  var classes = {
    green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    orange: 'bg-orange-50 text-orange-800 border-orange-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200'
  };

  return (
    '<div class="p-4 text-sm font-medium rounded-lg border ' +
    (classes[type] || classes.orange) +
    '">' + icon + ' <b>' + escapeHtml(title) + '</b> ' + escapeHtml(text) + '</div>'
  );
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

})();