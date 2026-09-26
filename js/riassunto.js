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
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs@3.11.174/pdf.worker.min.js';
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
      const pdf = await window.pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise;
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
      
      // programma, motore e modello dal sito stesso (vendor/), non dai CDN predefiniti
      const worker = await window.Tesseract.createWorker('ita', 1, {
        workerPath: '/vendor/tesseract@5.1.1/worker.min.js',
        corePath: '/vendor/tesseract-core@5.1.1',
        langPath: '/vendor/tessdata@1.0.0'
      });
      const ret = await worker.recognize(fileOrBlob);
      await worker.terminate();
      return ret.data.text;
    }

    // Abbreviazioni frequenti nei testi italiani: senza questo elenco "l'art. 50" e "D.Lgs. n. 36"
    // verrebbero spezzati a met\u00E0, e il riassunto conterrebbe frammenti privi di senso.
    const ABBREVIAZIONI = new Set(['art', 'artt', 'n', 'nn', 'cfr', 'es', 'pag', 'pagg', 'fig', 'tab', 'vol', 'cap', 'lett', 'co', 'par', 'ecc', 'dott', 'dott.ssa', 'sig', 'sig.ra', 'prof', 'avv', 'ing', 'geom', 'rag', 'sec', 'tel', 'egr', 'spett', 'on', 'sen', 'd.lgs', 'd.p.r', 'd.m', 'd.l', 'l.r', 'c.c', 'c.p', 'c.p.c', 'c.p.p', 'p.iva', 'c.f', 's.p.a', 's.r.l', 's.n.c', 's.a.s']);

    function dividiInFrasi(testo) {
      const frasi = [];
      let inizio = 0;
      const re = /[.!?\u2026]+/g;
      let m;
      while ((m = re.exec(testo))) {
        const fine = m.index + m[0].length;
        const resto = testo.slice(fine);
        if (resto.trim()) {
          const successivo = resto.match(/^\s+(\S)/);
          // punto interno a un numero o a una sigla: non \u00E8 fine frase
          if (!successivo) continue;
          // in italiano la frase successiva inizia con una maiuscola o una virgoletta
          if (!/[A-Z\u00C0-\u00D6\u00D8-\u00DE\u00AB"'(]/.test(successivo[1])) continue;
          const parolaPrecedente = (testo.slice(inizio, m.index).match(/([\w\u00C0-\u00FF.]+)$/) || ['', ''])[1].toLowerCase().replace(/\.+$/, '');
          if (ABBREVIAZIONI.has(parolaPrecedente)) continue;
        }
        frasi.push(testo.slice(inizio, fine).trim());
        inizio = fine;
      }
      if (testo.slice(inizio).trim()) frasi.push(testo.slice(inizio).trim());
      return frasi;
    }

    const paroleUtili = (s) => s.toLowerCase()
      .replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    function advancedSummarize(text, mode, format) {
      if (!text) return '';

      const cleanSentences = dividiInFrasi(text).filter(s => s.length > 10);

      if (cleanSentences.length <= 2) return text;

      const words = paroleUtili(text);

      const freqMap = {};
      words.forEach(w => freqMap[w] = (freqMap[w] || 0) + 1);

      const scoredSentences = cleanSentences.map((sentence, idx) => {
        // Le parole della frase vanno ripulite come quelle del testo, altrimenti \u00ABappaltanti,\u00BB
        // non troverebbe corrispondenza con \u00ABappaltanti\u00BB e la frase risulterebbe poco rilevante.
        const sWords = paroleUtili(sentence);
        let score = 0;

        sWords.forEach(w => {
          if (freqMap[w]) score += freqMap[w];
        });

        // Punteggio medio per parola: senza questa normalizzazione vincerebbero sempre le frasi pi\u00F9 lunghe
        score = score / Math.sqrt(Math.max(1, sWords.length));

        if (idx === 0) score *= 1.5;
        if (idx < 3) score *= 1.2;

        if (sWords.length < 4 || sWords.length > 50) score *= 0.7;

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
    // Il font Helvetica del PDF usa la codifica WinAnsi: le emoji vengono rimosse, mentre le lettere
    // fuori dal set diventano la lettera base (č → c) invece di sparire insieme al resto della parola.
    const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
    function sanitizeForPdf(str) {
      const senzaEmoji = String(str || '').replace(/[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
      const ammesso = (ch) => {
        const c = ch.charCodeAt(0);
        return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.indexOf(ch) !== -1;
      };
      return Array.from(senzaEmoji).map(ch => {
        if (ch === '\n' || ammesso(ch)) return ch;
        const base = ch.normalize('NFD').charAt(0);
        return ammesso(base) ? base : '?';
      }).join('');
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