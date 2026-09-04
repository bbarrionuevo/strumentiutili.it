// js/ocr.js — Reconocimiento OCR Tesseract WASM + Exportación TXT, DOCX y PDF
(function () {
  const input = document.getElementById('img-input');
  const startBtn = document.getElementById('start-ocr');
  const clearBtn = document.getElementById('clear-ocr');
  const progressEl = document.getElementById('ocr-progress');
  const resultEl = document.getElementById('ocr-result');
  const copyBtn = document.getElementById('copy-text');
  const downloadTxtBtn = document.getElementById('download-txt');
  const downloadDocxBtn = document.getElementById('download-docx');
  const downloadPdfBtn = document.getElementById('download-pdf');
  const langSelect = document.getElementById('ocr-lang');

  function setProgress(msg) { if (progressEl) progressEl.textContent = msg; }

  async function runOCR(file, langs) {
    setProgress('Caricamento motore OCR...');
    try {
      let imageToProcess = file;

      if (file.name.toLowerCase().endsWith('.pdf')) {
        if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js non disponibile.');
        setProgress('Conversione PDF in immagine...');
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: ctx, viewport }).promise;
        imageToProcess = canvas;
      }

      const worker = await Tesseract.createWorker(langs, 1, {
        logger: m => {
          if (m && m.status) {
            const pct = m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '';
            setProgress(`${m.status}${pct}`);
          }
        },
        langPath: 'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_fast'
      });

      setProgress('Riconoscimento testo in corso...');
      const { data: { text } } = await worker.recognize(imageToProcess);

      setProgress('Completato');
      if (resultEl) resultEl.value = text || '';
      await worker.terminate();
      return text || '';
    } catch (err) {
      console.error('OCR error:', err);
      setProgress('Errore durante il riconoscimento');
      return '';
    }
  }

  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (!input || !input.files || !input.files.length) { setProgress('Seleziona un file prima.'); return; }
      const f = input.files[0];
      if (resultEl) resultEl.value = '';
      const langs = langSelect ? langSelect.value : 'ita';
      await runOCR(f, langs);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (input) input.value = '';
      if (resultEl) resultEl.value = '';
      setProgress('Pronto.');
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText((resultEl && resultEl.value) || '');
        setProgress('Testo copiato negli appunti');
      } catch (e) {
        setProgress('Impossibile copiare');
      }
    });
  }

  if (downloadTxtBtn) {
    downloadTxtBtn.addEventListener('click', () => {
      const txt = (resultEl && resultEl.value) || '';
      if (!txt) return;
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, 'Testo_Estratto_OCR.txt');
    });
  }

  if (downloadDocxBtn) {
    downloadDocxBtn.addEventListener('click', async () => {
      const rawText = (resultEl && resultEl.value) || '';
      if (!rawText) return setProgress('Testo vuoto. Impossibile scaricare.');

      if (!window.docx) {
        return setProgress('Libreria DOCX non disponibile nel browser.');
      }

      setProgress('Generazione DOCX in corso...');
      try {
        const { Document, Packer, Paragraph } = window.docx;
        const paragraphs = rawText.split(/\n\n+/).filter(Boolean).map(p => new Paragraph(p));
        const doc = new Document({
          sections: [{ children: paragraphs }]
        });
        const blob = await Packer.toBlob(doc);
        downloadBlob(blob, 'Testo_Estratto_OCR.docx');
        setProgress('DOCX scaricato.');
      } catch (err) {
        console.error('DOCX Error:', err);
        setProgress('Errore durante la creazione del DOCX.');
      }
    });
  }

  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', async () => {
      const rawText = (resultEl && resultEl.value) || '';
      if (!rawText || typeof PDFLib === 'undefined') {
        setProgress("Impossibile scaricare PDF (testo vuoto o libreria non caricata).");
        return;
      }

      setProgress('Generazione PDF in corso...');
      try {
        const text = rawText.replace(/[^\x00-\xFF]/g, '');
        const pdfDoc = await PDFLib.PDFDocument.create();
        let page = pdfDoc.addPage([595.28, 841.89]);
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        const margin = 50;
        let y = height - margin;

        const fontSize = 10;
        const lineHeight = 14;
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
        downloadBlob(blob, 'Testo_Estratto_OCR.pdf');
        setProgress('PDF scaricato.');
      } catch (err) {
        console.error('PDF generation error:', err);
        setProgress("Errore durante la creazione del PDF.");
      }
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
})();
