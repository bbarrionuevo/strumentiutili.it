// js/turni-ui.js — La pagina del calendario turni: scelta dello schema, mese a
// colori con i cambi di un giorno, PDF, calendario del telefono e link per i
// colleghi.
//
// Lo schema si salva su questo dispositivo (chiave su_turni). Il link per i
// colleghi mette lo schema dopo il # dell'indirizzo: quella parte non viene
// mai inviata al server, e non contiene ferie ne' malattie.
//
// Tutto il testo che arriva dall'utente (nomi dei turni) entra nella pagina
// con textContent, mai con innerHTML.
(function () {
  'use strict';

  var T = window.Turni;
  var F = window.Festivita;
  var radice = document.getElementById('tu-app');
  if (!T || !F || !radice) return;

  var CHIAVE = 'su_turni';
  var PDF_LIB = '/vendor/pdf-lib@1.17.1/pdf-lib.min.js';
  var URL_PAGINA = 'https://strumentiutili.it/lavoro-contratti/calendario-turni/';
  var TAVOLOZZA = ['#f59e0b', '#0284c7', '#4338ca', '#94a3b8', '#10b981', '#e11d48', '#7c3aed', '#0d9488', '#ea580c', '#475569', '#65a30d', '#db2777'];
  var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  var GIORNI = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

  function $(id) { return document.getElementById(id); }
  var el = {
    modello: $('tu-modello'), personalizzato: $('tu-personalizzato'), ciclo: $('tu-ciclo'), cicloErrore: $('tu-ciclo-errore'),
    data: $('tu-data'), posizione: $('tu-posizione'), tipi: $('tu-tipi'),
    titoloMese: $('tu-titolo-mese'), prima: $('tu-prima'), dopo: $('tu-dopo'), oggi: $('tu-oggi'),
    griglia: $('tu-griglia'), riepilogo: $('tu-riepilogo'),
    giorno: $('tu-giorno'), giornoTitolo: $('tu-giorno-titolo'), giornoScelta: $('tu-giorno-scelta'), giornoChiudi: $('tu-giorno-chiudi'),
    mesi: $('tu-mesi'), nome: $('tu-nome'), pdf: $('tu-pdf'), ics: $('tu-ics'), promemoria: $('tu-promemoria'),
    condividi: $('tu-condividi'), link: $('tu-link'), messaggio: $('tu-messaggio'),
    avviso: $('tu-avviso'), usa: $('tu-usa')
  };

  // ------------------------------------------------------------ stato

  function oggiIso() { return F.oggi(); }

  var stato = { schema: null, anno: 0, mese: 0, condiviso: false, aperto: null };

  function leggiMemoria() {
    try { return JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { return null; }
  }

  function salva() {
    if (stato.condiviso) return;
    try {
      localStorage.setItem(CHIAVE, JSON.stringify({ schema: stato.schema, nome: el.nome.value.slice(0, 60) }));
    } catch (e) { /* navigazione privata: si usa senza salvare */ }
  }

  function messaggio(testo, errore) {
    el.messaggio.textContent = testo || '';
    el.messaggio.className = 'mt-3 text-sm ' + (errore ? 'text-red-700' : 'text-emerald-800');
  }

  // ------------------------------------------------------------ schema

  function riempiModelli() {
    Object.keys(T.SCHEMI).forEach(function (id) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = T.SCHEMI[id].nome;
      el.modello.appendChild(o);
    });
    var o = document.createElement('option');
    o.value = 'personalizzato';
    o.textContent = 'Personalizzato: scrivo io la sequenza';
    el.modello.appendChild(o);
  }

  function nomeCiclo(s) { return s.ciclo.join(' '); }

  // Dal testo del ciclo personalizzato ai tipi: le sigle gia' note tengono
  // nome, orari e colore; le nuove partono con il nome uguale alla sigla.
  function applicaCiclo(testo) {
    var ciclo = T.leggiCiclo(testo);
    if (!ciclo.length) return 'Scrivi la sequenza dei turni, per esempio M M P P N N R R';
    var vecchi = {};
    stato.schema.tipi.forEach(function (t) { vecchi[t.sigla] = t; });
    var tipi = [];
    ciclo.forEach(function (s) {
      if (tipi.some(function (t) { return t.sigla === s; })) return;
      tipi.push(vecchi[s] || { sigla: s, nome: s === 'R' ? 'Riposo' : s, colore: TAVOLOZZA[tipi.length % TAVOLOZZA.length] });
    });
    var prova = { ciclo: ciclo, tipi: tipi, inizio: stato.schema.inizio, eccezioni: stato.schema.eccezioni, modello: null };
    var p = T.problema(prova);
    if (p) return p;
    stato.schema.ciclo = ciclo;
    stato.schema.tipi = tipi;
    delete stato.schema.modello;
    // I cambi con sigle che non esistono piu' si tolgono.
    Object.keys(stato.schema.eccezioni).forEach(function (d) {
      if (!T.tipoDi(stato.schema, stato.schema.eccezioni[d])) delete stato.schema.eccezioni[d];
    });
    return null;
  }

  function disegnaPosizioni() {
    var giorno = el.data.value && T.valida(el.data.value) ? el.data.value : oggiIso();
    var attuale = T.posizione(stato.schema, giorno);
    el.posizione.textContent = '';
    stato.schema.ciclo.forEach(function (s, i) {
      var t = T.tipoDi(stato.schema, s);
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = (i + 1) + '° giorno del ciclo: ' + s + ' · ' + (t ? t.nome : s);
      if (i === attuale) o.selected = true;
      el.posizione.appendChild(o);
    });
  }

  function campo(tipo, valore, etichetta, extra) {
    var i = document.createElement('input');
    i.type = tipo;
    i.value = valore || '';
    i.setAttribute('aria-label', etichetta);
    i.className = 'w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 ' + (extra || '');
    return i;
  }

  function disegnaTipi() {
    el.tipi.textContent = '';
    stato.schema.tipi.forEach(function (t) {
      var riga = document.createElement('div');
      riga.className = 'grid grid-cols-12 gap-2 items-center py-2 border-b border-gray-100';

      var sigla = document.createElement('span');
      sigla.className = 'col-span-2 sm:col-span-1 text-center text-white font-bold rounded-md py-1.5 text-sm';
      sigla.style.backgroundColor = t.colore;
      sigla.textContent = t.sigla;

      var nome = campo('text', t.nome, 'Nome del turno ' + t.sigla, 'col-span-10 sm:col-span-4');
      nome.maxLength = 30;
      nome.addEventListener('input', function () {
        if (nome.value.trim()) { t.nome = nome.value.trim(); aggiorna(false); }
      });

      var inizio = campo('time', t.inizio, 'Inizio del turno ' + t.sigla, 'col-span-4 sm:col-span-2');
      var fine = campo('time', t.fine, 'Fine del turno ' + t.sigla, 'col-span-4 sm:col-span-2');
      function orari() {
        if (inizio.value && fine.value) { t.inizio = inizio.value; t.fine = fine.value; }
        else if (!inizio.value && !fine.value) { delete t.inizio; delete t.fine; }
        else return;
        ore.textContent = oreTesto(t);
        aggiorna(false);
      }
      inizio.addEventListener('change', orari);
      fine.addEventListener('change', orari);

      var colore = campo('color', t.colore, 'Colore del turno ' + t.sigla, 'col-span-2 sm:col-span-1 h-9 p-0.5');
      colore.addEventListener('input', function () {
        t.colore = colore.value;
        sigla.style.backgroundColor = t.colore;
        aggiorna(false);
      });

      var ore = document.createElement('span');
      ore.className = 'col-span-2 text-xs text-gray-600';
      ore.textContent = oreTesto(t);

      riga.appendChild(sigla);
      riga.appendChild(nome);
      riga.appendChild(inizio);
      riga.appendChild(fine);
      riga.appendChild(colore);
      riga.appendChild(ore);
      el.tipi.appendChild(riga);
    });
  }

  function oreTesto(t) {
    var h = T.ore(t);
    if (!h) return 'nessun orario';
    return String(h).replace('.', ',') + ' ore' + (T.scavalca(t) ? ', finisce il giorno dopo' : '');
  }

  // ------------------------------------------------------------ mese

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function disegnaMese() {
    var festivi = F.mappaFestivita(stato.anno);
    var giorni = T.mese(stato.schema, stato.anno, stato.mese, festivi);
    var oggi = oggiIso();
    el.titoloMese.textContent = MESI[stato.mese - 1] + ' ' + stato.anno;
    el.griglia.textContent = '';

    GIORNI.forEach(function (g, i) {
      var h = document.createElement('div');
      h.className = 'text-center text-xs font-semibold py-1 ' + (i === 6 ? 'text-red-600' : 'text-gray-500');
      h.textContent = g;
      h.setAttribute('aria-hidden', 'true');
      el.griglia.appendChild(h);
    });
    for (var v = 0; v < giorni[0].settimana; v++) {
      var vuoto = document.createElement('div');
      vuoto.setAttribute('aria-hidden', 'true');
      el.griglia.appendChild(vuoto);
    }
    giorni.forEach(function (g) {
      var b = document.createElement('button');
      b.type = 'button';
      var festa = g.festa && g.festa.some(function (f) { return f.tipo === 'nazionale'; });
      b.className = 'relative flex flex-col items-stretch rounded-lg border text-left p-1 min-h-[3.75rem] transition hover:ring-2 hover:ring-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 ' +
        (festa ? 'bg-red-50 border-red-200 ' : 'bg-white border-gray-200 ') + (g.data === oggi ? 'ring-2 ring-indigo-500 ' : '') +
        (stato.aperto === g.data ? 'outline outline-2 outline-indigo-600 ' : '');
      var numero = document.createElement('span');
      numero.className = 'text-xs font-bold ' + (festa || g.settimana === 6 ? 'text-red-600' : 'text-gray-800');
      numero.textContent = String(Number(g.data.slice(8)));
      var chip = document.createElement('span');
      chip.className = 'mt-1 block text-center text-white text-xs font-bold rounded py-1';
      chip.style.backgroundColor = g.tipo ? g.tipo.colore : '#64748b';
      chip.textContent = g.sigla;
      b.appendChild(numero);
      b.appendChild(chip);
      if (g.cambio) {
        var punto = document.createElement('span');
        punto.className = 'absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500';
        punto.setAttribute('aria-hidden', 'true');
        b.appendChild(punto);
      }
      b.setAttribute('aria-label', Number(g.data.slice(8)) + ' ' + MESI[stato.mese - 1] + ': ' + (g.tipo ? g.tipo.nome : g.sigla) +
        (g.tipo && g.tipo.inizio ? ' ' + g.tipo.inizio + '-' + g.tipo.fine : '') + (g.cambio ? ', cambiato' : '') +
        (festa ? ', festivo' : ''));
      b.addEventListener('click', function () { apriGiorno(g.data); });
      el.griglia.appendChild(b);
    });

    var r = T.riepilogo(giorni);
    el.riepilogo.textContent = '';
    [['Ore', String(r.ore).replace('.', ',')], ['Turni', r.lavorati], ['Notti', r.notti], ['Domeniche lavorate', r.domenicheLavorate], ['Festivi lavorati', r.festiviLavorati]]
      .forEach(function (x) {
        var d = document.createElement('div');
        d.className = 'rounded-lg bg-gray-50 border border-gray-100 px-3 py-2';
        var n = document.createElement('div');
        n.className = 'text-lg font-bold text-gray-900';
        n.textContent = String(x[1]);
        var e = document.createElement('div');
        e.className = 'text-xs text-gray-600';
        e.textContent = x[0];
        d.appendChild(n);
        d.appendChild(e);
        el.riepilogo.appendChild(d);
      });
  }

  function apriGiorno(iso) {
    stato.aperto = iso;
    var g = T.turnoDel(stato.schema, iso);
    var d = Number(iso.slice(8)) + ' ' + MESI[Number(iso.slice(5, 7)) - 1].toLowerCase();
    var previsto = T.tipoDi(stato.schema, g.ciclo);
    el.giornoTitolo.textContent = d + ': dal ciclo ' + g.ciclo + ' (' + (previsto ? previsto.nome : g.ciclo) + ')';
    el.giornoScelta.textContent = '';
    var voci = stato.schema.tipi.map(function (t) { return [t.sigla, t.sigla + ' · ' + t.nome]; })
      .concat(Object.keys(T.ASSENZE).map(function (s) { return [s, T.ASSENZE[s].nome]; }));
    voci.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v[0];
      o.textContent = v[1] + (v[0] === g.ciclo ? ' (dal ciclo)' : '');
      if (v[0] === g.sigla) o.selected = true;
      el.giornoScelta.appendChild(o);
    });
    el.giorno.hidden = false;
    disegnaMese();
    el.giornoScelta.focus();
  }

  el.giornoScelta.addEventListener('change', function () {
    if (!stato.aperto) return;
    T.segna(stato.schema, stato.aperto, el.giornoScelta.value);
    aggiorna(false);
  });
  el.giornoChiudi.addEventListener('click', function () {
    stato.aperto = null;
    el.giorno.hidden = true;
    disegnaMese();
  });

  function spostaMese(delta) {
    var m = stato.mese - 1 + delta;
    stato.anno += Math.floor(m / 12);
    stato.mese = ((m % 12) + 12) % 12 + 1;
    stato.aperto = null;
    el.giorno.hidden = true;
    disegnaMese();
  }
  el.prima.addEventListener('click', function () { spostaMese(-1); });
  el.dopo.addEventListener('click', function () { spostaMese(1); });
  el.oggi.addEventListener('click', function () {
    var o = oggiIso();
    stato.anno = Number(o.slice(0, 4));
    stato.mese = Number(o.slice(5, 7));
    spostaMese(0);
  });

  // Aggiorna tutto quello che dipende dallo schema.
  function aggiorna(ridisegnaTipi) {
    if (ridisegnaTipi) disegnaTipi();
    disegnaPosizioni();
    disegnaMese();
    el.link.value = '';
    salva();
  }

  // ------------------------------------------------------------ eventi schema

  el.modello.addEventListener('change', function () {
    var id = el.modello.value;
    el.personalizzato.hidden = id !== 'personalizzato';
    if (id === 'personalizzato') {
      el.ciclo.value = nomeCiclo(stato.schema);
      delete stato.schema.modello;
    } else {
      var inizio = el.data.value && T.valida(el.data.value) ? el.data.value : oggiIso();
      var eccezioni = stato.schema.eccezioni;
      stato.schema = T.daModello(id, inizio);
      stato.schema.eccezioni = eccezioni;
      Object.keys(eccezioni).forEach(function (d) { if (!T.tipoDi(stato.schema, eccezioni[d])) delete eccezioni[d]; });
    }
    aggiorna(true);
  });

  el.ciclo.addEventListener('change', function () {
    var p = applicaCiclo(el.ciclo.value);
    el.cicloErrore.textContent = p || '';
    if (!p) aggiorna(true);
  });

  function allinea() {
    var d = el.data.value;
    if (!T.valida(d)) return;
    T.allinea(stato.schema, d, Number(el.posizione.value));
    aggiorna(false);
  }
  el.posizione.addEventListener('change', allinea);
  el.data.addEventListener('change', function () { disegnaPosizioni(); });

  // ------------------------------------------------------------ esportazioni

  var promessaPdfLib = null;
  function caricaPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (promessaPdfLib) return promessaPdfLib;
    promessaPdfLib = new Promise(function (risolvi, rifiuta) {
      var s = document.createElement('script');
      s.src = PDF_LIB;
      s.onload = function () { window.PDFLib ? risolvi(window.PDFLib) : rifiuta(new Error('pdf-lib')); };
      s.onerror = function () { promessaPdfLib = null; rifiuta(new Error('pdf-lib')); };
      document.head.appendChild(s);
    });
    return promessaPdfLib;
  }

  function scarica(nome, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function mesiScelti() { return Number(el.mesi.value) || 1; }

  function nomeFile(ext) {
    return 'turni-' + stato.anno + '-' + pad(stato.mese) + (mesiScelti() > 1 ? '-' + mesiScelti() + 'mesi' : '') + '.' + ext;
  }

  el.pdf.addEventListener('click', function () {
    el.pdf.disabled = true;
    messaggio('Preparo il PDF…');
    caricaPdfLib().then(function (PDFLib) {
      return window.TurniPdf.crea(PDFLib, F, window.CalendarioPdf, T, stato.schema,
        { anno: stato.anno, mese: stato.mese, mesi: mesiScelti(), titolo: el.nome.value });
    }).then(function (byte) {
      scarica(nomeFile('pdf'), new Blob([byte], { type: 'application/pdf' }));
      messaggio('Fatto: ' + nomeFile('pdf') + ', ' + mesiScelti() + (mesiScelti() > 1 ? ' fogli' : ' foglio') + ' A4. Stampa con la scala al 100%.');
    }).catch(function (e) {
      messaggio(e && e.message && e.message !== 'pdf-lib' ? e.message :
        'Non sono riuscito a preparare il PDF. Se sei senza connessione, riprova quando torna: la prima volta serve scaricare il programma che lo crea.', true);
    }).then(function () { el.pdf.disabled = false; });
  });

  el.ics.addEventListener('click', function () {
    var da = stato.anno + '-' + pad(stato.mese) + '-01';
    var fineMese = new Date(Date.UTC(stato.anno, stato.mese - 1 + mesiScelti(), 0)).toISOString().slice(0, 10);
    var eventi = T.eventi(stato.schema, da, fineMese, {
      url: URL_PAGINA,
      promemoria: el.promemoria.checked ? ['oraPrima'] : []
    });
    if (!eventi.length) { messaggio('In questo periodo non ci sono turni con un orario da mettere nel calendario.', true); return; }
    window.CalendarioIcs.scarica(nomeFile('ics'), window.CalendarioIcs.crea(eventi, { nome: 'Turni' }));
    messaggio('Scaricato ' + nomeFile('ics') + ' con ' + eventi.length + ' turni: aprilo con il telefono per aggiungerli al calendario.');
  });

  el.condividi.addEventListener('click', function () {
    var link = URL_PAGINA + '#s=' + T.codifica(stato.schema);
    el.link.value = link;
    var testo = 'Il mio schema dei turni: aprilo per vedere il calendario';
    if (navigator.share) {
      navigator.share({ title: 'Calendario turni', text: testo, url: link }).catch(function () { /* annullato */ });
      return;
    }
    el.link.select();
    var copia = navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject();
    copia.then(function () { messaggio('Link copiato: incollalo nella chat dei colleghi.'); })
      .catch(function () { messaggio('Copia il link qui sotto e mandalo ai colleghi.'); });
  });

  el.nome.addEventListener('input', salva);

  // ------------------------------------------------------------ avvio

  function usaSchema(s) {
    stato.schema = s;
    if (!stato.schema.eccezioni) stato.schema.eccezioni = {};
    el.modello.value = s.modello && T.SCHEMI[s.modello] ? s.modello : 'personalizzato';
    el.personalizzato.hidden = el.modello.value !== 'personalizzato';
    el.ciclo.value = nomeCiclo(s);
  }

  riempiModelli();
  var o = oggiIso();
  stato.anno = Number(o.slice(0, 4));
  stato.mese = Number(o.slice(5, 7));
  el.data.value = o;

  var memoria = leggiMemoria();
  var mio = memoria && memoria.schema && !T.problema(memoria.schema) ? memoria.schema : null;
  if (memoria && typeof memoria.nome === 'string') el.nome.value = memoria.nome;

  var condiviso = null;
  var m = /(?:^|[#&])s=([A-Za-z0-9_-]+)/.exec(location.hash || '');
  if (m) condiviso = T.decodifica(m[1]);

  if (condiviso) {
    stato.condiviso = true;
    usaSchema(condiviso);
    el.avviso.hidden = false;
    el.usa.addEventListener('click', function () {
      stato.condiviso = false;
      if (mio && Object.keys(mio.eccezioni || {}).length &&
        !window.confirm('Sostituire il tuo schema con quello ricevuto? I cambi che hai segnato restano sui giorni con sigle che esistono ancora.')) return;
      if (mio) {
        stato.schema.eccezioni = mio.eccezioni || {};
        Object.keys(stato.schema.eccezioni).forEach(function (d) {
          if (!T.tipoDi(stato.schema, stato.schema.eccezioni[d])) delete stato.schema.eccezioni[d];
        });
      }
      el.avviso.hidden = true;
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* niente */ }
      aggiorna(true);
      messaggio('Schema salvato su questo dispositivo.');
    });
  } else {
    usaSchema(mio || T.daModello('quinta', o));
  }
  aggiorna(true);
})();
