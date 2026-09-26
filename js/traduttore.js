// js/traduttore.js — Interfaccia del traduttore; il modello lavora in un worker (Comlink)

let currentFile = null;
let extractedParagraphs = [];
let translatedParagraphs = [];
let translationWorker = null;

function $(id) { return document.getElementById(id); }

function safeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// Ogni segmento resta legato al proprio paragrafo: raggruppare paragrafi diversi in un unico
// blocco faceva restituire al modello un testo continuo, con la struttura del documento perduta.
function segmentaParagrafi(paragraphs, maxChars = 400) {
  const segmenti = [];

  paragraphs.forEach((para, indice) => {
    const p = safeText(para);
    if (!p) return;

    if (p.length <= maxChars) {
      segmenti.push({ paragrafo: indice, testo: p });
      return;
    }

    // Paragrafo lungo: spezzato sulle frasi, perché il modello traduce una frase per volta
    const frasi = p.match(/[^.!?…]+[.!?…]*\s*/g) || [p];
    let corrente = '';
    for (const frase of frasi) {
      if (corrente && (corrente + frase).length > maxChars) {
        segmenti.push({ paragrafo: indice, testo: corrente.trim() });
        corrente = frase;
      } else {
        corrente += frase;
      }
    }
    if (corrente.trim()) segmenti.push({ paragrafo: indice, testo: corrente.trim() });
  });

  return segmenti;
}

function ricomponiParagrafi(segmenti, tradotti) {
  const perParagrafo = new Map();
  segmenti.forEach((s, i) => {
    const testo = safeText(tradotti[i]);
    if (!testo) return;
    perParagrafo.set(s.paragrafo, perParagrafo.has(s.paragrafo) ? `${perParagrafo.get(s.paragrafo)} ${testo}` : testo);
  });
  return [...perParagrafo.keys()].sort((a, b) => a - b).map(k => perParagrafo.get(k));
}

async function getTranslationWorker() {
  if (translationWorker) return translationWorker;
  const Comlink = await import('/vendor/comlink@4.4.2/comlink.mjs');
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
    const pdf = await pdfjsLib.getDocument({ data: arr, isEvalSupported: false }).promise;
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

  // Anteprima del testo tradotto: permette di controllare il risultato senza scaricare il file
  downloadArea.innerHTML = `
    <div class="w-full text-left">
      <div class="text-sm font-bold text-gray-800 mb-2">Testo tradotto</div>
      <textarea id="trans-preview" readonly class="w-full h-48 p-3 border border-gray-300 rounded-lg bg-white text-sm text-gray-800 text-left"></textarea>
    </div>
    <div class="text-sm font-bold text-gray-800 mt-4 mb-3">Scarica il file tradotto:</div>
    <div class="flex flex-wrap gap-2 justify-center">
      <button id="dl-txt" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition shadow-sm">📄 Scarica .TXT</button>
      <button id="dl-docx" class="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 rounded-lg transition">📝 Scarica .DOCX</button>
      <button id="dl-pdf" class="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 rounded-lg transition">📕 Scarica .PDF</button>
    </div>
  `;
  const anteprima = $('trans-preview');
  if (anteprima) anteprima.value = translatedParagraphs.join('\n\n');

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
      
      const cleanPara = testoWinAnsi(para);
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

// Il font Helvetica del PDF usa la codifica WinAnsi: le lettere fuori da quel set diventano la
// lettera base invece di sparire dal documento.
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const LETTERE_SPECIALI = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'Ŋ': 'N', 'ŋ': 'n', 'Ŧ': 'T', 'ŧ': 't' };
function testoWinAnsi(s) {
  const ammesso = (ch) => {
    const c = ch.charCodeAt(0);
    return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.indexOf(ch) !== -1;
  };
  return Array.from(String(s || '')).map(ch => {
    if (ammesso(ch)) return ch;
    if (LETTERE_SPECIALI[ch]) return LETTERE_SPECIALI[ch];
    const base = ch.normalize('NFD').charAt(0);
    return ammesso(base) ? base : '?';
  }).join('');
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoca differita: una revoca immediata può interrompere il download in alcuni browser
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

      // Caricamento del modello nel worker, con l'avanzamento
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

      const segmenti = segmentaParagrafi(extractedParagraphs, 400);

      // Traduzione dei blocchi nel worker, con l'avanzamento
      const tradotti = await service.translateChunks(
        segmenti.map(s => s.testo),
        modelId,
        Comlink.proxy((percent) => {
          if (statusEl) statusEl.textContent = `Traducendo: ${percent}%`;
          if (transProgressEl) transProgressEl.style.width = `${percent}%`;
        })
      );

      translatedParagraphs = ricomponiParagrafi(segmenti, tradotti);

      if (statusEl) statusEl.textContent = 'Traduzione completata';
      if (transProgressEl) transProgressEl.style.width = '100%';
      prepareDownload();

    } catch (err) {
      console.error('Error en traduzione:', err);
      const messaggio = String(err && err.message);
      if (statusEl) {
        if (/Formato non supportato/i.test(messaggio)) statusEl.textContent = 'Formato non supportato: carica un file TXT, DOCX o PDF.';
        else if (/password|encrypt/i.test(messaggio)) statusEl.textContent = 'Il PDF è protetto da password: rimuovi la protezione e riprova.';
        else if (/fetch|network|load|503|Failed/i.test(messaggio)) statusEl.textContent = 'Impossibile scaricare il modello di traduzione: controlla la connessione e riprova.';
        else statusEl.textContent = 'Errore durante la traduzione.';
      }
    }
  });
});