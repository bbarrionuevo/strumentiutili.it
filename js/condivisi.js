// js/condivisi.js — File che arrivano da fuori: "Condividi" su Android e
// "Apri con" sul computer, verso l'app installata.
//
// Il manifest dichiara StrumentiUtili come destinazione di condivisione
// (share_target) e come programma per aprire .pdf e .p7m (file_handlers).
// Nessun server riceve niente:
//
//   - Condivisione: il sistema manda un POST a /condividi/. Lo intercetta il
//     service worker, che mette i file in IndexedDB e porta alla pagina
//     /condividi/, dove si sceglie che cosa farne.
//   - Apertura da file: il browser consegna i file alla pagina attraverso
//     window.launchQueue.
//   - Lo strumento scelto (?da=condivisi) trova i file nel suo campo marcato
//     data-condivisi, come se l'utente li avesse selezionati.
//
// I file restano al massimo un'ora, e si cancellano anche con "Cancella i
// dati salvati su questo dispositivo" (js/layout.js elimina il database).
//
// Lo stesso file serve al service worker (importScripts) e alle pagine: la
// parte che tocca il DOM parte solo se c'e' un documento.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Condivisi = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var DB = 'strumentiutili';
  var STORE = 'condivisi';
  var CHIAVE = 'ultimi';
  var DURATA_MS = 60 * 60 * 1000;

  // ------------------------------------------------------------ regole

  function estensione(nome) {
    var m = /\.([a-z0-9]+)$/i.exec(String(nome || ''));
    return m ? m[1].toLowerCase() : '';
  }

  // Accetta sia i File del browser (name, type) sia le voci salvate (nome, tipo).
  function nomeDi(f) { return f.nome || f.name || ''; }

  function genere(f) {
    var tipo = String(f.tipo || f.type || '').toLowerCase();
    var est = estensione(nomeDi(f));
    if (est === 'p7m' || tipo === 'application/pkcs7-mime') return 'p7m';
    if (tipo === 'application/pdf' || est === 'pdf') return 'pdf';
    if (tipo === 'image/jpeg' || tipo === 'image/png' || est === 'jpg' || est === 'jpeg' || est === 'png') return 'foto';
    if (tipo.indexOf('image/') === 0 || ['heic', 'heif', 'webp', 'gif', 'bmp', 'tif', 'tiff'].indexOf(est) !== -1) return 'immagine';
    if (tipo.indexOf('audio/') === 0 || ['opus', 'ogg', 'mp3', 'm4a', 'wav', 'aac'].indexOf(est) !== -1) return 'audio';
    if (tipo.indexOf('video/') === 0 || ['mp4', 'mov', 'm4v'].indexOf(est) !== -1) return 'video';
    if (est === 'docx') return 'docx';
    if (est === 'xml' || tipo === 'application/xml' || tipo === 'text/xml') return 'xml';
    return 'altro';
  }

  var AZIONI = {
    pdf: [
      ['/pdf/comprimi-pdf/', 'Comprimere', 'Ridurre il peso per email, PEC e portali'],
      ['/pdf/unisci-pdf/', 'Unire', 'Metterli in un solo PDF e riordinare le pagine'],
      ['/pdf/dividi-pdf/', 'Dividere', 'Estrarre solo le pagine che servono'],
      ['/pdf/firma/', 'Firmare', 'Aggiungere la firma disegnata o una foto della firma'],
      ['/pdf/anonimizza/', 'Oscurare dati', 'Coprire in modo definitivo nomi, IBAN, indirizzi'],
      ['/identita-burocrazia/proteggi-documento/', 'Proteggere un documento', 'Filigrana \u00abcopia per\u2026\u00bb su tutte le pagine'],
      ['/pdf/convertitore-pdfa/', 'Convertire in PDF/A', 'Il formato richiesto da PA e tribunali'],
      ['/ia/ocr-immagini/', 'Estrarre il testo', 'Riconoscere il testo di una scansione']
    ],
    foto: [
      ['/identita-burocrazia/proteggi-documento/', 'Proteggere un documento', 'Filigrana e parti coperte prima di inviare la copia'],
      ['/utilita-web/rimuovi-dati-foto/', 'Togliere posizione e dati', 'Senza perdere qualit\u00e0, prima di inviare la foto'],
      ['/pdf/jpg-in-pdf/', 'Creare un PDF', 'Una foto per pagina, in un unico file'],
      ['/utilita-web/convertitore-immagini/', 'Convertire o ridurre', 'Cambiare formato e peso delle immagini'],
      ['/ia/ocr-immagini/', 'Estrarre il testo', 'Riconoscere il testo nella foto']
    ],
    immagine: [
      ['/utilita-web/convertitore-immagini/', 'Convertire', 'Da HEIC, WebP e altri formati a JPG o PNG'],
      ['/ia/ocr-immagini/', 'Estrarre il testo', 'Riconoscere il testo nell’immagine']
    ],
    p7m: [
      ['/pdf/apri-file-p7m/', 'Aprire il file firmato', 'Estrarre il documento e vedere chi l’ha firmato']
    ],
    xml: [
      ['/fisco-professioni/fattura-elettronica/', 'Leggere la fattura', 'Visualizzare una fattura elettronica XML']
    ],
    docx: [
      ['/pdf/word-in-pdf/', 'Convertire in PDF', 'Il testo del documento Word in un PDF']
    ],
    audio: [
      ['/ia/trascrizione-audio/', 'Trascrivere', 'Trasformare il vocale o la registrazione in testo']
    ],
    video: [
      ['/ia/trascrizione-audio/', 'Trascrivere l’audio', 'Trasformare in testo quello che si dice nel video']
    ]
  };

  // Che cosa si puo' fare con i file ricevuti: le azioni valide per il genere
  // del primo file. Una fattura .xml.p7m si puo' anche leggere impaginata.
  function azioni(files) {
    if (!files || !files.length) return [];
    var g = genere(files[0]);
    var elenco = (AZIONI[g] || []).map(function (a) { return { percorso: a[0], titolo: a[1], descrizione: a[2] }; });
    if (g === 'p7m' && /\.xml\.p7m$/i.test(nomeDi(files[0]))) {
      elenco.push({ percorso: '/fisco-professioni/fattura-elettronica/', titolo: 'Leggere la fattura', descrizione: 'Visualizzare la fattura elettronica firmata' });
    }
    return elenco;
  }

  // Un solo tipo per volta: i file di genere diverso dal primo si scartano,
  // perche' nessuno strumento li accetterebbe insieme.
  function stessoGenere(files) {
    if (!files || !files.length) return [];
    var g = genere(files[0]);
    return files.filter(function (f) { return genere(f) === g; });
  }

  function scaduto(record, ora) {
    return !record || !record.ora || (ora == null ? Date.now() : ora) - record.ora > DURATA_MS;
  }

  // ---------------------------------------------------------- IndexedDB

  function apri() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }

  function operazione(modo, fai) {
    return apri().then(function (db) {
      return new Promise(function (ok, ko) {
        var tx = db.transaction(STORE, modo);
        var esito = fai(tx.objectStore(STORE));
        tx.oncomplete = function () { db.close(); ok(esito && esito.result); };
        tx.onerror = function () { db.close(); ko(tx.error); };
      });
    });
  }

  // I Blob si salvano cosi' come sono: IndexedDB li conserva senza copiarli in memoria.
  function salva(files) {
    var voci = Array.prototype.map.call(files, function (f) {
      return { nome: f.name || 'file', tipo: f.type || '', dati: f };
    });
    return operazione('readwrite', function (s) { return s.put({ ora: Date.now(), files: voci }, CHIAVE); });
  }

  function leggi() {
    return operazione('readonly', function (s) { return s.get(CHIAVE); }).then(function (record) {
      if (scaduto(record)) { svuota(); return []; }
      return record.files.map(function (v) {
        try { return new File([v.dati], v.nome, { type: v.tipo }); } catch (e) { return v.dati; }
      });
    }).catch(function () { return []; });
  }

  function svuota() {
    return operazione('readwrite', function (s) { return s.delete(CHIAVE); }).catch(function () { /* niente */ });
  }

  // ------------------------------------------------------------ pagine

  // Consegna i file al campo dello strumento, filtrati sul suo "accept".
  function consegna(input, files) {
    var accetta = String(input.getAttribute('accept') || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
    var validi = files.filter(function (f) {
      if (!accetta.length) return true;
      var tipo = String(f.type || '').toLowerCase();
      var est = '.' + estensione(f.name);
      return accetta.some(function (a) {
        if (a[0] === '.') return a === est;
        if (/\/\*$/.test(a)) return tipo.indexOf(a.slice(0, -1)) === 0;
        return a === tipo;
      });
    });
    if (!input.multiple) validi = validi.slice(0, 1);
    if (!validi.length) return 0;
    var dt = new DataTransfer();
    validi.forEach(function (f) { dt.items.add(f); });
    try { input.files = dt.files; }
    catch (e) { if (window.StrumentiDropzone) { window.StrumentiDropzone.setFilesOnInput(input, dt.files); return validi.length; } }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return validi.length;
  }

  // Alcuni strumenti preparano i loro gestori dopo un caricamento asincrono
  // (js/pdf-tools.js): lo dichiarano con data-condivisi-attendi e avvisano con
  // l'evento su:pronto.
  function quandoPronto(input) {
    if (!input.hasAttribute('data-condivisi-attendi') || window.SuStrumentoPronto) return Promise.resolve();
    return new Promise(function (ok) {
      document.addEventListener('su:pronto', function () { ok(); }, { once: true });
      setTimeout(ok, 5000);
    });
  }

  function avviaPagina() {
    var input = document.querySelector('input[type="file"][data-condivisi]');
    var parametri = new URLSearchParams(location.search);

    if (input && parametri.get('da') === 'condivisi') {
      if (history.replaceState) history.replaceState(null, '', location.pathname);
      Promise.all([leggi(), quandoPronto(input)]).then(function (r) {
        if (r[0].length) consegna(input, r[0]);
      });
    }

    // "Apri con StrumentiUtili" dal computer (Chromium, app installata).
    if ('launchQueue' in window && window.launchQueue && window.launchQueue.setConsumer) {
      window.launchQueue.setConsumer(function (params) {
        if (!params || !params.files || !params.files.length) return;
        Promise.all(params.files.map(function (h) { return h.getFile(); })).then(function (files) {
          if (input) return quandoPronto(input).then(function () { consegna(input, files); });
          // Sulla pagina di scelta: si salvano e si mostra che cosa farne.
          return salva(files).then(function () { location.reload(); });
        });
      });
    }
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'complete') avviaPagina();
    else window.addEventListener('load', avviaPagina);
  }

  return {
    genere: genere,
    azioni: azioni,
    stessoGenere: stessoGenere,
    scaduto: scaduto,
    salva: salva,
    leggi: leggi,
    svuota: svuota,
    DURATA_MS: DURATA_MS
  };
});
