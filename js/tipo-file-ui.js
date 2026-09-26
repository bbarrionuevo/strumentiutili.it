// js/tipo-file-ui.js — Interfaccia di "Che file è?".
//
// Il riconoscimento sta in js/tipo-file.js; qui si legge il file, si mostra
// il risultato e si offre il passo dopo: scaricarlo con l'estensione giusta,
// vederne un'anteprima, aprirlo con uno strumento del sito.
//
// Tutto succede nel browser. Due regole di sicurezza valgono per tutto il
// file:
//   - il nome e il contenuto del file entrano nella pagina solo come testo
//     (textContent), mai come HTML;
//   - un file HTML, SVG o XML non si apre mai in una scheda da un indirizzo
//     blob: avrebbe l'origine di questo sito e i suoi script partirebbero
//     qui. Si mostra come testo e si scarica come file generico.
(function () {
  'use strict';

  var T = window.TipoFile;
  var input = document.getElementById('tf-file');
  var esito = document.getElementById('tf-esito');
  var risultato = document.getElementById('tf-risultato');
  if (!T || !input || !risultato) return;

  var PDF_JS = '/vendor/pdfjs@3.11.174/pdf.min.js';
  var PDF_WORKER = '/vendor/pdfjs@3.11.174/pdf.worker.min.js';
  var FFLATE = '/vendor/fflate@0.8.3/fflate.umd.js';
  var QUI = '/utilita-web/che-file-e/';

  // Oltre queste misure il file non si legge tutto in memoria.
  var MAX_INTERO = 150 * 1024 * 1024;     // buste .p7m, anteprima PDF
  var MAX_ZIP = 300 * 1024 * 1024;        // estrazione da un archivio
  var MAX_FOTO = 60 * 1024 * 1024;        // lettura dei dati EXIF

  var ICONE = {
    documento: '📄', firma: '🔏', posta: '✉️', fattura: '🧾',
    immagine: '🖼️', audio: '🎵', video: '🎬', archivio: '🗜️',
    programma: '⚙️', dati: '🗂️', testo: '📝', font: '🔤', altro: '❓'
  };

  // Con che strumento del sito si puo' continuare, per tipo riconosciuto
  // (i generi sono quelli di js/condivisi.js).
  var GENERE = {
    pdf: 'pdf', jpg: 'foto', png: 'foto',
    heic: 'immagine', webp: 'immagine', gif: 'immagine', bmp: 'immagine', avif: 'immagine',
    mp3: 'audio', m4a: 'audio', opus: 'audio', ogg: 'audio', wav: 'audio', flac: 'audio', aac: 'audio',
    mp4: 'video', docx: 'docx', p7m: 'p7m', fatturapa: 'xml', csv: 'studio', apkg: 'studio'
  };

  // Si possono aprire in una scheda senza rischi: il browser li mostra con
  // il suo visualizzatore, senza eseguire niente nella pagina.
  var IN_SCHEDA = { pdf: 1, jpg: 1, png: 1, gif: 1, webp: 1, bmp: 1, avif: 1, ico: 1,
    mp3: 1, m4a: 1, opus: 1, ogg: 1, wav: 1, flac: 1, aac: 1, mp4: 1, webm: 1, mov: 1,
    txt: 1, csv: 1, json: 1 };
  var MAI_IN_SCHEDA = { html: 1, svg: 1, xml: 1, fatturapa: 1, daticert: 1, gpx: 1, kml: 1 };

  var url = [];          // indirizzi blob da liberare al prossimo file
  var corrente = null;   // { file, r }
  var giro = 0;          // cambia a ogni file: i lavori in ritardo del file prima si scartano

  // ------------------------------------------------------------ utilita'

  function crea(tag, classe, testo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo != null) e.textContent = testo;
    return e;
  }

  function blobUrl(dati, mime) {
    var u = URL.createObjectURL(dati instanceof Blob && !mime ? dati : new Blob([dati], { type: mime || '' }));
    url.push(u);
    return u;
  }

  function liberaUrl() {
    url.forEach(function (u) { URL.revokeObjectURL(u); });
    url = [];
  }

  function leggi(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onload = function () { ok(new Uint8Array(fr.result)); };
      fr.onerror = function () { ko(fr.error); };
      fr.readAsArrayBuffer(blob);
    });
  }

  var script = {};
  function caricaScript(src, globale) {
    if (window[globale]) return Promise.resolve(window[globale]);
    if (!script[src]) {
      script[src] = new Promise(function (ok, ko) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () { window[globale] ? ok(window[globale]) : ko(new Error(globale)); };
        s.onerror = function () { delete script[src]; ko(new Error(globale)); };
        document.head.appendChild(s);
      });
    }
    return script[src];
  }

  function carta(etichetta) {
    var s = crea('section', 'bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6');
    if (etichetta) s.appendChild(crea('h3', 'text-lg font-bold text-gray-900 mb-3', etichetta));
    return s;
  }

  function nota(testo, colore) {
    var c = colore === 'rosso' ? 'border-red-500 bg-red-50 text-red-900'
      : colore === 'verde' ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
      : 'border-amber-500 bg-amber-50 text-amber-900';
    return crea('p', 'mt-3 border-l-4 ' + c + ' p-3 rounded-r-lg text-sm leading-relaxed', testo);
  }

  function grave(avviso, r) {
    return r.tipo.categoria === 'programma' || /Non aprirlo|macro|chiave privata|truff/i.test(avviso);
  }

  // ------------------------------------------------------------ lettura

  // Inizio e fine del file bastano quasi sempre; le buste di firma e il
  // base64 vanno lette per intero, perche' il documento e' dentro.
  function riconosciFile(file) {
    var dim = file.size;
    return leggi(file.slice(0, T.INIZIO)).then(function (inizio) {
      var testa = String.fromCharCode.apply(null, inizio.subarray(0, 40)).trim();
      var busta = inizio[0] === 0x30 || /^(-----BEGIN (PKCS7|CMS)-----|MI[A-Za-z0-9+/])/.test(testa);
      if (busta && dim > inizio.length && dim <= MAX_INTERO) {
        return leggi(file).then(function (tutto) { return { inizio: tutto, fine: null }; });
      }
      if (dim <= inizio.length) return { inizio: inizio, fine: null };
      return leggi(file.slice(Math.max(0, dim - T.FINE))).then(function (fine) { return { inizio: inizio, fine: fine }; });
    }).then(function (b) {
      var r = T.riconosci(b.inizio, { fine: b.fine, dimensione: dim, nome: file.name, P7m: window.P7mLettura });
      r.inizioLetto = b.inizio;
      return r;
    });
  }

  function attuale(g) { return g === giro; }

  function gestisci(file, origine) {
    var g = ++giro;
    liberaUrl();
    risultato.textContent = '';
    corrente = null;
    if (!file) { esito.textContent = ''; return; }
    esito.textContent = 'Sto leggendo ' + file.name + '…';
    riconosciFile(file).then(function (r) {
      if (!attuale(g)) return;
      esito.textContent = '';
      corrente = { file: file, r: r };
      mostra(file, r, origine);
    }).catch(function () {
      if (!attuale(g)) return;
      esito.textContent = '';
      risultato.appendChild(nota('Non è stato possibile leggere il file. Se è su una chiavetta o in una cartella condivisa, copialo prima sul dispositivo e riprova.', 'rosso'));
    });
  }

  // ------------------------------------------------------------ risultato

  function mostra(file, r, origine) {
    var tipo = r.tipo;
    var scheda = crea('section', 'bg-white rounded-xl shadow-sm border border-indigo-100 p-6');
    scheda.setAttribute('aria-labelledby', 'tf-titolo');
    var testa = crea('div', 'flex items-start gap-4');
    testa.appendChild(crea('span', 'text-4xl leading-none shrink-0', ICONE[tipo.categoria] || ICONE.altro)).setAttribute('aria-hidden', 'true');
    var nomi = crea('div', 'min-w-0');
    var h = crea('h3', 'text-sm font-semibold text-indigo-700 focus:outline-none', 'Questo file è');
    h.id = 'tf-titolo';
    h.tabIndex = -1;
    nomi.appendChild(h);
    nomi.appendChild(crea('p', 'text-2xl font-bold text-gray-900 leading-tight', tipo.nome));
    nomi.appendChild(crea('p', 'mt-1 text-sm text-gray-600 break-all', file.name + (origine ? ' · estratto da ' + origine : '')));
    testa.appendChild(nomi);
    scheda.appendChild(testa);

    r.avvisi.forEach(function (a) { scheda.appendChild(nota(a, grave(a, r) ? 'rosso' : 'giallo')).setAttribute('role', grave(a, r) ? 'alert' : 'note'); });

    var dl = crea('dl', 'mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3');
    dl.id = 'tf-dettagli';
    r.dettagli.forEach(function (d) { dl.appendChild(voce(d[0], d[1])); });
    if (tipo.mime && tipo.id !== 'bin' && tipo.id !== 'vuoto') dl.appendChild(voce('Tipo tecnico (MIME)', tipo.mime));
    scheda.appendChild(dl);

    if (tipo.apri) {
      var apri = crea('p', 'mt-4 text-sm text-gray-800 leading-relaxed');
      apri.appendChild(crea('strong', null, 'Con che cosa si apre: '));
      apri.appendChild(document.createTextNode(tipo.apri));
      scheda.appendChild(apri);
    }

    var bottoni = crea('div', 'mt-5 flex flex-wrap gap-3');
    var diverso = r.nomeSuggerito && r.nomeSuggerito !== file.name && tipo.estensione && tipo.id !== 'bin';
    if (diverso) {
      var scarica = crea('a', 'inline-block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl shadow-sm transition', 'Scarica come ' + r.nomeSuggerito);
      scarica.id = 'tf-scarica';
      // HTML, SVG e XML si scaricano come dati generici: non devono poter
      // diventare una pagina di questo sito
      scarica.href = blobUrl(file, MAI_IN_SCHEDA[tipo.id] ? 'application/octet-stream' : tipo.mime);
      scarica.download = r.nomeSuggerito;
      bottoni.appendChild(scarica);
    }
    if (IN_SCHEDA[tipo.id] && !MAI_IN_SCHEDA[tipo.id]) {
      var mime = tipo.categoria === 'testo' ? 'text/plain;charset=' + (r.testo && r.testo.decoder === 'utf-16le' ? 'utf-16le' : r.testo && r.testo.decoder === 'windows-1252' ? 'windows-1252' : 'utf-8') : tipo.mime;
      var scheda2 = crea('a', 'inline-block text-center bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold px-5 py-3 rounded-xl transition', 'Apri in una nuova scheda');
      scheda2.href = blobUrl(file.slice(0, file.size, mime));
      scheda2.target = '_blank';
      scheda2.rel = 'noopener';
      bottoni.appendChild(scheda2);
    }
    if (bottoni.childNodes.length) scheda.appendChild(bottoni);
    if (diverso && !T.estensioneDi(file.name)) {
      scheda.appendChild(crea('p', 'mt-3 text-xs text-gray-600', 'Il file non aveva estensione: per questo il telefono o il computer non sapevano con che programma aprirlo. Scaricato con il nome giusto, si apre con doppio clic.'));
    }
    risultato.appendChild(scheda);

    azioni(file, r);
    anteprima(file, r);
    esadecimale(r);

    h.focus({ preventScroll: false });
  }

  function voce(etichetta, valore) {
    var d = crea('div');
    d.appendChild(crea('dt', 'text-xs text-gray-500', etichetta));
    d.appendChild(crea('dd', 'text-sm text-gray-900 font-medium break-words', valore));
    return d;
  }

  function aggiungiDettaglio(g, etichetta, valore) {
    var dl = document.getElementById('tf-dettagli');
    if (dl && attuale(g)) dl.appendChild(voce(etichetta, valore));
  }

  // ------------------------------------------------------------ apri con

  function azioni(file, r) {
    var C = window.Condivisi;
    if (!C) return;
    var elenco = [];
    if (GENERE[r.tipo.id]) elenco = C.azioniPerGenere(GENERE[r.tipo.id]);
    if (r.tipo.id === 'p7m' && r.interno && r.interno.fattura) {
      elenco.push({ percorso: '/fisco-professioni/fattura-elettronica/', titolo: 'Leggere la fattura', descrizione: 'Visualizzare la fattura elettronica firmata' });
    }
    elenco = elenco.filter(function (a) { return a.percorso !== QUI; });
    if (!elenco.length) return;

    var s = carta('Continua con uno strumento del sito');
    s.appendChild(crea('p', 'text-sm text-gray-600 mb-3', 'Il file passa allo strumento già con il nome e il tipo giusti, senza uscire dal tuo dispositivo.'));
    var griglia = crea('div', 'grid gap-3 sm:grid-cols-2');
    griglia.id = 'tf-azioni';
    elenco.forEach(function (a) {
      var b = crea('button', 'text-left bg-white p-4 rounded-xl border border-gray-200 hover:border-indigo-400 hover:shadow-md transition');
      b.type = 'button';
      b.dataset.percorso = a.percorso;
      b.appendChild(crea('span', 'block font-bold text-gray-900', a.titolo));
      b.appendChild(crea('span', 'block text-sm text-gray-600 mt-1', a.descrizione));
      b.addEventListener('click', function () { passa(file, r, a.percorso); });
      griglia.appendChild(b);
    });
    s.appendChild(griglia);
    risultato.appendChild(s);
  }

  // Il file viene rinominato con l'estensione giusta e messo nel deposito
  // di js/condivisi.js; lo strumento lo trova con ?da=condivisi.
  function passa(file, r, percorso) {
    var nome = r.nomeSuggerito || file.name;
    var nuovo;
    try { nuovo = new File([file], nome, { type: r.tipo.mime }); } catch (e) { nuovo = file; }
    window.Condivisi.salva([nuovo]).then(function () {
      location.href = percorso + '?da=condivisi';
    }).catch(function () {
      esito.textContent = 'Il browser non permette di passare il file allo strumento (succede in navigazione privata): scaricalo con il nome giusto e sceglilo lì.';
    });
  }

  // ------------------------------------------------------------ anteprima

  function anteprima(file, r) {
    var c = r.tipo.categoria, id = r.tipo.id;
    if (id === 'pdf') return anteprimaPdf(file);
    if (c === 'immagine') { anteprimaImmagine(file, r); if (id === 'jpg' || id === 'png') datiFoto(file); return; }
    if (c === 'audio' || c === 'video') return anteprimaMedia(file, r);
    if (r.zip) return contenutoZip(file, r);
    if (id === 'p7m' && r.interno) return dentroBusta(r);
    if (r.testo && id !== 'pem_chiave') return anteprimaTesto(r, file);
  }

  function anteprimaImmagine(file, r) {
    var s = carta('Anteprima');
    var img = crea('img', 'max-h-96 max-w-full mx-auto rounded-lg border border-gray-200 bg-gray-50');
    img.alt = 'Anteprima dell’immagine';
    img.decoding = 'async';
    img.onerror = function () {
      img.remove();
      var testo = r.tipo.id === 'heic'
        ? 'Questo browser non sa mostrare le foto HEIC (lo fanno Safari su iPhone e Mac). Per vederla ovunque, convertila in JPG.'
        : 'Il browser non sa mostrare questo formato di immagine: aprila con il programma indicato sopra.';
      s.appendChild(crea('p', 'text-sm text-gray-700', testo));
    };
    // l'SVG in un <img> e' innocuo: il browser non ne esegue gli script
    img.src = blobUrl(file, r.tipo.mime);
    s.appendChild(img);
    risultato.appendChild(s);
  }

  function datiFoto(file) {
    if (!window.Exif || file.size > MAX_FOTO) return;
    var g = giro;
    leggi(file).then(function (b) {
      if (!attuale(g)) return;
      var a = window.Exif.analizza(b);
      if (!a) return;
      var x = a.riassunto || {};
      if (x.dispositivo) aggiungiDettaglio(g, 'Scattata con', x.dispositivo);
      var d = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(x.data || '');
      if (d) aggiungiDettaglio(g, 'Data dello scatto', d[3] + '/' + d[2] + '/' + d[1] + (d[4] ? ', ' + d[4] + ':' + d[5] : ''));
      if (!x.posizione) return;
      var s = carta('Attenzione: la foto dice dove è stata scattata');
      s.id = 'tf-gps';
      s.appendChild(crea('p', 'text-sm text-gray-800 leading-relaxed', 'Dentro la foto ci sono le coordinate GPS (' +
        String(x.posizione.lat).replace('.', ',') + '; ' + String(x.posizione.lon).replace('.', ',') +
        '). Chi la riceve può vedere il luogo, per esempio casa tua. Prima di pubblicarla o mandarla a sconosciuti, togli la posizione.'));
      var b2 = crea('button', 'mt-3 bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-3 rounded-xl shadow-sm transition', 'Togli la posizione e gli altri dati');
      b2.type = 'button';
      b2.addEventListener('click', function () { passa(file, corrente.r, '/utilita-web/rimuovi-dati-foto/'); });
      s.appendChild(b2);
      // subito sotto la scheda del risultato, prima delle altre sezioni
      var primo = risultato.firstChild;
      risultato.insertBefore(s, primo ? primo.nextSibling : null);
    }).catch(function () { /* niente dati: pazienza */ });
  }

  function anteprimaMedia(file, r) {
    var video = r.tipo.categoria === 'video';
    var g = giro;
    var s = carta(video ? 'Guarda il video' : 'Ascolta');
    var m = crea(video ? 'video' : 'audio', video ? 'w-full max-h-96 rounded-lg bg-black' : 'w-full');
    m.controls = true;
    m.preload = 'metadata';
    var durata = crea('p', 'mt-2 text-sm text-gray-600');
    m.addEventListener('loadedmetadata', function () {
      if (!isFinite(m.duration) || !m.duration) return;
      var sec = Math.round(m.duration);
      var t = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      durata.textContent = 'Durata: ' + t;
      aggiungiDettaglio(g, 'Durata', t);
      if (video && m.videoWidth) aggiungiDettaglio(g, 'Risoluzione', m.videoWidth + ' × ' + m.videoHeight);
    });
    m.addEventListener('error', function () {
      m.remove();
      durata.textContent = 'Questo browser non sa riprodurre il formato: usa il programma indicato sopra (VLC li apre quasi tutti).';
    });
    m.src = blobUrl(file, r.tipo.mime);
    s.appendChild(m);
    s.appendChild(durata);
    risultato.appendChild(s);
  }

  function anteprimaPdf(file) {
    if (file.size > MAX_INTERO) return;
    var g = giro;
    var s = carta('Prima pagina');
    var stato = crea('p', 'text-sm text-gray-600', 'Preparo l’anteprima…');
    s.appendChild(stato);
    risultato.appendChild(s);
    Promise.all([caricaScript(PDF_JS, 'pdfjsLib'), leggi(file)]).then(function (x) {
      var pdfjs = x[0];
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      return pdfjs.getDocument({ data: x[1], isEvalSupported: false }).promise;
    }).then(function (doc) {
      aggiungiDettaglio(g, 'Pagine', String(doc.numPages));
      return doc.getPage(1).then(function (p) {
        var base = p.getViewport({ scale: 1 });
        var larghezza = Math.min(900, Math.max(300, s.clientWidth - 48)) * (window.devicePixelRatio || 1);
        var vp = p.getViewport({ scale: larghezza / base.width });
        var tela = crea('canvas', 'max-w-full h-auto mx-auto border border-gray-200 rounded shadow-sm');
        tela.width = Math.round(vp.width);
        tela.height = Math.round(vp.height);
        tela.style.width = Math.round(vp.width / (window.devicePixelRatio || 1)) + 'px';
        tela.setAttribute('role', 'img');
        tela.setAttribute('aria-label', 'Anteprima della prima pagina del PDF');
        return p.render({ canvasContext: tela.getContext('2d'), viewport: vp }).promise.then(function () {
          stato.remove();
          s.appendChild(tela);
          doc.destroy();
        });
      });
    }).catch(function (e) {
      stato.textContent = e && e.name === 'PasswordException'
        ? 'Il PDF chiede una password per essere aperto: l’anteprima non si può fare senza.'
        : 'Non riesco a mostrare l’anteprima: il PDF potrebbe essere danneggiato. Prova ad aprirlo con il programma indicato sopra.';
    });
  }

  function anteprimaTesto(r, file) {
    var s = carta('Contenuto');
    var b = r.inizioLetto;
    var testo;
    try { testo = new TextDecoder(r.testo.decoder).decode(b.subarray(r.testo.salta, Math.min(b.length, 200000))); } catch (e) { testo = ''; }
    // un JSON intero si mostra rientrato, piu' facile da leggere
    if (r.tipo.id === 'json' && file.size <= b.length) {
      try { testo = JSON.stringify(JSON.parse(testo), null, 2); } catch (e) { /* si lascia com'e' */ }
    }
    var MAX = 20000;
    var tagliato = testo.length > MAX || file.size > b.length;
    var pre = crea('pre', 'max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800', testo.slice(0, MAX));
    pre.id = 'tf-testo';
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', 'Contenuto del file');
    s.appendChild(pre);
    if (tagliato) s.appendChild(crea('p', 'mt-2 text-xs text-gray-600', 'Qui c’è solo l’inizio del file. Per leggerlo tutto aprilo con il programma indicato sopra.'));
    risultato.appendChild(s);
  }

  function dentroBusta(r) {
    var s = carta('Dentro la busta di firma');
    var i = r.interno;
    s.appendChild(crea('p', 'text-sm text-gray-800', 'C’è ' + (i.tipo ? i.tipo.nome.toLowerCase() : 'un documento') + (i.nome ? ' («' + i.nome + '», ' + T.formatoDimensione(i.dimensione) + ')' : '') + '. Per estrarlo e vedere le firme usa «Aprire il file firmato» qui sopra.'));
    risultato.appendChild(s);
  }

  // ------------------------------------------------------------ archivi

  function contenutoZip(file, r) {
    var voci = r.zip.voci.filter(function (v) { return v.nome; });
    if (!voci.length) return;
    var semplice = r.tipo.id === 'zip';
    var s = carta(null);
    var titolo = semplice ? 'Che cosa c’è dentro' : 'Che cosa c’è dentro (per curiosi)';
    var contenitore = s;
    if (!semplice) {
      // per un .docx o un .apk l'elenco interessa poco: si apre a richiesta
      var det = crea('details');
      det.appendChild(crea('summary', 'cursor-pointer text-lg font-bold text-gray-900', titolo));
      s.appendChild(det);
      contenitore = det;
    } else {
      s.appendChild(crea('h3', 'text-lg font-bold text-gray-900 mb-3', titolo));
    }
    var MAX = 300;
    var lista = crea('ul', 'mt-2 divide-y divide-gray-100 text-sm max-h-96 overflow-auto');
    lista.id = 'tf-zip';
    voci.slice(0, MAX).forEach(function (v) {
      var li = crea('li', 'flex items-center justify-between gap-3 py-2');
      var cartella = /\/$/.test(v.nome);
      var nome = crea('span', 'min-w-0 break-all ' + (cartella ? 'text-gray-500' : 'text-gray-900'), v.nome);
      li.appendChild(nome);
      if (!cartella) {
        var destra = crea('span', 'shrink-0 flex items-center gap-2');
        destra.appendChild(crea('span', 'text-xs text-gray-500', T.formatoDimensione(v.dimensione)));
        if (file.size <= MAX_ZIP) {
          var esamina = crea('button', 'text-xs font-semibold text-indigo-700 hover:underline', 'Esamina');
          esamina.type = 'button';
          esamina.setAttribute('aria-label', 'Esamina ' + v.nome);
          esamina.addEventListener('click', function () { estrai(file, v.nome, esamina); });
          destra.appendChild(esamina);
        }
        li.appendChild(destra);
      }
      lista.appendChild(li);
    });
    contenitore.appendChild(lista);
    var totale = r.zip.totale != null ? r.zip.totale : voci.length;
    if (totale > MAX) contenitore.appendChild(crea('p', 'mt-2 text-xs text-gray-600', 'Sono mostrati i primi ' + MAX + ' elementi su ' + totale + '.'));
    else if (!r.zip.completo && r.zip.totale == null) contenitore.appendChild(crea('p', 'mt-2 text-xs text-gray-600', 'L’elenco potrebbe essere incompleto.'));
    risultato.appendChild(s);
  }

  // Estrae un file dall'archivio e lo esamina come se fosse stato scelto.
  function estrai(file, nome, bottone) {
    var prima = bottone.textContent;
    bottone.disabled = true;
    bottone.textContent = 'Apro…';
    Promise.all([caricaScript(FFLATE, 'fflate'), leggi(file)]).then(function (x) {
      var fuori = x[0].unzipSync(x[1], { filter: function (f) { return f.name === nome; } });
      if (!fuori[nome]) throw new Error('assente');
      var breve = nome.split('/').pop() || 'file';
      var f;
      try { f = new File([fuori[nome]], breve); } catch (e) { f = new Blob([fuori[nome]]); f.name = breve; }
      gestisci(f, file.name);
    }).catch(function () {
      bottone.disabled = false;
      bottone.textContent = prima;
      esito.textContent = 'Non riesco a estrarre «' + nome + '»: l’archivio potrebbe essere protetto da password o usare una compressione che il browser non conosce.';
    });
  }

  // ------------------------------------------------------------ byte

  function esadecimale(r) {
    var det = crea('details', 'bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6');
    det.open = r.tipo.id === 'bin';
    det.appendChild(crea('summary', 'cursor-pointer font-bold text-gray-900', 'I primi byte del file (per esperti)'));
    det.appendChild(crea('p', 'mt-2 text-xs text-gray-600', 'A sinistra la posizione, al centro i byte in esadecimale, a destra gli stessi byte come lettere. I primi byte di quasi ogni formato sono fissi: è da qui che si riconosce il tipo.'));
    var pre = crea('pre', 'mt-3 overflow-x-auto text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800', T.esadecimale(r.inizioLetto, 256) || '(file vuoto)');
    pre.id = 'tf-hex';
    pre.tabIndex = 0;
    det.appendChild(pre);
    risultato.appendChild(det);
  }

  // ------------------------------------------------------------ avvio

  input.addEventListener('change', function () {
    var files = window.StrumentiDropzone ? window.StrumentiDropzone.getInputFiles(input) : input.files;
    gestisci(files && files[0]);
  });

  if (window.StrumentiDropzone) {
    window.StrumentiDropzone.setup({ drop: 'tf-drop', input: 'tf-file', filename: 'tf-nome' });
  }
})();
