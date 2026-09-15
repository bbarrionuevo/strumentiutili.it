/*
js/workers/ocr-worker.js
OCR dedicato per documenti italiani:
buste paga
fatture
ricevute
documenti fiscali
Miglioramenti:
pre-processing immagine
upscale
grayscale
contrasto
sharpen leggero
doppia strategia OCR
PSM 6 + PSM 11
selezione automatica del risultato
Tutto eseguito nel Worker.
*/
importScripts(
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
);
'use strict';

var currentTesseractWorker = null;

self.onmessage = async function (event) {
  var data = event.data || {};
  var imageBlobUrl = data.imageBlobUrl || '';
  var lang = data.lang || 'ita';

  if (!imageBlobUrl) {
    self.postMessage({
      type: 'error',
      msg: 'Immagine non ricevuta dal worker.'
    });
    return;
  }

  try {
    reportStatus('Preparazione immagine per OCR...');

    /*
     * Carica l'immagine.
     */
    var imageBlob = await fetchImageBlob(imageBlobUrl);

    /*
     * Crea una versione ottimizzata.
     */
    var processedBlob = await preprocessImage(imageBlob);

    reportStatus('Avvio motore OCR...');

    /*
     * Crea Tesseract.
     */
    currentTesseractWorker = await Tesseract.createWorker(lang, 1, {
      logger: function (message) {
        if (!message) {
          return;
        }
        if (message.status === 'recognizing text') {
          self.postMessage({
            type: 'progress',
            pct: Math.round((Number(message.progress) || 0) * 100)
          });
        } else if (message.status) {
          self.postMessage({
            type: 'status',
            msg: String(message.status)
          });
        }
      },
      langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_fast',
      corePath: 'https://unpkg.com/tesseract.js-core@5.0.0/tesseract-core.wasm.js'
    });

    reportStatus('Configurazione OCR italiano...');

    /*
     * ==========================================================
     * PRIMA PASSATA
     * ==========================================================
     *
     * PSM 6:
     * documento abbastanza regolare.
     *
     * È una buona scelta per:
     * - buste paga
     * - tabelle
     * - moduli
     * - fatture
     */
    await configureTesseract(currentTesseractWorker, '6');

    reportStatus('Lettura OCR del documento...');

    var resultPsm6 = await currentTesseractWorker.recognize(processedBlob);
    var textPsm6 = extractText(resultPsm6);
    var confidencePsm6 = extractConfidence(resultPsm6);

    /*
     * ==========================================================
     * SECONDA PASSATA
     * ==========================================================
     *
     * PSM 11:
     * sparse text.
     *
     * Utile quando la busta paga ha:
     * - colonne
     * - blocchi separati
     * - molto spazio vuoto
     * - layout irregolare
     */
    await configureTesseract(currentTesseractWorker, '11');

    reportStatus('Seconda analisi del layout...');

    var resultPsm11 = await currentTesseractWorker.recognize(processedBlob);
    var textPsm11 = extractText(resultPsm11);
    var confidencePsm11 = extractConfidence(resultPsm11);

    /*
     * ==========================================================
     * SELEZIONE RISULTATO
     * ==========================================================
     */
    var selected = chooseBestOCRResult(
      textPsm6,
      confidencePsm6,
      textPsm11,
      confidencePsm11
    );

    /*
     * ==========================================================
     * OUTPUT
     * ==========================================================
     */
    consoleLog('OCR PSM6 confidence:', confidencePsm6);
    consoleLog('OCR PSM11 confidence:', confidencePsm11);
    consoleLog('OCR risultato selezionato:', selected);

    await safeTerminate();

    self.postMessage({
      type: 'success',
      text: selected
    });

  } catch (error) {
    consoleLog('Errore OCR:', error);
    await safeTerminate();

    self.postMessage({
      type: 'error',
      msg: error && error.message ? error.message : 'Errore sconosciuto durante OCR.'
    });
  }
};

