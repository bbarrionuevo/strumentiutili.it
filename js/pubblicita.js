// js/pubblicita.js — richiesta e stato dei riquadri pubblicitari
//
// Non carica la libreria di AdSense (e' nel <head> di ogni pagina) e non crea
// riquadri. Fa due cose: chiede un annuncio per ogni riquadro visibile, e
// segna sul riquadro lo stato dell'annuncio (data-su-stato), che il CSS usa.
//
// Finche' l'annuncio non c'e', il riquadro non si vede (src/input.css): niente
// altezza riservata, niente fondo grigio, nessuna scritta. Quando AdSense lo
// riempie (data-ad-status="filled") compare con l'etichetta «Pubblicità»;
// quando non ha niente da mostrare ("unfilled") sparisce del tutto.
//
// Anteprima: aggiungendo ?anteprima-pubblicita=1 all'indirizzo i riquadri si
// vedono come rettangoli tratteggiati, per controllare l'impaginazione.
//
// Qui si fa anche la richiesta dell'annuncio, adsbygoogle.push({}), una volta
// per riquadro. Senza quella chiamata un <ins class="adsbygoogle"> resta vuoto
// per sempre. Il segno data-su-ad-init impedisce di chiedere due volte lo
// stesso riquadro.
(() => {
  'use strict';

  const RIQUADRI = '.su-ad';
  const anteprima = /[?&]anteprima-pubblicita=1/.test(location.search);

  function aggiorna(riquadro) {
    const ins = riquadro.querySelector('ins.adsbygoogle');
    if (!ins) return;
    const stato = ins.getAttribute('data-ad-status');

    if (anteprima) {
      riquadro.dataset.suStato = 'anteprima';
      return;
    }
    if (stato === 'filled') {
      // L'annuncio c'e': il CSS mostra il riquadro con l'etichetta
      // «Pubblicità», che le norme di AdSense chiedono.
      riquadro.dataset.suStato = 'pieno';
      return;
    }
    if (stato === 'unfilled') {
      riquadro.dataset.suStato = 'vuoto';
      return;
    }
    riquadro.dataset.suStato = 'attesa';
  }

  // Larghezza disponibile: un riquadro nascosto (per esempio quello laterale,
  // che su telefono non si mostra) misura 0, e chiedere un annuncio largo 0
  // produce solo l'errore "No slot size for availableWidth=0".
  function larghezza(ins) {
    if (!ins.isConnected) return 0;
    const propria = ins.getBoundingClientRect().width;
    const genitore = ins.parentElement ? ins.parentElement.getBoundingClientRect().width : 0;
    return Math.floor(Math.max(propria, genitore));
  }

  function richiedi(ins) {
    if (!ins || ins.dataset.suAdInit === '1') return;
    if (ins.hasAttribute('data-adsbygoogle-status')) return;   // gia' elaborato da AdSense
    if (larghezza(ins) <= 0) return;
    ins.dataset.suAdInit = '1';
    try {
      // Se adsbygoogle.js non e' ancora arrivato, la richiesta resta in coda
      // nell'array e AdSense la esegue appena si carica.
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      delete ins.dataset.suAdInit;
    }
  }

  function richiediTutti(riquadri) {
    riquadri.forEach((riquadro) => {
      riquadro.querySelectorAll('ins.adsbygoogle').forEach(richiedi);
    });
  }

  function avvia() {
    const riquadri = Array.from(document.querySelectorAll(RIQUADRI));
    if (!riquadri.length) return;
    riquadri.forEach(aggiorna);

    // Due fotogrammi di attesa: l'impaginazione e' finita e le larghezze sono
    // quelle vere. Un riquadro che diventa visibile dopo (la finestra si
    // allarga e compare la colonna laterale) si richiede in quel momento.
    requestAnimationFrame(() => requestAnimationFrame(() => richiediTutti(riquadri)));
    if ('ResizeObserver' in window) {
      const misura = new ResizeObserver((voci) => {
        for (const voce of voci) {
          if (voce.contentRect.width > 0) richiediTutti([voce.target]);
        }
      });
      riquadri.forEach((riquadro) => misura.observe(riquadro));
    }

    // AdSense scrive data-ad-status sull'<ins> quando ha deciso: si guarda
    // quell'attributo invece di andare a tempo, che su rete lenta sbaglia.
    if (!('MutationObserver' in window)) return;
    const osservatore = new MutationObserver((modifiche) => {
      for (const m of modifiche) {
        const riquadro = m.target.closest ? m.target.closest(RIQUADRI) : null;
        if (riquadro) aggiorna(riquadro);
      }
    });
    riquadri.forEach((riquadro) => {
      const ins = riquadro.querySelector('ins.adsbygoogle');
      if (ins) osservatore.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
    });

    // Rete di sicurezza: se dopo 8 secondi AdSense non ha detto nulla, il
    // riquadro e' quasi certamente rimasto vuoto (script bloccato da un
    // adblocker, consenso negato, sito non ancora approvato): si segna vuoto.
    setTimeout(() => {
      riquadri.forEach((riquadro) => {
        if (riquadro.dataset.suStato !== 'attesa') return;
        // Un <iframe> dentro all'<ins> vuol dire che AdSense sta ancora
        // lavorando: in quel caso si aspetta, per non chiudere un riquadro
        // che sta per riempirsi (sarebbe un salto dell'impaginazione).
        const ins = riquadro.querySelector('ins.adsbygoogle');
        if (ins && ins.querySelector('iframe')) return;
        riquadro.dataset.suStato = 'vuoto';
      });
    }, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia, { once: true });
  } else {
    avvia();
  }
})();
