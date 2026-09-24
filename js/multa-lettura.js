// js/multa-lettura.js — Che cosa c'e' scritto su un verbale.
//
// Restituisce CANDIDATI, mai un valore solo. E' una differenza di sostanza, non
// di forma: questo modulo non sa leggere, sa riconoscere delle forme, e chi usa
// il risultato deve poterlo correggere prima che diventi una data di scadenza.
//
// Tre trappole che hanno deciso come e' fatto questo file:
//
//   1. **L'articolo sbagliato.** Ogni verbale cita gli artt. 201, 202, 203 e
//      204-bis nelle proprie istruzioni, sul retro. Un `art. (\d+)` ingenuo
//      annuncia che hai violato l'art. 203. E' il falso positivo piu' probabile
//      dell'intero strumento, ed e' anche il piu' credibile.
//
//   2. **L'importo sbagliato.** Un verbale stampa il minimo, la cifra gia'
//      scontata del 30%, quella a sessanta giorni, le spese di notifica e a
//      volte il massimo. Prendere "il numero con l'euro" ne prende uno a caso.
//      Chi paga la cifra sbagliata fa un pagamento INCOMPLETO: la multa resta
//      aperta e cresce. Quindi gli importi si classificano per etichetta, e
//      quelli che non si riescono a classificare restano senza tipo.
//
//   3. **La data che non c'e'.** La data di notifica di solito non sta sul
//      verbale: sta sulla busta o sulla cartolina verde. L'assenza e' il caso
//      normale, non un errore, e va detta cosi'.
//
// Le date senza etichetta non diventano candidate per niente: finiscono in un
// elenco a parte. Una data di nascita scambiata per la data della violazione
// sposterebbe ogni scadenza di anni.
//
// Funziona nel browser (window.MultaLettura) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory(typeof require === 'function' ? require('./pdf-righe.js') : null);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MultaLettura = api;
})(typeof self !== 'undefined' ? self : globalThis, function (righeNode) {
  'use strict';

  function P() {
    if (righeNode) return righeNode;
    var g = (typeof window !== 'undefined' && window) || (typeof self !== 'undefined' && self);
    if (g && g.PdfRighe) return g.PdfRighe;
    throw new Error('[MultaLettura] js/pdf-righe.js non caricato.');
  }

  // ------------------------------------------------------------- vocabolari

  var ETICHETTE_VIOLAZIONE = [
    /data\s+(?:della\s+)?violazion/i,
    /data\s+(?:dell['’]\s*)?accertament/i,
    /data\s+(?:dell['’]\s*)?infrazion/i,
    /commess[ao]\s+(?:in\s+data|il)/i,
    /accertat[ao]\s+(?:in\s+data|il)/i,
    /\bil\s+giorno\b/i
  ];

  var ETICHETTE_NOTIFICA = [
    /data\s+(?:di\s+)?notific/i,
    /notificat[oa]\s+(?:in\s+data|il)/i,
    /data\s+(?:di\s+)?spedizion/i,
    /relata\s+di\s+notifica/i
  ];

  // Ogni tipo di importo, con le etichette che lo identificano. L'ordine conta:
  // "misura ridotta entro 60 giorni" non esiste, ma "entro 5 giorni" e' piu'
  // specifico di "entro" e va provato prima.
  var TIPI_IMPORTO = [
    { tipo: 'ridotto5', etichette: [/misura\s+ridotta\s+del\s+30/i, /entro\s+(?:i\s+)?5\s+giorni/i,
                                    /entro\s+cinque\s+giorni/i, /sconto\s+del\s+30/i, /riduzion\w*\s+del\s+30/i] },
    { tipo: 'spese',    etichette: [/spese\s+(?:di\s+)?(?:notifica|procedimento|accertamento|postali)/i,
                                    /spese\s+di\s+spedizione/i, /diritti\s+di\s+notifica/i] },
    { tipo: 'massimo',  etichette: [/(?:importo\s+)?massimo(?:\s+edittale)?/i] },
    { tipo: 'sanzione', etichette: [/entro\s+(?:i\s+)?60\s+giorni/i, /entro\s+sessanta\s+giorni/i,
                                    /sanzione\s+(?:amministrativa\s+)?pecuniaria/i,
                                    /misura\s+ridotta/i, /minimo(?:\s+edittale)?/i,
                                    /importo\s+da\s+pagare/i, /totale\s+da\s+pagare/i] }
  ];

  // Il Titolo VI del Codice della Strada, che comincia all'art. 194, non contiene
  // violazioni: contiene le sanzioni e il procedimento. Gli articoli che si
  // violano stanno prima (142 la velocita', 158 la sosta, 186 l'alcol, 193
  // l'assicurazione). Quindi un articolo dal 194 in su, citato su un verbale, e'
  // quasi sempre parte delle istruzioni.
  //
  // Il primo tentativo era una lista di parole procedurali da cercare nella
  // riga, e lasciava passare "La notificazione e' effettuata nei termini
  // dell'art. 201 CdS" — che non contiene nessuna di quelle parole. Meglio
  // invertire l'onere: per questi articoli serve una prova positiva che la riga
  // stia contestando qualcosa, non l'assenza di indizi che non la stia facendo.
  var PRIMO_ARTICOLO_PROCEDURALE = 194;
  var RIGA_CONTESTAZIONE = /viola|infrazion|trasgress|ha\s+circolato|non\s+ottemper|sanzionat/i;

  var RE_IMPORTO = /(?:€|euro)\s*([\d.]{1,12},\d{2})|([\d.]{1,12},\d{2})\s*(?:€|euro)/gi;
  var RE_ARTICOLO = /\bart(?:icolo)?\.?\s*(\d{1,3})(?:\s*[-\/]?\s*(bis|ter|quater|quinquies|sexies))?/gi;
  var RE_PUNTI = /(?:punti|decurtazione|punteggio)[^\d]{0,20}(\d{1,2})|(\d{1,2})\s*punti/i;
  var RE_VERBALE = /(?:verbale|preavviso)\s*(?:n(?:umero)?\.?\s*)?([A-Z0-9][A-Z0-9\/.-]{3,20})/i;

  // ------------------------------------------------------------------ utili

  function pulisci(riga) {
    return String(riga || '').replace(/\s+/g, ' ').trim();
  }

  // 1.234,56 -> 1234.56
  function numeroIt(testo) {
    var t = String(testo || '').trim().split('.').join('').replace(',', '.');
    var n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function combaciaUna(riga, elenco) {
    for (var i = 0; i < elenco.length; i++) {
      if (elenco[i].test(riga)) return elenco[i];
    }
    return null;
  }

  function aggiungi(elenco, voce) {
    // Lo stesso valore trovato due volte con la stessa etichetta non e' due
    // candidati: e' lo stesso dato ripetuto nel documento.
    var gia = elenco.some(function (v) { return v.valore === voce.valore && v.tipo === voce.tipo; });
    if (!gia) elenco.push(voce);
    return elenco;
  }

  // -------------------------------------------------------------- estrazione

  // Le date con un'etichetta davanti diventano candidate per quel campo. Si
  // guarda la riga stessa e la successiva, perche' nelle impaginazioni a due
  // colonne il valore finisce sotto l'etichetta.
  function cercaDate(righe) {
    var violazione = [], notifica = [], altre = [];

    righe.forEach(function (riga, i) {
      var dateQui = P().dateInTesto(riga);
      var etiViol = combaciaUna(riga, ETICHETTE_VIOLAZIONE);
      var etiNot = combaciaUna(riga, ETICHETTE_NOTIFICA);

      // Un'etichetta senza valore sulla sua riga lo cerca in quella dopo.
      var dateVicine = dateQui.length ? dateQui : (righe[i + 1] ? P().dateInTesto(righe[i + 1]) : []);
      var vicina = dateQui.length ? 'alta' : 'media';

      dateVicine.forEach(function (grezza) {
        var valore = P().normalizzaData(grezza);
        if (!valore) return;
        var voce = { valore: valore, grezzo: grezza, riga: riga, fiducia: vicina };
        if (etiNot) aggiungi(notifica, Object.assign({ etichetta: 'notifica' }, voce));
        else if (etiViol) aggiungi(violazione, Object.assign({ etichetta: 'violazione' }, voce));
      });

      // Le date senza etichetta restano da parte. Una data di nascita scambiata
      // per quella della violazione sposterebbe tutte le scadenze di anni.
      if (!etiViol && !etiNot) {
        dateQui.forEach(function (grezza) {
          var valore = P().normalizzaData(grezza);
          if (valore) aggiungi(altre, { valore: valore, grezzo: grezza, riga: riga, fiducia: 'nessuna' });
        });
      }
    });

    return { violazione: violazione, notifica: notifica, altre: altre };
  }

  function cercaImporti(righe) {
    var fuori = [];
    righe.forEach(function (riga) {
      RE_IMPORTO.lastIndex = 0;
      var m;
      while ((m = RE_IMPORTO.exec(riga)) !== null) {
        var valore = numeroIt(m[1] || m[2]);
        if (valore === null) continue;

        var tipo = null;
        for (var i = 0; i < TIPI_IMPORTO.length; i++) {
          if (combaciaUna(riga, TIPI_IMPORTO[i].etichette)) { tipo = TIPI_IMPORTO[i].tipo; break; }
        }
        aggiungi(fuori, {
          valore: valore,
          grezzo: (m[1] || m[2]),
          tipo: tipo,                      // null = non classificato, e resta tale
          riga: riga,
          fiducia: tipo ? 'alta' : 'nessuna'
        });
      }
    });
    return fuori;
  }

  function cercaArticoli(righe) {
    var fuori = [];
    righe.forEach(function (riga) {
      var contestazione = RIGA_CONTESTAZIONE.test(riga);
      RE_ARTICOLO.lastIndex = 0;
      var m;
      while ((m = RE_ARTICOLO.exec(riga)) !== null) {
        var numero = m[1];
        var suffisso = m[2] ? m[2].toLowerCase() : null;

        // Il filtro che evita di annunciare all'utente che ha violato l'art. 203.
        if (Number(numero) >= PRIMO_ARTICOLO_PROCEDURALE && !contestazione) continue;

        aggiungi(fuori, {
          valore: numero + (suffisso ? '-' + suffisso : ''),
          numero: Number(numero),
          suffisso: suffisso,
          riga: riga,
          fiducia: contestazione ? 'alta' : 'media'
        });
      }
    });
    return fuori;
  }

  function cercaPunti(righe) {
    var fuori = [];
    righe.forEach(function (riga) {
      if (/nessuna\s+decurtazione|non\s+comporta\s+decurtazione|punti:?\s*0\b/i.test(riga)) {
        aggiungi(fuori, { valore: 0, riga: riga, fiducia: 'alta' });
        return;
      }
      var m = riga.match(RE_PUNTI);
      if (!m) return;
      var n = Number(m[1] || m[2]);
      if (!Number.isFinite(n) || n < 0 || n > 10) return;   // la patente ne ha 20, una violazione al massimo 10
      aggiungi(fuori, { valore: n, riga: riga, fiducia: 'alta' });
    });
    return fuori;
  }

  function cercaVerbale(righe) {
    var fuori = [];
    righe.forEach(function (riga) {
      var m = riga.match(RE_VERBALE);
      if (m) aggiungi(fuori, { valore: m[1], riga: riga, fiducia: 'alta' });
    });
    return fuori;
  }

  // Tre stati per ogni campo, perche' "non trovato" e "trovato due volte" sono
  // problemi diversi e l'interfaccia li deve trattare in modo diverso.
  function stato(candidati) {
    if (!candidati.length) return 'assente';
    var forti = candidati.filter(function (c) { return c.fiducia === 'alta'; });
    if (forti.length === 1) return 'trovato';
    if (candidati.length === 1) return 'trovato';
    return 'ambiguo';
  }

  function campiDaRighe(righe) {
    var pulite = (righe || []).map(pulisci).filter(Boolean);
    var date = cercaDate(pulite);
    var importi = cercaImporti(pulite);
    var articoli = cercaArticoli(pulite);

    var campi = {
      dataViolazione: { candidati: date.violazione, stato: stato(date.violazione) },
      dataNotifica: { candidati: date.notifica, stato: stato(date.notifica) },
      altreDate: date.altre,
      importi: importi,
      articoli: { candidati: articoli, stato: stato(articoli) },
      punti: { candidati: cercaPunti(pulite), stato: stato(cercaPunti(pulite)) },
      verbale: { candidati: cercaVerbale(pulite), stato: stato(cercaVerbale(pulite)) }
    };

    // L'assenza della data di notifica e' il caso normale: il verbale viene
    // stampato prima di essere notificato. Va spiegato, non segnalato come guasto.
    if (campi.dataNotifica.stato === 'assente') {
      campi.dataNotifica.perche = 'La data di notifica di solito non è sul verbale: si trova sulla busta, ' +
        'sulla cartolina verde dell’avviso di ricevimento o nel tracking della raccomandata.';
    }

    return { campi: campi, righeLette: pulite.length };
  }

  // ------------------------------------------------------------------ ingressi

  // Sotto questa soglia il documento e' una scansione: il testo non c'e',
  // bisogna passare dall'OCR.
  var CARATTERI_MINIMI = 40;

  function daRighe(righe) {
    var pulite = (righe || []).map(pulisci).filter(Boolean);
    var caratteri = pulite.join('').replace(/\s/g, '').length;
    if (caratteri < CARATTERI_MINIMI) {
      return {
        ok: false,
        serveOcr: true,
        righe: pulite,
        righeLette: pulite.length,
        motivo: 'Il documento non contiene testo leggibile: è una scansione o una foto. ' +
                'Serve il riconoscimento ottico.'
      };
    }
    var letto = campiDaRighe(pulite);
    return { ok: true, serveOcr: false, righe: pulite, campi: letto.campi, righeLette: letto.righeLette };
  }

  function leggiTesto(testo) {
    return daRighe(String(testo || '').split('\n'));
  }

  // Le parole dell'OCR passano per lo stesso lettore di righe dei frammenti di
  // pdf.js: un parser solo, due strade d'ingresso.
  function leggiParole(parole) {
    return daRighe(P().righeDaContenuto(P().itemsDaParole(parole)));
  }

  function leggiPdf(dati, pdfjs) {
    return P().righeDaPdf(dati, pdfjs).then(daRighe).catch(function () {
      return { ok: false, serveOcr: false, righe: [], motivo: 'Il file non è un PDF leggibile.' };
    });
  }

  return {
    campiDaRighe: campiDaRighe,
    leggiTesto: leggiTesto,
    leggiParole: leggiParole,
    leggiPdf: leggiPdf,
    numeroIt: numeroIt,
    // esposte per i test
    cercaDate: cercaDate,
    cercaImporti: cercaImporti,
    cercaArticoli: cercaArticoli,
    cercaPunti: cercaPunti
  };
});
