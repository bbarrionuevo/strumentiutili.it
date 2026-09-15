/*
 * js/workers/ocr-worker.js
 * 
 * OCR client-side per buste paga italiane.
 * Tesseract.js 5
 * niente langPath manuale
 * niente corePath manuale
 * nessun filtro aggressivo
 * upscale leggero solo se necessario
 * doppio PSM: 6 e 11
 * scelta automatica del risultato migliore
 */

'use strict';

importScripts(
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
);

var activeTesseractWorker = null;

// ================================================================
// MESSAGE
// ================================================================
self.onmessage = async function (event) {

    var data = event.data || {};

    var imageBlobUrl =
        data.imageBlobUrl || '';

    var language =
        data.lang || 'ita';

    if (!imageBlobUrl) {
        self.postMessage({
            type: 'error',
            msg: 'Nessuna immagine ricevuta dal worker.'
        });
        return;
    }

    try {
        reportStatus('Preparazione immagine...');

        var originalBlob =
            await fetchImageBlob(
                imageBlobUrl
            );

        /*
         * Nessuna alterazione aggressiva.
         * Manteniamo fedeli numeri, virgole e zeri.
         */
        var ocrInput =
            await prepareImage(
                originalBlob
            );

        reportStatus('Avvio motore OCR italiano...');

        activeTesseractWorker =
            await Tesseract.createWorker(
                language,
                1,
                {
                    logger: function (message) {
                        if (!message) {
                            return;
                        }

                        if (
                            message.status ===
                            'recognizing text'
                        ) {
                            var progress =
                                Number(
                                    message.progress
                                ) || 0;

                            self.postMessage({
                                type: 'progress',
                                pct: Math.round(
                                    progress * 100
                                )
                            });
                        } else if (
                            message.status
                        ) {
                            reportStatus(
                                String(
                                    message.status
                                )
                            );
                        }
                    }
                }
            );

        // ========================================================
        // PSM 6
        // ========================================================

        await configureOCR(
            activeTesseractWorker,
            '6'
        );

        reportStatus('Lettura della busta paga...');

        var result6 =
            await activeTesseractWorker.recognize(
                ocrInput
            );

        var text6 =
            extractText(
                result6
            );

        var confidence6 =
            extractConfidence(
                result6
            );

        // ========================================================
        // PSM 11
        // ========================================================

        await configureOCR(
            activeTesseractWorker,
            '11'
        );

        reportStatus('Verifica del layout del documento...');

        var result11 =
            await activeTesseractWorker.recognize(
                ocrInput
            );

        var text11 =
            extractText(
                result11
            );

        var confidence11 =
            extractConfidence(
                result11
            );

        // ========================================================
        // SELEZIONE
        // ========================================================

        var selected =
            chooseBestResult(
                text6,
                confidence6,
                text11,
                confidence11
            );

        console.log('[OCR] PSM6 confidence:', confidence6);
        console.log('[OCR] PSM11 confidence:', confidence11);
        console.log('[OCR] PSM6 text:', text6);
        console.log('[OCR] PSM11 text:', text11);
        console.log('[OCR] Risultato scelto:', selected.text);

        await terminateTesseractWorker();

        self.postMessage({
            type: 'success',
            text: selected.text
        });

    } catch (error) {
        console.error('[OCR] Errore:', error);

        await terminateTesseractWorker();

        self.postMessage({
            type: 'error',
            msg:
                error &&
                error.message
                    ? error.message
                    : 'Errore OCR sconosciuto.'
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
            msg: String(
                message || ''
            )
        });
    } catch (error) {
        console.warn(
            '[OCR] Impossibile inviare status:',
            error
        );
    }
}

// ================================================================
// FETCH
// ================================================================
async function fetchImageBlob(url) {
    var response =
        await fetch(
            url
        );

    if (!response.ok) {
        throw new Error(
            'Impossibile leggere il file immagine.'
        );
    }

    var blob =
        await response.blob();

    if (
        !blob ||
        blob.size <= 0
    ) {
        throw new Error(
            'Il file immagine è vuoto.'
        );
    }

    return blob;
}

