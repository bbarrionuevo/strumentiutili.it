// js/widget.js — I calcolatori da mettere sui siti degli altri (/widget/...).
//
// Una pagina /widget/ e' fatta per stare dentro un <iframe> su un blog o un
// forum: niente intestazione, niente annunci (AdSense non li vuole dentro i
// siti degli altri), niente cookie. I conti sono quelli delle pagine
// complete, con gli stessi motori: js/stipendio-netto.js (con js/irpef.js) e
// js/bollo-calcolo.js, sulle regole di data/regole-fiscali-2026.json.
// Ogni widget e' un <form data-widget="..."> e si ricalcola mentre si scrive.
(function () {
  'use strict';

  var euro = function (x) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(x || 0);
  };
  var scrivi = function (form, nome, testo) {
    var el = form.querySelector('[data-esito="' + nome + '"]');
    if (el) el.textContent = testo;
  };

  // Stipendio netto: RAL e mensilita', addizionali medie del file delle regole
  function stipendio(form, regole) {
    var ral = parseFloat(form.elements.ral.value);
    if (!(ral > 0) || !window.StipendioNetto) {
      ['mensile', 'annuo', 'inps', 'irpef', 'addizionali'].forEach(function (k) { scrivi(form, k, '—'); });
      return;
    }
    var r = window.StipendioNetto.calculateSalary(ral, parseInt(form.elements.mensilita.value, 10) || 13, regole, {});
    scrivi(form, 'mensile', euro(r.nettoMensile));
    scrivi(form, 'annuo', euro(r.nettoAnnuo));
    scrivi(form, 'inps', euro(r.inps));
    scrivi(form, 'irpef', euro(r.irpefNetta));
    scrivi(form, 'addizionali', euro(r.addizionali));
  }

  // Bollo auto e superbollo: come la pagina completa (js/bollo-auto.js)
  function bollo(form, regole) {
    if (!window.BolloCalcolo || !regole.bollo_auto_2026) return;
    var anno = parseInt(form.elements.anno.value, 10) || new Date().getFullYear();
    var r = window.BolloCalcolo.calcola({
      kw: form.elements.kw.value,
      classe: form.elements.classe.value,
      regione: form.elements.regione.value,
      anni: Math.max(0, new Date().getFullYear() - anno)
    }, regole.bollo_auto_2026);
    scrivi(form, 'bollo', euro(r.bollo));
    scrivi(form, 'superbollo', euro(r.superbollo));
    scrivi(form, 'totale', euro(r.totale));
    scrivi(form, 'origine', r.origine === 'da_scegliere'
      ? 'Scegli la Regione: senza, si usa la tariffa nazionale di riferimento.'
      : r.origine === 'nazionale_provvisoria'
        ? 'Per questa Regione l’importo è indicativo: le sue tariffe non sono ancora caricate.'
        : '');
  }

  var CALCOLI = { stipendio: stipendio, bollo: bollo };

  function avvia() {
    var forms = document.querySelectorAll('form[data-widget]');
    if (!forms.length || !window.StrumentiData) return;
    window.StrumentiData.getRegoleFiscali().then(function (regole) {
      if (!regole) throw new Error('regole non disponibili');
      Array.prototype.forEach.call(forms, function (form) {
        var calcola = CALCOLI[form.getAttribute('data-widget')];
        if (!calcola) return;
        var esegui = function () { calcola(form, regole); };
        form.addEventListener('input', esegui);
        form.addEventListener('change', esegui);
        form.addEventListener('submit', function (e) { e.preventDefault(); esegui(); });
        esegui();
      });
    }).catch(function () {
      Array.prototype.forEach.call(forms, function (form) {
        scrivi(form, 'errore', 'Non sono riuscito a caricare le regole di calcolo: ricarica la pagina.');
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
