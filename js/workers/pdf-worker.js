// js/workers/pdf-worker.js — Procesamiento intensivo de PDFs en segundo plano
importScripts(
  'https://cdn.jsdelivr.net/npm/comlink@4.3.1/dist/umd/comlink.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/mammoth@1.4.21/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
);

// Inicializar el worker interno de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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
      const page = out.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
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
    const words = text.split('\n');
    
    let currentLines = [];
    for (const line of words){
      currentLines.push(line);
      if (currentLines.length >= linesPerPage){
        const p = out.addPage([pageSize.width, pageSize.height]);
        let y = pageSize.height - margin;
        for (const l of currentLines){ p.drawText(l, { x: margin, y, size: 11, font }); y -= 14; }
        currentLines = [];
      }
    }
    if (currentLines.length){
      const p = out.addPage([pageSize.width, pageSize.height]);
      let y = pageSize.height - margin;
      for (const l of currentLines){ p.drawText(l, { x: margin, y, size: 11, font }); y -= 14; }
    }
    const bytes = await out.save();
    return Comlink.transfer(bytes.buffer, [bytes.buffer]);
  },

  // 5. Anonimizar (Redact)
  async redactPdf(pdfBuffer, redactions, pageNumber, vpWidth, vpHeight) {
    const pdfDoc = await PDFLib.PDFDocument.load(pdfBuffer);
    const pageIndex = Math.max(0, Math.min(pdfDoc.getPageCount() - 1, pageNumber - 1));
    const page = pdfDoc.getPage(pageIndex);
    const { width: pageW, height: pageH } = page.getSize();
    
    for (const sel of redactions) {
      const xPdf = (sel.x / vpWidth) * pageW;
      const wPdf = (sel.width / vpWidth) * pageW;
      const yPdf = pageH - (((sel.y + sel.height) / vpHeight) * pageH);
      const hPdf = (sel.height / vpHeight) * pageH;
      page.drawRectangle({ x: xPdf, y: yPdf, width: wPdf, height: hPdf, color: PDFLib.rgb(0,0,0), opacity: 1 });
    }
    const out = await pdfDoc.save();
    return Comlink.transfer(out.buffer, [out.buffer]);
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
      const scale = targetWidth / image.width;
      const targetHeight = Math.min(image.height * scale, height);
      const pdfX = Math.min(Math.max(fracX * width, 0), Math.max(0, width - targetWidth));
      const pdfY = Math.min(Math.max(height - (fracYTop * height) - targetHeight, 0), Math.max(0, height - targetHeight));

      page.drawImage(image, { x: pdfX, y: pdfY, width: targetWidth, height: targetHeight });
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
  }
  // 8. Extraer Texto de Word (DOCX)
  async extractWordText(docxBuffer) {
    const result = await mammoth.extractRawText({ arrayBuffer: docxBuffer });
    return result.value || '';
  }
};

Comlink.expose(pdfService);