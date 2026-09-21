// js/pubblicita.js — stato dei riquadri pubblicitari
//
// Non carica e non inietta annunci: di quello si occupa AdSense e il gestore
// gia' presente in pagina. Qui si fa una cosa sola, ma che conta su un sito
// pieno di moduli: tenere il segnaposto grigio finche' l'annuncio non c'e', e
// toglierlo appena arriva.
//
// Perche' serve. Il riquadro ha un'altezza riservata fin dal primo istante,
// cosi' la pagina non salta quando l'annuncio si carica (e' il Cumulative
// Layout Shift, uno dei Core Web Vitals). Ma un riquadro alto e vuoto, durante
// il caricamento, sembra un errore: il segnaposto dice che li' ci va la
// pubblicita'. Quando AdSense non ha nulla da mostrare mette da se'
// data-ad-status="unfilled": in quel caso il riquadro si chiude, perche' un
// rettangolo grigio permanente e' solo spazio rubato al contenuto.
//
// Anteprima: aggiungendo ?anteprima-pubblicita=1 all'indirizzo i segnaposto
// restano visibili anche dove l'annuncio c'e', per vedere l'impaginazione.
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
      // L'annuncio c'e': via il segnaposto, resta l'etichetta "Pubblicita'"
      // che le norme di AdSense chiedono per distinguerlo dal contenuto.
      riquadro.dataset.suStato = 'pieno';
      return;
    }
    if (stato === 'unfilled') {
      riquadro.dataset.suStato = 'vuoto';
      return;
    }
    riquadro.dataset.suStato = 'attesa';
  }

  function avvia() {
    const riquadri = Array.from(document.querySelectorAll(RIQUADRI));
    if (!riquadri.length) return;
    riquadri.forEach(aggiorna);

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
    // adblocker, oppure consenso negato). Si chiude e si restituisce lo spazio.
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
