// js/concordato-ui.js — Interfaccia del simulatore di convenienza del
// Concordato Preventivo Biennale. Il calcolo sta in js/concordato.js.
(function () {
  'use strict';

  var risultato = document.getElementById('risultato');
  if (!risultato) return;

  var campi = {
    redditoPrecedente: document.getElementById('reddito-precedente'),
    isa: document.getElementById('isa'),
    conc2026: document.getElementById('conc-2026'),
    eff2026: document.getElementById('eff-2026'),
    conc2027: document.getElementById('conc-2027'),
    eff2027: document.getElementById('eff-2027'),
    cassa: document.getElementById('cassa'),
    contributi: document.getElementById('aliq-contributi'),
    addizionali: document.getElementById('aliq-addizionali')
  };

  var notaAliquota = document.getElementById('nota-aliquota');
  var notaCassa = document.getElementById('nota-cassa');
  var regole = null;

  var euro = function (n) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
  };

  // Accetta sia la virgola sia il punto come separatore decimale.
  function numero(el) {
    if (!el) return 0;
    var g = String(el.value || '').replace(/\./g, '').replace(',', '.').trim();
    var n = Number(g);
    return Number.isFinite(n) ? n : 0;
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function riga(etichetta, valore, forte) {
    return '<div class="flex justify-between gap-3 py-1.5 ' + (forte ? 'font-bold text-gray-900 border-t border-gray-200 mt-1 pt-2' : 'text-gray-700') + '">' +
           '<span class="text-sm">' + esc(etichetta) + '</span>' +
           '<span class="text-sm font-mono">' + euro(valore) + '</span></div>';
  }

  function colonna(titolo, anni, totale, evidenzia, sottotitolo) {
    var dettaglio = anni.map(function (a, i) {
      return '<div class="text-xs text-gray-500 mt-2 mb-1">Anno ' + (2026 + i) + ' &middot; base ' + euro(a.base) + '</div>' +
             riga('IRPEF', a.irpef) +
             (a.sostitutiva ? riga('Imposta sostitutiva', a.sostitutiva) : '') +
             riga('Addizionali', a.addizionali) +
             riga('Contributi', a.contributi);
    }).join('');

    return '<div class="rounded-xl border-2 p-5 ' + (evidenzia ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white') + '">' +
           '<h3 class="font-bold text-gray-900">' + esc(titolo) + '</h3>' +
           (sottotitolo ? '<p class="text-xs text-gray-600 mt-0.5">' + esc(sottotitolo) + '</p>' : '') +
           dettaglio +
           riga('Totale biennio', totale, true) +
           '</div>';
  }

  function disegna(r) {
    var mig = r.miglioreConcordato;
    var titoloMig = mig === 'conSostitutiva' ? 'Con concordato + sostitutiva' : 'Con concordato';

    var verdetto = r.conviene
      ? '<div class="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-5 mb-5">' +
        '<p class="text-lg font-bold text-emerald-900">Aderire ti converrebbe</p>' +
        '<p class="text-sm text-emerald-900 mt-1">Sul biennio risparmieresti circa <strong>' + euro(r.risparmio) +
        '</strong> scegliendo &laquo;' + esc(titoloMig).toLowerCase() + '&raquo;.</p></div>'
      : '<div class="rounded-lg border-2 border-rose-300 bg-rose-50 p-5 mb-5">' +
        '<p class="text-lg font-bold text-rose-900">Aderire ti costerebbe di pi&ugrave;</p>' +
        '<p class="text-sm text-rose-900 mt-1">Sul biennio pagheresti circa <strong>' + euro(Math.abs(r.risparmio)) +
        '</strong> in pi&ugrave; rispetto alla tassazione ordinaria: la proposta &egrave; superiore a quello che prevedi di guadagnare.</p></div>';

    var colonne =
      '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
      colonna('Senza concordato', r.scenari.senza, r.totali.senza, !r.conviene, 'Imposte sul reddito che prevedi') +
      colonna('Con concordato', r.scenari.conOrdinaria, r.totali.conOrdinaria, r.conviene && mig === 'conOrdinaria', 'IRPEF ordinaria sul concordato') +
      colonna('Con concordato + sostitutiva', r.scenari.conSostitutiva, r.totali.conSostitutiva, r.conviene && mig === 'conSostitutiva', 'Sostitutiva al ' + (r.aliquotaSostitutiva * 100).toFixed(0) + '% sull’eccedenza') +
      '</div>';

    var oltre = r.scenari.conSostitutiva.some(function (a) {
      return a.dettaglioSostitutiva && a.dettaglioSostitutiva.oltreTetto > 0;
    });
    var avvisoTetto = oltre
      ? '<p class="mt-4 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">' +
        'Una parte dell’eccedenza supera gli 85.000 euro: su quella quota la sostitutiva non si applica e vale il 43%.</p>'
      : '';

    var avvisoCassa = r.contributiSulReale
      ? '<p class="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">' +
        'Con una cassa professionale i contributi restano calcolati sul reddito reale anche aderendo: il concordato ' +
        'riguarda solo il rapporto tributario.</p>'
      : '';

    var fuori = '<p class="mt-4 text-xs text-gray-500">Non considerato in questa stima: ' +
                r.nonModellato.map(function (x) { return esc(x).toLowerCase(); }).join('; ') + '.</p>';

    risultato.innerHTML = verdetto + colonne + avvisoTetto + avvisoCassa + fuori;
  }

  function calcola() {
    if (!regole || !window.Concordato) return;

    var suReale = campi.cassa.value === 'privata';
    if (notaCassa) {
      notaCassa.textContent = suReale
        ? 'Con la cassa professionale i contributi restano sul reddito reale: il concordato non li tocca.'
        : 'Con l’INPS la base contributiva è il reddito concordato (puoi comunque versare su quello effettivo, se superiore).';
    }

    var dati = {
      redditoPrecedente: numero(campi.redditoPrecedente),
      isa: Number(campi.isa.value),
      aliquotaContributi: numero(campi.contributi) / 100,
      aliquotaAddizionali: numero(campi.addizionali) / 100,
      contributiSulReale: suReale,
      anni: [
        { concordato: numero(campi.conc2026), effettivo: numero(campi.eff2026) },
        { concordato: numero(campi.conc2027), effettivo: numero(campi.eff2027) }
      ]
    };

    try {
      var r = window.Concordato.confronta(dati, regole);
      if (notaAliquota) {
        notaAliquota.textContent = 'Con questo punteggio l’imposta sostitutiva è al ' +
          (r.aliquotaSostitutiva * 100).toFixed(0) + '%.';
      }
      disegna(r);
    } catch (e) {
      risultato.innerHTML = '<p class="text-sm text-red-600">Non e stato possibile completare il confronto.</p>';
    }
  }

  Object.keys(campi).forEach(function (k) {
    if (!campi[k]) return;
    campi[k].addEventListener('input', calcola);
    campi[k].addEventListener('change', calcola);
  });

  window.StrumentiData.getRegoleFiscali().then(function (dati) {
    if (!dati || !dati.concordato_preventivo) {
      risultato.innerHTML = '<p class="text-sm text-red-600">Regole non disponibili: riprova piu tardi.</p>';
      return;
    }
    regole = dati;
    calcola();
  });
})();
