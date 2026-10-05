// js/codice-contratto-ui.js — Il riquadro «Non trovi il codice del contratto?»
// della pagina dell'F24 ELIDE: legge gli estremi di registrazione, compone il
// codice di 16 caratteri con js/codice-contratto.js e, a richiesta, lo scrive
// in una riga del modello (tipo F) con il compilatore della pagina.
(function () {
  'use strict';

  function avvia() {
    var form = document.getElementById('cc-form');
    if (!form || !window.CodiceContratto) return;
    var uscita = document.getElementById('cc-codice');
    var parti = document.getElementById('cc-parti');
    var messaggi = document.getElementById('cc-messaggi');
    var usa = document.getElementById('cc-usa');
    var copia = document.getElementById('cc-copia');

    function aggiorna(mostraErrori) {
      var r = window.CodiceContratto.componi({
        ufficio: form.elements.ufficio.value,
        anno: form.elements.anno.value,
        serie: form.elements.serie.value,
        numero: form.elements.numero.value,
        sottonumero: form.elements.sottonumero.value
      });
      uscita.textContent = r.codice || '—';
      parti.textContent = r.codice ? r.parti.join(' · ') : '';
      var righe = (mostraErrori ? r.errori : []).concat(r.avvisi);
      messaggi.textContent = righe.join(' ');
      messaggi.hidden = !righe.length;
      usa.disabled = !r.codice;
      copia.disabled = !r.codice;
      return r;
    }

    form.addEventListener('input', function () { aggiorna(false); });
    form.addEventListener('submit', function (e) { e.preventDefault(); aggiorna(true); });

    copia.addEventListener('click', function () {
      var r = aggiorna(true);
      if (!r.codice) return;
      var scrivi = function (t) { messaggi.textContent = t; messaggi.hidden = false; };
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(r.codice) : Promise.reject(new Error('niente appunti')))
        .then(function () { scrivi('Codice copiato: incollalo negli elementi identificativi.'); })
        .catch(function () { scrivi('Copia non riuscita: seleziona il codice e copialo a mano.'); });
    });

    usa.addEventListener('click', function () {
      var r = aggiorna(true);
      if (!r.codice || !window.CompilatoreModuli) return;
      var riga = window.CompilatoreModuli.aggiungiRiga('erario', 'riga', { tipo: 'F', elementi: r.codice });
      messaggi.textContent = riga < 0
        ? 'Le righe del modello sono tutte occupate: libera una riga e riprova.'
        : 'Codice scritto nella riga ' + (riga + 1) + ' del modello, con il tipo F: aggiungi codice tributo, anno e importo.';
      messaggi.hidden = false;
      var app = document.getElementById('mp-app');
      if (riga >= 0 && app) app.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    aggiorna(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
