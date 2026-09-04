(function () {
  'use strict';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScanner);
  } else {
    initScanner();
  }

  function initScanner() {
    var uploadInput = document.getElementById('img-upload');
    var dropZone = document.getElementById('drop-zone');
    var previewGrid = document.getElementById('preview-grid');
    var btnGeneratePdf = document.getElementById('generate-pdf');
    var statusMsg = document.getElementById('status-msg');
    var filterSelect = document.getElementById('scan-filter');
    var chkAutoCrop = document.getElementById('auto-crop');

    var cropModal = document.getElementById('crop-modal');
    var cropCanvas = document.getElementById('crop-canvas');
    var cropContainer = document.getElementById('crop-container');
    var btnCancelCrop = document.getElementById('btn-cancel-crop');
    var btnApplyCrop = document.getElementById('btn-apply-crop');

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
      console.error('[Scanner] Faltan elementos del HTML.');
      return;
    }

    var cropContext = cropCanvas.getContext('2d');
    if (!cropContext) {
      console.error('[Scanner] No se pudo obtener el contexto 2D.');
      return;
    }

    var cvReady = false;
    var documents = [];
    var nextDocumentId = 1;

    var currentEditingId = null;
    var draggedPointIndex = -1;
    var displayScale = 1;

    var CONFIG = {
      detectionMaxDimension: 1200,
      minAreaRatio: 0.08,
      maxAreaRatio: 0.985,
      minSideLength: 40,
      maxOutputWidth: 3000,
      maxOutputHeight: 4000,
      jpegQuality: 0.94
    };

    waitForOpenCV();

    function waitForOpenCV() {
      var attempts = 0;
      setStatus('Caricamento motore IA (Computer Vision) in corso... Attendi.', 'amber');

      var timer = setInterval(function () {
        attempts += 1;

        try {
          if (
            window.cv &&
            typeof window.cv.Mat === 'function' &&
            typeof window.cv.imread === 'function' &&
            typeof window.cv.findContours === 'function'
          ) {
            clearInterval(timer);
            cvReady = true;
            setStatus('Motore IA pronto. Carica i tuoi documenti.', 'green');
            return;
          }
        } catch (error) {
          console.warn('[Scanner] Esperando OpenCV:', error);
        }

        if (attempts >= 120) {
          clearInterval(timer);
          cvReady = false;
          setStatus('Errore nel caricamento del motore IA. Controlla la console.', 'red');
        }
      }, 250);
    }

    function setStatus(message, type) {
      statusMsg.textContent = message;

      if (type === 'green') {
        statusMsg.className = 'mt-5 text-sm font-medium text-emerald-600';
        return;
      }
      if (type === 'red') {
        statusMsg.className = 'mt-5 text-sm font-medium text-red-600';
        return;
      }
      if (type === 'indigo') {
        statusMsg.className = 'mt-5 text-sm font-medium text-indigo-600';
        return;
      }
      statusMsg.className = 'mt-5 text-sm font-medium text-amber-600';
    }

    // ==========================================================
    // CARGA DE ARCHIVOS Y EVENTOS
    // ==========================================================

    dropZone.addEventListener('click', function () {
      uploadInput.value = '';
      uploadInput.click();
    });

    dropZone.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        uploadInput.value = '';
        uploadInput.click();
      }
    });

    uploadInput.addEventListener('change', function (event) {
      var files = Array.prototype.slice.call(event.target.files || []);
      if (files.length) {
        handleFiles(files);
      }
    });

    ['dragenter', 'dragover'].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add('border-indigo-500', 'bg-indigo-50');
      });
    });

    ['dragleave', 'drop'].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');

        if (eventName === 'drop' && event.dataTransfer && event.dataTransfer.files) {
          var files = Array.prototype.slice.call(event.dataTransfer.files);
          if (files.length) {
            handleFiles(files);
          }
        }
      });
    });

    filterSelect.addEventListener('change', function () {
      reprocessAllDocuments();
    });

    async function reprocessAllDocuments() {
      if (!documents.length) return;

      setStatus('Aggiornamento delle scansioni...', 'indigo');

      for (var i = 0; i < documents.length; i++) {
        documents[i].filter = filterSelect.value;
        await processDocument(documents[i]);
      }

      updatePreviewGrid();
      setStatus('Filtro applicato correttamente.', 'green');
    }

    async function handleFiles(files) {
      if (!cvReady) {
        alert('Il motore IA non è ancora pronto. Attendi qualche secondo.');
        return;
      }

      var imageFiles = files.filter(function (file) {
        return file && typeof file.type === 'string' && file.type.indexOf('image/') === 0;
      });

      if (!imageFiles.length) {
        alert('Nessuna immagine valida trovata.');
        return;
      }

      setStatus('Elaborazione di ' + imageFiles.length + ' documento/i...', 'indigo');

      for (var i = 0; i < imageFiles.length; i++) {
        var file = imageFiles[i];
        try {
          var image = await loadImageFromFile(file);
          var detectedPoints = null;

          if (chkAutoCrop.checked) {
            detectedPoints = detectDocumentCorners(image);
          }

          var autoDetected = isValidQuad(detectedPoints, image.naturalWidth, image.naturalHeight);
          var points = autoDetected
            ? orderPoints(detectedPoints)
            : getDefaultCorners(image.naturalWidth, image.naturalHeight);

          var documentItem = {
            id: nextDocumentId++,
            file: file,
            imgElement: image,
            points: points,
            filter: filterSelect.value,
            processedCanvas: null,
            detectedAutomatically: autoDetected
          };

          documents.push(documentItem);
          await processDocument(documentItem);
          updatePreviewGrid();
        } catch (error) {
          console.error('[Scanner] Errore elaborazione file:', file.name, error);
        }
      }

      setStatus('Elaborazione completata.', 'green');
      updatePreviewGrid();
    }

    function loadImageFromFile(file) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var image = new Image();
        image.onload = function () {
          URL.revokeObjectURL(url);
          if (!image.naturalWidth || !image.naturalHeight) {
            reject(new Error('Immagine non valida.'));
            return;
          }
          resolve(image);
        };
        image.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('Impossibile caricare immagine.'));
        };
        image.src = url;
      });
    }

    function getDefaultCorners(width, height) {
      var marginX = width * 0.03;
      var marginY = height * 0.03;
      return [
        { x: marginX, y: marginY },
        { x: width - marginX, y: marginY },
        { x: width - marginX, y: height - marginY },
        { x: marginX, y: height - marginY }
      ];
    }

    // ==========================================================
    // DETECCIÓN AUTOMÁTICA Y OPENCV
    // ==========================================================

    function detectDocumentCorners(image) {
      var src = null, small = null, gray = null, blurred = null;
      var candidates = [];

      try {
        src = cv.imread(image);
        if (!src || src.empty()) return null;

        var originalWidth = src.cols;
        var originalHeight = src.rows;
        var scale = Math.min(1, CONFIG.detectionMaxDimension / Math.max(originalWidth, originalHeight));
        var width = Math.max(1, Math.round(originalWidth * scale));
        var height = Math.max(1, Math.round(originalHeight * scale));

        small = new cv.Mat();
        cv.resize(src, small, new cv.Size(width, height), 0, 0, cv.INTER_AREA);

        gray = new cv.Mat();
        if (small.channels() === 4) cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
        else if (small.channels() === 3) cv.cvtColor(small, gray, cv.COLOR_RGB2GRAY);
        else small.copyTo(gray);

        blurred = new cv.Mat();
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

        runCannyPass(blurred, 30, 100, scale, originalWidth, originalHeight, candidates);
        runCannyPass(blurred, 50, 150, scale, originalWidth, originalHeight, candidates);
        runCannyPass(blurred, 70, 180, scale, originalWidth, originalHeight, candidates);
        runAdaptivePass(blurred, scale, originalWidth, originalHeight, candidates);

        if (!candidates.length) return null;
        candidates.sort(function (a, b) { return b.score - a.score; });

        if (candidates[0].score < 0.22) return null;
        return candidates[0].points;
      } catch (error) {
        console.error('[Scanner] Errore auto detection:', error);
        return null;
      } finally {
        if (src) src.delete();
        if (small) small.delete();
        if (gray) gray.delete();
        if (blurred) blurred.delete();
      }
    }

    function runCannyPass(gray, low, high, scale, origW, origH, candidates) {
      var edges = null, dilated = null, kernel = null;
      try {
        edges = new cv.Mat();
        cv.Canny(gray, edges, low, high, 3, false);
        kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        dilated = new cv.Mat();
        cv.dilate(edges, dilated, kernel);
        collectCandidates(dilated, scale, origW, origH, candidates);
      } finally {
        if (edges) edges.delete();
        if (dilated) dilated.delete();
        if (kernel) kernel.delete();
      }
    }

    function runAdaptivePass(gray, scale, origW, origH, candidates) {
      var threshold = null;
      try {
        threshold = new cv.Mat();
        cv.adaptiveThreshold(gray, threshold, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 8);
        collectCandidates(threshold, scale, origW, origH, candidates);
      } finally {
        if (threshold) threshold.delete();
      }
    }

    function collectCandidates(binary, scale, origW, origH, candidates) {
      var contours = null, hierarchy = null;
      try {
        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        var imageArea = binary.cols * binary.rows;

        for (var i = 0; i < contours.size(); i++) {
          var contour = contours.get(i);
          try {
            var contourArea = Math.abs(cv.contourArea(contour));
            var areaRatio = contourArea / imageArea;

            if (areaRatio < CONFIG.minAreaRatio || areaRatio > CONFIG.maxAreaRatio) continue;

            var perimeter = cv.arcLength(contour, true);
            if (!Number.isFinite(perimeter) || perimeter <= 0) continue;

            var approx = new cv.Mat();
            try {
              cv.approxPolyDP(contour, approx, perimeter * 0.02, true);
              if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;

              var points = [];
              for (var p = 0; p < 4; p++) {
                points.push({
                  x: approx.data32S[p * 2] / scale,
                  y: approx.data32S[p * 2 + 1] / scale
                });
              }

              points = orderPoints(points);
              var metrics = evaluateQuadrilateral(points, origW, origH);
              if (metrics.valid) {
                candidates.push({ points: points, score: metrics.score });
              }
            } finally {
              approx.delete();
            }
          } finally {
            contour.delete();
          }
        }
      } finally {
        if (contours) contours.delete();
        if (hierarchy) hierarchy.delete();
      }
    }

    function evaluateQuadrilateral(points, imageWidth, imageHeight) {
      if (!points || points.length !== 4) return { valid: false, score: 0 };
      var areaRatio = polygonArea(points) / (imageWidth * imageHeight);
      if (areaRatio < CONFIG.minAreaRatio || areaRatio > CONFIG.maxAreaRatio) {
        return { valid: false, score: 0 };
      }
      return { valid: true, score: areaRatio };
    }

    function orderPoints(points) {
      if (!points || points.length !== 4) return points || [];
      var pts = points.slice();
      var centerX = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
      var centerY = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;

      pts.sort(function (a, b) {
        return Math.atan2(a.y - centerY, a.x - centerX) - Math.atan2(b.y - centerY, b.x - centerX);
      });

      var startIndex = 0;
      var minSum = Infinity;
      for (var j = 0; j < pts.length; j++) {
        var sum = pts[j].x + pts[j].y;
        if (sum < minSum) {
          minSum = sum;
          startIndex = j;
        }
      }

      var ordered = [];
      for (var k = 0; k < 4; k++) {
        ordered.push(pts[(startIndex + k) % 4]);
      }
      return ordered;
    }

    function polygonArea(p) {
      return Math.abs((p[0].x * (p[1].y - p[3].y) + p[1].x * (p[2].y - p[0].y) + p[2].x * (p[3].y - p[1].y) + p[3].x * (p[0].y - p[2].y)) / 2);
    }

    function distance(a, b) {
      return Math.hypot(b.x - a.x, b.y - a.y);
    }

    function isValidQuad(points, width, height) {
      if (!points || points.length !== 4) return false;
      for (var i = 0; i < points.length; i++) {
        if (!Number.isFinite(points[i].x) || !Number.isFinite(points[i].y)) return false;
      }
      return evaluateQuadrilateral(points, width, height).valid;
    }

    // ==========================================================
    // PERSPECTIVA Y MEJORA SCANNER (FILTROS)
    // ==========================================================

    async function processDocument(doc) {
      if (!doc || !cvReady) return;

      var src = null, dst = null, sourcePoints = null, destinationPoints = null, transform = null;

      try {
        src = cv.imread(doc.imgElement);
        if (!src || src.empty()) throw new Error('Immagine non valida.');

        var points = orderPoints(doc.points);
        var tl = points[0], tr = points[1], br = points[2], bl = points[3];

        var outputWidth = Math.round(Math.max(distance(tl, tr), distance(bl, br)));
        var outputHeight = Math.round(Math.max(distance(tl, bl), distance(tr, br)));

        outputWidth = Math.min(CONFIG.maxOutputWidth, Math.max(300, outputWidth));
        outputHeight = Math.min(CONFIG.maxOutputHeight, Math.max(300, outputHeight));

        sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
        destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outputWidth, 0, outputWidth, outputHeight, 0, outputHeight]);

        transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
        dst = new cv.Mat();

        cv.warpPerspective(src, dst, transform, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

        // APLICACIÓN DEL FILTRO DE ESCÁNER PROFESIONAL
        applyFilter(dst, doc.filter);

        var canvas = document.createElement('canvas');
        cv.imshow(canvas, dst);
        doc.processedCanvas = canvas;
      } catch (error) {
        console.error('[Scanner] Errore processDocument:', error);
        var fallback = document.createElement('canvas');
        fallback.width = doc.imgElement.naturalWidth;
        fallback.height = doc.imgElement.naturalHeight;
        var ctx = fallback.getContext('2d');
        ctx.drawImage(doc.imgElement, 0, 0);
        doc.processedCanvas = fallback;
      } finally {
        if (src) src.delete();
        if (dst) dst.delete();
        if (sourcePoints) sourcePoints.delete();
        if (destinationPoints) destinationPoints.delete();
        if (transform) transform.delete();
      }
    }

    function applyFilter(mat, filter) {
      if (filter === 'bw') {
        applyBlackWhite(mat);
      } else if (filter === 'grayscale') {
        applyGrayscale(mat);
      } else {
        applyColor(mat);
      }
    }

    function applyGrayscale(mat) {
      var gray = new cv.Mat(), background = new cv.Mat(), flat = new cv.Mat();
      try {
        convertToGray(mat, gray);
        cv.GaussianBlur(gray, background, new cv.Size(51, 51), 0);
        cv.divide(gray, background, flat, 235);
        cv.normalize(flat, flat, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
        cv.cvtColor(flat, mat, cv.COLOR_GRAY2RGBA);
      } finally {
        gray.delete(); background.delete(); flat.delete();
      }
    }

    function applyBlackWhite(mat) {
      var gray = new cv.Mat(), background = new cv.Mat(), flat = new cv.Mat(), normalized = new cv.Mat(), result = new cv.Mat();
      try {
        convertToGray(mat, gray);
        cv.GaussianBlur(gray, background, new cv.Size(51, 51), 0);
        cv.divide(gray, background, flat, 240);
        cv.normalize(flat, normalized, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
        cv.adaptiveThreshold(normalized, result, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 10);
        cv.cvtColor(result, mat, cv.COLOR_GRAY2RGBA);
      } finally {
        gray.delete(); background.delete(); flat.delete(); normalized.delete(); result.delete();
      }
    }

    function applyColor(mat) {
      var rgb = new cv.Mat(), ycrcb = new cv.Mat(), channels = new cv.MatVector();
      var background = new cv.Mat(), flat = new cv.Mat(), blurred = new cv.Mat(), sharp = new cv.Mat();
      try {
        cv.cvtColor(mat, rgb, cv.COLOR_RGBA2RGB);
        cv.cvtColor(rgb, ycrcb, cv.COLOR_RGB2YCrCb);
        cv.split(ycrcb, channels);
        var luminance = channels.get(0);

        cv.GaussianBlur(luminance, background, new cv.Size(51, 51), 0);
        cv.divide(luminance, background, flat, 235);
        cv.normalize(flat, flat, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
        cv.GaussianBlur(flat, blurred, new cv.Size(0, 0), 1.5);
        cv.addWeighted(flat, 1.20, blurred, -0.20, 0, sharp);

        channels.set(0, sharp);
        cv.merge(channels, ycrcb);
        cv.cvtColor(ycrcb, rgb, cv.COLOR_YCrCb2RGB);
        cv.cvtColor(rgb, mat, cv.COLOR_RGB2RGBA);
      } finally {
        rgb.delete(); ycrcb.delete(); channels.delete(); background.delete(); flat.delete(); blurred.delete(); sharp.delete();
      }
    }

    function convertToGray(src, dst) {
      if (src.channels() === 4) cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
      else if (src.channels() === 3) cv.cvtColor(src, dst, cv.COLOR_RGB2GRAY);
      else src.copyTo(dst);
    }

    // ==========================================================
    // RENDERIZADO DE TARJETAS DE VISTA PREVIA (BOTONES Y ACCIONES)
    // ==========================================================

    function updatePreviewGrid() {
      previewGrid.innerHTML = '';
      btnGeneratePdf.disabled = documents.length === 0;

      for (var i = 0; i < documents.length; i++) {
        var doc = documents[i];
        if (!doc.processedCanvas) continue;

        var wrapper = document.createElement('div');
        wrapper.className = 'relative border rounded-lg shadow-sm overflow-hidden bg-gray-100 aspect-[3/4] flex items-center justify-center group';

        doc.processedCanvas.className = 'max-w-full max-h-full object-contain';
        wrapper.appendChild(doc.processedCanvas);

        // Badge Auto / Manual
        var badge = document.createElement('div');
        badge.className = 'absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded font-semibold pointer-events-none';
        badge.textContent = doc.detectedAutomatically ? '✓ Auto' : 'Manuale';
        wrapper.appendChild(badge);

        // Botón Eliminar (Cruz ✕)
        var removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'absolute top-2 right-2 bg-red-500 text-white rounded-full w-9 h-9 flex items-center justify-center font-bold shadow hover:bg-red-600 transition z-10';
        removeButton.textContent = '✕';
        removeButton.setAttribute('aria-label', 'Rimuovi documento');
        removeButton.addEventListener('click', (function (id) {
          return function (event) {
            event.stopPropagation();
            documents = documents.filter(function (item) { return item.id !== id; });
            updatePreviewGrid();
          };
        })(doc.id));
        wrapper.appendChild(removeButton);

        // Botón Editar (Lápiz ✏️)
        var editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'absolute top-2 left-2 bg-indigo-600 text-white rounded-full w-9 h-9 flex items-center justify-center shadow hover:bg-indigo-700 transition z-10';
        editButton.textContent = '✏️';
        editButton.setAttribute('aria-label', 'Modifica ritaglio');
        editButton.addEventListener('click', (function (id) {
          return function (event) {
            event.stopPropagation();
            openCropModal(id);
          };
        })(doc.id));
        wrapper.appendChild(editButton);

        previewGrid.appendChild(wrapper);
      }
    }

    // ==========================================================
    // MODAL DE EDICIÓN MANUAL DE 4 PUNTOS (CROP)
    // ==========================================================

    function openCropModal(id) {
      var doc = findDocument(id);
      if (!doc) return;

      currentEditingId = id;
      cropModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          renderCropCanvas(doc);
        });
      });
    }

    function renderCropCanvas(doc) {
      if (!doc || !doc.imgElement) return;

      var availableWidth = cropContainer.clientWidth - 32;
      var availableHeight = cropContainer.clientHeight - 32;
      if (availableWidth < 100) availableWidth = 100;
      if (availableHeight < 100) availableHeight = 100;

      displayScale = Math.min(
        availableWidth / doc.imgElement.naturalWidth,
        availableHeight / doc.imgElement.naturalHeight,
        1
      );

      cropCanvas.width = Math.max(1, Math.round(doc.imgElement.naturalWidth * displayScale));
      cropCanvas.height = Math.max(1, Math.round(doc.imgElement.naturalHeight * displayScale));

      drawCropState(doc);
    }

    function drawCropState(doc) {
      cropContext.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      cropContext.drawImage(doc.imgElement, 0, 0, cropCanvas.width, cropCanvas.height);

      var points = orderPoints(doc.points).map(function (p) {
        return { x: p.x * displayScale, y: p.y * displayScale };
      });

      cropContext.save();
      cropContext.fillStyle = 'rgba(0,0,0,0.60)';
      cropContext.beginPath();
      cropContext.rect(0, 0, cropCanvas.width, cropCanvas.height);
      cropContext.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) {
        cropContext.lineTo(points[i].x, points[i].y);
      }
      cropContext.closePath();
      cropContext.fill('evenodd');
      cropContext.restore();

      cropContext.strokeStyle = '#6366f1';
      cropContext.lineWidth = 3;
      cropContext.beginPath();
      cropContext.moveTo(points[0].x, points[0].y);
      for (var j = 1; j < points.length; j++) {
        cropContext.lineTo(points[j].x, points[j].y);
      }
      cropContext.closePath();
      cropContext.stroke();

      for (var p = 0; p < points.length; p++) {
        cropContext.beginPath();
        cropContext.arc(points[p].x, points[p].y, 14, 0, Math.PI * 2);
        cropContext.fillStyle = '#ffffff';
        cropContext.fill();
        cropContext.strokeStyle = '#4f46e5';
        cropContext.lineWidth = 3;
        cropContext.stroke();
      }
    }

    cropCanvas.addEventListener('pointerdown', function (event) {
      if (currentEditingId === null) return;
      var doc = findDocument(currentEditingId);
      if (!doc) return;

      event.preventDefault();
      var rect = cropCanvas.getBoundingClientRect();
      var x = (event.clientX - rect.left) * (cropCanvas.width / rect.width);
      var y = (event.clientY - rect.top) * (cropCanvas.height / rect.height);

      var points = orderPoints(doc.points);
      var scaled = points.map(function (p) { return { x: p.x * displayScale, y: p.y * displayScale }; });

      draggedPointIndex = findNearestPoint(scaled, x, y);
      if (draggedPointIndex !== -1) {
        doc.points = points;
        try { cropCanvas.setPointerCapture(event.pointerId); } catch (e) {}
      }
    });

    cropCanvas.addEventListener('pointermove', function (event) {
      if (draggedPointIndex === -1 || currentEditingId === null) return;
      var doc = findDocument(currentEditingId);
      if (!doc) return;

      event.preventDefault();
      var rect = cropCanvas.getBoundingClientRect();
      var x = (event.clientX - rect.left) * (cropCanvas.width / rect.width);
      var y = (event.clientY - rect.top) * (cropCanvas.height / rect.height);

      doc.points[draggedPointIndex] = {
        x: Math.min(doc.imgElement.naturalWidth, Math.max(0, x / displayScale)),
        y: Math.min(doc.imgElement.naturalHeight, Math.max(0, y / displayScale))
      };

      drawCropState(doc);
    });

    cropCanvas.addEventListener('pointerup', finishPointer);
    cropCanvas.addEventListener('pointercancel', finishPointer);

    function finishPointer(event) {
      draggedPointIndex = -1;
      try { cropCanvas.releasePointerCapture(event.pointerId); } catch (e) {}
    }

    function findNearestPoint(points, x, y) {
      var bestIndex = -1;
      var bestDistance = Infinity;
      for (var i = 0; i < points.length; i++) {
        var d = Math.hypot(points[i].x - x, points[i].y - y);
        if (d < 60 && d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
        }
      }
      return bestIndex;
    }

    btnCancelCrop.addEventListener('click', closeCropModal);

    btnApplyCrop.addEventListener('click', async function () {
      var doc = findDocument(currentEditingId);
      if (!doc) {
        closeCropModal();
        return;
      }

      var points = orderPoints(doc.points);
      if (!isValidQuad(points, doc.imgElement.naturalWidth, doc.imgElement.naturalHeight)) {
        alert('I quattro punti non formano un ritaglio valido.');
        return;
      }

      doc.points = points;
      doc.detectedAutomatically = false;
      closeCropModal();

      setStatus('Applicazione del ritaglio...', 'indigo');
      await processDocument(doc);
      updatePreviewGrid();
      setStatus('Ritaglio applicato correttamente.', 'green');
    });

    function closeCropModal() {
      cropModal.classList.add('hidden');
      document.body.style.overflow = '';
      currentEditingId = null;
      draggedPointIndex = -1;
    }

    function findDocument(id) {
      for (var i = 0; i < documents.length; i++) {
        if (documents[i].id === id) return documents[i];
      }
      return null;
    }

    // ==========================================================
    // EXPORTACIÓN A PDF MULTIPÁGINA
    // ==========================================================

    btnGeneratePdf.addEventListener('click', async function () {
      if (!documents.length || typeof PDFLib === 'undefined') return;

      btnGeneratePdf.disabled = true;
      btnGeneratePdf.innerHTML = '<span>⏳</span> Creazione PDF in corso...';

      try {
        var pdfDocument = await PDFLib.PDFDocument.create();
        var pages = 0;

        for (var i = 0; i < documents.length; i++) {
          var doc = documents[i];
          if (!doc.processedCanvas) continue;

          var blob = await new Promise(function (res) {
            doc.processedCanvas.toBlob(res, 'image/jpeg', CONFIG.jpegQuality);
          });

          if (!blob) continue;

          var bytes = await blob.arrayBuffer();
          var image = await pdfDocument.embedJpg(bytes);

          var landscape = image.width > image.height;
          var pageWidth = landscape ? 841.89 : 595.28;
          var pageHeight = landscape ? 595.28 : 841.89;

          var scale = Math.min(pageWidth / image.width, pageHeight / image.height);
          var drawWidth = image.width * scale;
          var drawHeight = image.height * scale;

          var page = pdfDocument.addPage([pageWidth, pageHeight]);
          page.drawImage(image, {
            x: (pageWidth - drawWidth) / 2,
            y: (pageHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight
          });

          pages++;
        }

        if (!pages) throw new Error('Nessuna pagina da esportare.');

        var pdfBytes = await pdfDocument.save();
        var pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(pdfBlob);

        var link = document.createElement('a');
        link.href = url;
        link.download = 'Documento_Scansionato_' + Date.now() + '.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      } catch (error) {
        console.error('[Scanner] Errore generazione PDF:', error);
        alert('Errore nella generazione del PDF.');
      } finally {
        btnGeneratePdf.disabled = documents.length === 0;
        btnGeneratePdf.innerHTML = '<span>📄</span> Genera PDF';
      }
    });
  }
})();