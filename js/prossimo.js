// js/prossimo.js — "E adesso?": dopo un risultato, il passo successivo.
//
// Chi ha appena trasformato le foto in PDF spesso deve anche comprimerlo o
// firmarlo; chi ha scritto una disdetta la deve firmare. Sotto il risultato
// compaiono i due o tre passi piu' probabili: il file appena creato passa
// allo strumento scelto senza doverlo cercare di nuovo nella cartella dei
// download.
//
// Il passaggio usa lo stesso deposito della condivisione (js/condivisi.js):
// il file va in IndexedDB, sul dispositivo, e lo strumento successivo lo
// trova con ?da=condivisi. Nessun server, e i file scadono dopo un'ora.
// Funziona nel browser (window.Prossimo) e in Node (solo la parte pura).
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Prossimo = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';

  var COMPRIMI = '/pdf/comprimi-pdf/';
  var FIRMA = '/pdf/firma/';
  var UNISCI = '/pdf/unisci-pdf/';
  var PDFA = '/pdf/convertitore-pdfa/';
  var JPG_PDF = '/pdf/jpg-in-pdf/';
  var PROTEGGI = '/identita-burocrazia/proteggi-documento/';
  var DATI_FOTO = '/utilita-web/rimuovi-dati-foto/';

  // I passi sensati dopo ciascuno strumento, in ordine. Si mostrano solo
  // quelli adatti al file creato (un PDF non va a "Creare un PDF").
  var SEGUITI = {
    '/pdf/jpg-in-pdf/': [COMPRIMI, FIRMA, UNISCI],
    '/pdf/scanner-documenti/': [COMPRIMI, FIRMA, PROTEGGI],
    '/pdf/word-in-pdf/': [FIRMA, COMPRIMI, PDFA],
    '/pdf/unisci-pdf/': [COMPRIMI, FIRMA, PDFA],
    '/pdf/dividi-pdf/': [COMPRIMI, FIRMA, UNISCI],
    '/pdf/comprimi-pdf/': [FIRMA, UNISCI, PDFA],
    '/pdf/firma/': [COMPRIMI, UNISCI, PDFA],
    '/pdf/anonimizza/': [COMPRIMI, PROTEGGI, UNISCI],
    '/identita-burocrazia/proteggi-documento/': [COMPRIMI, UNISCI, JPG_PDF],
    '/utilita-web/rimuovi-dati-foto/': [JPG_PDF, PROTEGGI],
    // la conversione ricrea l'immagine, che non ha piu' dati EXIF
    '/utilita-web/convertitore-immagini/': [JPG_PDF, PROTEGGI]
  };

  // Per gli strumenti che creano un documento da firmare (disdetta,
  // autocertificazione, ricevuta, dimissioni) e per quelli non elencati.
  var PER_GENERE = {
    pdf: [FIRMA, UNISCI, COMPRIMI],
    foto: [JPG_PDF, DATI_FOTO]
  };

  /**
   * I passi da proporre dopo lo strumento in "percorso" per questi file.
   * @param {string} percorso  la pagina attuale
   * @param {{name:string,type:string}[]} files  i file appena creati
   * @param {object} condivisi  js/condivisi.js (per il genere dei file e le descrizioni)
   * @param {number} [max]
   * @returns {{percorso:string,titolo:string,descrizione:string}[]}
   */
  function passi(percorso, files, condivisi, max) {
    if (!files || !files.length || !condivisi) return [];
    var pagina = String(percorso || '').replace(/index\.html$/, '');
    var possibili = condivisi.azioni(condivisi.stessoGenere(files));
    var ordine = SEGUITI[pagina] || PER_GENERE[condivisi.genere(files[0])] || [];
    var scelti = [];
    ordine.forEach(function (p) {
      if (p === pagina) return;
      possibili.forEach(function (a) { if (a.percorso === p && scelti.indexOf(a) === -1) scelti.push(a); });
    });
    return scelti.slice(0, max || 3);
  }

  // ------------------------------------------------------------ pagina

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // js/condivisi.js c'e' gia' sulle pagine che ricevono file; le altre (i
  // generatori di documenti) lo caricano solo quando serve.
  var caricamento = null;
  function condivisi() {
    if (root.Condivisi) return Promise.resolve(root.Condivisi);
    if (!caricamento) {
      caricamento = new Promise(function (ok) {
        var s = document.createElement('script');
        s.src = '/js/condivisi.js';
        s.onload = function () { ok(root.Condivisi || null); };
        s.onerror = function () { caricamento = null; ok(null); };
        document.head.appendChild(s);
      });
    }
    return caricamento;
  }

  var giro = 0;
  var zona = null;   // la parte della pagina che ha prodotto il file

  function togli() {
    giro++;
    var vecchio = document.getElementById('su-prossimo');
    if (vecchio) vecchio.remove();
  }

  function vai(files, destinazione, C) {
    C.salva(files).then(function () {
      location.href = destinazione + '?da=condivisi';
    }, function () {
      // Senza IndexedDB (alcune finestre anonime) si apre lo strumento vuoto.
      location.href = destinazione;
    });
  }

  /**
   * Mostra "E adesso?" dopo l'elemento indicato.
   * @param {File[]} files  i file appena creati
   * @param {{ dopo: Element, max?: number }} o
   */
  function offri(files, o) {
    togli();
    var mio = giro;
    var opzioni = o || {};
    var elenco = Array.prototype.slice.call(files || []);
    if (!elenco.length || !opzioni.dopo) return Promise.resolve(null);
    return condivisi().then(function (C) {
      if (mio !== giro || !C) return null;
      var scelti = passi(location.pathname, elenco, C, opzioni.max);
      if (!scelti.length) return null;
      var uno = elenco.length === 1;
      var box = document.createElement('aside');
      box.id = 'su-prossimo';
      box.setAttribute('aria-labelledby', 'su-prossimo-titolo');
      box.className = '@container mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-left';
      box.innerHTML = '<h3 id="su-prossimo-titolo" class="font-bold text-gray-900">E adesso?</h3>' +
        '<p class="text-sm text-gray-600 mt-0.5">Continua con ' + (uno ? 'lo stesso file, senza sceglierlo' : 'gli stessi file, senza sceglierli') + ' di nuovo.</p>' +
        // tre colonne solo se c'e' spazio nel riquadro, non nella finestra
        '<ul class="mt-3 grid gap-2 @lg:grid-cols-3">' + scelti.map(function (a) {
          return '<li><a href="' + esc(a.percorso) + '" data-prossimo class="flex h-full flex-col rounded-lg border border-indigo-200 bg-white p-3 hover:border-indigo-400 hover:shadow-sm transition">' +
            '<span class="font-semibold text-indigo-800">' + esc(a.titolo) + ' <span aria-hidden="true">&rarr;</span></span>' +
            '<span class="text-xs text-gray-600 mt-0.5">' + esc(a.descrizione) + '</span></a></li>';
        }).join('') + '</ul>';
      box.addEventListener('click', function (e) {
        var a = e.target.closest('a[data-prossimo]');
        // con Ctrl, Cmd o il tasto centrale si apre lo strumento vuoto in un'altra scheda
        if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        vai(elenco, a.getAttribute('href'), C);
      });
      opzioni.dopo.insertAdjacentElement('afterend', box);
      if (box.nextElementSibling) box.classList.add('mb-5');
      zona = opzioni.dopo.closest('section, form, main') || document.body;
      return box;
    });
  }

  // Un file nuovo o un'opzione cambiata: il file di prima non e' piu' il
  // risultato attuale, e il suggerimento sparisce finche' non se ne crea un altro.
  function cambiato(e) {
    var box = document.getElementById('su-prossimo');
    var t = e.target;
    if (!box || !t || !t.closest || box.contains(t)) return;
    if (t.type === 'file' || (zona && zona.contains(t))) togli();
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('change', cambiato, true);
    document.addEventListener('input', cambiato, true);
  }

  return { SEGUITI: SEGUITI, PER_GENERE: PER_GENERE, passi: passi, offri: offri, togli: togli };
});
