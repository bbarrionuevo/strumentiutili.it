// js/pdf-tools.js — Herramientas PDF (Web Workers + Comlink)

if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions?.workerSrc) {
  try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'; } catch (e) { }
}

(async ()=>{
  // Importar Comlink e instanciar el Worker con la ruta exacta corregida
  const Comlink = await import('https://unpkg.com/comlink/dist/esm/comlink.mjs');
  const worker = new Worker('/js/workers/pdf-worker.js'); 
  worker.onerror = (err) => console.error("Error crítico en Web Worker PDF:", err);
  const pdfWorker = Comlink.wrap(worker);

  function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function ensureUsableFile(file, kindLabel) {
    if (!file || !file.size) return { valid: false, message: `Seleziona un file ${kindLabel} valido.` };
    if (file.size <= 0) return { valid: false, message: `Il file ${kindLabel} è vuoto.` };
    return { valid: true };
  }

  function parsePages(input, pageCount){
    if (!input) return [];
    const parts = input.split(',').map(p=>p.trim());
    const out = new Set();
    for (const part of parts){
      if (part.includes('-')){
        const [s,e] = part.split('-').map(x=>parseInt(x,10));
        if (isNaN(s) || isNaN(e)) continue;
        for (let i=Math.max(1,s); i<=Math.min(e,pageCount); i++) out.add(i-1);
      } else {
        const n = parseInt(part,10);
        if (!isNaN(n) && n>=1 && n<=pageCount) out.add(n-1);
      }
    }
    return Array.from(out).sort((a,b)=>a-b);
  }

  function downloadBlob(buffer, filename, type = 'application/pdf') {
    const blob = new Blob([buffer], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; 
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ==========================================
  // 1. DIVIDI RAPIDO
  // ==========================================
  const doSplitBtn = document.getElementById('do-split');
  if (doSplitBtn) {
    doSplitBtn.addEventListener('click', async ()=>{
      const fileInput = document.getElementById('split-file');
      const pagesInput = document.getElementById('split-pages').value.trim();
      const msg = document.getElementById('split-msg'); msg.textContent = '';
      
      if (!fileInput.files.length) { msg.textContent = 'Seleziona un file PDF.'; return; }
      const file = fileInput.files[0];
      const check = ensureUsableFile(file, 'PDF');
      if (!check.valid) { msg.textContent = check.message; return; }
      
      try {
        msg.textContent = 'Elaborazione in background (Worker)...';
        doSplitBtn.disabled = true;

        const arr = await file.arrayBuffer();
        const pdfJsDoc = await window.pdfjsLib.getDocument({ data: arr.slice(0) }).promise;
        const pages = parsePages(pagesInput, pdfJsDoc.numPages);
        if (!pages.length) { msg.textContent = 'Indica le pagine (es. 1,3-5).'; doSplitBtn.disabled = false; return; }
        
        const resultBuffer = await pdfWorker.splitPdf(Comlink.transfer(arr, [arr]), pages);
        downloadBlob(resultBuffer, 'documento_diviso.pdf');
        msg.textContent = 'PDF creato e scaricato.';
      } catch (e) {
        msg.textContent = window.StrumentiErrors ? window.StrumentiErrors.friendlyErrorMessage(e) : 'Errore nel Worker.';
      } finally {
        doSplitBtn.disabled = false;
      }
    });
  }

  // ==========================================
  // 2. PDF ORGANIZER
  // ==========================================
  const organizerInput = document.getElementById('organizer-files');
  const pagesGrid = document.getElementById('pages-grid');
  const doOrganizeBtn = document.getElementById('do-organize');
  const clearOrganizerBtn = document.getElementById('clear-organizer');
  const organizeMsg = document.getElementById('organize-msg');

  let organizerSourcePdfs = []; 
  let organizerPages = [];      
  let draggedItemIndex = null;

  async function renderOrganizerGrid() {
    if (!pagesGrid) return;
    pagesGrid.innerHTML = '';
    if (organizerPages.length === 0) {
      doOrganizeBtn?.classList.add('hidden');
      clearOrganizerBtn?.classList.add('hidden');
      return;
    }
    doOrganizeBtn?.classList.remove('hidden');
    clearOrganizerBtn?.classList.remove('hidden');

    organizerPages.forEach((page, index) => {
      const col = document.createElement('div');
      col.className = 'relative bg-white border rounded shadow-sm cursor-move group select-none aspect-[1/1.4] flex items-center justify-center overflow-hidden hover:shadow-md transition-shadow';
      col.draggable = true;
      
      const img = document.createElement('img');
      img.src = page.dataUrl;
      img.className = 'w-full h-full object-cover pointer-events-none';
      col.appendChild(img);

      const delBtn = document.createElement('button');
      delBtn.className = 'absolute top-1.5 right-1.5 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-bold shadow';
      delBtn.textContent = '✕';
      delBtn.onclick = (e) => { e.stopPropagation(); organizerPages.splice(index, 1); renderOrganizerGrid(); };
      col.appendChild(delBtn);

      col.addEventListener('dragstart', () => { draggedItemIndex = index; col.classList.add('opacity-40'); });
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('ring-2', 'ring-indigo-500', 'scale-105', 'z-10'); });
      col.addEventListener('dragleave', () => { col.classList.remove('ring-2', 'ring-indigo-500', 'scale-105', 'z-10'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('ring-2', 'ring-indigo-500', 'scale-105', 'z-10');
        if (draggedItemIndex !== null && draggedItemIndex !== index) {
          const draggedItem = organizerPages.splice(draggedItemIndex, 1)[0];
          organizerPages.splice(index, 0, draggedItem);
          renderOrganizerGrid();
        }
      });
      col.addEventListener('dragend', () => { col.classList.remove('opacity-40'); draggedItemIndex = null; });
      pagesGrid.appendChild(col);
    });
  }

  if (organizerInput) {
    organizerInput.addEventListener('change', async () => {
      const files = Array.from(organizerInput.files);
      if (!files.length) return;
      organizeMsg && (organizeMsg.textContent = 'Caricamento anteprime...');
      if (doOrganizeBtn) doOrganizeBtn.disabled = true;

      try {
        for (const file of files) {
          const arr = await file.arrayBuffer();
          const sourceId = Math.random().toString(36).substring(7);
          
          organizerSourcePdfs.push({ id: sourceId, buffer: arr.slice(0) });

          const pdfJsDoc = await window.pdfjsLib.getDocument({ data: arr }).promise;
          for (let i = 1; i <= pdfJsDoc.numPages; i++) {
            const page = await pdfJsDoc.getPage(i);
            const viewport = page.getViewport({ scale: 0.4 }); 
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            
            organizerPages.push({ id: Math.random().toString(36), sourceId, pageIndex: i - 1, dataUrl: canvas.toDataURL('image/jpeg', 0.7) });
          }
        }
        organizerInput.value = ''; 
        organizeMsg && (organizeMsg.textContent = '');
        renderOrganizerGrid();
      } catch (err) {
        organizeMsg && (organizeMsg.textContent = 'Errore nel caricamento dei PDF.');
      } finally {
        if (doOrganizeBtn) doOrganizeBtn.disabled = false;
      }
    });
  }

  if (clearOrganizerBtn) {
    clearOrganizerBtn.addEventListener('click', () => {
      organizerSourcePdfs = []; organizerPages = [];
      organizeMsg && (organizeMsg.textContent = '');
      renderOrganizerGrid();
    });
  }

  if (doOrganizeBtn) {
    doOrganizeBtn.addEventListener('click', async () => {
      if (organizerPages.length === 0) return;
      organizeMsg && (organizeMsg.textContent = 'Generazione in background (Worker)...');
      doOrganizeBtn.disabled = true;

      try {
        const sourcesPayload = organizerSourcePdfs.map(s => ({ id: s.id, buffer: s.buffer.slice(0) }));
        const transferables = sourcesPayload.map(s => s.buffer);
        
        const resultBuffer = await pdfWorker.organizePdfs(
          Comlink.transfer(sourcesPayload, transferables),
          organizerPages.map(p => ({ sourceId: p.sourceId, pageIndex: p.pageIndex }))
        );

        downloadBlob(resultBuffer, 'documento_unito.pdf');
        organizeMsg && (organizeMsg.textContent = 'PDF scaricato con successo!');
      } catch (err) {
        console.error(err);
        organizeMsg && (organizeMsg.textContent = 'Errore durante la generazione nel Worker.');
      } finally {
        doOrganizeBtn.disabled = false;
      }
    });
  }

  // ==========================================
  // 3. IMAGES TO PDF 
  // ==========================================
  const imagesToPdfBtn = document.getElementById('images-to-pdf');
  if (imagesToPdfBtn) {
    imagesToPdfBtn.addEventListener('click', async ()=>{
      const input = document.getElementById('images-files');
      const msg = document.getElementById('images-msg'); msg.textContent = '';
      if (!input.files.length) { msg.textContent = 'Seleziona almeno un file immagine.'; return; }
      
      try {
        msg.textContent = 'Conversione immagini nel Worker...';
        imagesToPdfBtn.disabled = true;
        const payload = [];
        const transferables = [];
        for (const f of Array.from(input.files)){
          const arr = await f.arrayBuffer();
          payload.push({ buffer: arr, mime: f.type });
          transferables.push(arr);
        }
        const resultBuffer = await pdfWorker.imagesToPdf(Comlink.transfer(payload, transferables));
        downloadBlob(resultBuffer, 'images.pdf');
        msg.textContent = 'PDF creato e scaricato.';
      } catch (e) {
        console.error(e);
        msg.textContent = 'Errore durante la creazione.';
      } finally {
        imagesToPdfBtn.disabled = false;
      }
    });
  }

  // ==========================================
  // 4. COMPRESS PDF 
  // ==========================================
  const doCompressBtn = document.getElementById('do-compress');
  if (doCompressBtn) {
    doCompressBtn.addEventListener('click', async ()=>{
      const input = document.getElementById('compress-file');
      const qValue = safeNumber(document.getElementById('compress-quality').value, 0.7);
      const q = Number.isFinite(qValue) ? Math.min(Math.max(qValue, 0.1), 1) : 0.7;
      const msg = document.getElementById('compress-msg'); msg.textContent = '';
      if (!input.files.length) return;
      
      try {
        doCompressBtn.disabled = true;
        msg.textContent = 'Rasterizzazione in corso...';
        
        const arr = await input.files[0].arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data:arr}).promise;
        
        const payload = [];
        const transferables = [];
        
        for (let i=1;i<=pdf.numPages;i++){
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({scale:1.5});
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', q);
          const res = await fetch(dataUrl); 
          const buf = await (await res.blob()).arrayBuffer();
          payload.push({ buffer: buf, mime: 'image/jpeg' });
          transferables.push(buf);
          canvas.width = 0; 
        }

        msg.textContent = 'Compressione PDF nel Worker...';
        const resultBuffer = await pdfWorker.imagesToPdf(Comlink.transfer(payload, transferables));
        downloadBlob(resultBuffer, 'compressed.pdf');
        msg.textContent = 'PDF compresso e scaricato.';
      } catch (e){
        console.error(e);
        msg.textContent = 'Errore durante la compressione.';
      } finally {
        doCompressBtn.disabled = false;
      }
    });
  }

  // ==========================================
  // 5. DOCX TO PDF
  // ==========================================
  const docxToPdfBtn = document.getElementById('docx-to-pdf');
  if (docxToPdfBtn) {
    docxToPdfBtn.addEventListener('click', async ()=>{
      const input = document.getElementById('docx-file');
      const msg = document.getElementById('docx-msg'); msg.textContent = '';
      if (!input.files.length) return;
      try {
        docxToPdfBtn.disabled = true;
        msg.textContent = 'Elaborazione DOCX nel Worker...';
        const arr = await input.files[0].arrayBuffer();
        const resultBuffer = await pdfWorker.docxToPdf(Comlink.transfer(arr, [arr]));
        downloadBlob(resultBuffer, input.files[0].name.replace(/\.docx$/i, '.pdf'));
        msg.textContent = 'Conversione completata.';
      } catch (e){
        console.error(e);
        msg.textContent = 'Errore conversione DOCX.';
      } finally {
        docxToPdfBtn.disabled = false;
      }
    });
  }

  // ==========================================
  // 6. ANONIMIZZATORE REDACT 
  // ==========================================
  const redactFileInput = document.getElementById('redact-file');
  const redactPageInput = document.getElementById('redact-page');
  const redactCanvas = document.getElementById('redact-canvas');
  const redactMsg = document.getElementById('redact-msg');
  const applyRedactBtn = document.getElementById('apply-redact');
  const clearRedactsBtn = document.getElementById('clear-redacts');

  const redactState = { pdfBytes: null, viewport: null, dragging: false, start: null, currentRect: null, selections: [], pageNumber: 1, offscreenCanvas: null };

  function drawAllRedactOverlay() {
    if (!redactCanvas || !redactState.offscreenCanvas) return;
    const ctx = redactCanvas.getContext('2d');
    ctx.clearRect(0, 0, redactCanvas.width, redactCanvas.height);
    ctx.drawImage(redactState.offscreenCanvas, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    redactState.selections.forEach(r => ctx.fillRect(r.x, r.y, r.width, r.height));
    if (redactState.currentRect) {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)'; ctx.lineWidth = 2;
      ctx.strokeRect(redactState.currentRect.x, redactState.currentRect.y, redactState.currentRect.width, redactState.currentRect.height);
    }
  }

  async function renderRedactPreview(file) {
    if (!file || !redactCanvas) return;
    try {
      const bytes = await file.arrayBuffer();
      redactState.pdfBytes = bytes; 
      const pdf = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      redactState.pageNumber = Math.min(Math.max(1, Number(redactPageInput?.value || 1)), pdf.numPages);
      const page = await pdf.getPage(redactState.pageNumber);
      redactState.viewport = page.getViewport({ scale: 1.25 });
      
      redactCanvas.width = Math.floor(redactState.viewport.width); 
      redactCanvas.height = Math.floor(redactState.viewport.height);
      const ctx = redactCanvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: redactState.viewport }).promise;

      redactState.offscreenCanvas = document.createElement('canvas');
      redactState.offscreenCanvas.width = redactCanvas.width; redactState.offscreenCanvas.height = redactCanvas.height;
      redactState.offscreenCanvas.getContext('2d').drawImage(redactCanvas, 0, 0);

      redactState.selections = []; redactState.currentRect = null;
    } catch (err) { console.error(err); redactMsg && (redactMsg.textContent = 'Errore anteprima.'); }
  }

  if (redactFileInput) redactFileInput.addEventListener('change', () => renderRedactPreview(redactFileInput.files[0]));
  if (redactPageInput) redactPageInput.addEventListener('change', () => renderRedactPreview(redactFileInput.files[0]));

  if (redactCanvas) {
    redactCanvas.addEventListener('pointerdown', (ev)=>{
      redactCanvas.setPointerCapture(ev.pointerId);
      const rect = redactCanvas.getBoundingClientRect();
      redactState.dragging = true; redactState.currentRect = null;
      redactState.start = { x: (ev.clientX - rect.left) * (redactCanvas.width / rect.width), y: (ev.clientY - rect.top) * (redactCanvas.height / rect.height) };
    });
    
    redactCanvas.addEventListener('pointermove', (ev)=>{
      if (!redactState.dragging) return;
      const rect = redactCanvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) * (redactCanvas.width / rect.width);
      const y = (ev.clientY - rect.top) * (redactCanvas.height / rect.height);
      redactState.currentRect = { x: Math.min(redactState.start.x, x), y: Math.min(redactState.start.y, y), width: Math.abs(x - redactState.start.x), height: Math.abs(y - redactState.start.y) };
      drawAllRedactOverlay();
    });
    
    const finalize = () => {
      if (redactState.dragging && redactState.currentRect && redactState.currentRect.width > 3) redactState.selections.push({...redactState.currentRect});
      redactState.dragging = false; redactState.currentRect = null; drawAllRedactOverlay();
    };
    redactCanvas.addEventListener('pointerup', finalize);
  }

  if (clearRedactsBtn) clearRedactsBtn.addEventListener('click', ()=>{ redactState.selections = []; drawAllRedactOverlay(); });

  if (applyRedactBtn) {
    applyRedactBtn.addEventListener('click', async () => {
      const f = redactFileInput.files[0];
      if (!f || !redactState.selections.length || !redactState.pdfBytes) return;

      try {
        applyRedactBtn.disabled = true;
        redactMsg.textContent = "Applicazione censura nel Worker...";
        
        const arr = redactState.pdfBytes.slice(0);
        const payload = redactState.selections.map(sel => ({ x: sel.x, y: sel.y, width: sel.width, height: sel.height }));
        
        const resultBuffer = await pdfWorker.redactPdf(
          Comlink.transfer(arr, [arr]), 
          payload, 
          redactState.pageNumber, 
          redactCanvas.width, 
          redactCanvas.height
        );

        downloadBlob(resultBuffer, f.name.replace(/\.pdf$/i,'') + '-redacted.pdf');
        redactMsg.textContent = 'Redazione completata.';
      } catch (err) {
        console.error(err);
        redactMsg.textContent = "Errore oscuramento.";
      } finally {
        applyRedactBtn.disabled = false;
      }
    });
  }

  // ==========================================
  // 7. FIRMA PDF ONLINE 
  // ==========================================
  const signatureCanvas = document.getElementById('signature-canvas');
  const applySignatureBtn = document.getElementById('apply-signature');
  const previewCanvas = document.getElementById('pdf-preview-canvas');
  const previewOverlay = document.getElementById('signature-box-overlay');
  const uploadSignatureInput = document.getElementById('signature-upload'); 

  const previewState = { viewport: null, pageWidthPt: 0, pageHeightPt: 0, signatureX: 0, signatureY: 0 };

  async function renderSignPreview(file) {
    if (!file || !previewCanvas) return;
    const bytes = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const pageNum = Math.max(1, Number(document.getElementById('sign-page')?.value || 1));
    const page = await pdf.getPage(Math.min(pageNum, pdf.numPages));
    
    previewState.viewport = page.getViewport({ scale: 1.25 });
    const nativeVp = page.getViewport({ scale: 1 });
    previewState.pageWidthPt = nativeVp.width; 
    previewState.pageHeightPt = nativeVp.height;
    
    previewCanvas.width = previewState.viewport.width; 
    previewCanvas.height = previewState.viewport.height;
    await page.render({ canvasContext: previewCanvas.getContext('2d'), viewport: previewState.viewport }).promise;
  }

  document.getElementById('sign-file')?.addEventListener('change', (e) => renderSignPreview(e.target.files[0]));
  document.getElementById('sign-page')?.addEventListener('change', () => renderSignPreview(document.getElementById('sign-file').files[0]));

  // Visualizar la imagen de la firma en el cuadro del PDF
  function updateOverlayImage() {
    if (!signatureCanvas || !previewOverlay) return;
    const dataUrl = signatureCanvas.toDataURL('image/png');
    previewOverlay.style.backgroundImage = `url(${dataUrl})`;
    previewOverlay.style.backgroundSize = 'contain';
    previewOverlay.style.backgroundRepeat = 'no-repeat';
    previewOverlay.style.backgroundPosition = 'center';
    previewOverlay.textContent = ''; 
  }

  // Lógica Recuadro Firma
  if (previewCanvas) {
    previewCanvas.addEventListener('pointerdown', (ev) => {
      if (!previewState.viewport) return;
      const rect = previewCanvas.getBoundingClientRect();
      
      let clickX = ev.clientX - rect.left;
      let clickY = ev.clientY - rect.top;

      const boxW = 150;
      const boxH = 60;

      let leftPx = Math.max(0, Math.min(clickX, rect.width - boxW));
      let topPx = Math.max(0, Math.min(clickY, rect.height - boxH));

      previewState.signatureX = (leftPx / rect.width) * previewState.pageWidthPt;
      previewState.signatureY = (topPx / rect.height) * previewState.pageHeightPt;
      
      previewOverlay.style.left = `${leftPx}px`; 
      previewOverlay.style.top = `${topPx}px`;
      previewOverlay.style.width = `${boxW}px`; 
      previewOverlay.style.height = `${boxH}px`;
      previewOverlay.classList.remove('hidden');
    });
  }

  // Posiciones Rápidas
  function updateOverlayPosition(fracX, fracYTop) {
    if(!previewState.viewport) {
      alert("Per favore, carica un PDF prima di posizionare la firma.");
      return;
    }
    
    previewState.signatureX = fracX * previewState.pageWidthPt;
    previewState.signatureY = fracYTop * previewState.pageHeightPt;

    const boxW = 150;
    const boxH = 60;
    const rect = previewCanvas.getBoundingClientRect();
    
    const leftPx = (previewState.signatureX / previewState.pageWidthPt) * rect.width;
    const topPx = (previewState.signatureY / previewState.pageHeightPt) * rect.height;

    previewOverlay.style.left = `${leftPx}px`; 
    previewOverlay.style.top = `${topPx}px`;
    previewOverlay.style.width = `${boxW}px`; 
    previewOverlay.style.height = `${boxH}px`;
    previewOverlay.classList.remove('hidden');
  }

  document.getElementById('preset-bottom-left')?.addEventListener('click', () => updateOverlayPosition(0.05, 0.85));
  document.getElementById('preset-bottom-center')?.addEventListener('click', () => updateOverlayPosition(0.40, 0.85));
  document.getElementById('preset-bottom-right')?.addEventListener('click', () => updateOverlayPosition(0.70, 0.85));

  // Canvas Firma Libre
  if (signatureCanvas) {
    const ctx = signatureCanvas.getContext('2d');
    let drawing = false;
    ctx.lineWidth = 2.5; 
    ctx.lineCap = 'round'; 
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    signatureCanvas.style.touchAction = 'none';

    function getPos(e) {
      const rect = signatureCanvas.getBoundingClientRect();
      const clientX = e.clientX ?? (e.touches && e.touches[0].clientX);
      const clientY = e.clientY ?? (e.touches && e.touches[0].clientY);
      return {
        x: (clientX - rect.left) * (signatureCanvas.width / rect.width),
        y: (clientY - rect.top) * (signatureCanvas.height / rect.height)
      };
    }

    const startDraw = (e) => { e.preventDefault(); drawing = true; const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
    
    const draw = (e) => {
      e.preventDefault(); 
      if (!drawing) return; 
      const pos = getPos(e);
      if (pos.x < 0 || pos.x > signatureCanvas.width || pos.y < 0 || pos.y > signatureCanvas.height) { 
        drawing = false; 
        updateOverlayImage(); 
        return; 
      }
      ctx.lineTo(pos.x, pos.y); 
      ctx.stroke();
    };
    
    const stopDraw = () => {
        if (drawing) {
            drawing = false;
            updateOverlayImage(); 
        }
    };

    signatureCanvas.addEventListener('pointerdown', startDraw);
    signatureCanvas.addEventListener('pointermove', draw);
    signatureCanvas.addEventListener('pointerup', stopDraw);
    signatureCanvas.addEventListener('pointerout', stopDraw);
    
    document.getElementById('clear-signature')?.addEventListener('click', () => {
      ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
      previewOverlay.style.backgroundImage = 'none';
      previewOverlay.textContent = 'Firma qui';
    });
  }

  // Carga de imagen con Extracción de Fondo 
  if (uploadSignatureInput && signatureCanvas) {
    let uploadBtn = document.getElementById('btn-upload-signature') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Carica (JPG/PNG)'));
    if (uploadBtn) {
      uploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        uploadSignatureInput.click();
      });
    }
    
    uploadSignatureInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        const ctx = signatureCanvas.getContext('2d');
        
        ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
        
        const scale = Math.min(signatureCanvas.width / img.width, signatureCanvas.height / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = (signatureCanvas.width - drawW) / 2;
        const dy = (signatureCanvas.height - drawH) / 2;
        
        ctx.drawImage(img, dx, dy, drawW, drawH);
        
        const imgData = ctx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height);
        const data = imgData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const alpha = data[i + 3];

          if (alpha === 0) continue; 
          
          const brightness = (r + g + b) / 3;
          
          if (brightness > 160) {
            data[i + 3] = 0; 
          } else {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 255; 
          }
        }
        
        ctx.putImageData(imgData, 0, 0);
        uploadSignatureInput.value = ''; 
        updateOverlayImage(); 
      };
      img.src = url;
    });
  }

  // Aplicar firma en el Web Worker
  if (applySignatureBtn) {
    applySignatureBtn.addEventListener('click', async () => {
      const file = document.getElementById('sign-file').files[0];
      const msg = document.getElementById('signature-msg');
      if (!file) return;

      try {
        applySignatureBtn.disabled = true;
        msg.textContent = "Applicazione firma nel Worker...";

        const pdfBytes = await file.arrayBuffer();
        
        const pngDataUrl = signatureCanvas.toDataURL('image/png');
        const res = await fetch(pngDataUrl);
        const pngBuffer = await res.arrayBuffer();
        
        const config = {
          targetWidth: Math.max(40, Number(document.getElementById('sign-width')?.value || 180)),
          fracX: previewState.pageWidthPt ? (previewState.signatureX / previewState.pageWidthPt) : 0.6,
          fracYTop: previewState.pageHeightPt ? (previewState.signatureY / previewState.pageHeightPt) : 0.8,
          applyToAll: document.getElementById('sign-all-pages')?.checked,
          pageNum: Number(document.getElementById('sign-page')?.value || 1)
        };

        const resultBuffer = await pdfWorker.signPdf(
          Comlink.transfer(pdfBytes, [pdfBytes]), 
          Comlink.transfer(pngBuffer, [pngBuffer]), 
          config
        );

        downloadBlob(resultBuffer, file.name.replace(/\.pdf$/i, '') + '-firmato.pdf');
        msg.textContent = 'Firma applicata con successo.';
      } catch (e) {
        console.error("Errore Worker Firma:", e);
        msg.textContent = 'Errore durante la firma. Controlla la console.';
      } finally {
        applySignatureBtn.disabled = false;
      }
    });
  }

})();

// UI Initialization Dropzone
(function(){
  document.addEventListener('DOMContentLoaded', ()=>{
    if (!window.StrumentiDropzone) return;
    ['split', 'organizer', 'images', 'compress', 'docx', 'sign', 'redact'].forEach(id => {
      if(document.getElementById(`drop-${id}-file`) || document.getElementById(`drop-${id}-files`)) {
        window.StrumentiDropzone.setup({
          drop: `drop-${id}-file${id==='organizer'||id==='images'?'s':''}`,
          input: `${id}-file${id==='organizer'||id==='images'?'s':''}`,
          filename: `${id}-filename`, browse: `${id}-browse`
        });
      }
    });
  });
})();