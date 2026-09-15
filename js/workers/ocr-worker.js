/*
 * js/workers/ocr-worker.js
 * Motore OCR Universale (Buste Paga + Bollette Luce)
 */
'use strict';

importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');

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
        if (!blob || blob.size <= 0) throw new Error('Immagine vuota.');

        reportStatus('Avvio OCR italiano...');

        activeWorker = await Tesseract.createWorker(language, 1, {
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

        // ========================================================
        // OCR GENERALE (PSM 6)
        // ========================================================
        await configureGeneralOCR(activeWorker, '6');
        reportStatus('Lettura della struttura del documento...');
        var generalResult = await activeWorker.recognize(blob);
        var generalData = extractStructuredResult(generalResult);

        // ========================================================
        // OCR GENERALE (PSM 11)
        // ========================================================
        await configureGeneralOCR(activeWorker, '11');
        reportStatus('Verifica del layout del documento...');
        var sparseResult = await activeWorker.recognize(blob);
        var sparseData = extractStructuredResult(sparseResult);

        // ========================================================
        // BEST GENERAL RESULT
        // ========================================================
        var best = chooseBestGeneralResult(generalData, sparseData);

        // ========================================================
        // NUMERIC OCR (Fallback globale per Busta Paga e Bolletta)
        // ========================================================
        var numericResults = await runNumericOCR(activeWorker, blob);

        await terminateWorker();

        self.postMessage({
            type: 'success',
            text: best.text,
            confidence: best.confidence,
            words: best.words,
            numericText: numericResults
        });

    } catch (error) {
        console.error('[OCR] Errore:', error);
        await terminateWorker();
        self.postMessage({
            type: 'error',
            msg: error && error.message ? error.message : 'Errore OCR.'
        });
    }
};

// ================================================================
// UTILS & CONFIG
// ================================================================
function reportStatus(message) {
    try { 
        self.postMessage({ type: 'status', msg: String(message || '') }); 
    } catch (error) {}
}

async function configureGeneralOCR(worker, psm) {
    await worker.setParameters({
        tessedit_pageseg_mode: String(psm),
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
    });
}

async function runNumericOCR(worker, blob) {
    await worker.setParameters({
        tessedit_pageseg_mode: '6',
        tessedit_char_whitelist: '0123456789,.-€',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
    });
    reportStatus('Verifica dei valori numerici...');
    var result = await worker.recognize(blob);
    return extractText(result);
}

// ================================================================
// DATA EXTRACTION & SCORING
// ================================================================
function extractStructuredResult(result) {
    if (!result || !result.data) return { text: '', confidence: 0, words: [] };

    var text = typeof result.data.text === 'string' ? result.data.text : '';
    var confidence = Number(result.data.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;

    var words = [];
    if (Array.isArray(result.data.words)) {
        words = result.data.words.map(function (word) {
            var bbox = word.bbox || {};
            return {
                text: String(word.text || ''),
                confidence: Number(word.confidence) || 0,
                x0: Number(bbox.x0) || 0,
                y0: Number(bbox.y0) || 0,
                x1: Number(bbox.x1) || 0,
                y1: Number(bbox.y1) || 0
            };
        }).filter(function (word) {
            return word.text && word.text.trim();
        });
    }

    return { text: text, confidence: confidence, words: words };
}

function extractText(result) {
    if (!result || !result.data) return '';
    return typeof result.data.text === 'string' ? result.data.text : '';
}

function chooseBestGeneralResult(first, second) {
    var scoreFirst = scoreGeneralResult(first);
    var scoreSecond = scoreGeneralResult(second);
    if (scoreSecond > scoreFirst) return second;
    return first;
}

function scoreGeneralResult(result) {
    if (!result || !result.text) return 0;
    var text = result.text.toLowerCase();
    var score = Number(result.confidence) * 0.4;

    var keywords = [
        // Busta Paga
        'lordo', 'netto', 'retribuzione', 'ferie', 'tfr', 'inps', 'irpef', 
        'contribut', 'ritenut', 'paga', 'pagare', 'totale', 'fondo',
        // Bolletta Luce
        'energia', 'materia', 'commercializzazione', 'kwh', 'spesa', 'fornitura',
        'pod', 'pun', 'fissa', 'consumi', 'arera'
    ];

    for (var i = 0; i < keywords.length; i++) {
        if (text.indexOf(keywords[i]) !== -1) score += 8;
    }

    var amounts = result.text.match(/\b\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}\b/g);
    if (amounts) score += Math.min(40, amounts.length * 8);
    
    score += Math.min(20, result.words.length);

    return score;
}

async function terminateWorker() {
    if (!activeWorker) return;
    try { await activeWorker.terminate(); } catch (error) {}
    activeWorker = null;
}