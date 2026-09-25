// js/sudoku.js — Il motore del sudoku del giorno.
//
// Ogni giorno, per ogni livello, lo stesso sudoku per tutti: il seme e' la
// data italiana, e il generatore usa solo aritmetica intera deterministica,
// quindi ogni browser costruisce la stessa griglia senza server e senza
// archivio da aggiornare.
//
// Ogni sudoku ha una sola soluzione, ha gli indizi disposti in simmetria
// come sui giornali, e il livello si misura con le tecniche che servono a
// risolverlo senza tirare a indovinare:
//   facile     ~38 indizi, bastano i "singoli" (l'unico numero possibile)
//   medio      ~30 indizi, bastano i singoli
//   difficile  pochi indizi, servono intersezioni o coppie; mai tentativi
//
// La griglia e' un array di 81 numeri, riga per riga; 0 = casella vuota.
// Data italiana, casualita' e serie arrivano da js/giornaliero.js, da
// caricare prima. Funziona nel browser (window.Sudoku) e in Node.
(function (root, factory) {
  'use strict';
  var G = typeof module === 'object' && module.exports ? require('./giornaliero.js') : root.Giornaliero;
  var api = factory(G);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Sudoku = api;
})(typeof self !== 'undefined' ? self : globalThis, function (G) {
  'use strict';

  var TUTTI = 0x3fe;   // bit 1..9

  // ------------------------------------------------------------ casualita'

  var casuale = G.casuale;

  function mescola(v, rng) {
    for (var i = v.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = v[i]; v[i] = v[j]; v[j] = t;
    }
    return v;
  }

  // ------------------------------------------------------------ geometria

  function riga(i) { return Math.floor(i / 9); }
  function colonna(i) { return i % 9; }
  function riquadro(i) { return Math.floor(riga(i) / 3) * 3 + Math.floor(colonna(i) / 3); }

  // Le 27 unita' (9 righe, 9 colonne, 9 riquadri) come elenchi di caselle,
  // e per ogni casella le 20 caselle che "vede".
  var UNITA = [];
  var VICINI = [];
  (function () {
    var r, c, b, i;
    for (r = 0; r < 9; r++) { var u = []; for (c = 0; c < 9; c++) u.push(r * 9 + c); UNITA.push(u); }
    for (c = 0; c < 9; c++) { var v = []; for (r = 0; r < 9; r++) v.push(r * 9 + c); UNITA.push(v); }
    for (b = 0; b < 9; b++) {
      var w = [];
      for (i = 0; i < 81; i++) if (riquadro(i) === b) w.push(i);
      UNITA.push(w);
    }
    for (i = 0; i < 81; i++) {
      var vicini = [];
      for (var j = 0; j < 81; j++) {
        if (j !== i && (riga(j) === riga(i) || colonna(j) === colonna(i) || riquadro(j) === riquadro(i))) vicini.push(j);
      }
      VICINI.push(vicini);
    }
  })();

  function bit(n) {
    var c = 0;
    while (n) { n &= n - 1; c++; }
    return c;
  }

  function cifra(maschera) {
    for (var d = 1; d <= 9; d++) if (maschera === 1 << d) return d;
    return 0;
  }

  // ------------------------------------------------------------ soluzioni

  /**
   * Conta le soluzioni fino a "limite" (2 basta per sapere se e' unica).
   * Backtracking con maschere di bit, sempre sulla casella con meno scelte.
   * Se "rng" c'e', prova le cifre in ordine casuale e si ferma alla prima
   * soluzione, che restituisce: serve a costruire una griglia piena.
   */
  function cerca(griglia, limite, rng) {
    var g = griglia.slice();
    var R = [0, 0, 0, 0, 0, 0, 0, 0, 0], C = R.slice(), B = R.slice();
    for (var i = 0; i < 81; i++) {
      if (!g[i]) continue;
      var m = 1 << g[i];
      if ((R[riga(i)] | C[colonna(i)] | B[riquadro(i)]) & m) return { conteggio: 0, soluzione: null };
      R[riga(i)] |= m; C[colonna(i)] |= m; B[riquadro(i)] |= m;
    }
    var conteggio = 0, soluzione = null;
    function passo() {
      var migliore = -1, maschera = 0, scelte = 10;
      for (var i = 0; i < 81; i++) {
        if (g[i]) continue;
        var m = TUTTI & ~(R[riga(i)] | C[colonna(i)] | B[riquadro(i)]);
        var n = bit(m);
        if (n === 0) return;
        if (n < scelte) { migliore = i; maschera = m; scelte = n; if (n === 1) break; }
      }
      if (migliore < 0) {
        conteggio++;
        if (!soluzione) soluzione = g.slice();
        return;
      }
      var cifre = [];
      for (var d = 1; d <= 9; d++) if (maschera & (1 << d)) cifre.push(d);
      if (rng) mescola(cifre, rng);
      var r = riga(migliore), c = colonna(migliore), b = riquadro(migliore);
      for (var k = 0; k < cifre.length; k++) {
        var bitCifra = 1 << cifre[k];
        g[migliore] = cifre[k];
        R[r] |= bitCifra; C[c] |= bitCifra; B[b] |= bitCifra;
        passo();
        R[r] &= ~bitCifra; C[c] &= ~bitCifra; B[b] &= ~bitCifra;
        g[migliore] = 0;
        if (conteggio >= limite) return;
      }
    }
    passo();
    return { conteggio: conteggio, soluzione: soluzione };
  }

  function contaSoluzioni(griglia, limite) { return cerca(griglia, limite || 2).conteggio; }
  function risolvi(griglia) { return cerca(griglia, 1).soluzione; }

  // ------------------------------------------------------------ logica

  /**
   * Risolve come una persona, senza tentativi: singoli nudi e nascosti,
   * poi intersezioni (riquadro-riga/colonna) e coppie nude. Dice quali
   * tecniche sono servite e se e' arrivato in fondo.
   */
  function risolviLogico(griglia) {
    var g = griglia.slice();
    var cand = [];
    var usate = {};
    var i, j, d, u;
    for (i = 0; i < 81; i++) cand.push(g[i] ? 0 : TUTTI);
    for (i = 0; i < 81; i++) {
      if (!g[i]) continue;
      for (j = 0; j < 20; j++) cand[VICINI[i][j]] &= ~(1 << g[i]);
    }
    function metti(i, d) {
      g[i] = d; cand[i] = 0;
      for (var k = 0; k < 20; k++) cand[VICINI[i][k]] &= ~(1 << d);
    }
    function singoli() {
      var fatto = false;
      for (var i = 0; i < 81; i++) {
        if (g[i]) continue;
        if (!cand[i]) return null;   // contraddizione
        var d = cifra(cand[i]);
        if (d) { metti(i, d); usate.singoli = true; fatto = true; }
      }
      for (var u = 0; u < 27; u++) {
        for (var d2 = 1; d2 <= 9; d2++) {
          var m = 1 << d2, dove = -1, quante = 0, presente = false;
          for (var k = 0; k < 9; k++) {
            var c = UNITA[u][k];
            if (g[c] === d2) { presente = true; break; }
            if (cand[c] & m) { quante++; dove = c; }
          }
          if (!presente && quante === 1) { metti(dove, d2); usate.singoli = true; fatto = true; }
        }
      }
      return fatto;
    }
    function intersezioni() {
      var fatto = false;
      for (var b = 18; b < 27; b++) {
        for (var d = 1; d <= 9; d++) {
          var m = 1 << d, celle = UNITA[b].filter(function (c) { return cand[c] & m; });
          if (celle.length < 2) continue;
          // tutte in una riga o in una colonna: fuori dal riquadro, via
          [riga, colonna].forEach(function (linea, t) {
            var l = linea(celle[0]);
            if (!celle.every(function (c) { return linea(c) === l; })) return;
            UNITA[t * 9 + l].forEach(function (c) {
              if (riquadro(c) !== b - 18 && (cand[c] & m)) { cand[c] &= ~m; fatto = true; }
            });
          });
        }
      }
      for (var u = 0; u < 18; u++) {
        for (var d3 = 1; d3 <= 9; d3++) {
          var m3 = 1 << d3, celle3 = UNITA[u].filter(function (c) { return cand[c] & m3; });
          if (celle3.length < 2) continue;
          var q = riquadro(celle3[0]);
          if (!celle3.every(function (c) { return riquadro(c) === q; })) continue;
          UNITA[18 + q].forEach(function (c) {
            if (UNITA[u].indexOf(c) < 0 && (cand[c] & m3)) { cand[c] &= ~m3; fatto = true; }
          });
        }
      }
      if (fatto) usate.intersezioni = true;
      return fatto;
    }
    function coppie() {
      var fatto = false;
      for (var u = 0; u < 27; u++) {
        var celle = UNITA[u];
        for (var a = 0; a < 9; a++) {
          var ma = cand[celle[a]];
          if (bit(ma) !== 2) continue;
          for (var b = a + 1; b < 9; b++) {
            if (cand[celle[b]] !== ma) continue;
            for (var k = 0; k < 9; k++) {
              if (k === a || k === b) continue;
              if (cand[celle[k]] & ma) { cand[celle[k]] &= ~ma; fatto = true; }
            }
          }
        }
      }
      if (fatto) usate.coppie = true;
      return fatto;
    }
    for (var giri = 0; giri < 500; giri++) {
      var s = singoli();
      if (s === null) break;
      if (s) continue;
      if (g.indexOf(0) < 0) break;
      if (intersezioni()) continue;
      if (coppie()) continue;
      break;
    }
    return { risolto: g.indexOf(0) < 0 && valida(g), griglia: g, tecniche: Object.keys(usate).sort() };
  }

  // ------------------------------------------------------------ controlli

  /** Le caselle che ripetono un numero nella stessa riga, colonna o riquadro. */
  function conflitti(valori) {
    var fuori = {};
    for (var u = 0; u < 27; u++) {
      var visti = {};
      for (var k = 0; k < 9; k++) {
        var c = UNITA[u][k], v = valori[c];
        if (!v) continue;
        if (visti[v] !== undefined) { fuori[c] = true; fuori[visti[v]] = true; } else visti[v] = c;
      }
    }
    return Object.keys(fuori).map(Number).sort(function (a, b) { return a - b; });
  }

  function valida(g) {
    return g.length === 81 && g.every(function (v) { return v >= 1 && v <= 9; }) && conflitti(g).length === 0;
  }

  // ------------------------------------------------------------ generatore

  var LIVELLI = {
    facile: { indizi: 38, tecniche: ['singoli'] },
    medio: { indizi: 30, tecniche: ['singoli'] },
    difficile: { indizi: 0, tecniche: null }
  };

  function tentativo(seme, livello) {
    var rng = casuale(seme);
    var piena = cerca(new Array(81).fill(0), 1, rng).soluzione;
    var g = piena.slice();
    // Si tolgono coppie di caselle simmetriche rispetto al centro, come sui
    // giornali, finche' la soluzione resta unica.
    var ordine = [];
    for (var i = 0; i <= 40; i++) ordine.push(i);
    mescola(ordine, rng);
    var obiettivo = LIVELLI[livello].indizi;
    var indizi = 81;
    for (var k = 0; k < ordine.length && indizi > obiettivo; k++) {
      var a = ordine[k], b = 80 - a;
      var va = g[a], vb = g[b];
      g[a] = 0; g[b] = 0;
      if (contaSoluzioni(g, 2) !== 1) { g[a] = va; g[b] = vb; continue; }
      indizi -= a === b ? 1 : 2;
    }
    var logica = risolviLogico(g);
    if (!logica.risolto) return null;   // servirebbero tentativi: scartato
    var solo = LIVELLI[livello].tecniche;
    if (solo && logica.tecniche.some(function (t) { return solo.indexOf(t) < 0; })) return null;
    if (!solo && logica.tecniche.length < 2) return null;   // difficile: non bastano i singoli
    return { griglia: g, soluzione: piena, indizi: indizi, tecniche: logica.tecniche };
  }

  /**
   * Il sudoku di una data per un livello. Stessa data e stesso livello danno
   * sempre la stessa griglia.
   * @param {string} data 'AAAA-MM-GG'
   * @param {string} livello 'facile' | 'medio' | 'difficile'
   */
  function delGiorno(data, livello) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) throw new Error('Data non valida');
    if (!LIVELLI[livello]) throw new Error('Livello non valido');
    for (var n = 0; n < 200; n++) {
      var r = tentativo('strumentiutili|sudoku|' + data + '|' + livello + '|' + n, livello);
      if (r) {
        r.data = data; r.livello = livello; r.tentativi = n + 1;
        return r;
      }
    }
    throw new Error('Nessun sudoku trovato');
  }

  // ------------------------------------------------------------ partite

  function formatoTempo(secondi) {
    var t = Math.max(0, Math.floor(secondi || 0));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }

  var NOMI_LIVELLI = { facile: 'Facile', medio: 'Medio', difficile: 'Difficile' };

  /** Il messaggio da mandare su WhatsApp: niente numeri della griglia. */
  function testoCondivisione(o) {
    var p = o.data.split('-');
    var righe = [
      'Sudoku del giorno ' + p[2] + '/' + p[1] + '/' + p[0] + ' \u00b7 ' + NOMI_LIVELLI[o.livello],
      '\u2705 Risolto in ' + formatoTempo(o.tempo) + (o.aiuti ? ' con ' + (o.aiuti === 1 ? '1 aiuto' : o.aiuti + ' aiuti') : ' senza aiuti')
    ];
    if (o.serie > 1) righe.push('\ud83d\udd25 ' + o.serie + ' giorni di fila');
    righe.push(o.url || 'https://strumentiutili.it/utilita-web/sudoku-del-giorno/');
    return righe.join('\n');
  }

  return {
    delGiorno: delGiorno, oggiInItalia: G.oggiInItalia, LIVELLI: Object.keys(LIVELLI), NOMI_LIVELLI: NOMI_LIVELLI,
    giornoPrima: G.giornoPrima, aggiornaSerie: G.aggiornaSerie, serieAttuale: G.serieAttuale,
    formatoTempo: formatoTempo, testoCondivisione: testoCondivisione,
    contaSoluzioni: contaSoluzioni, risolvi: risolvi, risolviLogico: risolviLogico,
    conflitti: conflitti, valida: valida, casuale: casuale,
    riga: riga, colonna: colonna, riquadro: riquadro, VICINI: VICINI
  };
});
