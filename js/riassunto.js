(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', initSummarizer);

  function initSummarizer() {
    const srcText = document.getElementById('source-text');
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const btnSummarize = document.getElementById('summarize');
    const btnClear = document.getElementById('summ-clear');
    const btnCopy = document.getElementById('btn-copy');
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    
    const lengthSel = document.getElementById('summary-length');
    const formatSel = document.getElementById('summary-format');
    
    const progress = document.getElementById('summary-progress');
    const progressText = document.getElementById('progress-text');
    const resultContainer = document.getElementById('result-container');
    const outSummary = document.getElementById('summary-result');
    const charCount = document.getElementById('char-count');

    if (!srcText || !btnSummarize) return;

    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const STOP_WORDS = new Set([
      'il','lo','la','i','gli','le','un','uno','una','di','a','da','in','con','su','per','tra','fra',
      'del','dello','della','dei','degli','delle','al','allo','alla','ai','agli','alle','dal','dallo',
      'dalla','dai','dagli','dalle','nel','nello','nella','nei','negli','nelle','sul','sullo','sulla',
      'sui','sugli','sulle','ed','e','o','se','perché','poiché','ma','anche','che','chi','cui','quale',
      'quali','questo','questa','questi','queste','quello','quella','quelli','quelle','si','ci','vi',
      'ne','me','te','gli','li','mi','ti','ha','hanno','è','sono','era','erano','stato','stata','stati',
      'state','essere','avere','fare','fatto','dire','detto','più','meno','molto','poco','ogni','tutti',
      'el','los','las','del','por','para','como','con','que','non','not','and','the','to','of','in','is'
    ]);

    srcText.addEventListener('input', () => {
      charCount.textContent = `${srcText.value.length} caratteri`;
    });

    dropZone.addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });
    fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

    ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); dropZone.classList.add('border-indigo-500', 'bg-indigo-50');
    }));
    ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('border-indigo-500', 'bg-indigo-50');
      if (evt === 'drop' && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    }));

    async function handleFile(file) {
      if (!file) return;
      showProgress(`Lettura file "${file.name}" in corso...`);

      try {
        const ext = file.name.split('.').pop().toLowerCase();
        let extractedText = '';

        if (ext === 'txt') {
          extractedText = await file.text();
        } else if (ext === 'docx') {
          if (!window.mammoth) throw new Error('Libreria Mammoth non caricata.');
          const buffer = await file.arrayBuffer();
          const res = await window.mammoth.extractRawText({ arrayBuffer: buffer });
          extractedText = res.value;
        } else if (ext === 'pdf') {
          extractedText = await extractTextFromPDF(file);
        } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
          extractedText = await runOCR(file);
        } else {
          throw new Error('Formato file non supportato.');
        }

        extractedText = extractedText.trim();

        if (ext === 'pdf' && extractedText.length < 50) {
          showProgress('PDF scansionato rilevato. Avvio OCR in corso...');
          extractedText = await runOCR(file);
        }

        if (!extractedText) throw new Error('Nessun testo estratto dal documento.');

        srcText.value = extractedText;
        charCount.textContent = `${extractedText.length} caratteri`;
        hideProgress();
      } catch (err) {
        console.error(err);
        alert(`Errore nell'elaborazione del file: ${err.message}`);
        hideProgress();
      }
    }

    async function extractTextFromPDF(file) {
      if (!window.pdfjsLib) throw new Error('PDF.js non disponibile.');
      const buffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        showProgress(`Estrazione testo PDF (pagina ${i}/${pdf.numPages})...`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
      }
      return fullText;
    }

    async function runOCR(fileOrBlob) {
      if (!window.Tesseract) throw new Error('Tesseract OCR non disponibile.');
      showProgress('Esecuzione OCR (riconoscimento testo) in corso...');
      
      const worker = await window.Tesseract.createWorker('ita');
      const ret = await worker.recognize(fileOrBlob);
      await worker.terminate();
      return ret.data.text;
    }

    function advancedSummarize(text, mode, format) {
      if (!text) return '';

      const rawSentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const cleanSentences = rawSentences.map(s => s.trim()).filter(s => s.length > 10);

      if (cleanSentences.length <= 2) return text;

      const words = text.toLowerCase()
        .replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));

      const freqMap = {};
      words.forEach(w => freqMap[w] = (freqMap[w] || 0) + 1);

      const scoredSentences = cleanSentences.map((sentence, idx) => {
        const sWords = sentence.toLowerCase().split(/\s+/).filter(Boolean);
        let score = 0;

        sWords.forEach(w => {
          if (freqMap[w]) score += freqMap[w];
        });

        if (idx === 0) score *= 1.5;
        if (idx < 3) score *= 1.2;

        if (sWords.length < 5 || sWords.length > 50) score *= 0.7;

        if (/in conclusione|pertanto|infatti|risultato|fondamentale|importante|obiettivo/i.test(sentence)) {
          score *= 1.3;
        }

        return { sentence, score, idx };
      });

      let ratio = 0.3;
      if (mode === 'short') ratio = 0.15;
      if (mode === 'long') ratio = 0.50;

      let targetCount = Math.max(1, Math.round(scoredSentences.length * ratio));
      targetCount = Math.min(targetCount, scoredSentences.length);

      const topSentences = [...scoredSentences]
        .sort((a, b) => b.score - a.score)
        .slice(0, targetCount)
        .sort((a, b) => a.idx - b.idx);

      if (format === 'bullets') {
        return topSentences.map(item => `• ${item.sentence}`).join('\n\n');
      } else {
        return topSentences.map(item => item.sentence).join(' ');
      }
    }

    btnSummarize.addEventListener('click', () => {
      const text = srcText.value.trim();
      if (!text) {
        alert('Inserisci o carica un testo da riassumere.');
        return;
      }

      showProgress('Generazione del riassunto in corso...');
      
      setTimeout(() => {
        const mode = lengthSel.value;
        const format = formatSel.value;
        const summary = advancedSummarize(text, mode, format);

        outSummary.textContent = summary;
        resultContainer.classList.remove('hidden');
        hideProgress();

        resultContainer.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    btnClear.addEventListener('click', () => {
      srcText.value = '';
      outSummary.textContent = '';
      charCount.textContent = '0 caratteri';
      resultContainer.classList.add('hidden');
      hideProgress();
    });

    btnCopy.addEventListener('click', () => {
      const text = outSummary.textContent;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        btnCopy.textContent = '✓ Copiato!';
        setTimeout(() => btnCopy.textContent = '📋 Copia Testo', 2000);
      });
    });

    // Sanitizador para evitar fallos con emojis/símbolos en pdf-lib
    function sanitizeForPdf(str) {
      return str
        .replace(/[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[^\x00-\xFF]/g, '');
    }

    btnDownloadPdf.addEventListener('click', async () => {
      const rawText = outSummary.textContent;
      if (!rawText || typeof PDFLib === 'undefined') return;

      btnDownloadPdf.disabled = true;
      btnDownloadPdf.textContent = '⏳ Creazione PDF...';

      try {
        const text = sanitizeForPdf(rawText);
        const pdfDoc = await PDFLib.PDFDocument.create();
        let page = pdfDoc.addPage([595.28, 841.89]);
        const { width, height } = page.getSize();
        
        const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

        const margin = 50;
        let y = height - margin;

        page.drawText('Riassunto Documento', { x: margin, y, size: 20, font: fontBold, color: PDFLib.rgb(0.31, 0.27, 0.90) });
        y -= 25;
        page.drawText(`Generato da StrumentiUtili.it - ${new Date().toLocaleDateString()}`, { x: margin, y, size: 9, font, color: PDFLib.rgb(0.5, 0.5, 0.5) });
        y -= 30;

        const fontSize = 11;
        const lineHeight = 16;
        const maxWidth = width - (margin * 2);

        const paragraphs = text.split('\n');

        for (const para of paragraphs) {
          if (!para.trim()) { y -= 10; continue; }

          const words = para.split(' ');
          let currentLine = '';

          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            let textWidth = 0;
            
            try {
              textWidth = font.widthOfTextAtSize(testLine, fontSize);
            } catch (_) {
              textWidth = testLine.length * 6;
            }

            if (textWidth < maxWidth) {
              currentLine = testLine;
            } else {
              if (y < margin + 20) {
                page = pdfDoc.addPage([595.28, 841.89]);
                y = height - margin;
              }
              try {
                page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: PDFLib.rgb(0.15, 0.15, 0.15) });
              } catch (_) {}
              y -= lineHeight;
              currentLine = word;
            }
          }

          if (currentLine) {
            if (y < margin + 20) {
              page = pdfDoc.addPage([595.28, 841.89]);
              y = height - margin;
            }
            try {
              page.drawText(currentLine, { x: margin, y, size: fontSize, font, color: PDFLib.rgb(0.15, 0.15, 0.15) });
            } catch (_) {}
            y -= lineHeight + 6;
          }
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Riassunto_${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        console.error('PdfLib Error:', err);
        alert('Errore nella creazione del PDF.');
      } finally {
        btnDownloadPdf.disabled = false;
        btnDownloadPdf.textContent = '📄 Scarica PDF';
      }
    });

    function showProgress(msg) {
      progressText.textContent = msg;
      progress.classList.remove('hidden');
    }
    function hideProgress() {
      progress.classList.add('hidden');
    }
  }
})();