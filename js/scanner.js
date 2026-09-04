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

    // LISTENER DE EVENTOS Y LÓGICA
    dropZone.addEventListener('click', function () {
      uploadInput.value = '';
      uploadInput.click();
    });

    uploadInput.addEventListener('change', function (event) {
      var files = Array.prototype.slice.call(event.target.files || []);
      if (files.length) handleFiles(files);
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
          if (files.length) handleFiles(files);
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
          console.error('[Scanner] Errore:', error);
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
          resolve(image);
        };
        image.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('Error imagen'));
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

    function detectDocumentCorners(image) {
      var src = null, small = null, gray = null, blurred = null;
      var candidates = [];
      try {
        src = cv.imread(image);
        if (!src || src.empty()) return null;
        var scale = Math.min(1, CONFIG.detectionMaxDimension / Math.max(src.cols, src.rows));
        var width = Math.max(1, Math.round(src.cols * scale));
        var height = Math.max(1, Math.round(src.rows * scale));

        small = new cv.Mat();
        cv.resize(src, small, new cv.Size(width, height), 0, 0, cv.INTER_AREA);

        gray = new cv.Mat();
        if (small.channels() === 4) cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
        else if (small.channels() === 3) cv.cvtColor(small, gray, cv.COLOR_RGB2GRAY);
        else small.copyTo(gray);

        blurred = new cv.Mat();
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

        runCannyPass(blurred, 30, 100, scale, src.cols, src.rows, candidates);
        runCannyPass(blurred, 50, 150, scale, src.cols, src.rows, candidates);
        runCannyPass(blurred, 70, 180, scale, src.cols, src.rows, candidates);
        runAdaptivePass(blurred, scale, src.cols, src.rows, candidates);

        if (!candidates.length) return null;
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].score < 0.22 ? null : candidates[0].points;
      } catch (e) {
        return null;
      } finally {
        if (src) src.delete();
        if (small) small.delete();
        if (gray) gray.delete();
        if (blurred) blurred.delete();
      }
    }

    function runCannyPass(gray, low, high, scale, origW, origH, candidates) {
      var edges = new cv.Mat(), dilated = new cv.Mat(), kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      try {
        cv.Canny(gray, edges, low, high, 3, false);
        cv.dilate(edges, dilated, kernel);
        collectCandidates(dilated, scale, origW, origH, candidates);
      } finally {
        edges.delete(); dilated.delete(); kernel.delete();
      }
    }

    function runAdaptivePass(gray, scale, origW, origH, candidates) {
      var threshold = new cv.Mat();
      try {
        cv.adaptiveThreshold(gray, threshold, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 8);
        collectCandidates(threshold, scale, origW, origH, candidates);
      } finally {
        threshold.delete();
      }
    }

    function collectCandidates(binary, scale, origW, origH, candidates) {
      var contours = new cv.MatVector(), hierarchy = new cv.Mat();
      try {
        cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        var imageArea = binary.cols * binary.rows;
        for (var i = 0; i < contours.size(); i++) {
          var contour = contours.get(i);
          var areaRatio = Math.abs(cv.contourArea(contour)) / imageArea;
          if (areaRatio < CONFIG.minAreaRatio || areaRatio > CONFIG.maxAreaRatio) {
            contour.delete(); continue;
          }
          var perimeter = cv.arcLength(contour, true);
          var approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, perimeter * 0.02, true);
          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            var pts = [];
            for (var p = 0; p < 4; p++) {
              pts.push({ x: approx.data32S[p * 2] / scale, y: approx.data32S[p * 2 + 1] / scale });
            }
            pts = orderPoints(pts);
            var metrics = evaluateQuadrilateral(pts, origW, origH);
            if (metrics.valid) candidates.push({ points: pts, score: metrics.score });
          }
          approx.delete();
          contour.delete();
        }
      } finally {
        contours.delete(); hierarchy.delete();
      }
    }

    function evaluateQuadrilateral(pts, w, h) {
      var ordered = orderPoints(pts);
      var areaRatio = polygonArea(ordered) / (w * h);
      if (areaRatio < CONFIG.minAreaRatio || areaRatio > CONFIG.maxAreaRatio) return { valid: false, score: 0 };
      return { valid: true, score: areaRatio };
    }

    function orderPoints(pts) {
      if (!pts || pts.length !== 4) return pts;
      var sorted = pts.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
      var tl = sorted[0];
      var br = sorted[3];
      var rem = sorted.slice(1, 3).sort((a, b) => (a.x - a.y) - (b.x - b.y));
      var tr = rem[1];
      var bl = rem[0];
      return [tl, tr, br, bl];
    }

    function polygonArea(p) {
      return Math.abs((p[0].x * (p[1].y - p[3].y) + p[1].x * (p[2].y - p[0].y) + p[2].x * (p[3].y - p[1].y) + p[3].x * (p[0].y - p[2].y)) / 2);
    }

    function distance(a, b) {
      return Math.hypot(b.x - a.x, b.y - a.y);
    }

    function isValidQuad(pts, w, h) {
      return pts && pts.length === 4;
    }

    async function processDocument(doc) {
      var src = cv.imread(doc.imgElement);
      var pts = orderPoints(doc.points);
      var w = Math.round(Math.max(distance(pts[0], pts[1]), distance(pts[3], pts[2])));
      var h = Math.round(Math.max(distance(pts[0], pts[3]), distance(pts[1], pts[2])));

      var srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y]);
      var dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
      var M = cv.getPerspectiveTransform(srcPts, dstPts);
      var dst = new cv.Mat();

      cv.warpPerspective(src, dst, M, new cv.Size(w, h));
      var canvas = document.createElement('canvas');
      cv.imshow(canvas, dst);
      doc.processedCanvas = canvas;

      src.delete(); dst.delete(); srcPts.delete(); dstPts.delete(); M.delete();
    }

    function updatePreviewGrid() {
      previewGrid.innerHTML = '';
      btnGeneratePdf.disabled = documents.length === 0;

      for (var i = 0; i < documents.length; i++) {
        var doc = documents[i];
        var wrapper = document.createElement('div');
        wrapper.className = 'relative border rounded-lg shadow-sm overflow-hidden bg-gray-100 aspect-[3/4] flex items-center justify-center';
        wrapper.appendChild(doc.processedCanvas);
        previewGrid.appendChild(wrapper);
      }
    }

    function closeCropModal() {
      cropModal.classList.add('hidden');
      document.body.style.overflow = '';
      currentEditingId = null;
    }

    btnCancelCrop.addEventListener('click', closeCropModal);

    btnGeneratePdf.addEventListener('click', async function () {
      if (!documents.length || typeof PDFLib === 'undefined') return;
      var pdfDoc = await PDFLib.PDFDocument.create();
      for (var i = 0; i < documents.length; i++) {
        var blob = await new Promise(res => documents[i].processedCanvas.toBlob(res, 'image/jpeg', 0.92));
        var img = await pdfDoc.embedJpg(await blob.arrayBuffer());
        var page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      var pdfBytes = await pdfDoc.save();
      var link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
      link.download = 'Scan_' + Date.now() + '.pdf';
      link.click();
    });
  }
})();