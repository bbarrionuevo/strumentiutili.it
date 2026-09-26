// js/ocr.js — Reconocimiento OCR Tesseract WASM (servido desde vendor/) + Exportación TXT, DOCX y PDF
(function () {
  'use strict';

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

  // Tesseract lavora bene intorno ai 300 DPI: una pagina PDF va quindi ingrandita di circa 4 volte
  // rispetto ai 72 punti per pollice del formato, con un limite per non esaurire la memoria.
  const DPI_OCR = 300;
  const LATO_MASSIMO = 4000;

  async function paginaSuCanvas(page) {
    const scala = Math.min(DPI_OCR / 72, LATO_MASSIMO / Math.max(page.getViewport({ scale: 1 }).width, page.getViewport({ scale: 1 }).height));
    const viewport = page.getViewport({ scale: scala });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  async function runOCR(file, langs) {
    setProgress('Caricamento del motore OCR...');
    let worker = null;
    try {
      const immagini = [];

      if (file.name.toLowerCase().endsWith('.pdf')) {
        if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js non disponibile.');
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise;
        // Tutte le pagine, non solo la prima
        for (let n = 1; n <= pdf.numPages; n++) {
          setProgress(`Conversione della pagina ${n} di ${pdf.numPages}...`);
          immagini.push(await paginaSuCanvas(await pdf.getPage(n)));
        }
      } else {
        immagini.push(file);
      }

      // Programma, motore e modelli dal sito stesso (vendor/): nessun CDN.
      const workerOptions = {
        logger: m => {
          if (m && m.status === 'loading tesseract core') setProgress('Caricamento del motore OCR...');
          else if (m && m.status === 'loading language traineddata') setProgress('Scaricamento del modello linguistico...');
          else if (m && m.status === 'initializing api') setProgress('Preparazione del riconoscimento...');
        },
        workerPath: '/vendor/tesseract@5.1.1/worker.min.js',
        corePath: '/vendor/tesseract-core@5.1.1',
        langPath: '/vendor/tessdata@1.0.0',
      };

      worker = await Tesseract.createWorker(langs, 1, workerOptions);

      // Un solo motore per tutte le pagine: ricrearlo per ogni pagina significherebbe riscaricare i modelli
      const testi = [];
      for (let i = 0; i < immagini.length; i++) {
        setProgress(immagini.length > 1
          ? `Riconoscimento del testo: pagina ${i + 1} di ${immagini.length}...`
          : 'Riconoscimento del testo in corso...');
        const { data: { text } } = await worker.recognize(immagini[i]);
        testi.push((text || '').trim());
        if (immagini[i].width) immagini[i].width = 0;
      }

      const testo = immagini.length > 1
        ? testi.map((t, i) => `--- Pagina ${i + 1} ---\n${t}`).join('\n\n')
        : (testi[0] || '');

      setProgress(testo ? 'Riconoscimento completato.' : 'Nessun testo riconosciuto: prova con un\'immagine più nitida o più grande.');
      if (resultEl) resultEl.value = testo;
      return testo;
    } catch (err) {
      console.error('OCR error:', err);
      const messaggio = String(err && err.message);
      if (/password|encrypt/i.test(messaggio)) setProgress('Il PDF è protetto da password: rimuovi la protezione e riprova.');
      else if (/network|fetch|load|503/i.test(messaggio)) setProgress('Impossibile scaricare il motore OCR: controlla la connessione e riprova.');
      else setProgress('Errore durante il riconoscimento del testo.');
      return '';
    } finally {
      if (worker) { try { await worker.terminate(); } catch (e) { } }
    }
  }

  // Scatto diretto su un input dedicato: l'input principale resta senza capture, così su
  // smartphone si può scegliere anche un file o un PDF già salvato.
  if (window.StrumentiDropzone) {
    window.StrumentiDropzone.collegaFotocamera({
      input: 'img-input',
      camera: 'img-camera',
      button: 'btn-fotocamera'
    });
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
        const text = testoWinAnsi(rawText);
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

  // Il font Helvetica del PDF usa la codifica WinAnsi: le lettere fuori da quel set diventano la
  // lettera base (ě → e) invece di sparire, e i simboli non rappresentabili diventano «?».
  const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  // Lettere senza scomposizione Unicode in lettera base + accento: vanno tradotte a mano
  const LETTERE_SPECIALI = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'Ŋ': 'N', 'ŋ': 'n', 'Ŧ': 'T', 'ŧ': 't', 'Ə': 'E', 'ə': 'e', 'Ɵ': 'O', 'ɵ': 'o' };
  function testoWinAnsi(s) {
    const ammesso = (ch) => {
      const c = ch.charCodeAt(0);
      return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.indexOf(ch) !== -1;
    };
    return Array.from(String(s || '')).map(ch => {
      if (ch === '\n' || ammesso(ch)) return ch;
      if (LETTERE_SPECIALI[ch]) return LETTERE_SPECIALI[ch];
      const base = ch.normalize('NFD').charAt(0);
      return ammesso(base) ? base : '?';
    }).join('');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // revoca differita: una revoca immediata può interrompere il download in alcuni browser
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();