// js/esenzione-bollo-ui.js — Interfaccia del verificatore di esenzione bollo 2027.
// La decisione sta in js/esenzione-bollo.js: qui si raccolgono i veicoli e si
// mostra l'esito, comprese le avvertenze sui punti della norma non confermati.
(function () {
  'use strict';

  var elenco = document.getElementById('elenco-veicoli');
  var risultato = document.getElementById('risultato');
  var bottoneAggiungi = document.getElementById('aggiungi-veicolo');
  var bottoneAzzera = document.getElementById('azzera');
  if (!elenco || !risultato) return;

  var regole = null;
  var contatore = 0;

  var euro = function (n) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
  };

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ------------------------------------------------------------ righe

  function aggiungiVeicolo(tipo, kw) {
    contatore++;
    var id = 'veicolo-' + contatore;
    var riga = document.createElement('div');
    riga.className = 'flex flex-wrap items-end gap-3 p-3 border border-gray-200 rounded-lg';
    riga.dataset.riga = '1';
    riga.innerHTML =
      '<div class="flex-1 min-w-[8rem]">' +
      '  <label class="block text-xs font-medium text-gray-600 mb-1" for="' + id + '-tipo">Tipo</label>' +
      '  <select id="' + id + '-tipo" data-campo="tipo" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">' +
      '    <option value="auto">Auto</option>' +
      '    <option value="moto">Moto o ciclomotore</option>' +
      '  </select>' +
      '</div>' +
      '<div class="flex-1 min-w-[8rem]">' +
      '  <label class="block text-xs font-medium text-gray-600 mb-1" for="' + id + '-kw">Potenza (kW)</label>' +
      '  <input id="' + id + '-kw" data-campo="kw" type="text" inputmode="decimal" placeholder="es. 51"' +
      '         class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />' +
      '</div>' +
      '<button type="button" data-azione="rimuovi" aria-label="Rimuovi questo veicolo"' +
      '        class="shrink-0 w-10 h-10 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-red-600">&times;</button>';

    elenco.appendChild(riga);
    if (tipo) riga.querySelector('[data-campo="tipo"]').value = tipo;
    if (kw) riga.querySelector('[data-campo="kw"]').value = kw;
    aggiornaRimozioni();
    return riga;
  }

  // Con un solo veicolo il pulsante di rimozione non serve.
  function aggiornaRimozioni() {
    var righe = elenco.querySelectorAll('[data-riga]');
    righe.forEach(function (r) {
      var b = r.querySelector('[data-azione="rimuovi"]');
      if (b) b.style.visibility = righe.length > 1 ? 'visible' : 'hidden';
    });
  }

  function leggiVeicoli() {
    var fuori = [];
    elenco.querySelectorAll('[data-riga]').forEach(function (r) {
      var tipo = r.querySelector('[data-campo="tipo"]').value;
      var grezzo = r.querySelector('[data-campo="kw"]').value.replace(',', '.').trim();
      fuori.push({ tipo: tipo, kw: grezzo === '' ? null : Number(grezzo) });
    });
    return fuori;
  }

  // ----------------------------------------------------------- esito

  function disegnaAvvertenze(avvisi) {
    if (!avvisi.length) return '';
    return '<div class="mt-4 space-y-2">' + avvisi.map(function (a) {
      return '<p class="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">' +
             esc(a.testo) + '</p>';
    }).join('') + '</div>';
  }

  function disegna(esito, veicoli) {
    var compilati = veicoli.filter(function (v) { return v.kw; });
    if (!compilati.length) {
      risultato.innerHTML = '<p class="text-sm text-gray-500">Inserisci la potenza di almeno un veicolo.</p>';
      return;
    }

    var testa;
    if (esito.applicabile) {
      var v = esito.veicoloScelto;
      testa =
        '<div class="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-5">' +
        '  <p class="text-lg font-bold text-emerald-900">Rientreresti nell’esenzione</p>' +
        '  <p class="text-sm text-emerald-900 mt-1">Si applicherebbe ' +
             (v.tipo === 'moto' ? 'al motociclo' : 'all’auto') + ' da <strong>' + esc(v.kw) + ' kW</strong>' +
             (esito.candidati > 1 ? ', il veicolo di potenza minore fra quelli idonei' : '') + '.</p>' +
        '</div>';
    } else {
      testa =
        '<div class="rounded-lg border-2 border-gray-300 bg-gray-50 p-5">' +
        '  <p class="text-lg font-bold text-gray-900">Non rientreresti nell’esenzione</p>' +
        '  <p class="text-sm text-gray-700 mt-1">' + esc(esito.motivo) + '</p>' +
        '</div>';
    }

    // Dettaglio veicolo per veicolo: serve a capire il perche', non solo il si o no.
    var righe = esito.esiti.filter(function (e) { return e.veicolo.kw; }).map(function (e) {
      var esente = esito.indiceScelto === e.indice;
      var etichetta = esente
        ? '<span class="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">esente</span>'
        : '<span class="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">bollo dovuto</span>';
      return '<li class="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">' +
             '<span class="text-sm text-gray-800">' + (e.veicolo.tipo === 'moto' ? 'Moto' : 'Auto') +
             ' &middot; ' + esc(e.veicolo.kw) + ' kW</span>' + etichetta + '</li>';
    }).join('');

    var dettaglio = righe
      ? '<ul class="mt-4 bg-white border border-gray-200 rounded-lg px-4">' + righe + '</ul>'
      : '';

    var superbollo = esito.superbolloResta
      ? '<p class="mt-3 text-xs text-gray-500">Il superbollo oltre i 185 kW resta comunque dovuto: l’esenzione riguarda la sola tassa regionale.</p>'
      : '';

    risultato.innerHTML = testa + dettaglio + superbollo + disegnaAvvertenze(esito.avvertenze);
  }

  function calcola() {
    if (!regole || !window.EsenzioneBollo) return;
    var veicoli = leggiVeicoli();
    try {
      disegna(window.EsenzioneBollo.valuta(veicoli, regole), veicoli);
    } catch (e) {
      risultato.innerHTML = '<p class="text-sm text-red-600">Non è stato possibile completare la verifica.</p>';
    }
  }

  // ----------------------------------------------------------- avvio

  elenco.addEventListener('input', calcola);
  elenco.addEventListener('change', calcola);
  elenco.addEventListener('click', function (e) {
    var b = e.target.closest('[data-azione="rimuovi"]');
    if (!b) return;
    var righe = elenco.querySelectorAll('[data-riga]');
    if (righe.length <= 1) return;
    b.closest('[data-riga]').remove();
    aggiornaRimozioni();
    calcola();
  });

  if (bottoneAggiungi) {
    bottoneAggiungi.addEventListener('click', function () {
      aggiungiVeicolo();
      calcola();
    });
  }

  if (bottoneAzzera) {
    bottoneAzzera.addEventListener('click', function () {
      elenco.innerHTML = '';
      contatore = 0;
      aggiungiVeicolo();
      risultato.innerHTML = '';
    });
  }

  aggiungiVeicolo();

  window.StrumentiData.getRegoleFiscali().then(function (dati) {
    if (!dati || !dati.esenzione_bollo_2027) {
      risultato.innerHTML = '<p class="text-sm text-red-600">Regole non disponibili: riprova più tardi.</p>';
      return;
    }
    regole = dati.esenzione_bollo_2027;
    calcola();
  });
})();
