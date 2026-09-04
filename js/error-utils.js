// js/error-utils.js — gestione centralizzata di errori "silenziosi" (OCR, PDF, IA, DOCX)
// Rileva condizioni tipiche di esaurimento memoria/risorse sui dispositivi mobili e
// restituisce un messaggio in italiano comprensibile per l'utente, invece di lasciare
// l'interfaccia bloccata senza alcun feedback.
(function () {
  const MEMORY_HINTS = [
    'out of memory',
    'allocation failed',
    'array buffer allocation',
    'maximum call stack',
    'wasm memory',
    "memoria",
    'quota'
  ];

  function isLikelyMemoryError(err) {
    if (!err) return false;
    if (err instanceof RangeError) return true;
    const message = String((err && err.message) || err || '').toLowerCase();
    return MEMORY_HINTS.some((hint) => message.includes(hint));
  }

  function friendlyErrorMessage(err, fallback) {
    if (isLikelyMemoryError(err)) {
      return 'Errore di memoria: il file è troppo grande per essere elaborato su questo dispositivo. Prova con un file più piccolo o chiudi altre schede/app.';
    }
    if (err && /network|fetch|failed to load|Failed to fetch/i.test(String(err.message || err))) {
      return 'Errore di rete: verifica la connessione internet e riprova (necessaria solo per il primo download dei modelli).';
    }
    const detail = err && err.message ? err.message : null;
    return fallback ? `${fallback}${detail ? ' (' + detail + ')' : ''}` : (detail || 'Si è verificato un errore imprevisto.');
  }

  function showErrorBanner(container, message) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) {
      console.error(message);
      return;
    }
    el.textContent = message;
    el.classList.remove('hidden');
    el.classList.add('mt-3', 'rounded', 'border', 'border-red-300', 'bg-red-50', 'p-3', 'text-sm', 'text-red-800');
  }

  window.StrumentiErrors = {
    isLikelyMemoryError,
    friendlyErrorMessage,
    showErrorBanner
  };
})();
