// js/festivita.js — Il calendario italiano: festivita', ponti, settimane, fasi lunari.
//
// Serve al calendario da stampare e al calcolo dei giorni lavorativi, che
// prima avevano ognuno la propria lista (e a quella dei giorni lavorativi
// mancava il 4 ottobre, festivo di nuovo dal 2026).
//
// Tutto lavora su date in testo 'AAAA-MM-GG' e con aritmetica in UTC: niente
// new Date('2027-01-01'), che a ovest di Greenwich diventa il 31 dicembre.
// Il risultato non dipende dal fuso del computer che lo esegue.
//
// Manutenzione: le festivita' nazionali cambiano per legge, raramente. Ognuna
// porta il suo riferimento normativo e l'anno da cui vale.
//
// Funziona nel browser (window.Festivita) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Festivita = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var MS_GIORNO = 86400000;

  // ------------------------------------------------------------ date in testo

  function parti(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    var a = Number(m[1]), me = Number(m[2]), g = Number(m[3]);
    var d = new Date(Date.UTC(a, me - 1, g));
    if (d.getUTCFullYear() !== a || d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g) return null;
    return d;
  }

  function testo(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  function valida(iso) { return parti(iso) !== null; }

  function aggiungi(iso, giorni) {
    return testo(new Date(parti(iso).getTime() + giorni * MS_GIORNO));
  }

  // 0 = lunedi' ... 6 = domenica (come nei calendari italiani)
  function giornoSettimana(iso) {
    return (parti(iso).getUTCDay() + 6) % 7;
  }

  function giorniNelMese(anno, mese) {
    return new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  }

  function data(anno, mese, giorno) {
    return anno + '-' + String(mese).padStart(2, '0') + '-' + String(giorno).padStart(2, '0');
  }

  // La data di oggi nel fuso del dispositivo: e' la sola funzione che guarda
  // l'orologio, e la si usa solo nelle interfacce.
  function oggi(adesso) {
    var d = adesso || new Date();
    return data(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  // Settimana ISO 8601: la prima e' quella che contiene il primo giovedi'.
  function settimanaIso(iso) {
    var d = parti(iso);
    var giovedi = new Date(d.getTime() + (3 - (d.getUTCDay() + 6) % 7) * MS_GIORNO);
    var inizio = new Date(Date.UTC(giovedi.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((giovedi - inizio) / MS_GIORNO - 3 + (inizio.getUTCDay() + 6) % 7) / 7);
  }

  // La griglia di un mese, da lunedi' a domenica: righe di 7 celle (null fuori
  // dal mese), ognuna con il numero di settimana ISO.
  var NOMI_MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  function grigliaMese(anno, mese) {
    var celle = [];
    var n = giorniNelMese(anno, mese);
    for (var i = 0; i < giornoSettimana(data(anno, mese, 1)); i++) celle.push(null);
    for (var g = 1; g <= n; g++) celle.push(data(anno, mese, g));
    while (celle.length % 7) celle.push(null);
    var righe = [];
    for (var r = 0; r < celle.length; r += 7) {
      var giorni = celle.slice(r, r + 7);
      righe.push({ settimana: settimanaIso(giorni.filter(Boolean)[0]), giorni: giorni });
    }
    return righe;
  }

  // ------------------------------------------------------------- festivita'

  // Pasqua gregoriana (algoritmo di Meeus/Jones/Butcher).
  function pasqua(anno) {
    var a = anno % 19, b = Math.floor(anno / 100), c = anno % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mese = Math.floor((h + l - 7 * m + 114) / 31);
    var giorno = ((h + l - 7 * m + 114) % 31) + 1;
    return data(anno, mese, giorno);
  }

  var FISSE = [
    { md: '01-01', nome: 'Capodanno', rif: 'L. 260/1949' },
    { md: '01-06', nome: 'Epifania', rif: 'L. 260/1949; DPR 792/1985' },
    { md: '04-25', nome: 'Festa della Liberazione', rif: 'L. 260/1949' },
    { md: '05-01', nome: 'Festa dei Lavoratori', rif: 'L. 260/1949' },
    { md: '06-02', nome: 'Festa della Repubblica', rif: 'L. 260/1949; L. 336/2000' },
    { md: '08-15', nome: 'Ferragosto (Assunzione)', rif: 'L. 260/1949' },
    { md: '10-04', nome: 'San Francesco d’Assisi', rif: 'L. 151/2025', dal: 2026 },
    { md: '11-01', nome: 'Ognissanti', rif: 'L. 260/1949' },
    { md: '12-08', nome: 'Immacolata Concezione', rif: 'L. 260/1949' },
    { md: '12-25', nome: 'Natale', rif: 'L. 260/1949' },
    { md: '12-26', nome: 'Santo Stefano', rif: 'L. 260/1949' }
  ];

  /**
   * Le festivita' nazionali di un anno, in ordine di data. Con `patrono`
   * ({ md: 'MM-GG', nome }) si aggiunge la festa del santo patrono del comune.
   */
  function festivita(anno, patrono) {
    var elenco = FISSE
      .filter(function (f) { return !f.dal || anno >= f.dal; })
      .map(function (f) { return { data: anno + '-' + f.md, nome: f.nome, riferimento: f.rif, tipo: 'nazionale' }; });
    var p = pasqua(anno);
    elenco.push({ data: p, nome: 'Pasqua', riferimento: 'L. 260/1949', tipo: 'nazionale' });
    elenco.push({ data: aggiungi(p, 1), nome: 'Lunedì dell’Angelo (Pasquetta)', riferimento: 'L. 260/1949', tipo: 'nazionale' });
    if (patrono && /^\d{2}-\d{2}$/.test(patrono.md) && valida(anno + '-' + patrono.md)) {
      elenco.push({ data: anno + '-' + patrono.md, nome: patrono.nome || 'Santo patrono', riferimento: null, tipo: 'patrono' });
    }
    return elenco.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  }

  function mappaFestivita(anno, patrono) {
    var m = {};
    festivita(anno, patrono).forEach(function (f) { (m[f.data] = m[f.data] || []).push(f); });
    return m;
  }

  function eFestivo(iso, patrono) {
    var d = parti(iso);
    if (!d) return false;
    return !!mappaFestivita(d.getUTCFullYear(), patrono)[iso];
  }

  // Come cade ogni festivita' rispetto al fine settimana, cioe' quanti giorni
  // liberi di fila regala e con quanti giorni di ferie:
  //   lunedi' o venerdi'  -> weekend lungo, 3 giorni, 0 ferie
  //   martedi' o giovedi' -> ponte, 4 giorni con 1 giorno di ferie
  //   mercoledi'          -> 5 giorni con 2 giorni di ferie
  //   sabato o domenica   -> nel fine settimana: nessun giorno in piu'
  // Pasqua e' sempre di domenica e non si elenca. Una festa attaccata a
  // un'altra (Natale e Santo Stefano) si conta una volta sola, dalla prima.
  function ponti(anno, patrono) {
    var fest = festivita(anno, patrono).filter(function (f) { return f.nome !== 'Pasqua'; });
    var festivi = {};
    festivita(anno, patrono).forEach(function (f) { festivi[f.data] = true; });
    return fest.filter(function (f) {
      return !festivi[aggiungi(f.data, -1)] || giornoSettimana(aggiungi(f.data, -1)) >= 5;
    }).map(function (f) {
      var gs = giornoSettimana(f.data);
      if (gs >= 5) return { festa: f, tipo: 'nel-weekend', giorniLiberi: 0, ferie: 0, ponte: [] };
      if (gs === 0 || gs === 4) return { festa: f, tipo: 'weekend-lungo', giorniLiberi: 3, ferie: 0, ponte: [] };
      if (gs === 1) return { festa: f, tipo: 'ponte', giorniLiberi: 4, ferie: 1, ponte: [aggiungi(f.data, -1)] };
      if (gs === 3) return { festa: f, tipo: 'ponte', giorniLiberi: 4, ferie: 1, ponte: [aggiungi(f.data, 1)] };
      return { festa: f, tipo: 'meta-settimana', giorniLiberi: 5, ferie: 2, ponte: [aggiungi(f.data, -2), aggiungi(f.data, -1)] };
    });
  }

  // ------------------------------------------------------- giorni lavorativi

  /**
   * Conta i giorni fra due date comprese. I festivi che cadono nel fine
   * settimana, quando il fine settimana e' gia' escluso, non si contano due
   * volte.
   * @returns {{ totali, lavorativi, weekend, festivi } | null}
   */
  function contaGiorni(inizio, fine, opzioni) {
    var o = opzioni || {};
    var escludiWeekend = o.escludiWeekend !== false;
    var escludiFestivi = o.escludiFestivi !== false;
    if (!valida(inizio) || !valida(fine)) return null;
    var r = { totali: 0, lavorativi: 0, weekend: 0, festivi: 0 };
    if (inizio > fine) return r;
    var mappe = {};
    for (var giorno = inizio; giorno <= fine; giorno = aggiungi(giorno, 1)) {
      r.totali++;
      var anno = Number(giorno.slice(0, 4));
      if (!mappe[anno]) mappe[anno] = mappaFestivita(anno, o.patrono);
      var weekend = giornoSettimana(giorno) >= 5;
      var festivo = !!mappe[anno][giorno];
      if (weekend && escludiWeekend) r.weekend++;
      if (festivo && escludiFestivi && !(weekend && escludiWeekend)) r.festivi++;
      if (!(weekend && escludiWeekend) && !(festivo && escludiFestivi)) r.lavorativi++;
    }
    return r;
  }

  // ------------------------------------------------------------ fasi lunari

  // Meeus, "Astronomical Algorithms", cap. 49: istanti delle fasi principali,
  // con precisione di pochi minuti. Tempo dinamico -> tempo universale con
  // DeltaT di 69 s, valido per questi anni entro pochi secondi.
  var RAD = Math.PI / 180;
  var DELTA_T_GIORNI = 69 / 86400;

  function sin(x) { return Math.sin(x * RAD); }
  function cos(x) { return Math.cos(x * RAD); }

  function jdeFase(k, tipo) {
    var T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
    var E = 1 - 0.002516 * T - 0.0000074 * T2;
    var M = 2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3;
    var Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
    var F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
    var O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
    var c;
    if (tipo === 0 || tipo === 2) {
      var nuova = tipo === 0;
      c = (nuova ? -0.40720 : -0.40614) * sin(Mp) + (nuova ? 0.17241 : 0.17302) * E * sin(M) +
        (nuova ? 0.01608 : 0.01614) * sin(2 * Mp) + (nuova ? 0.01039 : 0.01043) * sin(2 * F) +
        (nuova ? 0.00739 : 0.00734) * E * sin(Mp - M) - (nuova ? 0.00514 : 0.00515) * E * sin(Mp + M) +
        (nuova ? 0.00208 : 0.00209) * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) +
        0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) +
        0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(O) - 0.00007 * sin(Mp + 2 * M) +
        0.00004 * sin(2 * Mp - 2 * F) + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) -
        0.00003 * sin(Mp + M + 2 * F) + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) -
        0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
    } else {
      c = -0.62801 * sin(Mp) + 0.17172 * E * sin(M) - 0.01183 * E * sin(Mp + M) + 0.00862 * sin(2 * Mp) +
        0.00804 * sin(2 * F) + 0.00454 * E * sin(Mp - M) + 0.00204 * E * E * sin(2 * M) - 0.00180 * sin(Mp - 2 * F) -
        0.00070 * sin(Mp + 2 * F) - 0.00040 * sin(3 * Mp) - 0.00034 * E * sin(2 * Mp - M) + 0.00032 * E * sin(M + 2 * F) +
        0.00032 * E * sin(M - 2 * F) - 0.00028 * E * E * sin(Mp + 2 * M) + 0.00027 * E * sin(2 * Mp + M) -
        0.00017 * sin(O) - 0.00005 * sin(Mp - M - 2 * F) + 0.00004 * sin(2 * Mp + 2 * F) - 0.00004 * sin(Mp + M + 2 * F) +
        0.00004 * sin(Mp - 2 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(3 * M) + 0.00002 * sin(2 * Mp - 2 * F) +
        0.00002 * sin(Mp - M + 2 * F) - 0.00002 * sin(3 * Mp + M);
      var W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp) - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
      c += tipo === 1 ? W : -W;
    }
    var A = [
      299.77 + 0.107408 * k - 0.009173 * T2, 251.88 + 0.016321 * k, 251.83 + 26.651886 * k,
      349.42 + 36.412478 * k, 84.66 + 18.206239 * k, 141.74 + 53.303771 * k, 207.14 + 2.453732 * k,
      154.84 + 7.306860 * k, 34.52 + 27.261239 * k, 207.19 + 0.121824 * k, 291.34 + 1.844379 * k,
      161.72 + 24.198154 * k, 239.56 + 25.513099 * k, 331.55 + 3.592518 * k
    ];
    var P = [0.000325, 0.000165, 0.000164, 0.000126, 0.000110, 0.000062, 0.000060, 0.000056, 0.000047, 0.000042, 0.000040, 0.000037, 0.000035, 0.000023];
    var extra = 0;
    for (var i = 0; i < 14; i++) extra += P[i] * sin(A[i]);
    return jde + c + extra;
  }

  function daGiulianoAUtc(jd) {
    return new Date(Math.round((jd - 2440587.5) * MS_GIORNO));
  }

  // Ora legale europea: dall'ultima domenica di marzo all'ultima di ottobre,
  // cambio alle 01:00 UTC. In Italia: UTC+2 d'estate, UTC+1 d'inverno.
  function ultimaDomenica(anno, mese) {
    var fine = new Date(Date.UTC(anno, mese, 0));
    return Date.UTC(anno, mese - 1, fine.getUTCDate() - fine.getUTCDay(), 1);
  }
  function scartoRoma(istante) {
    var anno = new Date(istante).getUTCFullYear();
    return istante >= ultimaDomenica(anno, 3) && istante < ultimaDomenica(anno, 10) ? 2 : 1;
  }
  function dataRoma(istante) {
    return testo(new Date(istante + scartoRoma(istante) * 3600000));
  }

  var NOMI_FASI = ['nuova', 'primo-quarto', 'piena', 'ultimo-quarto'];

  /** Le fasi principali che cadono in un anno, con la data italiana. */
  function fasiLunari(anno) {
    var fuori = [];
    var k0 = Math.floor((anno - 2000) * 12.3685) - 1;
    for (var k = k0; k < k0 + 15; k++) {
      for (var t = 0; t < 4; t++) {
        var istante = daGiulianoAUtc(jdeFase(k + t / 4, t) - DELTA_T_GIORNI).getTime();
        var giorno = dataRoma(istante);
        if (Number(giorno.slice(0, 4)) === anno) fuori.push({ data: giorno, fase: NOMI_FASI[t], utc: new Date(istante).toISOString() });
      }
    }
    return fuori.sort(function (a, b) { return a.utc < b.utc ? -1 : 1; });
  }

  return {
    valida: valida, aggiungi: aggiungi, giornoSettimana: giornoSettimana, giorniNelMese: giorniNelMese,
    data: data, oggi: oggi, settimanaIso: settimanaIso, grigliaMese: grigliaMese, NOMI_MESI: NOMI_MESI,
    pasqua: pasqua, festivita: festivita, mappaFestivita: mappaFestivita, eFestivo: eFestivo, ponti: ponti,
    contaGiorni: contaGiorni,
    fasiLunari: fasiLunari, jdeFase: jdeFase, dataRoma: dataRoma
  };
});
