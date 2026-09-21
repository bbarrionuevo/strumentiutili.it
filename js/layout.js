// js/layout.js — Comportamento comune a tutte le pagine: registrazione del
// service worker, menu delle categorie su telefono e ricerca fra gli strumenti.
//
// Prima il menu esisteva solo da 1024px in su e la ricerca solo in home.
(function () {
  'use strict';

  // ------------------------------------------------------ service worker

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // ------------------------------------------------------- menu telefono

  function avviaMenu() {
    var bottone = document.getElementById('menu-toggle');
    var pannello = document.getElementById('menu-mobile');
    if (!bottone || !pannello) return;

    var iconaApri = bottone.querySelector('[data-menu-icona="apri"]');
    var iconaChiudi = bottone.querySelector('[data-menu-icona="chiudi"]');

    function mostra(aperto) {
      pannello.hidden = !aperto;
      bottone.setAttribute('aria-expanded', aperto ? 'true' : 'false');
      bottone.setAttribute('aria-label', aperto ? 'Chiudi il menu delle categorie' : 'Apri il menu delle categorie');
      if (iconaApri) iconaApri.classList.toggle('hidden', aperto);
      if (iconaChiudi) iconaChiudi.classList.toggle('hidden', !aperto);
    }

    bottone.addEventListener('click', function () {
      mostra(pannello.hidden);
    });

    // Esc chiude e riporta il fuoco sul bottone, altrimenti si resta persi.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !pannello.hidden) {
        mostra(false);
        bottone.focus();
      }
    });

    // Un tocco fuori dal menu lo chiude.
    document.addEventListener('click', function (e) {
      if (pannello.hidden) return;
      if (pannello.contains(e.target) || bottone.contains(e.target)) return;
      mostra(false);
    });

    // Tornando al layout da computer il pannello non deve restare aperto.
    if (window.matchMedia) {
      var grande = window.matchMedia('(min-width: 1024px)');
      var suCambio = function (e) { if (e.matches) mostra(false); };
      if (grande.addEventListener) grande.addEventListener('change', suCambio);
      else if (grande.addListener) grande.addListener(suCambio);
    }
  }

  // ------------------------------------------------------------ ricerca

  function avviaRicerca() {
    var campo = document.getElementById('search');
    var tendina = document.getElementById('risultati-menu');
    if (!campo || !tendina) return;

    var indice = null;
    var caricamento = null;
    var evidenziato = -1;

    function caricaIndice() {
      if (indice) return Promise.resolve(indice);
      if (!caricamento) {
        caricamento = fetch('/data/strumenti.json')
          .then(function (r) { return r.ok ? r.json() : { strumenti: [] }; })
          .then(function (d) { indice = d.strumenti || []; return indice; })
          .catch(function () { indice = []; return indice; });
      }
      return caricamento;
    }

    function senzaAccenti(t) {
      return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    // Stesso punteggio della vecchia ricerca in home: tutte le parole devono
    // comparire, il titolo pesa piu' della descrizione e le varianti pSEO
    // vengono dopo l'originale.
    function punteggio(voce, parole) {
      var titolo = senzaAccenti(voce.titolo);
      var testo = titolo + ' ' + senzaAccenti(voce.descrizione) + ' ' + senzaAccenti(voce.percorso);
      var p = 0;
      for (var i = 0; i < parole.length; i++) {
        if (testo.indexOf(parole[i]) === -1) return -1;
        if (titolo.indexOf(parole[i]) === 0) p += 3;
        else if (titolo.indexOf(parole[i]) !== -1) p += 2;
        else p += 1;
      }
      if (voce.variante) p -= 1;
      return p;
    }

    function esc(t) {
      return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function apri(aperto) {
      tendina.hidden = !aperto;
      campo.setAttribute('aria-expanded', aperto ? 'true' : 'false');
      if (!aperto) { evidenziato = -1; campo.removeAttribute('aria-activedescendant'); }
    }

    function voci() {
      return Array.prototype.slice.call(tendina.querySelectorAll('[role="option"]'));
    }

    function evidenzia(nuovo) {
      var elenco = voci();
      if (!elenco.length) return;
      if (evidenziato >= 0 && elenco[evidenziato]) elenco[evidenziato].classList.remove('bg-indigo-50');
      evidenziato = (nuovo + elenco.length) % elenco.length;
      var attivo = elenco[evidenziato];
      attivo.classList.add('bg-indigo-50');
      campo.setAttribute('aria-activedescendant', attivo.id);
      if (attivo.scrollIntoView) attivo.scrollIntoView({ block: 'nearest' });
    }

    function disegna(trovati, testo) {
      if (!trovati.length) {
        tendina.innerHTML = '<p class="px-4 py-3 text-sm text-gray-600">Nessuno strumento per &laquo;' +
          esc(testo) + '&raquo;. Prova con una parola sola: bollo, IVA, dimissioni, fototessera.</p>';
        apri(true);
        return;
      }

      var righe = trovati.slice(0, 12).map(function (v, i) {
        var etichetta = v.variante
          ? esc(v.variante.genere) + ': ' + esc(v.variante.etichetta)
          : esc(v.nomeCategoria);
        return '<a id="risultato-' + i + '" role="option" href="' + esc(v.percorso) + '" ' +
          'class="block px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none">' +
          '<span class="block text-xs font-semibold uppercase tracking-wide text-indigo-600">' + etichetta + '</span>' +
          '<span class="block text-sm font-medium text-gray-900 mt-0.5">' + esc(v.titolo) + '</span>' +
          '</a>';
      }).join('');

      var coda = trovati.length > 12
        ? '<p class="px-4 py-2 text-xs text-gray-500 bg-gray-50">e altri ' + (trovati.length - 12) + ' risultati: aggiungi una parola per restringere.</p>'
        : '';

      tendina.innerHTML = righe + coda;
      apri(true);
    }

    function cerca(testo) {
      var parole = senzaAccenti(testo).split(/\s+/).filter(Boolean);
      if (!parole.length) { apri(false); return; }

      caricaIndice().then(function (voci) {
        var trovati = voci
          .map(function (v) { return { v: v, p: punteggio(v, parole) }; })
          .filter(function (x) { return x.p >= 0; })
          .sort(function (a, b) { return b.p - a.p || a.v.titolo.localeCompare(b.v.titolo); })
          .map(function (x) { return x.v; });
        disegna(trovati, testo);
      });
    }

    var attesa = null;
    campo.addEventListener('input', function (e) {
      var testo = e.target.value.trim();
      clearTimeout(attesa);
      attesa = setTimeout(function () { cerca(testo); }, 120);
    });

    campo.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { apri(false); return; }
      if (tendina.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); evidenzia(evidenziato + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); evidenzia(evidenziato - 1); }
      else if (e.key === 'Enter' && evidenziato >= 0) {
        var attivo = voci()[evidenziato];
        if (attivo) { e.preventDefault(); window.location.href = attivo.getAttribute('href'); }
      }
    });

    campo.addEventListener('focus', function () {
      if (campo.value.trim()) cerca(campo.value.trim());
    });

    document.addEventListener('click', function (e) {
      if (tendina.hidden) return;
      if (tendina.contains(e.target) || campo.contains(e.target)) return;
      apri(false);
    });
  }

  // ---------------------------------------------------------------- avvio

  function avvia() {
    avviaMenu();
    avviaRicerca();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
