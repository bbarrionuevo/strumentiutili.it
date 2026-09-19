// js/workers/pdf-worker.js — Procesamiento intensivo de PDFs en segundo plano
importScripts(
  'https://cdn.jsdelivr.net/npm/comlink@4.3.1/dist/umd/comlink.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/mammoth@1.4.21/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
);

// Inicializar el worker interno de PDF.js
// Un worker non può crearne uno da un URL di un altro dominio: pdf.js ripiegherebbe sul «fake worker»,
// che richiede il DOM e qui fallisce con «document is not defined». Si crea quindi il worker interno
// da un blob locale che importa lo script della CDN.
const SORGENTE_PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
pdfjsLib.GlobalWorkerOptions.workerSrc = SORGENTE_PDF_WORKER;
try {
  const ponte = URL.createObjectURL(new Blob([`importScripts('${SORGENTE_PDF_WORKER}');`], { type: 'text/javascript' }));
  pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(ponte);
} catch (e) {
  console.warn('[pdf-worker] worker interno di pdf.js non disponibile:', e);
}

const pdfService = {
  // 1. Dividir PDF
  async splitPdf(pdfBuffer, pagesArray) {
    const src = await PDFLib.PDFDocument.load(pdfBuffer);
    const out = await PDFLib.PDFDocument.create();
    const copied = await out.copyPages(src, pagesArray);
    copied.forEach(p => out.addPage(p));
    const bytes = await out.save();
    return Comlink.transfer(bytes.buffer, [bytes.buffer]);
  },

  // 2. Unir imágenes en PDF
  async imagesToPdf(imagesData) { 
    const out = await PDFLib.PDFDocument.create();
    for (const imgData of imagesData) {
      let img;
      if (imgData.mime === 'image/png') {
        img = await out.embedPng(imgData.buffer);
      } else {
        img = await out.embedJpg(imgData.buffer);
      }
      // Se il chiamante indica le dimensioni originali in punti (pagine PDF ricompresse) si usano quelle:
      // altrimenti una pagina A4 renderizzata a 1,5x diventerebbe grande una volta e mezza in stampa
      if (imgData.widthPt && imgData.heightPt) {
        const page = out.addPage([imgData.widthPt, imgData.heightPt]);
        page.drawImage(img, { x: 0, y: 0, width: imgData.widthPt, height: imgData.heightPt });
        continue;
      }
      // Foto e scansioni: pagina A4 orientata come l'immagine, con l'immagine centrata e proporzionata
      // (usare i pixel come punti creava pagine di oltre un metro per le foto da smartphone)
      const orizzontale = img.width > img.height;
      const larghezzaPagina = orizzontale ? 841.89 : 595.28;
      const altezzaPagina = orizzontale ? 595.28 : 841.89;
      const margine = 20;
      const scala = Math.min((larghezzaPagina - margine * 2) / img.width, (altezzaPagina - margine * 2) / img.height);
      const w = img.width * scala;
      const h = img.height * scala;
      const page = out.addPage([larghezzaPagina, altezzaPagina]);
      page.drawImage(img, { x: (larghezzaPagina - w) / 2, y: (altezzaPagina - h) / 2, width: w, height: h });
    }
    const bytes = await out.save();
    return Comlink.transfer(bytes.buffer, [bytes.buffer]);
  },

  // 3. Organizar y Unir múltiples PDFs
  async organizePdfs(sourcePdfs, pageSequence) {
    const loadedPdfs = new Map();
    for (const src of sourcePdfs) {
      loadedPdfs.set(src.id, await PDFLib.PDFDocument.load(src.buffer));
    }
    const outPdf = await PDFLib.PDFDocument.create();
    for (const pageMeta of pageSequence) {
      const sourceDoc = loadedPdfs.get(pageMeta.sourceId);
      if (sourceDoc) {
        const [copiedPage] = await outPdf.copyPages(sourceDoc, [pageMeta.pageIndex]);
        outPdf.addPage(copiedPage);
      }
    }
    const bytes = await outPdf.save();
    return Comlink.transfer(bytes.buffer, [bytes.buffer]);
  },

  // 4. Word (DOCX) a PDF
  async docxToPdf(docxBuffer) {
    const result = await mammoth.extractRawText({ arrayBuffer: docxBuffer });
    const text = result.value || '';
    const out = await PDFLib.PDFDocument.create();
    const font = await out.embedFont(PDFLib.StandardFonts.Helvetica);
    const pageSize = { width: 595.28, height: 841.89 };
    const margin = 40;
    const linesPerPage = 50;
    const size = 11;
    const maxWidth = pageSize.width - margin * 2;

    // Helvetica standard copre solo WinAnsi: le lettere accentate di altri alfabeti diventano la lettera base,
    // gli altri simboli un punto interrogativo, invece di interrompere la conversione con un errore
    const extra = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
    const ammesso = (ch) => { const c = ch.charCodeAt(0); return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || extra.indexOf(ch) !== -1; };
    const pulisci = (s) => Array.from(s.replace(/\t/g, '    ')).map(ch => ammesso(ch) ? ch : (ammesso(ch.normalize('NFD').charAt(0)) ? ch.normalize('NFD').charAt(0) : '?')).join('');

    // Ogni paragrafo viene spezzato sulla larghezza utile: prima una riga lunga usciva dal bordo destro e il testo si perdeva
    const righe = [];
    for (const paragrafo of text.split('\n')) {
      const parole = pulisci(paragrafo).split(' ');
      let corrente = '';
      for (const parola of parole) {
        const prova = corrente ? corrente + ' ' + parola : parola;
        if (font.widthOfTextAtSize(prova, size) <= maxWidth || !corrente) {
          corrente = prova;
        } else {
          righe.push(corrente);
          corrente = parola;
        }
        // parola singola più larga della riga (URL, codici): viene spezzata a forza
        while (font.widthOfTextAtSize(corrente, size) > maxWidth && corrente.length > 1) {
          let taglio = corrente.length - 1;
          while (taglio > 1 && font.widthOfTextAtSize(corrente.slice(0, taglio), size) > maxWidth) taglio--;
          righe.push(corrente.slice(0, taglio));
          corrente = corrente.slice(taglio);
        }
      }
      righe.push(corrente);
    }

    for (let i = 0; i < righe.length; i += linesPerPage) {
      const p = out.addPage([pageSize.width, pageSize.height]);
      let y = pageSize.height - margin;
      for (const l of righe.slice(i, i + linesPerPage)) { if (l) p.drawText(l, { x: margin, y, size, font }); y -= 14; }
    }
    if (!righe.length) out.addPage([pageSize.width, pageSize.height]);
    const bytes = await out.save();
    return Comlink.transfer(bytes.buffer, [bytes.buffer]);
  },

  // 5. Anonimizar (Redact)
  // Redazione distruttiva. Un rettangolo nero disegnato sopra la pagina lascia il testo nel content stream
  // (si copia o si estrae con qualsiasi lettore): la pagina viene quindi sostituita da un'immagine
  // renderizzata con i riquadri già anneriti. Il documento di uscita è nuovo e riceve solo le pagine copiate:
  // gli oggetti della pagina originale e i metadati del file (autore, titolo) non vengono trascritti.
  async redactPdf(pdfBuffer, pageNumber, pageImageJpg, pageWidthPt, pageHeightPt) {
    if (!pageImageJpg || !pageImageJpg.byteLength) throw new Error('Immagine della pagina mancante: redazione non eseguita.');
    const src = await PDFLib.PDFDocument.load(pdfBuffer);
    const out = await PDFLib.PDFDocument.create();
    const totale = src.getPageCount();
    const pageIndex = Math.max(0, Math.min(totale - 1, pageNumber - 1));

    const altre = [];
    for (let i = 0; i < totale; i++) if (i !== pageIndex) altre.push(i);
    const copiate = altre.length ? await out.copyPages(src, altre) : [];

    const immagine = await out.embedJpg(pageImageJpg);
    let k = 0;
    for (let i = 0; i < totale; i++) {
      if (i === pageIndex) {
        const nuova = out.addPage([pageWidthPt, pageHeightPt]);
        nuova.drawImage(immagine, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });
      } else {
        out.addPage(copiate[k++]);
      }
    }
    const bytes = await out.save();
    return Comlink.transfer(bytes.buffer, [bytes.buffer]);
  },

  // 6. Firmar PDF
  async signPdf(pdfBuffer, pngBuffer, config) {
    const { targetWidth, fracX, fracYTop, applyToAll, pageNum } = config;
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
    const image = await pdfDoc.embedPng(pngBuffer);
    const allPages = pdfDoc.getPages();
    const singlePageIndex = Math.max(0, Math.min(allPages.length - 1, pageNum - 1));
    const targetPages = applyToAll ? allPages : [allPages[singlePageIndex]];

    targetPages.forEach((page) => {
      if (!page) return;
      const { width, height } = page.getSize();
      // Le pagine ruotate (/Rotate) hanno dimensioni visibili scambiate: la firma va collocata
      // nel sistema di riferimento che l'utente vede nell'anteprima e ruotata di conseguenza.
      const rotazione = ((page.getRotation().angle % 360) + 360) % 360;
      const dritta = rotazione % 180 === 0;
      const larghezzaVista = dritta ? width : height;
      const altezzaVista = dritta ? height : width;

      const larghezza = Math.min(targetWidth, larghezzaVista);
      const altezza = Math.min(image.height * (larghezza / image.width), altezzaVista);
      // Posizione dell'angolo in alto a sinistra della firma nella pagina come viene visualizzata
      const vx = Math.min(Math.max(fracX * larghezzaVista, 0), larghezzaVista - larghezza);
      const vy = Math.min(Math.max(fracYTop * altezzaVista, 0), altezzaVista - altezza);

      const opzioni = { width: larghezza, height: altezza };
      if (rotazione === 90) {
        Object.assign(opzioni, { x: vy + altezza, y: vx, rotate: PDFLib.degrees(90) });
      } else if (rotazione === 180) {
        Object.assign(opzioni, { x: width - vx, y: vy + altezza, rotate: PDFLib.degrees(180) });
      } else if (rotazione === 270) {
        Object.assign(opzioni, { x: width - vy - altezza, y: height - vx, rotate: PDFLib.degrees(270) });
      } else {
        Object.assign(opzioni, { x: vx, y: altezzaVista - vy - altezza });
      }
      page.drawImage(image, opzioni);
    });

    const out = await pdfDoc.save();
    return Comlink.transfer(out.buffer, [out.buffer]);
  },

  // 7. Extraer Texto (NUEVO: Para el Asistente IA)
  async extractText(pdfBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    return fullText.trim();
  },
  // 8. Extraer Texto de Word (DOCX)
  async extractWordText(docxBuffer) {
    const result = await mammoth.extractRawText({ arrayBuffer: docxBuffer });
    return result.value || '';
  }
};

Comlink.expose(pdfService);