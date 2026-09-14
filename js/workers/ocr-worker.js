// js/workers/ocr-worker.js — Worker dedicato per OCR isolato dal Main Thread
importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

self.onmessage = async function(e) {
  const { imageBlobUrl, lang } = e.data;
  
  try {
    const workerOptions = {
      logger: m => {
        if (m && m.status === 'recognizing text') {
          self.postMessage({ type: 'progress', pct: Math.round(m.progress * 100) });
        } else {
          self.postMessage({ type: 'status', msg: m.status });
        }
      },
      // Usiamo le CDN veloci e stabili indicate nel progetto
      langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_fast',
      corePath: 'https://unpkg.com/tesseract.js-core@5.0.0/tesseract-core.wasm.js',
    };
    
    // Inizializza Tesseract nel worker
    const worker = await Tesseract.createWorker(lang || 'ita', 1, workerOptions);
    
    self.postMessage({ type: 'status', msg: 'Analisi ottica dei caratteri in corso...' });
    
    // Esegue il riconoscimento
    const { data: { text } } = await worker.recognize(imageBlobUrl);
    
    // Chiude il worker per liberare RAM (Zero-Leak)
    await worker.terminate();
    
    self.postMessage({ type: 'success', text: text });

  } catch (err) {
    self.postMessage({ type: 'error', msg: err.message });
  }
};