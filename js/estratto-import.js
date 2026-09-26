// js/estratto-import.js — Lettura dell'estratto conto INPS: XML e PDF.
//
// L'INPS lo mette a disposizione in PDF e in XML. Il pulsante XML sta in fondo
// alla pagina del servizio e sfugge, quindi qui si leggono entrambi.
//
// Come e' scritto e perche': il tracciato non e' pubblicato, quindi invece di
// inseguire nomi di tag precisi si cerca la FORMA di un periodo — una data di
// inizio, una di fine e, se c'e', un numero di settimane. Se non si riconosce
// niente, lo strumento lo dice e passa all'inserimento manuale: non tira a
// indovinare.
//
// Una cosa imparata a mie spese: il tracciato vero scrive le date come TRE
// elementi annidati,
//
//     <Dal><Giorno>16</Giorno><Mese>09</Mese><Anno>2024</Anno></Dal>
//
// e la prima versione di questo file, provata solo contro formati che mi ero
// inventato, non ne leggeva nemmeno un periodo. Da qui l'attenzione ai campi
// composti, e i test sulla struttura reale.
//
// Chi usa questo modulo deve mostrare all'utente quello che e' stato estratto
// PRIMA di analizzarlo: e' l'unico modo onesto di lavorare con un tracciato di
// cui non si ha la specifica.
//
// La lettura delle righe di un PDF e la validazione delle date stanno in
// js/pdf-righe.js: non sono cose dell'estratto conto, servono a qualsiasi
// documento della PA, e duplicarle vorrebbe dire correggerle in un posto solo.
(function (root, factory) {
  'use strict';
  var api = factory(typeof require === 'function' ? require('./pdf-righe.js') : null);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EstrattoImport = api;
})(typeof self !== 'undefined' ? self : globalThis, function (righeNode) {
  'use strict';

  function P() {
    if (righeNode) return righeNode;
    var g = (typeof window !== 'undefined' && window) || (typeof self !== 'undefined' && self);
    if (g && g.PdfRighe) return g.PdfRighe;
    throw new Error('[EstrattoImport] js/pdf-righe.js non caricato.');
  }

  // Nomi plausibili, in minuscolo e senza separatori.
  var INIZIO = ['datainizio', 'datadal', 'dal', 'inizio', 'periododal', 'datainiziope', 'decorrenza'];
  var FINE = ['datafine', 'dataal', 'al', 'fine', 'periodoal', 'datafinepe', 'scadenza'];
  // L'ordine conta: primoFra restituisce il primo che trova. "Diritto" conta per
  // RAGGIUNGERE il requisito, "Calcolo" per determinare l'importo della pensione.
  // Qui si misura l'anzianita', quindi Diritto viene prima.
  var SETTIMANE = ['settimane', 'contributiutilidiritto', 'settimanecontributive',
                   'numerosettimane', 'sett', 'settutili', 'contributiutilicalcolo'];
  var UNITA = ['tipocontributo', 'unitamisura', 'unita', 'unitadimisura'];
  var GESTIONE = ['gestione', 'fondo', 'tipogestione', 'descrizionegestione', 'cassa'];
  var TIPO = ['tipo', 'tipocontribuzione', 'tipocontributo', 'categoria', 'descrizione'];
  var DATORE = ['azienda', 'datore', 'datorelavoro', 'aziendaditta', 'ditta'];
  var NOME_DATORE = ['descrizione', 'denominazione', 'ragionesociale', 'nome'];

  // Elementi che sono solo involucri: non nominano una gestione.
  var CONTENITORI = ['contributi', 'periodi', 'righe', 'elenco', 'lista', 'dati',
                     'estrattoconto', 'righecontributi', 'document'];

  function chiave(nome) {
    return String(nome || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // 'RegimeGenerale' -> 'Regime Generale'
  function etichetta(nome) {
    return String(nome || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  }

  // Validazione e normalizzazione delle date stanno in js/pdf-righe.js: qui
  // restano solo i nomi, cosi' i punti di chiamata non cambiano.
  function iso(anno, mese, giorno) { return P().iso(anno, mese, giorno); }
  function normalizzaData(testo) { return P().normalizzaData(testo); }

  // Ricompone una data scritta come tre elementi figli.
  function dataDaFigli(nodo) {
    var parti = {};
    var figli = nodo.children || [];
    for (var i = 0; i < figli.length; i++) {
      var k = chiave(figli[i].nodeName);
      if (k === 'giorno' || k === 'mese' || k === 'anno') parti[k] = (figli[i].textContent || '').trim();
    }
    if (!parti.anno || !parti.mese) return null;      // l'anno da solo non e' una data
    return iso(parti.anno, parti.mese, parti.giorno);
  }

  // Raccoglie i campi di un nodo: figli diretti con solo testo, le date composte
  // dai loro tre figli, piu' gli attributi.
  function campiDi(nodo) {
    var campi = {};
    if (nodo.attributes) {
      for (var a = 0; a < nodo.attributes.length; a++) {
        campi[chiave(nodo.attributes[a].name)] = nodo.attributes[a].value;
      }
    }
    var figli = nodo.children || [];
    for (var i = 0; i < figli.length; i++) {
      var f = figli[i];
      if (f.children && f.children.length) {
        var composta = dataDaFigli(f);
        if (composta) campi[chiave(f.nodeName)] = composta;
        continue;
      }
      campi[chiave(f.nodeName)] = (f.textContent || '').trim();
    }
    return campi;
  }

  function primoFra(campi, nomi) {
    for (var i = 0; i < nomi.length; i++) {
      if (campi[nomi[i]] !== undefined && campi[nomi[i]] !== '') return campi[nomi[i]];
    }
    return null;
  }

  // Nel tracciato vero la gestione non e' un campo del periodo: e' l'elemento
  // che lo contiene (RegimeGenerale, GestioneSeparata, FondiSpeciali...).
  // Si richiede un nome di almeno cinque caratteri perche' un contenitore
  // anonimo come <e> non e' il nome di una gestione.
  function gestioneDaAntenati(nodo) {
    var n = nodo && nodo.parentNode;
    while (n && n.nodeName) {
      var k = chiave(n.nodeName);
      if (k.length >= 5 && CONTENITORI.indexOf(k) === -1) return etichetta(n.nodeName);
      n = n.parentNode;
    }
    return null;
  }

  // Il datore sta in un sottoelemento: <Azienda><Descrizione>...</Descrizione>.
  // Serve a riconoscere il periodo guardando la tabella di verifica.
  function datoreDi(nodo) {
    var figli = nodo.children || [];
    for (var i = 0; i < figli.length; i++) {
      if (DATORE.indexOf(chiave(figli[i].nodeName)) === -1) continue;
      var dentro = figli[i].children || [];
      for (var j = 0; j < dentro.length; j++) {
        if (NOME_DATORE.indexOf(chiave(dentro[j].nodeName)) !== -1) {
          var v = (dentro[j].textContent || '').trim();
          if (v) return v;
        }
      }
      if (!dentro.length) {
        var diretto = (figli[i].textContent || '').trim();
        if (diretto) return diretto;
      }
    }
    return null;
  }

  // I contributi non sono sempre in settimane. Per i lavoratori agricoli sono
  // giornate, e una settimana non sono sette giornate: convertire a occhio
  // falserebbe l'anzianita'. Quindi si converte solo quello che e' univoco e il
  // resto si dichiara, lasciando ricavare le settimane dalle date.
  function settimaneDa(valore, unita) {
    var numero = valore === null ? null : Number(String(valore).replace(',', '.'));
    if (!Number.isFinite(numero)) return { settimane: undefined, dichiarato: undefined };

    var u = chiave(unita);
    if (!u || u === 'settimane' || u === 'settimana' || u === 'sett') {
      return { settimane: numero, dichiarato: numero };
    }
    if (u === 'mesi' || u === 'mese') {
      return { settimane: Math.round(numero * 52 / 12), dichiarato: numero };
    }
    return { settimane: undefined, dichiarato: numero };
  }

  function nodoAPeriodo(nodo) {
    var campi = campiDi(nodo);
    var dal = normalizzaData(primoFra(campi, INIZIO));
    var al = normalizzaData(primoFra(campi, FINE));
    if (!dal || !al) return null;

    var unita = primoFra(campi, UNITA);
    var conteggio = settimaneDa(primoFra(campi, SETTIMANE), unita);
    var gestione = primoFra(campi, GESTIONE) || gestioneDaAntenati(nodo);

    // TipoContributo e' l'unita' di misura, non il tipo di contribuzione: se
    // finisse anche in "tipo" la tabella mostrerebbe "Settimane" come categoria.
    var tipo = primoFra(campi, TIPO);
    if (tipo && unita && chiave(tipo) === chiave(unita)) {
      tipo = primoFra(campi, ['tipocontribuzione', 'categoria']);
    }

    return {
      dal: dal,
      al: al,
      settimane: conteggio.settimane,
      dichiarato: conteggio.dichiarato,
      unita: unita || undefined,
      gestione: gestione || undefined,
      tipo: tipo || undefined,
      datore: datoreDi(nodo) || undefined,
      origine: nodo.nodeName
    };
  }

  // Dell'anagrafica si legge SOLO il sesso, perche' cambia il requisito della
  // pensione anticipata. Nome, codice fiscale e indirizzo non si leggono: quello
  // che non si tocca non puo' finire per sbaglio sullo schermo o in un registro.
  function anagraficaDi(doc) {
    var nodi = doc.getElementsByTagName('*');
    for (var i = 0; i < nodi.length; i++) {
      if (chiave(nodi[i].nodeName) !== 'sesso') continue;
      var v = (nodi[i].textContent || '').trim().toLowerCase();
      if (/^(m|maschio|maschile|uomo)/.test(v)) return { sesso: 'M' };
      if (/^(f|femmina|femminile|donna)/.test(v)) return { sesso: 'F' };
      return null;
    }
    return null;
  }

  // Le avvertenze dell'INPS si riportano come sono: e' l'istituto a dire che
  // l'estratto non ha valore certificativo, e vale piu' detto da lui.
  function avvertenzeDi(doc) {
    var fuori = [];
    var nodi = doc.getElementsByTagName('*');
    for (var i = 0; i < nodi.length; i++) {
      if (chiave(nodi[i].nodeName).indexOf('avvertenz') !== 0) continue;
      var t = (nodi[i].textContent || '').trim();
      if (t && fuori.indexOf(t) === -1) fuori.push(t);
    }
    return fuori;
  }

  // `xml`: stringa. `parser`: DOMParser (nel browser c'e' gia').
  function leggiXml(xml, parser) {
    var P = parser || (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
    if (!P) return { ok: false, motivo: 'Lettore XML non disponibile in questo browser.', periodi: [] };

    var doc;
    try { doc = P.parseFromString(String(xml), 'application/xml'); }
    catch (e) { return { ok: false, motivo: 'Il file non è un XML leggibile.', periodi: [] }; }

    if (!doc || doc.getElementsByTagName('parsererror').length) {
      return { ok: false, motivo: 'Il file non è un XML valido.', periodi: [] };
    }

    var periodi = [], visti = {};
    var tutti = doc.getElementsByTagName('*');
    for (var i = 0; i < tutti.length; i++) {
      var p = nodoAPeriodo(tutti[i]);
      if (!p) continue;
      // Lo stesso periodo puo' comparire annidato: si tiene una volta sola.
      var firma = p.dal + '|' + p.al + '|' + (p.settimane || '') + '|' + (p.gestione || '');
      if (visti[firma]) continue;
      visti[firma] = true;
      periodi.push(p);
    }

    if (!periodi.length) {
      return {
        ok: false,
        periodi: [],
        motivo: 'Nel file non sono stati riconosciuti periodi contributivi. ' +
                'Può essere un tracciato diverso da quelli previsti: inserisci i periodi a mano.'
      };
    }

    return {
      ok: true,
      periodi: periodi,
      anagrafica: anagraficaDi(doc),
      avvertenze: avvertenzeDi(doc),
      elementi: Array.from(new Set(periodi.map(function (p) { return p.origine; })))
    };
  }

  // ------------------------------------------------------------------ PDF
  //
  // Stessa filosofia dell'XML: non si inseguono coordinate o intestazioni fisse,
  // che cambiano da un'edizione all'altra del modulo. Si cerca la forma di una
  // riga di periodo — due date sulla stessa riga, e se c'e' un numero di
  // settimane. Tutto il resto del foglio viene ignorato.

  // Una riga di testo -> un periodo, se ne ha la forma.
  function rigaAPeriodo(riga) {
    var testo = String(riga || '').replace(/\s+/g, ' ').trim();
    if (!testo) return null;

    var date = P().dateInTesto(testo);
    if (date.length < 2) return null;

    var dal = normalizzaData(date[0]);
    var al = normalizzaData(date[1]);
    if (!dal || !al) return null;

    // Le settimane sono il primo intero plausibile dopo la seconda data.
    // Si guardano solo i token interi e isolati: in "1250,00 euro" il "00" non
    // e' un numero di settimane, e senza questo controllo verrebbe preso per tale.
    var coda = testo.slice(testo.indexOf(date[1]) + date[1].length).trim();
    var token = coda.split(/\s+/).filter(Boolean);
    var sett;
    for (var i = 0; i < token.length; i++) {
      if (!/^\d{1,2}$/.test(token[i])) continue;      // niente decimali, niente importi
      var n = Number(token[i]);
      if (n >= 1 && n <= 53) { sett = n; break; }     // in un periodo non si superano le 53
    }

    // Nell'estratto vero, dopo le date viene il tipo di contribuzione, poi i
    // numeri, poi il datore:
    //   "16/09/2024 16/10/2024 Apprendista sett. 5 5,000 2.696,00 ALFA SRL"
    // Tipo e datore si ricavano dalla posizione rispetto ai numeri. E' un
    // tentativo, e riguarda solo le colonne descrittive della tabella di
    // verifica: nessun conteggio dipende da queste due righe.
    var primoNumero = -1, ultimoNumero = -1;
    for (var k = 0; k < token.length; k++) {
      if (!/\d/.test(token[k])) continue;
      if (primoNumero === -1) primoNumero = k;
      ultimoNumero = k;
    }
    var tipo = primoNumero > 0
      ? token.slice(0, primoNumero).join(' ').replace(/\bsett\.?$/i, '').trim()
      : '';
    var datore = (ultimoNumero !== -1 && ultimoNumero + 1 < token.length)
      ? token.slice(ultimoNumero + 1).join(' ')
      : '';

    // La descrizione e' quello che resta prima della prima data.
    var testa = testo.slice(0, testo.indexOf(date[0])).trim().replace(/[|;,]+$/, '');

    return {
      dal: dal,
      al: al,
      settimane: sett,
      gestione: testa || undefined,
      tipo: tipo || undefined,
      datore: datore || undefined,
      origine: 'riga PDF'
    };
  }

  function periodiDaRighe(righe) {
    var fuori = [], visti = {};
    (righe || []).forEach(function (r) {
      var p = rigaAPeriodo(r);
      if (!p) return;
      var firma = p.dal + '|' + p.al + '|' + (p.settimane === undefined ? '' : p.settimane);
      if (visti[firma]) return;
      visti[firma] = true;
      fuori.push(p);
    });
    return fuori;
  }

  // La ricostruzione delle righe e il raddrizzamento delle pagine ruotate stanno
  // in js/pdf-righe.js. Qui restano i nomi: l'estratto conto dell'INPS ha
  // page.rotate === 90, ed e' li' che quella correzione e' stata scoperta.
  function righeDaContenuto(items, tolleranza) { return P().righeDaContenuto(items, tolleranza); }
  function itemsInVista(pagina, items, lib) { return P().itemsInVista(pagina, items, lib); }

  // `dati`: ArrayBuffer del PDF. `pdfjs`: la libreria gia' caricata in pagina.
  function leggiPdf(dati, pdfjs) {
    var lib = pdfjs || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
    if (!lib) {
      return Promise.resolve({ ok: false, periodi: [], motivo: 'Lettore PDF non disponibile.' });
    }

    return lib.getDocument({ data: dati, isEvalSupported: false }).promise.then(function (doc) {
      var pagine = [];
      for (var i = 1; i <= doc.numPages; i++) pagine.push(i);

      return Promise.all(pagine.map(function (n) {
        return doc.getPage(n).then(function (pg) {
          return pg.getTextContent().then(function (c) {
            return itemsInVista(pg, c.items, lib);
          });
        });
      })).then(function (contenuti) {
        var righe = [];
        contenuti.forEach(function (items) { righe = righe.concat(righeDaContenuto(items)); });

        var periodi = periodiDaRighe(righe);
        if (!periodi.length) {
          return {
            ok: false,
            periodi: [],
            righeLette: righe.length,
            motivo: 'Nel PDF non sono state riconosciute righe con periodi contributivi. ' +
                    'Se il documento è il Cassetto previdenziale (solo anagrafica) non contiene i periodi: ' +
                    'serve l’estratto conto contributivo vero e proprio. In alternativa inserisci i periodi a mano.'
          };
        }
        return { ok: true, periodi: periodi, righeLette: righe.length };
      });
    }).catch(function () {
      return { ok: false, periodi: [], motivo: 'Il file non è un PDF leggibile.' };
    });
  }

  return {
    leggiXml: leggiXml,
    leggiPdf: leggiPdf,
    normalizzaData: normalizzaData,
    dataDaFigli: dataDaFigli,
    nodoAPeriodo: nodoAPeriodo,
    rigaAPeriodo: rigaAPeriodo,
    periodiDaRighe: periodiDaRighe,
    righeDaContenuto: righeDaContenuto
  };
});
