// js/condivisi-ui.js — La pagina /condividi/: i file arrivati da fuori e che
// cosa farne. I file stanno in IndexedDB (js/condivisi.js); ogni azione porta
// allo strumento con ?da=condivisi, e lo strumento li trova gia' selezionati.
(function () {
  'use strict';

  var elenco = document.getElementById('condivisi-file');
  var azioni = document.getElementById('condivisi-azioni');
  var vuoto = document.getElementById('condivisi-vuoto');
  var pieno = document.getElementById('condivisi-pieno');
  var rimuovi = document.getElementById('condivisi-rimuovi');
  if (!elenco || !azioni || !window.Condivisi) return;

  function peso(n) {
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)).toLocaleString('it-IT') + ' KB';
    return (n / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
  }

  function mostra(files) {
    elenco.textContent = '';
    azioni.textContent = '';
    if (!files.length) { vuoto.hidden = false; pieno.hidden = true; return; }
    vuoto.hidden = true;
    pieno.hidden = false;

    files.forEach(function (f) {
      var li = document.createElement('li');
      li.className = 'flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0';
      var nome = document.createElement('span');
      nome.className = 'text-sm font-medium text-gray-900 break-all';
      nome.textContent = f.name;
      var dim = document.createElement('span');
      dim.className = 'text-xs text-gray-500 shrink-0';
      dim.textContent = peso(f.size);
      li.appendChild(nome);
      li.appendChild(dim);
      elenco.appendChild(li);
    });

    var proposte = window.Condivisi.azioni(files);
    if (!proposte.length) {
      var p = document.createElement('p');
      p.className = 'text-sm text-gray-700';
      p.textContent = 'Nessuno strumento del sito lavora con questo tipo di file.';
      azioni.appendChild(p);
      return;
    }
    proposte.forEach(function (a) {
      var link = document.createElement('a');
      link.href = a.percorso + '?da=condivisi';
      link.className = 'block bg-white p-4 rounded-xl border border-gray-200 hover:border-indigo-400 hover:shadow-md transition';
      var t = document.createElement('span');
      t.className = 'block font-bold text-gray-900';
      t.textContent = a.titolo;
      var d = document.createElement('span');
      d.className = 'block text-sm text-gray-600 mt-1';
      d.textContent = a.descrizione;
      link.appendChild(t);
      link.appendChild(d);
      azioni.appendChild(link);
    });
  }

  if (rimuovi) {
    rimuovi.addEventListener('click', function () {
      window.Condivisi.svuota().then(function () { mostra([]); });
    });
  }

  window.Condivisi.leggi().then(mostra);
})();
