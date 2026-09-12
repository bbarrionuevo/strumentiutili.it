// /js/workers/llm-worker.js
import { WebWorkerMLCEngineHandler } from "https://esm.run/@mlc-ai/web-llm";

// Inizializza l'handler che gestirà le richieste dal thread principale
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => {
  handler.onmessage(msg);
};
