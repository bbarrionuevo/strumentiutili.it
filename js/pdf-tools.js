// js/pdf-tools.js — client-side PDF utilities (local processing)
// Uses pdf-lib, pdf.js (for rendering pages to canvas) and mammoth

// Configure PDF.js worker src to avoid console warnings when pdfjsLib exists
if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions?.workerSrc) {
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  } catch (e) { /* ignore if not available */ }
}

(async ()=>{
  function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function ensureUsableFile(file, kindLabel) {
    if (!file || !file.size) return { valid: false, message: `Seleziona un file ${kindLabel} valido.` };
    if (file.size <= 0) return { valid: false, message: `Il file ${kindLabel} è vuoto.` };
    return { valid: true };
  }

  // Helper: parse page ranges like "1,3-5" into zero-based indices
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

 // --- DIVIDI RAPIDO (Rango numérico) ---
  const doSplitBtn = document.getElementById('do-split');
  if (doSplitBtn) {
    doSplitBtn.addEventListener('click', async ()=>{
      const fileInput = document.getElementById('split-file');
      const pagesInput = document.getElementById('split-pages').value.trim();
      const msg = document.getElementById('split-msg');
      msg.textContent = '';
      if (!fileInput.files.length) { msg.textContent = 'Seleziona un file PDF.'; return; }
      const file = fileInput.files[0];
      const check = ensureUsableFile(file, 'PDF');
      if (!check.valid) { msg.textContent = check.message; return; }
      try {
        const arr = await file.arrayBuffer();
        const src = await PDFLib.PDFDocument.load(arr);
        const pageCount = src.getPageCount();
        const pages = parsePages(pagesInput, pageCount);
        if (!pages.length) { msg.textContent = 'Indica le pagine (es. 1,3-5).'; return; }
        const out = await PDFLib.PDFDocument.create();
        const copied = await out.copyPages(src, pages);
        copied.forEach(p => out.addPage(p));
        const bytes = await out.save();
        const blob = new Blob([bytes], {type:'application/pdf'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'split.pdf'; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        msg.textContent = 'PDF creato e scaricato.';
      } catch (e) {
        console.error(e);
        msg.textContent = window.StrumentiErrors
          ? window.StrumentiErrors.friendlyErrorMessage(e, 'Errore durante la divisione del PDF.')
          : 'Errore durante la divisione del PDF.';
      }
    });
  }

// --- PDF ORGANIZER (Riordina, Unisci, Dividi) ---
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
      doOrganizeBtn && doOrganizeBtn.classList.add('hidden');
      clearOrganizerBtn && clearOrganizerBtn.classList.add('hidden');
      return;
    }
    doOrganizeBtn && doOrganizeBtn.classList.remove('hidden');
    clearOrganizerBtn && clearOrganizerBtn.classList.remove('hidden');

    organizerPages.forEach((page, index) => {
      const col = document.createElement('div');
      col.className = 'relative bg-white border rounded shadow-sm cursor-move group select-none aspect-[1/1.4] flex items-center justify-center overflow-hidden hover:shadow-md transition-shadow';
      col.draggable = true;
      col.dataset.index = index;

      const img = document.createElement('img');
      img.src = page.dataUrl;
      img.className = 'w-full h-full object-cover pointer-events-none';
      col.appendChild(img);

      const badge = document.createElement('div');
      badge.className = 'absolute bottom-1.5 right-1.5 bg-gray-900/80 text-white text-xs px-2 py-0.5 rounded pointer-events-none font-medium backdrop-blur-sm';
      badge.textContent = index + 1;
      col.appendChild(badge);

      const delBtn = document.createElement('button');
      delBtn.className = 'absolute top-1.5 right-1.5 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-bold hover:bg-red-600 shadow';
      delBtn.textContent = '✕';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        organizerPages.splice(index, 1);
        renderOrganizerGrid();
      };
      col.appendChild(delBtn);

      col.addEventListener('dragstart', (e) => {
        draggedItemIndex = index;
        e.dataTransfer.effectAllowed = 'move';
        col.classList.add('opacity-40');
      });
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('ring-2', 'ring-indigo-500', 'scale-105', 'z-10');
      });
      col.addEventListener('dragleave', () => {
        col.classList.remove('ring-2', 'ring-indigo-500', 'scale-105', 'z-10');
      });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('ring-2', 'ring-indigo-500', 'scale-105', 'z-10');
        if (draggedItemIndex !== null && draggedItemIndex !== index) {
          const draggedItem = organizerPages.splice(draggedItemIndex, 1)[0];
          organizerPages.splice(index, 0, draggedItem);
          renderOrganizerGrid();
        }
      });
      col.addEventListener('dragend', () => {
        col.classList.remove('opacity-40');
        draggedItemIndex = null;
      });

      pagesGrid.appendChild(col);
    });
  }

  if (organizerInput) {
    organizerInput.addEventListener('change', async () => {
      const files = Array.from(organizerInput.files);
      if (!files.length) return;
      organizeMsg && (organizeMsg.textContent = 'Estrazione delle pagine in corso...');
      if (doOrganizeBtn) doOrganizeBtn.disabled = true;

      try {
        for (const file of files) {
          const arr = await file.arrayBuffer();
          const sourceId = Math.random().toString(36).substring(7);
          
          const pdfLibDoc = await PDFLib.PDFDocument.load(arr);
          organizerSourcePdfs.push({ id: sourceId, pdfLibDoc });

          const loadingTask = window.pdfjsLib.getDocument({ data: arr.slice(0) });
          const pdfJsDoc = await loadingTask.promise;

          for (let i = 1; i <= pdfJsDoc.numPages; i++) {
            const page = await pdfJsDoc.getPage(i);
            const viewport = page.getViewport({ scale: 0.4 }); 
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            
            organizerPages.push({
              id: Math.random().toString(36).substring(7),
              sourceId: sourceId,
              pageIndex: i - 1, 
              dataUrl: canvas.toDataURL('image/jpeg', 0.7)
            });
          }
        }
        organizerInput.value = ''; 
        organizeMsg && (organizeMsg.textContent = '');
        renderOrganizerGrid();
      } catch (err) {
        console.error(err);
        organizeMsg && (organizeMsg.textContent = 'Errore nel caricamento dei PDF.');
      } finally {
        if (doOrganizeBtn) doOrganizeBtn.disabled = false;
      }
    });
  }

  if (clearOrganizerBtn) {
    clearOrganizerBtn.addEventListener('click', () => {
      organizerSourcePdfs = [];
      organizerPages = [];
      organizeMsg && (organizeMsg.textContent = '');
      renderOrganizerGrid();
    });
  }

  if (doOrganizeBtn) {
    doOrganizeBtn.addEventListener('click', async () => {
      if (organizerPages.length === 0) return;
      organizeMsg && (organizeMsg.textContent = 'Generazione del nuovo PDF in corso...');
      try {
        const outPdf = await PDFLib.PDFDocument.create();
        
        for (const pageMeta of organizerPages) {
          const source = organizerSourcePdfs.find(s => s.id === pageMeta.sourceId);
          if (source) {
            const [copiedPage] = await outPdf.copyPages(source.pdfLibDoc, [pageMeta.pageIndex]);
            outPdf.addPage(copiedPage);
          }
        }

        const bytes = await outPdf.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'documento_riorganizzato.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        organizeMsg && (organizeMsg.textContent = 'PDF generato e scaricato con successo!');
      } catch (err) {
        console.error(err);
        organizeMsg && (organizeMsg.textContent = 'Errore durante la generazione del PDF.');
      }
    });
  }

  // Images -> PDF
  const imagesToPdfBtn = document.getElementById('images-to-pdf');
  if (imagesToPdfBtn) {
    imagesToPdfBtn.addEventListener('click', async ()=>{
      const input = document.getElementById('images-files');
      const msg = document.getElementById('images-msg'); msg.textContent = '';
      if (!input.files.length) { msg.textContent = 'Seleziona almeno un file immagine.'; return; }
      const invalid = Array.from(input.files).filter(f => !f || !f.size || !/image\/(png|jpeg|jpg)/i.test(f.type));
      if (invalid.length) { msg.textContent = 'Impossibile elaborare il file: controlla che sia un PNG/JPG valido.'; return; }
      try {
        const out = await PDFLib.PDFDocument.create();
        for (const f of Array.from(input.files)){
          const arr = await f.arrayBuffer();
          const mime = f.type;
          let img;
          if (mime === 'image/png') img = await out.embedPng(arr); else img = await out.embedJpg(arr);
          const page = out.addPage([img.width, img.height]);
          page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        }
        const bytes = await out.save();
        const blob = new Blob([bytes], {type:'application/pdf'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'images.pdf'; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        msg.textContent = 'PDF creato e scaricato.';
      } catch (e) {
        console.error(e);
        msg.textContent = window.StrumentiErrors
          ? window.StrumentiErrors.friendlyErrorMessage(e, 'Errore durante la creazione del PDF dalle immagini.')
          : 'Errore durante la creazione del PDF dalle immagini.';
      }
    });
  }

  // Compress PDF
  const doCompressBtn = document.getElementById('do-compress');
  if (doCompressBtn) {
    doCompressBtn.addEventListener('click', async ()=>{
      const input = document.getElementById('compress-file');
      const qValue = safeNumber(document.getElementById('compress-quality').value, 0.7);
      const q = Number.isFinite(qValue) ? Math.min(Math.max(qValue, 0.1), 1) : 0.7;
      const msg = document.getElementById('compress-msg'); msg.textContent = '';
      if (!input.files.length) { msg.textContent = 'Seleziona un file PDF.'; return; }
      const f = input.files[0];
      const check = ensureUsableFile(f, 'PDF');
      if (!check.valid) { msg.textContent = check.message; return; }
      try {
        const arr = await f.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({data:arr});
        const pdf = await loadingTask.promise;
        const out = await PDFLib.PDFDocument.create();
        for (let i=1;i<=pdf.numPages;i++){
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({scale:1.5});
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', q);
          const res = await fetch(dataUrl); const blob = await res.blob(); const buf = await blob.arrayBuffer();
          const img = await out.embedJpg(buf);
          const p = out.addPage([img.width, img.height]);
          p.drawImage(img, { x:0, y:0, width: img.width, height: img.height });
          canvas.width = canvas.height = 0; 
        }
        const bytes = await out.save();
        const blobOut = new Blob([bytes], {type:'application/pdf'});
        const url = URL.createObjectURL(blobOut);
        const a = document.createElement('a'); a.href = url; a.download = 'compressed.pdf'; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        msg.textContent = 'PDF compresso e scaricato.';
      } catch (e){
        console.error(e);
        msg.textContent = window.StrumentiErrors
          ? window.StrumentiErrors.friendlyErrorMessage(e, 'Errore durante la compressione (controlla il PDF).')
          : 'Errore durante la compressione (controlla il PDF).';
      }
    });
  }

  // DOCX -> PDF
  const docxToPdfBtn = document.getElementById('docx-to-pdf');
  if (docxToPdfBtn) {
    docxToPdfBtn.addEventListener('click', async ()=>{
      const input = document.getElementById('docx-file');
      const msg = document.getElementById('docx-msg'); msg.textContent = '';
      if (!input.files.length) { msg.textContent = 'Seleziona un file .docx.'; return; }
      const f = input.files[0];
      const check = ensureUsableFile(f, '.docx');
      if (!check.valid) { msg.textContent = check.message; return; }
      if (!/\.docx$/i.test(f.name)) { msg.textContent = 'Impossibile elaborare il file: estensione .docx richiesta.'; return; }
      try {
        const arr = await f.arrayBuffer();
        const result = await mammoth.extractRawText({arrayBuffer: arr});
        const text = result.value || '';
        const out = await PDFLib.PDFDocument.create();
        const font = await out.embedFont(PDFLib.StandardFonts.Helvetica);
        const pageSize = { width: 595.28, height: 841.89 }; 
        const margin = 40;
        const linesPerPage = 50; 
        const words = text.split('\n');
        let currentLines = [];
        for (const line of words){
          currentLines.push(line);
          if (currentLines.length >= linesPerPage){
            const p = out.addPage([pageSize.width, pageSize.height]);
            let y = pageSize.height - margin;
            for (const l of currentLines){
              p.drawText(l, { x: margin, y: y, size: 11, font });
              y -= 14;
            }
            currentLines = [];
          }
        }
        if (currentLines.length){
          const p = out.addPage([pageSize.width, pageSize.height]);
          let y = pageSize.height - margin;
          for (const l of currentLines){
            p.drawText(l, { x: margin, y: y, size: 11, font });
            y -= 14;
          }
        }
        const bytes = await out.save();
        const blob = new Blob([bytes], {type:'application/pdf'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = f.name.replace(/\.docx$/i, '.pdf'); document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        msg.textContent = 'Conversione completata e scaricata.';
      } catch (e){
        console.error(e);
        msg.textContent = window.StrumentiErrors
          ? window.StrumentiErrors.friendlyErrorMessage(e, 'Errore durante la conversione DOCX → PDF.')
          : 'Errore durante la conversione DOCX → PDF.';
      }
    });
  }

  // Redaction (Anonimizzatore)
  const redactFileInput = document.getElementById('redact-file');
  const redactPageInput = document.getElementById('redact-page');
  const redactCanvas = document.getElementById('redact-canvas');
  const redactMsg = document.getElementById('redact-msg');
  const applyRedactBtn = document.getElementById('apply-redact');
  const clearRedactsBtn = document.getElementById('clear-redacts');

  const redactState = {
    pdf: null,
    viewport: null,
    dragging: false,
    start: null,
    currentRect: null,
    selections: [],
    pageNumber: 1,
    offscreenCanvas: null
  };

  function drawAllRedactOverlay() {
    if (!redactCanvas || !redactState.offscreenCanvas) return;
    const ctx = redactCanvas.getContext('2d');

    ctx.clearRect(0, 0, redactCanvas.width, redactCanvas.height);
    ctx.drawImage(redactState.offscreenCanvas, 0, 0);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    for (const r of redactState.selections) {
      ctx.fillRect(r.x, r.y, r.width, r.height);
    }

    if (redactState.currentRect) {
      const r = redactState.currentRect;
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);
    }
  }

  async function renderRedactPreview(file) {
    if (!file || !redactCanvas) return;
    try {
      const bytes = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      redactState.pdf = pdf;
      const pageNum = Math.max(1, Number(redactPageInput?.value || 1));
      redactState.pageNumber = Math.min(pageNum, pdf.numPages);
      const page = await pdf.getPage(redactState.pageNumber);
      const viewport = page.getViewport({ scale: 1.25 });
      redactState.viewport = viewport;
      redactCanvas.width = Math.floor(viewport.width);
      redactCanvas.height = Math.floor(viewport.height);
      redactCanvas.style.width = '100%';
      redactCanvas.style.height = 'auto';
      const ctx = redactCanvas.getContext('2d');
      ctx.clearRect(0, 0, redactCanvas.width, redactCanvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      try {
        const offscreen = document.createElement('canvas');
        offscreen.width = redactCanvas.width;
        offscreen.height = redactCanvas.height;
        const offCtx = offscreen.getContext('2d');
        offCtx.drawImage(redactCanvas, 0, 0);
        redactState.offscreenCanvas = offscreen;
      } catch (e) {
        console.warn('Could not create offscreen canvas for redact preview', e);
        redactState.offscreenCanvas = null;
      }

      redactState.selections = [];
      redactState.currentRect = null;
      redactMsg && (redactMsg.textContent = 'Preview caricata. Trascina per selezionare aree.');
    } catch (err) {
      console.error('Render redact preview error', err);
      const message = window.StrumentiErrors
        ? window.StrumentiErrors.friendlyErrorMessage(err, 'Impossibile generare preview del PDF.')
        : 'Impossibile generare preview del PDF.';
      redactMsg && (redactMsg.textContent = message);
    }
  }

  if (redactFileInput) {
    redactFileInput.addEventListener('change', async ()=>{
      const f = redactFileInput.files && redactFileInput.files[0];
      if (f) await renderRedactPreview(f);
    });
  }
  if (redactPageInput) {
    redactPageInput.addEventListener('change', async ()=>{
      const f = redactFileInput.files && redactFileInput.files[0];
      if (f) await renderRedactPreview(f);
    });
  }

  if (redactCanvas) {
    const ctx = redactCanvas.getContext('2d');
    redactCanvas.style.touchAction = 'none';

    redactCanvas.addEventListener('pointerdown', (ev)=>{
      try { redactCanvas.setPointerCapture(ev.pointerId); } catch(e){}
      const rect = redactCanvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) * (redactCanvas.width / rect.width);
      const y = (ev.clientY - rect.top) * (redactCanvas.height / rect.height);
      redactState.dragging = true; redactState.start = { x, y }; redactState.currentRect = null;
    });
    
    redactCanvas.addEventListener('pointermove', (ev)=>{
      if (!redactState.dragging) return;
      const rect = redactCanvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) * (redactCanvas.width / rect.width);
      const y = (ev.clientY - rect.top) * (redactCanvas.height / rect.height);
      const sx = redactState.start.x;
      const sy = redactState.start.y;

      redactState.currentRect = {
        x: Math.min(sx, x),
        y: Math.min(sy, y),
        width: Math.abs(x - sx),
        height: Math.abs(y - sy)
      };

      drawAllRedactOverlay();
    });
    
    const finalizeRedactRect = (ev) => {
      if (redactState.dragging && redactState.currentRect) {
        if (redactState.currentRect.width > 3 && redactState.currentRect.height > 3) {
          redactState.selections.push(Object.assign({}, redactState.currentRect));
          redactMsg && (redactMsg.textContent = `${redactState.selections.length} selezione/i pronte per la redazione.`);
        }
      }
      redactState.dragging = false;
      redactState.currentRect = null;
      drawAllRedactOverlay();
      
      if (ev && ev.pointerId) {
        try { redactCanvas.releasePointerCapture(ev.pointerId); } catch(e){}
      }
    };

    redactCanvas.addEventListener('pointerup', finalizeRedactRect);
    redactCanvas.addEventListener('pointercancel', finalizeRedactRect); 
    redactCanvas.addEventListener('pointerleave', finalizeRedactRect);
  }

  if (clearRedactsBtn) clearRedactsBtn.addEventListener('click', ()=>{
    redactState.selections = []; redactState.currentRect = null; if (redactState.pdf) renderRedactPreview(redactFileInput.files[0]); redactMsg && (redactMsg.textContent='Selezioni rimosse.');
  });

  if (applyRedactBtn) applyRedactBtn.addEventListener('click', async ()=>{
    const f = redactFileInput.files && redactFileInput.files[0];
    if (!f) { redactMsg && (redactMsg.textContent = 'Seleziona un PDF prima di applicare la redazione.'); return; }
    if (!redactState.selections.length) { redactMsg && (redactMsg.textContent = 'Nessuna selezione da applicare.'); return; }
    try{
      const arr = await f.arrayBuffer();
      const pdfDoc = await PDFLib.PDFDocument.load(arr);
      const pageIndex = Math.max(0, Math.min(pdfDoc.getPageCount()-1, redactState.pageNumber-1));
      const page = pdfDoc.getPage(pageIndex);
      const { width: pageW, height: pageH } = page.getSize();
      const vp = redactState.viewport || { width: redactCanvas.width, height: redactCanvas.height };
      for (const sel of redactState.selections){
        const xPdf = (sel.x / vp.width) * pageW;
        const wPdf = (sel.width / vp.width) * pageW;
        const yTop = sel.y; const hCanvas = sel.height;
        const yPdf = pageH - ((yTop + hCanvas) / vp.height) * pageH;
        const hPdf = (hCanvas / vp.height) * pageH;
        page.drawRectangle({ x: xPdf, y: yPdf, width: wPdf, height: hPdf, color: PDFLib.rgb(0,0,0), opacity: 1 });
      }
      const out = await pdfDoc.save();
      const url = URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = (f.name||'documento').replace(/\.pdf$/i,'') + '-redacted.pdf'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      redactMsg && (redactMsg.textContent = 'Redazione applicata e PDF scaricato.');
    }catch(err){
      console.error('Apply redact error', err);
      const message = window.StrumentiErrors
        ? window.StrumentiErrors.friendlyErrorMessage(err, "Errore durante l'applicazione della redazione.")
        : "Errore durante l'applicazione della redazione.";
      redactMsg && (redactMsg.textContent = message);
    }
  });

  // Firma PDF locale
  const signatureCanvas = document.getElementById('signature-canvas');
  const signatureUpload = document.getElementById('signature-upload');
  const clearSignatureBtn = document.getElementById('clear-signature');
  const applySignatureBtn = document.getElementById('apply-signature');
  const previewCanvas = document.getElementById('pdf-preview-canvas');
  const previewOverlay = document.getElementById('signature-box-overlay');
  const signPageInput = document.getElementById('sign-page');
  const signFileInput = document.getElementById('sign-file');
  const signWidthInput = document.getElementById('sign-width');
  const signAllPagesInput = document.getElementById('sign-all-pages');
  const presetButtons = {
    bottomRight: document.getElementById('preset-bottom-right'),
    bottomCenter: document.getElementById('preset-bottom-center'),
    bottomLeft: document.getElementById('preset-bottom-left')
  };

  const PREVIEW_SCALE = 1.25;

  const previewState = {
    pdf: null,
    pageNumber: 1,
    viewport: null,
    pageWidthPt: 0,
    pageHeightPt: 0,
    signatureX: 0,
    signatureY: 0,
    signatureWidth: 180,
    activePreset: null
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setPresetState(selectedKey) {
    previewState.activePreset = selectedKey;
    Object.entries(presetButtons).forEach(([key, button]) => {
      if (!button) return;
      const active = key === selectedKey;
      button.classList.toggle('bg-indigo-600', active);
      button.classList.toggle('text-white', active);
      button.classList.toggle('ring-2', active);
      button.classList.toggle('ring-indigo-400', active);
      button.classList.toggle('bg-gray-200', !active);
      button.classList.toggle('text-gray-800', !active);
      button.classList.toggle('hover:bg-indigo-100', !active);
      button.classList.toggle('shadow-sm', active);
    });
  }

  function setSignatureOverlayPosition() {
    if (!previewCanvas || !previewOverlay || !previewState.viewport) return;
    const pageWidth = previewState.pageWidthPt;
    const pageHeight = previewState.pageHeightPt;
    if (!pageWidth || !pageHeight) return;
    const displayWidth = previewCanvas.clientWidth || previewCanvas.width || 1;
    const displayHeight = previewCanvas.clientHeight || previewCanvas.height || 1;
    const sigWidth = Math.max(60, Number(signWidthInput?.value || previewState.signatureWidth || 180));
    const leftPx = (previewState.signatureX / pageWidth) * displayWidth;
    const topPx = (previewState.signatureY / pageHeight) * displayHeight;
    const overlayWidth = (sigWidth / pageWidth) * displayWidth;
    const overlayHeight = Math.max(32, overlayWidth * 0.42);

    previewOverlay.style.left = `${leftPx}px`;
    previewOverlay.style.top = `${topPx}px`;
    previewOverlay.style.width = `${overlayWidth}px`;
    previewOverlay.style.height = `${overlayHeight}px`;
    previewOverlay.classList.remove('hidden');
  }

  function setSignaturePositionFromPreset(mode) {
    if (!previewState.viewport) return;
    const pageWidth = previewState.pageWidthPt;
    const pageHeight = previewState.pageHeightPt;
    const sigWidth = Math.max(60, Number(signWidthInput?.value || 180));
    const safeWidth = Math.min(sigWidth, pageWidth);
    const sigHeight = safeWidth * 0.42; 
    
    const marginBottom = 10; 
    const bottomY = clamp(pageHeight - marginBottom - sigHeight, 0, Math.max(0, pageHeight - sigHeight));

    const xMap = {
      'bottom-left': 10,
      'bottom-center': (pageWidth - safeWidth) / 2,
      'bottom-right': pageWidth - safeWidth - 10
    };

    const x = clamp(xMap[mode] ?? pageWidth * 0.75, 0, Math.max(0, pageWidth - safeWidth));
    previewState.signatureX = x;
    previewState.signatureY = bottomY;
    
    const key = mode === 'bottom-left' ? 'bottomLeft' : mode === 'bottom-center' ? 'bottomCenter' : 'bottomRight';
    setPresetState(key);
    setSignatureOverlayPosition();
  }

  async function renderPdfPreview(file) {
    if (!file || !previewCanvas || !window.pdfjsLib) {
      return;
    }

    try {
      const pdfJsVersion = '2.16.105';
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfJsVersion}/pdf.worker.min.js`;
      }
      const bytes = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      const pageNum = Math.max(1, Number(signPageInput?.value || 1));
      const safePage = Math.min(pageNum, pdf.numPages);
      previewState.pageNumber = safePage;
      const page = await pdf.getPage(safePage);
      const viewport = page.getViewport({ scale: PREVIEW_SCALE });
      previewState.pdf = pdf;
      previewState.viewport = viewport;
      
      const nativeViewport = page.getViewport({ scale: 1 });
      previewState.pageWidthPt = nativeViewport.width;
      previewState.pageHeightPt = nativeViewport.height;
      previewCanvas.width = viewport.width;
      previewCanvas.height = viewport.height;
      previewCanvas.style.width = '100%';
      previewCanvas.style.height = 'auto';
      const ctx = previewCanvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const signedWidth = Math.max(60, Number(signWidthInput?.value || 180));
      previewState.signatureWidth = signedWidth;
      
      setSignaturePositionFromPreset('bottom-right');
    } catch (error) {
      console.error('Render preview error:', error);
      if (previewOverlay) {
        previewOverlay.textContent = window.StrumentiErrors
          ? window.StrumentiErrors.friendlyErrorMessage(error, 'Preview non disponibile.')
          : 'Preview non disponibile';
        previewOverlay.classList.remove('hidden');
      }
    }
  }

  if (signFileInput) {
    signFileInput.addEventListener('change', async () => {
      const file = signFileInput.files && signFileInput.files[0];
      if (!file) return;
      await renderPdfPreview(file);
    });
  }

  if (signPageInput) {
    signPageInput.addEventListener('change', async () => {
      const file = signFileInput && signFileInput.files && signFileInput.files[0];
      if (file) {
        await renderPdfPreview(file);
      }
    });
  }

  if (signWidthInput) {
    signWidthInput.addEventListener('input', () => {
      if (previewState.viewport) {
        setSignatureOverlayPosition();
      }
    });
  }

  if (signAllPagesInput && signPageInput) {
    signAllPagesInput.addEventListener('change', () => {
      signPageInput.disabled = signAllPagesInput.checked;
      signPageInput.classList.toggle('opacity-50', signAllPagesInput.checked);
    });
  }

  Object.entries(presetButtons).forEach(([key, button]) => {
    if (!button) return;
    button.addEventListener('click', () => {
      setSignaturePositionFromPreset(key === 'bottomRight' ? 'bottom-right' : key === 'bottomCenter' ? 'bottom-center' : 'bottom-left');
    });
  });

  if (previewCanvas) {
    previewCanvas.addEventListener('pointerdown', (event) => {
      if (!previewState.viewport || !previewState.pageWidthPt || !previewState.pageHeightPt) return;
      const rect = previewCanvas.getBoundingClientRect();
      const clickX = ((event.clientX - rect.left) / rect.width) * previewState.pageWidthPt;
      const clickY = ((event.clientY - rect.top) / rect.height) * previewState.pageHeightPt;
      
      const sigWidth = Math.max(60, Number(signWidthInput?.value || 180));
      const sigHeight = sigWidth * 0.42; 
      
      const adjustedX = clamp(clickX, 0, Math.max(0, previewState.pageWidthPt - sigWidth));
      const adjustedY = clamp(clickY, 0, Math.max(0, previewState.pageHeightPt - sigHeight)); 
      
      previewState.signatureX = adjustedX;
      previewState.signatureY = adjustedY;
      previewState.activePreset = null;
      
      Object.entries(presetButtons).forEach(([key, button]) => {
        if (!button) return;
        button.classList.remove('bg-indigo-600', 'text-white', 'ring-2', 'ring-indigo-400', 'shadow-sm');
        button.classList.add('bg-gray-200', 'text-gray-800');
      });
      setSignatureOverlayPosition();
    });
  }

  if (signatureCanvas) {
    const ctx = signatureCanvas.getContext('2d');
    let drawing = false;

    function clearSignatureCanvas() {
      ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    }

    clearSignatureCanvas();

    function getPoint(event) {
      const rect = signatureCanvas.getBoundingClientRect();
      const scaleX = signatureCanvas.width / rect.width;
      const scaleY = signatureCanvas.height / rect.height;
      const clientX = event.clientX ?? (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
      const clientY = event.clientY ?? (event.touches && event.touches[0] ? event.touches[0].clientY : 0);
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    signatureCanvas.addEventListener('pointerdown', (event) => {
      drawing = true;
      const p = getPoint(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      signatureCanvas.setPointerCapture(event.pointerId);
    });

    signatureCanvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      const p = getPoint(event);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });

    signatureCanvas.addEventListener('pointerup', () => { drawing = false; });
    signatureCanvas.addEventListener('pointerleave', () => { drawing = false; });

    clearSignatureBtn && clearSignatureBtn.addEventListener('click', clearSignatureCanvas);

    if (signatureUpload) {
      signatureUpload.setAttribute('accept', 'image/png, image/jpeg, image/jpg');
      
      signatureUpload.addEventListener('change', async () => {
        const file = signatureUpload.files && signatureUpload.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          clearSignatureCanvas();
          const maxW = signatureCanvas.width - 20;
          const scale = Math.min(1, maxW / img.width);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (signatureCanvas.width - w) / 2;
          const y = (signatureCanvas.height - h) / 2;
          
          ctx.drawImage(img, x, y, w, h);
          const imageData = ctx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height);
          const data = imageData.data;
          
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            const brightness = (r * 0.299) + (g * 0.587) + (b * 0.114);
            
            data[i] = 17;     
            data[i + 1] = 24; 
            data[i + 2] = 39; 
            
            data[i + 3] = brightness > 240 ? 0 : 255 - brightness;
          }
          
          ctx.putImageData(imageData, 0, 0);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      });
    }

    applySignatureBtn && applySignatureBtn.addEventListener('click', async () => {
      const fileInput = document.getElementById('sign-file');
      const pageInput = document.getElementById('sign-page');
      const widthInput = document.getElementById('sign-width');
      const msg = document.getElementById('signature-msg');
      if (!fileInput || !fileInput.files.length) {
        msg && (msg.textContent = 'Seleziona un PDF da firmare.');
        return;
      }
      const pdfFile = fileInput.files[0];
      const check = ensureUsableFile(pdfFile, 'PDF');
      if (!check.valid) {
        msg && (msg.textContent = check.message);
        return;
      }

      try {
        const dataUrl = signatureCanvas.toDataURL('image/png');
        if (dataUrl === 'data:,') {
          msg && (msg.textContent = 'Disegna una firma o carica un PNG prima di applicarla.');
          return;
        }

        const pngBuffer = await fetch(dataUrl).then((r) => r.arrayBuffer());
        const pdfBytes = await pdfFile.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        const image = await pdfDoc.embedPng(pngBuffer);
        const targetWidth = Math.max(40, safeNumber(widthInput && widthInput.value, 180));

        const previewWidth = previewState.pageWidthPt || 595.28;
        const previewHeight = previewState.pageHeightPt || 841.89;
        const fracX = clamp((previewState.signatureX || previewWidth * 0.75) / previewWidth, 0, 1);
        const fracYTop = clamp((previewState.signatureY || previewHeight * 0.85) / previewHeight, 0, 1);

        const applyToAll = !!(signAllPagesInput && signAllPagesInput.checked);
        const allPages = pdfDoc.getPages();
        const pageNum = Math.max(1, parseInt(pageInput ? pageInput.value : '1', 10) || 1);
        const singlePageIndex = Math.min(allPages.length, pageNum) - 1;
        const targetPages = applyToAll ? allPages : [allPages[singlePageIndex]];

        targetPages.forEach((page) => {
          if (!page) return;
          const { width, height } = page.getSize();
          const scale = targetWidth / image.width;
          const targetHeight = Math.min(image.height * scale, height);
          
          const pdfX = clamp(fracX * width, 0, Math.max(0, width - targetWidth));
          const pdfY = clamp(height - (fracYTop * height) - targetHeight, 0, Math.max(0, height - targetHeight));

          page.drawImage(image, {
            x: pdfX,
            y: pdfY,
            width: targetWidth,
            height: targetHeight
          });
        });

        const out = await pdfDoc.save();
        const url = URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = (pdfFile.name || 'documento').replace(/\.pdf$/i, '') + '-firmato.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        msg && (msg.textContent = applyToAll
          ? `Firma applicata a tutte le ${targetPages.length} pagine e PDF scaricato.`
          : 'Firma applicata e PDF scaricato.');
      } catch (error) {
        console.error('PDF signature error:', error);
        msg && (msg.textContent = window.StrumentiErrors
          ? window.StrumentiErrors.friendlyErrorMessage(error, 'Errore durante la firma del PDF.')
          : 'Errore durante la firma del PDF.');
      }
    });
  }

})();

/* UI wiring */
(function(){
  function setupDropzone(dropId, inputId, filenameId, browseId){
    if (!window.StrumentiDropzone) return;
    window.StrumentiDropzone.setup({
      drop: dropId,
      input: inputId,
      filename: filenameId,
      browse: browseId
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    setupDropzone('drop-split-file','split-file','split-filename','split-browse');
    setupDropzone('drop-organizer-files', 'organizer-files', null, 'organizer-browse');
    setupDropzone('drop-images-files','images-files','images-filename','images-browse');
    setupDropzone('drop-compress-file','compress-file','compress-filename','compress-browse');
    setupDropzone('drop-docx-file','docx-file','docx-filename','docx-browse');
    setupDropzone('drop-sign-file','sign-file','sign-filename','sign-browse');
    setupDropzone('drop-redact-file','redact-file','redact-filename','redact-browse');
  });
})();