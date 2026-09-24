// js/metronomo.js — Il tempo del metronomo, senza audio.
//
// Qui si decide QUANDO suona ogni colpo; il suono lo fa js/metronomo-ui.js
// con Web Audio. Lo schema e' quello classico dei metronomi web ("A tale of
// two clocks"): un timer leggero chiede ogni 25 ms i colpi dei prossimi
// 100 ms, e Web Audio li suona all'istante esatto del suo orologio. Ogni
// colpo si calcola come inizio + n * intervallo, non sommando intervalli:
// dopo un'ora il metronomo e' ancora a tempo al microsecondo.
//
// Funziona nel browser (window.Metronomo) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Metronomo = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var BPM_MIN = 30, BPM_MAX = 250;

  // Accenti per battito: 'forte' il primo, 'medio' l'inizio dei gruppi nei
  // tempi composti e irregolari, 'debole' gli altri.
  var MISURE = {
    '2/4': ['forte', 'debole'],
    '3/4': ['forte', 'debole', 'debole'],
    '4/4': ['forte', 'debole', 'debole', 'debole'],
    '5/4': ['forte', 'debole', 'debole', 'medio', 'debole'],
    '6/8': ['forte', 'debole', 'debole', 'medio', 'debole', 'debole'],
    '7/8': ['forte', 'debole', 'medio', 'debole', 'medio', 'debole', 'debole'],
    '9/8': ['forte', 'debole', 'debole', 'medio', 'debole', 'debole', 'medio', 'debole', 'debole'],
    '12/8': ['forte', 'debole', 'debole', 'medio', 'debole', 'debole', 'medio', 'debole', 'debole', 'medio', 'debole', 'debole'],
    '1/4': ['forte']
  };

  // Le indicazioni di tempo, in italiano come sugli spartiti di tutto il mondo.
  var TEMPI = [
    [0, 'Grave'], [45, 'Largo'], [60, 'Larghetto'], [66, 'Adagio'], [76, 'Andante'],
    [108, 'Moderato'], [120, 'Allegro'], [156, 'Vivace'], [176, 'Presto'], [200, 'Prestissimo']
  ];

  function limita(bpm) {
    var n = Math.round(Number(bpm));
    if (!isFinite(n)) return 100;
    return Math.min(BPM_MAX, Math.max(BPM_MIN, n));
  }

  function nomeTempo(bpm) {
    var nome = TEMPI[0][1];
    for (var i = 0; i < TEMPI.length; i++) if (bpm >= TEMPI[i][0]) nome = TEMPI[i][1];
    return nome;
  }

  /**
   * Il BPM dai tocchi sul pulsante "Tap": mediana degli intervalli degli
   * ultimi tocchi. Una pausa di oltre 2 secondi ricomincia il conto.
   * @param {number[]} tocchi istanti in millisecondi, in ordine
   * @returns {number|null}
   */
  function bpmDaTocchi(tocchi) {
    var t = [];
    for (var i = tocchi.length - 1; i >= 0 && t.length < 9; i--) {
      if (t.length && t[0] - tocchi[i] > 2000) break;
      t.unshift(tocchi[i]);
    }
    if (t.length < 2) return null;
    var intervalli = [];
    for (var k = 1; k < t.length; k++) intervalli.push(t[k] - t[k - 1]);
    intervalli.sort(function (a, b) { return a - b; });
    var m = Math.floor(intervalli.length / 2);
    var mediana = intervalli.length % 2 ? intervalli[m] : (intervalli[m - 1] + intervalli[m]) / 2;
    return limita(60000 / mediana);
  }

  /**
   * Un nuovo stato di riproduzione che parte all'istante "inizio" (secondi
   * dell'orologio audio).
   * @param {object} o { bpm, misura: '4/4', suddivisione: 1|2|3|4 }
   */
  function avvia(o, inizio) {
    return {
      bpm: limita(o.bpm),
      misura: MISURE[o.misura] ? o.misura : '4/4',
      suddivisione: [1, 2, 3, 4].indexOf(o.suddivisione) >= 0 ? o.suddivisione : 1,
      inizio: inizio,
      n: 0            // quanti colpi (suddivisioni comprese) sono gia' stati pianificati
    };
  }

  /**
   * I colpi da suonare fino all'istante "finoA". Modifica stato.n.
   * @returns {{ tempo: number, tipo: string, battito: number, sotto: number }[]}
   */
  function pianifica(stato, finoA) {
    var accenti = MISURE[stato.misura];
    var passo = 60 / stato.bpm / stato.suddivisione;
    var fuori = [];
    for (;;) {
      var tempo = stato.inizio + stato.n * passo;
      if (tempo >= finoA) break;
      var sotto = stato.n % stato.suddivisione;
      var battito = Math.floor(stato.n / stato.suddivisione) % accenti.length;
      fuori.push({ tempo: tempo, tipo: sotto ? 'sotto' : accenti[battito], battito: battito, sotto: sotto });
      stato.n++;
    }
    return fuori;
  }

  /**
   * Cambiare BPM o misura mentre suona senza saltare un colpo: il nuovo
   * tempo parte dal prossimo colpo gia' previsto, dall'inizio della misura se
   * cambia la misura.
   */
  function cambia(stato, o) {
    var passo = 60 / stato.bpm / stato.suddivisione;
    var prossimo = stato.inizio + stato.n * passo;
    var nuovo = avvia({
      bpm: o.bpm === undefined ? stato.bpm : o.bpm,
      misura: o.misura === undefined ? stato.misura : o.misura,
      suddivisione: o.suddivisione === undefined ? stato.suddivisione : o.suddivisione
    }, prossimo);
    if (nuovo.misura === stato.misura) {
      // si resta allo stesso punto della misura
      var battito = Math.floor(stato.n / stato.suddivisione) % MISURE[stato.misura].length;
      var sotto = stato.n % stato.suddivisione;
      if (sotto) {
        // a meta' di una suddivisione: si riparte dal battito dopo
        nuovo.inizio = stato.inizio + (Math.floor(stato.n / stato.suddivisione) + 1) * stato.suddivisione * passo;
        battito = (battito + 1) % MISURE[stato.misura].length;
      }
      nuovo.inizio -= battito * 60 / nuovo.bpm;
      nuovo.n = battito * nuovo.suddivisione;
    }
    return nuovo;
  }

  return {
    BPM_MIN: BPM_MIN, BPM_MAX: BPM_MAX, MISURE: MISURE, TEMPI: TEMPI,
    limita: limita, nomeTempo: nomeTempo, bpmDaTocchi: bpmDaTocchi,
    avvia: avvia, pianifica: pianifica, cambia: cambia
  };
});
