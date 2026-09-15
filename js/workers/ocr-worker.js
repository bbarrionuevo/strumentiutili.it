/*
 * js/workers/ocr-worker.js
 * Motore OCR Spaziale (Zero-Backend)
 */
'use strict';

importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');

// Silenciamos los errores internos de WebAssembly (como ita.special-words)
var originalConsoleError = console.error;
console.error = function() {
    if (arguments[0] && typeof arguments[0] === 'string' && arguments[0].includes('special-words')) return;
    originalConsoleError.apply(console, arguments);
};

self.onmessage = async function (event) {
    var data = event.data || {};
    if (!data.imageBlobUrl) return self.postMessage({ type: 'error', msg: 'Immagine mancante.' });

    try {
        self.postMessage({ type: 'status', msg: 'Preparazione immagine...' });
        var response = await fetch(data.imageBlobUrl);
        var blob = await response.blob();

        self.postMessage({ type: 'status', msg: 'Avvio motore OCR...' });
        
        var worker = await Tesseract.createWorker(data.lang || 'ita', 1, {
            logger: m => {
                if (m && m.status === 'recognizing text') {
                    self.postMessage({ type: 'progress', pct: Math.round((Number(m.progress) || 0) * 100) });
                }
            }
        });

        await worker.setParameters({
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1'
        });

        self.postMessage({ type: 'status', msg: 'Estrazione coordinate spaziali...' });
        var result = await worker.recognize(blob);
        
        var words = (result.data.words || []).map(w => ({
            text: w.text || '',
            confidence: w.confidence || 0,
            x0: w.bbox ? w.bbox.x0 : 0,
            y0: w.bbox ? w.bbox.y0 : 0,
            x1: w.bbox ? w.bbox.x1 : 0,
            y1: w.bbox ? w.bbox.y1 : 0
        })).filter(w => w.text.trim().length > 0);

        await worker.terminate();

        self.postMessage({
            type: 'success',
            text: result.data.text || '',
            words: words
        });

    } catch (error) {
        self.postMessage({ type: 'error', msg: error.message || 'Errore OCR.' });
    }
};