// js/santi.js — Santi del giorno e onomastici, dai dati di data/santi.json.
//
// I dati li prepara scripts/genera-santi.js da Wikidata (CC0) e restano un
// file statico: nel browser non si interroga nessun servizio. Formato:
//   { fonte, licenza, generato,
//     giorni:     { "MM-GG": [[nome, qid, paginaWikipedia], ...] },   // il primo e' il principale
//     onomastici: { chiave: [nome, "MM-GG", santo?] } }                // chiave senza accenti, minuscola
//
// Funziona nel browser (window.Santi) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Santi = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // "Niccolò", "NICCOLO'", " niccolo " -> "niccolo"
  function normalizza(testo) {
    return String(testo == null ? '' : testo)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function mmgg(data) {
    var s = String(data);
    var m = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(s);
    return m ? m[1] + '-' + m[2] : null;
  }

  /** Tutti i giorni dell'anno bisestile, "01-01" ... "12-31". */
  function giorniDellAnno() {
    var fuori = [];
    for (var m = 1; m <= 12; m++) {
      var n = new Date(Date.UTC(2000, m, 0)).getUTCDate();
      for (var g = 1; g <= n; g++) fuori.push(String(m).padStart(2, '0') + '-' + String(g).padStart(2, '0'));
    }
    return fuori;
  }

  /** Controlla i dati: ogni giorno ha almeno un santo, niente nomi vuoti. */
  function problemi(dati) {
    var p = [];
    if (!dati || typeof dati !== 'object' || !dati.giorni || !dati.onomastici) return ['formato non valido'];
    giorniDellAnno().forEach(function (g) {
      var elenco = dati.giorni[g];
      if (!Array.isArray(elenco) || !elenco.length) { p.push(g + ': nessun santo'); return; }
      elenco.forEach(function (s, i) {
        if (!Array.isArray(s) || typeof s[0] !== 'string' || !s[0].trim()) p.push(g + ' #' + i + ': nome mancante');
        else if (s[1] && !/^Q\d+$/.test(s[1])) p.push(g + ' #' + i + ': codice Wikidata non valido');
      });
    });
    Object.keys(dati.giorni).forEach(function (g) { if (!/^\d{2}-\d{2}$/.test(g)) p.push('giorno non valido: ' + g); });
    Object.keys(dati.onomastici).forEach(function (k) {
      var o = dati.onomastici[k];
      if (k !== normalizza(k)) p.push('chiave non normalizzata: ' + k);
      if (!Array.isArray(o) || typeof o[0] !== 'string' || !dati.giorni[o[1]]) p.push('onomastico non valido: ' + k);
    });
    return p;
  }

  function santo(voce) {
    return { nome: voce[0], qid: voce[1] || null, wikipedia: voce[2] ? 'https://it.wikipedia.org/wiki/' + encodeURIComponent(voce[2].replace(/ /g, '_')) : null };
  }

  /** Un archivio di consultazione sopra i dati. */
  function crea(dati) {
    var perGiorno = {};
    Object.keys(dati.onomastici).forEach(function (k) {
      var o = dati.onomastici[k];
      (perGiorno[o[1]] = perGiorno[o[1]] || []).push(o[0]);
    });
    Object.keys(perGiorno).forEach(function (g) { perGiorno[g].sort(function (a, b) { return a.localeCompare(b, 'it'); }); });
    var chiavi = Object.keys(dati.onomastici).sort();

    return {
      /** I santi di un giorno ("MM-GG" o "AAAA-MM-GG"), il principale per primo. */
      delGiorno: function (data) {
        var g = mmgg(data);
        return g && dati.giorni[g] ? dati.giorni[g].map(santo) : [];
      },
      /** I nomi che festeggiano l'onomastico in un giorno. */
      onomasticiDelGiorno: function (data) {
        var g = mmgg(data);
        return g && perGiorno[g] ? perGiorno[g].slice() : [];
      },
      /** L'onomastico di un nome: data e santo di quel giorno che porta il nome. */
      onomastico: function (nome) {
        var k = normalizza(nome).split(' ')[0];
        var o = k && dati.onomastici[k];
        if (!o) return null;
        var santi = dati.giorni[o[1]].map(santo);
        // Il terzo campo, se c'e', e' il santo fissato a mano (per esempio
        // "Santi Pietro e Paolo"): si cerca nella lista per avere il link.
        var cercato = o[2] ? normalizza(o[2]) : null;
        var suo = santi.filter(function (s) {
          return cercato ? normalizza(s.nome) === cercato : normalizza(s.nome).split(' ').indexOf(k) >= 0;
        })[0] || (o[2] ? { nome: o[2], qid: null, wikipedia: null } : null);
        return { nome: o[0], data: o[1], santo: suo };
      },
      /** Nomi che iniziano con le lettere scritte, per i suggerimenti. */
      suggerimenti: function (prefisso, quanti) {
        var p = normalizza(prefisso);
        if (!p) return [];
        var fuori = [];
        for (var i = 0; i < chiavi.length && fuori.length < (quanti || 8); i++) {
          if (chiavi[i].indexOf(p) === 0) fuori.push(dati.onomastici[chiavi[i]][0]);
        }
        return fuori;
      },
      fonte: dati.fonte,
      generato: dati.generato
    };
  }

  return { crea: crea, normalizza: normalizza, problemi: problemi, giorniDellAnno: giorniDellAnno, mmgg: mmgg };
});
