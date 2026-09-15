```js
function parseBustaPaga(ocrResult) {

    var result = {
        lordo: null,
        netto: null,
        ferie: null,
        tfr: null
    };

    if (!ocrResult) {
        return result;
    }

    /*
     * ============================================================
     * 1. PRIORITÀ ASSOLUTA:
     *    OCR NUMERICO MIRATO
     * ============================================================
     */

    if (
        ocrResult.fields &&
        typeof ocrResult.fields === 'object'
    ) {

        var fields =
            ocrResult.fields;

        if (
            Number.isFinite(
                Number(fields.lordo)
            )
        ) {
            result.lordo =
                Number(fields.lordo);
        }

        if (
            Number.isFinite(
                Number(fields.netto)
            )
        ) {
            result.netto =
                Number(fields.netto);
        }

        if (
            Number.isFinite(
                Number(fields.ferie)
            )
        ) {
            result.ferie =
                Number(fields.ferie);
        }

        if (
            Number.isFinite(
                Number(fields.tfr)
            )
        ) {
            result.tfr =
                Number(fields.tfr);
        }
    }


    /*
     * ============================================================
     * 2. FALLBACK:
     *    SPATIAL OCR GENERALE
     * ============================================================
     */

    var words =
        Array.isArray(ocrResult.words)
            ? ocrResult.words
            : [];

    if (words.length > 0) {

        if (result.lordo === null) {
            result.lordo =
                findValueSpatially(
                    words,
                    [
                        'lordo',
                        'retribuzione',
                        'lardo'
                    ]
                );
        }

        if (result.netto === null) {
            result.netto =
                findValueSpatially(
                    words,
                    [
                        'netto',
                        'pagare'
                    ]
                );
        }

        if (result.ferie === null) {
            result.ferie =
                findValueSpatially(
                    words,
                    [
                        'ferie',
                        'rol'
                    ]
                );
        }

        if (result.tfr === null) {
            result.tfr =
                findValueSpatially(
                    words,
                    [
                        'tfr',
                        'fondo'
                    ]
                );
        }
    }


    /*
     * ============================================================
     * 3. FALLBACK TESTUALE
     * ============================================================
     *
     * ATTENZIONE:
     * non facciamo inferenze per il NETTO.
     *
     * Questo evita il vecchio problema:
     *
     * 2450 lordo
     * 19886,80 -> interpretato come netto
     */

    var text =
        ocrResult.text || '';

    var numericText =
        ocrResult.numericText || '';

    var combinedText =
        normalizeOcrText(
            text +
            '\n' +
            numericText
        );


    if (result.lordo === null) {

        result.lordo =
            findAmountNearLabels(
                combinedText,
                [
                    'lordo',
                    'retribuzione'
                ]
            );
    }

    /*
     * Per il NETTO NON facciamo:
     *
     * inferNetFromAmounts()
     *
     * perché è proprio ciò che può trasformare
     * un numero OCR sbagliato in un dato apparentemente valido.
     */

    if (result.netto === null) {

        result.netto =
            findAmountNearLabels(
                combinedText,
                [
                    'netto',
                    'pagare'
                ]
            );
    }


    if (result.tfr === null) {

        result.tfr =
            findAmountNearLabels(
                combinedText,
                [
                    'tfr',
                    'fondo'
                ]
            );
    }


    /*
     * ============================================================
     * 4. FERIE
     * ============================================================
     */

    if (result.ferie === null) {

        var ferieMatch =
            combinedText.match(
                /(?:ferie|rol)[^0-9]{0,40}(\d+(?:[.,]\d+)?)/i
            );

        if (ferieMatch) {

            result.ferie =
                parseItalianMoney(
                    ferieMatch[1]
                );
        }
    }


    /*
     * ============================================================
     * 5. NORMALIZZAZIONE
     * ============================================================
     */

    if (
        result.lordo !== null
    ) {
        result.lordo =
            Number(result.lordo);
    }

    if (
        result.netto !== null
    ) {
        result.netto =
            Number(result.netto);
    }

    if (
        result.ferie !== null
    ) {
        result.ferie =
            Number(result.ferie);
    }

    if (
        result.tfr !== null
    ) {
        result.tfr =
            Number(result.tfr);
    }


    /*
     * ============================================================
     * 6. SANITY CHECK
     * ============================================================
     */

    if (
        result.lordo !== null &&
        result.netto !== null
    ) {

        var ratio =
            result.netto /
            result.lordo;

        /*
         * Un netto reale deve essere:
         * - positivo
         * - inferiore al lordo
         * - non assurdamente basso
         */

        if (
            result.netto <= 0 ||
            result.lordo <= 0 ||
            ratio >= 1 ||
            ratio < 0.25
        ) {

            console.warn(
                '[Busta Paga] Netto scartato per valore non plausibile:',
                result.netto,
                'lordo:',
                result.lordo,
                'ratio:',
                ratio
            );

            result.netto = null;
        }
    }


    /*
     * TFR:
     * evitiamo un valore chiaramente duplicato del netto.
     */

    if (
        result.tfr !== null &&
        result.netto !== null
    ) {

        if (
            Math.abs(
                result.tfr -
                result.netto
            ) < 0.01
        ) {

            result.tfr = null;
        }
    }


    /*
     * Validazione finale.
     */

    if (
        result.lordo !== null &&
        (
            !Number.isFinite(result.lordo) ||
            result.lordo <= 0
        )
    ) {
        result.lordo = null;
    }

    if (
        result.netto !== null &&
        (
            !Number.isFinite(result.netto) ||
            result.netto <= 0
        )
    ) {
        result.netto = null;
    }

    if (
        result.ferie !== null &&
        (
            !Number.isFinite(result.ferie) ||
            result.ferie < 0
        )
    ) {
        result.ferie = null;
    }

    if (
        result.tfr !== null &&
        (
            !Number.isFinite(result.tfr) ||
            result.tfr < 0
        )
    ) {
        result.tfr = null;
    }


    console.log(
        '[Busta Paga] DATI ESTRATTI:',
        result
    );

    return result;
}
```
