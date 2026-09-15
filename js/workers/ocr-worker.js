'use strict';

importScripts(
'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
);

var activeWorker = null;

self.onmessage = async function (event) {

```
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
        'Preparazione del documento...'
    );

    var response =
        await fetch(
            imageBlobUrl
        );

    if (!response.ok) {
        throw new Error(
            'Impossibile leggere l immagine.'
        );
    }

    var blob =
        await response.blob();

    if (
        !blob ||
        blob.size === 0
    ) {
        throw new Error(
            'Immagine vuota.'
        );
    }

    /*
     * Importante:
     *
     * NON alteriamo i pixel.
     *
     * Le cifre devono restare fedeli.
     */
    var imageForOCR =
        blob;

    reportStatus(
        'Avvio motore OCR italiano...'
    );

    /*
     * Tesseract.js v5:
     *
     * langPath -> directory contenente i language data
     * corePath -> directory contenente tutti i core builds
     *
     * I dataset 4.0.0_best_int sono i dati LSTM
     * utilizzati come default per OEM 1.
     */
    activeWorker =
        await Tesseract.createWorker(
            language,
            1,
            {
                langPath:
                    'https://cdn.jsdelivr.net/npm/@tesseract.js-data/ita@1.0.0/4.0.0_best_int',

                corePath:
                    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',

                logger:
                    function (message) {

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
                                type:
                                    'progress',

                                pct:
                                    Math.round(
                                        progress *
                                        100
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
     * ======================================================
     * PSM 6
     * ======================================================
     */

    await activeWorker.setParameters({

        tessedit_pageseg_mode:
            '6',

        preserve_interword_spaces:
            '1',

        user_defined_dpi:
            '300'
    });

    reportStatus(
        'Lettura principale della busta paga...'
    );

    var result6 =
        await activeWorker.recognize(
            imageForOCR
        );

    var text6 =
        getText(
            result6
        );

    var confidence6 =
        getConfidence(
            result6
        );

    /*
     * ======================================================
     * PSM 11
     * ======================================================
     */

    await activeWorker.setParameters({

        tessedit_pageseg_mode:
            '11',

        preserve_interword_spaces:
            '1',

        user_defined_dpi:
            '300'
    });

    reportStatus(
        'Controllo del layout della busta paga...'
    );

    var result11 =
        await activeWorker.recognize(
            imageForOCR
        );

    var text11 =
        getText(
            result11
        );

    var confidence11 =
        getConfidence(
            result11
        );

    /*
     * ======================================================
     * SELEZIONE
     * ======================================================
     */

    var selected =
        selectResult(
            text6,
            confidence6,
            text11,
            confidence11
        );

    console.log(
        '[OCR] PSM6 confidence:',
        confidence6
    );

    console.log(
        '[OCR] PSM11 confidence:',
        confidence11
    );

    console.log(
        '[OCR] PSM6 text:',
        text6
    );

    console.log(
        '[OCR] PSM11 text:',
        text11
    );

    console.log(
        '[OCR] Risultato scelto:',
        selected
    );

    await terminate();

    self.postMessage({
        type:
            'success',

        text:
            selected
    });

} catch (error) {

    console.error(
        '[OCR] Errore:',
        error
    );

    await terminate();

    self.postMessage({
        type:
            'error',

        msg:
            error &&
            error.message
                ? error.message
                : 'Errore OCR.'
    });
}
```

};

// ================================================================
// STATUS
// ================================================================

function reportStatus(
message
) {

```
try {

    self.postMessage({
        type:
            'status',

        msg:
            String(
                message || ''
            )
    });

} catch (error) {}
```

}

// ================================================================
// TEXT
// ================================================================

function getText(
result
) {

```
if (
    !result ||
    !result.data
) {
    return '';
}

return typeof result.data.text ===
    'string'
    ? result.data.text
    : '';
```

}

// ================================================================
// CONFIDENCE
// ================================================================

function getConfidence(
result
) {

```
if (
    !result ||
    !result.data
) {
    return 0;
}

var value =
    Number(
        result.data.confidence
    );

return Number.isFinite(value)
    ? value
    : 0;
```

}

// ================================================================
// RESULT SELECTION
// ================================================================

function selectResult(
text6,
confidence6,
text11,
confidence11
) {

```
/*
 * Per una busta paga, preferiamo PSM6 quando
 * confidence e qualità sono equivalenti, perché
 * il layout è normalmente tabellare/strutturato.
 */

var score6 =
    scoreText(
        text6,
        confidence6
    );

var score11 =
    scoreText(
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
    return text11;
}

return text6;
```

}

// ================================================================
// OCR SCORE
// ================================================================

function scoreText(
text,
confidence
) {

```
if (
    !text ||
    !text.trim()
) {
    return 0;
}

var value =
    String(text);

var lower =
    value.toLowerCase();

var score =
    Number(confidence) * 0.35;

/*
 * Etichette tipiche.
 */
var keywords = [
    'lordo',
    'netto',
    'retribuzione',
    'ferie',
    'tfr',
    'inps',
    'irpef',
    'ritenut',
    'contribut',
    'paga',
    'pagare',
    'totale',
    'fondo'
];

for (
    var i = 0;
    i < keywords.length;
    i++
) {

    if (
        lower.indexOf(
            keywords[i]
        ) !== -1
    ) {
        score += 8;
    }
}

/*
 * Valori monetari.
 */
var amounts =
    value.match(
        /\b\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{2})\b/g
    );

if (amounts) {

    score +=
        Math.min(
            35,
            amounts.length * 7
        );
}

/*
 * Bonus per concetti chiave.
 */
var concepts = [
    'lordo',
    'netto',
    'ferie',
    'tfr'
];

var conceptCount = 0;

for (
    var j = 0;
    j < concepts.length;
    j++
) {

    if (
        lower.indexOf(
            concepts[j]
        ) !== -1
    ) {
        conceptCount++;
    }
}

score +=
    conceptCount * 6;

return score;
```

}

// ================================================================
// TERMINATE
// ================================================================

async function terminate() {

```
if (
    !activeWorker
) {
    return;
}

try {

    await activeWorker.terminate();

} catch (error) {

    console.warn(
        '[OCR] Errore terminazione:',
        error
    );
}

activeWorker =
    null;
```

}
