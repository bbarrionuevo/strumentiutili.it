// js/workers/translation-worker.js — Worker dedicado para traducción IA con Comlink
importScripts('https://unpkg.com/comlink/dist/umd/comlink.js');

let loadedPipelines = new Map();

async function ensureTransformers() {
  const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
  const { pipeline, env } = mod;
  if (env) {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
      if (self.crossOriginIsolated) {
        env.backends.onnx.wasm.simd = true;
        env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
      } else {
        env.backends.onnx.wasm.numThreads = 1;
      }
    }
  }
  return { pipeline };
}

const translationService = {
  async loadModel(modelId, progressCallback) {
    if (loadedPipelines.has(modelId)) return true;
    
    const { pipeline } = await ensureTransformers();
    const translator = await pipeline('translation', modelId, {
      quantized: true,
      framework: 'onnx',
      progress_callback: (p) => {
        if (p && p.status === 'progress' && progressCallback) {
          progressCallback(p.progress / 100);
        }
      }
    });
    
    loadedPipelines.set(modelId, translator);
    return true;
  },

  async translateChunks(chunks, modelId, progressCallback) {
    const translator = loadedPipelines.get(modelId);
    if (!translator) throw new Error(`Modello non caricato: ${modelId}`);

    const translatedChunks = [];
    const total = chunks.length || 1;

    for (let i = 0; i < chunks.length; i++) {
      const res = await translator(chunks[i], {
        num_beams: 1,
        do_sample: false,
        max_new_tokens: 300
      });

      const outText = Array.isArray(res) 
        ? res[0]?.translation_text 
        : res?.translation_text || res?.generated_text || '';

      translatedChunks.push(outText || chunks[i]);

      if (progressCallback) {
        const percent = Math.round(((i + 1) / total) * 100);
        progressCallback(percent);
      }
    }

    return translatedChunks;
  }
};

Comlink.expose(translationService);