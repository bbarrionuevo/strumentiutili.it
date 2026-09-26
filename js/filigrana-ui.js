// js/filigrana-ui.js — "Proteggere la copia di un documento".
//
// Il disegno e i calcoli sono in js/filigrana.js. Qui: le foto e i PDF
// scelti (i PDF si leggono con pdf.js, caricato solo se serve), l'anteprima
// su cui si trascina per coprire una parte, e l'uscita in PDF (pdf-lib) o in
// JPG. Tutto resta nel browser; le foto rifatte con il canvas perdono i dati
// EXIF (posizione, telefono, data). Si ricordano solo le preferenze.
(function () {
  'use strict';

  var Fi = window.Filigrana;
  var el = function (id) { return document.getElementById(id); };
  var input = el('fil-file');
  if (!Fi || !input) return;

  var CHIAVE = 'su_filigrana';
  var PDF_JS = '/vendor/pdfjs@3.11.174/pdf.min.js';
  var PDF_WORKER = '/vendor/pdfjs@3.11.174/pdf.worker.min.js';
  var PDF_LIB = '/vendor/pdf-lib@1.17.1/pdf-lib.min.js';
  var MAX_PAGINE = 20;

  var pagine = [];      // { nome, sorgente (canvas o ImageBitmap), w, h, pt: [w,h] se da PDF, riquadri: [] }
  var scelta = 0;
  var tela = el('fil-anteprima');
  var ctx = tela.getContext('2d');
  var trascinamento = null;

  // ------------------------------------------------------------ preferenze

  function oggi() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  (function () {
    var sel = el('fil-finalita');
    Fi.FINALITA.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f.id;
      o.textContent = f.testo.charAt(0).toUpperCase() + f.testo.slice(1);
      sel.appendChild(o);
    });
    var altro = document.createElement('option');
    altro.value = 'altro';
    altro.textContent = 'Altro…';
    sel.appendChild(altro);
    el('fil-data').value = oggi();
    var s;
    try { s = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { s = null; }
    if (s && typeof s === 'object') {
      if (s.finalita && sel.querySelector('option[value="' + s.finalita + '"]')) sel.value = s.finalita;
      if (typeof s.colore === 'string') radio('fil-colore', s.colore);
      if (typeof s.dimensione === 'string') radio('fil-dimensione', s.dimensione);
      if (Number(s.opacita) >= 15 && Number(s.opacita) <= 60) el('fil-opacita').value = String(s.opacita);
    }
    el('fil-altro-blocco').hidden = sel.value !== 'altro';
  })();

  function radio(nome, valore) {
    var r = document.querySelector('input[name="' + nome + '"][value="' + valore + '"]');
    if (r) r.checked = true;
  }
  function valore(nome, predefinito) {
    var r = document.querySelector('input[name="' + nome + '"]:checked');
    return r ? r.value : predefinito;
  }

  function ricorda() {
    try {
      localStorage.setItem(CHIAVE, JSON.stringify({
        finalita: el('fil-finalita').value, colore: valore('fil-colore', 'grigio'),
        dimensione: valore('fil-dimensione', 'media'), opacita: Number(el('fil-opacita').value)
      }));
    } catch (e) { /* pazienza */ }
  }

  // Il destinatario e la finalita' scritta a mano non si salvano: sono dati
  // della pratica, non preferenze.
  function opzioni() {
    var f = el('fil-finalita').value;
    return {
      testo: Fi.testo({
        finalita: f === 'altro' ? el('fil-altro').value : f,
        destinatario: el('fil-destinatario').value,
        data: el('fil-data').value,
        avviso: el('fil-avviso').checked
      }),
      colore: valore('fil-colore', 'grigio'),
      dimensione: valore('fil-dimensione', 'media'),
      opacita: Number(el('fil-opacita').value) / 100
    };
  }

  function messaggio(testo, errore) {
    var e = el('fil-esito');
    e.textContent = testo;
    e.className = 'text-sm font-medium ' + (errore ? 'text-red-700' : 'text-emerald-700');
  }

  // ------------------------------------------------------------ lettura dei file

  function caricaScript(src, globale) {
    if (window[globale]) return Promise.resolve(window[globale]);
    return new Promise(function (risolvi, rifiuta) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { window[globale] ? risolvi(window[globale]) : rifiuta(new Error(globale)); };
      s.onerror = function () { rifiuta(new Error(globale)); };
      document.head.appendChild(s);
    });
  }

  function daImmagine(file) {
    var apri = window.createImageBitmap
      ? createImageBitmap(file, { imageOrientation: 'from-image' })
      : new Promise(function (ok, ko) {
        var img = new Image();
        img.onload = function () { ok(img); };
        img.onerror = ko;
        img.src = URL.createObjectURL(file);
      });
    return apri.then(function (im) {
      var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
      var m = Fi.scala(w, h, 2000);
      return [{ nome: file.name, sorgente: im, w: m.w, h: m.h, riquadri: [] }];
    });
  }

  function daPdf(file) {
    return caricaScript(PDF_JS, 'pdfjsLib').then(function (pdfjs) {
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      return file.arrayBuffer().then(function (b) { return pdfjs.getDocument({ data: new Uint8Array(b), isEvalSupported: false }).promise; });
    }).then(function (doc) {
      var n = Math.min(doc.numPages, MAX_PAGINE);
      var fuori = [];
      var catena = Promise.resolve();
      for (var i = 1; i <= n; i++) {
        (function (k) {
          catena = catena.then(function () { return doc.getPage(k); }).then(function (p) {
            var base = p.getViewport({ scale: 1 });
            var f = 2000 / Math.max(base.width, base.height);
            var vp = p.getViewport({ scale: f });
            var c = document.createElement('canvas');
            c.width = Math.round(vp.width);
            c.height = Math.round(vp.height);
            return p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
              fuori.push({ nome: file.name + ' · pagina ' + k, sorgente: c, w: c.width, h: c.height, pt: [base.width, base.height], riquadri: [] });
            });
          });
        })(i);
      }
      return catena.then(function () {
        if (doc.numPages > MAX_PAGINE) messaggio('Il PDF ha ' + doc.numPages + ' pagine: ne teniamo le prime ' + MAX_PAGINE + '.', true);
        return fuori;
      });
    });
  }

  function aggiungi(files) {
    var elenco = Array.prototype.slice.call(files || []);
    if (!elenco.length) return;
    messaggio('Apro ' + (elenco.length === 1 ? 'il file' : elenco.length + ' file') + '…');
    var catena = Promise.resolve();
    var saltati = [];
    elenco.forEach(function (f) {
      catena = catena.then(function () {
        var pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        return (pdf ? daPdf(f) : daImmagine(f)).then(function (nuove) {
          pagine = pagine.concat(nuove);
        }, function () { saltati.push(f.name); });
      });
    });
    catena.then(function () {
      if (saltati.length) {
        messaggio('Non riesco ad aprire ' + saltati.join(', ') + ': usa una foto JPG o PNG oppure un PDF. Le foto HEIC dell’iPhone si aprono con Safari.', true);
      } else messaggio('');
      if (pagine.length) scelta = Math.min(scelta, pagine.length - 1);
      aggiorna();
    });
  }

  // ------------------------------------------------------------ anteprima

  function disegnaAnteprima() {
    var p = pagine[scelta];
    el('fil-lavoro').hidden = !p;
    if (!p) return;
    tela.width = p.w;
    tela.height = p.h;
    var riquadri = p.riquadri.slice();
    if (trascinamento && trascinamento.corrente) riquadri.push(trascinamento.corrente);
    var o = opzioni();
    o.riquadri = riquadri;
    Fi.disegna(ctx, p.sorgente, p.w, p.h, o);
    el('fil-anteprima-nome').textContent = p.nome;
    el('fil-annulla-riquadro').disabled = !p.riquadri.length;
  }

  function disegnaMiniature() {
    var box = el('fil-pagine');
    box.textContent = '';
    pagine.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'relative shrink-0 w-20 h-20 rounded-lg border-2 overflow-hidden bg-gray-100 ' + (i === scelta ? 'border-indigo-600' : 'border-gray-200');
      b.setAttribute('aria-label', 'Modifica ' + p.nome + (p.riquadri.length ? ', ' + p.riquadri.length + ' parti coperte' : ''));
      b.setAttribute('aria-pressed', i === scelta ? 'true' : 'false');
      var c = document.createElement('canvas');
      var m = Fi.scala(p.w, p.h, 160);
      c.width = m.w;
      c.height = m.h;
      c.className = 'w-full h-full object-contain';
      c.getContext('2d').drawImage(p.sorgente, 0, 0, m.w, m.h);
      b.appendChild(c);
      b.addEventListener('click', function () { scelta = i; aggiorna(); });
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-white/90 text-gray-800 text-sm font-bold leading-6 shadow';
      x.textContent = '×';
      x.setAttribute('aria-label', 'Togli ' + p.nome);
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        pagine.splice(i, 1);
        scelta = Math.max(0, Math.min(scelta, pagine.length - 1));
        aggiorna();
      });
      var box2 = document.createElement('div');
      box2.className = 'relative';
      box2.appendChild(b);
      box2.appendChild(x);
      el('fil-pagine').appendChild(box2);
    });
    el('fil-insieme-blocco').hidden = pagine.filter(function (p) { return !p.pt; }).length < 2;
  }

  var inAttesa = false;
  function aggiorna() {
    if (inAttesa) return;
    inAttesa = true;
    requestAnimationFrame(function () {
      inAttesa = false;
      disegnaMiniature();
      disegnaAnteprima();
    });
  }

  // Trascinare sull'anteprima: un riquadro nero.
  function punto(e) {
    var r = tela.getBoundingClientRect();
    return { x: (e.clientX - r.left) * tela.width / r.width, y: (e.clientY - r.top) * tela.height / r.height };
  }
  tela.addEventListener('pointerdown', function (e) {
    if (!pagine[scelta]) return;
    tela.setPointerCapture(e.pointerId);
    var p = punto(e);
    trascinamento = { x: p.x, y: p.y, corrente: null };
    e.preventDefault();
  });
  tela.addEventListener('pointermove', function (e) {
    if (!trascinamento) return;
    var p = punto(e), pg = pagine[scelta];
    trascinamento.corrente = Fi.riquadro(trascinamento.x, trascinamento.y, p.x, p.y, pg.w, pg.h);
    disegnaAnteprima();
  });
  function fine() {
    if (!trascinamento) return;
    if (trascinamento.corrente) pagine[scelta].riquadri.push(trascinamento.corrente);
    trascinamento = null;
    aggiorna();
  }
  tela.addEventListener('pointerup', fine);
  tela.addEventListener('pointercancel', function () { trascinamento = null; aggiorna(); });

  el('fil-annulla-riquadro').addEventListener('click', function () {
    if (pagine[scelta]) { pagine[scelta].riquadri.pop(); aggiorna(); }
  });

  // ------------------------------------------------------------ uscita

  function pagineProtette(tipo, qualita) {
    var o = opzioni();
    return pagine.reduce(function (catena, p) {
      return catena.then(function (fuori) {
        var c = document.createElement('canvas');
        c.width = p.w;
        c.height = p.h;
        Fi.disegna(c.getContext('2d'), p.sorgente, p.w, p.h, Object.assign({}, o, { riquadri: p.riquadri }));
        return new Promise(function (ok) { c.toBlob(ok, tipo, qualita); }).then(function (b) {
          fuori.push({ blob: b, pagina: p });
          return fuori;
        });
      });
    }, Promise.resolve([]));
  }

  function creaPdf() {
    return Promise.all([caricaScript(PDF_LIB, 'PDFLib'), pagineProtette('image/jpeg', 0.85)]).then(function (r) {
      var PDFLib = r[0], fatte = r[1];
      return PDFLib.PDFDocument.create().then(function (doc) {
        doc.setTitle('Copia protetta');
        doc.setCreator('StrumentiUtili.it');
        var insieme = el('fil-insieme').checked;
        // Le foto vanno su fogli A4 (anche due per foglio); le pagine dei PDF
        // restano della loro misura.
        var i = 0;
        function passo() {
          if (i >= fatte.length) return Promise.resolve();
          var f = fatte[i];
          if (f.pagina.pt) {
            i++;
            return f.blob.arrayBuffer().then(function (b) { return doc.embedJpg(b); }).then(function (img) {
              var pg = doc.addPage(f.pagina.pt);
              pg.drawImage(img, { x: 0, y: 0, width: f.pagina.pt[0], height: f.pagina.pt[1] });
            }).then(passo);
          }
          var gruppo = [];
          while (i < fatte.length && !fatte[i].pagina.pt && gruppo.length < (insieme ? 2 : 1)) gruppo.push(fatte[i++]);
          var foglio = Fi.impagina(gruppo.map(function (g) { return { w: g.pagina.w, h: g.pagina.h }; }), insieme)[0];
          var pg = doc.addPage(Fi.A4);
          return Promise.all(gruppo.map(function (g) { return g.blob.arrayBuffer().then(function (b) { return doc.embedJpg(b); }); }))
            .then(function (imgs) {
              foglio.forEach(function (pos, k) { pg.drawImage(imgs[k], { x: pos.x, y: pos.y, width: pos.w, height: pos.h }); });
            }).then(passo);
        }
        return passo().then(function () { return doc.save(); });
      });
    }).then(function (byte) {
      return [new File([byte], 'documento-protetto.pdf', { type: 'application/pdf' })];
    });
  }

  function creaJpg() {
    return pagineProtette('image/jpeg', 0.88).then(function (fatte) {
      return fatte.map(function (f, i) {
        return new File([f.blob], 'documento-protetto' + (fatte.length > 1 ? '-' + (i + 1) : '') + '.jpg', { type: 'image/jpeg' });
      });
    });
  }

  function crea() {
    if (!pagine.length) { messaggio('Scegli prima una foto o un PDF del documento.', true); return Promise.reject(new Error('vuoto')); }
    ricorda();
    messaggio('Preparo la copia protetta…');
    return valore('fil-formato', 'pdf') === 'jpg' ? creaJpg() : creaPdf();
  }

  function scarica(files) {
    files.forEach(function (f, i) {
      setTimeout(function () {
        var url = URL.createObjectURL(f);
        var a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      }, i * 400);
    });
  }

  el('fil-scarica').addEventListener('click', function () {
    crea().then(function (files) {
      scarica(files);
      messaggio('Fatto: ' + files.map(function (f) { return f.name; }).join(', ') + '. Controlla la copia prima di inviarla.');
      if (window.Prossimo) window.Prossimo.offri(files, { dopo: el('fil-esito') });
    }).catch(function (e) { if (e.message !== 'vuoto') messaggio('Qualcosa non ha funzionato. Riprova; se sei senza connessione, la prima volta serve scaricare il programma che crea il PDF.', true); });
  });

  el('fil-condividi').addEventListener('click', function () {
    crea().then(function (files) {
      if (navigator.canShare && navigator.canShare({ files: files })) {
        return navigator.share({ files: files }).then(function () { messaggio('Condivisa.'); }, function () { messaggio(''); });
      }
      scarica(files);
      messaggio('Da questo browser non si può condividere un file: l’abbiamo scaricato, allegalo al messaggio.');
    }).catch(function (e) { if (e.message !== 'vuoto') messaggio('Qualcosa non ha funzionato. Riprova.', true); });
  });

  // ------------------------------------------------------------ comandi

  input.addEventListener('change', function () { aggiungi(input.files); input.value = ''; });
  el('fil-finalita').addEventListener('change', function () {
    el('fil-altro-blocco').hidden = this.value !== 'altro';
    if (this.value === 'altro') el('fil-altro').focus();
  });
  ['fil-finalita', 'fil-altro', 'fil-destinatario', 'fil-data', 'fil-avviso', 'fil-opacita'].forEach(function (id) {
    el(id).addEventListener('input', aggiorna);
    el(id).addEventListener('change', aggiorna);
  });
  document.querySelectorAll('input[name="fil-colore"], input[name="fil-dimensione"]').forEach(function (r) {
    r.addEventListener('change', function () { ricorda(); aggiorna(); });
  });
  el('fil-opacita').addEventListener('change', ricorda);
  el('fil-finalita').addEventListener('change', ricorda);

  // Trascinare i file sulla zona di scelta.
  var zona = el('fil-zona');
  ['dragenter', 'dragover'].forEach(function (t) {
    zona.addEventListener(t, function (e) { e.preventDefault(); zona.classList.add('border-indigo-500', 'bg-indigo-50'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    zona.addEventListener(t, function () { zona.classList.remove('border-indigo-500', 'bg-indigo-50'); });
  });
  zona.addEventListener('drop', function (e) { e.preventDefault(); aggiungi(e.dataTransfer.files); });

  aggiorna();
})();