// ============================================================
// FETCH IMAGE
// ============================================================
async function fetchImageBlob(url) {
  var response = await fetch(url);
  if (!response.ok) {
    throw new Error('Impossibile leggere il file immagine.');
  }
  var blob = await response.blob();
  if (!blob || !blob.size) {
    throw new Error('Il file immagine è vuoto.');
  }
  return blob;
}

// ============================================================
// PREPROCESS IMAGE
// ============================================================
async function preprocessImage(blob) {
  /*
  OffscreenCanvas permette di fare preprocessing
  direttamente nel Worker senza bloccare il Main Thread.
  */
  if (typeof OffscreenCanvas === 'undefined') {
    /*
    * Fallback: restituisce l'immagine originale.
    */
    return blob;
  }
  if (typeof createImageBitmap !== 'function') {
    return blob;
  }

  var bitmap = await createImageBitmap(blob);
  try {
    var originalWidth = bitmap.width;
    var originalHeight = bitmap.height;

    /*
     * OCR beneficia di immagini con caratteri
     * sufficientemente grandi. Ma evitare upscaling estremo.
     */
    var targetWidth = Math.max(1800, originalWidth);
    var maxWidth = 2600;
    targetWidth = Math.min(targetWidth, maxWidth);

    /*
     * Manteniamo aspect ratio.
     */
    var scale = targetWidth / originalWidth;
    if (scale < 1) {
      scale = 1;
    }
    var targetHeight = Math.round(originalHeight * scale);

    /*
     * Limite verticale per evitare immagini enormi in memoria.
     */
    if (targetHeight > 3600) {
      scale = 3600 / originalHeight;
      targetWidth = Math.round(originalWidth * scale);
      targetHeight = 3600;
    }

    var canvas = new OffscreenCanvas(targetWidth, targetHeight);
    var context = canvas.getContext('2d', { alpha: false });

    if (!context) {
      return blob;
    }

    /*
     * Migliore qualità di interpolazione.
     */
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    /*
     * Sfondo bianco.
     */
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, targetWidth, targetHeight);

    /*
     * Disegno immagine.
     */
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    /*
     * ========================================================
     * PIXEL PROCESSING
     * ========================================================
     */
    var imageData = context.getImageData(0, 0, targetWidth, targetHeight);
    var pixels = imageData.data;

    /*
     * Primo passaggio: grayscale + contrasto.
     */
    for (var i = 0; i < pixels.length; i += 4) {
      var r = pixels[i];
      var g = pixels[i + 1];
      var b = pixels[i + 2];

      /*
       * Luminanza percepita.
       */
      var gray = (0.299 * r + 0.587 * g + 0.114 * b);

      /*
       * Contrasto moderato.
       * Evita di schiacciare completamente gli zeri e gli altri caratteri sottili.
       */
      var contrast = 1.18;
      var adjusted = (gray - 128) * contrast + 128;
      adjusted = Math.max(0, Math.min(255, adjusted));

      pixels[i] = adjusted;
      pixels[i + 1] = adjusted;
      pixels[i + 2] = adjusted;
      pixels[i + 3] = 255;
    }

    context.putImageData(imageData, 0, 0);

    /*
     * ========================================================
     * SHARPEN LEGGERO
     * ========================================================
     *
     * Non facciamo un filtro aggressivo:
     * potrebbe trasformare 0 -> 6, 8 -> 9, 5 -> 6
     */
    var sharpened = applyUnsharpMask(context, targetWidth, targetHeight);
    if (sharpened) {
      context.putImageData(sharpened, 0, 0);
    }

    /*
     * Esportazione JPEG di qualità alta.
     */
    var outputBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.96
    });

    return outputBlob;
  } finally {
    try {
      bitmap.close();
    } catch (error) {}
  }
}

