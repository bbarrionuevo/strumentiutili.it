// js/workers/translation-worker.js
// Web Worker that loads transformers.js and performs translations.
// Mobile-friendly: force single-threaded WASM and SIMD where available to avoid allocation failures on low-memory devices.

// Dynamic import of transformers inside the worker to avoid throwing at creation time
// The worker will import the library when a 'load-model' message is received.

let globalEnv = null;

async function ensureTransformers() {
  if (globalEnv && globalEnv.pipeline) return globalEnv;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    const { pipeline, env } = mod;
    try { if (env) { env.allowLocalModels = false; env.useBrowserCache = true; } } catch(e) {}

    // Force single thread for WASM backends on constrained devices (mobile)
    try {
      if (env && env.wasm) {
        env.wasm.numThreads = 1;
        env.wasm.simd = true;
      }
    } catch (e) {
      // ignore
    }

    try {
      if (env && env.backends && env.backends.onnx && env.backends.onnx.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
      }
    } catch (e) {}

    globalEnv = { pipeline, env };
    return globalEnv;
  } catch (err) {
    // Propagate error to caller
    throw err;
  }
}

const loadedPipelines = new Map();

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n+/)
    .map((part) => normalizeText(part))
    .filter(Boolean);
}

self.addEventListener('message', async (ev) => {
  const msg = ev.data || {};

  try {
    if (msg.type === 'load-model') {
      const modelId = msg.model;
      if (loadedPipelines.has(modelId)) {
        postMessage({ type: 'model-ready', model: modelId });
        return;
      }

      postMessage({ type: 'model-progress', progress: 0 });
      const progressCallback = (progress) => {
        if (typeof progress === 'number') {
          postMessage({ type: 'model-progress', progress: Math.min(1, Math.max(0, progress)) });
          return;
        }
        if (progress && typeof progress.progress === 'number') {
          postMessage({ type: 'model-progress', progress: Math.min(1, Math.max(0, progress.progress)) });
        }
      };

      try {
        const mod = await ensureTransformers();
        const translator = await mod.pipeline('translation', modelId, {
          progress_callback: progressCallback,
          framework: 'onnx'
        });

        loadedPipelines.set(modelId, translator);
        postMessage({ type: 'model-ready', model: modelId });
        return;
      } catch (err) {
        self.postMessage({ type: 'error', error: 'Errore caricamento modello: ' + (err && err.message ? err.message : String(err)) });
        return;
      }
    }

    if (msg.type === 'translate') {
      const modelId = msg.model;
      const input = Array.isArray(msg.paragraphs) ? msg.paragraphs.join('\n\n') : String(msg.text || '');
      const translator = loadedPipelines.get(modelId);

      if (!translator) {
        postMessage({ type: 'error', message: `Modello non caricato: ${modelId}` });
        return;
      }

      const chunks = splitParagraphs(input);
      const translatedLines = [];
      const total = chunks.length || 1;

      for (let i = 0; i < chunks.length; i++) {
        const paragraph = chunks[i];
        const out = await translator(paragraph, { max_length: 512 });
        let translated = '';

        if (Array.isArray(out) && out.length) {
          translated = out[0]?.translation_text || out[0]?.generated_text || out[0]?.text || '';
        } else if (out && typeof out === 'object') {
          translated = out.translation_text || out.generated_text || out.text || '';
        } else {
          translated = String(out || '');
        }

        translatedLines.push(normalizeText(translated));
        const percent = Math.min(100, Math.max(0, Math.round(((i + 1) / total) * 100)));
        postMessage({ type: 'progress', percent, current: i + 1, total });
      }

      const resultText = translatedLines.join('\n\n');
      postMessage({ type: 'complete', text: resultText, result: translatedLines });
      return;
    }

    postMessage({ type: 'error', message: 'Comando non supportato dal worker.' });
  } catch (error) {
    console.error('translation-worker error:', error);
    postMessage({ type: 'error', message: error && error.message ? error.message : String(error) });
  }
});
