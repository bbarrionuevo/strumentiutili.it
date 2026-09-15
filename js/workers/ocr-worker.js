/*
 * js/workers/ocr-worker.js
 *
 * OCR client-side per buste paga italiane.
 *
 * Principi:
 * * Tesseract.js 5
 * * nessun langPath manuale
 * * nessun corePath manuale
 * * niente sharpen aggressivo
 * * niente binarizzazione
 * * upscale leggero solo quando necessario
 * * doppio PSM: 6 e 11
 * * selezione automatica del risultato migliore
 */

'use strict';

importScripts(
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
);

var activeWorker = null;

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
            msg: 'Nessuna immagine ricevuta.'
        });
        return;
    }

    try {
        reportStatus(
            'Preparazione immagine...'
        );

        /*
         * Recuperiamo il Blob.
         */
        var originalBlob =
            await fetchBlob(
                imageBlobUrl
            );

        /*
         * NON facciamo sharpen, threshold o contrasto aggressivo.
         *
         * Questo è importante per numeri come:
         *
         * 2450,00
         * 12500,50
         * 1980,00
         */
        var ocrImage =
            await prepareImage(
                originalBlob
            );

        reportStatus(
            'Avvio motore OCR italiano...'
        );

        /*
         * Tesseract.js 5:
         *
         * Lasciamo che la libreria gestisca
         * language data e core automaticamente.
         *
         * Questo evita il problema:
         *
         * ita.special-words
         */
        activeWorker =
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
                            self.postMessage({
                                type: 'progress',
                                pct:
                                    Math.round(
                                        (
                                            Number(
                                                message.progress
                                            ) || 0
                                        ) * 100
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

        /*
         * ========================================================
         * PSM 6
         * ========================================================
         *
         * Layout abbastanza regolare.
         * Molto adatto alle buste paga.
         */
        await setOCRParameters(
            activeWorker,
            '6'
        );

        reportStatus(
            'Lettura della busta paga...'
        );

        var result6 =
            await activeWorker.recognize(
                ocrImage
            );

        var text6 =
            getOCRText(
                result6
            );

        var confidence6 =
            getOCRConfidence(
                result6
            );

        /*
         * ========================================================
         * PSM 11
         * ========================================================
         *
         * Testo sparso / colonne / layout più irregolare.
         */
        await setOCRParameters(
            activeWorker,
            '11'
        );

        reportStatus(
            'Verifica del layout del documento...'
        );

        var result11 =
            await activeWorker.recognize(
                ocrImage
            );

        var text11 =
            getOCRText(
                result11
            );

        var confidence11 =
            getOCRConfidence(
                result11
            );

        /*
         * ========================================================
         * SCELTA DEL RISULTATO
         * ========================================================
         */

        var best =
            chooseBestResult(
                text6,
                confidence6,
                text11,
                confidence11
            );

        consoleLog(
            '[OCR] PSM 6 confidence:',
            confidence6
        );

        consoleLog(
            '[OCR] PSM 11 confidence:',
            confidence11
        );

        consoleLog(
            '[OCR] PSM 6 text:',
            text6
        );

        consoleLog(
            '[OCR] PSM 11 text:',
            text11
        );

        consoleLog(
            '[OCR] Risultato scelto:',
            best.text
        );

        await terminateWorker();

        self.postMessage({
            type: 'success',
            text: best.text
        });

    } catch (error) {
        consoleLog(
            '[OCR] Errore:',
            error
        );

        await terminateWorker();

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
// FETCH
// ================================================================

async function fetchBlob(url) {
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
     * Se il browser supporta ImageBitmap + OffscreenCanvas,
     * facciamo SOLO un eventuale upscale leggero.
     *
     * Nessuna alterazione dei pixel.
     */
    if (
        typeof createImageBitmap !==
        'function' ||
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
        var width =
            bitmap.width;

        var height =
            bitmap.height;

        /*
         * Per OCR, se l'immagine è piccola,
         * aumentiamo moderatamente la dimensione.
         *
         * Non facciamo upscale se l'immagine è già grande.
         */
        var targetWidth =
            width;

        if (
            width < 1800
        ) {
            targetWidth =
                1800;
        }

        if (
            targetWidth > 2400
        ) {
            targetWidth =
                2400;
        }

        var scale =
            targetWidth /
            width;

        /*
         * Nessun downscale.
         */
        if (
            scale <= 1
        ) {
            return blob;
        }

        var targetHeight =
            Math.round(
                height *
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
                height;

            targetWidth =
                Math.round(
                    width *
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

        /*
         * IMPORTANTE:
         *
         * Nessun getImageData().
         * Nessun sharpen.
         * Nessun contrasto artificiale.
         * Nessun threshold.
         */
        context.imageSmoothingEnabled =
            true;

        context.imageSmoothingQuality =
            'high';

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
// TESSERACT PARAMETERS
// ================================================================

async function setOCRParameters(worker, psm) {
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

        /*
         * Mantiene gli spazi tra colonne/blocchi
         * quando Tesseract li riconosce.
         */
        preserve_interword_spaces:
            '1',

        /*
         * Valore DPI usato da Tesseract.
         */
        user_defined_dpi:
            '300'
    });
}

// ================================================================
// TEXT
// ================================================================

function getOCRText(result) {
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

function getOCRConfidence(result) {
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

    consoleLog(
        '[OCR] Score PSM6:',
        score6
    );

    consoleLog(
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
     * Confidence.
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
     * Parole tipiche di busta paga.
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
            keywordScore +=
                7;
        }
    }

    /*
     * Importi italiani:
     *
     * 2450,00
     * 2.450,00
     * 12.500,50
     */
    var amountMatches =
        value.match(
            /\b\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{2})\b/g
        );

    var amountScore =
        amountMatches
            ? Math.min(
                35,
                amountMatches.length *
                7
            )
            : 0;

    /*
     * Penalizza testo estremamente rumoroso.
     */
    var strangeCharacters =
        (
            value.match(
                /[^a-zA-Z0-9À-ÿ€$£.,:;()\-\s/]/g
            ) || []
        ).length;

    var noisePenalty =
        Math.min(
            15,
            strangeCharacters * 0.15
        );

    return (
        confidenceScore +
        keywordScore +
        amountScore -
        noisePenalty
    );
}

// ================================================================
// TERMINATE
// ================================================================

async function terminateWorker() {
    if (
        !activeWorker
    ) {
        return;
    }

    try {
        await activeWorker.terminate();
    } catch (error) {
        consoleLog(
            '[OCR] Errore terminate:',
            error
        );
    }

    activeWorker =
        null;
}

// ================================================================
// CONSOLE
// ================================================================

function consoleLog() {
    try {
        if (
            typeof console !==
            'undefined' &&
            typeof console.log ===
            'function'
        ) {
            console.log.apply(
                console,
                arguments
            );
        }
    } catch (error) {}
}