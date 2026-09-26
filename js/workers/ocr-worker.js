/*
 * js/workers/ocr-worker.js
 * Motore OCR Spaziale (Zero-Backend)
 * Doppia passata PSM (6 + 11) con scoring semantico + passata numerica di fallback.
 */
'use strict';

// Tesseract.js, il motore WebAssembly e i modelli delle lingue sono serviti
// dal sito (vendor/, vedi scripts/copia-vendor.js): nessun CDN di terzi.
try {
    importScripts('/vendor/tesseract@5.1.1/tesseract.min.js');
} catch (e) {
    self.postMessage({ type: 'error', msg: 'Impossibile caricare il motore OCR (Tesseract.js). Verifica la connessione di rete.' });
}

// Indirizzi completi: dentro un Worker Tesseract.js non sa risolvere quelli
// relativi (non c'e' window.location). corePath e' una cartella: Tesseract.js
// sceglie da solo la variante con o senza SIMD.
var ORIGINE = self.location.origin;
var WORKER_PATH = ORIGINE + '/vendor/tesseract@5.1.1/worker.min.js';
var CORE_PATH = ORIGINE + '/vendor/tesseract-core@5.1.1';

// Modelli 4.0.0_best_int di italiano, inglese e spagnolo, tutti nella stessa cartella.
function buildLangPath() {
    return ORIGINE + '/vendor/tessdata@1.0.0';
}

// Tesseract.js propaga alcuni errori interni fuori dalla catena delle Promise:
// senza questi handler la UI resterebbe bloccata sullo spinner all'infinito.
self.onerror = function (e) {
    self.postMessage({ type: 'error', msg: (e && e.message) || 'Errore interno del motore OCR.' });
};
self.onunhandledrejection = function (e) {
    var reason = e && e.reason;
    self.postMessage({ type: 'error', msg: (reason && reason.message) || 'Errore interno del motore OCR.' });
};

// Silenziamo gli errori interni di WebAssembly (es. ita.special-words)
var originalConsoleError = console.error;
console.error = function () {
    if (arguments[0] && typeof arguments[0] === 'string' && arguments[0].includes('special-words')) return;
    originalConsoleError.apply(console, arguments);
};

// Lessico combinato per lo scoring semantico (Busta Paga + Bolletta Energia)
var SEMANTIC_KEYWORDS = [
    // Busta Paga / Lavoro
    'lordo', 'netto', 'tfr', 'ferie', 'rol', 'imponibile', 'irpef', 'inps',
    'trattenute', 'detrazioni', 'addizionale', 'retribuzione', 'busta', 'paga',
    'cedolino', 'previdenziale', 'competenze',
    // Bolletta Energia
    'kwh', 'pod', 'arera', 'bolletta', 'energia', 'consumi', 'potenza',
    'scontrino', 'fornitura', 'iva', 'canone', 'rai', 'oneri'
];

// Le pagine possono aggiungere il proprio lessico (etichette energetiche, cartellini prezzo)
// passando data.keywords: l'elenco vale solo per quella chiamata e non altera le altre pagine.
var extraKeywords = [];

function scoreExtraction(text, words) {
    var normalized = (text || '').toLowerCase();
    var vocabolario = SEMANTIC_KEYWORDS.concat(extraKeywords);
    var keywordScore = 0;
    for (var i = 0; i < vocabolario.length; i++) {
        if (normalized.indexOf(vocabolario[i]) !== -1) keywordScore += 1;
    }

    var confidenceSum = 0;
    for (var j = 0; j < words.length; j++) confidenceSum += (words[j].confidence || 0);
    var avgConfidence = words.length > 0 ? confidenceSum / words.length : 0;

    // Il match lessicale pesa più della confidenza grezza dell'OCR
    return (keywordScore * 10) + avgConfidence;
}

function mapWords(rawWords) {
    return (rawWords || []).map(function (w) {
        return {
            text: w.text || '',
            confidence: w.confidence || 0,
            x0: w.bbox ? w.bbox.x0 : 0,
            y0: w.bbox ? w.bbox.y0 : 0,
            x1: w.bbox ? w.bbox.x1 : 0,
            y1: w.bbox ? w.bbox.y1 : 0
        };
    }).filter(function (w) { return w.text.trim().length > 0; });
}

self.onmessage = async function (event) {
    var data = event.data || {};
    if (!data.imageBlobUrl) return self.postMessage({ type: 'error', msg: 'Immagine mancante.' });

    extraKeywords = Array.isArray(data.keywords)
        ? data.keywords.map(function (k) { return String(k).toLowerCase(); })
        : [];

    if (typeof Tesseract === 'undefined') {
        return self.postMessage({ type: 'error', msg: 'Libreria OCR non disponibile (caricamento fallito).' });
    }

    var worker = null;
    var currentStageBase = 0;
    var currentStageWeight = 0.4;

    try {
        self.postMessage({ type: 'status', msg: 'Preparazione immagine...' });
        var response = await fetch(data.imageBlobUrl);
        var blob = await response.blob();

        self.postMessage({ type: 'status', msg: 'Avvio motore OCR...' });

        var lang = data.lang || 'ita';
        worker = await Tesseract.createWorker(lang, 1, {
            workerPath: WORKER_PATH,
            corePath: CORE_PATH,
            langPath: buildLangPath(lang),
            logger: function (m) {
                if (m && m.status === 'recognizing text') {
                    var pct = Math.round((Number(m.progress) || 0) * 100);
                    self.postMessage({ type: 'progress', pct: Math.min(99, Math.round(currentStageBase + pct * currentStageWeight)) });
                }
            }
        });

        // --- PASSATA 1: PSM 6 (Blocco di testo uniforme) ---
        currentStageBase = 0; currentStageWeight = 0.4;
        self.postMessage({ type: 'status', msg: 'Lettura ottica (layout standard)...' });
        await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
        var resultA = await worker.recognize(blob);
        var wordsA = mapWords(resultA.data.words);
        var scoreA = scoreExtraction(resultA.data.text, wordsA);

        // --- PASSATA 2: PSM 11 (Testo sparso) ---
        currentStageBase = 40; currentStageWeight = 0.4;
        self.postMessage({ type: 'status', msg: 'Lettura ottica (layout sparso)...' });
        await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
        var resultB = await worker.recognize(blob);
        var wordsB = mapWords(resultB.data.words);
        var scoreB = scoreExtraction(resultB.data.text, wordsB);

        var winnerText, winnerWords;
        if (scoreB > scoreA) {
            winnerText = resultB.data.text || '';
            winnerWords = wordsB;
        } else {
            winnerText = resultA.data.text || '';
            winnerWords = wordsA;
        }

        // --- PASSATA 3: Fallback numerico (solo cifre/valuta, riduce le confusioni tipografiche) ---
        currentStageBase = 80; currentStageWeight = 0.2;
        self.postMessage({ type: 'status', msg: 'Estrazione numerica di controllo...' });
        await worker.setParameters({
            tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: '0123456789.,€%- ',
            preserve_interword_spaces: '1'
        });
        var resultNum = await worker.recognize(blob);
        var numericText = resultNum.data.text || '';

        await worker.terminate();
        worker = null;

        self.postMessage({
            type: 'success',
            text: winnerText,
            words: winnerWords,
            numericText: numericText
        });

    } catch (error) {
        if (worker) {
            try { await worker.terminate(); } catch (e2) { /* noop */ }
        }
        self.postMessage({ type: 'error', msg: (error && error.message) || 'Errore OCR.' });
    }
};
