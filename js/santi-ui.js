// js/santi-ui.js — La pagina "Santo del giorno".
//
// Santi e onomastici vengono da data/santi.json (js/santi.js), luna e feste
// da js/festivita.js, alba e tramonto da js/sole.js, il biglietto da
// js/auguri.js. Tutto nel browser: la posizione, se la dai, serve solo al
// calcolo e non si salva. Si ricordano la citta' e l'ultimo nome cercato.
(function () {
  'use strict';

  var F = window.Festivita, Sole = window.Sole, Santi = window.Santi, Auguri = window.Auguri;
  var el = function (id) { return document.getElementById(id); };
  if (!F || !Sole || !Santi || !Auguri || !el('sdg-oggi')) return;

  var CHIAVE = 'su_santi';
  var URL_PAGINA = 'https://strumentiutili.it/utilita-web/santo-del-giorno/';
  var GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

  var archivio = null;
  var oggi = oggiInItalia();
  var giorno = oggi;
  var memoria = leggi();
  var posizione = null;   // { lat, lon } solo per questa visita

  function oggiInItalia() {
    try {
      var p = {};
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      if (p.year && p.month && p.day) return p.year + '-' + p.month + '-' + p.day;
    } catch (e) { /* senza fusi orari */ }
    return F.oggi();
  }

  function leggi() {
    var m;
    try { m = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { m = null; }
    return m && typeof m === 'object' ? m : {};
  }
  function ricorda() {
    try { localStorage.setItem(CHIAVE, JSON.stringify(memoria)); } catch (e) { /* pazienza */ }
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // "24 settembre", "1° ottobre"
  function giornoMese(iso) {
    var g = Number(iso.slice(8)), m = Number(iso.slice(5, 7));
    return (g === 1 ? '1°' : String(g)) + ' ' + F.NOMI_MESI[m - 1].toLowerCase();
  }
  function dataLunga(iso) { return GIORNI[F.giornoSettimana(iso)] + ' ' + giornoMese(iso); }
  function maiuscola(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  function ora(ms) {
    return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  }

  // ------------------------------------------------------------ santo del giorno

  function disegnaGiorno() {
    var eOggi = giorno === oggi;
    el('sdg-data').textContent = (eOggi ? 'Oggi, ' : '') + (eOggi ? dataLunga(giorno) : maiuscola(dataLunga(giorno)));
    el('sdg-torna-oggi').hidden = eOggi;
    var santi = archivio.delGiorno(giorno);
    var primo = santi[0];
    el('sdg-santo').textContent = primo ? primo.nome : '—';
    var wiki = el('sdg-wiki');
    wiki.hidden = !(primo && primo.wikipedia);
    if (primo && primo.wikipedia) wiki.href = primo.wikipedia;
    var altri = santi.slice(1);
    el('sdg-altri-blocco').hidden = !altri.length;
    el('sdg-altri').innerHTML = altri.map(function (s) {
      return '<li>' + (s.wikipedia ? '<a class="hover:text-indigo-700 hover:underline" target="_blank" rel="noopener" href="' + esc(s.wikipedia) + '">' + esc(s.nome) + '</a>' : esc(s.nome)) + '</li>';
    }).join('');
    var nomi = archivio.onomasticiDelGiorno(giorno);
    var mostrati = nomi.slice(0, 12);
    el('sdg-nomi').textContent = nomi.length ? mostrati.join(', ') + (nomi.length > 12 ? ' e altri ' + (nomi.length - 12) : '') : 'nessun nome molto diffuso';
    var testo = (eOggi ? 'Oggi, ' + giornoMese(giorno) + ',' : (/^(8|11) /.test(giornoMese(giorno)) ? 'L\u2019' : 'Il ') + giornoMese(giorno)) + ' si festeggia ' + (primo ? primo.nome : 'il santo del giorno') + '.' +
      (mostrati.length ? ' Auguri a ' + mostrati.slice(0, 5).join(', ') + '!' : '') + '\n' + URL_PAGINA;
    el('sdg-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(testo);
    try {
      history.replaceState(null, '', eOggi ? location.pathname : location.pathname + '?giorno=' + giorno.slice(5));
    } catch (e) { /* file:// o altro */ }
    disegnaBreve();
    if (tipo() === 'compleanno' || !el('sdg-auguri-nome').value) disegnaAuguri();
  }

  function sposta(giorni) {
    giorno = F.aggiungi(giorno, giorni);
    disegnaGiorno();
  }

  // ------------------------------------------------------------ onomastico

  function cerca(nome) {
    if (!archivio) return;
    var ris = el('sdg-risultato');
    var n = String(nome || '').trim();
    if (!n) { ris.innerHTML = ''; return; }
    var o = archivio.onomastico(n);
    if (!o) {
      ris.innerHTML = '<p class="text-sm text-gray-700">Non troviamo &laquo;' + esc(n) + '&raquo;. Prova con la forma italiana del nome (Giuseppe invece di Joseph) o controlla come l&rsquo;hai scritto.</p>';
      return;
    }
    memoria.nome = o.nome;
    ricorda();
    var data = oggi.slice(0, 4) + '-' + o.data;
    var prossimo = data >= oggi ? data : (Number(oggi.slice(0, 4)) + 1) + '-' + o.data;
    var mancano = Math.round((Date.parse(prossimo) - Date.parse(oggi)) / 86400000);
    var quando = mancano === 0 ? '<strong>&egrave; oggi!</strong>' : mancano === 1 ? 'domani' : 'fra ' + mancano + ' giorni';
    ris.innerHTML =
      '<div class="rounded-xl border border-indigo-100 bg-indigo-50 p-4">' +
      '<p class="text-lg font-bold text-indigo-900">' + esc(o.nome) + ': ' + giornoMese('2000-' + o.data) + '</p>' +
      '<p class="text-sm text-indigo-900 mt-1">' + (o.santo ? (o.santo.wikipedia ? '<a class="underline" target="_blank" rel="noopener" href="' + esc(o.santo.wikipedia) + '">' + esc(o.santo.nome) + '</a>' : esc(o.santo.nome)) + ' &middot; ' : '') +
      'il prossimo &egrave; ' + dataLunga(prossimo) + ', ' + quando + '.</p>' +
      '<button type="button" id="sdg-crea-auguri" class="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition">Crea gli auguri per ' + esc(o.nome) + '</button>' +
      '</div>';
    el('sdg-crea-auguri').addEventListener('click', function () {
      el('sdg-auguri-nome').value = o.nome;
      document.querySelector('input[name="sdg-tipo"][value="onomastico"]').checked = true;
      disegnaAuguri();
      el('sdg-auguri').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function suggerisci() {
    if (!archivio) return;
    var lista = el('sdg-suggerimenti');
    lista.innerHTML = archivio.suggerimenti(el('sdg-nome').value, 8).map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
  }

  // ------------------------------------------------------------ auguri

  function tipo() {
    var r = document.querySelector('input[name="sdg-tipo"]:checked');
    return r ? r.value : 'onomastico';
  }
  function tema() {
    var r = document.querySelector('input[name="sdg-tema"]:checked');
    return r ? r.value : 'oro';
  }

  function opzioniAuguri() {
    var nome = el('sdg-auguri-nome').value.trim();
    var o = { tipo: tipo(), tema: tema(), nome: nome };
    if (o.tipo === 'onomastico') {
      var on = nome ? archivio.onomastico(nome) : null;
      if (on) { o.data = giornoMese('2000-' + on.data); o.santo = on.santo ? on.santo.nome : ''; }
      else if (!nome) {
        var primo = archivio.delGiorno(giorno)[0];
        o.data = giornoMese(giorno);
        o.santo = primo ? primo.nome : '';
      }
    }
    return o;
  }

  function disegnaAuguri() {
    if (!archivio) return;
    var tela = el('sdg-tela');
    var ctx = tela.getContext && tela.getContext('2d');
    if (!ctx) return;
    Auguri.disegna(ctx, opzioniAuguri());
  }

  function nomeFile() {
    var n = Santi.normalizza(el('sdg-auguri-nome').value).replace(/ /g, '-');
    return 'auguri' + (n ? '-' + n : '') + '.png';
  }

  function immagine() {
    return new Promise(function (risolvi) { el('sdg-tela').toBlob(risolvi, 'image/png'); });
  }

  function scarica(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nomeFile();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  el('sdg-auguri-condividi').addEventListener('click', function () {
    var esito = el('sdg-auguri-esito');
    disegnaAuguri();
    immagine().then(function (blob) {
      if (!blob) return;
      var file = new File([blob], nomeFile(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file] }).catch(function () { /* annullato */ });
      }
      scarica(blob);
      esito.textContent = 'Da questo browser non si può condividere un’immagine: l’abbiamo scaricata, allegala al messaggio.';
    });
  });
  el('sdg-auguri-scarica').addEventListener('click', function () {
    disegnaAuguri();
    immagine().then(function (blob) { if (blob) { scarica(blob); el('sdg-auguri-esito').textContent = 'Scaricata: ' + nomeFile(); } });
  });
  document.querySelectorAll('input[name="sdg-tipo"], input[name="sdg-tema"]').forEach(function (r) { r.addEventListener('change', disegnaAuguri); });
  el('sdg-auguri-nome').addEventListener('input', disegnaAuguri);

  // ------------------------------------------------------------ oggi in breve

  function disegnaBreve() {
    var anno = Number(giorno.slice(0, 4));
    var inizio = Date.UTC(anno, 0, 1), questo = Date.parse(giorno + 'T00:00:00Z');
    var n = Math.round((questo - inizio) / 86400000) + 1;
    var totale = (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0 ? 366 : 365;
    el('t-breve').textContent = giorno === oggi ? 'Oggi in breve' : maiuscola(dataLunga(giorno)) + ' in breve';
    el('sdg-giorno-anno').textContent = n + '° giorno, ne mancano ' + (totale - n) + ' · settimana ' + F.settimanaIso(giorno);

    // La luna a mezzogiorno di quel giorno (ora italiana).
    var mezzodi = Date.parse(giorno + 'T10:00:00Z');
    var l = F.faseLunare(mezzodi);
    var prossima = l.crescente ? 'piena ' + giornoMese(F.dataRoma(l.prossimaPiena)) : 'nuova ' + giornoMese(F.dataRoma(l.prossimaNuova));
    el('sdg-luna').textContent = l.nome + ', illuminata al ' + Math.round(l.illuminata * 100) + '% · ' + prossima;

    disegnaSole();

    // La prossima festa nazionale da quel giorno in poi (anche l'anno dopo).
    var feste = F.festivita(anno).concat(F.festivita(anno + 1)).filter(function (f) { return f.data >= giorno; });
    var f = feste[0];
    if (f) {
      var tra = Math.round((Date.parse(f.data) - questo) / 86400000);
      var ponte = F.ponti(Number(f.data.slice(0, 4))).filter(function (p) { return p.festa.data === f.data; })[0];
      var extra = '';
      if (ponte && ponte.tipo === 'weekend-lungo') extra = ' · weekend lungo di ' + ponte.giorniLiberi + ' giorni';
      else if (ponte && (ponte.tipo === 'ponte' || ponte.tipo === 'ponte-lungo')) extra = ' · con ' + ponte.ferie + (ponte.ferie === 1 ? ' giorno' : ' giorni') + ' di ferie fai ' + ponte.giorniLiberi + ' giorni di fila';
      el('sdg-festa').innerHTML = esc(f.nome) + ', ' + dataLunga(f.data) + (tra === 0 ? ' (oggi)' : tra === 1 ? ' (domani)' : ' (fra ' + tra + ' giorni)') + esc(extra) +
        ' · <a class="text-indigo-700 hover:underline" href="/utilita-web/calendario-da-stampare/#ponti">tutti i ponti</a>';
    }

    var r = F.ricorrenze(anno).filter(function (x) { return x.data === giorno; }).map(function (x) { return x.nome; });
    el('sdg-ricorrenze-blocco').hidden = !r.length;
    el('sdg-ricorrenze').textContent = r.join(' · ');
  }

  function disegnaSole() {
    var c = posizione || Sole.CITTA.filter(function (x) { return x.nome === el('sdg-citta').value; })[0] || Sole.CITTA[15];
    var s = Sole.calcola(giorno, c.lat, c.lon);
    if (s.sempre) { el('sdg-sole').textContent = s.sempre === 'giorno' ? 'Il sole non tramonta' : 'Il sole non sorge'; return; }
    var h = Math.floor(s.durata / 60), m = s.durata % 60;
    el('sdg-sole').textContent = 'alba ' + ora(s.alba) + ' · tramonto ' + ora(s.tramonto) + ' · ' + h + ' h ' + m + ' min di luce';
  }

  (function () {
    var sel = el('sdg-citta');
    Sole.CITTA.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.nome;
      o.textContent = c.nome;
      sel.appendChild(o);
    });
    sel.value = Sole.CITTA.some(function (c) { return c.nome === memoria.citta; }) ? memoria.citta : 'Roma';
    sel.addEventListener('change', function () {
      posizione = null;
      memoria.citta = sel.value;
      ricorda();
      disegnaSole();
    });
  })();

  el('sdg-posizione').addEventListener('click', function () {
    var b = this;
    if (!navigator.geolocation) { b.textContent = 'posizione non disponibile'; return; }
    b.textContent = 'cerco la posizione…';
    navigator.geolocation.getCurrentPosition(function (p) {
      // Due decimali (circa un chilometro) bastano per l'alba; non si salva.
      posizione = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 };
      b.textContent = 'la tua posizione';
      disegnaSole();
    }, function () {
      b.textContent = 'posizione negata: scegli la città';
    }, { maximumAge: 3600000, timeout: 15000 });
  });

  // ------------------------------------------------------------ avvio

  el('sdg-ieri').addEventListener('click', function () { sposta(-1); });
  el('sdg-domani').addEventListener('click', function () { sposta(1); });
  el('sdg-torna-oggi').addEventListener('click', function () { giorno = oggi; disegnaGiorno(); });
  el('sdg-cerca').addEventListener('submit', function (e) { e.preventDefault(); cerca(el('sdg-nome').value); });
  el('sdg-nome').addEventListener('input', suggerisci);
  el('sdg-nome').addEventListener('change', function () { cerca(this.value); });

  // ?giorno=MM-GG apre un altro giorno di quest'anno.
  var richiesto = new URLSearchParams(location.search).get('giorno');
  if (richiesto && /^\d{2}-\d{2}$/.test(richiesto) && F.valida(oggi.slice(0, 4) + '-' + richiesto)) giorno = oggi.slice(0, 4) + '-' + richiesto;

  fetch('/data/santi.json').then(function (r) {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).then(function (dati) {
    archivio = Santi.crea(dati);
    disegnaGiorno();
    if (memoria.nome) { el('sdg-nome').value = memoria.nome; cerca(memoria.nome); }
  }).catch(function () {
    el('sdg-santo').textContent = 'Santi non disponibili';
    el('sdg-nomi').textContent = 'riprova quando torna la connessione';
  });
})();
