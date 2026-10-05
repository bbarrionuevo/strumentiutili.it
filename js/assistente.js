// js/assistente.js — Capire che cosa cerca chi scrive nella ricerca del sito.
//
// La vecchia ricerca voleva tutte le parole, uguali, nel titolo o nella
// descrizione di uno strumento: «f24 elide compilabile» non trovava niente
// perche' la pagina dice «editabile», e una frase come «ho preso una multa»
// nemmeno. Delle ricerche vere con cui Google mostrava il sito, il 58% restava
// senza risultati.
//
// Qui la domanda si legge come la scrive una persona:
//   - si tolgono le parole che non dicono niente (di, la, devo, quanto...);
//   - ogni parola si riduce alla radice (dimissioni = dimissione, editabile =
//     editabili), con le abbreviazioni sciolte (mod. = modello);
//   - si aggiungono i sinonimi di data/sinonimi.json (compilabile ->
//     editabile, disoccupazione -> NASpI, tassa di possesso -> bollo);
//   - ogni strumento prende punti per le parole che ha nel titolo, nelle
//     parole chiave curate, nell'indirizzo o nella descrizione, pesate per
//     rarita' (una parola presente in uno strumento solo conta di piu' di
//     «calcolo», che c'e' dappertutto);
//   - le varianti (bollo della Puglia, dimissioni del CCNL multiservizi)
//     passano davanti solo se la domanda nomina la Regione o il contratto.
// Tutto avviene nel browser: la domanda non lascia il dispositivo.
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.Assistente = fabbrica();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Parole che non aiutano a capire che cosa si cerca
  var VUOTE = {};
  ('a ad al allo ai agli all alla alle anche c che chi ci com come con col cosa cui d da dal dallo dai dagli dall ' +
   'dalla dalle dei degli del dell della delle dello deve devo di do due e ed fa fai fare gli ha hai ho i il in ' +
   'io l la le lo lui ma me mi mio mia miei mie mio ne nel nello nei negli nell nella nelle non o oppure per ' +
   'perche piu po posso preso puo qual quale quali qualcosa quando quanto quanti quanta quante qui s se si sia ' +
   'sono su sul sullo sui sugli sull sulla sulle ti tra fra tu tuo tua un una uno vorrei voglio online gratis ' +
   'gratuito gratuita gratuiti gratuite free web sito miei nostro nostra loro essere avere ecco cos troppo').split(' ')
    .forEach(function (p) { if (p) VUOTE[p] = true; });

  // Abbreviazioni da sciogliere prima di tutto
  var ABBREVIAZIONI = { mod: 'modello', modd: 'modello', cf: 'codice fiscale', pdfa: 'pdf a' };

  // Quanto conta una parola trovata in ciascuna parte della scheda
  var PESI = { titolo: 3, chiavi: 3.5, percorso: 2, descrizione: 1, variante: 5 };

  function normalizza(testo) {
    return String(testo == null ? '' : testo)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’'`]/g, ' ')
      .replace(/(\d)([a-z])/g, '$1 $2')        // f24elide -> f24 elide
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\bf (2[34])\b/g, 'f$1')            // f 23, f-24 -> f23, f24
      .trim();
  }

  /** La radice di una parola: basta per far combaciare singolare e plurale, maschile e femminile. */
  function radiceDi(parola) {
    if (/\d/.test(parola) || parola.length <= 4) return parola;
    return parola.replace(/[aeiou]$/, '');
  }

  /** Le parole che contano di una frase (senza sinonimi). */
  function parole(testo) {
    var fuori = [];
    normalizza(testo).split(' ').forEach(function (p) {
      if (!p) return;
      var sciolta = ABBREVIAZIONI[p];
      (sciolta ? sciolta.split(' ') : [p]).forEach(function (q) {
        if (VUOTE[q]) return;
        if (q.length < 2 && !/\d/.test(q)) return;
        fuori.push(q);
      });
    });
    return fuori;
  }

  function radici(testo) {
    return parole(testo).map(radiceDi);
  }

  /** Due radici combaciano se sono uguali o se una comincia con l'altra (almeno 5 lettere). */
  function combaciano(a, b) {
    if (a === b) return true;
    var corta = a.length < b.length ? a : b;
    var lunga = a.length < b.length ? b : a;
    return corta.length >= 5 && !/\d/.test(corta) && lunga.indexOf(corta) === 0;
  }

  function contiene(insieme, r) {
    if (insieme.indexOf(r) !== -1) return true;
    for (var i = 0; i < insieme.length; i++) if (combaciano(insieme[i], r)) return true;
    return false;
  }

  /** Aggiunge alla domanda le parole dei sinonimi presenti (anche espressioni di piu' parole). */
  function espandi(testo, sinonimi) {
    var base = ' ' + normalizza(testo) + ' ';
    var aggiunte = [];
    (sinonimi || []).forEach(function (coppia) {
      if (base.indexOf(' ' + coppia[0] + ' ') !== -1) aggiunte.push(coppia[1]);
    });
    return base + ' ' + aggiunte.join(' ');
  }

  /** Distanza fra due parole con al massimo un errore di battitura (scambio, lettera in piu', in meno o sbagliata). */
  function unErrore(a, b) {
    if (a === b) return false;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;                                           // una lettera sbagliata
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);           // due lettere scambiate
    }
    return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);                 // una lettera in piu' o in meno
  }

  function unici(lista) {
    var visti = {};
    return lista.filter(function (x) { if (visti[x]) return false; visti[x] = true; return true; });
  }

  /** Prepara le schede degli strumenti (una volta sola, poi si cerca quante volte si vuole). */
  function prepara(indice, vocabolario) {
    var chiavi = (vocabolario && vocabolario.chiavi) || {};
    var schede = (indice || []).map(function (v) {
      var originale = v.variante ? v.variante.originale : v.percorso;
      return {
        voce: v,
        guida: /^\/guide\//.test(v.percorso),
        titolo: unici(radici(v.titolo)),
        primaDelTitolo: radici(v.titolo)[0] || '',
        chiavi: unici(radici((chiavi[originale] || []).join(' '))),
        percorso: unici(radici(String(originale).replace(/[\/-]/g, ' '))),
        descrizione: unici(radici(v.descrizione)),
        variante: v.variante ? unici(radici(v.variante.etichetta)) : []
      };
    });
    var lessico = {};
    schede.forEach(function (s) { s.titolo.concat(s.chiavi, s.descrizione, s.variante).forEach(function (r) { lessico[r] = true; }); });
    return { schede: schede, sinonimi: (vocabolario && vocabolario.sinonimi) || [], lessico: Object.keys(lessico) };
  }

  // Chi chiede una spiegazione cerca la guida; altrimenti prima lo strumento
  var SPIEGAZIONE = /(^| )(come|guida|cos e|cosa e|cosa significa|perche|differenz\w*|spiegazione|istruzioni)( |$)/;

  /**
   * Gli strumenti che rispondono alla domanda, dal piu' adatto: [{ percorso,
   * titolo, voce, punteggio }]. Vuoto se la domanda non c'entra con il sito.
   */
  function cerca(motore, testo, quanti) {
    var domanda = unici(radici(espandi(testo, motore.sinonimi)));
    if (!domanda.length) return [];
    // una parola che non c'e' da nessuna parte forse ha un errore di battitura
    // («napsi», «suoerbollo»): si prova la parola del sito piu' vicina
    domanda = unici(domanda.map(function (r) {
      if (r.length < 4 || /\d/.test(r) || contiene(motore.lessico, r)) return r;
      for (var i = 0; i < motore.lessico.length; i++) if (unErrore(motore.lessico[i], r)) return motore.lessico[i];
      return r;
    }));
    var schede = motore.schede;
    var n = schede.length;
    var vuoleSpiegazione = SPIEGAZIONE.test(normalizza(testo));

    // rarita' di ogni parola della domanda fra gli strumenti
    var idf = domanda.map(function (r) {
      var df = 0;
      for (var i = 0; i < n; i++) {
        var s = schede[i];
        if (contiene(s.titolo, r) || contiene(s.chiavi, r) || contiene(s.descrizione, r) || contiene(s.percorso, r)) df++;
      }
      return df ? Math.log(1 + n / df) : 0;
    });

    var risultati = [];
    for (var i = 0; i < n; i++) {
      var s = schede[i];
      var punti = 0, trovate = 0, forte = 0, nominaVariante = false;
      for (var k = 0; k < domanda.length; k++) {
        var r = domanda[k];
        var peso = 0;
        if (contiene(s.variante, r)) { peso = PESI.variante; nominaVariante = true; }
        if (contiene(s.chiavi, r)) peso = Math.max(peso, PESI.chiavi);
        if (contiene(s.titolo, r)) peso = Math.max(peso, PESI.titolo + (combaciano(s.primaDelTitolo, r) ? 1 : 0));
        if (contiene(s.percorso, r)) peso = Math.max(peso, PESI.percorso);
        if (contiene(s.descrizione, r)) peso = Math.max(peso, PESI.descrizione);
        if (!peso) continue;
        trovate++;
        punti += peso * idf[k];
        if (peso >= PESI.percorso) forte = Math.max(forte, peso * idf[k]);
      }
      // serve almeno una parola importante nel titolo, nelle chiavi o nell'indirizzo
      if (!trovate || forte < 4) continue;
      var copertura = trovate / domanda.length;
      punti *= 0.4 + 0.6 * copertura;
      // a parita', il titolo piu' preciso: quello fatto soprattutto di parole cercate
      var nelTitolo = s.titolo.filter(function (t) { return domanda.some(function (r) { return combaciano(t, r); }); }).length;
      punti *= 1 + 0.15 * (s.titolo.length ? nelTitolo / s.titolo.length : 0);
      if (s.voce.variante && !nominaVariante) continue;       // la variante solo se la domanda nomina Regione o contratto
      if (s.guida && !vuoleSpiegazione) punti *= 0.75;        // la guida passa davanti solo a chi chiede come si fa
      risultati.push({ percorso: s.voce.percorso, titolo: s.voce.titolo, voce: s.voce, punteggio: punti });
    }
    if (!risultati.length) return [];
    risultati.sort(function (a, b) { return b.punteggio - a.punteggio || a.titolo.localeCompare(b.titolo); });
    var migliore = risultati[0].punteggio;
    return risultati.filter(function (x) { return x.punteggio >= migliore * 0.25; }).slice(0, quanti || 8);
  }

  return { normalizza: normalizza, parole: parole, radice: radiceDi, espandi: espandi, prepara: prepara, cerca: cerca };
}));
