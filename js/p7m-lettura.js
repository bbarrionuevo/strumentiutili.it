// js/p7m-lettura.js — Che cosa c'e' dentro un file .p7m.
//
// Un .p7m e' una busta CAdES (CMS SignedData, RFC 5652): dentro ci sono il
// documento originale, i certificati e le firme. Il sistema operativo non sa
// aprirlo perche' l'estensione non dice che cosa contiene. Qui si apre la
// busta, si tira fuori il documento con la sua estensione vera e si leggono i
// dati scritti in chiaro nelle firme: chi, quando, con quale certificato.
//
// Che cosa NON fa, di proposito: non verifica la firma. Non controlla la
// crittografia, ne' la catena dei certificati, ne' le revoche. Per questo il
// risultato non ha un campo "valida": non deve esserci niente che l'interfaccia
// possa scambiare per un giudizio. Una firma letta non e' una firma verificata.
//
// Perche' un lettore scritto a mano invece di pkijs: servono quattro campi di
// una struttura fissa da trent'anni. Un parser BER di cento righe si prova in
// Node con file veri, funziona senza CDN e non ha dipendenze da aggiornare.
// Le due cose che lo rendono piu' di un parser DER:
//
//   1. Lunghezze indefinite. Molti programmi di firma scrivono in "streaming":
//      la lunghezza e' 0x80 e il blocco finisce con 00 00. Un parser DER puro
//      rifiuta questi file, che sono validissimi.
//   2. OCTET STRING a pezzi. Nello stesso modo il documento puo' arrivare
//      spezzato in piu' blocchi da ricucire in ordine.
//
// Funziona nel browser (window.P7mLettura) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.P7mLettura = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
  var OID_DATA = '1.2.840.113549.1.7.1';
  var OID_SIGNING_TIME = '1.2.840.113549.1.9.5';
  var OID_SKI = '2.5.29.14';
  var MAX_BUSTE = 5;
  var MAX_PROFONDITA = 64;

  var ATTRIBUTI_NOME = {
    '2.5.4.3': 'cn',
    '2.5.4.4': 'cognome',
    '2.5.4.42': 'nome',
    '2.5.4.5': 'numeroSerie',
    '2.5.4.6': 'paese',
    '2.5.4.10': 'organizzazione',
    '2.5.4.11': 'unita',
    '2.5.4.97': 'idOrganizzazione'
  };

  function errore(codice, messaggio) {
    var e = new Error(messaggio);
    e.codice = codice;
    return e;
  }

  // ------------------------------------------------------------------ BER

  function leggiNodo(b, pos, limite, profondita) {
    if (profondita > MAX_PROFONDITA) throw errore('danneggiato', 'Struttura annidata oltre ogni misura ragionevole.');
    if (pos + 2 > limite) throw errore('danneggiato', 'Il file finisce a meta\' di un elemento.');
    var p = pos;
    var t = b[p++];
    var nodo = { classe: t >> 6, costruito: !!(t & 0x20), numero: t & 0x1f, inizio: pos };
    if (nodo.numero === 0x1f) {
      nodo.numero = 0;
      var c;
      do {
        if (p >= limite) throw errore('danneggiato', 'Etichetta interrotta.');
        c = b[p++];
        nodo.numero = nodo.numero * 128 + (c & 0x7f);
      } while (c & 0x80);
    }
    if (p >= limite) throw errore('danneggiato', 'Lunghezza mancante.');
    var l = b[p++];
    if (l === 0x80) {
      if (!nodo.costruito) throw errore('danneggiato', 'Lunghezza indefinita su un elemento semplice.');
      nodo.figli = [];
      nodo.dati = p;
      for (;;) {
        if (p + 2 > limite) throw errore('danneggiato', 'Manca la chiusura di un blocco a lunghezza indefinita.');
        if (b[p] === 0 && b[p + 1] === 0) { nodo.fineDati = p; p += 2; break; }
        var figlio = leggiNodo(b, p, limite, profondita + 1);
        nodo.figli.push(figlio);
        p = figlio.fine;
      }
      nodo.fine = p;
      return nodo;
    }
    var lunghezza = l;
    if (l & 0x80) {
      var n = l & 0x7f;
      if (n > 4) throw errore('danneggiato', 'Lunghezza fuori misura.');
      lunghezza = 0;
      for (var i = 0; i < n; i++) {
        if (p >= limite) throw errore('danneggiato', 'Lunghezza interrotta.');
        lunghezza = lunghezza * 256 + b[p++];
      }
    }
    nodo.dati = p;
    nodo.fineDati = p + lunghezza;
    nodo.fine = nodo.fineDati;
    if (nodo.fine > limite) throw errore('danneggiato', 'Il file è troncato: un elemento dichiara più byte di quelli presenti.');
    if (nodo.costruito) {
      nodo.figli = [];
      var q = nodo.dati;
      while (q < nodo.fineDati) {
        var f = leggiNodo(b, q, nodo.fineDati, profondita + 1);
        nodo.figli.push(f);
        q = f.fine;
      }
    }
    return nodo;
  }

  var universale = function (nodo, numero) { return nodo && nodo.classe === 0 && nodo.numero === numero; };
  var contesto = function (nodo, numero) { return nodo && nodo.classe === 2 && nodo.numero === numero; };

  function oid(b, nodo) {
    var v = b.subarray(nodo.dati, nodo.fineDati);
    if (!v.length) return '';
    var parti = [Math.floor(v[0] / 40), v[0] % 40];
    var n = 0;
    for (var i = 1; i < v.length; i++) {
      n = n * 128 + (v[i] & 0x7f);
      if (!(v[i] & 0x80)) { parti.push(n); n = 0; }
    }
    if (parti[0] > 2) { parti[1] += (parti[0] - 2) * 40; parti[0] = 2; }
    return parti.join('.');
  }

  // Il contenuto di una OCTET STRING, anche quando arriva a pezzi.
  function ottetti(b, nodo) {
    if (!nodo.costruito) return b.slice(nodo.dati, nodo.fineDati);
    var pezzi = nodo.figli.map(function (f) { return ottetti(b, f); });
    var totale = pezzi.reduce(function (s, x) { return s + x.length; }, 0);
    var fuori = new Uint8Array(totale);
    var o = 0;
    pezzi.forEach(function (x) { fuori.set(x, o); o += x.length; });
    return fuori;
  }

  function uguali(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ------------------------------------------------------------- testi

  function utf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    return decodeURIComponent(escape(String.fromCharCode.apply(null, bytes)));
  }

  function stringa(b, nodo) {
    var v = b.subarray(nodo.dati, nodo.fineDati);
    var s = '';
    var i;
    if (nodo.numero === 12) return utf8(v);                         // UTF8String
    if (nodo.numero === 30) {                                        // BMPString, UTF-16BE
      for (i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode((v[i] << 8) | v[i + 1]);
      return s;
    }
    if (nodo.numero === 28) {                                        // UniversalString, UTF-32BE
      for (i = 0; i + 3 < v.length; i += 4) s += String.fromCodePoint(((v[i] << 24) | (v[i + 1] << 16) | (v[i + 2] << 8) | v[i + 3]) >>> 0);
      return s;
    }
    for (i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);  // Printable, IA5, T61
    return s;
  }

  function nome(b, nodo) {
    var fuori = {};
    (nodo.figli || []).forEach(function (insieme) {
      (insieme.figli || []).forEach(function (coppia) {
        if (!coppia.figli || coppia.figli.length < 2) return;
        var chiave = ATTRIBUTI_NOME[oid(b, coppia.figli[0])];
        if (chiave && !fuori[chiave]) fuori[chiave] = stringa(b, coppia.figli[1]).trim();
      });
    });
    return fuori;
  }

  // UTCTime (AAMMGGhhmmss Z) e GeneralizedTime (AAAAMMGGhhmmss[.fff] Z).
  // Restituisce una data ISO in UTC: niente fusi orari qui dentro.
  function tempo(testo, generalizzato) {
    var m = generalizzato
      ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(testo)
      : /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(testo);
    if (!m) return null;
    var anno = Number(m[1]);
    if (!generalizzato) anno += anno >= 50 ? 1900 : 2000;           // RFC 5280, 4.1.2.5.1
    var d = new Date(Date.UTC(anno, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function tempoDaNodo(b, nodo) {
    if (!nodo || nodo.classe !== 0 || (nodo.numero !== 23 && nodo.numero !== 24)) return null;
    return tempo(stringa(b, nodo), nodo.numero === 24);
  }

  // ------------------------------------------------------------ certificati

  function certificato(b, nodo) {
    var tbs = nodo.figli && nodo.figli[0];
    if (!tbs || !tbs.figli) return null;
    var c = tbs.figli.slice();
    if (contesto(c[0], 0)) c.shift();                                // versione
    var seriale = c[0], emittente = c[2], validita = c[3], soggetto = c[4];
    if (!seriale || !emittente || !validita || !soggetto) return null;
    var ski = null;
    tbs.figli.forEach(function (x) {
      if (!contesto(x, 3) || !x.figli || !x.figli[0]) return;
      x.figli[0].figli.forEach(function (est) {
        if (!est.figli || oid(b, est.figli[0]) !== OID_SKI) return;
        var valore = est.figli[est.figli.length - 1];
        try {
          var interno = leggiNodo(b, valore.dati, valore.fineDati, 0);
          ski = b.slice(interno.dati, interno.fineDati);
        } catch (e) { /* estensione illeggibile: si ignora */ }
      });
    });
    return {
      emittenteGrezzo: b.slice(emittente.inizio, emittente.fine),
      seriale: b.slice(seriale.dati, seriale.fineDati),
      ski: ski,
      emittente: nome(b, emittente),
      soggetto: nome(b, soggetto),
      validoDal: tempoDaNodo(b, validita.figli && validita.figli[0]),
      validoAl: tempoDaNodo(b, validita.figli && validita.figli[1])
    };
  }

  // I certificati italiani scrivono il codice fiscale nel serialNumber come
  // "TINIT-RSSMRA80A01H501U" (ETSI EN 319 412-1) o, i piu' vecchi, "IT:...".
  // Senza uno di questi prefissi il numero di serie non e' un codice fiscale.
  function codiceFiscale(numeroSerie) {
    var m = /^(?:TINIT-|IT:)([A-Z0-9]{11,16})$/i.exec(String(numeroSerie || '').trim());
    return m ? m[1].toUpperCase() : null;
  }

  function nomeLeggibile(soggetto) {
    if (soggetto.nome && soggetto.cognome) return soggetto.nome + ' ' + soggetto.cognome;
    // Vecchio formato: "ROSSI MARIO/RSSMRA80A01H501U/7420000000123.abc"
    if (soggetto.cn) return soggetto.cn.split('/')[0].trim();
    return soggetto.organizzazione || null;
  }

  // --------------------------------------------------------------- busta

  function apriBusta(b) {
    var radice = leggiNodo(b, 0, b.length, 0);
    if (!universale(radice, 16) || !radice.figli || !universale(radice.figli[0], 6)) {
      throw errore('non-firmato', 'Il file non è una busta di firma digitale (CAdES/.p7m).');
    }
    var tipo = oid(b, radice.figli[0]);
    if (tipo !== OID_SIGNED_DATA) {
      throw errore('non-firmato', 'Il file è una struttura CMS ma non contiene una firma (tipo ' + tipo + ').');
    }
    var involucro = radice.figli[1];
    var sd = involucro && involucro.figli && involucro.figli[0];
    if (!contesto(involucro, 0) || !universale(sd, 16) || !sd.figli || sd.figli.length < 4) {
      throw errore('danneggiato', 'La busta di firma è incompleta.');
    }

    var eci = sd.figli[2];
    var contenutoNodo = eci && eci.figli && eci.figli[1];
    if (!contenutoNodo || !contesto(contenutoNodo, 0) || !contenutoNodo.figli || !contenutoNodo.figli[0]) {
      throw errore('firma-separata', 'Questo file contiene solo la firma: il documento firmato è un file a parte (firma "separata").');
    }
    var contenuto = ottetti(b, contenutoNodo.figli[0]);

    var certificati = [];
    var firmatari = null;
    sd.figli.slice(3).forEach(function (x) {
      if (contesto(x, 0) && x.figli) {
        x.figli.forEach(function (c) {
          if (!universale(c, 16)) return;
          var cert = certificato(b, c);
          if (cert) certificati.push(cert);
        });
      } else if (universale(x, 17)) {
        firmatari = x;
      }
    });

    var firme = ((firmatari && firmatari.figli) || []).map(function (si) {
      var f = si.figli || [];
      var sid = f[1];
      var cert = null;
      if (universale(sid, 16) && sid.figli && sid.figli.length >= 2) {
        var emittente = b.slice(sid.figli[0].inizio, sid.figli[0].fine);
        var seriale = b.slice(sid.figli[1].dati, sid.figli[1].fineDati);
        cert = certificati.filter(function (c) { return uguali(c.emittenteGrezzo, emittente) && uguali(c.seriale, seriale); })[0] || null;
      } else if (contesto(sid, 0)) {
        var id = b.slice(sid.dati, sid.fineDati);
        cert = certificati.filter(function (c) { return c.ski && uguali(c.ski, id); })[0] || null;
      }
      if (!cert && certificati.length === 1) cert = certificati[0];

      var dataFirma = null;
      f.forEach(function (x) {
        if (!contesto(x, 0) || !x.figli) return;
        x.figli.forEach(function (attr) {
          if (!attr.figli || attr.figli.length < 2 || oid(b, attr.figli[0]) !== OID_SIGNING_TIME) return;
          dataFirma = tempoDaNodo(b, attr.figli[1].figli && attr.figli[1].figli[0]);
        });
      });

      var soggetto = cert ? cert.soggetto : {};
      return {
        nome: nomeLeggibile(soggetto),
        codiceFiscale: codiceFiscale(soggetto.numeroSerie),
        organizzazione: soggetto.organizzazione || null,
        paese: soggetto.paese || null,
        dataFirma: dataFirma,
        emittente: cert ? (cert.emittente.cn || cert.emittente.organizzazione || null) : null,
        validoDal: cert ? cert.validoDal : null,
        validoAl: cert ? cert.validoAl : null
      };
    });

    return { contenuto: contenuto, firme: firme };
  }

  function eBusta(bytes) {
    if (!bytes || bytes.length < 16 || bytes[0] !== 0x30) return false;
    try {
      var radice = leggiNodo(bytes, 0, bytes.length, 0);
      return !!(radice.figli && universale(radice.figli[0], 6) && oid(bytes, radice.figli[0]) === OID_SIGNED_DATA);
    } catch (e) {
      return false;
    }
  }

  // ------------------------------------------------------------ base64

  // Alcuni sistemi consegnano il .p7m in base64, con o senza intestazione PEM
  // ("-----BEGIN PKCS7-----", "-----BEGIN CMS-----"). Si riconosce dal primo
  // byte: una busta binaria comincia sempre con 0x30.
  function daBase64(bytes) {
    if (!bytes || !bytes.length || bytes[0] === 0x30) return null;
    // Prova veloce sui primi byte, prima di convertire in testo un file
    // binario di decine di MB che base64 non e' di sicuro.
    for (var k = 0; k < Math.min(bytes.length, 128); k++) {
      var c = bytes[k];
      var ammesso = (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) ||
                    c === 0x2b || c === 0x2f || c === 0x3d || c === 0x2d || c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09;
      if (!ammesso) return null;
    }
    var testo = '';
    var limite = Math.min(bytes.length, 64 * 1024 * 1024);
    for (var i = 0; i < limite; i++) testo += String.fromCharCode(bytes[i]);
    testo = testo.replace(/-----(BEGIN|END)[^-]*-----/g, '').replace(/\s+/g, '');
    if (!testo || /[^A-Za-z0-9+/=]/.test(testo) || testo.length % 4 !== 0) return null;
    var alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var tavola = {};
    for (i = 0; i < alfabeto.length; i++) tavola[alfabeto[i]] = i;
    var pad = testo.endsWith('==') ? 2 : testo.endsWith('=') ? 1 : 0;
    var fuori = new Uint8Array(testo.length / 4 * 3 - pad);
    var o = 0;
    for (i = 0; i < testo.length; i += 4) {
      var n = (tavola[testo[i]] << 18) | (tavola[testo[i + 1]] << 12) |
              ((tavola[testo[i + 2]] || 0) << 6) | (tavola[testo[i + 3]] || 0);
      if (o < fuori.length) fuori[o++] = (n >> 16) & 0xff;
      if (o < fuori.length) fuori[o++] = (n >> 8) & 0xff;
      if (o < fuori.length) fuori[o++] = n & 0xff;
    }
    return fuori;
  }

  // ------------------------------------------------------------ tipo file

  function inizia(b, firma, da) {
    var o = da || 0;
    if (b.length < o + firma.length) return false;
    for (var i = 0; i < firma.length; i++) if (b[o + i] !== firma[i]) return false;
    return true;
  }

  function contieneAscii(b, testo, limite) {
    var fine = Math.min(b.length, limite || b.length);
    outer: for (var i = 0; i + testo.length <= fine; i++) {
      for (var j = 0; j < testo.length; j++) if (b[i + j] !== testo.charCodeAt(j)) continue outer;
      return true;
    }
    return false;
  }

  var TIPI = {
    pdf: { estensione: 'pdf', mime: 'application/pdf', descrizione: 'Documento PDF' },
    xml: { estensione: 'xml', mime: 'application/xml', descrizione: 'File XML' },
    docx: { estensione: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', descrizione: 'Documento Word' },
    xlsx: { estensione: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', descrizione: 'Foglio Excel' },
    pptx: { estensione: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', descrizione: 'Presentazione PowerPoint' },
    odt: { estensione: 'odt', mime: 'application/vnd.oasis.opendocument.text', descrizione: 'Documento OpenDocument' },
    zip: { estensione: 'zip', mime: 'application/zip', descrizione: 'Archivio ZIP' },
    doc: { estensione: 'doc', mime: 'application/msword', descrizione: 'Documento Word (vecchio formato)' },
    jpg: { estensione: 'jpg', mime: 'image/jpeg', descrizione: 'Immagine JPEG' },
    png: { estensione: 'png', mime: 'image/png', descrizione: 'Immagine PNG' },
    tif: { estensione: 'tif', mime: 'image/tiff', descrizione: 'Immagine TIFF' },
    rtf: { estensione: 'rtf', mime: 'application/rtf', descrizione: 'Documento RTF' },
    txt: { estensione: 'txt', mime: 'text/plain', descrizione: 'File di testo' },
    bin: { estensione: 'bin', mime: 'application/octet-stream', descrizione: 'File di tipo sconosciuto' }
  };

  function tipoDaByte(b) {
    if (inizia(b, [0x25, 0x50, 0x44, 0x46])) return TIPI.pdf;                       // %PDF
    if (inizia(b, [0x50, 0x4b, 0x03, 0x04])) {                                        // PK: formati Office e ODF
      if (contieneAscii(b, 'word/')) return TIPI.docx;
      if (contieneAscii(b, 'xl/')) return TIPI.xlsx;
      if (contieneAscii(b, 'ppt/')) return TIPI.pptx;
      if (contieneAscii(b, 'opendocument.text', 200)) return TIPI.odt;
      return TIPI.zip;
    }
    if (inizia(b, [0xd0, 0xcf, 0x11, 0xe0])) return TIPI.doc;
    if (inizia(b, [0xff, 0xd8, 0xff])) return TIPI.jpg;
    if (inizia(b, [0x89, 0x50, 0x4e, 0x47])) return TIPI.png;
    if (inizia(b, [0x49, 0x49, 0x2a, 0x00]) || inizia(b, [0x4d, 0x4d, 0x00, 0x2a])) return TIPI.tif;
    if (inizia(b, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return TIPI.rtf;                // {\rtf
    var da = inizia(b, [0xef, 0xbb, 0xbf]) ? 3 : 0;                                  // BOM UTF-8
    var i = da;
    while (i < b.length && (b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09)) i++;
    if (b[i] === 0x3c) return TIPI.xml;                                               // <
    var controllo = Math.min(b.length, 4096), stampabili = 0;
    for (var k = 0; k < controllo; k++) {
      var c = b[k];
      if (c === 0x09 || c === 0x0a || c === 0x0d || c >= 0x20) stampabili++;
      if (c === 0) return TIPI.bin;
    }
    return controllo && stampabili / controllo > 0.95 ? TIPI.txt : TIPI.bin;
  }

  function eFatturaElettronica(b, tipo) {
    return tipo.estensione === 'xml' && contieneAscii(b, 'FatturaElettronica', 4096);
  }

  // "contratto.pdf.p7m" -> "contratto.pdf"; "scansione.p7m" (un PDF) ->
  // "scansione.pdf". L'estensione giusta la decide il contenuto, non il nome.
  function nomeDocumento(nomeFile, tipo) {
    var base = String(nomeFile || '').split(/[\\/]/).pop() || 'documento';
    var prima;
    do { prima = base; base = base.replace(/\.(p7m|p7s)$/i, ''); } while (base !== prima);
    if (!base) base = 'documento';
    var est = tipo && tipo.estensione;
    if (!est || est === 'bin') return /\.[A-Za-z0-9]{2,5}$/.test(base) ? base : base + '.bin';
    var alias = est === 'jpg' ? /\.(jpe?g)$/i : est === 'tif' ? /\.(tiff?)$/i : new RegExp('\\.' + est + '$', 'i');
    return alias.test(base) ? base : base + '.' + est;
  }

  // --------------------------------------------------------------- API

  function leggi(dati, nomeFile) {
    var b = dati instanceof Uint8Array ? dati : new Uint8Array(dati || []);
    if (!b.length) throw errore('vuoto', 'Il file è vuoto.');
    var decodificato = daBase64(b);
    if (decodificato) b = decodificato;
    if (b[0] !== 0x30) throw errore('non-firmato', 'Il file non è una busta di firma digitale (CAdES/.p7m).');

    var firme = [];
    var buste = 0;
    var contenuto = b;
    // Una busta dentro l'altra: .p7m.p7m, firme apposte una dopo l'altra.
    do {
      var aperta = apriBusta(contenuto);
      buste++;
      aperta.firme.forEach(function (f) { f.busta = buste; firme.push(f); });
      contenuto = aperta.contenuto;
    } while (buste < MAX_BUSTE && eBusta(contenuto));

    var tipo = tipoDaByte(contenuto);
    return {
      contenuto: contenuto,
      tipo: tipo,
      nome: nomeDocumento(nomeFile, tipo),
      fatturaElettronica: eFatturaElettronica(contenuto, tipo),
      buste: buste,
      firme: firme
    };
  }

  return {
    leggi: leggi,
    tipoDaByte: tipoDaByte,
    nomeDocumento: nomeDocumento,
    codiceFiscale: codiceFiscale,
    tempo: tempo,
    daBase64: daBase64,
    eBusta: eBusta
  };
});
