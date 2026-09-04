(() => {
'use strict';

```
document.addEventListener('DOMContentLoaded', initScanner);

function initScanner() {
    const uploadInput = document.getElementById('img-upload');
    const dropZone = document.getElementById('drop-zone');
    const previewGrid = document.getElementById('preview-grid');
    const btnGeneratePdf = document.getElementById('generate-pdf');
    const statusMsg = document.getElementById('status-msg');
    const filterSelect = document.getElementById('scan-filter');
    const chkAutoCrop = document.getElementById('auto-crop');

    const cropModal = document.getElementById('crop-modal');
    const cropCanvas = document.getElementById('crop-canvas');
    const cropContainer = document.getElementById('crop-container');
    const btnCancelCrop = document.getElementById('btn-cancel-crop');
    const btnApplyCrop = document.getElementById('btn-apply-crop');

    if (
        !uploadInput ||
        !dropZone ||
        !previewGrid ||
        !btnGeneratePdf ||
        !statusMsg ||
        !filterSelect ||
        !chkAutoCrop ||
        !cropModal ||
        !cropCanvas ||
        !cropContainer ||
        !btnCancelCrop ||
        !btnApplyCrop
    ) {
        console.error('[Scanner] Faltan elementos necesarios del DOM.');
        return;
    }

    const ctxCrop = cropCanvas.getContext('2d', {
        alpha: false
    });

    let cvReady = false;
    let documentIdCounter = 1;
    let documentsState = [];
    let currentEditingId = null;

    let dragPointIndex = -1;
    let imgDisplayScale = 1;

    // ==========================================================
    // CONFIGURACIÓN
    // ==========================================================

    const CONFIG = {
        detectionMaxDimension: 1100,

        // Área mínima del documento respecto de la imagen.
        minDocumentAreaRatio: 0.12,

        // Evita aceptar un contorno que sea prácticamente
        // toda la fotografía.
        maxDocumentAreaRatio: 0.985,

        // Distancia mínima entre un vértice y otro.
        minSideLength: 35,

        // Permite detectar documentos con perspectiva.
        maxAngleCosine: 0.55,

        // Evita depender de un único Canny.
        cannyPairs: [
            [40, 120],
            [60, 160],
            [80, 180],
            [100, 220]
        ],

        // Candidatos máximos a conservar.
        maxCandidates: 40,

        // JPEG del PDF.
        jpegQuality: 0.94,

        // Dimensiones máximas de salida.
        maxOutputWidth: 3000,
        maxOutputHeight: 4000
    };

    // ==========================================================
    // OPEN CV
    // ==========================================================

    waitForOpenCV();

    function waitForOpenCV() {
        statusMsg.textContent = 'Caricamento motore IA...';
        statusMsg.className = 'mt-4 text-sm font-medium text-amber-600';

        let attempts = 0;

        const timer = setInterval(() => {
            attempts++;

            try {
                if (
                    window.cv &&
                    typeof window.cv.Mat === 'function' &&
                    typeof window.cv.imread === 'function' &&
                    typeof window.cv.findContours === 'function'
                ) {
                    clearInterval(timer);

                    cvReady = true;

                    statusMsg.textContent =
                        'Motore IA pronto. Carica i tuoi documenti.';

                    statusMsg.className =
                        'mt-4 text-sm font-medium text-emerald-600';

                    console.info('[Scanner] OpenCV pronto.');
                }
            } catch (error) {
                console.warn('[Scanner] OpenCV non ancora pronto.', error);
            }

            if (attempts >= 160) {
                clearInterval(timer);

                cvReady = false;

                statusMsg.textContent =
                    'Errore di caricamento del motore IA. Ricarica la pagina.';

                statusMsg.className =
                    'mt-4 text-sm font-medium text-red-600';

                console.error('[Scanner] OpenCV timeout.');
            }
        }, 250);
    }

    // ==========================================================
    // EVENTI UPLOAD
    // ==========================================================

    dropZone.addEventListener('click', () => {
        uploadInput.value = '';
        uploadInput.click();
    });

    dropZone.addEventListener('keydown', (event) => {
        if (
            event.key === 'Enter' ||
            event.key === ' '
        ) {
            event.preventDefault();
            uploadInput.value = '';
            uploadInput.click();
        }
    });

    uploadInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files || []);

        if (files.length > 0) {
            handleFiles(files);
        }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            event.stopPropagation();

            dropZone.classList.add(
                'border-indigo-500',
                'bg-indigo-50'
            );
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            event.stopPropagation();

            dropZone.classList.remove(
                'border-indigo-500',
                'bg-indigo-50'
            );

            if (
                eventName === 'drop' &&
                event.dataTransfer &&
                event.dataTransfer.files
            ) {
                const files = Array.from(
                    event.dataTransfer.files
                );

                if (files.length > 0) {
                    handleFiles(files);
                }
            }
        });
    });

    filterSelect.addEventListener('change', async () => {
        if (!documentsState.length) {
            return;
        }

        const selectedFilter = filterSelect.value;

        statusMsg.textContent =
            'Aggiornamento delle scansioni...';

        statusMsg.className =
            'mt-4 text-sm font-medium text-indigo-600';

        for (const doc of documentsState) {
            doc.filter = selectedFilter;

            await processDocument(doc);
        }

        updatePreviewGrid();

        statusMsg.textContent =
            'Filtro applicato correttamente.';

        statusMsg.className =
            'mt-4 text-sm font-medium text-emerald-600';
    });

    // ==========================================================
    // FILES
    // ==========================================================

    async function handleFiles(files) {
        if (!cvReady) {
            alert(
                'Attendi il caricamento del motore di visione.'
            );
            return;
        }

        const imageFiles = files.filter(file =>
            file &&
            typeof file.type === 'string' &&
            file.type.startsWith('image/')
        );

        if (!imageFiles.length) {
            alert('Seleziona almeno un file immagine.');
            return;
        }

        statusMsg.textContent =
            `Elaborazione di ${imageFiles.length} documento/i...`;

        statusMsg.className =
            'mt-4 text-sm font-medium text-indigo-600';

        for (const file of imageFiles) {
            try {
                const img = await loadImageFromFile(file);

                let detectedPoints = null;

                if (chkAutoCrop.checked) {
                    detectedPoints =
                        detectDocumentCorners(img);
                }

                const points =
                    isValidQuad(detectedPoints, img.width, img.height)
                        ? orderPoints(detectedPoints)
                        : getSafeDefaultCorners(
                            img.width,
                            img.height
                        );

                const doc = {
                    id: documentIdCounter++,
                    file,
                    imgElement: img,
                    points,
                    filter: filterSelect.value,
                    processedCanvas: null,
                    detectedAutomatically:
                        isValidQuad(
                            detectedPoints,
                            img.width,
                            img.height
                        ),
                    detectionConfidence:
                        detectedPoints &&
                        typeof detectedPoints.confidence === 'number'
                            ? detectedPoints.confidence
                            : 0
                };

                documentsState.push(doc);

                await processDocument(doc);

                /*
                 * Actualizamos inmediatamente para que el usuario
                 * vea cada documento a medida que se procesa.
                 */
                updatePreviewGrid();

            } catch (error) {
                console.error(
                    '[Scanner] Error procesando imagen:',
                    error
                );
            }
        }

        statusMsg.textContent =
            'Elaborazione completata. Controlla i bordi rilevati.';

        statusMsg.className =
            'mt-4 text-sm font-medium text-emerald-600';

        updatePreviewGrid();
    }

    function loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const objectUrl =
                URL.createObjectURL(file);

            const img = new Image();

            img.onload = () => {
                URL.revokeObjectURL(objectUrl);

                if (!img.naturalWidth || !img.naturalHeight) {
                    reject(
                        new Error(
                            'Immagine senza dimensioni valide.'
                        )
                    );
                    return;
                }

                resolve(img);
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);

                reject(
                    new Error(
                        'Errore durante il caricamento dell’immagine.'
                    )
                );
            };

            img.src = objectUrl;
        });
    }

    // ==========================================================
    // FALLBACK
    // ==========================================================

    function getSafeDefaultCorners(width, height) {
        const marginX = width * 0.035;
        const marginY = height * 0.035;

        return [
            { x: marginX, y: marginY },
            { x: width - marginX, y: marginY },
            { x: width - marginX, y: height - marginY },
            { x: marginX, y: height - marginY }
        ];
    }

    // ==========================================================
    // AUTO CROP
    //
    // Strategia:
    //
    // 1. riduzione immagine
    // 2. scala di grigi
    // 3. riduzione rumore
    // 4. diversi Canny
    // 5. dilatazione
    // 6. threshold adattivo
    // 7. ricerca contorni
    // 8. approxPolyDP
    // 9. validazione quadrilatero
    // 10. scoring
    // ==========================================================

    function detectDocumentCorners(img) {
        let src = null;
        let resized = null;
        let gray = null;
        let blurred = null;

        const allCandidates = [];

        try {
            src = cv.imread(img);

            if (!src || src.empty()) {
                return null;
            }

            const originalWidth = src.cols;
            const originalHeight = src.rows;

            /*
             * Le immagini delle fotocamere possono essere enormi.
             * 1100 px è un buon compromesso qualità/prestazioni.
             */
            const scale =
                Math.min(
                    1,
                    CONFIG.detectionMaxDimension /
                    Math.max(
                        originalWidth,
                        originalHeight
                    )
                );

            const resizedWidth =
                Math.max(
                    1,
                    Math.round(
                        originalWidth * scale
                    )
                );

            const resizedHeight =
                Math.max(
                    1,
                    Math.round(
                        originalHeight * scale
                    )
                );

            resized = new cv.Mat();

            cv.resize(
                src,
                resized,
                new cv.Size(
                    resizedWidth,
                    resizedHeight
                ),
                0,
                0,
                cv.INTER_AREA
            );

            gray = new cv.Mat();

            /*
             * cv.imread() normalmente devuelve RGBA.
             */
            if (resized.channels() === 4) {
                cv.cvtColor(
                    resized,
                    gray,
                    cv.COLOR_RGBA2GRAY
                );
            } else if (resized.channels() === 3) {
                cv.cvtColor(
                    resized,
                    gray,
                    cv.COLOR_RGB2GRAY
                );
            } else {
                resized.copyTo(gray);
            }

            /*
             * Suavizado para quitar ruido de cámara.
             */
            blurred = new cv.Mat();

            cv.GaussianBlur(
                gray,
                blurred,
                new cv.Size(5, 5),
                0,
                0,
                cv.BORDER_DEFAULT
            );

            // --------------------------------------------------
            // PASADAS CANNY
            // --------------------------------------------------

            for (
                const [low, high]
                of CONFIG.cannyPairs
            ) {
                let edges = null;
                let dilated = null;
                let kernel = null;

                try {
                    edges = new cv.Mat();

                    cv.Canny(
                        blurred,
                        edges,
                        low,
                        high,
                        3,
                        false
                    );

                    kernel =
                        cv.Mat.ones(
                            3,
                            3,
                            cv.CV_8U
                        );

                    dilated = new cv.Mat();

                    cv.dilate(
                        edges,
                        dilated,
                        kernel
                    );

                    collectContourCandidates(
                        dilated,
                        resizedWidth,
                        resizedHeight,
                        scale,
                        allCandidates
                    );

                } finally {
                    if (edges) edges.delete();
                    if (dilated) dilated.delete();
                    if (kernel) kernel.delete();
                }
            }

            // --------------------------------------------------
            // PASADA THRESHOLD ADAPTIVO
            //
            // Muy útil en fotos con iluminación irregular.
            // --------------------------------------------------

            {
                let adaptive = null;

                try {
                    adaptive = new cv.Mat();

                    cv.adaptiveThreshold(
                        blurred,
                        adaptive,
                        255,
                        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                        cv.THRESH_BINARY,
                        21,
                        7
                    );

                    /*
                     * Invertimos para que bordes oscuros queden
                     * mejor representados.
                     */
                    cv.bitwise_not(
                        adaptive,
                        adaptive
                    );

                    collectContourCandidates(
                        adaptive,
                        resizedWidth,
                        resizedHeight,
                        scale,
                        allCandidates
                    );

                } finally {
                    if (adaptive) adaptive.delete();
                }
            }

            // --------------------------------------------------
            // PASADA OTSU
            // --------------------------------------------------

            {
                let threshold = null;

                try {
                    threshold = new cv.Mat();

                    cv.threshold(
                        blurred,
                        threshold,
                        0,
                        255,
                        cv.THRESH_BINARY +
                        cv.THRESH_OTSU
                    );

                    cv.bitwise_not(
                        threshold,
                        threshold
                    );

                    collectContourCandidates(
                        threshold,
                        resizedWidth,
                        resizedHeight,
                        scale,
                        allCandidates
                    );

                } finally {
                    if (threshold) threshold.delete();
                }
            }

            if (!allCandidates.length) {
                return null;
            }

            /*
             * Ordenamos por score.
             */
            allCandidates.sort(
                (a, b) =>
                    b.score - a.score
            );

            const best =
                allCandidates[0];

            if (!best) {
                return null;
            }

            /*
             * Exigimos una confianza mínima.
             * Evita recortar basura en fotografías
             * donde claramente no existe un documento.
             */
            if (best.score < 0.18) {
                return null;
            }

            const confidence =
                Math.min(
                    1,
                    Math.max(
                        0,
                        best.score
                    )
                );

            return {
                ...best.points.map(point => ({
                    x: point.x,
                    y: point.y
                })),
                confidence
            };

        } catch (error) {
            console.warn(
                '[Scanner] Auto-crop fallido:',
                error
            );

            return null;

        } finally {
            if (src) src.delete();
            if (resized) resized.delete();
            if (gray) gray.delete();
            if (blurred) blurred.delete();
        }
    }

    // ==========================================================
    // CANDIDATOS
    // ==========================================================

    function collectContourCandidates(
        binary,
        width,
        height,
        scale,
        candidates
    ) {
        let contours = null;
        let hierarchy = null;

        try {
            contours = new cv.MatVector();
            hierarchy = new cv.Mat();

            cv.findContours(
                binary,
                contours,
                hierarchy,
                cv.RETR_LIST,
                cv.CHAIN_APPROX_SIMPLE
            );

            const imageArea =
                width * height;

            for (
                let i = 0;
                i < contours.size();
                i++
            ) {
                const contour =
                    contours.get(i);

                try {
                    const contourArea =
                        Math.abs(
                            cv.contourArea(
                                contour
                            )
                        );

                    const areaRatio =
                        contourArea /
                        imageArea;

                    if (
                        areaRatio <
                        CONFIG.minDocumentAreaRatio
                    ) {
                        continue;
                    }

                    if (
                        areaRatio >
                        CONFIG.maxDocumentAreaRatio
                    ) {
                        continue;
                    }

                    const perimeter =
                        cv.arcLength(
                            contour,
                            true
                        );

                    if (!Number.isFinite(perimeter) || perimeter <= 0) {
                        continue;
                    }

                    /*
                     * Probamos varias tolerancias de aproximación.
                     */
                    const epsilonFactors = [
                        0.015,
                        0.02,
                        0.025,
                        0.03,
                        0.04
                    ];

                    for (
                        const factor
                        of epsilonFactors
                    ) {
                        const approx =
                            new cv.Mat();

                        try {
                            cv.approxPolyDP(
                                contour,
                                approx,
                                factor * perimeter,
                                true
                            );

                            if (
                                approx.rows !== 4
                            ) {
                                continue;
                            }

                            if (
                                !cv.isContourConvex(
                                    approx
                                )
                            ) {
                                continue;
                            }

                            const points =
                                matToPoints(
                                    approx
                                );

                            const originalPoints =
                                points.map(
                                    point => ({
                                        x:
                                            point.x /
                                            scale,
                                        y:
                                            point.y /
                                            scale
                                    })
                                );

                            const metrics =
                                evaluateQuad(
                                    originalPoints,
                                    width /
                                    scale,
                                    height /
                                    scale
                                );

                            if (!metrics.valid) {
                                continue;
                            }

                            /*
                             * Evitamos duplicados prácticamente iguales.
                             */
                            if (
                                isSimilarCandidate(
                                    candidates,
                                    originalPoints
                                )
                            ) {
                                continue;
                            }

                            candidates.push({
                                points:
                                    originalPoints,
                                score:
                                    metrics.score
                            });

                        } finally {
                            approx.delete();
                        }
                    }

                } finally {
                    contour.delete();
                }
            }

            /*
             * Evita crecimiento excesivo.
             */
            if (
                candidates.length >
                CONFIG.maxCandidates
            ) {
                candidates.sort(
                    (a, b) =>
                        b.score - a.score
                );

                candidates.length =
                    CONFIG.maxCandidates;
            }

        } catch (error) {
            console.warn(
                '[Scanner] Errore durante ricerca contorni:',
                error
            );

        } finally {
            if (contours) contours.delete();
            if (hierarchy) hierarchy.delete();
        }
    }

    // ==========================================================
    // MAT -> POINTS
    // ==========================================================

    function matToPoints(mat) {
        const points = [];

        for (
            let i = 0;
            i < mat.rows;
            i++
        ) {
            /*
             * approxPolyDP con CV_32S normalmente
             * utilizza data32S.
             */
            const x =
                mat.data32S[i * 2];

            const y =
                mat.data32S[i * 2 + 1];

            points.push({
                x,
                y
            });
        }

        return orderPoints(points);
    }

    // ==========================================================
    // VALIDACIÓN DEL QUAD
    // ==========================================================

    function evaluateQuad(
        points,
        imageWidth,
        imageHeight
    ) {
        if (
            !Array.isArray(points) ||
            points.length !== 4
        ) {
            return {
                valid: false,
                score: 0
            };
        }

        const ordered =
            orderPoints(points);

        const [
            tl,
            tr,
            br,
            bl
        ] = ordered;

        const imageArea =
            imageWidth * imageHeight;

        const quadArea =
            polygonArea(ordered);

        const areaRatio =
            quadArea / imageArea;

        if (
            !Number.isFinite(areaRatio) ||
            areaRatio <
            CONFIG.minDocumentAreaRatio ||
            areaRatio >
            CONFIG.maxDocumentAreaRatio
        ) {
            return {
                valid: false,
                score: 0
            };
        }

        const widthTop =
            distance(tl, tr);

        const widthBottom =
            distance(bl, br);

        const heightLeft =
            distance(tl, bl);

        const heightRight =
            distance(tr, br);

        const minSide =
            Math.min(
                widthTop,
                widthBottom,
                heightLeft,
                heightRight
            );

        if (
            !Number.isFinite(minSide) ||
            minSide <
            CONFIG.minSideLength
        ) {
            return {
                valid: false,
                score: 0
            };
        }

        /*
         * Ángulos.
         *
         * Un documento real puede tener perspectiva,
         * por lo que no exigimos 90 grados perfectos.
         */
        const angleCosines = [
            angleCosine(
                bl,
                tl,
                tr
            ),
            angleCosine(
                tl,
                tr,
                br
            ),
            angleCosine(
                tr,
                br,
                bl
            ),
            angleCosine(
                br,
                bl,
                tl
            )
        ];

        const maxAbsCos =
            Math.max(
                ...angleCosines.map(
                    value =>
                        Math.abs(value)
                )
            );

        if (
            maxAbsCos >
            CONFIG.maxAngleCosine
        ) {
            return {
                valid: false,
                score: 0
            };
        }

        /*
         * Relación entre lados opuestos.
         *
         * Evita aceptar cuadriláteros muy deformes.
         */
        const widthBalance =
            Math.min(
                widthTop,
                widthBottom
            ) /
            Math.max(
                widthTop,
                widthBottom
            );

        const heightBalance =
            Math.min(
                heightLeft,
                heightRight
            ) /
            Math.max(
                heightLeft,
                heightRight
            );

        /*
         * Coherencia geométrica.
         */
        const geometryScore =
            (
                widthBalance +
                heightBalance
            ) / 2;

        /*
         * Penalización por esquinas pegadas al borde.
         *
         * No eliminamos esos candidatos, sólo reducimos
         * ligeramente su score.
         */
        const marginScore =
            calculateMarginScore(
                ordered,
                imageWidth,
                imageHeight
            );

        /*
         * Ratio de área:
         *
         * 0.12 -> débil
         * 0.50 -> bueno
         * 0.80 -> excelente
         */
        const areaScore =
            Math.min(
                1,
                Math.max(
                    0,
                    (areaRatio - 0.08) /
                    0.72
                )
            );

        /*
         * Rectangularidad aproximada.
         */
        const rectangleScore =
            calculateRectangleScore(
                ordered
            );

        /*
         * Score final.
         */
        const score =
            (
                areaScore * 0.45 +
                geometryScore * 0.22 +
                rectangleScore * 0.23 +
                marginScore * 0.10
            );

        return {
            valid: true,
            score
        };
    }

    // ==========================================================
    // GEOMETRÍA
    // ==========================================================

    function orderPoints(points) {
        if (!points || points.length !== 4) {
            return points || [];
        }

        const pts = [...points];

        /*
         * Utilizamos centroide + atan2.
         *
         * Es más robusto que depender exclusivamente de:
         * x+y / x-y
         */
        const cx =
            pts.reduce(
                (sum, p) => sum + p.x,
                0
            ) / pts.length;

        const cy =
            pts.reduce(
                (sum, p) => sum + p.y,
                0
            ) / pts.length;

        pts.sort(
            (a, b) =>
                Math.atan2(
                    a.y - cy,
                    a.x - cx
                ) -
                Math.atan2(
                    b.y - cy,
                    b.x - cx
                )
        );

        /*
         * Encontramos TL:
         * menor x+y.
         */
        let topLeftIndex = 0;
        let minSum =
            Infinity;

        for (
            let i = 0;
            i < pts.length;
            i++
        ) {
            const sum =
                pts[i].x +
                pts[i].y;

            if (sum < minSum) {
                minSum = sum;
                topLeftIndex = i;
            }
        }

        const rotated = [
            ...pts.slice(topLeftIndex),
            ...pts.slice(0, topLeftIndex)
        ];

        /*
         * Después del giro:
         *
         * TL → TR → BR → BL
         *
         * comprobamos orientación.
         */
        const [tl, p1, p2, p3] =
            rotated;

        const cross =
            crossProduct(
                tl,
                p1,
                p2
            );

        if (cross > 0) {
            return [
                tl,
                p3,
                p2,
                p1
            ];
        }

        return rotated;
    }

    function crossProduct(a, b, c) {
        return (
            (b.x - a.x) *
            (c.y - a.y) -
            (b.y - a.y) *
            (c.x - a.x)
        );
    }

    function polygonArea(points) {
        let area = 0;

        for (
            let i = 0;
            i < points.length;
            i++
        ) {
            const next =
                (i + 1) %
                points.length;

            area +=
                points[i].x *
                points[next].y -
                points[next].x *
                points[i].y;
        }

        return Math.abs(area) / 2;
    }

    function distance(a, b) {
        return Math.hypot(
            b.x - a.x,
            b.y - a.y
        );
    }

    function angleCosine(
        previous,
        current,
        next
    ) {
        const v1 = {
            x: previous.x - current.x,
            y: previous.y - current.y
        };

        const v2 = {
            x: next.x - current.x,
            y: next.y - current.y
        };

        const mag1 =
            Math.hypot(
                v1.x,
                v1.y
            );

        const mag2 =
            Math.hypot(
                v2.x,
                v2.y
            );

        if (
            mag1 === 0 ||
            mag2 === 0
        ) {
            return 1;
        }

        return (
            (
                v1.x * v2.x +
                v1.y * v2.y
            ) /
            (mag1 * mag2)
        );
    }

    function calculateRectangleScore(points) {
        const [
            tl,
            tr,
            br,
            bl
        ] = points;

        const top =
            distance(tl, tr);

        const bottom =
            distance(bl, br);

        const left =
            distance(tl, bl);

        const right =
            distance(tr, br);

        const widthBalance =
            Math.min(top, bottom) /
            Math.max(top, bottom);

        const heightBalance =
            Math.min(left, right) /
            Math.max(left, right);

        /*
         * Cuanto más equilibrados son los cuatro lados,
         * mejor candidato.
         */
        return (
            widthBalance *
            heightBalance
        );
    }

    function calculateMarginScore(
        points,
        width,
        height
    ) {
        const marginThreshold =
            Math.min(
                width,
                height
            ) * 0.025;

        let nearEdges = 0;

        for (const p of points) {
            if (
                p.x <= marginThreshold ||
                p.y <= marginThreshold ||
                p.x >= width - marginThreshold ||
                p.y >= height - marginThreshold
            ) {
                nearEdges++;
            }
        }

        /*
         * No penalizamos demasiado.
         */
        return Math.max(
            0,
            1 - nearEdges * 0.12
        );
    }

    function isValidQuad(
        points,
        width,
        height
    ) {
        if (
            !points ||
            points.length !== 4
        ) {
            return false;
        }

        const normalized =
            points.map(p => ({
                x: Number(p.x),
                y: Number(p.y)
            }));

        if (
            normalized.some(
                p =>
                    !Number.isFinite(p.x) ||
                    !Number.isFinite(p.y)
            )
        ) {
            return false;
        }

        const metrics =
            evaluateQuad(
                normalized,
                width,
                height
            );

        return metrics.valid;
    }

    function isSimilarCandidate(
        candidates,
        points
    ) {
        const newCenter =
            calculateCenter(points);

        for (const candidate of candidates) {
            const center =
                calculateCenter(
                    candidate.points
                );

            const diagonal =
                Math.hypot(
                    points[2].x -
                    points[0].x,
                    points[2].y -
                    points[0].y
                );

            const distanceBetweenCenters =
                Math.hypot(
                    center.x -
                    newCenter.x,
                    center.y -
                    newCenter.y
                );

            if (
                diagonal > 0 &&
                distanceBetweenCenters <
                diagonal * 0.03
            ) {
                return true;
            }
        }

        return false;
    }

    function calculateCenter(points) {
        return {
            x:
                points.reduce(
                    (sum, p) =>
                        sum + p.x,
                    0
                ) / points.length,

            y:
                points.reduce(
                    (sum, p) =>
                        sum + p.y,
                    0
                ) / points.length
        };
    }

    // ==========================================================
    // WARP PERSPECTIVE
    // ==========================================================

    async function processDocument(doc) {
        if (!doc || !cvReady) {
            return;
        }

        let src = null;
        let dst = null;
        let srcTri = null;
        let dstTri = null;
        let M = null;

        try {
            src =
                cv.imread(
                    doc.imgElement
                );

            if (!src || src.empty()) {
                throw new Error(
                    'Immagine sorgente non valida.'
                );
            }

            const points =
                orderPoints(
                    doc.points
                );

            if (
                !isValidQuad(
                    points,
                    src.cols,
                    src.rows
                )
            ) {
                throw new Error(
                    'Punti di ritaglio non validi.'
                );
            }

            const [
                tl,
                tr,
                br,
                bl
            ] = points;

            const widthTop =
                distance(
                    tl,
                    tr
                );

            const widthBottom =
                distance(
                    bl,
                    br
                );

            const heightLeft =
                distance(
                    tl,
                    bl
                );

            const heightRight =
                distance(
                    tr,
                    br
                );

            const maxWidth =
                Math.max(
                    widthTop,
                    widthBottom
                );

            const maxHeight =
                Math.max(
                    heightLeft,
                    heightRight
                );

            let outputWidth =
                Math.round(
                    maxWidth
                );

            let outputHeight =
                Math.round(
                    maxHeight
                );

            outputWidth =
                Math.min(
                    Math.max(
                        outputWidth,
                        300
                    ),
                    CONFIG.maxOutputWidth
                );

            outputHeight =
                Math.min(
                    Math.max(
                        outputHeight,
                        300
                    ),
                    CONFIG.maxOutputHeight
                );

            /*
             * Aseguramos que no se genere una imagen
             * extremadamente alargada por un detector erróneo.
             */
            const aspectRatio =
                outputWidth /
                outputHeight;

            if (
                !Number.isFinite(
                    aspectRatio
                ) ||
                aspectRatio < 0.20 ||
                aspectRatio > 5
            ) {
                throw new Error(
                    'Proporzione documento non plausibile.'
                );
            }

            srcTri =
                cv.matFromArray(
                    4,
                    1,
                    cv.CV_32FC2,
                    [
                        tl.x,
                        tl.y,

                        tr.x,
                        tr.y,

                        br.x,
                        br.y,

                        bl.x,
                        bl.y
                    ]
                );

            dstTri =
                cv.matFromArray(
                    4,
                    1,
                    cv.CV_32FC2,
                    [
                        0,
                        0,

                        outputWidth,
                        0,

                        outputWidth,
                        outputHeight,

                        0,
                        outputHeight
                    ]
                );

            M =
                cv.getPerspectiveTransform(
                    srcTri,
                    dstTri
                );

            dst =
                new cv.Mat();

            cv.warpPerspective(
                src,
                dst,
                M,
                new cv.Size(
                    outputWidth,
                    outputHeight
                ),
                cv.INTER_LINEAR,
                cv.BORDER_CONSTANT,
                new cv.Scalar(
                    255,
                    255,
                    255,
                    255
                )
            );

            /*
             * Procesamiento visual.
             */
            applyFilter(
                dst,
                doc.filter
            );

            const canvas =
                document.createElement(
                    'canvas'
                );

            cv.imshow(
                canvas,
                dst
            );

            /*
             * Canvas con fondo blanco.
             */
            canvas.style.display = 'block';

            doc.processedCanvas =
                canvas;

        } catch (error) {
            console.error(
                '[Scanner] Errore ritaglio/filtro:',
                error
            );

            /*
             * Como fallback, mostramos la imagen original
             * en vez de dejar una miniatura rota.
             */
            try {
                const fallback =
                    document.createElement(
                        'canvas'
                    );

                fallback.width =
                    doc.imgElement.naturalWidth ||
                    doc.imgElement.width;

                fallback.height =
                    doc.imgElement.naturalHeight ||
                    doc.imgElement.height;

                const fallbackCtx =
                    fallback.getContext('2d');

                fallbackCtx.drawImage(
                    doc.imgElement,
                    0,
                    0,
                    fallback.width,
                    fallback.height
                );

                doc.processedCanvas =
                    fallback;

            } catch (fallbackError) {
                console.error(
                    '[Scanner] Fallback fallido:',
                    fallbackError
                );
            }

        } finally {
            if (src) src.delete();
            if (dst) dst.delete();
            if (srcTri) srcTri.delete();
            if (dstTri) dstTri.delete();
            if (M) M.delete();
        }

        updatePreviewGrid();
    }

    // ==========================================================
    // FILTROS
    // ==========================================================

    function applyFilter(mat, filter) {
        if (
            !mat ||
            mat.empty()
        ) {
            return;
        }

        if (filter === 'grayscale') {
            applyGrayscaleFilter(mat);
            return;
        }

        if (filter === 'bw') {
            applyBlackWhiteFilter(mat);
            return;
        }

        applyColorFilter(mat);
    }

    // ----------------------------------------------------------
    // GRAYSCALE
    // ----------------------------------------------------------

    function applyGrayscaleFilter(mat) {
        let gray = null;
        let bg = null;
        let flat = null;
        let normalized = null;

        try {
            gray =
                new cv.Mat();

            bg =
                new cv.Mat();

            flat =
                new cv.Mat();

            normalized =
                new cv.Mat();

            convertToGray(
                mat,
                gray
            );

            cv.GaussianBlur(
                gray,
                bg,
                new cv.Size(
                    51,
                    51
                ),
                0,
                0,
                cv.BORDER_DEFAULT
            );

            /*
             * Normalización suave de iluminación.
             */
            cv.divide(
                gray,
                bg,
                flat,
                235.0
            );

            cv.normalize(
                flat,
                normalized,
                0,
                255,
                cv.NORM_MINMAX,
                cv.CV_8U
            );

            cv.cvtColor(
                normalized,
                mat,
                cv.COLOR_GRAY2RGBA
            );

        } finally {
            if (gray) gray.delete();
            if (bg) bg.delete();
            if (flat) flat.delete();
            if (normalized) normalized.delete();
        }
    }

    // ----------------------------------------------------------
    // BLACK & WHITE
    // ----------------------------------------------------------

    function applyBlackWhiteFilter(mat) {
        let gray = null;
        let bg = null;
        let flat = null;
        let normalized = null;
        let threshold = null;
        let sharpened = null;

        try {
            gray =
                new cv.Mat();

            bg =
                new cv.Mat();

            flat =
                new cv.Mat();

            normalized =
                new cv.Mat();

            threshold =
                new cv.Mat();

            sharpened =
                new cv.Mat();

            convertToGray(
                mat,
                gray
            );

            /*
             * Eliminación de gradientes de iluminación.
             */
            cv.GaussianBlur(
                gray,
                bg,
                new cv.Size(
                    51,
                    51
                ),
                0,
                0,
                cv.BORDER_DEFAULT
            );

            cv.divide(
                gray,
                bg,
                flat,
                240.0
            );

            cv.normalize(
                flat,
                normalized,
                0,
                255,
                cv.NORM_MINMAX,
                cv.CV_8U
            );

            /*
             * Umbral adaptativo:
             * mejor para documentos fotografiados.
             */
            cv.adaptiveThreshold(
                normalized,
                threshold,
                255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv.THRESH_BINARY,
                31,
                10
            );

            /*
             * Suavizamos ligeramente los bordes.
             */
            cv.GaussianBlur(
                threshold,
                sharpened,
                new cv.Size(
                    3,
                    3
                ),
                0,
                0,
                cv.BORDER_DEFAULT
            );

            cv.cvtColor(
                sharpened,
                mat,
                cv.COLOR_GRAY2RGBA
            );

        } finally {
            if (gray) gray.delete();
            if (bg) bg.delete();
            if (flat) flat.delete();
            if (normalized) normalized.delete();
            if (threshold) threshold.delete();
            if (sharpened) sharpened.delete();
        }
    }

    // ----------------------------------------------------------
    // COLOR
    // ----------------------------------------------------------

    function applyColorFilter(mat) {
        let rgb = null;
        let ycrcb = null;
        let channels = null;
        let Y = null;
        let Cr = null;
        let Cb = null;
        let bg = null;
        let YFlat = null;
        let YSharp = null;
        let blurred = null;

        try {
            rgb =
                new cv.Mat();

            ycrcb =
                new cv.Mat();

            channels =
                new cv.MatVector();

            bg =
                new cv.Mat();

            YFlat =
                new cv.Mat();

            YSharp =
                new cv.Mat();

            blurred =
                new cv.Mat();

            cv.cvtColor(
                mat,
                rgb,
                cv.COLOR_RGBA2RGB
            );

            cv.cvtColor(
                rgb,
                ycrcb,
                cv.COLOR_RGB2YCrCb
            );

            cv.split(
                ycrcb,
                channels
            );

            Y =
                channels.get(0);

            Cr =
                channels.get(1);

            Cb =
                channels.get(2);

            /*
             * Trabajamos sólo con luminancia.
             * Los colores del documento se conservan.
             */
            cv.GaussianBlur(
                Y,
                bg,
                new cv.Size(
                    51,
                    51
                ),
                0,
                0,
                cv.BORDER_DEFAULT
            );

            cv.divide(
                Y,
                bg,
                YFlat,
                235.0
            );

            cv.normalize(
                YFlat,
                YFlat,
                0,
                255,
                cv.NORM_MINMAX,
                cv.CV_8U
            );

            /*
             * Unsharp mask suave.
             */
            cv.GaussianBlur(
                YFlat,
                blurred,
                new cv.Size(
                    0,
                    0
                ),
                1.6,
                1.6,
                cv.BORDER_DEFAULT
            );

            cv.addWeighted(
                YFlat,
                1.25,
                blurred,
                -0.25,
                0,
                YSharp
            );

            channels.set(
                0,
                YSharp
            );

            cv.merge(
                channels,
                ycrcb
            );

            cv.cvtColor(
                ycrcb,
                rgb,
                cv.COLOR_YCrCb2RGB
            );

            cv.cvtColor(
                rgb,
                mat,
                cv.COLOR_RGB2RGBA
            );

        } finally {
            if (rgb) rgb.delete();
            if (ycrcb) ycrcb.delete();
            if (channels) channels.delete();
            if (Y) Y.delete();
            if (Cr) Cr.delete();
            if (Cb) Cb.delete();
            if (bg) bg.delete();
            if (YFlat) YFlat.delete();
            if (YSharp) YSharp.delete();
            if (blurred) blurred.delete();
        }
    }

    function convertToGray(src, dst) {
        const channels =
            src.channels();

        if (channels === 4) {
            cv.cvtColor(
                src,
                dst,
                cv.COLOR_RGBA2GRAY
            );
        } else if (channels === 3) {
            cv.cvtColor(
                src,
                dst,
                cv.COLOR_RGB2GRAY
            );
        } else {
            src.copyTo(dst);
        }
    }

    // ==========================================================
    // PREVIEW GRID
    // ==========================================================

    function updatePreviewGrid() {
        previewGrid.innerHTML = '';

        btnGeneratePdf.disabled =
            documentsState.length === 0;

        for (const doc of documentsState) {
            if (!doc.processedCanvas) {
                continue;
            }

            const wrapper =
                document.createElement(
                    'div'
                );

            wrapper.className =
                'relative border rounded-lg shadow-sm overflow-hidden bg-gray-100 aspect-[3/4] flex items-center justify-center group';

            doc.processedCanvas.className =
                'max-w-full max-h-full object-contain';

            wrapper.appendChild(
                doc.processedCanvas
            );

            /*
             * Badge.
             */
            const badge =
                document.createElement(
                    'div'
                );

            badge.className =
                'absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded';

            if (
                doc.detectedAutomatically
            ) {
                const confidence =
                    Math.round(
                        (doc.detectionConfidence || 0) *
                        100
                    );

                badge.textContent =
                    confidence > 0
                        ? `✓ Auto ${confidence}%`
                        : '✓ Auto';
            } else {
                badge.textContent =
                    'Manuale';
            }

            wrapper.appendChild(
                badge
            );

            /*
             * Remove.
             */
            const btnRemove =
                document.createElement(
                    'button'
                );

            btnRemove.type =
                'button';

            btnRemove.className =
                'absolute top-2 right-2 bg-red-500 text-white rounded-full w-9 h-9 flex items-center justify-center font-bold shadow hover:bg-red-600 transition z-10';

            btnRemove.setAttribute(
                'aria-label',
                'Rimuovi documento'
            );

            btnRemove.innerHTML =
                '×';

            btnRemove.addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    documentsState =
                        documentsState.filter(
                            item =>
                                item.id !==
                                doc.id
                        );

                    updatePreviewGrid();
                }
            );

            /*
             * Edit.
             */
            const btnEdit =
                document.createElement(
                    'button'
                );

            btnEdit.type =
                'button';

            btnEdit.className =
                'absolute top-2 left-2 bg-indigo-600 text-white rounded-full w-9 h-9 flex items-center justify-center shadow hover:bg-indigo-700 transition z-10';

            btnEdit.setAttribute(
                'aria-label',
                'Modifica ritaglio'
            );

            btnEdit.innerHTML =
                '✏️';

            btnEdit.addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    openCropModal(
                        doc.id
                    );
                }
            );

            wrapper.appendChild(
                btnRemove
            );

            wrapper.appendChild(
                btnEdit
            );

            previewGrid.appendChild(
                wrapper
            );
        }
    }

    // ==========================================================
    // MODAL CROP MANUAL
    // ==========================================================

    function openCropModal(id) {
        currentEditingId = id;

        const doc =
            documentsState.find(
                item =>
                    item.id === id
            );

        if (!doc) {
            currentEditingId = null;
            return;
        }

        cropModal.classList.remove(
            'hidden'
        );

        /*
         * Impedimos scroll del body mientras el modal está abierto.
         */
        document.body.style.overflow =
            'hidden';

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                renderCropCanvas(doc);
            });
        });
    }

    function renderCropCanvas(doc) {
        if (!doc || !doc.imgElement) {
            return;
        }

        const img =
            doc.imgElement;

        const containerWidth =
            cropContainer.clientWidth;

        const containerHeight =
            cropContainer.clientHeight;

        if (
            containerWidth <= 0 ||
            containerHeight <= 0
        ) {
            return;
        }

        const availableWidth =
            Math.max(
                100,
                containerWidth - 32
            );

        const availableHeight =
            Math.max(
                100,
                containerHeight - 32
            );

        imgDisplayScale =
            Math.min(
                availableWidth /
                img.naturalWidth,

                availableHeight /
                img.naturalHeight,

                1
            );

        if (
            !Number.isFinite(
                imgDisplayScale
            ) ||
            imgDisplayScale <= 0
        ) {
            imgDisplayScale = 1;
        }

        cropCanvas.width =
            Math.max(
                1,
                Math.round(
                    img.naturalWidth *
                    imgDisplayScale
                )
            );

        cropCanvas.height =
            Math.max(
                1,
                Math.round(
                    img.naturalHeight *
                    imgDisplayScale
                )
            );

        drawCropState(doc);
    }

    function drawCropState(doc) {
        const img =
            doc.imgElement;

        ctxCrop.clearRect(
            0,
            0,
            cropCanvas.width,
            cropCanvas.height
        );

        ctxCrop.drawImage(
            img,
            0,
            0,
            cropCanvas.width,
            cropCanvas.height
        );

        const pts =
            orderPoints(
                doc.points
            ).map(point => ({
                x:
                    point.x *
                    imgDisplayScale,

                y:
                    point.y *
                    imgDisplayScale
            }));

        /*
         * Overlay oscuro.
         */
        ctxCrop.save();

        ctxCrop.fillStyle =
            'rgba(0,0,0,0.60)';

        ctxCrop.beginPath();

        ctxCrop.rect(
            0,
            0,
            cropCanvas.width,
            cropCanvas.height
        );

        ctxCrop.moveTo(
            pts[0].x,
            pts[0].y
        );

        for (
            let i = 1;
            i < pts.length;
            i++
        ) {
            ctxCrop.lineTo(
                pts[i].x,
                pts[i].y
            );
        }

        ctxCrop.closePath();

        ctxCrop.fill(
            'evenodd'
        );

        ctxCrop.restore();

        /*
         * Línea.
         */
        ctxCrop.strokeStyle =
            '#6366f1';

        ctxCrop.lineWidth =
            Math.max(
                3,
                3 *
                window.devicePixelRatio
            );

        ctxCrop.beginPath();

        ctxCrop.moveTo(
            pts[0].x,
            pts[0].y
        );

        for (
            let i = 1;
            i < pts.length;
            i++
        ) {
            ctxCrop.lineTo(
                pts[i].x,
                pts[i].y
            );
        }

        ctxCrop.closePath();

        ctxCrop.stroke();

        /*
         * Puntos.
         */
        pts.forEach(point => {
            ctxCrop.beginPath();

            ctxCrop.arc(
                point.x,
                point.y,
                12,
                0,
                Math.PI * 2
            );

            ctxCrop.fillStyle =
                '#ffffff';

            ctxCrop.fill();

            ctxCrop.lineWidth = 3;

            ctxCrop.strokeStyle =
                '#4f46e5';

            ctxCrop.stroke();
        });
    }

    // ==========================================================
    // POINTER EVENTS
    // ==========================================================

    cropCanvas.addEventListener(
        'pointerdown',
        event => {
            if (
                currentEditingId === null
            ) {
                return;
            }

            const doc =
                documentsState.find(
                    item =>
                        item.id ===
                        currentEditingId
                );

            if (!doc) {
                return;
            }

            event.preventDefault();

            const rect =
                cropCanvas.getBoundingClientRect();

            if (
                rect.width <= 0 ||
                rect.height <= 0
            ) {
                return;
            }

            const position =
                canvasEventPosition(
                    event,
                    rect
                );

            const scaledPoints =
                orderPoints(
                    doc.points
                ).map(
                    point => ({
                        x:
                            point.x *
                            imgDisplayScale,

                        y:
                            point.y *
                            imgDisplayScale
                    })
                );

            /*
             * Área de captura mayor para mobile.
             */
            const hitRadius =
                Math.max(
                    32,
                    44 *
                    Math.min(
                        window.devicePixelRatio ||
                        1,
                        2
                    )
                );

            dragPointIndex =
                scaledPoints.findIndex(
                    point =>
                        Math.hypot(
                            point.x -
                            position.x,

                            point.y -
                            position.y
                        ) <
                        hitRadius
                );

            if (
                dragPointIndex !== -1
            ) {
                try {
                    cropCanvas.setPointerCapture(
                        event.pointerId
                    );
                } catch (_) {}

                /*
                 * Convertimos el índice al array original
                 * manteniendo el orden TL/TR/BR/BL.
                 */
                doc.points =
                    orderPoints(
                        doc.points
                    );
            }
        }
    );

    cropCanvas.addEventListener(
        'pointermove',
        event => {
            if (
                dragPointIndex === -1 ||
                currentEditingId === null
            ) {
                return;
            }

            const doc =
                documentsState.find(
                    item =>
                        item.id ===
                        currentEditingId
                );

            if (!doc) {
                return;
            }

            event.preventDefault();

            const rect =
                cropCanvas.getBoundingClientRect();

            if (
                rect.width <= 0 ||
                rect.height <= 0
            ) {
                return;
            }

            const position =
                canvasEventPosition(
                    event,
                    rect
                );

            const x =
                clamp(
                    position.x /
                    imgDisplayScale,

                    0,

                    doc.imgElement.naturalWidth
                );

            const y =
                clamp(
                    position.y /
                    imgDisplayScale,

                    0,

                    doc.imgElement.naturalHeight
                );

            doc.points[
                dragPointIndex
            ] = {
                x,
                y
            };

            drawCropState(doc);
        }
    );

    const endDrag = event => {
        dragPointIndex = -1;

        try {
            if (
                event &&
                event.pointerId !== undefined
            ) {
                cropCanvas.releasePointerCapture(
                    event.pointerId
                );
            }
        } catch (_) {}
    };

    cropCanvas.addEventListener(
        'pointerup',
        endDrag
    );

    cropCanvas.addEventListener(
        'pointercancel',
        endDrag
    );

    cropCanvas.addEventListener(
        'pointerleave',
        event => {
            /*
             * No cancelamos el drag:
             * setPointerCapture debería mantenerlo.
             */
        }
    );

    function canvasEventPosition(
        event,
        rect
    ) {
        return {
            x:
                (event.clientX -
                    rect.left) *
                (
                    cropCanvas.width /
                    rect.width
                ),

            y:
                (event.clientY -
                    rect.top) *
                (
                    cropCanvas.height /
                    rect.height
                )
        };
    }

    function clamp(value, min, max) {
        return Math.min(
            max,
            Math.max(
                min,
                value
            )
        );
    }

    // ==========================================================
    // CANCEL
    // ==========================================================

    btnCancelCrop.addEventListener(
        'click',
        () => {
            closeCropModal();
        }
    );

    // ==========================================================
    // APPLY
    // ==========================================================

    btnApplyCrop.addEventListener(
        'click',
        async () => {
            const doc =
                documentsState.find(
                    item =>
                        item.id ===
                        currentEditingId
                );

            if (!doc) {
                closeCropModal();
                return;
            }

            /*
             * Validamos antes de aplicar.
             */
            const points =
                orderPoints(
                    doc.points
                );

            if (
                !isValidQuad(
                    points,
                    doc.imgElement.naturalWidth,
                    doc.imgElement.naturalHeight
                )
            ) {
                alert(
                    'I quattro angoli non formano un documento valido.'
                );
                return;
            }

            doc.points =
                points;

            doc.detectedAutomatically =
                false;

            doc.detectionConfidence =
                0;

            closeCropModal();

            statusMsg.textContent =
                'Applicazione del ritaglio...';

            statusMsg.className =
                'mt-4 text-sm font-medium text-indigo-600';

            await processDocument(
                doc
            );

            updatePreviewGrid();

            statusMsg.textContent =
                'Ritaglio applicato.';

            statusMsg.className =
                'mt-4 text-sm font-medium text-emerald-600';
        }
    );

    function closeCropModal() {
        cropModal.classList.add(
            'hidden'
        );

        document.body.style.overflow =
            '';

        currentEditingId =
            null;

        dragPointIndex =
            -1;
    }

    // ==========================================================
    // WINDOW RESIZE
    // ==========================================================

    let resizeTimer = null;

    window.addEventListener(
        'resize',
        () => {
            clearTimeout(
                resizeTimer
            );

            resizeTimer =
                setTimeout(() => {
                    if (
                        currentEditingId !==
                        null
                    ) {
                        const doc =
                            documentsState.find(
                                item =>
                                    item.id ===
                                    currentEditingId
                            );

                        if (doc) {
                            renderCropCanvas(
                                doc
                            );
                        }
                    }
                }, 100);
        },
        {
            passive: true
        }
    );

    // ==========================================================
    // PDF GENERATION
    // ==========================================================

    btnGeneratePdf.addEventListener(
        'click',
        async () => {
            if (
                documentsState.length === 0
            ) {
                return;
            }

            if (
                typeof PDFLib ===
                'undefined'
            ) {
                alert(
                    'La libreria PDF non è disponibile.'
                );
                return;
            }

            btnGeneratePdf.disabled =
                true;

            btnGeneratePdf.innerHTML =
                '<span>⏳</span> Creazione PDF in corso...';

            try {
                const pdfDoc =
                    await PDFLib.PDFDocument.create();

                let pageCount = 0;

                for (
                    let i = 0;
                    i <
                    documentsState.length;
                    i++
                ) {
                    const doc =
                        documentsState[i];

                    if (
                        !doc.processedCanvas
                    ) {
                        continue;
                    }

                    const blob =
                        await canvasToBlob(
                            doc.processedCanvas,
                            'image/jpeg',
                            CONFIG.jpegQuality
                        );

                    if (!blob) {
                        continue;
                    }

                    const bytes =
                        await blob.arrayBuffer();

                    const image =
                        await pdfDoc.embedJpg(
                            bytes
                        );

                    const isLandscape =
                        image.width >
                        image.height;

                    const A4_W =
                        isLandscape
                            ? 841.89
                            : 595.28;

                    const A4_H =
                        isLandscape
                            ? 595.28
                            : 841.89;

                    const ratio =
                        Math.min(
                            A4_W /
                            image.width,

                            A4_H /
                            image.height
                        );

                    const pW =
                        image.width *
                        ratio;

                    const pH =
                        image.height *
                        ratio;

                    const page =
                        pdfDoc.addPage([
                            A4_W,
                            A4_H
                        ]);

                    page.drawImage(
                        image,
                        {
                            x:
                                (
                                    A4_W -
                                    pW
                                ) / 2,

                            y:
                                (
                                    A4_H -
                                    pH
                                ) / 2,

                            width:
                                pW,

                            height:
                                pH
                        }
                    );

                    pageCount++;
                }

                if (
                    pageCount === 0
                ) {
                    throw new Error(
                        'Nessuna pagina disponibile.'
                    );
                }

                const pdfBytes =
                    await pdfDoc.save();

                const blob =
                    new Blob(
                        [pdfBytes],
                        {
                            type:
                                'application/pdf'
                        }
                    );

                const url =
                    URL.createObjectURL(
                        blob
                    );

                const link =
                    document.createElement(
                        'a'
                    );

                link.href =
                    url;

                link.download =
                    `Documento_Scansionato_${Date.now()}.pdf`;

                document.body.appendChild(
                    link
                );

                link.click();

                link.remove();

                setTimeout(() => {
                    URL.revokeObjectURL(
                        url
                    );
                }, 1500);

            } catch (error) {
                console.error(
                    '[Scanner] PDF error:',
                    error
                );

                alert(
                    'Errore nella generazione del PDF.'
                );

            } finally {
                btnGeneratePdf.disabled =
                    documentsState.length ===
                    0;

                btnGeneratePdf.innerHTML =
                    '<span>📄</span> Genera PDF multipagina';
            }
        }
    );

    // ==========================================================
    // CANVAS -> BLOB
    // ==========================================================

    function canvasToBlob(
        canvas,
        type,
        quality
    ) {
        return new Promise(
            resolve => {
                canvas.toBlob(
                    resolve,
                    type,
                    quality
                );
            }
        );
    }
}
```

})();
