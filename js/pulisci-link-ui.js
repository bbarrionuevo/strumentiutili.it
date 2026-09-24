// js/pulisci-link-ui.js — Interfaccia di "Pulire un link".
//
// Il lavoro vero e' in js/pulisci-link.js. Qui: si pulisce mentre scrivi, si
// copia con un tocco, e si accetta un link arrivato da fuori (?url= / ?text=),
// che e' il modo in cui Android consegna un link condiviso verso l'app
// installata. Niente esce dal browser.
(function () {
  'use strict';

  var ingresso = document.getElementById('testo-link');
  var uscita = document.getElementById('link-pulito');
  var dettagli = document.getElementById('dettagli-link');
  var bottoneCopia = document.getElementById('copia-link');
  var bottoneIncolla = document.getElementById('incolla-link');
  var bottoneCondividi = document.getElementById('condividi-link');
  var esito = document.getElementById('esito-link');
  if (!ingresso || !uscita || !window.PulisciLink) return;

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function aggiorna() {
    var r = window.PulisciLink.pulisciTesto(ingresso.value);
    uscita.value = r.testo;
    esito.textContent = '';
    var validi = r.link.filter(function (l) { return l.valido; });
    if (!ingresso.value.trim()) { dettagli.innerHTML = ''; return; }
    if (!validi.length) {
      dettagli.innerHTML = '<p class="text-sm text-gray-600">Nessun link trovato: incolla un indirizzo che comincia con http:// o https://.</p>';
      return;
    }
    var tolti = validi.reduce(function (n, l) { return n + l.rimossi.length; }, 0);
    var prima = validi.reduce(function (n, l) { return n + l.originale.length; }, 0);
    var dopo = validi.reduce(function (n, l) { return n + l.pulito.length; }, 0);
    var riepilogo = tolti || validi.some(function (l) { return l.avvisi.length; })
      ? '<p class="text-sm font-semibold text-emerald-800">' +
        (tolti === 1 ? 'Tolto 1 parametro di tracciamento' : 'Tolti ' + tolti + ' parametri di tracciamento') +
        (prima > dopo ? ' · il testo dei link è più corto del ' + Math.round((1 - dopo / prima) * 100) + '%' : '') + '.</p>'
      : '<p class="text-sm text-gray-700">Il link era già pulito: nessun parametro di tracciamento conosciuto.</p>';

    var elenco = validi.map(function (l) {
      var voci = l.avvisi.map(function (a) { return '<li class="text-amber-900">' + esc(a) + '</li>'; })
        .concat(l.rimossi.map(function (x) {
          return '<li><code class="text-xs bg-gray-100 rounded px-1">' + esc(x.nome) + '</code> — ' + esc(x.motivo) + '</li>';
        }));
      return voci.length ? '<ul class="mt-2 space-y-1 text-sm text-gray-700 list-disc pl-5">' + voci.join('') + '</ul>' : '';
    }).join('');
    dettagli.innerHTML = riepilogo + elenco;
  }

  ingresso.addEventListener('input', aggiorna);

  bottoneCopia.addEventListener('click', function () {
    if (!uscita.value) return;
    var fatto = function () { esito.textContent = 'Copiato.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(uscita.value).then(fatto, function () { uscita.select(); document.execCommand('copy'); fatto(); });
    } else {
      uscita.select(); document.execCommand('copy'); fatto();
    }
  });

  if (bottoneIncolla && navigator.clipboard && navigator.clipboard.readText) {
    bottoneIncolla.hidden = false;
    bottoneIncolla.addEventListener('click', function () {
      navigator.clipboard.readText().then(function (t) { ingresso.value = t; aggiorna(); }, function () {
        esito.textContent = 'Il browser non ha concesso di leggere gli appunti: incolla a mano.';
      });
    });
  }

  if (bottoneCondividi && navigator.share) {
    bottoneCondividi.hidden = false;
    bottoneCondividi.addEventListener('click', function () {
      if (uscita.value) navigator.share({ text: uscita.value }).catch(function () { /* annullato */ });
    });
  }

  // Link arrivato da fuori: condivisione verso l'app o link diretto.
  var parametri = new URLSearchParams(location.search);
  var arrivato = [parametri.get('text'), parametri.get('url')].filter(Boolean).join(' ').trim();
  if (arrivato) {
    ingresso.value = arrivato;
    // Nell'indirizzo della pagina il link sporco non deve restare.
    if (history.replaceState) history.replaceState(null, '', location.pathname);
  }
  aggiorna();
})();
