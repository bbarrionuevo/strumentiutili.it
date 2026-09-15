function runOcrWorker(imageBlobUrl) {
  return new Promise(function (resolve, reject) {
    var worker;

    try {
      worker = new Worker('/js/workers/ocr-worker.js');
    } catch (error) {
      reject(new Error('Impossibile avviare il motore OCR.'));
      return;
    }

    var finished = false;

    function cleanup() {
      try { worker.terminate(); } catch (error) {}
    }

    worker.onmessage = function (event) {
      var data = event.data || {};

      if (data.type === 'progress') {
        updateProgress('Lettura ottica: ' + (Number(data.pct) || 0) + '%');
        return;
      }

      if (data.type === 'status') {
        updateProgress(String(data.msg || ''));
        return;
      }

      if (data.type === 'success') {
        if (finished) return;
        finished = true;
        cleanup();

        resolve({
          text: typeof data.text === 'string' ? data.text : '',
          words: Array.isArray(data.words) ? data.words : [],
          numericText: typeof data.numericText === 'string' ? data.numericText : '',
          confidence: Number(data.confidence) || 0
        });
        return;
      }

      if (data.type === 'error') {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error(data.msg || 'Errore OCR.'));
      }
    };

    worker.onerror = function () {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('Errore nel worker OCR.'));
    };

    worker.postMessage({
      imageBlobUrl: imageBlobUrl,
      lang: 'ita'
    });
  });
}