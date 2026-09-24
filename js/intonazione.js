// js/intonazione.js — Riconoscere la nota che suona, per l'accordatore.
//
// L'algoritmo e' YIN (de Cheveigne' e Kawahara, 2002): cerca il ritardo per
// cui il segnale somiglia di piu' a se stesso, con la differenza normalizzata
// che evita l'errore classico degli accordatori semplici, scambiare una corda
// per la sua ottava. Poi la frequenza diventa nota, ottava e scarto in cent.
//
// Niente dipendenze e niente audio qui dentro: riceve un Float32Array di
// campioni, cosi' si prova in Node con segnali sintetici.
// Funziona nel browser (window.Intonazione) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Intonazione = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /**
   * Frequenza fondamentale di un blocco di campioni, o null se e' silenzio o
   * rumore senza altezza.
   * @param {Float32Array|number[]} x   campioni in [-1, 1]
   * @param {number} sr                 frequenza di campionamento
   * @param {object} o                  { fMin: 30, fMax: 1400, soglia: 0.12, rmsMinimo: 0.008 }
   * @returns {{ frequenza: number, chiarezza: number, rms: number } | null}
   */
  function yin(x, sr, o) {
    var opz = o || {};
    var fMin = opz.fMin || 30, fMax = opz.fMax || 1400;
    var soglia = opz.soglia || 0.12;
    var rmsMinimo = opz.rmsMinimo === undefined ? 0.008 : opz.rmsMinimo;

    var n = x.length;
    var somma = 0;
    for (var i = 0; i < n; i++) somma += x[i] * x[i];
    var rms = Math.sqrt(somma / n);
    if (rms < rmsMinimo) return null;

    var tauMin = Math.max(2, Math.floor(sr / fMax));
    var tauMax = Math.min(Math.floor(sr / fMin), Math.floor(n / 2));
    var W = n - tauMax;
    if (tauMax <= tauMin + 2 || W < 32) return null;

    // differenza d(tau) e sua versione normalizzata cumulativa d'(tau)
    var d = new Float64Array(tauMax + 2);
    for (var tau = 1; tau <= tauMax + 1; tau++) {
      var s = 0;
      for (var j = 0; j < W; j++) {
        var diff = x[j] - x[j + tau];
        s += diff * diff;
      }
      d[tau] = s;
    }
    var dn = new Float64Array(tauMax + 2);
    dn[0] = 1;
    var cumulata = 0;
    for (tau = 1; tau <= tauMax + 1; tau++) {
      cumulata += d[tau];
      dn[tau] = cumulata > 0 ? d[tau] * tau / cumulata : 1;
    }

    // La prima "valle" sotto la soglia, e dentro la valle il punto piu'
    // basso: col rumore il fondo della valle ha tante piccole buche, e
    // fermarsi alla prima sposterebbe la nota di decine di cent.
    // Se nessuna valle scende sotto la soglia, il minimo assoluto.
    var scelto = -1;
    for (tau = tauMin; tau <= tauMax; tau++) {
      if (dn[tau] < soglia) {
        scelto = tau;
        while (tau + 1 <= tauMax && dn[tau + 1] < soglia) {
          tau++;
          if (dn[tau] < dn[scelto]) scelto = tau;
        }
        break;
      }
    }
    if (scelto < 0) {
      // Nessuna valle sotto la soglia (suono sporco o rumoroso): si prende la
      // prima valle profonda quasi quanto la piu' profonda. Il minimo assoluto
      // cade spesso su un multiplo del periodo, cioe' un'ottava sotto.
      var minimo = Infinity;
      for (tau = tauMin; tau <= tauMax; tau++) if (dn[tau] < minimo) minimo = dn[tau];
      if (minimo > 0.35) return null;   // niente di periodico
      var quasi = minimo + 0.1 * (1 - minimo);
      for (tau = tauMin; tau <= tauMax; tau++) {
        if (dn[tau] <= quasi) {
          scelto = tau;
          while (tau + 1 <= tauMax && dn[tau + 1] <= quasi) {
            tau++;
            if (dn[tau] < dn[scelto]) scelto = tau;
          }
          break;
        }
      }
    }

    // Controllo d'ottava: se una frazione del periodo scelto (1/2, 1/3...) ha
    // una valle profonda quasi uguale, il periodo vero e' quello piu' corto.
    // Succede col rumore: la soglia la supera per caso un multiplo.
    for (var m = 6; m >= 2; m--) {
      var tm = scelto / m;
      if (tm < tauMin) continue;
      var raggio = 2 + Math.round(tm * 0.04);
      var migliore = -1;
      for (tau = Math.max(tauMin, Math.floor(tm - raggio)); tau <= Math.min(tauMax, Math.ceil(tm + raggio)); tau++) {
        if (migliore < 0 || dn[tau] < dn[migliore]) migliore = tau;
      }
      if (migliore > 0 && dn[migliore] <= dn[scelto] + 0.08) { scelto = migliore; break; }
    }

    // Il fondo della valle si stima con una parabola ai minimi quadrati su
    // una finestra larga il 4% del periodo, ricentrata due volte. Con tre
    // soli punti (la ricetta classica) il rumore sposta il minimo di decine
    // di cent sulle note gravi, dove la valle e' larga e piatta. Si lavora
    // sulla differenza grezza d: quella normalizzata ha una pendenza.
    var t = scelto;
    var stima = t;
    for (var giro = 0; giro < 3; giro++) {
      var centro = Math.round(stima);
      var k = Math.max(2, Math.round(centro * 0.04));
      if (centro - k < 1 || centro + k > tauMax + 1) { k = Math.min(centro - 1, tauMax + 1 - centro); }
      if (k < 1) break;
      var S0 = 0, S2 = 0, S4 = 0, Sy = 0, Suy = 0, Su2y = 0;
      for (var u = -k; u <= k; u++) {
        var y = d[centro + u];
        S0++; S2 += u * u; S4 += u * u * u * u; Sy += y; Suy += u * y; Su2y += u * u * y;
      }
      var A = (S0 * Su2y - S2 * Sy) / (S0 * S4 - S2 * S2);
      var B = Suy / S2;
      if (!(A > 0)) break;
      var vertice = -B / (2 * A);
      if (Math.abs(vertice) > k) break;
      stima = centro + vertice;
    }
    var spostamento = stima - t;
    return { frequenza: sr / (t + spostamento), chiarezza: Math.max(0, 1 - dn[t]), rms: rms };
  }

  /** Dimezza la frequenza di campionamento con una media a coppie (passa-basso grezzo). */
  function dimezza(x) {
    var y = new Float32Array(Math.floor(x.length / 2));
    for (var i = 0; i < y.length; i++) y[i] = 0.5 * (x[2 * i] + x[2 * i + 1]);
    return y;
  }

  // ------------------------------------------------------------ note

  var NOMI = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  var NOMI_INGLESI = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

  function frequenzaMidi(midi, la) { return (la || 440) * Math.pow(2, (midi - 69) / 12); }

  /**
   * La nota piu' vicina a una frequenza, con lo scarto in cent (100 cent =
   * un semitono). Ottave all'inglese: il La del diapason e' La4 / A4.
   */
  function nota(frequenza, la) {
    if (!(frequenza > 0)) return null;
    var riferimento = la || 440;
    var esatto = 69 + 12 * Math.log2(frequenza / riferimento);
    var midi = Math.round(esatto);
    return {
      midi: midi,
      nome: NOMI[((midi % 12) + 12) % 12],
      inglese: NOMI_INGLESI[((midi % 12) + 12) % 12],
      ottava: Math.floor(midi / 12) - 1,
      cent: (esatto - midi) * 100,
      frequenzaEsatta: frequenzaMidi(midi, riferimento)
    };
  }

  function cent(frequenza, obiettivo) { return 1200 * Math.log2(frequenza / obiettivo); }

  // Le accordature in numeri MIDI, nell'ordine delle corde (per l'ukulele
  // il Sol acuto viene prima: e' l'accordatura rientrante classica).
  var ACCORDATURE = {
    chitarra: { nome: 'Chitarra (standard)', corde: [40, 45, 50, 55, 59, 64] },
    'chitarra-drop-d': { nome: 'Chitarra drop D', corde: [38, 45, 50, 55, 59, 64] },
    basso: { nome: 'Basso a 4 corde', corde: [28, 33, 38, 43] },
    'basso-5': { nome: 'Basso a 5 corde', corde: [23, 28, 33, 38, 43] },
    ukulele: { nome: 'Ukulele', corde: [67, 60, 64, 69] },
    violino: { nome: 'Violino', corde: [55, 62, 69, 76] },
    viola: { nome: 'Viola', corde: [48, 55, 62, 69] },
    violoncello: { nome: 'Violoncello', corde: [36, 43, 50, 57] },
    mandolino: { nome: 'Mandolino', corde: [55, 62, 69, 76] }
  };

  /** La corda dell'accordatura piu' vicina alla frequenza, con lo scarto. */
  function cordaPiuVicina(frequenza, strumento, la) {
    var a = ACCORDATURE[strumento];
    if (!a || !(frequenza > 0)) return null;
    var migliore = null;
    a.corde.forEach(function (midi, i) {
      var f = frequenzaMidi(midi, la);
      var c = cent(frequenza, f);
      if (!migliore || Math.abs(c) < Math.abs(migliore.cent)) {
        migliore = { indice: i, midi: midi, frequenza: f, cent: c, nota: nota(f, la) };
      }
    });
    return migliore;
  }

  /** Mediana delle ultime letture: toglie i salti di una lettura sbagliata. */
  function mediana(valori) {
    if (!valori.length) return null;
    var v = valori.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  return {
    yin: yin, dimezza: dimezza, nota: nota, cent: cent, frequenzaMidi: frequenzaMidi,
    ACCORDATURE: ACCORDATURE, cordaPiuVicina: cordaPiuVicina, mediana: mediana, NOMI: NOMI
  };
});
