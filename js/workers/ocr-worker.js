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

    // ========================================================
    // LOAD IMAGE
    // ========================================================

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
        blob.size <= 0
    ) {
        throw new Error(
            'Immagine vuota.'
        );
    }

    /*
     * Ricaviamo le dimensioni reali.
     */
    var imageInfo =
        await getImageSize(
            blob
        );

    console.log(
        '[OCR] Image size:',
        imageInfo.width,
        'x',
        imageInfo.height
    );

    // ========================================================
    // CREATE TESSERACT
    // ========================================================

    reportStatus(
        'Avvio motore OCR italiano...'
    );

    activeWorker =
        await Tesseract.createWorker(
            language,
            1,
            {
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

    // ========================================================
    // GENERAL OCR
    // ========================================================

    await setGeneralParameters(
        activeWorker
    );

    reportStatus(
        'Lettura della struttura della busta paga...'
    );

    var generalResult =
        await activeWorker.recognize(
            blob
        );

    var generalData =
        extractStructuredResult(
            generalResult
        );

    console.log(
        '[OCR] General text:',
        generalData.text
    );

    console.log(
        '[OCR] General words:',
        generalData.words
    );

    // ========================================================
    // TARGETED NUMERIC OCR
    // ========================================================

    reportStatus(
        'Verifica dei valori numerici...'
    );

    var targeted =
        await extractTargetedFields(
            activeWorker,
            blob,
            imageInfo,
            generalData.words
        );

    console.log(
        '[OCR] Targeted fields:',
        targeted
    );

    // ========================================================
    // OPTIONAL SECOND GENERAL PASS
    // ========================================================

    /*
     * Solo se il OCR generale è particolarmente povero.
     *
     * Non usiamo PSM11 per decidere i numeri.
     */
    var finalText =
        generalData.text;

    if (
        !looksLikePayslip(
            finalText
        )
    ) {

        await setSparseParameters(
            activeWorker
        );

        var sparseResult =
            await activeWorker.recognize(
                blob
            );

        var sparseData =
            extractStructuredResult(
                sparseResult
            );

        if (
            sparseData.text.length >
            finalText.length
        ) {
            finalText =
                sparseData.text;
        }
    }

    // ========================================================
    // END
    // ========================================================

    await terminateWorker();

    self.postMessage({

        type:
            'success',

        text:
            finalText,

        words:
            generalData.words,

        confidence:
            generalData.confidence,

        fields:
            targeted
    });

} catch (error) {

    console.error(
        '[OCR] Errore:',
        error
    );

    await terminateWorker();

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
// IMAGE SIZE
// ================================================================

async function getImageSize(
blob
) {

```
if (
    typeof createImageBitmap ===
    'function'
) {

    var bitmap =
        await createImageBitmap(
            blob
        );

    try {

        return {
            width:
                bitmap.width,

            height:
                bitmap.height
        };

    } finally {

        try {
            bitmap.close();
        } catch (error) {}
    }
}

/*
 * Fallback ragionevole.
 */
return {
    width:
        2000,

    height:
        3000
};
```

}

// ================================================================
// GENERAL PARAMETERS
// ================================================================

async function setGeneralParameters(
worker
) {

```
await worker.setParameters({

    tessedit_pageseg_mode:
        '6',

    preserve_interword_spaces:
        '1',

    user_defined_dpi:
        '300',

    /*
     * Mantiene attivo il comportamento normale
     * per lettere + numeri.
     */
    tessedit_char_whitelist:
        ''
});
```

}

// ================================================================
// SPARSE PARAMETERS
// ================================================================

async function setSparseParameters(
worker
) {

```
await worker.setParameters({

    tessedit_pageseg_mode:
        '11',

    preserve_interword_spaces:
        '1',

    user_defined_dpi:
        '300',

    tessedit_char_whitelist:
        ''
});
```

}

// ================================================================
// TARGETED FIELDS
// ================================================================

async function extractTargetedFields(
worker,
blob,
imageInfo,
words
) {

```
var fields = {

    lordo:
        null,

    netto:
        null,

    ferie:
        null,

    tfr:
        null
};

if (
    !words ||
    !words.length
) {

    return fields;
}

// ------------------------------------------------------------
// LORDO
// ------------------------------------------------------------

fields.lordo =
    await readNumericField(
        worker,
        blob,
        imageInfo,
        words,
        [
            'totale lordo',
            'lordo totale',
            'retribuzione lorda',
            'lordo',
            'retribuzione'
        ],
        'money'
    );

// ------------------------------------------------------------
// NETTO
// ------------------------------------------------------------

fields.netto =
    await readNumericField(
        worker,
        blob,
        imageInfo,
        words,
        [
            'netto in busta',
            'netto da pagare',
            'netto a pagare',
            'netto pagato',
            'netto mensile',
            'netto'
        ],
        'money'
    );

// ------------------------------------------------------------
// FERIE
// ------------------------------------------------------------

fields.ferie =
    await readNumericField(
        worker,
        blob,
        imageInfo,
        words,
        [
            'ferie residue',
            'ferie resid',
            'ferie',
            'rol residue',
            'rol resid',
            'rol'
        ],
        'number'
    );

// ------------------------------------------------------------
// TFR
// ------------------------------------------------------------

fields.tfr =
    await readNumericField(
        worker,
        blob,
        imageInfo,
        words,
        [
            'fondo tfr',
            'tfr maturato',
            'tfr accantonato',
            'totale tfr',
            'tfr',
            'fondo'
        ],
        'money'
    );

return fields;
```

}

// ================================================================
// READ NUMERIC FIELD
// ================================================================

async function readNumericField(
worker,
blob,
imageInfo,
words,
labels,
type
) {

```
var labelWord =
    findLabel(
        words,
        labels
    );

if (!labelWord) {

    console.log(
        '[OCR] Label non trovata:',
        labels
    );

    return null;
}

/*
 * Creiamo una ROI orizzontale sulla stessa riga.
 */
var rectangle =
    createValueRectangle(
        labelWord,
        imageInfo.width,
        imageInfo.height
    );

if (!rectangle) {
    return null;
}

console.log(
    '[OCR] ROI',
    labels[0],
    rectangle
);

/*
 * ------------------------------------------------------------
 * PASS 1
 * ------------------------------------------------------------
 *
 * PSM 7 = single text line.
 *
 * Perfetto per:
 *
 * 2450,00
 * 1.980,00
 */
await worker.setParameters({

    tessedit_pageseg_mode:
        '7',

    tessedit_char_whitelist:
        '0123456789,.-',

    preserve_interword_spaces:
        '0',

    user_defined_dpi:
        '300'
});

var result =
    await worker.recognize(
        blob,
        {
            rectangle:
                rectangle
        }
    );

var text =
    extractText(
        result
    );

var candidates =
    extractNumbers(
        text
    );

console.log(
    '[OCR] Numeric ROI',
    labels[0],
    ':',
    text,
    candidates
);

/*
 * Se troviamo un numero, lo validiamo.
 */
var selected =
    chooseNumericCandidate(
        candidates,
        type
    );

if (
    selected !== null
) {

    return selected;
}

/*
 * ------------------------------------------------------------
 * PASS 2
 * ------------------------------------------------------------
 *
 * Aumentiamo leggermente l'altezza della ROI e usiamo PSM 6.
 */
var widerRectangle =
    createWiderRectangle(
        rectangle,
        imageInfo.width,
        imageInfo.height
    );

await worker.setParameters({

    tessedit_pageseg_mode:
        '6',

    tessedit_char_whitelist:
        '0123456789,.-',

    preserve_interword_spaces:
        '0',

    user_defined_dpi:
        '300'
});

var result2 =
    await worker.recognize(
        blob,
        {
            rectangle:
                widerRectangle
        }
    );

var text2 =
    extractText(
        result2
    );

var candidates2 =
    extractNumbers(
        text2
    );

console.log(
    '[OCR] Numeric ROI pass2',
    labels[0],
    ':',
    text2,
    candidates2
);

return chooseNumericCandidate(
    candidates2,
    type
);
```

}

// ================================================================
// LABEL DETECTION
// ================================================================

function findLabel(
words,
labels
) {

```
/*
 * Primo tentativo:
 * parola esatta.
 */
for (
    var i = 0;
    i < labels.length;
    i++
) {

    var label =
        normalizeText(
            labels[i]
        );

    for (
        var j = 0;
        j < words.length;
        j++
    ) {

        var word =
            normalizeText(
                words[j].text
            );

        if (
            word.indexOf(
                label
            ) !== -1 ||
            label.indexOf(
                word
            ) !== -1
        ) {

            return words[j];
        }
    }
}

/*
 * Secondo tentativo:
 * individua una singola parola chiave.
 */
for (
    var k = 0;
    k < labels.length;
    k++
) {

    var tokens =
        normalizeText(
            labels[k]
        ).split(' ');

    for (
        var t = 0;
        t < tokens.length;
        t++
    ) {

        if (
            tokens[t].length < 4
        ) {
            continue;
        }

        for (
            var w = 0;
            w < words.length;
            w++
        ) {

            var current =
                normalizeText(
                    words[w].text
                );

            if (
                current.indexOf(
                    tokens[t]
                ) !== -1
            ) {

                return words[w];
            }
        }
    }
}

return null;
```

}

// ================================================================
// VALUE RECTANGLE
// ================================================================

function createValueRectangle(
label,
imageWidth,
imageHeight
) {

```
if (
    !label
) {
    return null;
}

var labelWidth =
    Math.max(
        1,
        label.x1 -
        label.x0
    );

var labelHeight =
    Math.max(
        1,
        label.y1 -
        label.y0
    );

/*
 * La ROI parte subito dopo la label.
 *
 * Altezza:
 * circa 2.2x l'altezza del testo.
 */
var left =
    Math.max(
        0,
        Math.round(
            label.x1 + 3
        )
    );

var top =
    Math.max(
        0,
        Math.round(
            label.y0 -
            labelHeight * 0.60
        )
    );

var rightPadding =
    Math.max(
        5,
        Math.round(
            imageWidth * 0.015
        )
    );

var width =
    imageWidth -
    left -
    rightPadding;

var height =
    Math.max(
        30,
        Math.round(
            labelHeight * 2.2
        )
    );

/*
 * Se la label è très proche do bordo,
 * evitamos rectangle nul.
 */
if (
    width < 50
) {
    return null;
}

if (
    top + height >
    imageHeight
) {
    height =
        imageHeight -
        top;
}

if (
    height < 15
) {
    return null;
}

return {

    left:
        left,

    top:
        top,

    width:
        Math.round(
            width
        ),

    height:
        Math.round(
            height
        )
};
```

}

// ================================================================
// WIDER RECTANGLE
// ================================================================

function createWiderRectangle(
rectangle,
imageWidth,
imageHeight
) {

```
var extra =
    Math.round(
        rectangle.height * 0.8
    );

var top =
    Math.max(
        0,
        rectangle.top -
        extra
    );

var bottom =
    Math.min(
        imageHeight,
        rectangle.top +
        rectangle.height +
        extra
    );

return {

    left:
        rectangle.left,

    top:
        top,

    width:
        rectangle.width,

    height:
        bottom -
        top
};
```

}

// ================================================================
// EXTRACT NUMBERS
// ================================================================

function extractNumbers(
text
) {

```
if (
    !text
) {
    return [];
}

/*
 * Convertiamo separatori strani tipici OCR.
 */
var value =
    String(text)
        .replace(
            /O/gi,
            '0'
        )
        .replace(
            /I/g,
            '1'
        )
        .replace(
            /l/g,
            '1'
        );

/*
 * Formati accettati:
 *
 * 2450,00
 * 2.450,00
 * 2450.00
 * 12.500,50
 */
var matches =
    value.match(
        /\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}|\d{1,7}[,.]\d{2}|\d{1,7}/g
    );

if (
    !matches
) {
    return [];
}

var result = [];

for (
    var i = 0;
    i < matches.length;
    i++
) {

    var parsed =
        parseOCRNumber(
            matches[i]
        );

    if (
        parsed !== null
    ) {

        result.push(
            parsed
        );
    }
}

return result;
```

}

// ================================================================
// PARSE OCR NUMBER
// ================================================================

function parseOCRNumber(
token
) {

```
if (
    token === null ||
    token === undefined
) {
    return null;
}

var value =
    String(
        token
    )
    .trim()
    .replace(
        /\s/g,
        ''
    );

if (
    !value
) {
    return null;
}

/*
 * 2.450,00
 */
if (
    value.indexOf('.') !== -1 &&
    value.indexOf(',') !== -1
) {

    if (
        value.lastIndexOf(',') >
        value.lastIndexOf('.')
    ) {

        value =
            value.replace(
                /\./g,
                ''
            );

        value =
            value.replace(
                ',',
                '.'
            );

    } else {

        value =
            value.replace(
                /,/g,
                ''
            );
    }

} else if (
    value.indexOf(',') !== -1
) {

    value =
        value.replace(
            ',',
            '.'
        );
}

var number =
    Number(value);

if (
    !Number.isFinite(
        number
    )
) {
    return null;
}

return Math.round(
    number * 100
) / 100;
```

}

// ================================================================
// CHOOSE NUMERIC CANDIDATE
// ================================================================

function chooseNumericCandidate(
candidates,
type
) {

```
if (
    !candidates ||
    !candidates.length
) {
    return null;
}

/*
 * Money:
 * prefer decimal values.
 */
if (
    type === 'money'
) {

    var monetary =
        candidates.filter(
            function (value) {
                return (
                    Number.isFinite(
                        value
                    ) &&
                    value > 0 &&
                    value < 10000000
                );
            }
        );

    if (
        monetary.length
    ) {

        /*
         * Normalmente il primo valore della ROI
         * è quello corretto.
         */
        return monetary[0];
    }
}

/*
 * Ferie:
 * il valore più piccolo > 0 è normalmente
 * il numero di ore.
 */
if (
    type === 'number'
) {

    var hours =
        candidates.filter(
            function (value) {
                return (
                    Number.isFinite(
                        value
                    ) &&
                    value >= 0 &&
                    value <= 1000
                );
            }
        );

    if (
        hours.length
    ) {
        return hours[0];
    }
}

return null;
```

}

// ================================================================
// STRUCTURED RESULT
// ================================================================

function extractStructuredResult(
result
) {

```
if (
    !result ||
    !result.data
) {

    return {
        text: '',
        confidence: 0,
        words: []
    };
}

var text =
    typeof result.data.text ===
    'string'
        ? result.data.text
        : '';

var confidence =
    Number(
        result.data.confidence
    );

if (
    !Number.isFinite(
        confidence
    )
) {
    confidence = 0;
}

var words = [];

if (
    Array.isArray(
        result.data.words
    )
) {

    words =
        result.data.words
            .map(
                function (word) {

                    var bbox =
                        word.bbox ||
                        {};

                    return {

                        text:
                            String(
                                word.text ||
                                ''
                            ),

                        confidence:
                            Number(
                                word.confidence
                            ) || 0,

                        x0:
                            Number(
                                bbox.x0
                            ) || 0,

                        y0:
                            Number(
                                bbox.y0
                            ) || 0,

                        x1:
                            Number(
                                bbox.x1
                            ) || 0,

                        y1:
                            Number(
                                bbox.y1
                            ) || 0
                    };
                }
            )
            .filter(
                function (word) {
                    return (
                        word.text &&
                        word.text.trim()
                    );
                }
            );
}

return {

    text:
        text,

    confidence:
        confidence,

    words:
        words
};
```

}

// ================================================================
// TEXT
// ================================================================

function extractText(
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
    ? result.data.text.trim()
    : '';
```

}

// ================================================================
// TEXT NORMALIZATION
// ================================================================

function normalizeText(
text
) {

```
return String(
    text || ''
)
    .toLowerCase()
    .normalize('NFD')
    .replace(
        /[\u0300-\u036f]/g,
        ''
    )
    .replace(
        /[^a-z0-9]+/g,
        ' '
    )
    .replace(
        /\s+/g,
        ' '
    )
    .trim();
```

}

// ================================================================
// PAYSLIP DETECTION
// ================================================================

function looksLikePayslip(
text
) {

```
if (
    !text
) {
    return false;
}

var normalized =
    normalizeText(
        text
    );

var count = 0;

var keywords = [
    'lordo',
    'netto',
    'retribuzione',
    'ferie',
    'tfr',
    'inps',
    'irpef',
    'contributi',
    'ritenute',
    'paga'
];

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
        count++;
    }
}

return count >= 2;
```

}

// ================================================================
// TERMINATE
// ================================================================

async function terminateWorker() {

```
if (
    !activeWorker
) {
    return;
}

try {

    await activeWorker.terminate();

} catch (error) {}

activeWorker =
    null;
```

}
