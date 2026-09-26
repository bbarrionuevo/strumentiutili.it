// js/estratto-contributivo.js — Analisi dell'estratto conto contributivo INPS.
//
// Che cosa risponde: quante settimane hai davvero, dove mancano, e quanto ti
// manca ai requisiti di pensione. Sono le tre domande per cui oggi si va al
// patronato.
//
// Due regole che rendono il conteggio diverso da una semplice somma:
//
//   1. Ai fini pensionistici un anno solare vale al massimo 52 settimane, anche
//      se in quell'anno si e' versato in piu' gestioni contemporaneamente.
//      Sommare i periodi senza questo limite gonfia il totale.
//   2. Un buco fra due periodi non e' di per se' un errore: puo' essere
//      disoccupazione, studio, lavoro all'estero. Lo strumento lo segnala, non
//      lo denuncia.
//
// Funziona nel browser (window.EstrattoContributivo) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EstrattoContributivo = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var SETTIMANE_ANNO = 52;
  var GIORNI_SETTIMANA = 7;

  // Le date si costruiscono sempre in ora locale. new Date('2005-01-01') le
  // interpreta come UTC: a ovest di Greenwich diventano il 31 dicembre 2004, e
  // l'analisi si riempie di anni fantasma con zero settimane.
  function data(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v !== 'string') return null;

    var testo = v.trim();
    if (!testo) return null;

    var m = testo.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (m) {
      var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1));
      return isNaN(d.getTime()) ? null : d;
    }

    var libera = new Date(testo);
    return isNaN(libera.getTime()) ? null : libera;
  }

  function giorniFra(a, b) {
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }

  function anniESettimane(settimane) {
    var s = Math.max(0, Math.round(settimane));
    return { anni: Math.floor(s / SETTIMANE_ANNO), settimane: s % SETTIMANE_ANNO, totale: s };
  }

  // Normalizza e scarta quello che non e' utilizzabile, dicendo perche'.
  function normalizza(periodi) {
    var buoni = [], scartati = [];
    (periodi || []).forEach(function (p, i) {
      var dal = data(p.dal), al = data(p.al);
      if (!dal || !al) { scartati.push({ indice: i, motivo: 'date mancanti o non valide' }); return; }
      if (al < dal) { scartati.push({ indice: i, motivo: 'la data finale precede quella iniziale' }); return; }

      // Se le settimane non sono indicate si ricavano dalla durata.
      var sett = Number(p.settimane);
      if (!Number.isFinite(sett) || sett < 0) {
        sett = Math.round((giorniFra(dal, al) + 1) / GIORNI_SETTIMANA);
      }

      buoni.push({
        dal: dal,
        al: al,
        settimane: sett,
        tipo: p.tipo || 'non indicato',
        gestione: p.gestione || 'non indicata'
      });
    });
    buoni.sort(function (a, b) { return a.dal - b.dal; });
    return { periodi: buoni, scartati: scartati };
  }

  // Settimane per anno solare, con il tetto delle 52.
  function perAnno(periodi) {
    var grezzo = {};
    periodi.forEach(function (p) {
      var primo = p.dal.getFullYear(), ultimo = p.al.getFullYear();
      var giorniTot = giorniFra(p.dal, p.al) + 1;
      for (var anno = primo; anno <= ultimo; anno++) {
        var inizio = anno === primo ? p.dal : new Date(anno, 0, 1);
        var fine = anno === ultimo ? p.al : new Date(anno, 11, 31);
        var quota = giorniTot > 0 ? (giorniFra(inizio, fine) + 1) / giorniTot : 0;
        grezzo[anno] = (grezzo[anno] || 0) + p.settimane * quota;
      }
    });

    var anni = Object.keys(grezzo).map(Number).sort(function (a, b) { return a - b; });
    return anni.map(function (anno) {
      var somma = Math.round(grezzo[anno]);
      return {
        anno: anno,
        settimane: Math.min(somma, SETTIMANE_ANNO),
        settimaneGrezze: somma,
        limitate: somma > SETTIMANE_ANNO,
        completo: Math.min(somma, SETTIMANE_ANNO) >= SETTIMANE_ANNO
      };
    });
  }

  // Intervalli scoperti fra un periodo e il successivo.
  function buchi(periodi, giorniMinimi) {
    var soglia = Number.isFinite(giorniMinimi) ? giorniMinimi : 31;
    var fuori = [];
    for (var i = 1; i < periodi.length; i++) {
      var finePrec = periodi[i - 1].al;
      var inizio = periodi[i].dal;
      // I periodi possono sovrapporsi: in quel caso non c'e' nessun buco.
      var giorni = giorniFra(finePrec, inizio) - 1;
      if (giorni < soglia) continue;
      fuori.push({
        // giorno dopo e giorno prima con il calendario, non con 86.400.000 ms:
        // nei giorni del cambio d'ora un giorno dura 23 o 25 ore
        dal: new Date(finePrec.getFullYear(), finePrec.getMonth(), finePrec.getDate() + 1),
        al: new Date(inizio.getFullYear(), inizio.getMonth(), inizio.getDate() - 1),
        giorni: giorni,
        settimaneMancate: Math.round(giorni / GIORNI_SETTIMANA)
      });
    }
    return fuori;
  }

  function mesiInSettimane(anni, mesi) {
    return Math.round((anni + (mesi || 0) / 12) * SETTIMANE_ANNO);
  }

  // Quanto manca ai requisiti contributivi. L'eta anagrafica non si valuta qui:
  // dipende dalla data di nascita, non dall'estratto conto.
  function requisiti(settimaneTotali, regolePensioni, sesso) {
    if (!regolePensioni) return [];
    var elenco = [];

    var vecchiaia = regolePensioni.requisiti_vecchiaia;
    if (vecchiaia) {
      var nec = mesiInSettimane(vecchiaia.contributi_anni, 0);
      elenco.push({
        nome: 'Pensione di vecchiaia',
        dettaglio: vecchiaia.contributi_anni + ' anni di contributi e ' + vecchiaia.eta_anni + ' anni di età',
        settimaneNecessarie: nec,
        settimaneMancanti: Math.max(0, nec - settimaneTotali),
        raggiunto: settimaneTotali >= nec
      });
    }

    var ant = regolePensioni.requisiti_anticipata;
    if (ant) {
      var quale = sesso === 'F' ? ant.donne : ant.uomini;
      if (quale) {
        var necA = mesiInSettimane(quale.anni, quale.mesi);
        elenco.push({
          nome: 'Pensione anticipata',
          dettaglio: quale.anni + ' anni e ' + quale.mesi + ' mesi di contributi, senza requisito di età',
          settimaneNecessarie: necA,
          settimaneMancanti: Math.max(0, necA - settimaneTotali),
          raggiunto: settimaneTotali >= necA
        });
      }
    }

    return elenco;
  }

  function analizza(periodi, opzioni) {
    var opt = opzioni || {};
    var norm = normalizza(periodi);
    var anni = perAnno(norm.periodi);

    var totale = anni.reduce(function (t, a) { return t + a.settimane; }, 0);
    var grezzo = anni.reduce(function (t, a) { return t + a.settimaneGrezze; }, 0);

    var gestioni = {};
    norm.periodi.forEach(function (p) { gestioni[p.gestione] = (gestioni[p.gestione] || 0) + p.settimane; });

    return {
      periodi: norm.periodi,
      scartati: norm.scartati,
      perAnno: anni,
      anniIncompleti: anni.filter(function (a) { return !a.completo; }),
      buchi: buchi(norm.periodi, opt.giorniMinimiBuco),
      gestioni: gestioni,
      settimaneTotali: totale,
      settimaneGrezze: grezzo,
      settimaneEccedenti: Math.max(0, grezzo - totale),
      anzianita: anniESettimane(totale),
      requisiti: requisiti(totale, opt.pensioni, opt.sesso),
      primoAnno: anni.length ? anni[0].anno : null,
      ultimoAnno: anni.length ? anni[anni.length - 1].anno : null
    };
  }

  return {
    analizza: analizza,
    normalizza: normalizza,
    perAnno: perAnno,
    buchi: buchi,
    requisiti: requisiti,
    anniESettimane: anniESettimane,
    SETTIMANE_ANNO: SETTIMANE_ANNO
  };
});
