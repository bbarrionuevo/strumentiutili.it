// js/esenzione-bollo-ui.js — Interfaccia del verificatore di esenzione bollo 2027.
// La decisione sta in js/esenzione-bollo.js (art. 2 del D.L. 162/2026): qui si
// raccolgono i veicoli e si mostra l'esito con le avvertenze sulla norma.
(function () {
  'use strict';

  var elenco = document.getElementById('elenco-veicoli');
  var risultato = document.getElementById('risultato');
  var bottoneAggiungi = document.getElementById('aggiungi-veicolo');
  var bottoneAzzera = document.getElementById('azzera');
  if (!elenco || !risultato) return;

  var regole = null;
  var contatore = 0;

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ------------------------------------------------------------ righe

  var CAMPO = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none';
  var ETICHETTA = 'block text-xs font-medium text-gray-600 mb-1';

  function aggiungiVeicolo(tipo, kw) {
    contatore++;
    var id = 'veicolo-' + contatore;
    var riga = document.createElement('div');
    riga.className = 'flex flex-wrap items-end gap-3 p-3 border border-gray-200 rounded-lg';
    riga.dataset.riga = '1';
    riga.innerHTML =
      '<div class="flex-1 min-w-[8rem]">' +
      '  <label class="' + ETICHETTA + '" for="' + id + '-tipo">Tipo</label>' +
      '  <select id="' + id + '-tipo" data-campo="tipo" class="' + CAMPO + '">' +
      '    <option value="auto">Auto</option>' +
      '    <option value="moto">Motociclo</option>' +
      '    <option value="ciclomotore">Ciclomotore</option>' +
      '  </select>' +
      '</div>' +
      '<div class="flex-1 min-w-[10rem]">' +
      '  <label class="' + ETICHETTA + '" for="' + id + '-alim">Alimentazione</label>' +
      '  <select id="' + id + '-alim" data-campo="alimentazione" class="' + CAMPO + '">' +
      '    <option value="si">Benzina o gasolio, anche ibrida, GPL o metano</option>' +
      '    <option value="no">Solo elettrica o altro</option>' +
      '  </select>' +
      '</div>' +
      '<div class="flex-1 min-w-[7rem]" data-per="kw">' +
      '  <label class="' + ETICHETTA + '" for="' + id + '-kw">Potenza (kW)</label>' +
      '  <input id="' + id + '-kw" data-campo="kw" type="text" inputmode="decimal" placeholder="es. 51" class="' + CAMPO + '" />' +
      '</div>' +
      '<div class="flex-1 min-w-[7rem]" data-per="anno" hidden>' +
      '  <label class="' + ETICHETTA + '" for="' + id + '-anno">Anno di immatricolazione</label>' +
      '  <input id="' + id + '-anno" data-campo="anno" type="text" inputmode="numeric" placeholder="es. 2012" class="' + CAMPO + '" />' +
      '</div>' +
      '<button type="button" data-azione="rimuovi" aria-label="Rimuovi questo veicolo"' +
      '        class="shrink-0 w-10 h-10 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-red-600">&times;</button>';

    elenco.appendChild(riga);
    if (tipo) riga.querySelector('[data-campo="tipo"]').value = tipo;
    if (kw) riga.querySelector('[data-campo="kw"]').value = kw;
    aggiornaCampi(riga);
    aggiornaRimozioni();
    return riga;
  }

  // Per i ciclomotori conta l'anno di immatricolazione (comma 3), non la potenza.
  function aggiornaCampi(riga) {
    var ciclo = riga.querySelector('[data-campo="tipo"]').value === 'ciclomotore';
    riga.querySelector('[data-per="anno"]').hidden = !ciclo;
    riga.querySelector('[data-per="kw"]').hidden = ciclo;
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
      var anno = r.querySelector('[data-campo="anno"]').value.trim();
      fuori.push({
        tipo: tipo,
        kw: grezzo === '' ? null : Number(grezzo),
        benzina: r.querySelector('[data-campo="alimentazione"]').value === 'si',
        immatricolazione: anno === '' ? null : Number(anno)
      });
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

  var NOMI = { auto: 'Auto', moto: 'Motociclo', ciclomotore: 'Ciclomotore' };
  var ALL = { auto: 'all’auto', moto: 'al motociclo', ciclomotore: 'al ciclomotore' };

  function descrivi(v) {
    if (v.tipo === 'ciclomotore') return v.immatricolazione ? 'immatricolato nel ' + esc(v.immatricolazione) : '';
    return v.kw ? 'da ' + esc(v.kw) + ' kW' : '';
  }

  // un veicolo e' compilato se ha il dato che serve al suo tipo
  function compilato(v) {
    return v.tipo === 'ciclomotore' ? true : !!v.kw;
  }

  function disegna(esito, veicoli) {
    var compilati = veicoli.filter(compilato);
    if (!compilati.length) {
      risultato.innerHTML = '<p class="text-sm text-gray-500">Inserisci la potenza di almeno un veicolo.</p>';
      return;
    }

    var testa;
    if (esito.applicabile) {
      var v = esito.veicoloScelto;
      testa =
        '<div class="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-5">' +
        '  <p class="text-lg font-bold text-emerald-900">Rientri nell’esenzione</p>' +
        '  <p class="text-sm text-emerald-900 mt-1">Si applica ' + ALL[v.tipo] + ' <strong>' + descrivi(v) + '</strong>' +
             (esito.candidati > 1
               ? (v.tipo === 'ciclomotore' ? ', il più vecchio fra quelli idonei' : ', il veicolo di potenza minore fra quelli idonei') + '.'
               : '.') + '</p>' +
        '</div>';
    } else {
      testa =
        '<div class="rounded-lg border-2 border-gray-300 bg-gray-50 p-5">' +
        '  <p class="text-lg font-bold text-gray-900">Non rientri nell’esenzione</p>' +
        '  <p class="text-sm text-gray-700 mt-1">' + esc(esito.motivo) + '</p>' +
        '</div>';
    }

    // Dettaglio veicolo per veicolo: serve a capire il perche', non solo il si o no.
    var righe = esito.esiti.filter(function (e) { return compilato(e.veicolo); }).map(function (e) {
      var esente = esito.indiceScelto === e.indice;
      var etichetta = esente
        ? '<span class="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">esente</span>'
        : '<span class="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">bollo dovuto</span>';
      return '<li class="py-2 border-b border-gray-100 last:border-0">' +
             '<div class="flex items-center justify-between gap-3"><span class="text-sm text-gray-800">' + NOMI[e.veicolo.tipo] +
             ' ' + descrivi(e.veicolo) + '</span>' + etichetta + '</div>' +
             (esente ? '' : '<p class="text-xs text-gray-500 mt-0.5">' + esc(e.esito.si ? 'Idoneo, ma l’esenzione spetta a un solo veicolo.' : e.esito.perche) + '</p>') +
             '</li>';
    }).join('');

    var dettaglio = righe
      ? '<ul class="mt-4 bg-white border border-gray-200 rounded-lg px-4">' + righe + '</ul>'
      : '';

    risultato.innerHTML = testa + dettaglio + disegnaAvvertenze(esito.avvertenze);
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
  elenco.addEventListener('change', function (e) {
    if (e.target.matches('[data-campo="tipo"]')) aggiornaCampi(e.target.closest('[data-riga]'));
    calcola();
  });
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
