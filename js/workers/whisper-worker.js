// js/workers/whisper-worker.js — Worker dedicado para Whisper AI (Comlink)
import * as Comlink from 'https://unpkg.com/comlink/dist/esm/comlink.mjs';
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriberPipeline = null;

const whisperService = {
  initEnv(crossOriginIsolated, concurrency) {
    if (crossOriginIsolated && env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.simd = true;
      env.backends.onnx.wasm.numThreads = Math.min(4, concurrency || 2);
    } else if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 1;
    }
  },

  async transcribe(audioData, language, task, progressCallback) {
    if (!transcriberPipeline) {
      transcriberPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
        progress_callback: (data) => {
          if (data && progressCallback) {
            progressCallback(data);
          }
        }
      });
    }

    const generateOptions = {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      task: task,
      temperature: 0,
    };

    if (language !== 'auto') {
      generateOptions.language = language;
    }

    const output = await transcriberPipeline(audioData, generateOptions);
    return output;
  }
};

Comlink.expose(whisperService);