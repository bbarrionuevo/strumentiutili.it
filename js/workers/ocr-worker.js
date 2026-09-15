/*
 * js/workers/ocr-worker.js
 * 
 * OCR client-side universale (Buste Paga + Bollette Luce).
 * Tesseract.js 5.1.1 con modelli '4.0.0_best_int' ad alta precisione.
 * Upscale sicuro (OffscreenCanvas) per immagini a bassa risoluzione.
 * Doppio PSM: 6 e 11 con Scoring semantico.
 */

'use strict';

importScripts(
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
);

var activeWorker = null;

self.onmessage = async function (event) {

    var data = event.data || {};
    var imageBlobUrl = data.imageBlobUrl || '';
    var language = data.lang || 'ita';

    if (!imageBlobUrl) {
        self.postMessage({ type: 'error', msg: 'Nessuna immagine ricevuta.' });
        return;
    }

    try {
        reportStatus('Preparazione del documento...');

        var response = await fetch(imageBlobUrl);
        if (!response.ok) throw new Error('Impossibile leggere l immagine.');
        var blob = await response.blob();
        if (!blob || blob.size === 0) throw new Error('Immagine vuota.');

        /*
         * Upscale moderato (solo se l'immagine è piccola).
         * Vitale per far leggere correttamente i decimali a Tesseract.
         */
        var imageForOCR = await prepareImage(blob);

        reportStatus('Avvio motore OCR italiano (Alta Precisione)...');

        /*
         * Tesseract.js v5.1.1 con modelli BEST_INT
         */
        activeWorker = await Tesseract.createWorker(language, 1, {
            langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/ita@1.0.0/4.0.0_best_int',
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
            logger: function (message) {
                if (!message) return;
                if (message.status === 'recognizing text') {
                    var progress = Number(message.progress) || 0;
                    self.postMessage({
                        type: 'progress',
                        pct: Math.round(progress * 100)
                    });
                } else if (message.status) {
                    reportStatus(String(message.status));
                }
            }
        });

        // ======================================================
        // PSM 6
        // ======================================================
        await activeWorker.setParameters({
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1',
            user_defined_dpi: '300'
        });

        reportStatus('Lettura principale del documento...');
        var result6 = await activeWorker.recognize(imageForOCR);
        var text6 = getText(result6);
        var confidence6 = getConfidence(result6);

        // ======================================================
        // PSM 11
        // ======================================================
        await activeWorker.setParameters({
            tessedit_pageseg_mode: '11',
            preserve_interword_spaces: '1',
            user_defined_dpi: '300'
        });

        reportStatus('Controllo del layout (struttura sparsa)...');
        var result11 = await activeWorker.recognize(imageForOCR);
        var text11 = getText(result11);
        var confidence11 = getConfidence(result11);

        // ======================================================
        // SELEZIONE
        // ======================================================
        var selected = selectResult(text6, confidence6, text11, confidence11);

        console.log('[OCR] PSM6 confidence:', confidence6);
        console.log('[OCR] PSM11 confidence:', confidence11);
        console.log('[OCR] Risultato scelto in base allo scoring universale.');

        await terminate();
        self.postMessage({ type: 'success', text: selected });

    } catch (error) {
        console.error('[OCR] Errore:', error);
        await terminate();
        self.postMessage({
            type: 'error',
            msg: error && error.message ? error.message : 'Errore OCR.'
        });
    }
};

// ================================================================
// PREPARE IMAGE (Upscale Sicuro)
// ================================================================
async function prepareImage(blob) {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
        return blob;
    }
    var bitmap = await createImageBitmap(blob);
    try {
        var sourceWidth = bitmap.width;
        var sourceHeight = bitmap.height;

        if (sourceWidth >= 1800) return blob; // Se è grande, non toccarla

        var targetWidth = 1800;
        var scale = targetWidth / sourceWidth;
        if (scale <= 1) return blob;

        var targetHeight = Math.round(sourceHeight * scale);
        if (targetHeight > 3600) {
            scale = 3600 / sourceHeight;
            targetWidth = Math.round(sourceWidth * scale);
            targetHeight = 3600;
        }

        var canvas = new OffscreenCanvas(targetWidth, targetHeight);
        var context = canvas.getContext('2d', { alpha: false });
        if (!context) return blob;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, targetWidth, targetHeight);
        context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

        return await canvas.convertToBlob({ type: 'image/png' });
    } finally {
        try { bitmap.close(); } catch (e) {}
    }
}

// ================================================================
// UTILS
// ================================================================
function reportStatus(message) {
    try {
        self.postMessage({ type: 'status', msg: String(message || '') });
    } catch (error) {}
}

function getText(result) {
    if (!result || !result.data) return '';
    return typeof result.data.text === 'string' ? result.data.text : '';
}

function getConfidence(result) {
    if (!result || !result.data) return 0;
    var value = Number(result.data.confidence);
    return Number.isFinite(value) ? value : 0;
}

// ================================================================
// RESULT SELECTION (Scoring Universale)
// ================================================================
function selectResult(text6, confidence6, text11, confidence11) {
    var score6 = scoreText(text6, confidence6);
    var score11 = scoreText(text11, confidence11);

    if (score11 > score6) return text11;
    return text6;
}

function scoreText(text, confidence) {
    if (!text || !text.trim()) return 0;
    var value = String(text);
    var lower = value.toLowerCase();
    var score = Number(confidence) * 0.35;

    /*
     * Etichette Universali (Lavoro + Energia)
     */
    var keywords = [
        'lordo', 'netto', 'retribuzione', 'ferie', 'tfr', 'inps', 'irpef', 'contribut', 'totale', 'fondo', // Lavoro
        'energia', 'materia', 'commercializzazione', 'kwh', 'spesa', 'fornitura', 'pod', 'pun', 'arera' // Energia
    ];

    for (var i = 0; i < keywords.length; i++) {
        if (lower.indexOf(keywords[i]) !== -1) score += 8;
    }

    var amounts = value.match(/\b\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{2})\b/g);
    if (amounts) score += Math.min(35, amounts.length * 7);

    // Penalizzazione rumore
    var strangeCharacters = (value.match(/[^a-zA-Z0-9À-ÿ€$£.,:;()\-\s/]/g) || []).length;
    score -= Math.min(15, strangeCharacters * 0.15);

    return score;
}

// ================================================================
// TERMINATE
// ================================================================
async function terminate() {
    if (!activeWorker) return;
    try { await activeWorker.terminate(); } catch (error) {}
    activeWorker = null;
}