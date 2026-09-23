// js/pdf-tools.js — Herramientas PDF (Web Workers + Comlink)

if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions?.workerSrc) {
  try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'; } catch (e) { }
}

(async ()=>{
  // Importar Comlink e instanciar el Worker con la ruta exacta corregida
  const Comlink = await import('https://unpkg.com/comlink@4.4.2/dist/esm/comlink.mjs');
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

  // Le pagine sono estratte nell'ordine indicato (così «3,1» le inverte) e senza ripetizioni;
  // un intervallo decrescente come «5-3» viene letto al contrario invece di essere ignorato.
  function parsePages(input, pageCount){
    if (!input) return [];
    const parts = input.split(',').map(p=>p.trim());
    const out = [];
    const aggiungi = (n) => {
      if (n >= 1 && n <= pageCount && !out.includes(n - 1)) out.push(n - 1);
    };
    for (const part of parts){
      if (part.includes('-')){
        const [s,e] = part.split('-').map(x=>parseInt(x,10));
        if (isNaN(s) || isNaN(e)) continue;
        if (s <= e) { for (let i=s; i<=e; i++) aggiungi(i); }
        else { for (let i=s; i>=e; i--) aggiungi(i); }
      } else {
        const n = parseInt(part,10);
        if (!isNaN(n)) aggiungi(n);
      }
    }
    return out;
  }

  function downloadBlob(buffer, filename, type = 'application/pdf') {
    const blob = new Blob([buffer], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; 
    document.body.appendChild(a); a.click(); a.remove();
    // revoca differita: una revoca immediata può interrompere il download in alcuni browser
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        if (!pages.length) {
          msg.textContent = pagesInput
            ? `Nessuna pagina valida: il documento ha ${pdfJsDoc.numPages} pagine.`
            : 'Indica le pagine (es. 1,3-5).';
          doSplitBtn.disabled = false;
          return;
        }
        
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
          const puntiPagina = page.getViewport({ scale: 1 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          // sfondo bianco: le pagine senza sfondo diventerebbero nere nel JPEG
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', q);
          const res = await fetch(dataUrl);
          const buf = await (await res.blob()).arrayBuffer();
          // dimensioni originali in punti: il PDF compresso mantiene il formato di stampa (es. A4)
          payload.push({ buffer: buf, mime: 'image/jpeg', widthPt: puntiPagina.width, heightPt: puntiPagina.height });
          transferables.push(buf);
          canvas.width = 0; 
        }

        msg.textContent = 'Compressione PDF nel Worker...';
        const resultBuffer = await pdfWorker.imagesToPdf(Comlink.transfer(payload, transferables));
        // Un PDF testuale leggero diventa spesso più pesante una volta convertito in immagini: in quel caso non si scarica
        const kb = (n) => Math.round(n / 1024).toLocaleString('it-IT') + ' KB';
        const prima = input.files[0].size;
        const dopo = resultBuffer.byteLength;
        if (dopo >= prima) {
          msg.textContent = `Il PDF ricompresso (${kb(dopo)}) non è più leggero dell'originale (${kb(prima)}): il file è già ottimizzato, usa l'originale.`;
        } else {
          downloadBlob(resultBuffer, 'compressed.pdf');
          msg.textContent = `PDF compresso e scaricato: da ${kb(prima)} a ${kb(dopo)} (-${Math.round((1 - dopo / prima) * 100)}%).`;
        }
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
        
        // La pagina viene renderizzata ad alta risoluzione (circa 180 DPI) con i riquadri neri già applicati:
        // il worker la sostituisce con questa immagine, così il testo coperto non resta nel file
        const RISOLUZIONE = 2.5;
        const docJs = await window.pdfjsLib.getDocument({ data: redactState.pdfBytes.slice(0) }).promise;
        const paginaJs = await docJs.getPage(redactState.pageNumber);
        const vpAlta = paginaJs.getViewport({ scale: RISOLUZIONE });
        const vpPunti = paginaJs.getViewport({ scale: 1 });
        const tela = document.createElement('canvas');
        tela.width = Math.ceil(vpAlta.width);
        tela.height = Math.ceil(vpAlta.height);
        const ctxTela = tela.getContext('2d');
        ctxTela.fillStyle = '#ffffff';
        ctxTela.fillRect(0, 0, tela.width, tela.height);
        await paginaJs.render({ canvasContext: ctxTela, viewport: vpAlta }).promise;
        const kx = tela.width / redactCanvas.width;
        const ky = tela.height / redactCanvas.height;
        ctxTela.fillStyle = '#000000';
        redactState.selections.forEach(sel => ctxTela.fillRect(Math.floor(sel.x * kx), Math.floor(sel.y * ky), Math.ceil(sel.width * kx) + 1, Math.ceil(sel.height * ky) + 1));
        const jpg = await new Promise((ok, ko) => tela.toBlob(b => (b ? ok(b) : ko(new Error('Rendering della pagina non riuscito'))), 'image/jpeg', 0.92));
        const immagine = await jpg.arrayBuffer();
        const arr = redactState.pdfBytes.slice(0);

        const resultBuffer = await pdfWorker.redactPdf(
          Comlink.transfer(arr, [arr]),
          redactState.pageNumber,
          Comlink.transfer(immagine, [immagine]),
          vpPunti.width,
          vpPunti.height
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
    const msg = document.getElementById('signature-msg');
    try {
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
      if (msg) msg.textContent = '';
    } catch (e) {
      console.error('Anteprima PDF non riuscita:', e);
      previewState.viewport = null;
      if (msg) {
        msg.textContent = e && e.name === 'PasswordException'
          ? 'Il PDF è protetto da password: rimuovi la protezione prima di firmarlo.'
          : 'Impossibile aprire questo PDF: il file potrebbe essere danneggiato.';
        msg.className = 'mt-3 text-sm font-medium text-rose-600 text-right';
      }
    }
  }

  document.getElementById('sign-file')?.addEventListener('change', (e) => renderSignPreview(e.target.files[0]));
  document.getElementById('sign-page')?.addEventListener('change', () => renderSignPreview(document.getElementById('sign-file').files[0]));

  // La firma occupa solo una parte del riquadro di disegno: senza ritaglio la larghezza scelta si
  // applicherebbe al riquadro intero e la firma finirebbe molto più piccola e spostata rispetto all'anteprima.
  function ritagliaFirma() {
    if (!signatureCanvas) return null;
    const w = signatureCanvas.width;
    const h = signatureCanvas.height;
    const dati = signatureCanvas.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (dati[(y * w + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const margine = 4;
    x0 = Math.max(0, x0 - margine); y0 = Math.max(0, y0 - margine);
    x1 = Math.min(w - 1, x1 + margine); y1 = Math.min(h - 1, y1 + margine);
    const ritaglio = document.createElement('canvas');
    ritaglio.width = x1 - x0 + 1;
    ritaglio.height = y1 - y0 + 1;
    ritaglio.getContext('2d').drawImage(signatureCanvas, x0, y0, ritaglio.width, ritaglio.height, 0, 0, ritaglio.width, ritaglio.height);
    return ritaglio;
  }

  const larghezzaFirmaPt = () => Math.max(40, Number(document.getElementById('sign-width')?.value || 180));

  // Anteprima fedele: stesse dimensioni e stesse proporzioni che avrà la firma nel PDF
  function disegnaOverlay() {
    if (!previewCanvas || !previewOverlay || !previewState.viewport) return;
    const rect = previewCanvas.getBoundingClientRect();
    const ritaglio = ritagliaFirma();
    const larghezza = larghezzaFirmaPt();
    const altezza = Math.min(ritaglio ? larghezza * (ritaglio.height / ritaglio.width) : larghezza / 3, previewState.pageHeightPt);
    previewState.signatureX = Math.max(0, Math.min(previewState.signatureX, previewState.pageWidthPt - larghezza));
    previewState.signatureY = Math.max(0, Math.min(previewState.signatureY, previewState.pageHeightPt - altezza));
    previewOverlay.style.left = `${(previewState.signatureX / previewState.pageWidthPt) * rect.width}px`;
    previewOverlay.style.top = `${(previewState.signatureY / previewState.pageHeightPt) * rect.height}px`;
    previewOverlay.style.width = `${(larghezza / previewState.pageWidthPt) * rect.width}px`;
    previewOverlay.style.height = `${(altezza / previewState.pageHeightPt) * rect.height}px`;
    if (ritaglio) {
      previewOverlay.style.backgroundImage = `url(${ritaglio.toDataURL('image/png')})`;
      previewOverlay.style.backgroundSize = 'contain';
      previewOverlay.style.backgroundRepeat = 'no-repeat';
      previewOverlay.style.backgroundPosition = 'center';
      previewOverlay.textContent = '';
    }
    previewOverlay.classList.remove('hidden');
  }

  function updateOverlayImage() {
    disegnaOverlay();
  }

  // Lógica Recuadro Firma
  if (previewCanvas) {
    previewCanvas.addEventListener('pointerdown', (ev) => {
      if (!previewState.viewport) return;
      const rect = previewCanvas.getBoundingClientRect();
      previewState.signatureX = ((ev.clientX - rect.left) / rect.width) * previewState.pageWidthPt;
      previewState.signatureY = ((ev.clientY - rect.top) / rect.height) * previewState.pageHeightPt;
      disegnaOverlay();
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
    disegnaOverlay();
  }

  document.getElementById('preset-bottom-left')?.addEventListener('click', () => updateOverlayPosition(0.05, 0.85));
  document.getElementById('preset-bottom-center')?.addEventListener('click', () => updateOverlayPosition(0.40, 0.85));
  document.getElementById('preset-bottom-right')?.addEventListener('click', () => updateOverlayPosition(0.70, 0.85));
  document.getElementById('sign-width')?.addEventListener('input', () => disegnaOverlay());

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
        
        // Sfondo della foto reso trasparente in modo graduale: il colore dell'inchiostro (anche blu)
        // e i bordi sfumati restano, evitando l'effetto timbro di una soglia netta sul nero.
        const CHIARO = 210;
        const SCURO = 120;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue;

          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (brightness >= CHIARO) {
            data[i + 3] = 0;
          } else if (brightness <= SCURO) {
            data[i + 3] = 255;
          } else {
            data[i + 3] = Math.round(((CHIARO - brightness) / (CHIARO - SCURO)) * 255);
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

      const avviso = (testo, errore) => {
        msg.textContent = testo;
        msg.className = `mt-3 text-sm font-medium text-right ${errore ? 'text-rose-600' : 'text-emerald-600'}`;
      };

      const ritaglio = ritagliaFirma();
      if (!ritaglio) {
        avviso('Disegna la firma nel riquadro (o caricane l\'immagine) prima di applicarla.', true);
        return;
      }

      try {
        applySignatureBtn.disabled = true;
        avviso('Applicazione della firma in corso...', false);

        const pdfBytes = await file.arrayBuffer();

        const pngDataUrl = ritaglio.toDataURL('image/png');
        const res = await fetch(pngDataUrl);
        const pngBuffer = await res.arrayBuffer();

        const config = {
          targetWidth: larghezzaFirmaPt(),
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
        avviso('Firma applicata: controlla il file scaricato.', false);
      } catch (e) {
        console.error("Errore Worker Firma:", e);
        const cifrato = /encrypt/i.test(String(e && e.message));
        avviso(cifrato
          ? 'Il PDF è protetto da password: rimuovi la protezione prima di firmarlo.'
          : 'Firma non riuscita: il PDF potrebbe essere danneggiato o non leggibile.', true);
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