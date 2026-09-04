(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', initFototesseraApp);

  function initFototesseraApp() {
    const photoInput      = document.getElementById('photo-input');
    const dropZone        = document.getElementById('drop-zone');
    const editorContainer = document.getElementById('editor-container');
    const canvas          = document.getElementById('photo-canvas');
    const ctx             = canvas ? canvas.getContext('2d') : null;

    const zoomSlider    = document.getElementById('zoom-slider');
    const bgColorSelect = document.getElementById('bg-color');
    const aiSpinner     = document.getElementById('ai-spinner');
    const aiStatusText  = document.getElementById('ai-status-text');
    const btnToggleBg   = document.getElementById('btn-toggle-bg');

    const btnDownloadSingle  = document.getElementById('btn-download-single');
    const btnDownloadPdfGrid = document.getElementById('btn-download-pdf-grid');

    if (!canvas || !btnDownloadSingle) return;

    let originalImage        = null;
    let processedImageCanvas = null;
    let useOriginalBg        = false;

    let imgState = { x: 0, y: 0, scale: 1, isDragging: false, startX: 0, startY: 0 };

    dropZone.addEventListener('click', () => { photoInput.value = ''; photoInput.click(); });
    photoInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

    ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.add('border-indigo-500', 'bg-indigo-50');
    }));
    
    ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
      if (evt === 'drop' && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    }));

    function handleFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        alert('Seleziona un file immagine valido (JPG, PNG, WebP).');
        return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          originalImage        = img;
          processedImageCanvas = null;
          useOriginalBg        = false;

          resetImageTransform();
          editorContainer.classList.remove('hidden');
          btnDownloadSingle.disabled  = false;
          btnDownloadPdfGrid.disabled = false;
          
          renderCanvas();
          processBgRemovalHighDef(file);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function resetImageTransform() {
      if (!originalImage) return;
      const baseScale = canvas.width / originalImage.width;
      imgState.scale = baseScale;
      
      imgState.x = (canvas.width  - originalImage.width  * baseScale) / 2;
      imgState.y = (canvas.height - originalImage.height * baseScale) / 2;
      zoomSlider.value = 1;
    }

    function renderCanvas() {
      if (!originalImage || !ctx) return;

      const activeImg = (!useOriginalBg && processedImageCanvas) ? processedImageCanvas : originalImage;
      const bgColor   = bgColorSelect.value || '#FFFFFF';

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const s = imgState.scale * parseFloat(zoomSlider.value);
      ctx.drawImage(activeImg, imgState.x, imgState.y, activeImg.width * s, activeImg.height * s);
    }

    // ==========================================================
    // RIMOZIONE SFONDO HD (Libreria @imgly/background-removal)
    // ==========================================================
    async function processBgRemovalHighDef(file) {
      const bgRemovalFn = window.imglyRemoveBackground || globalThis.imglyRemoveBackground;

      if (typeof bgRemovalFn === 'undefined') {
        setAiStatus(false, '⚠️ Libreria IA non trovata. Verrà usata la foto originale.');
        return;
      }

      setAiStatus(true, '⏳ Scaricamento modello IA (attendi fino a 20 sec al primo avvio)...');

      try {
        // SOLUZIONE DEFINITIVA: Se especifica publicPath apuntando exacto a UNPKG
        const blob = await bgRemovalFn(file, {
            publicPath: 'https://unpkg.com/@imgly/background-removal@1.4.3/dist/',
            debug: false,
            output: { format: 'image/png' }
        });
        
        const url = URL.createObjectURL(blob);
        const img = new Image();
        
        img.onload = () => {
          processedImageCanvas = img;
          useOriginalBg = false;
          btnToggleBg.textContent = 'Mostra/Nascondi sfondo originale';
          
          setAiStatus(false, '✨ Sfondo rimosso con successo in HD!');
          renderCanvas();
        };
        img.src = url;

      } catch (err) {
        console.error('Imgly AI Error:', err);
        setAiStatus(false, '⚠️ Errore elaborazione IA. Verrà mantenuto lo sfondo originale.');
      }
    }

    function setAiStatus(loading, text) {
      aiSpinner.classList.toggle('hidden', !loading);
      aiStatusText.textContent = text;
    }

    btnToggleBg.addEventListener('click', () => {
      useOriginalBg = !useOriginalBg;
      btnToggleBg.textContent = useOriginalBg ? 'Applica sfondo IA' : 'Mostra/Nascondi sfondo originale';
      renderCanvas();
    });

    // DRAG & DROP SENZA VINCOLI DI BORDO
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

    zoomSlider.addEventListener('input', renderCanvas);
    bgColorSelect.addEventListener('change', renderCanvas);

    // ESPORTAZIONE
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
        const page   = pdfDoc.addPage([283.46, 425.20]);
        const { width, height } = page.getSize();

        const pngBytes = await fetch(canvas.toDataURL('image/png', 1.0)).then(r => r.arrayBuffer());
        const pdfImage = await pdfDoc.embedPng(pngBytes);

        const photoW  = 35 * 2.83465;
        const photoH  = 45 * 2.83465;
        const marginX = (width  - photoW * 2) / 3;
        const marginY = (height - photoH * 3) / 4;

        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 2; col++) {
            const x = marginX + col * (photoW + marginX);
            const y = height - (marginY + (row + 1) * photoH + row * marginY);
            page.drawImage(pdfImage, { x, y, width: photoW, height: photoH });
            page.drawRectangle({ x, y, width: photoW, height: photoH, borderColor: window.PDFLib.rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
          }
        }

        const blob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });
        const url  = URL.createObjectURL(blob);
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
        btnDownloadPdfGrid.textContent = '📄 Scarica Foglio Stampa PDF (10x15cm)';
      }
    });
  }
})();
