// js/mappa.js — Filtro della mappa del sito.
//
// Mostra solo le voci che contengono tutte le parole scritte. Arriva qui anche
// chi cerca dall'intestazione senza JavaScript (/mappa-del-sito/?q=...): la
// parola cercata riempie gia' il campo.
(function () {
  'use strict';
  var campo = document.getElementById('mappa-cerca');
  var esito = document.getElementById('mappa-esito');
  if (!campo) return;
  var voci = Array.prototype.slice.call(document.querySelectorAll('[data-mappa]'));

  function norm(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function filtra() {
    var parole = norm(campo.value).split(/\s+/).filter(Boolean);
    var visibili = 0;
    voci.forEach(function (v) {
      var testo = norm(v.getAttribute('data-mappa'));
      var ok = parole.every(function (p) { return testo.indexOf(p) !== -1; });
      v.hidden = !ok;
      if (ok) visibili++;
    });
    // le sezioni rimaste senza voci si nascondono
    Array.prototype.forEach.call(document.querySelectorAll('section[aria-labelledby^="m-"]'), function (s) {
      s.hidden = !s.querySelector('[data-mappa]:not([hidden])');
    });
    esito.textContent = parole.length ? (visibili ? visibili + (visibili === 1 ? ' risultato' : ' risultati') : 'Nessun risultato: prova con una parola sola.') : '';
  }

  var q = new URLSearchParams(location.search).get('q');
  if (q) campo.value = q;
  campo.addEventListener('input', filtra);
  if (campo.form) campo.form.addEventListener('submit', function (e) { e.preventDefault(); filtra(); });
  filtra();
})();
