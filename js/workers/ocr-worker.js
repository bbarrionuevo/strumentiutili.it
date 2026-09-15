/*
 * js/workers/ocr-worker.js
 * 
 * OCR client-side strutturato (Buste Paga + Bollette).
 * Estrae Testo e Bounding Boxes (x0, y0, x1, y1).
 * Nessuna alterazione dei pixel originali.
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
        if (!response.ok) {
            throw new Error('Impossibile leggere l immagine.');
        }
        var blob = await response.blob();
        if (!blob || blob.size <= 0) {
            throw new Error('Immagine vuota.');
        }

        reportStatus('Avvio motore OCR italiano...');

        /*
         * IMPORTANTE:
         * Tesseract.js 5 usa automaticamente il CDN jsDelivr.
         * Configuriamo user_words_suffix vuoto durante l'inizializzazione 
         * per evitare il tentativo di caricare ita.special-words.
         */
        activeWorker = await Tesseract.createWorker(
            language,
            1,
            {
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
            },
            {
                /* Parametri di inizializzazione */
                user_words_suffix: '',
                user_patterns_suffix: '',
                load_system_dawg: '1',
                load_freq_dawg: '1',
                load_punc_dawg: '1',
                load_number_dawg: '1'
            }
        );

        // ========================================================
        // PSM 6
        // ========================================================
        await setParameters(activeWorker, '6');
        reportStatus('Lettura principale del documento...');
        
        var result6 = await activeWorker.recognize(blob);
        var structured6 = extractStructuredResult(result6);

        // ========================================================
        // PSM 11
        // ========================================================
        await setParameters(activeWorker, '11');
        reportStatus('Controllo della struttura del documento...');
        
        var result11 = await activeWorker.recognize(blob);
        var structured11 = extractStructuredResult(result11);

        // ========================================================
        // SELECCIÓN
        // ========================================================
        var selected = chooseBestResult(structured6, structured11);

        console.log('[OCR] PSM6 confidence:', structured6.confidence);
        console.log('[OCR] PSM11 confidence:', structured11.confidence);
        console.log('[OCR] Risultato scelto in base allo scoring.');

        await terminateWorker();

        // Ora restituiamo anche l'array WORDS per il parsing spaziale!
        self.postMessage({
            type: 'success',
            text: selected.text,
            confidence: selected.confidence,
            words: selected.words
        });

    } catch (error) {
        console.error('[OCR] Errore:', error);
        await terminateWorker();
        self.postMessage({
            type: 'error',
            msg: error && error.message ? error.message : 'Errore OCR sconosciuto.'
        });
    }
};

// ================================================================
// STATUS
// ================================================================
function reportStatus(message) {
    try {
        self.postMessage({
            type: 'status',
            msg: String(message || '')
        });
    } catch (error) {}
}

// ================================================================
// PARAMETERS
// ================================================================
async function setParameters(worker, psm) {
    await worker.setParameters({
        tessedit_pageseg_mode: String(psm),
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
    });
}

// ================================================================
// STRUCTURED RESULT (Estrae Bounding Boxes)
// ================================================================
function extractStructuredResult(result) {
    if (!result || !result.data) {
        return { text: '', confidence: 0, words: [] };
    }

    var text = typeof result.data.text === 'string' ? result.data.text : '';
    var confidence = Number(result.data.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;

    var words = [];
    if (Array.isArray(result.data.words)) {
        words = result.data.words.map(function (word) {
            return {
                text: String(word.text || ''),
                confidence: Number(word.confidence) || 0,
                x0: Number(word.bbox && word.bbox.x0) || 0,
                y0: Number(word.bbox && word.bbox.y0) || 0,
                x1: Number(word.bbox && word.bbox.x1) || 0,
                y1: Number(word.bbox && word.bbox.y1) || 0
            };
        }).filter(function (word) {
            return word.text.length > 0;
        });
    }

    return {
        text: text,
        confidence: confidence,
        words: words
    };
}

// ================================================================
// RESULT SELECTION
// ================================================================
function chooseBestResult(result6, result11) {
    var score6 = scoreResult(result6);
    var score11 = scoreResult(result11);

    if (score11 > score6) return result11;
    return result6;
}

// ================================================================
// SCORE UNIVERSALE (Lavoro + Energia)
// ================================================================
function scoreResult(result) {
    if (!result || !result.text) return 0;
    
    var text = result.text.toLowerCase();
    var score = Number(result.confidence) * 0.40;

    var keywords = [
        // Busta Paga
        'lordo', 'netto', 'retribuzione', 'ferie', 'tfr', 'inps', 'irpef', 
        'contribut', 'ritenut', 'paga', 'pagare', 'totale', 'fondo',
        // Bolletta Luce
        'energia', 'materia', 'commercializzazione', 'kwh', 'spesa', 'fornitura',
        'pod', 'pun', 'fissa', 'consumi', 'arera'
    ];

    for (var i = 0; i < keywords.length; i++) {
        if (text.indexOf(keywords[i]) !== -1) {
            score += 8;
        }
    }

    /* Bonus per numeri decimali (tipici di importi) */
    if (/\d+[,.]\d{2}/.test(result.text)) {
        score += 15;
    }

    /* Bonus per quantità di parole rilevate */
    score += Math.min(20, result.words.length);

    return score;
}

// ================================================================
// TERMINATE
// ================================================================
async function terminateWorker() {
    if (!activeWorker) return;
    try {
        await activeWorker.terminate();
    } catch (error) {
        console.warn('[OCR] Errore chiusura:', error);
    }
    activeWorker = null;
}