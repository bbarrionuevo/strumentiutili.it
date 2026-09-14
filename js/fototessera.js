// js/fototessera.js — Generador de Fototessera ICAO con Detección IA en Web Worker
(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', initFototesseraApp);

  async function initFototesseraApp() {
    const Comlink = await import('https://unpkg.com/comlink/dist/esm/comlink.mjs');
    const worker = new Worker('/js/workers/face-worker.js');
    const faceWorker = Comlink.wrap(worker);

    const photoInput = document.getElementById('photo-input');
    const editorContainer = document.getElementById('editor-container');
    const canvas = document.getElementById('photo-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    const zoomSlider = document.getElementById('zoom-slider');
    const rotateSlider = document.getElementById('rotate-slider');
    const zoomValText = document.getElementById('zoom-val');
    const rotateValText = document.getElementById('rotate-val');
    const btnRotate = document.getElementById('btn-rotate');

    const aiSpinner = document.getElementById('ai-spinner');
    const aiStatusText = document.getElementById('ai-status-text');

    const btnDownloadSingle = document.getElementById('btn-download-single');
    const btnDownloadPdfGrid = document.getElementById('btn-download-pdf-grid');
    const pdfLayoutSelect = document.getElementById('pdf-layout-select');

    if (!canvas || !btnDownloadSingle) return;

    let originalImage = null;
    let currentRotation = 0;
    let imgState = { x: 0, y: 0, scale: 1, isDragging: false, startX: 0, startY: 0 };

    const TARGET_HEAD_HEIGHT_PX = 320;
    const TARGET_EYE_Y_PX = 223;

    photoInput.addEventListener('change', e => {
      if (e.target.files.length) {
        handleFile(e.target.files[0]);
        e.target.value = '';
      }
    });

    function setAiStatus(loading, text) {
      if (aiSpinner) aiSpinner.classList.toggle('hidden', !loading);
      if (aiStatusText) aiStatusText.textContent = text;
    }

    function handleFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        alert('Seleziona un file immagine valido (JPG, PNG, WebP).');
        return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = async () => {
          if (originalImage) {
            originalImage.src = '';
            originalImage = null;
          }

          originalImage = img;
          if (rotateSlider) rotateSlider.value = 0;
          currentRotation = 0;

          editorContainer.classList.remove('hidden');
          btnDownloadSingle.disabled = false;
          btnDownloadPdfGrid.disabled = false;

          await autoCropFace(img);
          reader.onload = null;
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function resetImageTransform() {
      if (!originalImage) return;

      const isRotated = currentRotation === 90 || currentRotation === 270;
      const calcWidth = isRotated ? originalImage.height : originalImage.width;
      const calcHeight = isRotated ? originalImage.width : originalImage.height;

      const baseScale = Math.max(canvas.width / calcWidth, canvas.height / calcHeight);
      imgState.scale = baseScale;
      imgState.x = (canvas.width - calcWidth * baseScale) / 2;
      imgState.y = (canvas.height - calcHeight * baseScale) / 2;

      if (zoomSlider) {
        zoomSlider.value = 1;
        if (zoomValText) zoomValText.textContent = '1.0x';
      }
    }

    function imageToImageData(img) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.naturalWidth || img.width;
      tempCanvas.height = img.naturalHeight || img.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(img, 0, 0);
      return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    }

    async function autoCropFace(img) {
      try {
        setAiStatus(true, 'Rilevamento ed elaborazione biometrica nel Worker...');

        const imageData = imageToImageData(img);

        // TRANSFERIR LA IMAGEN AL WORKER SIN CLONAR MEMORIA
        const detection = await faceWorker.detectFace(
          Comlink.transfer(imageData, [imageData.data.buffer])
        );

        if (detection) {
          const { avgEyeX, avgEyeY, estimatedHeadHeight } = detection;
          const requiredScale = TARGET_HEAD_HEIGHT_PX / estimatedHeadHeight;
          imgState.scale = requiredScale;

          if (zoomSlider) {
            zoomSlider.value = 1;
            if (zoomValText) zoomValText.textContent = '1.0x';
          }

          imgState.x = (canvas.width / 2) - (avgEyeX * requiredScale);
          imgState.y = TARGET_EYE_Y_PX - (avgEyeY * requiredScale);

          setAiStatus(false, 'Inquadratura automatica completata.');
        } else {
          setAiStatus(false, 'Volto non rilevato. Utilizza i controlli manuali.');
          resetImageTransform();
        }
      } catch (e) {
        console.warn('Fallback manuale attivato:', e);
        setAiStatus(false, 'Modalità regolazione manuale attiva.');
        resetImageTransform();
      }
      renderCanvas();
    }

    function renderCanvas() {
      if (!originalImage || !ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const zoomVal = zoomSlider ? parseFloat(zoomSlider.value) : 1;
      const s = imgState.scale * zoomVal;

      ctx.save();
      const centerX = imgState.x + (originalImage.width * s) / 2;
      const centerY = imgState.y + (originalImage.height * s) / 2;

      ctx.translate(centerX, centerY);
      ctx.rotate((currentRotation * Math.PI) / 180);

      ctx.drawImage(
        originalImage,
        -(originalImage.width * s) / 2,
        -(originalImage.height * s) / 2,
        originalImage.width * s,
        originalImage.height * s
      );

      ctx.restore();
    }

    if (rotateSlider) {
      rotateSlider.addEventListener('input', e => {
        currentRotation = parseInt(e.target.value, 10);
        if (rotateValText) rotateValText.textContent = currentRotation + '°';
        renderCanvas();
      });
    }

    if (btnRotate) {
      btnRotate.addEventListener('click', () => {
        currentRotation = (currentRotation + 90) % 360;
        if (rotateSlider) rotateSlider.value = currentRotation;
        if (rotateValText) rotateValText.textContent = currentRotation + '°';

        const isRotated = currentRotation === 90 || currentRotation === 270;
        const calcWidth = isRotated ? originalImage.height : originalImage.width;
        const calcHeight = isRotated ? originalImage.width : originalImage.height;
        imgState.x = (canvas.width - calcWidth * imgState.scale) / 2;
        imgState.y = (canvas.height - calcHeight * imgState.scale) / 2;

        renderCanvas();
      });
    }

    if (zoomSlider) {
      zoomSlider.addEventListener('input', e => {
        if (zoomValText) zoomValText.textContent = parseFloat(e.target.value).toFixed(2) + 'x';
        renderCanvas();
      });
    }

    canvas.addEventListener('mousedown', e => {
      imgState.isDragging = true;
      imgState.startX = e.clientX - imgState.x;
      imgState.startY = e.clientY - imgState.y;
    });

    window.addEventListener('mousemove', e => {
      if (!imgState.isDragging) return;
      imgState.x = e.clientX - imgState.startX;
      imgState.y = e.clientY - imgState.startY;
      renderCanvas();
    });

    window.addEventListener('mouseup', () => { imgState.isDragging = false; });
    window.addEventListener('mouseleave', () => { imgState.isDragging = false; });

    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        imgState.isDragging = true;
        imgState.startX = e.touches[0].clientX - imgState.x;
        imgState.startY = e.touches[0].clientY - imgState.y;
      }
    }, { passive: false });

    window.addEventListener('touchmove', e => {
      if (!imgState.isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      imgState.x = e.touches[0].clientX - imgState.startX;
      imgState.y = e.touches[0].clientY - imgState.startY;
      renderCanvas();
    }, { passive: false });

    window.addEventListener('touchend', () => { imgState.isDragging = false; });

    btnDownloadSingle.addEventListener('click', () => {
      if (!originalImage) return;
      const link = document.createElement('a');
      link.download = `Fototessera_ICAO_35x45mm_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

    btnDownloadPdfGrid.addEventListener('click', async () => {
      if (!originalImage || typeof window.PDFLib === 'undefined') return;

      btnDownloadPdfGrid.disabled = true;
      btnDownloadPdfGrid.textContent = '⏳ Creazione Foglio PDF...';

      try {
        const pdfDoc = await window.PDFLib.PDFDocument.create();
        const page = pdfDoc.addPage([283.46, 425.20]);
        const { width, height } = page.getSize();

        const pngBytes = await fetch(canvas.toDataURL('image/png', 1.0)).then(r => r.arrayBuffer());
        const pdfImage = await pdfDoc.embedPng(pngBytes);

        const numPhotos = pdfLayoutSelect ? parseInt(pdfLayoutSelect.value, 10) : 4;
        const rows = numPhotos === 6 ? 3 : 2;
        const cols = 2;

        const photoW = 35 * 2.83465;
        const photoH = 45 * 2.83465;

        const marginX = (width - photoW * cols) / (cols + 1);
        const marginY = (height - photoH * rows) / (rows + 1);

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = marginX + col * (photoW + marginX);
            const y = height - (marginY + (row + 1) * photoH + row * marginY);
            page.drawImage(pdfImage, { x, y, width: photoW, height: photoH });
            page.drawRectangle({ x, y, width: photoW, height: photoH, borderColor: window.PDFLib.rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
          }
        }

        const blob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Foglio_Fototessere_10x15cm_${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

      } catch (err) {
        console.error('PDF Grid Error:', err);
        alert('Errore durante la creazione del PDF.');
      } finally {
        btnDownloadPdfGrid.disabled = false;
        btnDownloadPdfGrid.textContent = '📄 Scarica Foglio Stampa';
      }
    });
  }
})();