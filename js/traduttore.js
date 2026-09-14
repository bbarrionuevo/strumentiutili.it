// js/traduttore.js — Controlador de traducción conectado a Web Worker vía Comlink

let currentFile = null;
let extractedParagraphs = [];
let translatedParagraphs = [];
let translationWorker = null;

function $(id) { return document.getElementById(id); }

function safeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function groupParagraphsIntoChunks(paragraphs, maxChars = 400) {
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (const para of paragraphs) {
    const p = safeText(para);
    if (!p) continue;

    if (p.length > maxChars) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentLength = 0;
      }
      chunks.push(p);
      continue;
    }

    if (currentLength + p.length + 2 > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
      currentChunk = [p];
      currentLength = p.length;
    } else {
      currentChunk.push(p);
      currentLength += p.length + (currentChunk.length > 1 ? 2 : 0);
    }
  }

  if (currentChunk.length > 0) chunks.push(currentChunk.join('\n\n'));
  return chunks.length ? chunks : paragraphs;
}

async function getTranslationWorker() {
  if (translationWorker) return translationWorker;
  const Comlink = await import('https://unpkg.com/comlink/dist/esm/comlink.mjs');
  const worker = new Worker('/js/workers/translation-worker.js');
  translationWorker = {
    service: Comlink.wrap(worker),
    Comlink
  };
  return translationWorker;
}

async function extractTextFromFile(file) {
  if (!file || !file.size) throw new Error('File non valido');
  const name = safeText(file.name).toLowerCase();

  if (name.endsWith('.txt')) {
    const txt = await file.text();
    const paras = (txt || '').split(/\r?\n/).map(p => safeText(p)).filter(Boolean);
    return { type: 'txt', paragraphs: paras };
  }

  if (name.endsWith('.docx')) {
    if (typeof mammoth === 'undefined') throw new Error('Libreria Mammoth non disponibile');
    const arr = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: arr });
    const raw = safeText(res?.value || '');
    const paras = raw.split(/\r?\n/).map(p => safeText(p)).filter(Boolean);
    return { type: 'docx', paragraphs: paras };
  }

  if (name.endsWith('.pdf')) {
    if (typeof pdfjsLib === 'undefined') throw new Error('Libreria PDF.js non disponibile');
    const arr = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n\n';
    }
    const paras = fullText.split(/\n\n+/).map(p => safeText(p)).filter(Boolean);
    return { type: 'pdf', paragraphs: paras };
  }

  throw new Error('Formato non supportato');
}

