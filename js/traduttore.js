// js/traduttore.js — Traductor optimizado Client-Side con "Inline Blob Worker"
let worker = null;
let currentFile = null;
let extractedParagraphs = [];
let translatedParagraphs = [];

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

function initWorker() {
  if (worker) return;
  try {
    const workerScript = `
    import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
    
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
        env.backends.onnx.wasm.simd = true;
        env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
    }

    let translator = null;

    self.onmessage = async (e) => {
        const { type, model, paragraphs } = e.data;
        
        if (type === 'load-model') {
            try {
                self.postMessage({ type: 'model-progress', progress: 0.01 });
                translator = await pipeline('translation', model, {
                    quantized: true,
                    progress_callback: p => {
                        if (p && p.status === 'progress') {
                            self.postMessage({ type: 'model-progress', progress: p.progress / 100 });
                        }
                    }
                });
                self.postMessage({ type: 'model-ready', model });
            } catch (err) {
                self.postMessage({ type: 'error', message: err.message });
            }
        } 
        else if (type === 'translate') {
            try {
                const translatedChunks = [];
                for (let i = 0; i < paragraphs.length; i++) {
                    const res = await translator(paragraphs[i], {
                        num_beams: 1,
                        do_sample: false,
                        max_new_tokens: 300
                    });
                    const out = Array.isArray(res) ? res[0]?.translation_text : res?.translation_text || res?.generated_text || '';
                    translatedChunks.push(out || paragraphs[i]);
                    
                    self.postMessage({ type: 'progress', percent: Math.round(((i + 1) / paragraphs.length) * 100) });
                }
                self.postMessage({ type: 'complete', result: translatedChunks });
            } catch (err) {
                self.postMessage({ type: 'error', message: err.message });
            }
        }
    };
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl, { type: 'module' });

    worker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'model-progress') {
        const progress = Math.min(100, Math.max(0, Math.round((msg.progress || 0) * 100)));
        const el = $('model-status');
        const pEl = $('model-progress');
        if (el) el.textContent = `Scaricamento modello: ${progress}%`;
        if (pEl) pEl.style.width = `${progress}%`;
      } else if (msg.type === 'model-ready') {
        const el = $('model-status');
        const pEl = $('model-progress');
        if (el) el.textContent = `Modello pronto: ${msg.model}`;
        if (pEl) pEl.style.width = '100%';
      } else if (msg.type === 'progress') {
        const percent = typeof msg.percent === 'number' ? msg.percent : Math.round(((msg.current || 0) / (msg.total || 1)) * 100);
        const tEl = $('trans-status');
        const tpEl = $('trans-progress');
        if (tEl) tEl.textContent = `Traducendo: ${percent}%`;
        if (tpEl) tpEl.style.width = `${percent}%`;
      } else if (msg.type === 'complete') {
        translatedParagraphs = Array.isArray(msg.result) ? msg.result : [];
        const tEl = $('trans-status');
        const tpEl = $('trans-progress');
        if (tEl) tEl.textContent = 'Traduzione completata';
        if (tpEl) tpEl.style.width = '100%';
        prepareDownload();
      } else if (msg.type === 'error') {
        console.error('Worker translate error:', msg);
        runMainThreadTranslation();
      }
    };

    worker.onerror = (error) => {
      console.warn('Worker Error. Fallback al hilo principal...', error);
      if (worker) { worker.terminate(); worker = null; }
      runMainThreadTranslation();
    };
  } catch (e) {
    worker = null;
  }
}

async function runMainThreadTranslation() {
  const statusEl = $('model-status');
  const transEl = $('trans-status');
  if (statusEl) statusEl.textContent = 'Esecuzione locale nel browser...';
  try {
    const dir = $('direction')?.value || 'it-en';
    const modelMap = {
      'es-it': 'Xenova/opus-mt-es-it', 'it-es': 'Xenova/opus-mt-it-es',
      'en-it': 'Xenova/opus-mt-en-it', 'it-en': 'Xenova/opus-mt-it-en'
    };
    const modelId = modelMap[dir] || modelMap['it-en'];
    const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    const { pipeline, env } = mod;

    if (env) {
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      if (env.wasm) {
        env.wasm.simd = true;
        env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
      }
    }

    if (statusEl) statusEl.textContent = 'Caricamento modello IA...';
    const translator = await pipeline('translation', modelId, {
      quantized: true,
      progress_callback: (p) => {
        if (p && p.status === 'progress') {
          const pct = Math.round(p.progress || 0);
          if (statusEl) statusEl.textContent = `Scaricamento modello: ${pct}%`;
          const pEl = $('model-progress');
          if (pEl) pEl.style.width = `${pct}%`;
        }
      }
    });

    if (transEl) transEl.textContent = 'Traduzione in corso...';
    const chunks = groupParagraphsIntoChunks(extractedParagraphs, 400);
    const translatedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 10)); 
      const res = await translator(chunks[i], { num_beams: 1, do_sample: false, max_new_tokens: 300 });
      const outText = Array.isArray(res) ? res[0]?.translation_text : res?.translation_text || res?.generated_text || '';
      translatedChunks.push(outText || chunks[i]);

      const pct = Math.round(((i + 1) / chunks.length) * 100);
      if (transEl) transEl.textContent = `Traducendo: ${pct}%`;
      const tpEl = $('trans-progress');
      if (tpEl) tpEl.style.width = `${pct}%`;
    }

    translatedParagraphs = translatedChunks.join('\n\n').split(/\n\n+/).map(p => safeText(p)).filter(Boolean);
    if (transEl) transEl.textContent = 'Traduzione completata';
    prepareDownload();
  } catch (err) {
    console.error('Error en traducción:', err);
    if (transEl) transEl.textContent = 'Errore durante la traduzione.';
  }
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

window.addEventListener('DOMContentLoaded', () => {
  initWorker();

  const fileInputEl = $('file-input');
  if (fileInputEl) {
    fileInputEl.setAttribute('accept', '.txt,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    fileInputEl.addEventListener('change', (e) => {
      if (e.target.files?.length) currentFile = e.target.files[0];
    });
  }

  $('start-translate')?.addEventListener('click', async () => {
    if (!currentFile) return alert('Seleziona prima un file!');
    try {
      $('trans-status').textContent = 'Estrazione testo...';
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

      if (!worker) initWorker();
      if (!worker) return await runMainThreadTranslation();

      const chunks = groupParagraphsIntoChunks(extractedParagraphs, 400);
      worker.postMessage({ type: 'load-model', model: modelId });

      await new Promise((resolve) => {
        const onReady = (ev) => {
          if (ev.data?.type === 'model-ready') {
            worker.removeEventListener('message', onReady);
            resolve();
          }
        };
        worker.addEventListener('message', onReady);
      });

      worker.postMessage({ type: 'translate', paragraphs: chunks, model: modelId });
    } catch (err) {
      console.error(err);
      await runMainThreadTranslation();
    }
  });
});
