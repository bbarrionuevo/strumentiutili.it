// js/scadenze.js — Lo scadenziario: revisione, patente, carta d'identità,
// assicurazione, bollo, ISEE e scadenze a piacere, con i promemoria nel
// calendario del telefono.
//
// La data che conta e' sempre quella scritta sul documento. Le regole qui
// sotto servono solo a proporla quando non la si ha sotto mano, e ognuna cita
// la norma da cui viene.
//
// Le date sono stringhe AAAA-MM-GG; i conti si fanno in giorni interi UTC,
// senza oggetti Date locali.
//
// Funziona nel browser (window.Scadenze) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Scadenze = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var GIORNO_MS = 86400000;
  var DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

  function parti(iso) {
    var m = DATA.exec(String(iso || ''));
    if (!m) return null;
    var a = Number(m[1]), me = Number(m[2]), g = Number(m[3]);
    var d = new Date(Date.UTC(a, me - 1, g));
    if (d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g) return null;
    return { a: a, m: me, g: g };
  }

  function valida(iso) { return parti(iso) !== null; }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function data(a, m, g) { return a + '-' + pad(m) + '-' + pad(g); }

  function giorniNelMese(a, m) { return new Date(Date.UTC(a, m, 0)).getUTCDate(); }

  function numero(iso) { var p = parti(iso); return Date.UTC(p.a, p.m - 1, p.g) / GIORNO_MS; }

  function differenza(da, a) { return numero(a) - numero(da); }

  function aggiungiGiorni(iso, n) { return new Date((numero(iso) + n) * GIORNO_MS).toISOString().slice(0, 10); }

  // Aggiunge mesi tenendo il giorno; se il mese d'arrivo e' piu' corto (31
  // gennaio + 1 mese, 29 febbraio + 1 anno) si ferma all'ultimo giorno.
  function aggiungiMesi(iso, mesi) {
    var p = parti(iso);
    var t = p.m - 1 + mesi;
    var a = p.a + Math.floor(t / 12);
    var m = ((t % 12) + 12) % 12 + 1;
    return data(a, m, Math.min(p.g, giorniNelMese(a, m)));
  }

  function fineMese(iso) { var p = parti(iso); return data(p.a, p.m, giorniNelMese(p.a, p.m)); }

  // Anni compiuti in una data.
  function eta(nascita, quando) {
    var n = parti(nascita), q = parti(quando);
    var anni = q.a - n.a;
    if (q.m < n.m || (q.m === n.m && q.g < n.g)) anni--;
    return anni;
  }

  // Il primo compleanno a partire da una data (compresa). Chi e' nato il 29
  // febbraio negli anni non bisestili festeggia il 28.
  function compleannoDa(nascita, da) {
    var n = parti(nascita), d = parti(da);
    for (var a = d.a; a <= d.a + 1; a++) {
      var c = data(a, n.m, Math.min(n.g, giorniNelMese(a, n.m)));
      if (differenza(da, c) >= 0) return c;
    }
    return null;
  }

  // ---------------------------------------------------------------- regole

  /**
   * Revisione di auto e moto (art. 80 del Codice della strada): la prima entro
   * quattro anni dalla prima immatricolazione, poi ogni due anni, entro la fine
   * del mese in cui cade la scadenza.
   * @param {string} immatricolazione
   * @param {string} [ultima] data dell'ultima revisione fatta
   */
  function revisione(immatricolazione, ultima) {
    if (ultima && valida(ultima)) return fineMese(aggiungiMesi(ultima, 24));
    return fineMese(aggiungiMesi(immatricolazione, 48));
  }

  function anniPatente(anniCompiuti) {
    if (anniCompiuti >= 80) return 2;
    if (anniCompiuti >= 70) return 3;
    if (anniCompiuti >= 50) return 5;
    return 10;
  }

  /**
   * Patente A e B (art. 126 del Codice della strada e art. 7 del D.L. 5/2012):
   * vale 10 anni, 5 per chi ha compiuto 50 anni, 3 dai 70, 2 dagli 80, e
   * scade il giorno del compleanno successivo. Non vale per C e D e per le
   * patenti con durata ridotta dalla commissione medica.
   * @param {string} nascita
   * @param {string} rilascio data del rilascio o dell'ultimo rinnovo (visita medica)
   */
  function patente(nascita, rilascio) {
    var anni = anniPatente(eta(nascita, rilascio));
    return { anni: anni, scadenza: compleannoDa(nascita, aggiungiMesi(rilascio, anni * 12)) };
  }

  /**
   * Carta d'identita' (art. 7 del D.L. 5/2012 e art. 10 del D.L. 70/2011):
   * 3 anni sotto i 3 anni, 5 fra i 3 e i 18, 10 per gli adulti; scade il
   * giorno del compleanno successivo.
   */
  function cartaIdentita(nascita, rilascio) {
    var e = eta(nascita, rilascio);
    var anni = e < 3 ? 3 : e < 18 ? 5 : 10;
    return { anni: anni, scadenza: compleannoDa(nascita, aggiungiMesi(rilascio, anni * 12)) };
  }

  /**
   * Passaporto: 10 anni per gli adulti, 5 fra i 3 e i 18, 3 sotto i 3.
   * E' una stima: la data esatta e' quella stampata sul passaporto.
   */
  function passaporto(nascita, rilascio) {
    var e = eta(nascita, rilascio);
    var anni = e < 3 ? 3 : e < 18 ? 5 : 10;
    return { anni: anni, scadenza: aggiungiGiorni(aggiungiMesi(rilascio, anni * 12), -1) };
  }

  /** ISEE: la DSU vale fino al 31 dicembre dell'anno in cui e' presentata. */
  function isee(presentazione) {
    return parti(presentazione).a + '-12-31';
  }

  // ---------------------------------------------------------------- scadenze

  // Che cosa si puo' mettere nello scadenziario: nome, ripetizione tipica,
  // giorni di tolleranza dopo la scadenza e un consiglio.
  var TIPI = {
    revisione: { nome: 'Revisione auto o moto', ripeti: '2anni', consiglio: 'Si fa entro la fine del mese indicato: prenota con qualche settimana di anticipo.' },
    patente: { nome: 'Patente', ripeti: 'no', consiglio: 'Il rinnovo si può fare nei quattro mesi prima della scadenza, con la visita medica.' },
    identita: { nome: 'Carta d’identità', ripeti: 'no', consiglio: 'Molti Comuni chiedono di prenotare: controlla i tempi della tua anagrafe.' },
    passaporto: { nome: 'Passaporto', ripeti: 'no', consiglio: 'Per alcuni Paesi serve che il passaporto valga ancora sei mesi dopo il viaggio.' },
    assicurazione: { nome: 'Assicurazione auto', ripeti: 'anno', tolleranza: 15, consiglio: 'Dopo la scadenza la copertura resta attiva per 15 giorni, non oltre.' },
    bollo: { nome: 'Bollo auto', ripeti: 'anno', consiglio: 'Il termine esatto dipende dalla Regione: di solito entro la fine del mese successivo alla scadenza.' },
    isee: { nome: 'ISEE', ripeti: 'anno', consiglio: 'Dal 1° gennaio serve una nuova DSU per non perdere assegno unico e bonus.' },
    caldaia: { nome: 'Controllo caldaia', ripeti: 'anno', consiglio: 'La frequenza dei controlli dipende dalla Regione e dalla potenza: vedi il libretto dell’impianto.' },
    altro: { nome: 'Altra scadenza', ripeti: 'no' }
  };

  var RIPETIZIONI = { no: 0, mese: 1, anno: 12, '2anni': 24 };

  /**
   * La prossima volta che una scadenza cade a partire da oggi (compreso).
   * Quelle che non si ripetono restano dove sono, anche se passate.
   */
  function prossima(s, oggi) {
    var passo = RIPETIZIONI[s.ripeti] || 0;
    if (!passo || differenza(oggi, s.data) >= 0) return s.data;
    var d = s.data, k = 0;
    while (differenza(oggi, d) < 0 && k < 1200) { k++; d = aggiungiMesi(s.data, passo * k); }
    return d;
  }

  /**
   * Lo stato di una scadenza alla data salvata. Anche quelle che si ripetono
   * restano "scadute" finche' non si segna che sono state fatte (rinnova):
   * una revisione saltata non deve sparire da sola.
   * @returns {{ data, giorni, stato: 'scaduta'|'tolleranza'|'vicina'|'presto'|'ok' }}
   *          giorni: quanti ne mancano (negativo se passata)
   */
  function stato(s, oggi) {
    var d = s.data;
    var g = differenza(oggi, d);
    var t = (TIPI[s.tipo] && TIPI[s.tipo].tolleranza) || 0;
    var st = g < -t ? 'scaduta' : g < 0 ? 'tolleranza' : g <= 30 ? 'vicina' : g <= 90 ? 'presto' : 'ok';
    return { data: d, giorni: g, stato: st };
  }

  /**
   * "Fatto": la prossima data dopo quella salvata e dopo oggi. Per chi segna
   * in ritardo piu' rinnovi insieme basta un clic.
   */
  function rinnova(s, oggi) {
    var passo = RIPETIZIONI[s.ripeti] || 0;
    if (!passo) return s.data;
    var k = 1, d = aggiungiMesi(s.data, passo);
    while (differenza(oggi, d) <= 0 && k < 1200) { k++; d = aggiungiMesi(s.data, passo * k); }
    return d;
  }

  function ordina(elenco, oggi) {
    return elenco.slice().sort(function (x, y) {
      return stato(x, oggi).giorni - stato(y, oggi).giorni || String(x.titolo).localeCompare(String(y.titolo));
    });
  }

  /**
   * Controlla una scadenza arrivata dalla memoria del browser.
   * @returns {string|null} il problema, o null
   */
  function problema(s) {
    if (!s || typeof s !== 'object') return 'Scadenza mancante';
    if (!TIPI[s.tipo]) return 'Tipo sconosciuto';
    if (typeof s.titolo !== 'string' || !s.titolo.trim() || s.titolo.length > 60) return 'Scrivi un nome breve (al massimo 60 caratteri)';
    if (!valida(s.data)) return 'Data non valida';
    if (!(s.ripeti in RIPETIZIONI)) return 'Ripetizione non valida';
    if (s.nota != null && (typeof s.nota !== 'string' || s.nota.length > 200)) return 'Nota troppo lunga';
    return null;
  }

  // Le date da mettere nel calendario: per quelle che si ripetono, le prossime
  // (12 per le mensili, 3 per le altre), cosi' il file resta utile a lungo.
  function date(s, oggi) {
    var passo = RIPETIZIONI[s.ripeti] || 0;
    var prima = passo ? prossima(s, oggi) : s.data;
    if (!passo) return [prima];
    var quante = passo === 1 ? 12 : 3;
    var fuori = [];
    for (var k = 0; k < quante; k++) fuori.push(aggiungiMesi(prima, passo * k));
    return fuori;
  }

  /**
   * Gli eventi per js/calendario-ics.js: giornata intera, con promemoria un
   * mese prima, una settimana prima e il giorno stesso.
   */
  function eventi(elenco, oggi, opzioni) {
    var o = opzioni || {};
    var fuori = [];
    elenco.forEach(function (s, i) {
      var tipo = TIPI[s.tipo] || TIPI.altro;
      date(s, oggi).forEach(function (d) {
        if (differenza(oggi, d) < 0) return; // gia' passata: un promemoria nel passato non serve
        fuori.push({
          id: 'scadenza-' + (s.id || i),
          data: d,
          titolo: 'Scadenza: ' + s.titolo,
          descrizione: [tipo.nome, s.nota, tipo.consiglio].filter(Boolean).join('\n'),
          url: o.url,
          promemoria: o.promemoria || ['mesePrima', 'settimanaPrima', 'giornoStesso']
        });
      });
    });
    return fuori;
  }

  return {
    TIPI: TIPI,
    RIPETIZIONI: RIPETIZIONI,
    revisione: revisione,
    patente: patente,
    cartaIdentita: cartaIdentita,
    passaporto: passaporto,
    isee: isee,
    prossima: prossima,
    stato: stato,
    ordina: ordina,
    rinnova: rinnova,
    problema: problema,
    eventi: eventi,
    eta: eta,
    aggiungiMesi: aggiungiMesi,
    compleannoDa: compleannoDa,
    valida: valida,
    differenza: differenza
  };
});
