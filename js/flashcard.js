// js/flashcard.js — Il motore delle flashcard: importazione, ripasso e quiz.
//
// - Legge domande e risposte da testo incollato o da file CSV/TSV:
//     domanda;risposta
//     domanda;risposta giusta;sbagliata;sbagliata...   (per i quiz)
// - Legge i mazzi di Anki (.apkg): lo zip, il database SQLite dentro e,
//   nei file recenti, la compressione zstd. Le librerie (fflate, sql.js,
//   fzstd) si passano dall'esterno: qui c'e' solo la logica.
// - Decide quando ripassare ogni carta con FSRS (libreria ts-fsrs, passata
//   dall'esterno), l'algoritmo di ripasso distanziato usato anche da Anki.
// - Prepara i quiz a risposta multipla ed esporta in CSV e in JSON.
//
// Niente DOM: funziona nel browser (window.Flashcard) e in Node.
(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./giornaliero.js') : root.Giornaliero);
  if (node) module.exports = api;
  if (root) root.Flashcard = api;
})(typeof self !== 'undefined' ? self : globalThis, function (G) {
  'use strict';

  var MAX_TESTO = 4000;          // caratteri per domanda o risposta
  var MAX_ERRATE = 8;
  var ANTICIPO_MS = 20 * 60000;  // le carte "in apprendimento" si possono anticipare di 20 minuti

  // ------------------------------------------------------------ testo

  function pulisci(s) {
    return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ')
      .split('\n').map(function (r) { return r.trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TESTO);
  }

  var ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', egrave: 'è', eacute: 'é', agrave: 'à', aacute: 'á',
    igrave: 'ì', iacute: 'í', ograve: 'ò', oacute: 'ó', ugrave: 'ù', uacute: 'ú', Egrave: 'È', Eacute: 'É', Agrave: 'À',
    Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
    hellip: '…', ndash: '–', mdash: '—', deg: '°', euro: '€', times: '×', divide: '÷', middot: '·', ccedil: 'ç', ntilde: 'ñ' };

  function decodifica(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (tutto, e) {
      if (e[0] === '#') {
        var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return Object.prototype.hasOwnProperty.call(ENTITA, e) ? ENTITA[e] : tutto;
    });
  }

  /**
   * Dall'HTML di una carta di Anki al testo semplice. Immagini e suoni non
   * si importano: si contano, per avvisare.
   */
  function testoDaHtml(html) {
    var s = String(html || '');
    var immagini = (s.match(/<img\b/gi) || []).length;
    var suoni = (s.match(/\[sound:[^\]]*\]/g) || []).length;
    s = s.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/\[sound:[^\]]*\]/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li|tr|h[1-6])>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]*>/g, '');
    return { testo: pulisci(decodifica(s)), immagini: immagini, suoni: suoni };
  }

  // ------------------------------------------------------------ CSV e testo incollato

  function scegliSeparatore(testo) {
    var righe = testo.split('\n').filter(function (r) { return r.trim(); }).slice(0, 20);
    var candidati = ['\t', ';', '|', ','];
    for (var i = 0; i < candidati.length; i++) {
      var c = candidati[i];
      var conSep = righe.filter(function (r) { return r.indexOf(c) >= 0; }).length;
      if (righe.length && conSep >= Math.ceil(righe.length * 0.6)) return c;
    }
    return null;
  }

  // Un CSV "vero": campi fra virgolette, con "" per le virgolette e anche a capo dentro.
  function righeCsv(testo, sep) {
    var righe = [], campo = '', riga = [], virgolette = false;
    for (var i = 0; i < testo.length; i++) {
      var ch = testo[i];
      if (virgolette) {
        if (ch === '"') {
          if (testo[i + 1] === '"') { campo += '"'; i++; } else virgolette = false;
        } else campo += ch;
      } else if (ch === '"' && campo.trim() === '') {
        virgolette = true; campo = '';
      } else if (ch === sep) {
        riga.push(campo); campo = '';
      } else if (ch === '\n') {
        riga.push(campo); righe.push(riga); riga = []; campo = '';
      } else campo += ch;
    }
    if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
    return righe;
  }

  var INTESTAZIONE = /^(domanda|domande|question|front|fronte|quesito|testo)$/i;

  /**
   * Carte da un testo con una carta per riga.
   * @returns {{carte: Array, scartate: number, separatore: string|null}}
   */
  function leggiTesto(testo) {
    var t = String(testo || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var sep = scegliSeparatore(t);
    var fuori = { carte: [], scartate: 0, separatore: sep };
    if (!sep) {
      fuori.scartate = t.split('\n').filter(function (r) { return r.trim(); }).length;
      return fuori;
    }
    righeCsv(t, sep).forEach(function (campi, n) {
      campi = campi.map(pulisci);
      if (!campi.some(Boolean)) return;
      if (n === 0 && INTESTAZIONE.test(campi[0])) return;
      var domanda = campi[0], risposta = campi[1] || '';
      if (!domanda || !risposta) { fuori.scartate++; return; }
      var errate = campi.slice(2).filter(function (x) { return x && x !== risposta; }).slice(0, MAX_ERRATE);
      fuori.carte.push({ domanda: domanda, risposta: risposta, errate: errate });
    });
    return fuori;
  }

  function campoCsv(s, sep) {
    s = String(s == null ? '' : s);
    return s.indexOf(sep) >= 0 || /["\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** Le carte in CSV con il punto e virgola, riapribile con Excel e reimportabile qui. */
  function esportaCsv(carte) {
    var righe = ['domanda;risposta;sbagliate'];
    carte.forEach(function (c) {
      righe.push([c.domanda, c.risposta].concat(c.errate || []).map(function (x) { return campoCsv(x, ';'); }).join(';'));
    });
    return '﻿' + righe.join('\r\n') + '\r\n';
  }

  // ------------------------------------------------------------ Anki

  /**
   * Il testo con i buchi di Anki: {{c1::Roma}} o {{c1::Roma::citta'}}.
   * Una carta per ogni numero: nella domanda il buco diventa [...] (o
   * [suggerimento]), gli altri restano scritti.
   */
  function cloze(testo) {
    var re = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
    var numeri = {};
    var m;
    while ((m = re.exec(testo))) numeri[m[1]] = true;
    var pieno = testo.replace(re, function (x, n, parola) { return parola; });
    return Object.keys(numeri).sort(function (a, b) { return a - b; }).map(function (n) {
      var domanda = testo.replace(re, function (x, k, parola, aiuto) {
        return k === n ? '[' + (aiuto || '...') + ']' : parola;
      });
      var risposte = [];
      testo.replace(re, function (x, k, parola) { if (k === n) risposte.push(parola); return x; });
      return { domanda: domanda, risposta: risposte.join(', '), contesto: pieno };
    });
  }

  function interrogazione(db, sql) {
    try {
      var r = db.exec(sql);
      if (!r.length) return [];
      return r[0].values.map(function (v) {
        var o = {};
        r[0].columns.forEach(function (c, i) { o[c] = v[i]; });
        return o;
      });
    } catch (e) { return null; }
  }

  function nomiMazzi(db) {
    var nomi = {};
    // Anki 2.1.50 e successivi: tabella decks, livelli separati da \x1f
    var righe = interrogazione(db, 'SELECT id, name FROM decks');
    if (righe) {
      righe.forEach(function (r) { nomi[r.id] = String(r.name).split('\x1f').join(' › '); });
      return nomi;
    }
    // Prima: un JSON nella tabella col
    var col = interrogazione(db, 'SELECT decks FROM col');
    if (col && col[0]) {
      try {
        var d = JSON.parse(col[0].decks);
        Object.keys(d).forEach(function (id) { nomi[id] = String(d[id].name).split('::').join(' › '); });
      } catch (e) { /* mazzi senza nome */ }
    }
    return nomi;
  }

  /**
   * Le carte da un file .apkg di Anki.
   * @param {Uint8Array} byte   il file
   * @param {object} lib        { unzipSync (fflate), SQL (sql.js pronto), decompress (fzstd) }
   * @returns {{carte, mazzo, immagini, suoni, note, cloze}}
   */
  function leggiApkg(byte, lib) {
    var file;
    try { file = lib.unzipSync(byte); } catch (e) { throw new Error('Il file non è un pacchetto di Anki valido.'); }
    var dati;
    if (file['collection.anki21b']) {
      if (!lib.decompress) throw new Error('Manca il decompressore zstd.');
      dati = lib.decompress(file['collection.anki21b']);
    } else {
      dati = file['collection.anki21'] || file['collection.anki2'];
    }
    if (!dati) throw new Error('Nel file non c’è una raccolta di Anki.');
    var db = new lib.SQL.Database(dati);
    try {
      var note = interrogazione(db, 'SELECT n.id AS id, n.flds AS flds, (SELECT c.did FROM cards c WHERE c.nid = n.id ORDER BY c.ord LIMIT 1) AS did FROM notes n ORDER BY n.id');
      if (!note) throw new Error('La raccolta di Anki non si legge.');
      var mazzi = nomiMazzi(db);
      var fuori = { carte: [], mazzo: '', immagini: 0, suoni: 0, note: note.length, cloze: 0 };
      var conteggio = {};
      note.forEach(function (n) {
        var campi = String(n.flds || '').split('\x1f').map(function (f) {
          var t = testoDaHtml(f);
          fuori.immagini += t.immagini;
          fuori.suoni += t.suoni;
          return t.testo;
        });
        if (n.did != null && mazzi[n.did]) conteggio[mazzi[n.did]] = (conteggio[mazzi[n.did]] || 0) + 1;
        var buchi = /\{\{c\d+::/.test(campi[0]) ? cloze(campi[0]) : [];
        if (buchi.length) {
          fuori.cloze++;
          var extra = campi.slice(1).filter(Boolean).join('\n');
          buchi.forEach(function (b) {
            fuori.carte.push({ domanda: b.domanda, risposta: b.risposta + (b.contesto !== b.risposta ? '\n\n' + b.contesto : '') + (extra ? '\n\n' + extra : ''), errate: [] });
          });
          return;
        }
        var domanda = campi[0];
        var risposta = campi.slice(1).filter(Boolean).join('\n');
        if (domanda && risposta) fuori.carte.push({ domanda: domanda, risposta: risposta, errate: [] });
      });
      // Il nome del mazzo con piu' carte, se non e' quello predefinito
      var nomi = Object.keys(conteggio).sort(function (a, b) { return conteggio[b] - conteggio[a]; });
      if (nomi.length && !/^(Default|Predefinito)$/i.test(nomi[0])) fuori.mazzo = nomi[0];
      return fuori;
    } finally {
      db.close();
    }
  }

  // ------------------------------------------------------------ carte e FSRS

  var STATO = { nuova: 0, apprendimento: 1, ripasso: 2, riapprendimento: 3 };

  function statoVuoto(adesso) {
    return { due: adesso, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null };
  }

  /** Una carta pronta da salvare: testo pulito e stato di ripasso "nuova". */
  function nuovaCarta(dati, mazzo, adesso, id, ordine) {
    return {
      id: id, mazzo: mazzo, ordine: Number(ordine) || 0,
      domanda: pulisci(dati.domanda), risposta: pulisci(dati.risposta),
      errate: (dati.errate || []).map(pulisci).filter(Boolean).slice(0, MAX_ERRATE),
      creata: adesso, prima: null,
      fsrs: statoVuoto(adesso)
    };
  }

  function aFsrs(s) {
    return {
      due: new Date(s.due), stability: s.stability, difficulty: s.difficulty,
      elapsed_days: s.elapsed_days, scheduled_days: s.scheduled_days, learning_steps: s.learning_steps || 0,
      reps: s.reps, lapses: s.lapses, state: s.state,
      last_review: s.last_review ? new Date(s.last_review) : undefined
    };
  }

  function daFsrs(c) {
    return {
      due: +c.due, stability: c.stability, difficulty: c.difficulty,
      elapsed_days: c.elapsed_days, scheduled_days: c.scheduled_days, learning_steps: c.learning_steps || 0,
      reps: c.reps, lapses: c.lapses, state: c.state,
      last_review: c.last_review ? +c.last_review : null
    };
  }

  /**
   * Il calendario dei ripassi. FSRS = la libreria ts-fsrs.
   * opzioni.casuale = false toglie la piccola variazione casuale degli
   * intervalli (serve ai test).
   */
  function pianificatore(FSRS, opzioni) {
    var o = opzioni || {};
    var f = FSRS.fsrs(FSRS.generatorParameters({
      request_retention: o.ritenzione || 0.9,
      maximum_interval: 3650,
      enable_fuzz: o.casuale !== false
    }));
    return {
      /** La carta dopo la risposta: 1 = di nuovo, 2 = difficile, 3 = bene, 4 = facile. */
      valuta: function (carta, voto, adesso) {
        if (!(voto >= 1 && voto <= 4)) throw new Error('Voto non valido');
        var r = f.next(aFsrs(carta.fsrs), new Date(adesso), voto);
        var nuova = Object.assign({}, carta, { fsrs: daFsrs(r.card) });
        if (!nuova.prima) nuova.prima = adesso;
        return nuova;
      },
      /** Fra quanto tornerebbe la carta per ognuno dei quattro voti, in millisecondi. */
      anteprima: function (carta, adesso) {
        var r = f.repeat(aFsrs(carta.fsrs), new Date(adesso));
        var fuori = {};
        [1, 2, 3, 4].forEach(function (v) { fuori[v] = +r[v].card.due - adesso; });
        return fuori;
      }
    };
  }

  function giornoDi(ms) { return G.oggiInItalia(new Date(ms)); }

  /** Quante carte nuove si sono gia' viste oggi. */
  function nuoveDiOggi(carte, oggi) {
    return carte.filter(function (c) { return c.prima && giornoDi(c.prima) === oggi; }).length;
  }

  /**
   * I numeri di un mazzo per oggi.
   * @returns {{nuove, apprendimento, ripasso, totale, imparate, prossima}}
   */
  function conteggi(carte, adesso, limiteNuove) {
    var oggi = giornoDi(adesso);
    var n = { nuove: 0, apprendimento: 0, ripasso: 0, totale: carte.length, imparate: 0, prossima: null };
    var nuoveTotali = 0;
    carte.forEach(function (c) {
      var s = c.fsrs;
      if (s.state === STATO.nuova) { nuoveTotali++; return; }
      if (s.state === STATO.ripasso) n.imparate++;
      var dovuta = s.state === STATO.ripasso ? giornoDi(s.due) <= oggi : s.due <= adesso + ANTICIPO_MS;
      if (dovuta) {
        if (s.state === STATO.ripasso) n.ripasso++; else n.apprendimento++;
      } else if (n.prossima === null || s.due < n.prossima) {
        n.prossima = s.due;
      }
    });
    n.nuove = Math.min(nuoveTotali, Math.max(0, limiteNuove - nuoveDiOggi(carte, oggi)));
    return n;
  }

  /**
   * La prossima carta da studiare, o null se per ora non c'e' niente:
   * prima quelle "in apprendimento" gia' scadute, poi i ripassi di oggi,
   * poi le nuove fino al limite del giorno, infine le carte in
   * apprendimento che scadono nei prossimi 20 minuti.
   */
  function prossima(carte, adesso, limiteNuove) {
    var oggi = giornoDi(adesso);
    var meglio = function (lista, prima) {
      return lista.length ? lista.reduce(function (a, b) { return prima(b, a) ? b : a; }) : null;
    };
    var perScadenza = function (a, b) { return a.fsrs.due < b.fsrs.due; };
    // le nuove nell'ordine in cui sono state aggiunte
    var perOrdine = function (a, b) { return a.creata !== b.creata ? a.creata < b.creata : (a.ordine || 0) < (b.ordine || 0); };
    var inApprendimento = carte.filter(function (c) { return c.fsrs.state === STATO.apprendimento || c.fsrs.state === STATO.riapprendimento; });
    var subito = meglio(inApprendimento.filter(function (c) { return c.fsrs.due <= adesso; }), perScadenza);
    if (subito) return subito;
    var ripasso = meglio(carte.filter(function (c) { return c.fsrs.state === STATO.ripasso && giornoDi(c.fsrs.due) <= oggi; }), perScadenza);
    if (ripasso) return ripasso;
    if (nuoveDiOggi(carte, oggi) < limiteNuove) {
      var nuova = meglio(carte.filter(function (c) { return c.fsrs.state === STATO.nuova; }), perOrdine);
      if (nuova) return nuova;
    }
    return meglio(inApprendimento.filter(function (c) { return c.fsrs.due <= adesso + ANTICIPO_MS; }), perScadenza);
  }

  /** "1 min", "10 min", "3 h", "4 g", "2,5 mesi", "1,2 anni". */
  function formatoIntervallo(ms) {
    var min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return min + ' min';
    var ore = min / 60;
    if (ore < 24) return Math.round(ore) + ' h';
    var giorni = ore / 24;
    if (giorni < 30) return Math.round(giorni) + ' g';
    var mesi = giorni / 30.44;
    if (giorni < 360) return (Math.round(mesi * 10) / 10).toString().replace('.', ',') + (mesi < 1.05 ? ' mese' : ' mesi');
    var anni = giorni / 365.25;
    return (Math.round(anni * 10) / 10).toString().replace('.', ',') + (anni < 1.05 ? ' anno' : ' anni');
  }

  // ------------------------------------------------------------ quiz

  function mescola(v, rng) {
    for (var i = v.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = v[i]; v[i] = v[j]; v[j] = t;
    }
    return v;
  }

  /**
   * Domande a risposta multipla: le risposte sbagliate scritte nella carta,
   * poi, se non bastano, le risposte giuste di altre carte dello stesso mazzo.
   * @param {Array} carte
   * @param {number} quante
   * @param {function} rng  numeri fra 0 e 1 (Math.random o Giornaliero.casuale)
   * @returns {Array<{id, domanda, opzioni, giusta}>}
   */
  function quiz(carte, quante, rng) {
    var tutteRisposte = [];
    var viste = {};
    carte.forEach(function (c) {
      var k = c.risposta.toLowerCase();
      if (!viste[k] && c.risposta.length <= 300) { viste[k] = true; tutteRisposte.push(c.risposta); }
    });
    var scelte = mescola(carte.slice(), rng).slice(0, quante);
    var fuori = [];
    scelte.forEach(function (c) {
      var giusta = c.risposta;
      var usate = {};
      usate[giusta.toLowerCase()] = true;
      var opzioni = [];
      mescola((c.errate || []).slice(), rng).forEach(function (e) {
        if (opzioni.length < 3 && !usate[e.toLowerCase()]) { usate[e.toLowerCase()] = true; opzioni.push(e); }
      });
      if (opzioni.length < 3) {
        mescola(tutteRisposte.slice(), rng).forEach(function (e) {
          if (opzioni.length < 3 && !usate[e.toLowerCase()]) { usate[e.toLowerCase()] = true; opzioni.push(e); }
        });
      }
      if (!opzioni.length) return;
      opzioni.push(giusta);
      mescola(opzioni, rng);
      fuori.push({ id: c.id, domanda: c.domanda, opzioni: opzioni, giusta: opzioni.indexOf(giusta) });
    });
    return fuori;
  }

  // ------------------------------------------------------------ copia di sicurezza

  var FORMATO = 'strumentiutili-flashcard';

  function esportaJson(mazzi, carte, adesso) {
    return JSON.stringify({ formato: FORMATO, versione: 1, creato: new Date(adesso).toISOString(), mazzi: mazzi, carte: carte });
  }

  function numero(x, predefinito) { var n = Number(x); return isFinite(n) ? n : predefinito; }

  /** Rilegge una copia di sicurezza, scartando quello che non torna. */
  function leggiJson(testo, adesso) {
    var d;
    try { d = JSON.parse(String(testo).replace(/^﻿/, '')); } catch (e) { throw new Error('Il file non è una copia di sicurezza valida.'); }
    if (!d || d.formato !== FORMATO || !Array.isArray(d.mazzi) || !Array.isArray(d.carte)) throw new Error('Il file non è una copia di sicurezza delle flashcard.');
    var mazzi = d.mazzi.filter(function (m) { return m && m.id != null && m.nome; }).map(function (m) {
      return { id: String(m.id), nome: pulisci(m.nome).slice(0, 80), creato: numero(m.creato, adesso), nuoveAlGiorno: Math.max(0, Math.min(500, numero(m.nuoveAlGiorno, 20))) };
    });
    var idMazzi = {};
    mazzi.forEach(function (m) { idMazzi[m.id] = true; });
    var carte = d.carte.filter(function (c) { return c && c.id != null && idMazzi[String(c.mazzo)] && c.domanda && c.risposta; }).map(function (c) {
      var base = nuovaCarta(c, String(c.mazzo), numero(c.creata, adesso), String(c.id), numero(c.ordine, 0));
      var s = c.fsrs && typeof c.fsrs === 'object' ? c.fsrs : {};
      if (s.state >= 0 && s.state <= 3) {
        base.fsrs = {
          due: numero(s.due, adesso), stability: numero(s.stability, 0), difficulty: numero(s.difficulty, 0),
          elapsed_days: numero(s.elapsed_days, 0), scheduled_days: numero(s.scheduled_days, 0), learning_steps: numero(s.learning_steps, 0),
          reps: numero(s.reps, 0), lapses: numero(s.lapses, 0), state: s.state, last_review: s.last_review ? numero(s.last_review, null) : null
        };
      }
      base.prima = c.prima ? numero(c.prima, null) : null;
      return base;
    });
    return { mazzi: mazzi, carte: carte };
  }

  return {
    testoDaHtml: testoDaHtml, leggiTesto: leggiTesto, esportaCsv: esportaCsv,
    cloze: cloze, leggiApkg: leggiApkg,
    nuovaCarta: nuovaCarta, pianificatore: pianificatore, conteggi: conteggi, prossima: prossima,
    formatoIntervallo: formatoIntervallo, quiz: quiz, esportaJson: esportaJson, leggiJson: leggiJson,
    STATO: STATO
  };
});
