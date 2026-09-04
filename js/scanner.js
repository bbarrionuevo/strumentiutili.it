(() => {
    'use strict';

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

        if (!uploadInput || !dropZone || !previewGrid || !btnGeneratePdf || !cropModal) return;

        const ctxCrop = cropCanvas.getContext('2d');

        let cvReady = false;
        let documentIdCounter = 1;
        let documentsState = [];
        let currentEditingId = null;

        let dragPointIndex = -1;
        let imgDisplayScale = 1;

        // ==========================================================
        // OPENCV INITIALIZATION
        // ==========================================================
        waitForOpenCV();

        function waitForOpenCV() {
            statusMsg.textContent = 'Caricamento motore IA...';
            statusMsg.className = 'mt-4 text-sm font-medium text-amber-600';
            let attempts = 0;
            const timer = setInterval(() => {
                attempts++;
                if (typeof window.cv !== 'undefined' && typeof window.cv.Mat === 'function') {
                    clearInterval(timer);
                    cvReady = true;
                    statusMsg.textContent = 'Motore IA pronto. Carica i tuoi documenti.';
                    statusMsg.className = 'mt-4 text-sm font-medium text-emerald-600';
                }
                if (attempts >= 120) {
                    clearInterval(timer);
                    statusMsg.textContent = 'Errore di caricamento IA.';
                    statusMsg.className = 'mt-4 text-sm font-medium text-red-600';
                }
            }, 250);
        }

        // ==========================================================
        // EVENTS
        // ==========================================================
        dropZone.addEventListener('click', () => { uploadInput.value = ''; uploadInput.click(); });
        uploadInput.addEventListener('change', e => { if (e.target.files.length) handleFiles(Array.from(e.target.files)); });

        ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, e => {
            e.preventDefault(); e.stopPropagation(); dropZone.classList.add('border-indigo-500', 'bg-indigo-50');
        }));
        ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, e => {
            e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
            if (evt === 'drop' && e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
        }));

        filterSelect.addEventListener('change', () => {
            documentsState.forEach(doc => { doc.filter = filterSelect.value; processDocument(doc); });
        });

        // ==========================================================
        // FILE HANDLING
        // ==========================================================
        async function handleFiles(files) {
            if (!cvReady) return alert('Attendi il caricamento del motore di visione.');
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (!imageFiles.length) return;

            statusMsg.textContent = `Elaborazione di ${imageFiles.length} documento/i...`;
            statusMsg.className = 'mt-4 text-sm font-medium text-indigo-600';

            for (const file of imageFiles) {
                try {
                    const img = await loadImageFromFile(file);
                    
                    const detectedPoints = chkAutoCrop.checked ? detectDocumentCorners(img) : null;
                    const points = (detectedPoints && detectedPoints.length === 4) ? detectedPoints : getDefaultCorners(img);

                    const doc = {
                        id: documentIdCounter++,
                        file,
                        imgElement: img,
                        points,
                        filter: filterSelect.value,
                        processedCanvas: null,
                        detectedAutomatically: !!detectedPoints
                    };
                    documentsState.push(doc);
                    await processDocument(doc);
                } catch (error) { console.error('Errore immagine:', error); }
            }
            updatePreviewGrid();
            statusMsg.textContent = 'Elaborazione completata con successo.';
            statusMsg.className = 'mt-4 text-sm font-medium text-emerald-600';
        }

        function loadImageFromFile(file) {
            return new Promise((resolve, reject) => {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Errore caricamento.')); };
                img.src = url;
            });
        }

        function getDefaultCorners(img) {
            const marginX = img.width * 0.05;
            const marginY = img.height * 0.05;
            return [
                { x: marginX, y: marginY },
                { x: img.width - marginX, y: marginY },
                { x: img.width - marginX, y: img.height - marginY },
                { x: marginX, y: img.height - marginY }
            ];
        }

        // ==========================================================
        // COMPUTER VISION: AUTO-CROP (Lógica probada de scanner_3)
        // ==========================================================
        function detectDocumentCorners(img) {
            let src, small, gray, edges, contours, hierarchy;
            try {
                src = cv.imread(img);
                if (src.empty()) return null;

                const maxDimension = 800;
                let scale = (src.cols > maxDimension || src.rows > maxDimension) ? maxDimension / Math.max(src.cols, src.rows) : 1;
                const smallWidth = Math.max(1, Math.round(src.cols * scale));
                const smallHeight = Math.max(1, Math.round(src.rows * scale));

                small = new cv.Mat();
                cv.resize(src, small, new cv.Size(smallWidth, smallHeight), 0, 0, cv.INTER_AREA);
                
                gray = new cv.Mat();
                cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
                
                cv.medianBlur(gray, gray, 7);
                
                edges = new cv.Mat();
                cv.Canny(gray, edges, 75, 200);
                
                const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
                cv.dilate(edges, edges, kernel);
                kernel.delete();

                contours = new cv.MatVector();
                hierarchy = new cv.Mat();
                cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

                let maxArea = smallWidth * smallHeight * 0.15; 
                let bestPts = null;

                for (let i = 0; i < contours.size(); i++) {
                    const contour = contours.get(i);
                    const area = Math.abs(cv.contourArea(contour));
                    
                    if (area > maxArea) {
                        const perimeter = cv.arcLength(contour, true);
                        const approx = new cv.Mat();
                        cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

                        if (approx.rows === 4 && cv.isContourConvex(approx)) {
                            maxArea = area;
                            bestPts = [];
                            for (let p = 0; p < 4; p++) bestPts.push({ x: approx.data32S[p * 2], y: approx.data32S[p * 2 + 1] });
                        }
                        approx.delete();
                    }
                    contour.delete();
                }

                if (bestPts) {
                    const ordered = orderPoints(bestPts);
                    return ordered.map(p => ({ x: p.x / scale, y: p.y / scale }));
                }

                return null;
            } catch (error) {
                return null;
            } finally {
                if (src) src.delete(); if (small) small.delete(); if (gray) gray.delete();
                if (edges) edges.delete(); if (contours) contours.delete(); if (hierarchy) hierarchy.delete();
            }
        }

        function orderPoints(points) {
            const sorted = [...points];
            const sums = sorted.map(p => p.x + p.y);
            const diffs = sorted.map(p => p.x - p.y);
            return [
                sorted[sums.indexOf(Math.min(...sums))], // TL
                sorted[diffs.indexOf(Math.max(...diffs))], // TR
                sorted[sums.indexOf(Math.max(...sums))], // BR
                sorted[diffs.indexOf(Math.min(...diffs))] // BL
            ];
        }

        // ==========================================================
        // PROCESSING (WARP PERSPECTIVE)
        // ==========================================================
        async function processDocument(doc) {
            if (!doc || !cvReady) return;
            let src, dst, srcTri, dstTri, M;
            try {
                src = cv.imread(doc.imgElement);
                const [tl, tr, br, bl] = orderPoints(doc.points);

                const widthA = Math.hypot(br.x - bl.x, br.y - bl.y);
                const widthB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
                const maxWidth = Math.max(widthA, widthB);

                const heightA = Math.hypot(tl.x - bl.x, tl.y - bl.y);
                const heightB = Math.hypot(tr.x - br.x, tr.y - br.y);
                const maxHeight = Math.max(heightA, heightB);

                const outputWidth = Math.min(Math.max(maxWidth, 300), 3000);
                const outputHeight = Math.min(Math.max(maxHeight, 300), 4000);

                srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
                dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outputWidth, 0, outputWidth, outputHeight, 0, outputHeight]);
                M = cv.getPerspectiveTransform(srcTri, dstTri);

                dst = new cv.Mat();
                cv.warpPerspective(src, dst, M, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

                applyFilter(dst, doc.filter);

                const canvas = document.createElement('canvas');
                cv.imshow(canvas, dst);
                doc.processedCanvas = canvas;
            } catch (error) {
                console.error('Errore ritaglio/filtro:', error);
            } finally {
                if (src) src.delete(); if (dst) dst.delete(); if (srcTri) srcTri.delete();
                if (dstTri) dstTri.delete(); if (M) M.delete();
            }
            updatePreviewGrid();
        }

        // ==========================================================
        // MOTOR DE FILTROS REAL CAMSCANNER (YCrCb + LUT)
        // ==========================================================
        function applyFilter(mat, filter) {
            if (filter === 'grayscale') {
                let gray = new cv.Mat();
                let bg = new cv.Mat();
                let flat = new cv.Mat();
                try {
                    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY, 0);
                    cv.GaussianBlur(gray, bg, new cv.Size(51, 51), 0, 0, cv.BORDER_DEFAULT);
                    cv.divide(gray, bg, flat, 240.0);
                    cv.normalize(flat, flat, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
                    cv.cvtColor(flat, mat, cv.COLOR_GRAY2RGBA, 0);
                } finally {
                    gray.delete(); bg.delete(); flat.delete();
                }
                return;
            }

            if (filter === 'bw') {
                let gray = new cv.Mat();
                let bg = new cv.Mat();
                let flat = new cv.Mat();
                let norm = new cv.Mat();
                let blurred = new cv.Mat();
                let lut = new cv.Mat(1, 256, cv.CV_8UC1);
                try {
                    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY, 0);
                    
                    // 1. Aplanado de iluminación (elimina sombras)
                    cv.GaussianBlur(gray, bg, new cv.Size(51, 51), 0, 0, cv.BORDER_DEFAULT);
                    cv.divide(gray, bg, flat, 240.0);
                    cv.normalize(flat, norm, 0, 255, cv.NORM_MINMAX, cv.CV_8U);

                    // 2. Curva de ajuste de punto blanco (Limpia papel sin romper firmas)
                    for (let i = 0; i < 256; i++) {
                        let v = (i >= 195) ? 255 : Math.max(0, Math.min(255, Math.floor(255.0 * Math.pow(i / 195.0, 1.5))));
                        lut.data[i] = v;
                    }
                    cv.LUT(norm, lut, norm);

                    // 3. Enfoque suave de texto
                    cv.GaussianBlur(norm, blurred, new cv.Size(0, 0), 1.5, 1.5, cv.BORDER_DEFAULT);
                    cv.addWeighted(norm, 1.3, blurred, -0.3, 0, norm);

                    cv.cvtColor(norm, mat, cv.COLOR_GRAY2RGBA, 0);
                } finally {
                    gray.delete(); bg.delete(); flat.delete(); norm.delete(); blurred.delete(); lut.delete();
                }
                return;
            }

            if (filter === 'color') {
                let rgb = new cv.Mat();
                let ycrcb = new cv.Mat();
                let channels = new cv.MatVector();
                let Y = new cv.Mat();
                let Cr = new cv.Mat();
                let Cb = new cv.Mat();
                let bg = new cv.Mat();
                let Y_flat = new cv.Mat();
                let Y_sharp = new cv.Mat();
                let blurred = new cv.Mat();

                try {
                    // Convertir a YCrCb para procesar SOMBRAS sin alterar LOS COLORES originales
                    cv.cvtColor(mat, rgb, cv.COLOR_RGBA2RGB, 0);
                    cv.cvtColor(rgb, ycrcb, cv.COLOR_RGB2YCrCb, 0);

                    cv.split(ycrcb, channels);
                    Y = channels.get(0);
                    Cr = channels.get(1);
                    Cb = channels.get(2);

                    // 1. Aplanado de sombras SOLO en canal Y (Luminancia)
                    cv.GaussianBlur(Y, bg, new cv.Size(51, 51), 0, 0, cv.BORDER_DEFAULT);
                    cv.divide(Y, bg, Y_flat, 235.0);

                    // 2. Normalización de luminancia
                    cv.normalize(Y_flat, Y_flat, 0, 255, cv.NORM_MINMAX, cv.CV_8U);

                    // 3. Enfoque de nitidez sobre el texto
                    cv.GaussianBlur(Y_flat, blurred, new cv.Size(0, 0), 2.0, 2.0, cv.BORDER_DEFAULT);
                    cv.addWeighted(Y_flat, 1.3, blurred, -0.3, 0, Y_sharp);

                    // Recombinar con canales Cr y Cb originales (mantiene oro, cian, azul intactos)
                    channels.set(0, Y_sharp);
                    cv.merge(channels, ycrcb);

                    cv.cvtColor(ycrcb, rgb, cv.COLOR_YCrCb2RGB, 0);
                    cv.cvtColor(rgb, mat, cv.COLOR_RGB2RGBA, 0);

                } finally {
                    rgb.delete(); ycrcb.delete(); channels.delete();
                    Y.delete(); Cr.delete(); Cb.delete(); bg.delete();
                    Y_flat.delete(); Y_sharp.delete(); blurred.delete();
                }
            }
        }

        // ==========================================================
        // UI PREVIEW GRID
        // ==========================================================
        function updatePreviewGrid() {
            previewGrid.innerHTML = '';
            btnGeneratePdf.disabled = documentsState.length === 0;

            documentsState.forEach(doc => {
                if (!doc.processedCanvas) return;
                const wrapper = document.createElement('div');
                wrapper.className = 'relative border rounded-lg shadow-sm overflow-hidden bg-gray-100 aspect-[3/4] flex items-center justify-center group';
                
                doc.processedCanvas.className = 'max-w-full max-h-full object-contain';
                wrapper.appendChild(doc.processedCanvas);

                const badge = document.createElement('div');
                badge.className = 'absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded';
                badge.textContent = doc.detectedAutomatically ? '✓ Auto' : 'Manuale';
                wrapper.appendChild(badge);

                const btnRemove = document.createElement('button');
                btnRemove.type = 'button';
                btnRemove.className = 'absolute top-2 right-2 bg-red-500 text-white rounded-full w-9 h-9 flex items-center justify-center font-bold shadow hover:bg-red-600 transition z-10';
                btnRemove.innerHTML = '×';
                btnRemove.onclick = (e) => { e.stopPropagation(); documentsState = documentsState.filter(item => item.id !== doc.id); updatePreviewGrid(); };

                const btnEdit = document.createElement('button');
                btnEdit.type = 'button';
                btnEdit.className = 'absolute top-2 left-2 bg-indigo-600 text-white rounded-full w-9 h-9 flex items-center justify-center shadow hover:bg-indigo-700 transition z-10';
                btnEdit.innerHTML = '✏️';
                btnEdit.onclick = (e) => { e.stopPropagation(); openCropModal(doc.id); };

                wrapper.appendChild(btnRemove);
                wrapper.appendChild(btnEdit);
                previewGrid.appendChild(wrapper);
            });
        }

        // ==========================================================
        // MODAL MANUAL CROP
        // ==========================================================
        function openCropModal(id) {
            currentEditingId = id;
            const doc = documentsState.find(d => d.id === id);
            if (!doc) return;
            cropModal.classList.remove('hidden');
            requestAnimationFrame(() => renderCropCanvas(doc));
        }

        function renderCropCanvas(doc) {
            const img = doc.imgElement;
            const maxWidth = Math.max(100, cropContainer.clientWidth - 32);
            const maxHeight = Math.max(100, cropContainer.clientHeight - 32);
            imgDisplayScale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
            
            cropCanvas.width = Math.round(img.width * imgDisplayScale);
            cropCanvas.height = Math.round(img.height * imgDisplayScale);
            drawCropState(doc);
        }

        function drawCropState(doc) {
            const img = doc.imgElement;
            ctxCrop.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
            ctxCrop.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);

            const pts = doc.points.map(p => ({ x: p.x * imgDisplayScale, y: p.y * imgDisplayScale }));

            ctxCrop.fillStyle = 'rgba(0,0,0,0.60)';
            ctxCrop.beginPath();
            ctxCrop.rect(0, 0, cropCanvas.width, cropCanvas.height);
            ctxCrop.moveTo(pts[0].x, pts[0].y);
            ctxCrop.lineTo(pts[1].x, pts[1].y);
            ctxCrop.lineTo(pts[2].x, pts[2].y);
            ctxCrop.lineTo(pts[3].x, pts[3].y);
            ctxCrop.closePath();
            ctxCrop.fill('evenodd');

            ctxCrop.strokeStyle = '#6366f1';
            ctxCrop.lineWidth = 3;
            ctxCrop.beginPath();
            ctxCrop.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctxCrop.lineTo(pts[i].x, pts[i].y);
            ctxCrop.closePath();
            ctxCrop.stroke();

            pts.forEach((p, idx) => {
                ctxCrop.beginPath();
                ctxCrop.arc(p.x, p.y, 12, 0, Math.PI * 2); 
                ctxCrop.fillStyle = '#ffffff';
                ctxCrop.fill();
                ctxCrop.lineWidth = 3;
                ctxCrop.strokeStyle = '#4f46e5';
                ctxCrop.stroke();
            });
        }

        // Pointer Events (Mouse + Touch)
        cropCanvas.addEventListener('pointerdown', e => {
            if (!currentEditingId) return;
            const doc = documentsState.find(d => d.id === currentEditingId);
            const rect = cropCanvas.getBoundingClientRect();
            const pos = { x: (e.clientX - rect.left) * (cropCanvas.width / rect.width), y: (e.clientY - rect.top) * (cropCanvas.height / rect.height) };
            
            const scaledPoints = doc.points.map(p => ({ x: p.x * imgDisplayScale, y: p.y * imgDisplayScale }));
            dragPointIndex = scaledPoints.findIndex(p => Math.hypot(p.x - pos.x, p.y - pos.y) < 40);
            if (dragPointIndex !== -1) { e.preventDefault(); cropCanvas.setPointerCapture(e.pointerId); }
        });

        cropCanvas.addEventListener('pointermove', e => {
            if (dragPointIndex === -1 || !currentEditingId) return;
            e.preventDefault();
            const doc = documentsState.find(d => d.id === currentEditingId);
            const rect = cropCanvas.getBoundingClientRect();
            const pos = { x: (e.clientX - rect.left) * (cropCanvas.width / rect.width), y: (e.clientY - rect.top) * (cropCanvas.height / rect.height) };
            
            doc.points[dragPointIndex] = {
                x: Math.max(0, Math.min(pos.x, cropCanvas.width)) / imgDisplayScale,
                y: Math.max(0, Math.min(pos.y, cropCanvas.height)) / imgDisplayScale
            };
            drawCropState(doc);
        });

        const endDrag = e => { dragPointIndex = -1; try { cropCanvas.releasePointerCapture(e.pointerId); } catch (_) {} };
        cropCanvas.addEventListener('pointerup', endDrag);
        cropCanvas.addEventListener('pointercancel', endDrag);

        btnCancelCrop.addEventListener('click', () => { cropModal.classList.add('hidden'); currentEditingId = null; dragPointIndex = -1; });
        btnApplyCrop.addEventListener('click', async () => {
            const doc = documentsState.find(d => d.id === currentEditingId);
            cropModal.classList.add('hidden');
            currentEditingId = null;
            dragPointIndex = -1;
            if (doc) { doc.detectedAutomatically = false; await processDocument(doc); }
        });
        window.addEventListener('resize', () => { if (currentEditingId !== null) renderCropCanvas(documentsState.find(d => d.id === currentEditingId)); });

        // ==========================================================
        // PDF GENERATION
        // ==========================================================
        btnGeneratePdf.addEventListener('click', async () => {
            if (documentsState.length === 0 || typeof PDFLib === 'undefined') return;
            btnGeneratePdf.disabled = true;
            btnGeneratePdf.textContent = 'Creazione PDF in corso...';

            try {
                const pdfDoc = await PDFLib.PDFDocument.create();
                for (let i = 0; i < documentsState.length; i++) {
                    const doc = documentsState[i];
                    if (!doc.processedCanvas) continue;
                    
                    const blob = await new Promise(res => doc.processedCanvas.toBlob(res, 'image/jpeg', 0.95));
                    const bytes = await blob.arrayBuffer();
                    const image = await pdfDoc.embedJpg(bytes);

                    const isLandscape = image.width > image.height;
                    const A4_W = isLandscape ? 841.89 : 595.28;
                    const A4_H = isLandscape ? 595.28 : 841.89;
                    
                    const ratio = Math.min(A4_W / image.width, A4_H / image.height);
                    const pW = image.width * ratio, pH = image.height * ratio;
                    
                    const page = pdfDoc.addPage([A4_W, A4_H]);
                    page.drawImage(image, { x: (A4_W - pW)/2, y: (A4_H - pH)/2, width: pW, height: pH });
                }

                const pdfBytes = await pdfDoc.save();
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url; link.download = `Documento_Scansionato_${Date.now()}.pdf`;
                document.body.appendChild(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (error) {
                alert('Errore nella generazione del PDF.');
            } finally {
                btnGeneratePdf.disabled = false;
                btnGeneratePdf.textContent = '📄 Genera PDF multipagina';
            }
        });
    }
})();