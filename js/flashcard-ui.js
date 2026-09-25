// js/flashcard-ui.js — Le flashcard: mazzi, importazione, ripasso e quiz.
//
// La logica sta in js/flashcard.js; qui ci sono la pagina e il salvataggio.
// Mazzi e carte stanno in un database del browser (IndexedDB
// "strumentiutili-flashcard"), la serie di giorni in localStorage
// (su_flashcard). Tutto resta su questo dispositivo e si cancella con
// "Cancella i dati salvati" in fondo alla pagina.
//
// Le librerie si caricano dal sito solo quando servono: ts-fsrs quando si
// inizia a studiare, fflate, fzstd e sql.js solo per i mazzi di Anki.
(function () {
  'use strict';

  var F = window.Flashcard;
  var G = window.Giornaliero;
  var el = function (id) { return document.getElementById(id); };
  var app = el('fc-app');
  if (!F || !G || !app) return;

  var DB_NOME = 'strumentiutili-flashcard';
  var CHIAVE = 'su_flashcard';
  var LIB = {
    fsrs: '/vendor/ts-fsrs@5.4.2/ts-fsrs.umd.js',
    fflate: '/vendor/fflate@0.8.3/fflate.umd.js',
    fzstd: '/vendor/fzstd@0.1.1/fzstd.umd.js',
    sqljs: '/vendor/sqljs@1.14.2/sql-wasm.js',
    sqljsCartella: '/vendor/sqljs@1.14.2/'
  };
  var NUOVE_PREDEFINITE = 20;

  var mazzi = [];
  var carte = [];          // tutte le carte di tutti i mazzi
  var prefs = leggiPrefs();
  var db = null;
  var salvataggioOk = true;

  // ------------------------------------------------------------ utilita'

  function crea(tag, classi, testo) {
    var n = document.createElement(tag);
    if (classi) n.className = classi;
    if (testo != null) n.textContent = testo;
    return n;
  }

  function nuovoId(prefisso) {
    var r = window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return prefisso + r;
  }

  function oggi() { return G.oggiInItalia(); }

  function messaggio(id, testo, errore) {
    var n = el(id);
    n.textContent = testo || '';
    n.classList.toggle('text-red-700', !!errore);
    n.classList.toggle('text-emerald-800', !errore);
  }

  function scarica(nome, contenuto, tipo) {
    var url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function nomeFile(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mazzo';
  }

  var promesse = {};
  function caricaScript(src, globale) {
    if (window[globale]) return Promise.resolve(window[globale]);
    if (promesse[src]) return promesse[src];
    promesse[src] = new Promise(function (risolvi, rifiuta) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { window[globale] ? risolvi(window[globale]) : rifiuta(new Error(src)); };
      s.onerror = function () { promesse[src] = null; rifiuta(new Error(src)); };
      document.head.appendChild(s);
    });
    return promesse[src];
  }

  // ------------------------------------------------------------ preferenze e serie

  function leggiPrefs() {
    var p;
    try { p = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { p = null; }
    if (!p || typeof p !== 'object') p = {};
    if (!p.serie || typeof p.serie !== 'object') p.serie = {};
    if (!p.oggi || typeof p.oggi !== 'object') p.oggi = { data: '', n: 0 };
    return p;
  }

  function scriviPrefs() {
    try { localStorage.setItem(CHIAVE, JSON.stringify(prefs)); } catch (e) { /* navigazione privata */ }
  }

  function contaRipasso() {
    var d = oggi();
    if (prefs.oggi.data !== d) prefs.oggi = { data: d, n: 0 };
    prefs.oggi.n++;
    if (prefs.serie.ultima !== d) prefs.serie = G.aggiornaSerie(prefs.serie, d, d);
    scriviPrefs();
  }

  // ------------------------------------------------------------ database

  function apri() {
    if (db) return Promise.resolve(db);
    return new Promise(function (risolvi, rifiuta) {
      if (!window.indexedDB) { rifiuta(new Error('IndexedDB')); return; }
      var r = indexedDB.open(DB_NOME, 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('mazzi')) d.createObjectStore('mazzi', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('carte')) d.createObjectStore('carte', { keyPath: 'id' }).createIndex('mazzo', 'mazzo');
      };
      r.onsuccess = function () {
        db = r.result;
        // "Cancella i dati salvati" chiede di eliminare il database: si chiude
        // subito e si svuota la pagina, se no la cancellazione resterebbe bloccata.
        db.onversionchange = function () {
          db.close();
          db = null;
          mazzi = [];
          carte = [];
          torna();
        };
        risolvi(db);
      };
      r.onerror = function () { rifiuta(r.error); };
    });
  }

  function transazione(store, modo, lavoro) {
    return apri().then(function (d) {
      return new Promise(function (risolvi, rifiuta) {
        var tx = d.transaction(store, modo);
        var risultato = lavoro(tx.objectStore(store));
        tx.oncomplete = function () { risolvi(risultato && risultato.result !== undefined ? risultato.result : undefined); };
        tx.onerror = function () { rifiuta(tx.error); };
        tx.onabort = function () { rifiuta(tx.error); };
      });
    });
  }

  function leggiTutto(store) {
    return transazione(store, 'readonly', function (s) { return s.getAll(); });
  }

  function salva(store, oggetti) {
    if (!oggetti.length) return Promise.resolve();
    return transazione(store, 'readwrite', function (s) { oggetti.forEach(function (o) { s.put(o); }); }).catch(avvisaSalvataggio);
  }

  function elimina(store, ids) {
    return transazione(store, 'readwrite', function (s) { ids.forEach(function (id) { s.delete(id); }); }).catch(avvisaSalvataggio);
  }

  function avvisaSalvataggio() {
    if (!salvataggioOk) return;
    salvataggioOk = false;
    el('fc-avviso').hidden = false;
  }

  // ------------------------------------------------------------ elenco dei mazzi

  function carteDi(idMazzo) { return carte.filter(function (c) { return c.mazzo === idMazzo; }); }
  function mazzo(id) { return mazzi.filter(function (m) { return m.id === id; })[0]; }

  function disegnaMazzi() {
    var lista = el('fc-mazzi');
    lista.textContent = '';
    el('fc-vuoto').hidden = mazzi.length > 0;
    var adesso = Date.now();
    mazzi.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'it'); }).forEach(function (m) {
      var mie = carteDi(m.id);
      var n = F.conteggi(mie, adesso, m.nuoveAlGiorno);
      var daFare = n.nuove + n.apprendimento + n.ripasso;
      var li = crea('li', 'rounded-xl border border-gray-200 p-4');
      var testa = crea('div', 'flex flex-wrap items-baseline justify-between gap-2');
      testa.appendChild(crea('h3', 'font-bold text-gray-900 text-lg break-words', m.nome));
      testa.appendChild(crea('span', 'text-xs text-gray-600', mie.length === 1 ? '1 carta' : mie.length + ' carte'));
      li.appendChild(testa);
      var righe = crea('p', 'mt-1 text-sm');
      [[n.nuove, 'nuove', 'text-indigo-700'], [n.apprendimento, 'da imparare', 'text-amber-700'], [n.ripasso, 'da ripassare', 'text-emerald-700']].forEach(function (x, i) {
        if (i) righe.appendChild(document.createTextNode(' · '));
        righe.appendChild(crea('span', 'font-semibold ' + x[2], x[0] + ' ' + x[1]));
      });
      li.appendChild(righe);
      var comandi = crea('div', 'mt-3 flex flex-wrap gap-2');
      var studia = crea('button', 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50', daFare ? 'Studia' : 'Niente da studiare ora');
      studia.type = 'button';
      studia.disabled = !daFare;
      studia.addEventListener('click', function () { iniziaStudio(m.id); });
      var quizB = crea('button', 'border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-800 font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50', 'Quiz');
      quizB.type = 'button';
      quizB.disabled = mie.length < 2;
      quizB.addEventListener('click', function () { apriQuiz(m.id); });
      comandi.appendChild(studia);
      comandi.appendChild(quizB);
      li.appendChild(comandi);
      if (!daFare && n.prossima) {
        li.appendChild(crea('p', 'mt-2 text-xs text-gray-600', 'Il prossimo ripasso è fra ' + F.formatoIntervallo(n.prossima - adesso) + '.'));
      }
      li.appendChild(altreAzioni(m, mie));
      lista.appendChild(li);
    });
    var d = oggi();
    el('fc-serie').textContent = G.serieAttuale(prefs.serie, d);
    el('fc-oggi').textContent = prefs.oggi.data === d ? prefs.oggi.n : 0;
    el('fc-totale').textContent = carte.length;
    disegnaDestinazioni();
  }

  function altreAzioni(m, mie) {
    var det = crea('details', 'mt-3 text-sm');
    det.appendChild(crea('summary', 'cursor-pointer text-gray-700 font-semibold', 'Altre azioni'));
    var box = crea('div', 'mt-3 space-y-3');
    var riga = crea('label', 'flex items-center gap-2 text-gray-800');
    riga.appendChild(document.createTextNode('Carte nuove al giorno'));
    var numero = crea('input', 'w-20 px-2 py-1.5 border border-gray-300 rounded-lg');
    numero.type = 'number';
    numero.min = '0';
    numero.max = '500';
    numero.value = String(m.nuoveAlGiorno);
    numero.addEventListener('change', function () {
      m.nuoveAlGiorno = Math.max(0, Math.min(500, Math.round(Number(numero.value) || 0)));
      numero.value = String(m.nuoveAlGiorno);
      salva('mazzi', [m]).then(disegnaMazzi);
    });
    riga.appendChild(numero);
    box.appendChild(riga);
    var bottoni = crea('div', 'flex flex-wrap gap-2');
    var azione = function (testo, fn, pericolo) {
      var b = crea('button', 'px-3 py-1.5 rounded-lg border text-sm font-semibold transition ' + (pericolo ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-gray-300 text-gray-800 hover:bg-gray-50'), testo);
      b.type = 'button';
      b.addEventListener('click', fn);
      bottoni.appendChild(b);
    };
    azione('Scarica in CSV', function () {
      scarica(nomeFile(m.nome) + '.csv', F.esportaCsv(mie), 'text/csv;charset=utf-8');
    });
    azione('Rinomina', function () {
      var nome = prompt('Nuovo nome del mazzo', m.nome);
      if (!nome || !nome.trim()) return;
      m.nome = nome.trim().slice(0, 80);
      salva('mazzi', [m]).then(disegnaMazzi);
    });
    azione('Elimina', function () {
      if (!confirm('Eliminare il mazzo «' + m.nome + '» e le sue ' + mie.length + ' carte da questo dispositivo?')) return;
      var ids = mie.map(function (c) { return c.id; });
      carte = carte.filter(function (c) { return c.mazzo !== m.id; });
      mazzi = mazzi.filter(function (x) { return x.id !== m.id; });
      Promise.all([elimina('carte', ids), elimina('mazzi', [m.id])]).then(disegnaMazzi);
    }, true);
    box.appendChild(bottoni);
    det.appendChild(box);
    return det;
  }

  function disegnaDestinazioni() {
    var sel = el('fc-destinazione');
    var prima = sel.value;
    sel.textContent = '';
    var nuovo = crea('option', null, 'Un mazzo nuovo');
    nuovo.value = '';
    sel.appendChild(nuovo);
    mazzi.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'it'); }).forEach(function (m) {
      var o = crea('option', null, m.nome);
      o.value = m.id;
      sel.appendChild(o);
    });
    if (prima && mazzo(prima)) sel.value = prima;
    el('fc-nome-riga').hidden = !!sel.value;
  }

  // ------------------------------------------------------------ aggiungere carte

  /** Il mazzo in cui aggiungere: quello scelto o uno nuovo. */
  function destinazione(nomeProposto) {
    var id = el('fc-destinazione').value;
    if (id && mazzo(id)) return mazzo(id);
    var nome = el('fc-nome-nuovo').value.trim() || nomeProposto || 'Mazzo senza nome';
    var m = { id: nuovoId('m'), nome: nome.slice(0, 80), creato: Date.now(), nuoveAlGiorno: NUOVE_PREDEFINITE };
    mazzi.push(m);
    return m;
  }

  /** Aggiunge le carte, saltando quelle gia' presenti nel mazzo. */
  function aggiungi(dati, nomeProposto) {
    var m = destinazione(nomeProposto);
    var esistenti = {};
    carteDi(m.id).forEach(function (c) { esistenti[c.domanda + '\u0000' + c.risposta] = true; });
    var adesso = Date.now();
    var base = carteDi(m.id).length;
    var nuove = [];
    var doppie = 0;
    dati.forEach(function (d) {
      var c = F.nuovaCarta(d, m.id, adesso, nuovoId('c'), base + nuove.length);
      var k = c.domanda + '\u0000' + c.risposta;
      if (!c.domanda || !c.risposta) return;
      if (esistenti[k]) { doppie++; return; }
      esistenti[k] = true;
      nuove.push(c);
    });
    carte = carte.concat(nuove);
    return Promise.all([salva('mazzi', [m]), salva('carte', nuove)]).then(function () {
      el('fc-destinazione').value = m.id;
      el('fc-nome-nuovo').value = '';
      disegnaMazzi();
      return { mazzo: m, aggiunte: nuove.length, doppie: doppie };
    });
  }

  function resoconto(r, extra) {
    var parti = [r.aggiunte === 1 ? '1 carta aggiunta' : r.aggiunte + ' carte aggiunte', 'al mazzo «' + r.mazzo.nome + '»'];
    var testo = parti.join(' ') + '.';
    if (r.doppie) testo += ' ' + r.doppie + (r.doppie === 1 ? ' era già presente.' : ' erano già presenti.');
    return testo + (extra || '');
  }

  function leggiApkg(file) {
    return Promise.all([
      caricaScript(LIB.fflate, 'fflate'),
      caricaScript(LIB.fzstd, 'fzstd'),
      caricaScript(LIB.sqljs, 'initSqlJs').then(function (init) {
        return init({ locateFile: function (f) { return LIB.sqljsCartella + f; } });
      }),
      file.arrayBuffer()
    ]).then(function (x) {
      return F.leggiApkg(new Uint8Array(x[3]), { unzipSync: x[0].unzipSync, decompress: x[1].decompress, SQL: x[2] });
    });
  }

  el('fc-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    var input = this;
    if (!file) return;
    var nome = file.name.replace(/\.[^.]+$/, '');
    var estensione = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1];
    estensione = estensione ? estensione.toLowerCase() : '';
    messaggio('fc-esito', 'Sto leggendo ' + file.name + '…');
    var lavoro;
    if (estensione === 'apkg' || estensione === 'colpkg') {
      lavoro = leggiApkg(file).then(function (r) {
        if (!r.carte.length) throw new Error('Nel mazzo di Anki non ho trovato carte con domanda e risposta.');
        var extra = '';
        if (r.immagini || r.suoni) extra = ' Immagini e audio non si importano: ne ho tolti ' + (r.immagini + r.suoni) + '.';
        return aggiungi(r.carte, r.mazzo || nome).then(function (x) { return resoconto(x, extra); });
      });
    } else if (estensione === 'json') {
      lavoro = file.text().then(ripristina);
    } else {
      lavoro = file.text().then(function (testo) {
        var r = F.leggiTesto(testo);
        if (!r.carte.length) throw new Error('Non ho trovato righe con domanda e risposta separate da punto e virgola, virgola o tabulazione.');
        return aggiungi(r.carte, nome).then(function (x) {
          return resoconto(x, r.scartate ? ' ' + r.scartate + (r.scartate === 1 ? ' riga senza risposta è stata saltata.' : ' righe senza risposta sono state saltate.') : '');
        });
      });
    }
    lavoro.then(function (testo) { messaggio('fc-esito', testo); }, function (e) {
      messaggio('fc-esito', e && e.message && !/^\/vendor\//.test(e.message) ? e.message : 'Non sono riuscito a leggere il file. Se sei senza connessione, riprova quando torna.', true);
    }).then(function () { input.value = ''; });
  });

  el('fc-importa-testo').addEventListener('click', function () {
    var r = F.leggiTesto(el('fc-testo').value);
    if (!r.carte.length) {
      messaggio('fc-esito', 'Scrivi una domanda per riga, con la risposta dopo un punto e virgola: Capitale d’Italia;Roma', true);
      return;
    }
    aggiungi(r.carte).then(function (x) {
      el('fc-testo').value = '';
      messaggio('fc-esito', resoconto(x, r.scartate ? ' Saltate ' + r.scartate + ' righe senza risposta.' : ''));
    });
  });

  el('fc-aggiungi-una').addEventListener('click', function () {
    var d = { domanda: el('fc-domanda').value, risposta: el('fc-risposta').value, errate: el('fc-errate').value.split('\n') };
    if (!d.domanda.trim() || !d.risposta.trim()) {
      messaggio('fc-esito', 'Scrivi sia la domanda sia la risposta.', true);
      return;
    }
    aggiungi([d]).then(function (x) {
      ['fc-domanda', 'fc-risposta', 'fc-errate'].forEach(function (id) { el(id).value = ''; });
      el('fc-domanda').focus();
      messaggio('fc-esito', x.aggiunte ? 'Carta aggiunta al mazzo «' + x.mazzo.nome + '».' : 'Questa carta c’è già nel mazzo.');
    });
  });

  el('fc-destinazione').addEventListener('change', function () { el('fc-nome-riga').hidden = !!this.value; });

  el('fc-esempio').addEventListener('click', function () {
    el('fc-destinazione').value = '';
    el('fc-nome-nuovo').value = '';
    aggiungi(ESEMPIO.map(function (r) { return { domanda: r[0], risposta: r[1], errate: r.slice(2) }; }), 'Costituzione italiana (esempio)').then(function (x) {
      messaggio('fc-esito', resoconto(x, ' Premi «Studia» per cominciare.'));
    });
  });

  // ------------------------------------------------------------ copia di sicurezza

  el('fc-esporta-tutto').addEventListener('click', function () {
    if (!carte.length) { messaggio('fc-esito-backup', 'Non ci sono ancora carte da salvare.', true); return; }
    scarica('flashcard-' + oggi() + '.json', F.esportaJson(mazzi, carte, Date.now()), 'application/json');
    messaggio('fc-esito-backup', 'Scaricato: conservalo per ripristinare mazzi e ripassi su un altro dispositivo.');
  });

  el('fc-ripristina').addEventListener('change', function () {
    var file = this.files && this.files[0];
    var input = this;
    if (!file) return;
    file.text().then(ripristina).then(function (t) { messaggio('fc-esito-backup', t); }, function (e) {
      messaggio('fc-esito-backup', e.message || 'Il file non si legge.', true);
    }).then(function () { input.value = ''; });
  });

  function ripristina(testo) {
    var r = F.leggiJson(testo, Date.now());
    if (!confirm('Ripristinare ' + r.mazzi.length + ' mazzi e ' + r.carte.length + ' carte? I mazzi uguali già presenti vengono sostituiti.')) return 'Ripristino annullato.';
    var ids = {};
    r.mazzi.forEach(function (m) { ids[m.id] = true; });
    var vecchie = carte.filter(function (c) { return ids[c.mazzo]; }).map(function (c) { return c.id; });
    mazzi = mazzi.filter(function (m) { return !ids[m.id]; }).concat(r.mazzi);
    carte = carte.filter(function (c) { return !ids[c.mazzo]; }).concat(r.carte);
    return elimina('carte', vecchie).then(function () {
      return Promise.all([salva('mazzi', r.mazzi), salva('carte', r.carte)]);
    }).then(function () {
      disegnaMazzi();
      return 'Ripristinati ' + r.mazzi.length + ' mazzi e ' + r.carte.length + ' carte, con i ripassi.';
    });
  }

  // ------------------------------------------------------------ studio

  var studio = null;   // { mazzo, pianificatore, carta, girata }

  function mostraVista(id) {
    ['fc-vista-mazzi', 'fc-studio', 'fc-quiz'].forEach(function (v) { el(v).hidden = v !== id; });
    el('fc-app').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function torna() {
    studio = null;
    quizStato = null;
    mostraVista('fc-vista-mazzi');
    disegnaMazzi();
  }

  function iniziaStudio(idMazzo) {
    messaggio('fc-esito', '');
    caricaScript(LIB.fsrs, 'FSRS').then(function (FSRS) {
      studio = { mazzo: mazzo(idMazzo), pianificatore: F.pianificatore(FSRS), carta: null, girata: false };
      el('fc-studio-titolo').textContent = studio.mazzo.nome;
      mostraVista('fc-studio');
      prossimaCarta();
    }, function () {
      messaggio('fc-esito', 'Non sono riuscito ad aprire il ripasso. Se sei senza connessione, riprova quando torna.', true);
    });
  }

  function prossimaCarta() {
    var mie = carteDi(studio.mazzo.id);
    var adesso = Date.now();
    var n = F.conteggi(mie, adesso, studio.mazzo.nuoveAlGiorno);
    el('fc-conta-nuove').textContent = n.nuove;
    el('fc-conta-imparare').textContent = n.apprendimento;
    el('fc-conta-ripassare').textContent = n.ripasso;
    studio.carta = F.prossima(mie, adesso, studio.mazzo.nuoveAlGiorno);
    studio.girata = false;
    var fine = !studio.carta;
    el('fc-carta').hidden = fine;
    el('fc-fine').hidden = !fine;
    if (fine) {
      el('fc-fine-testo').textContent = n.prossima
        ? 'Il prossimo ripasso di questo mazzo è fra ' + F.formatoIntervallo(n.prossima - adesso) + '. Torna allora: ripassare al momento giusto è quello che fa ricordare.'
        : 'Hai visto tutte le carte di questo mazzo.';
      el('fc-fine-torna').focus();
      return;
    }
    el('fc-fronte').textContent = studio.carta.domanda;
    el('fc-retro').textContent = studio.carta.risposta;
    el('fc-retro-box').hidden = true;
    el('fc-voti').hidden = true;
    el('fc-mostra').hidden = false;
    el('fc-mostra').focus();
  }

  function gira() {
    if (!studio || !studio.carta || studio.girata) return;
    studio.girata = true;
    var tempi = studio.pianificatore.anteprima(studio.carta, Date.now());
    [1, 2, 3, 4].forEach(function (v) { el('fc-tempo-' + v).textContent = F.formatoIntervallo(tempi[v]); });
    el('fc-retro-box').hidden = false;
    el('fc-mostra').hidden = true;
    el('fc-voti').hidden = false;
    el('fc-voto-3').focus();
  }

  function vota(voto) {
    if (!studio || !studio.carta || !studio.girata) return;
    var nuova = studio.pianificatore.valuta(studio.carta, voto, Date.now());
    carte = carte.map(function (c) { return c.id === nuova.id ? nuova : c; });
    salva('carte', [nuova]);
    contaRipasso();
    prossimaCarta();
  }

  el('fc-mostra').addEventListener('click', gira);
  [1, 2, 3, 4].forEach(function (v) { el('fc-voto-' + v).addEventListener('click', function () { vota(v); }); });
  el('fc-studio-esci').addEventListener('click', torna);
  el('fc-fine-torna').addEventListener('click', torna);

  // ------------------------------------------------------------ quiz

  var quizStato = null;   // { mazzo, domande, i, giuste, errori, risposto }

  function apriQuiz(idMazzo) {
    quizStato = { mazzo: mazzo(idMazzo) };
    el('fc-quiz-titolo').textContent = quizStato.mazzo.nome;
    el('fc-quiz-inizio').hidden = false;
    el('fc-quiz-gioco').hidden = true;
    el('fc-quiz-fine').hidden = true;
    messaggio('fc-quiz-avviso', '');
    mostraVista('fc-quiz');
    el('fc-quiz-via').focus();
  }

  function iniziaQuiz(sorgente) {
    var quante = el('fc-quiz-quante').value === 'tutte' ? Infinity : Number(el('fc-quiz-quante').value);
    var domande = F.quiz(sorgente || carteDi(quizStato.mazzo.id), quante, Math.random);
    if (!domande.length) {
      messaggio('fc-quiz-avviso', 'Per il quiz servono almeno due carte con risposte diverse.', true);
      return;
    }
    quizStato.domande = domande;
    quizStato.i = 0;
    quizStato.giuste = 0;
    quizStato.errori = [];
    el('fc-quiz-inizio').hidden = true;
    el('fc-quiz-fine').hidden = true;
    el('fc-quiz-gioco').hidden = false;
    mostraDomanda();
  }

  function mostraDomanda() {
    var d = quizStato.domande[quizStato.i];
    quizStato.risposto = false;
    el('fc-quiz-progresso').textContent = 'Domanda ' + (quizStato.i + 1) + ' di ' + quizStato.domande.length;
    el('fc-quiz-punti').textContent = quizStato.giuste + ' giuste';
    el('fc-quiz-domanda').textContent = d.domanda;
    var lista = el('fc-quiz-opzioni');
    lista.textContent = '';
    d.opzioni.forEach(function (o, k) {
      var li = crea('li');
      var b = crea('button', 'w-full text-left rounded-xl border-2 border-gray-200 bg-white hover:border-indigo-400 px-4 py-3 text-sm sm:text-base text-gray-900 transition flex gap-3 items-start');
      b.type = 'button';
      b.setAttribute('data-opzione', String(k));
      b.appendChild(crea('span', 'font-bold text-indigo-700', 'ABCDEFGH'[k]));
      b.appendChild(crea('span', 'whitespace-pre-line', o));
      b.addEventListener('click', function () { rispondi(k); });
      li.appendChild(b);
      lista.appendChild(li);
    });
    el('fc-quiz-esito').textContent = '';
    el('fc-quiz-avanti').hidden = true;
    var primo = lista.querySelector('button');
    if (primo) primo.focus();
  }

  function rispondi(k) {
    if (!quizStato || quizStato.risposto) return;
    var d = quizStato.domande[quizStato.i];
    quizStato.risposto = true;
    var giusta = k === d.giusta;
    if (giusta) quizStato.giuste++; else quizStato.errori.push(d);
    [].forEach.call(el('fc-quiz-opzioni').querySelectorAll('button'), function (b) {
      var j = Number(b.getAttribute('data-opzione'));
      b.disabled = true;
      b.classList.remove('border-gray-200', 'bg-white', 'hover:border-indigo-400');
      if (j === d.giusta) b.classList.add('border-emerald-600', 'bg-emerald-50');
      else if (j === k) b.classList.add('border-red-600', 'bg-red-50');
      else b.classList.add('border-gray-200', 'bg-white', 'opacity-60');
    });
    el('fc-quiz-esito').textContent = giusta ? 'Giusta!' : 'Sbagliata. La risposta giusta è la ' + 'ABCDEFGH'[d.giusta] + ': ' + d.opzioni[d.giusta];
    el('fc-quiz-esito').className = 'mt-4 text-sm font-semibold ' + (giusta ? 'text-emerald-800' : 'text-red-700');
    el('fc-quiz-punti').textContent = quizStato.giuste + ' giuste';
    var avanti = el('fc-quiz-avanti');
    avanti.textContent = quizStato.i + 1 < quizStato.domande.length ? 'Avanti' : 'Vedi il risultato';
    avanti.hidden = false;
    avanti.focus();
  }

  function avanti() {
    if (!quizStato || !quizStato.risposto) return;
    quizStato.i++;
    if (quizStato.i < quizStato.domande.length) { mostraDomanda(); return; }
    var tot = quizStato.domande.length;
    el('fc-quiz-gioco').hidden = true;
    el('fc-quiz-fine').hidden = false;
    el('fc-quiz-risultato').textContent = quizStato.giuste + ' giuste su ' + tot + ' (' + Math.round(100 * quizStato.giuste / tot) + '%)';
    var lista = el('fc-quiz-errori');
    lista.textContent = '';
    quizStato.errori.forEach(function (d) {
      var li = crea('li', 'rounded-lg border border-red-100 bg-red-50 p-3');
      li.appendChild(crea('p', 'font-semibold text-gray-900 whitespace-pre-line', d.domanda));
      li.appendChild(crea('p', 'mt-1 text-emerald-800 whitespace-pre-line', '✓ ' + d.opzioni[d.giusta]));
      lista.appendChild(li);
    });
    el('fc-quiz-errori-titolo').hidden = !quizStato.errori.length;
    el('fc-quiz-ripeti').hidden = !quizStato.errori.length;
    el('fc-quiz-risultato').focus();
  }

  el('fc-quiz-via').addEventListener('click', function () { iniziaQuiz(); });
  el('fc-quiz-avanti').addEventListener('click', avanti);
  el('fc-quiz-ripeti').addEventListener('click', function () {
    var ids = {};
    quizStato.errori.forEach(function (d) { ids[d.id] = true; });
    el('fc-quiz-quante').value = 'tutte';
    // le alternative si prendono sempre da tutto il mazzo
    var tutte = carteDi(quizStato.mazzo.id);
    var domande = F.quiz(tutte, Infinity, Math.random).filter(function (d) { return ids[d.id]; });
    quizStato.domande = domande;
    quizStato.i = 0;
    quizStato.giuste = 0;
    quizStato.errori = [];
    el('fc-quiz-fine').hidden = true;
    el('fc-quiz-gioco').hidden = false;
    mostraDomanda();
  });
  el('fc-quiz-nuovo').addEventListener('click', function () { apriQuiz(quizStato.mazzo.id); });
  el('fc-quiz-esci').addEventListener('click', torna);
  el('fc-quiz-esci-2').addEventListener('click', torna);

  // ------------------------------------------------------------ tastiera

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    // Spazio e Invio su un pulsante lo premono gia' da soli.
    var suPulsante = t && /^(BUTTON|A|SUMMARY)$/.test(t.tagName) && (e.key === ' ' || e.key === 'Enter');
    if (!el('fc-studio').hidden && studio && studio.carta) {
      if (!studio.girata && (e.key === ' ' || e.key === 'Enter') && !suPulsante) { e.preventDefault(); gira(); return; }
      if (studio.girata && /^[1-4]$/.test(e.key)) { e.preventDefault(); vota(Number(e.key)); }
      return;
    }
    if (!el('fc-quiz').hidden && quizStato && quizStato.domande && !el('fc-quiz-gioco').hidden) {
      var k = '1234abcd'.indexOf(e.key.toLowerCase());
      if (!quizStato.risposto && k >= 0) {
        k = k % 4;
        if (k < quizStato.domande[quizStato.i].opzioni.length) { e.preventDefault(); rispondi(k); }
        return;
      }
      if (quizStato.risposto && e.key === 'Enter' && !suPulsante) { e.preventDefault(); avanti(); }
    }
  });

  // ------------------------------------------------------------ esempio

  // Un piccolo mazzo per provare: la Costituzione, con le risposte sbagliate
  // per il quiz. Numeri verificati sul testo in vigore (riforma del 2020 sul
  // numero dei parlamentari, voto per il Senato dai 18 anni dal 2021).
  var ESEMPIO = [
    ['In che anno è entrata in vigore la Costituzione italiana?', '1948', '1946', '1945', '1950'],
    ['Secondo l’articolo 1, l’Italia è una Repubblica democratica fondata…', 'sul lavoro', 'sulla famiglia', 'sulla libertà', 'sulla proprietà privata'],
    ['Quale articolo afferma che tutti i cittadini sono uguali davanti alla legge?', 'L’articolo 3', 'L’articolo 1', 'L’articolo 2', 'L’articolo 13'],
    ['Quale articolo dice che l’Italia ripudia la guerra?', 'L’articolo 11', 'L’articolo 1', 'L’articolo 21', 'L’articolo 52'],
    ['Quale articolo tutela la libertà di manifestare il proprio pensiero?', 'L’articolo 21', 'L’articolo 11', 'L’articolo 32', 'L’articolo 48'],
    ['A chi spetta la funzione legislativa?', 'Alle due Camere', 'Al Governo', 'Al Presidente della Repubblica', 'Alla Corte costituzionale'],
    ['Quanti sono i deputati, dopo la riforma del 2020?', '400', '630', '315', '200'],
    ['Quanti sono i senatori elettivi, dopo la riforma del 2020?', '200', '315', '400', '100'],
    ['Quanto dura una legislatura?', '5 anni', '4 anni', '6 anni', '7 anni'],
    ['Chi elegge il Presidente della Repubblica?', 'Il Parlamento in seduta comune, con i delegati delle Regioni', 'I cittadini, con il voto diretto', 'Il Senato', 'Il Governo'],
    ['Quanto dura il mandato del Presidente della Repubblica?', '7 anni', '5 anni', '6 anni', '9 anni'],
    ['Quanti anni servono per essere eletti Presidente della Repubblica?', '50', '40', '45', '35'],
    ['Chi nomina il Presidente del Consiglio dei ministri?', 'Il Presidente della Repubblica', 'Il Parlamento in seduta comune', 'La Camera dei deputati', 'I cittadini'],
    ['Chi presiede il Consiglio superiore della magistratura?', 'Il Presidente della Repubblica', 'Il Ministro della giustizia', 'Il Primo presidente della Corte di cassazione', 'Il Presidente del Senato'],
    ['Da quanti giudici è composta la Corte costituzionale?', '15', '9', '12', '21'],
    ['Da quale età si vota per il Senato?', '18 anni', '25 anni', '21 anni', '16 anni']
  ];

  // ------------------------------------------------------------ avvio

  apri().then(function () {
    return Promise.all([leggiTutto('mazzi'), leggiTutto('carte')]);
  }).then(function (x) {
    mazzi = x[0] || [];
    carte = x[1] || [];
    disegnaMazzi();
  }, function () {
    avvisaSalvataggio();
    disegnaMazzi();
  });
})();