function prepareDownload() {
  const downloadArea = $('download-area');
  if (!downloadArea) return;
  if (!translatedParagraphs.length) {
    downloadArea.innerHTML = '<div class="text-sm font-semibold text-gray-500">Nessun file tradotto disponibile.</div>';
    return;
  }

  downloadArea.innerHTML = `
    <div class="text-sm font-bold text-gray-800 mb-3">Scarica il file tradotto:</div>
    <div class="flex flex-wrap gap-2 justify-center">
      <button id="dl-txt" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition shadow-sm">📄 Scarica .TXT</button>
      <button id="dl-docx" class="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 rounded-lg transition">📝 Scarica .DOCX</button>
      <button id="dl-pdf" class="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 rounded-lg transition">📕 Scarica .PDF</button>
    </div>
  `;

  const filenameBase = String(currentFile?.name || 'tradotto').replace(/\.[^.]+$/, '');

  $('dl-txt')?.addEventListener('click', () => {
    const blob = new Blob([translatedParagraphs.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${filenameBase}-tradotto.txt`);
  });

  $('dl-docx')?.addEventListener('click', async () => {
    if (!window.docx) return alert('Libreria docx non caricata.');
    const { Document, Packer, Paragraph } = window.docx;
    const doc = new Document({
      sections: [{ children: translatedParagraphs.map(p => new Paragraph(p)) }]
    });
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${filenameBase}-tradotto.docx`);
  });

  $('dl-pdf')?.addEventListener('click', async () => {
    if (typeof PDFLib === 'undefined') return alert('Libreria PDFLib non caricata.');
    const pdfDoc = await PDFLib.PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const margin = 40;
    const { width, height } = page.getSize();
    let y = height - margin;

    const fontSize = 10;
    const lineHeight = 14;
    const maxWidth = width - (margin * 2);

    for (const para of translatedParagraphs) {
      if (!para.trim()) { y -= 10; continue; }
      
      const cleanPara = para.replace(/[^\x00-\xFF]/g, '');
      const words = cleanPara.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        let textWidth = 0;
        try {
          textWidth = font.widthOfTextAtSize(testLine, fontSize);
        } catch (_) {
          textWidth = testLine.length * 5; 
        }

        if (textWidth < maxWidth) {
          currentLine = testLine;
        } else {
          if (y < margin + 20) { page = pdfDoc.addPage([595.28, 841.89]); y = height - margin; }
          try { page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: PDFLib.rgb(0.15, 0.15, 0.15) }); } catch (_) {}
          y -= lineHeight;
          currentLine = word;
        }
      }
      
      if (currentLine) {
        if (y < margin + 20) { page = pdfDoc.addPage([595.28, 841.89]); y = height - margin; }
        try { page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: PDFLib.rgb(0.15, 0.15, 0.15) }); } catch (_) {}
        y -= lineHeight + 6; 
      }
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    downloadBlob(blob, `${filenameBase}-tradotto.pdf`);
  });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleFileSelect(file) {
  if (!file) return;
  currentFile = file;
  const fileNameDisplay = $('file-filename');
  if (fileNameDisplay) {
    fileNameDisplay.textContent = file.name;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const fileInputEl = $('file-input');
  const dropZone = $('drop-file-input');

  if (fileInputEl && dropZone) {
    dropZone.addEventListener('click', () => fileInputEl.click());

    fileInputEl.addEventListener('change', (e) => {
      if (e.target.files?.length) {
        handleFileSelect(e.target.files[0]);
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault(); 
      dropZone.classList.add('border-indigo-500', 'bg-indigo-50'); 
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('border-indigo-500', 'bg-indigo-50'); 
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); 
      dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        fileInputEl.files = e.dataTransfer.files;
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  $('start-translate')?.addEventListener('click', async () => {
    if (!currentFile) return alert('Seleziona prima un file!');
    const statusEl = $('trans-status');
    const modelStatusEl = $('model-status');
    const modelProgressEl = $('model-progress');
    const transProgressEl = $('trans-progress');

    try {
      if (statusEl) statusEl.textContent = 'Estrazione testo...';
      const extracted = await extractTextFromFile(currentFile);
      extractedParagraphs = extracted.paragraphs;
      if (!extractedParagraphs.length) return alert('Nessun testo trovato nel file.');

      const dir = $('direction')?.value || 'it-en';
      const modelMap = {
        'es-it': 'Xenova/opus-mt-es-it',
        'it-es': 'Xenova/opus-mt-it-es',
        'en-it': 'Xenova/opus-mt-en-it',
        'it-en': 'Xenova/opus-mt-it-en'
      };
      const modelId = modelMap[dir] || modelMap['it-en'];

      const { service, Comlink } = await getTranslationWorker();

      if (modelStatusEl) modelStatusEl.textContent = 'Caricamento modello IA...';

      // Cargar Modelo en el Worker con callback de progreso
      await service.loadModel(
        modelId,
        Comlink.proxy((pct) => {
          const progress = Math.min(100, Math.max(0, Math.round(pct * 100)));
          if (modelStatusEl) modelStatusEl.textContent = `Scaricamento modello: ${progress}%`;
          if (modelProgressEl) modelProgressEl.style.width = `${progress}%`;
        })
      );

      if (modelStatusEl) modelStatusEl.textContent = `Modello pronto: ${modelId}`;
      if (modelProgressEl) modelProgressEl.style.width = '100%';
      if (statusEl) statusEl.textContent = 'Traduzione in corso...';

      const chunks = groupParagraphsIntoChunks(extractedParagraphs, 400);

      // Traducir Chunks en el Worker con callback de progreso
      translatedParagraphs = await service.translateChunks(
        chunks,
        modelId,
        Comlink.proxy((percent) => {
          if (statusEl) statusEl.textContent = `Traducendo: ${percent}%`;
          if (transProgressEl) transProgressEl.style.width = `${percent}%`;
        })
      );

      if (statusEl) statusEl.textContent = 'Traduzione completata';
      if (transProgressEl) transProgressEl.style.width = '100%';
      prepareDownload();

    } catch (err) {
      console.error('Error en traduzione:', err);
      if (statusEl) statusEl.textContent = 'Errore durante la traduzione.';
    }
  });
});