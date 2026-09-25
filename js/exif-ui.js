// js/exif-ui.js — "Togliere i dati nascosti dalle foto".
//
// Il lavoro e' in js/exif.js: legge cosa rivela ogni foto e taglia via i
// blocchi dei dati senza ricomprimere. Qui: scelta dei file, schede con
// quello che si e' trovato, scarica o condividi le foto pulite. Nessun dato
// esce dal browser; il link alla mappa si apre solo se lo tocchi.
(function () {
  'use strict';

  var X = window.Exif;
  var el = function (id) { return document.getElementById(id); };
  var input = el('exf-file');
  if (!X || !input) return;

  var foto = [];   // { file, byte, analisi, pulita: Uint8Array|null, url }

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function peso(n) {
    return n < 1024 ? n + ' byte' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0).replace('.', ',') + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
  }

  function numero(n, cifre) { return n.toFixed(cifre).replace('.', ','); }

  function quando(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(t || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] + ' alle ' + m[4] + ':' + m[5] : t;
  }

  var NOMI_BLOCCHI = { exif: 'EXIF', xmp: 'XMP', iptc: 'IPTC', commento: 'commento', produttore: 'dati del produttore', testo: 'testi', data: 'data di modifica', app0: 'dati extra', app1: 'dati extra', app2: 'dati extra' };

  function scheda(f, i) {
    var a = f.analisi;
    var r = a ? a.riassunto : {};
    var righe = [];
    if (r.posizione) {
      var p = r.posizione;
      righe.push(['📍', 'Dove', numero(p.lat, 5) + ', ' + numero(p.lon, 5) + (typeof p.altitudine === 'number' ? ' · ' + p.altitudine + ' m di altitudine' : '') +
        ' · <a class="text-indigo-700 underline" target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat=' + p.lat + '&amp;mlon=' + p.lon + '#map=17/' + p.lat + '/' + p.lon + '">vedi sulla mappa</a>']);
    }
    if (r.data) righe.push(['🕒', 'Quando', esc(quando(r.data))]);
    if (r.dispositivo) righe.push(['📱', 'Con che cosa', esc(r.dispositivo) + (r.obiettivo ? ' · ' + esc(r.obiettivo) : '')]);
    if (r.autore) righe.push(['✍️', 'Autore', esc(r.autore)]);
    if (r.seriale) righe.push(['🔢', 'Numero di serie', esc(r.seriale)]);
    if (r.software) righe.push(['💻', 'Programma', esc(r.software)]);
    if (r.miniatura) righe.push(['🖼️', 'Miniatura', 'una copia piccola della foto originale, anche se l’hai ritagliata']);
    var altri = a ? a.blocchi.map(function (b) { return NOMI_BLOCCHI[b.tipo] || b.tipo; }).filter(function (n, k, v) { return v.indexOf(n) === k; }) : [];
    var datiByte = a ? a.blocchi.reduce(function (t, b) { return t + b.byte; }, 0) : 0;

    var stato, colore;
    if (!a) { stato = 'Formato non supportato: qui si puliscono JPG e PNG. Per HEIC o WebP usa <a class="underline" href="/utilita-web/convertitore-immagini/">Converti immagini</a>, che toglie i dati ricreando la foto.'; colore = 'border-gray-200 bg-gray-50 text-gray-700'; }
    else if (f.pulita) {
      var tolti = f.byte.length - f.pulita.length;
      stato = tolti > 0 ? '✓ Pulita: tolti ' + peso(tolti) + ' di dati, qualità identica.' : '✓ Non c’era niente da togliere.';
      colore = 'border-emerald-200 bg-emerald-50 text-emerald-900';
    }
    else if (r.posizione) { stato = 'Questa foto dice dove l’hai scattata.'; colore = 'border-red-200 bg-red-50 text-red-800'; }
    else if (righe.length || altri.length) { stato = 'Contiene dati che non si vedono.'; colore = 'border-amber-200 bg-amber-50 text-amber-900'; }
    else { stato = 'Nessun dato nascosto: puoi inviarla così.'; colore = 'border-emerald-200 bg-emerald-50 text-emerald-900'; }

    return '<li class="rounded-xl border ' + colore + ' p-4">' +
      '<div class="flex gap-3 items-start">' +
      '<img src="' + f.url + '" alt="" class="w-16 h-16 shrink-0 rounded-lg object-cover bg-white border border-gray-200" />' +
      '<div class="min-w-0 flex-1">' +
      '<p class="font-semibold text-gray-900 truncate">' + esc(f.file.name) + '</p>' +
      '<p class="text-xs text-gray-500">' + peso(f.byte.length) + '</p>' +
      '<p class="text-sm font-semibold mt-0.5">' + stato + '</p>' +
      '</div>' +
      '<button type="button" data-togli="' + i + '" class="shrink-0 w-8 h-8 rounded-full text-gray-500 hover:bg-white" aria-label="Togli ' + esc(f.file.name) + '">×</button>' +
      '</div>' +
      (righe.length && !f.pulita ? '<dl class="mt-3 space-y-1.5 text-sm text-gray-800">' + righe.map(function (x) {
        return '<div class="flex gap-2"><dt class="shrink-0"><span aria-hidden="true">' + x[0] + '</span> <span class="font-semibold">' + x[1] + ':</span></dt><dd class="min-w-0 break-words">' + x[2] + '</dd></div>';
      }).join('') + '</dl>' : '') +
      (altri.length && !f.pulita ? '<p class="mt-2 text-xs text-gray-600">Blocchi di dati: ' + altri.join(', ') + ' (' + peso(datiByte) + ')</p>' : '') +
      '</li>';
  }

  function disegna() {
    var elenco = el('exf-elenco');
    elenco.innerHTML = foto.map(scheda).join('');
    // HEIC e simili: il browser non sa mostrarli, meglio un riquadro vuoto dell'icona rotta
    Array.prototype.forEach.call(elenco.querySelectorAll('img'), function (img) {
      img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
    });
    var pulibili = foto.filter(function (f) { return f.analisi; });
    el('exf-azioni').hidden = !pulibili.length;
    var fatte = pulibili.length && pulibili.every(function (f) { return f.pulita; });
    el('exf-pulisci').hidden = !!fatte;
    el('exf-scarica').hidden = !fatte;
    el('exf-condividi').hidden = !fatte;
    var conPosizione = pulibili.filter(function (f) { return f.analisi.riassunto.posizione && !f.pulita; }).length;
    el('exf-riepilogo').textContent = !pulibili.length ? '' : fatte
      ? (pulibili.length === 1 ? 'La foto è pulita.' : 'Le ' + pulibili.length + ' foto sono pulite.')
      : conPosizione ? conPosizione + (conPosizione === 1 ? ' foto rivela' : ' foto rivelano') + ' dove sono state scattate.' : '';
    if (window.Prossimo) {
      if (fatte) window.Prossimo.offri(filePuliti(), { dopo: el('exf-riepilogo') });
      else window.Prossimo.togli();
    }
  }

  function aggiungi(files) {
    var elenco = Array.prototype.slice.call(files || []);
    Promise.all(elenco.map(function (file) {
      return file.arrayBuffer().then(function (buf) {
        var byte = new Uint8Array(buf);
        return { file: file, byte: byte, analisi: X.analizza(byte), pulita: null, url: URL.createObjectURL(file) };
      });
    })).then(function (nuove) {
      foto = foto.concat(nuove);
      disegna();
    });
  }

  function pulisci() {
    var orientamento = el('exf-orientamento').checked;
    foto.forEach(function (f) {
      if (!f.analisi) return;
      try { f.pulita = X.pulisci(f.byte, { orientamento: orientamento }); } catch (e) { f.analisi = null; }
    });
    disegna();
  }

  function filePuliti() {
    return foto.filter(function (f) { return f.pulita; }).map(function (f) {
      return new File([f.pulita], f.file.name, { type: f.file.type || (X.tipo(f.pulita) === 'png' ? 'image/png' : 'image/jpeg') });
    });
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

  input.addEventListener('change', function () { aggiungi(input.files); input.value = ''; });
  el('exf-pulisci').addEventListener('click', pulisci);
  el('exf-scarica').addEventListener('click', function () { scarica(filePuliti()); });
  el('exf-condividi').addEventListener('click', function () {
    var files = filePuliti();
    if (navigator.canShare && navigator.canShare({ files: files })) navigator.share({ files: files }).catch(function () {});
    else scarica(files);
  });
  el('exf-orientamento').addEventListener('change', function () {
    if (foto.some(function (f) { return f.pulita; })) pulisci();
  });
  el('exf-elenco').addEventListener('click', function (e) {
    var b = e.target.closest('[data-togli]');
    if (!b) return;
    var i = Number(b.getAttribute('data-togli'));
    URL.revokeObjectURL(foto[i].url);
    foto.splice(i, 1);
    disegna();
  });

  var zona = el('exf-zona');
  ['dragenter', 'dragover'].forEach(function (t) {
    zona.addEventListener(t, function (e) { e.preventDefault(); zona.classList.add('border-indigo-500', 'bg-indigo-50'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    zona.addEventListener(t, function () { zona.classList.remove('border-indigo-500', 'bg-indigo-50'); });
  });
  zona.addEventListener('drop', function (e) { e.preventDefault(); aggiungi(e.dataTransfer.files); });
})();
