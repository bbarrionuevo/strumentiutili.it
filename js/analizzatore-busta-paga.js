(function () {
  'use strict';

  var dropArea, fileInput, loadingState, progressText, resultsDashboard, alertsContainer;
  var resLordo, resNetto, resFerie, resTfr;
  var ALIQUOTA_INPS = 0.0919;
  var SOGLIA_CUNEO = 40000;
  var SOGLIA_CONFIDENZA = 85;

  document.addEventListener('DOMContentLoaded', function () {
    cacheDom();
    if (!dropArea || !fileInput) return;
    bindEvents();
    makeResultsEditable();
    console.log('[Busta Paga] Sistema Inizializzato.');
  });

  function cacheDom() {
    dropArea = document.getElementById('drop-area');
    fileInput = document.getElementById('file-input');
    loadingState = document.getElementById('loading-state');
    progressText = loadingState ? loadingState.querySelector('p') : null;
    resultsDashboard = document.getElementById('results-dashboard');
    alertsContainer = document.getElementById('alerts-container');
    resLordo = document.getElementById('res-lordo');
    resNetto = document.getElementById('res-netto');
    resFerie = document.getElementById('res-ferie');
    resTfr = document.getElementById('res-tfr');
    
    var btnReset = document.getElementById('btn-reset');
    if (btnReset) btnReset.addEventListener('click', resetAnalyzer);
  }

  // Hacemos que los contenedores numéricos sean editables por el usuario
  function makeResultsEditable() {
    [resLordo, resNetto, resFerie, resTfr].forEach(function(el) {
        if (el) {
            el.setAttribute('contenteditable', 'true');
            el.classList.add('outline-none', 'focus:bg-white', 'focus:ring-2', 'focus:ring-indigo-500', 'rounded', 'px-2', 'py-1', 'transition-all', 'cursor-text');
        }
    });
  }

  function bindEvents() {
    dropArea.addEventListener('click', function (e) {
      if (e.target && e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') fileInput.click();
    });
    dropArea.addEventListener('dragover', function (e) { e.preventDefault(); dropArea.classList.add('bg-indigo-100'); });
    dropArea.addEventListener('dragleave', function () { dropArea.classList.remove('bg-indigo-100'); });
    dropArea.addEventListener('drop', function (e) {
      e.preventDefault(); dropArea.classList.remove('bg-indigo-100');
      if (e.dataTransfer.files.length) startAnalysis(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
      if (this.files.length) startAnalysis(this.files[0]);
    });
  }

  function resetAnalyzer() {
    resultsDashboard.classList.add('hidden');
    dropArea.classList.remove('hidden');
    loadingState.classList.add('hidden');
    alertsContainer.innerHTML = '';
    fileInput.value = '';
  }

  function updateProgress(msg) { if (progressText) progressText.textContent = msg; }

  async function startAnalysis(file) {
    dropArea.classList.add('hidden');
    loadingState.classList.remove('hidden');
    alertsContainer.innerHTML = '';
    
    try {
      var imageUrl = URL.createObjectURL(file);
      var ocrResult = await runOcrWorker(imageUrl);
      URL.revokeObjectURL(imageUrl);

      console.log('[Busta Paga] TESTO ESTRATTO:\n', ocrResult.text);
      console.log('[Busta Paga] PASSATA NUMERICA:\n', ocrResult.numericText);
      var data = parseBustaPaga(ocrResult);
      renderResults(data);

    } catch (error) {
      alert("Errore: " + error.message);
      resetAnalyzer();
    } finally {
      loadingState.classList.add('hidden');
    }
  }

  function runOcrWorker(imageBlobUrl) {
    return new Promise(function (resolve, reject) {
      var worker = new Worker('/js/workers/ocr-worker.js');
      worker.onmessage = function (e) {
        var d = e.data;
        if (d.type === 'progress') updateProgress('Lettura ottica: ' + d.pct + '%');
        if (d.type === 'status') updateProgress(d.msg);
        if (d.type === 'success') {
          worker.terminate();
          resolve({ text: d.text || '', words: d.words || [], numericText: d.numericText || '' });
        }
        if (d.type === 'error') {
          worker.terminate();
          reject(new Error(d.msg));
        }
      };
      worker.onerror = function (err) {
        worker.terminate();
        reject(new Error((err && err.message) || 'Il motore OCR si è interrotto in modo imprevisto.'));
      };
      worker.postMessage({ imageBlobUrl: imageBlobUrl, lang: 'ita' });
    });
  }

  // ==============================================================
  // PARSER GEOMETRICO
  // ==============================================================
  function parseBustaPaga(ocrResult) {
    var result = { lordo: null, netto: null, ferie: null, tfr: null };
    // Confidenza OCR per campo: null = sconosciuta (valore da fallback testuale)
    var confidence = { lordo: null, netto: null, ferie: null, tfr: null };
    var words = ocrResult.words;
    var text = String(ocrResult.text).toLowerCase();

    function assign(field, hit) {
      if (hit) {
        result[field] = hit.value;
        confidence[field] = hit.confidence;
      }
    }

    // 1. RICERCA SPAZIALE (Bounding Boxes)
    if (words.length > 0) {
        assign('lordo', findValueSpatially(words, ['lordo', 'retribuzione']));
        assign('netto', findValueSpatially(words, ['netto', 'busta', 'pagare']));
        assign('ferie', findValueSpatially(words, ['ferie', 'residue', 'rol']));
        assign('tfr', findValueSpatially(words, ['tfr', 'fondo', 'accantonato']));
    }

    // 2. FALLBACK TESTUALE
    if (result.lordo === null) result.lordo = findAmountNearLabels(text, ['totale lordo', 'retribuzione']);
    if (result.netto === null) result.netto = findAmountNearLabels(text, ['netto in busta', 'netto a pagare']);
    if (result.tfr === null) result.tfr = findAmountNearLabels(text, ['fondo tfr', 'tfr maturato']);
    
    if (result.ferie === null) {
        var match = text.match(/(?:ferie|rol)[^0-9]{0,40}(\d+(?:[.,]\d+)?)/);
        if (match) result.ferie = parseItalianMoney(match[1]);
    }

    // 3. SANITY CHECK CRITICO
    if (result.lordo !== null && result.netto !== null) {
        var ratio = result.netto / result.lordo;
        if (ratio >= 1 || ratio < 0.25) {
            console.warn('[Busta Paga] Netto scartato per ratio impossibile:', result.netto);
            result.netto = null;
            confidence.netto = null;
        }
    }

    if (result.tfr !== null && result.netto !== null && Math.abs(result.tfr - result.netto) < 0.01) {
        result.tfr = null; // Evita duplicati ottici
        confidence.tfr = null;
    }

    result.confidence = confidence;
    return result;
  }

  function findValueSpatially(words, labels) {
    for (var j = 0; j < labels.length; j++) {
      var label = labels[j];
      var targetIdx = words.findIndex(w => w.text.toLowerCase().includes(label));
      
      if (targetIdx !== -1) {
        var targetWord = words[targetIdx];
        // Busca a la derecha, en la misma línea (y0 +- 25px)
        var candidates = words.filter(w => w.x0 > targetWord.x1 && Math.abs(w.y0 - targetWord.y0) <= 25);
        candidates.sort((a, b) => a.x0 - b.x0);

        for (var i = 0; i < candidates.length; i++) {
          var val = parseItalianMoney(candidates[i].text);
          if (val !== null) return { value: val, confidence: candidates[i].confidence };
        }
      }
    }
    return null;
  }

  function findAmountNearLabels(text, labels) {
    for (var i = 0; i < labels.length; i++) {
      var idx = text.indexOf(labels[i]);
      if (idx !== -1) {
        var fragment = text.slice(idx, idx + 100);
        var match = fragment.match(/(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{2}))/);
        if (match) return parseItalianMoney(match[1]);
      }
    }
    return null;
  }

  function parseItalianMoney(token) {
    if (!token) return null;
    var value = token.trim().replace(/\s/g, '');
    if (value.includes(',') && value.includes('.')) {
        value = value.lastIndexOf(',') > value.lastIndexOf('.') ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
    } else if (value.includes(',')) {
        value = value.replace(',', '.');
    }
    var num = Number(value);
    return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
  }

  // Stili inline: tailwind.config.js analizza solo i file .html,
  // quindi le classi aggiunte via JS verrebbero eliminate dal purge.
  function markConfidence(el, conf) {
    if (!el) return false;
    el.style.boxShadow = '';
    el.style.backgroundColor = '';
    el.removeAttribute('title');
    if (conf !== null && conf < SOGLIA_CONFIDENZA) {
      el.style.boxShadow = '0 0 0 2px #f59e0b';
      el.style.backgroundColor = '#fffbeb';
      el.title = 'Lettura ottica incerta (' + Math.round(conf) + '%). Verifica il valore.';
      return true;
    }
    return false;
  }

  function renderResults(data) {
    resultsDashboard.classList.remove('hidden');

    var format = val => val !== null ? '€ ' + val.toFixed(2).replace('.', ',') : 'N/D';
    var formatH = val => val !== null ? val.toFixed(2).replace('.', ',') + ' Ore' : 'N/D';

    resLordo.textContent = format(data.lordo);
    resNetto.textContent = format(data.netto);
    resFerie.textContent = formatH(data.ferie);
    resTfr.textContent = format(data.tfr);

    var conf = data.confidence;
    var incerti = 0;
    if (markConfidence(resLordo, conf.lordo)) incerti++;
    if (markConfidence(resNetto, conf.netto)) incerti++;
    if (markConfidence(resFerie, conf.ferie)) incerti++;
    if (markConfidence(resTfr, conf.tfr)) incerti++;

    var detectedCount = (data.lordo ? 1 : 0) + (data.netto ? 1 : 0) + (data.ferie ? 1 : 0) + (data.tfr ? 1 : 0);

    if (detectedCount < 4) {
      alertsContainer.innerHTML = '<div class="p-4 text-sm font-medium rounded-lg border bg-orange-50 text-orange-800 border-orange-200">⚠️ <b>Lettura parziale:</b> Alcuni dati non sono stati riconosciuti per la qualità dell\'immagine. <b>Puoi cliccare sui numeri per correggerli manualmente.</b></div>';
    } else if (incerti > 0) {
      alertsContainer.innerHTML = '<div class="p-4 text-sm font-medium rounded-lg border bg-orange-50 text-orange-800 border-orange-200">🔍 <b>Valori da verificare:</b> Il riconoscimento ottico non è certo dei campi evidenziati in giallo (caratteri corsivi o immagine a bassa risoluzione). <b>Confrontali con il documento originale e correggili cliccandoci sopra.</b></div>';
    } else if (data.lordo !== null && (data.lordo * 13) < SOGLIA_CUNEO) {
      alertsContainer.innerHTML = '<div class="p-4 text-sm font-medium rounded-lg border bg-emerald-50 text-emerald-800 border-emerald-200">✅ <b>Sgravio Cuneo Fiscale:</b> Potresti rientrare nel taglio del cuneo fiscale.</div>';
    }
  }
})();