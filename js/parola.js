// js/parola.js — Il motore della "Parola del giorno".
//
// Ogni giorno una parola di cinque lettere, la stessa per tutti: il numero
// del giorno sceglie la parola dall'elenco (js/parole-soluzioni.js), quindi
// non serve un server. Si hanno sei tentativi; dopo ogni tentativo ogni
// lettera diventa:
//   giusta    la lettera c'e' ed e' al posto giusto
//   presente  la lettera c'e' ma in un altro posto
//   assente   la lettera non c'e' (o ci sono gia' tutte quelle che servono)
//
// Servono, caricati prima: js/giornaliero.js, js/parole-soluzioni.js e
// js/parole-valide.js. Funziona nel browser (window.Parola) e in Node.
(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = node
    ? factory(require('./giornaliero.js'), require('./parole-soluzioni.js'), require('./parole-valide.js'))
    : factory(root.Giornaliero, root.ParoleSoluzioni, root.ParoleValide);
  if (node) module.exports = api;
  if (root) root.Parola = api;
})(typeof self !== 'undefined' ? self : globalThis, function (G, SOLUZIONI, VALIDE) {
  'use strict';

  var LETTERE = 5;
  var TENTATIVI = 6;
  // Il giorno numero 1. Si possono rigiocare i giorni dell'archivio, mai
  // quelli prima di questa data.
  var INIZIO = '2026-09-01';
  var URL_PAGINA = 'https://strumentiutili.it/utilita-web/parola-del-giorno/';

  var valide = {};
  VALIDE.forEach(function (p) { valide[p] = true; });
  SOLUZIONI.forEach(function (p) { valide[p] = true; });

  /** Il numero del giorno: 1 il giorno di INIZIO; 0 prima. */
  function numero(data) {
    if (!G.valida(data)) return 0;
    var n = G.giorniFra(INIZIO, data) + 1;
    return n > 0 ? n : 0;
  }

  /** La parola di un giorno: { data, numero, parola }. */
  function delGiorno(data) {
    var n = numero(data);
    if (!n) throw new Error('Data non valida');
    return { data: data, numero: n, parola: SOLUZIONI[(n - 1) % SOLUZIONI.length] };
  }

  /** Solo lettere a-z: toglie accenti, spazi e maiuscole. */
  function normalizza(testo) {
    return String(testo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  }

  function esiste(parola) { return valide[normalizza(parola)] === true; }

  /**
   * Il colore di ogni lettera. Con le lettere doppie si fa come sui giornali:
   * prima si segnano quelle al posto giusto, poi le altre diventano
   * "presente" solo finche' nella parola ce ne sono ancora da trovare.
   * Es. soluzione "palla", tentativo "lilla": l e i assenti, poi l l a giuste.
   */
  function valuta(tentativo, soluzione) {
    var t = normalizza(tentativo), s = normalizza(soluzione);
    if (t.length !== LETTERE || s.length !== LETTERE) throw new Error('Servono ' + LETTERE + ' lettere');
    var esito = new Array(LETTERE);
    var restano = {};
    for (var i = 0; i < LETTERE; i++) {
      if (t[i] === s[i]) esito[i] = 'giusta';
      else restano[s[i]] = (restano[s[i]] || 0) + 1;
    }
    for (var j = 0; j < LETTERE; j++) {
      if (esito[j]) continue;
      if (restano[t[j]]) { esito[j] = 'presente'; restano[t[j]]--; }
      else esito[j] = 'assente';
    }
    return esito;
  }

  var FORZA = { assente: 1, presente: 2, giusta: 3 };

  /** Il colore dei tasti: per ogni lettera provata, il risultato migliore. */
  function tastiera(tentativi, soluzione) {
    var tasti = {};
    tentativi.forEach(function (t) {
      var e = valuta(t, soluzione);
      for (var i = 0; i < LETTERE; i++) {
        var c = normalizza(t)[i];
        if (!tasti[c] || FORZA[e[i]] > FORZA[tasti[c]]) tasti[c] = e[i];
      }
    });
    return tasti;
  }

  var ORDINALI = ['prima', 'seconda', 'terza', 'quarta', 'quinta'];

  /**
   * Modalita' difficile: gli indizi trovati vanno usati. Restituisce il
   * motivo per cui il tentativo non va bene, oppure null.
   */
  function rispettaIndizi(tentativi, soluzione, nuovo) {
    var n = normalizza(nuovo);
    for (var k = 0; k < tentativi.length; k++) {
      var t = normalizza(tentativi[k]);
      var e = valuta(t, soluzione);
      var servono = {};
      for (var i = 0; i < LETTERE; i++) {
        if (e[i] === 'giusta' && n[i] !== t[i]) return 'La ' + ORDINALI[i] + ' lettera deve essere ' + t[i].toUpperCase();
        if (e[i] !== 'assente') servono[t[i]] = (servono[t[i]] || 0) + 1;
      }
      for (var c in servono) {
        var quante = n.split(c).length - 1;
        if (quante < servono[c]) return 'Nella parola ci deve essere ' + (servono[c] > 1 ? servono[c] + ' volte la ' : 'la ') + c.toUpperCase();
      }
    }
    return null;
  }

  /**
   * Controlla un tentativo prima di accettarlo. Restituisce il messaggio da
   * mostrare, oppure null se va bene.
   */
  function problema(tentativo, partita) {
    var t = normalizza(tentativo);
    if (t.length < LETTERE) return 'Servono ' + LETTERE + ' lettere';
    if (!esiste(t)) return 'Non è nell’elenco delle parole';
    if (partita && partita.difficile) return rispettaIndizi(partita.tentativi || [], partita.soluzione, t);
    return null;
  }

  /** Lo stato di una partita dai tentativi fatti. */
  function esito(tentativi, soluzione) {
    var s = normalizza(soluzione);
    var vinta = tentativi.some(function (t) { return normalizza(t) === s; });
    return { vinta: vinta, finita: vinta || tentativi.length >= TENTATIVI, usati: tentativi.length };
  }

  // ------------------------------------------------------------ statistiche

  function statistiche(stat) {
    var s = stat && typeof stat === 'object' ? stat : {};
    var d = Array.isArray(s.distribuzione) ? s.distribuzione.slice(0, TENTATIVI) : [];
    while (d.length < TENTATIVI) d.push(0);
    return {
      giocate: Number(s.giocate) || 0,
      vinte: Number(s.vinte) || 0,
      distribuzione: d.map(function (x) { return Number(x) || 0; }),
      serie: s.serie && typeof s.serie === 'object' ? s.serie : {}
    };
  }

  /**
   * Aggiorna le statistiche a fine partita. Contano solo le partite del
   * giorno: quelle dell'archivio si giocano per divertimento.
   * @param {number} usati quanti tentativi sono serviti (per le vinte)
   */
  function registra(stat, data, oggi, vinta, usati) {
    var s = statistiche(stat);
    if (data !== oggi) return s;
    if (s.serie.ultima === oggi) return s;   // gia' contata
    s.giocate++;
    if (vinta) {
      s.vinte++;
      if (usati >= 1 && usati <= TENTATIVI) s.distribuzione[usati - 1]++;
      s.serie = G.aggiornaSerie(s.serie, data, oggi);
    } else {
      s.serie = G.interrompiSerie(s.serie, data, oggi);
    }
    return s;
  }

  // ------------------------------------------------------------ condivisione

  var QUADRATI = {
    normale: { giusta: '🟩', presente: '🟨', assente: '⬛' },
    daltonico: { giusta: '🟧', presente: '🟦', assente: '⬛' }
  };

  /**
   * Il messaggio da mandare su WhatsApp: solo i colori, niente lettere.
   * o = { data, oggi, tentativi, soluzione, daltonico, difficile, serie }
   */
  function testoCondivisione(o) {
    var q = o.daltonico ? QUADRATI.daltonico : QUADRATI.normale;
    var e = esito(o.tentativi, o.soluzione);
    var righe = ['Parola del giorno n. ' + numero(o.data) + ' · ' + (e.vinta ? e.usati : 'X') + '/' + TENTATIVI + (o.difficile ? '*' : '')];
    o.tentativi.forEach(function (t) {
      righe.push(valuta(t, o.soluzione).map(function (x) { return q[x]; }).join(''));
    });
    if (o.serie > 1) righe.push('🔥 ' + o.serie + ' giorni di fila');
    righe.push(URL_PAGINA + (o.oggi && o.data !== o.oggi ? '?giorno=' + o.data : ''));
    return righe.join('\n');
  }

  return {
    LETTERE: LETTERE, TENTATIVI: TENTATIVI, INIZIO: INIZIO, URL_PAGINA: URL_PAGINA,
    numero: numero, delGiorno: delGiorno, normalizza: normalizza, esiste: esiste,
    valuta: valuta, tastiera: tastiera, rispettaIndizi: rispettaIndizi, problema: problema,
    esito: esito, statistiche: statistiche, registra: registra, testoCondivisione: testoCondivisione,
    oggiInItalia: G.oggiInItalia, giornoPrima: G.giornoPrima, spostaGiorni: G.spostaGiorni,
    serieAttuale: G.serieAttuale, valida: G.valida, quanteParole: SOLUZIONI.length
  };
});