// ============================================================
// UNSHARP MASK
// ============================================================
function applyUnsharpMask(context, width, height) {
  try {
    var source = context.getImageData(0, 0, width, height);
    var pixels = source.data;

    /*
     * Per prestazioni: lavoriamo con un sharpen locale molto leggero.
     * Non viene applicato ai bordi dell'immagine.
     */
    var output = new Uint8ClampedArray(pixels);
    var stride = width * 4;

    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        var index = (y * width + x) * 4;
        var center = pixels[index];
        var left = pixels[index - 4];
        var right = pixels[index + 4];
        var top = pixels[index - stride];
        var bottom = pixels[index + stride];

        var average = (left + right + top + bottom) / 4;

        /*
         * Sharpen molto moderato.
         */
        var value = center + (center - average) * 0.18;
        value = Math.max(0, Math.min(255, value));

        output[index] = value;
        output[index + 1] = value;
        output[index + 2] = value;
        output[index + 3] = 255;
      }
    }

    return new ImageData(output, width, height);
  } catch (error) {
    consoleLog('Unsharp mask non disponibile:', error);
    return null;
  }
}

// ============================================================
// TESSERACT CONFIG
// ============================================================
async function configureTesseract(worker, psm) {
  if (!worker || typeof worker.setParameters !== 'function') {
    return;
  }
  await worker.setParameters({
    tessedit_pageseg_mode: String(psm),
    preserve_interword_spaces: '1',
    /*
     * Migliora la lettura dei numeri, mantenendo comunque lettere e simboli.
     */
    user_defined_dpi: '300'
  });
}

// ============================================================
// RESULT EXTRACTION
// ============================================================
function extractText(result) {
  if (!result) {
    return '';
  }
  if (result.data && typeof result.data.text === 'string') {
    return result.data.text;
  }
  return '';
}

function extractConfidence(result) {
  if (!result || !result.data) {
    return 0;
  }
  var confidence = Number(result.data.confidence);
  if (Number.isFinite(confidence)) {
    return confidence;
  }
  return 0;
}

// ============================================================
// SELECT BEST OCR
// ============================================================
function chooseBestOCRResult(textA, confidenceA, textB, confidenceB) {
  var scoreA = scoreOCRText(textA, confidenceA);
  var scoreB = scoreOCRText(textB, confidenceB);
  consoleLog('OCR score PSM6:', scoreA);
  consoleLog('OCR score PSM11:', scoreB);
  if (scoreB > scoreA) {
    return textB;
  }
  return textA;
}

// ============================================================
// OCR SCORING
// ============================================================
function scoreOCRText(text, confidence) {
  if (!text || !text.trim()) {
    return 0;
  }
  var value = String(text);

  /*
   * Più testo utile = meglio.
   */
  var lengthScore = Math.min(40, value.length / 20);

  /*
   * Presenza di parole tipiche della busta paga.
   */
  var keywords = [
    'lordo', 'netto', 'retribuzione', 'ferie', 'tfr',
    'inps', 'irpef', 'contribut', 'ritenut', 'paga',
    'competenze', 'mese', 'stipend'
  ];
  var normalized = value.toLowerCase();
  var keywordScore = 0;

  for (var i = 0; i < keywords.length; i++) {
    if (normalized.indexOf(keywords[i]) !== -1) {
      keywordScore += 8;
    }
  }

  /*
   * Presenza di importi monetari.
   */
  var amountMatches = value.match(/\b\d{1,3}(?:[.\s]\d{3})[,.]\d{2}\b/g);
  var amountScore = amountMatches ? Math.min(30, amountMatches.length * 5) : 0;

  /*
   * Confidence Tesseract.
   */
  var confidenceScore = Math.min(30, Math.max(0, Number(confidence) * 0.30));

  return (lengthScore + keywordScore + amountScore + confidenceScore);
}

// ============================================================
// STATUS
// ============================================================
function reportStatus(message) {
  try {
    self.postMessage({
      type: 'status',
      msg: String(message || '')
    });
  } catch (error) {}
}

// ============================================================
// SAFE TERMINATE
// ============================================================
async function safeTerminate() {
  if (!currentTesseractWorker) {
    return;
  }
  try {
    await currentTesseractWorker.terminate();
  } catch (error) {
    consoleLog('Errore terminate Tesseract:', error);
  }
  currentTesseractWorker = null;
}

// ============================================================
// CONSOLE
// ============================================================
function consoleLog() {
  try {
    if (typeof console !== 'undefined' && console.log) {
      console.log.apply(console, arguments);
    }
  } catch (error) {}
}