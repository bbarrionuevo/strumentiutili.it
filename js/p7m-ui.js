// js/p7m-ui.js — Interfaccia di "Aprire un file P7M".
//
// La lettura sta in js/p7m-lettura.js; qui c'e' solo il flusso: scegli il
// file -> scarica il documento -> guarda le firme. Il file non esce dal
// browser: si legge in memoria e il documento estratto diventa un Blob locale.
//
// Una regola che vale per tutto il file: i dati delle firme si presentano come
// "letti nel file", mai come "verificati". Il lettore non verifica niente, e
// l'interfaccia non deve lasciarlo credere.
(function () {
  'use strict';

  var input = document.getElementById('file-p7m');
  var esito = document.getElementById('esito-p7m');
  var risultato = document.getElementById('risultato-p7m');
  if (!input || !risultato || !window.P7mLettura) return;

  var urlCorrente = null;

  var MESSAGGI = {
    'non-firmato': 'Questo file non è una busta di firma digitale. Potrebbe essere già il documento in chiaro (prova ad aprirlo normalmente) oppure un file .p7s, che contiene solo la firma.',
    'firma-separata': 'Questo file contiene solo la firma, non il documento: è una firma “separata”. Il documento firmato è un altro file, che di solito arriva insieme a questo con lo stesso nome.',
    'danneggiato': 'Il file sembra incompleto o danneggiato. Prova a scaricarlo di nuovo dalla PEC o dal sito da cui l’hai ricevuto.',
    'vuoto': 'Il file è vuoto.'
  };

  // Tipi che il browser sa mostrare da solo in una scheda.
  var APRIBILI = { pdf: true, jpg: true, png: true, txt: true };

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function peso(n) {
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)).toLocaleString('it-IT') + ' KB';
    return (n / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
  }

  // Le date nel file sono in UTC: si mostrano all'ora italiana.
  function quando(iso, conOra) {
    if (!iso) return null;
    var opzioni = { timeZone: 'Europe/Rome', day: 'numeric', month: 'long', year: 'numeric' };
    if (conOra) { opzioni.hour = '2-digit'; opzioni.minute = '2-digit'; }
    return new Date(iso).toLocaleString('it-IT', opzioni);
  }

  function voce(etichetta, valore) {
    return '<div><dt class="text-xs text-gray-500">' + esc(etichetta) + '</dt>' +
      '<dd class="text-sm text-gray-900 font-medium break-words">' + (valore ? esc(valore) : '<span class="text-gray-500 font-normal">non indicato nel file</span>') + '</dd></div>';
  }

  function schedaFirma(f, i) {
    var validita = f.validoDal && f.validoAl ? 'dal ' + quando(f.validoDal) + ' al ' + quando(f.validoAl) : null;
    return '<li class="border border-gray-200 rounded-lg p-4">' +
      '<p class="font-semibold text-gray-900">' + (i + 1) + '. ' + esc(f.nome || 'Firmatario non indicato nel file') + '</p>' +
      '<dl class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">' +
      voce('Codice fiscale', f.codiceFiscale) +
      voce('Organizzazione', f.organizzazione) +
      voce('Data della firma (ora italiana)', quando(f.dataFirma, true)) +
      voce('Certificato emesso da', f.emittente) +
      voce('Validità del certificato', validita) +
      '</dl></li>';
  }

  function mostraErrore(codice) {
    risultato.innerHTML = '<div class="border-l-4 border-red-500 bg-red-50 p-4 rounded-r-lg" role="alert">' +
      '<p class="text-sm text-red-900 leading-relaxed">' + esc(MESSAGGI[codice] || 'Non è stato possibile leggere il file.') + '</p></div>';
  }

  function mostra(r) {
    var tipo = r.tipo;
    var bottoni = '<a href="' + urlCorrente + '" download="' + esc(r.nome) + '" class="inline-block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl shadow-sm transition">Scarica il documento</a>';
    if (APRIBILI[tipo.estensione]) {
      bottoni += '<a href="' + urlCorrente + '" target="_blank" rel="noopener" class="inline-block text-center bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold px-5 py-3 rounded-xl transition">Apri in una nuova scheda</a>';
    }

    var note = '';
    if (r.fatturaElettronica) {
      note += '<p class="mt-4 text-sm text-gray-700">È una <strong>fattura elettronica</strong>: per leggerla impaginata, carica lo stesso file .p7m nel ' +
        '<a href="/fisco-professioni/fattura-elettronica/" class="text-indigo-600 hover:underline">visualizzatore di fatture elettroniche</a>.</p>';
    }
    if (tipo.estensione === 'bin') {
      note += '<p class="mt-4 text-sm text-amber-900">Non è stato possibile riconoscere il tipo di documento dal contenuto: il file viene scaricato così com’è, con l’estensione .bin. Se sai che cos’è, rinominalo.</p>';
    }

    var intestazioneFirme = r.firme.length === 1 ? 'Firma letta nel file' : 'Firme lette nel file (' + r.firme.length + ')';
    var nidificate = r.buste > 1
      ? '<p class="text-sm text-gray-700 mb-3">Il documento è stato firmato ' + r.buste + ' volte, una firma dentro l’altra: la prima dell’elenco è l’ultima apposta.</p>'
      : '';

    risultato.innerHTML =
      '<div class="bg-white rounded-xl shadow-sm border border-emerald-200 p-6">' +
        '<h3 id="t-documento" tabindex="-1" class="text-sm font-semibold text-emerald-800">Documento estratto</h3>' +
        '<p class="mt-1 text-lg font-bold text-gray-900 break-all">' + esc(r.nome) + '</p>' +
        '<p class="text-sm text-gray-600">' + esc(tipo.descrizione) + ' · ' + peso(r.contenuto.length) + '</p>' +
        '<div class="mt-4 flex flex-wrap gap-3">' + bottoni + '</div>' +
        note +
      '</div>' +
      '<div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">' +
        '<h3 class="text-lg font-bold text-gray-900 mb-3">' + intestazioneFirme + '</h3>' +
        nidificate +
        '<ul class="space-y-3">' + r.firme.map(schedaFirma).join('') + '</ul>' +
        '<p class="mt-4 text-xs text-gray-600 leading-relaxed">Questi dati sono <strong>letti</strong> dal file, non verificati: lo strumento non controlla la firma, ' +
        'la catena dei certificati né le revoche. Per una verifica con valore legale usa un software di verifica della firma digitale, ' +
        'come quelli messi a disposizione gratuitamente dai certificatori.</p>' +
      '</div>';

    var titolo = document.getElementById('t-documento');
    if (titolo) titolo.focus({ preventScroll: false });
  }

  async function gestisci(file) {
    risultato.innerHTML = '';
    if (urlCorrente) { URL.revokeObjectURL(urlCorrente); urlCorrente = null; }
    if (!file) { esito.textContent = ''; return; }
    esito.textContent = 'Apertura di ' + file.name + '…';

    var r;
    try {
      r = window.P7mLettura.leggi(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch (e) {
      esito.textContent = '';
      mostraErrore(e && e.codice);
      return;
    }
    urlCorrente = URL.createObjectURL(new Blob([r.contenuto], { type: r.tipo.mime }));
    esito.textContent = '';
    mostra(r);
  }

  input.addEventListener('change', function () {
    var files = window.StrumentiDropzone ? window.StrumentiDropzone.getInputFiles(input) : input.files;
    gestisci(files && files[0]);
  });

  if (window.StrumentiDropzone) {
    window.StrumentiDropzone.setup({ drop: 'drop-p7m', input: 'file-p7m', filename: 'nome-p7m' });
  }
})();
