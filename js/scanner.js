// js/scanner.js — Controlador UI del Scanner con Web Worker OpenCV (Comlink)
(function () {
  'use strict';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScanner);
  } else {
    initScanner();
  }

  async function initScanner() {
    const Comlink = await import('https://unpkg.com/comlink/dist/esm/comlink.mjs');
    const worker = new Worker('/js/workers/scanner-worker.js');
    const scannerWorker = Comlink.wrap(worker);

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

    if (!uploadInput || !dropZone || !previewGrid || !btnGeneratePdf || !statusMsg) return;

    const cropContext = cropCanvas?.getContext('2d');
    let documents = [];
    let nextDocumentId = 1;
    let currentEditingId = null;
    let draggedPointIndex = -1;
    let displayScale = 1;

    setStatus('Caricamento motore IA (Computer Vision)... Attendi.', 'amber');
    await scannerWorker.isReady();
    setStatus('Motore IA pronto. Carica i tuoi documenti.', 'green');

    function setStatus(message, type) {
      statusMsg.textContent = message;
      if (type === 'green') statusMsg.className = 'mt-5 text-sm font-medium text-emerald-600';
      else if (type === 'red') statusMsg.className = 'mt-5 text-sm font-medium text-red-600';
      else if (type === 'indigo') statusMsg.className = 'mt-5 text-sm font-medium text-indigo-600';
      else statusMsg.className = 'mt-5 text-sm font-medium text-amber-600';
    }

    dropZone.addEventListener('click', () => { uploadInput.value = ''; uploadInput.click(); });
    uploadInput.addEventListener('change', (e) => { if (e.target.files?.length) handleFiles(Array.from(e.target.files)); });

    ['dragenter', 'dragover'].forEach(name => {
      dropZone.addEventListener(name, (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-500', 'bg-indigo-50'); });
    });
    ['dragleave', 'drop'].forEach(name => {
      dropZone.addEventListener(name, (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
        if (name === 'drop' && e.dataTransfer?.files?.length) handleFiles(Array.from(e.dataTransfer.files));
      });
    });

    filterSelect.addEventListener('change', async () => {
      if (!documents.length) return;
      setStatus('Aggiornamento delle scansioni...', 'indigo');
      for (const doc of documents) {
        doc.filter = filterSelect.value;
        await processDocWithWorker(doc);
      }
      updatePreviewGrid();
      setStatus('Filtro applicato correttamente.', 'green');
    });

    async function handleFiles(files) {
      const imageFiles = files.filter(f => f?.type?.startsWith('image/'));
      if (!imageFiles.length) return;

      setStatus(`Elaborazione di ${imageFiles.length} documento/i in background...`, 'indigo');

      for (const file of imageFiles) {
        try {
          const image = await loadImageFromFile(file);
          const imageData = imageToImageData(image);

          let detectedPoints = null;
          if (chkAutoCrop.checked) {
            // Transferir la memoria de la imagen al Worker para que OpenCV la analice
            detectedPoints = await scannerWorker.detectCorners(Comlink.transfer(imageData, [imageData.data.buffer]));
          }

          const autoDetected = !!detectedPoints;
          const points = autoDetected ? detectedPoints : getDefaultCorners(image.naturalWidth, image.naturalHeight);

          const documentItem = {
            id: nextDocumentId++,
            file,
            imgElement: image,
            points,
            filter: filterSelect.value,
            processedCanvas: null,
            detectedAutomatically: autoDetected
          };

          documents.push(documentItem);
          await processDocWithWorker(documentItem);
          updatePreviewGrid();
        } catch (error) {
          console.error('[Scanner] Error:', file.name, error);
        }
      }

      setStatus('Elaborazione completata.', 'green');
      updatePreviewGrid();
    }

    function imageToImageData(image) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    async function processDocWithWorker(doc) {
      const imgData = imageToImageData(doc.imgElement);
      // Procesar perspectiva y filtros en el Worker sin congelar la pantalla
      const processedImageData = await scannerWorker.processDocument(
        Comlink.transfer(imgData, [imgData.data.buffer]),
        doc.points,
        doc.filter
      );

      const canvas = document.createElement('canvas');
      canvas.width = processedImageData.width;
      canvas.height = processedImageData.height;
      canvas.getContext('2d').putImageData(processedImageData, 0, 0);
      doc.processedCanvas = canvas;
    }

    function loadImageFromFile(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Caricamento fallito')); };
        image.src = url;
      });
    }

    function getDefaultCorners(w, h) {
      const mx = w * 0.03, my = h * 0.03;
      return [{ x: mx, y: my }, { x: w - mx, y: my }, { x: w - mx, y: h - my }, { x: mx, y: h - my }];
    }

    function updatePreviewGrid() {
      previewGrid.innerHTML = '';
      btnGeneratePdf.disabled = documents.length === 0;

      documents.forEach((doc) => {
        if (!doc.processedCanvas) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'relative border rounded-lg shadow-sm overflow-hidden bg-gray-100 aspect-[3/4] flex items-center justify-center group';

        doc.processedCanvas.className = 'max-w-full max-h-full object-contain';
        wrapper.appendChild(doc.processedCanvas);

        const badge = document.createElement('div');
        badge.className = 'absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded font-semibold pointer-events-none';
        badge.textContent = doc.detectedAutomatically ? '✓ Auto' : 'Manuale';
        wrapper.appendChild(badge);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'absolute top-2 right-2 bg-red-500 text-white rounded-full w-9 h-9 flex items-center justify-center font-bold shadow hover:bg-red-600 transition z-10';
        removeBtn.textContent = '✕';
        removeBtn.onclick = (e) => { e.stopPropagation(); documents = documents.filter(d => d.id !== doc.id); updatePreviewGrid(); };
        wrapper.appendChild(removeBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'absolute top-2 left-2 bg-indigo-600 text-white rounded-full w-9 h-9 flex items-center justify-center shadow hover:bg-indigo-700 transition z-10';
        editBtn.textContent = '✏️';
        editBtn.onclick = (e) => { e.stopPropagation(); openCropModal(doc.id); };
        wrapper.appendChild(editBtn);

        previewGrid.appendChild(wrapper);
      });
    }

    function openCropModal(id) {
      const doc = documents.find(d => d.id === id);
      if (!doc) return;
      currentEditingId = id;
      cropModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => renderCropCanvas(doc));
    }

    function renderCropCanvas(doc) {
      const availableW = Math.max(100, cropContainer.clientWidth - 32);
      const availableH = Math.max(100, cropContainer.clientHeight - 32);
      displayScale = Math.min(availableW / doc.imgElement.naturalWidth, availableH / doc.imgElement.naturalHeight, 1);

      cropCanvas.width = Math.round(doc.imgElement.naturalWidth * displayScale);
      cropCanvas.height = Math.round(doc.imgElement.naturalHeight * displayScale);
      drawCropState(doc);
    }

    function drawCropState(doc) {
      cropContext.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
      cropContext.drawImage(doc.imgElement, 0, 0, cropCanvas.width, cropCanvas.height);

      const pts = doc.points.map(p => ({ x: p.x * displayScale, y: p.y * displayScale }));
      cropContext.save();
      cropContext.fillStyle = 'rgba(0,0,0,0.60)';
      cropContext.beginPath();
      cropContext.rect(0, 0, cropCanvas.width, cropCanvas.height);
      cropContext.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => cropContext.lineTo(p.x, p.y));
      cropContext.closePath();
      cropContext.fill('evenodd');
      cropContext.restore();

      cropContext.strokeStyle = '#6366f1'; cropContext.lineWidth = 3;
      cropContext.beginPath(); cropContext.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => cropContext.lineTo(p.x, p.y));
      cropContext.closePath(); cropContext.stroke();

      pts.forEach(p => {
        cropContext.beginPath(); cropContext.arc(p.x, p.y, 14, 0, Math.PI * 2);
        cropContext.fillStyle = '#ffffff'; cropContext.fill();
        cropContext.strokeStyle = '#4f46e5'; cropContext.lineWidth = 3; cropContext.stroke();
      });
    }

    cropCanvas.addEventListener('pointerdown', (e) => {
      const doc = documents.find(d => d.id === currentEditingId);
      if (!doc) return;
      const rect = cropCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (cropCanvas.width / rect.width);
      const y = (e.clientY - rect.top) * (cropCanvas.height / rect.height);
      const scaled = doc.points.map(p => ({ x: p.x * displayScale, y: p.y * displayScale }));
      
      draggedPointIndex = scaled.findIndex(p => Math.hypot(p.x - x, p.y - y) < 60);
      if (draggedPointIndex !== -1) cropCanvas.setPointerCapture(e.pointerId);
    });

    cropCanvas.addEventListener('pointermove', (e) => {
      if (draggedPointIndex === -1) return;
      const doc = documents.find(d => d.id === currentEditingId);
      if (!doc) return;
      const rect = cropCanvas.getBoundingClientRect();
      doc.points[draggedPointIndex] = {
        x: Math.min(doc.imgElement.naturalWidth, Math.max(0, ((e.clientX - rect.left) * (cropCanvas.width / rect.width)) / displayScale)),
        y: Math.min(doc.imgElement.naturalHeight, Math.max(0, ((e.clientY - rect.top) * (cropCanvas.height / rect.height)) / displayScale))
      };
      drawCropState(doc);
    });

    const finishPointer = (e) => { draggedPointIndex = -1; try { cropCanvas.releasePointerCapture(e.pointerId); } catch (_) {} };
    cropCanvas.addEventListener('pointerup', finishPointer);
    cropCanvas.addEventListener('pointercancel', finishPointer);

    btnCancelCrop.addEventListener('click', () => { cropModal.classList.add('hidden'); document.body.style.overflow = ''; });
    btnApplyCrop.addEventListener('click', async () => {
      const doc = documents.find(d => d.id === currentEditingId);
      if (!doc) return;
      cropModal.classList.add('hidden'); document.body.style.overflow = '';
      setStatus('Applicazione del ritaglio...', 'indigo');
      await processDocWithWorker(doc);
      updatePreviewGrid();
      setStatus('Ritaglio applicato.', 'green');
    });

    // EXPORTACIÓN PDF VÍA WORKER
    btnGeneratePdf.addEventListener('click', async () => {
      if (!documents.length) return;
      btnGeneratePdf.disabled = true;
      btnGeneratePdf.innerHTML = '<span>⏳</span> Creazione PDF in corso...';

      try {
        const imageBuffers = [];
        const transferables = [];

        for (const doc of documents) {
          if (!doc.processedCanvas) continue;
          const blob = await new Promise(r => doc.processedCanvas.toBlob(r, 'image/jpeg', 0.94));
          const buffer = await blob.arrayBuffer();
          imageBuffers.push(buffer);
          transferables.push(buffer);
        }

        const pdfBuffer = await scannerWorker.generatePdf(Comlink.transfer(imageBuffers, transferables));
        const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);

        const a = document.createElement('a'); a.href = url; a.download = `Documento_Scansionato_${Date.now()}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      } catch (err) {
        alert('Errore nella generazione del PDF.');
      } finally {
        btnGeneratePdf.disabled = documents.length === 0;
        btnGeneratePdf.innerHTML = '<span>📄</span> Genera PDF';
      }
    });
  }
})();