// ================================================================
// PREPARE IMAGE
// ================================================================
async function prepareImage(blob) {
    /*
     * Se il browser non supporta OffscreenCanvas,
     * restituiamo direttamente il Blob.
     */
    if (
        typeof createImageBitmap !==
        'function'
    ) {
        return blob;
    }

    if (
        typeof OffscreenCanvas ===
        'undefined'
    ) {
        return blob;
    }

    var bitmap =
        await createImageBitmap(
            blob
        );

    try {
        var sourceWidth =
            bitmap.width;

        var sourceHeight =
            bitmap.height;

        /*
         * Se l'immagine è già abbastanza grande,
         * NON la modifichiamo.
         *
         * Questo è particolarmente importante
         * per importi come:
         *
         * 2450,00
         * 12.500,50
         * 1.980,00
         */
        if (
            sourceWidth >= 1800
        ) {
            return blob;
        }

        /*
         * Upscale moderato.
         */
        var targetWidth =
            1800;

        if (
            targetWidth >
            2400
        ) {
            targetWidth = 2400;
        }

        var scale =
            targetWidth /
            sourceWidth;

        if (
            scale <= 1
        ) {
            return blob;
        }

        var targetHeight =
            Math.round(
                sourceHeight *
                scale
            );

        /*
         * Limite memoria.
         */
        if (
            targetHeight > 3600
        ) {
            scale =
                3600 /
                sourceHeight;

            targetWidth =
                Math.round(
                    sourceWidth *
                    scale
                );

            targetHeight =
                3600;
        }

        var canvas =
            new OffscreenCanvas(
                targetWidth,
                targetHeight
            );

        var context =
            canvas.getContext(
                '2d',
                {
                    alpha: false
                }
            );

        if (!context) {
            return blob;
        }

        context.imageSmoothingEnabled =
            true;

        context.imageSmoothingQuality =
            'high';

        context.fillStyle =
            '#ffffff';

        context.fillRect(
            0,
            0,
            targetWidth,
            targetHeight
        );

        /*
         * SOLO upscale.
         */
        context.drawImage(
            bitmap,
            0,
            0,
            targetWidth,
            targetHeight
        );

        return await canvas.convertToBlob({
            type:
                'image/png'
        });

    } finally {
        try {
            bitmap.close();
        } catch (error) {}
    }
}

// ================================================================
// TESSERACT CONFIG
// ================================================================
async function configureOCR(worker, psm) {
    if (
        !worker ||
        typeof worker.setParameters !==
        'function'
    ) {
        return;
    }

    await worker.setParameters({
        tessedit_pageseg_mode:
            String(psm),

        preserve_interword_spaces:
            '1',

        user_defined_dpi:
            '300'
    });
}

// ================================================================
// TEXT
// ================================================================
function extractText(result) {
    if (
        !result ||
        !result.data
    ) {
        return '';
    }

    if (
        typeof result.data.text ===
        'string'
    ) {
        return result.data.text;
    }

    return '';
}

// ================================================================
// CONFIDENCE
// ================================================================
function extractConfidence(result) {
    if (
        !result ||
        !result.data
    ) {
        return 0;
    }

    var confidence =
        Number(
            result.data.confidence
        );

    if (
        Number.isFinite(
            confidence
        )
    ) {
        return confidence;
    }

    return 0;
}

// ================================================================
// CHOOSE RESULT
// ================================================================
function chooseBestResult(
    text6,
    confidence6,
    text11,
    confidence11
) {
    var score6 =
        scoreOCR(
            text6,
            confidence6
        );

    var score11 =
        scoreOCR(
            text11,
            confidence11
        );

    console.log(
        '[OCR] Score PSM6:',
        score6
    );

    console.log(
        '[OCR] Score PSM11:',
        score11
    );

    if (
        score11 >
        score6
    ) {
        return {
            text:
                text11,
            score:
                score11
        };
    }

    return {
        text:
            text6,
        score:
            score6
    };
}

// ================================================================
// OCR SCORE
// ================================================================
function scoreOCR(text, confidence) {
    if (
        !text ||
        !text.trim()
    ) {
        return 0;
    }

    var value =
        String(text);

    var normalized =
        value.toLowerCase();

    /*
     * Confidence Tesseract.
     */
    var confidenceScore =
        Math.max(
            0,
            Math.min(
                30,
                Number(confidence) *
                0.30
            )
        );

    /*
     * Vocabolario tipico busta paga.
     */
    var keywords = [
        'lordo',
        'netto',
        'retribuzione',
        'ferie',
        'tfr',
        'inps',
        'irpef',
        'contribut',
        'ritenut',
        'paga',
        'pagare',
        'competenze',
        'mese',
        'stipend',
        'totale',
        'fondo'
    ];

    var keywordScore = 0;

    for (
        var i = 0;
        i < keywords.length;
        i++
    ) {
        if (
            normalized.indexOf(
                keywords[i]
            ) !== -1
        ) {
            keywordScore += 7;
        }
    }

    /*
     * Importi monetari.
     */
    var amountMatches =
        value.match(
            /\b\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{2})\b/g
        );

    var amountScore =
        amountMatches
            ? Math.min(
                35,
                amountMatches.length * 7
            )
            : 0;

    /*
     * Bonus se compaiono più concetti chiave.
     */
    var conceptCount = 0;

    if (
        normalized.indexOf('lordo') !== -1
    ) {
        conceptCount++;
    }

    if (
        normalized.indexOf('netto') !== -1
    ) {
        conceptCount++;
    }

    if (
        normalized.indexOf('ferie') !== -1
    ) {
        conceptCount++;
    }

    if (
        normalized.indexOf('tfr') !== -1
    ) {
        conceptCount++;
    }

    var conceptScore =
        conceptCount * 5;

    return (
        confidenceScore +
        keywordScore +
        amountScore +
        conceptScore
    );
}

// ================================================================
// TERMINATE
// ================================================================
async function terminateTesseractWorker() {
    if (
        !activeTesseractWorker
    ) {
        return;
    }

    try {
        await activeTesseractWorker.terminate();
    } catch (error) {
        console.warn(
            '[OCR] Errore chiusura worker Tesseract:',
            error
        );
    }

    activeTesseractWorker =
        null;
}