// pdf-worker.js — placeholder worker for heavier PDF operations
// NOTE: many PDF libraries and pdf.js require DOM or OffscreenCanvas; this worker is a placeholder
// to demonstrate how heavy processes could be offloaded. Currently main thread handles rendering.
self.addEventListener('message', async (ev)=>{
  const { action, payload } = ev.data || {};
  if (action === 'noop') {
    self.postMessage({ status: 'ok' });
  } else {
    self.postMessage({ status: 'unsupported', action });
  }
});
