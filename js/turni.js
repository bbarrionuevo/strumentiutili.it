// js/turni.js — Il calendario dei turni: che turno faccio in un giorno, quante
// ore nel mese, e un link per passare lo schema ai colleghi.
//
// Uno schema e' un ciclo di sigle che si ripete (per esempio M P N S R, la
// "quinta" degli ospedali) a partire da una data. Ogni sigla ha nome, orario e
// colore. Sopra il ciclo si possono segnare i cambi di un giorno: ferie,
// malattia, permesso o un turno diverso.
//
// Le date sono stringhe AAAA-MM-GG e i conti si fanno in giorni interi UTC:
// niente oggetti Date locali, quindi niente sorprese con l'ora legale o con
// chi apre la pagina da un altro fuso.
//
// Funziona nel browser (window.Turni) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Turni = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var GIORNO_MS = 86400000;

  // Le assenze che si segnano sopra il ciclo. Non sono ore lavorate.
  var ASSENZE = {
    FE: { sigla: 'FE', nome: 'Ferie', colore: '#16a34a' },
    MA: { sigla: 'MA', nome: 'Malattia', colore: '#dc2626' },
    PE: { sigla: 'PE', nome: 'Permesso', colore: '#9333ea' }
  };

  function tipo(sigla, nome, inizio, fine, colore) {
    var t = { sigla: sigla, nome: nome, colore: colore };
    if (inizio) { t.inizio = inizio; t.fine = fine; }
    return t;
  }

  // Gli schemi piu' diffusi. Gli orari sono quelli tipici e si cambiano nella
  // pagina: quello che conta e' la sequenza.
  var SCHEMI = {
    quinta: {
      nome: 'In quinta: Mattina, Pomeriggio, Notte, Smonto, Riposo',
      ciclo: ['M', 'P', 'N', 'S', 'R'],
      tipi: [
        tipo('M', 'Mattina', '07:00', '14:00', '#f59e0b'),
        tipo('P', 'Pomeriggio', '14:00', '21:00', '#0284c7'),
        tipo('N', 'Notte', '21:00', '07:00', '#4338ca'),
        tipo('S', 'Smonto', null, null, '#94a3b8'),
        tipo('R', 'Riposo', null, null, '#10b981')
      ]
    },
    quarta: {
      nome: 'In quarta, 12 ore: Giorno, Notte, Smonto, Riposo',
      ciclo: ['G', 'N', 'S', 'R'],
      tipi: [
        tipo('G', 'Giorno', '08:00', '20:00', '#0ea5e9'),
        tipo('N', 'Notte', '20:00', '08:00', '#4338ca'),
        tipo('S', 'Smonto', null, null, '#94a3b8'),
        tipo('R', 'Riposo', null, null, '#10b981')
      ]
    },
    continuo: {
      nome: 'Ciclo continuo 3×8: 2 mattine, 2 pomeriggi, 2 notti, 4 riposi',
      ciclo: ['M', 'M', 'P', 'P', 'N', 'N', 'R', 'R', 'R', 'R'],
      tipi: [
        tipo('M', 'Mattina', '06:00', '14:00', '#f59e0b'),
        tipo('P', 'Pomeriggio', '14:00', '22:00', '#0284c7'),
        tipo('N', 'Notte', '22:00', '06:00', '#4338ca'),
        tipo('R', 'Riposo', null, null, '#10b981')
      ]
    },
    settimana: {
      nome: 'Dal lunedì al venerdì, weekend libero',
      ciclo: ['L', 'L', 'L', 'L', 'L', 'R', 'R'],
      lunedi: true,
      tipi: [
        tipo('L', 'Lavoro', '09:00', '18:00', '#0284c7'),
        tipo('R', 'Riposo', null, null, '#10b981')
      ]
    }
  };

  var SIGLA = /^[A-Z0-9]{1,3}$/;
  var ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
  var COLORE = /^#[0-9a-fA-F]{6}$/;
  var DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

  // ---------------------------------------------------------------- date

  function giorno(iso) {
    var m = DATA.exec(String(iso || ''));
    if (!m) return NaN;
    var t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var d = new Date(t);
    if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return NaN;
    return t / GIORNO_MS;
  }

  function data(n) {
    return new Date(n * GIORNO_MS).toISOString().slice(0, 10);
  }

  function valida(iso) { return !isNaN(giorno(iso)); }

  function aggiungi(iso, giorni) { return data(giorno(iso) + giorni); }

  // 0 = lunedi' ... 6 = domenica
  function giornoSettimana(iso) { return (new Date(giorno(iso) * GIORNO_MS).getUTCDay() + 6) % 7; }

  function lunediDi(iso) { return aggiungi(iso, -giornoSettimana(iso)); }

  function giorniNelMese(anno, mese) { return new Date(Date.UTC(anno, mese, 0)).getUTCDate(); }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---------------------------------------------------------------- orari

  function minuti(hhmm) { return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)); }

  // Ore di un turno. Se finisce "prima" di iniziare (22:00-06:00) scavalca la
  // mezzanotte; se inizio e fine coincidono dura 24 ore.
  function ore(t) {
    if (!t || !t.inizio || !t.fine) return 0;
    var d = minuti(t.fine) - minuti(t.inizio);
    if (d <= 0) d += 24 * 60;
    return d / 60;
  }

  function scavalca(t) { return !!(t && t.inizio && t.fine && minuti(t.fine) <= minuti(t.inizio)); }

  // ---------------------------------------------------------------- schema

  function copia(x) { return JSON.parse(JSON.stringify(x)); }

  /**
   * Uno schema pronto da uno di quelli predefiniti.
   * @param {string} id      quinta | quarta | continuo | settimana
   * @param {string} inizio  il giorno in cui si fa il primo turno del ciclo
   */
  function daModello(id, inizio) {
    var m = SCHEMI[id];
    if (!m) throw new Error('Schema sconosciuto: ' + id);
    var s = { modello: id, ciclo: m.ciclo.slice(), tipi: copia(m.tipi), inizio: m.lunedi ? lunediDi(inizio) : inizio, eccezioni: {} };
    return s;
  }

  // Il tipo di una sigla: prima quelli dello schema, poi le assenze.
  function tipoDi(schema, sigla) {
    for (var i = 0; i < schema.tipi.length; i++) if (schema.tipi[i].sigla === sigla) return schema.tipi[i];
    return ASSENZE[sigla] || null;
  }

  function posizione(schema, iso) {
    var n = schema.ciclo.length;
    var d = giorno(iso) - giorno(schema.inizio);
    return ((d % n) + n) % n;
  }

  /**
   * Il turno di un giorno.
   * @returns {{ data, sigla, tipo, ore, cambio: boolean, ciclo: string }}
   *          ciclo e' la sigla prevista dal ciclo, sigla quella effettiva.
   */
  function turnoDel(schema, iso) {
    var previsto = schema.ciclo[posizione(schema, iso)];
    var cambio = schema.eccezioni && Object.prototype.hasOwnProperty.call(schema.eccezioni, iso) ? schema.eccezioni[iso] : null;
    var sigla = cambio || previsto;
    var t = tipoDi(schema, sigla);
    return { data: iso, sigla: sigla, tipo: t, ore: ore(t), cambio: !!cambio, ciclo: previsto };
  }

  /**
   * Tutti i giorni di un mese.
   * @param {Object} [festivi] mappa data -> [feste] (js/festivita.js mappaFestivita)
   */
  function mese(schema, anno, m, festivi) {
    var fuori = [];
    for (var g = 1; g <= giorniNelMese(anno, m); g++) {
      var iso = anno + '-' + pad(m) + '-' + pad(g);
      var t = turnoDel(schema, iso);
      t.settimana = giornoSettimana(iso);
      t.festa = (festivi && festivi[iso]) || null;
      fuori.push(t);
    }
    return fuori;
  }

  /**
   * Il riepilogo di un elenco di giorni (per esempio un mese).
   * Le notti si contano al giorno in cui iniziano; un festivo o una domenica
   * sono "lavorati" se quel giorno inizia un turno con orario.
   */
  function riepilogo(giorni) {
    var r = { ore: 0, lavorati: 0, notti: 0, festiviLavorati: 0, domenicheLavorate: 0, assenze: 0, perSigla: {} };
    giorni.forEach(function (g) {
      r.perSigla[g.sigla] = (r.perSigla[g.sigla] || 0) + 1;
      if (ASSENZE[g.sigla]) r.assenze++;
      if (!g.ore) return;
      r.ore += g.ore;
      r.lavorati++;
      if (scavalca(g.tipo)) r.notti++;
      if (g.settimana === 6) r.domenicheLavorate++;
      if (g.festa && g.festa.some(function (f) { return f.tipo === 'nazionale'; })) r.festiviLavorati++;
    });
    r.ore = Math.round(r.ore * 100) / 100;
    return r;
  }

  // Segna o toglie il cambio di un giorno. Tornare alla sigla del ciclo
  // equivale a togliere il cambio.
  function segna(schema, iso, sigla) {
    if (!schema.eccezioni) schema.eccezioni = {};
    if (!sigla || sigla === schema.ciclo[posizione(schema, iso)]) delete schema.eccezioni[iso];
    else schema.eccezioni[iso] = sigla;
    return schema;
  }

  // Sposta l'inizio del ciclo in modo che nel giorno "iso" cada la posizione
  // "pos": serve a chi sa "il 3 ottobre faccio la notte".
  function allinea(schema, iso, pos) {
    schema.inizio = aggiungi(iso, -pos);
    return schema;
  }

  /**
   * Controlla uno schema arrivato da fuori (link, memoria del browser).
   * @returns {string|null} il primo problema trovato, o null se va bene
   */
  function problema(s) {
    if (!s || typeof s !== 'object') return 'Schema mancante';
    if (!Array.isArray(s.ciclo) || s.ciclo.length < 1 || s.ciclo.length > 62) return 'Il ciclo deve avere da 1 a 62 giorni';
    if (!Array.isArray(s.tipi) || s.tipi.length < 1 || s.tipi.length > 12) return 'Servono da 1 a 12 tipi di turno';
    if (!valida(s.inizio)) return 'Data di inizio non valida';
    var viste = {};
    for (var i = 0; i < s.tipi.length; i++) {
      var t = s.tipi[i];
      if (!t || !SIGLA.test(t.sigla)) return 'Sigla non valida: usa da 1 a 3 lettere maiuscole o cifre';
      if (ASSENZE[t.sigla]) return 'La sigla ' + t.sigla + ' è riservata a ' + ASSENZE[t.sigla].nome.toLowerCase();
      if (viste[t.sigla]) return 'Sigla ripetuta: ' + t.sigla;
      viste[t.sigla] = true;
      if (typeof t.nome !== 'string' || !t.nome.trim() || t.nome.length > 30) return 'Nome del turno ' + t.sigla + ' mancante o troppo lungo';
      if (!COLORE.test(t.colore)) return 'Colore non valido per ' + t.sigla;
      if (t.inizio || t.fine) {
        if (!ORA.test(t.inizio) || !ORA.test(t.fine)) return 'Orario non valido per ' + t.sigla;
      }
    }
    for (var j = 0; j < s.ciclo.length; j++) if (!viste[s.ciclo[j]]) return 'Il ciclo usa la sigla ' + s.ciclo[j] + ' che non ha un turno';
    var ecc = s.eccezioni || {};
    var chiavi = Object.keys(ecc);
    if (chiavi.length > 2000) return 'Troppi cambi segnati';
    for (var k = 0; k < chiavi.length; k++) {
      if (!valida(chiavi[k])) return 'Data di un cambio non valida';
      if (!viste[ecc[chiavi[k]]] && !ASSENZE[ecc[chiavi[k]]]) return 'Cambio con una sigla sconosciuta';
    }
    return null;
  }

  // Dal testo "M M P P N N R R" (o "MMPPNNRR" con sigle di una lettera) al ciclo.
  function leggiCiclo(testo) {
    var t = String(testo || '').toUpperCase().trim();
    if (!t) return [];
    return /[\s,;\-]/.test(t) ? t.split(/[\s,;\-]+/).filter(Boolean) : t.split('');
  }

  // ---------------------------------------------------------------- link

  // Base64 per URL, senza dipendere da btoa (che non c'e' ovunque) e senza
  // rompere le lettere accentate dei nomi.
  var ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function utf8(testo) {
    var s = unescape(encodeURIComponent(testo));
    var b = [];
    for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i));
    return b;
  }

  function daUtf8(byte) {
    var s = '';
    for (var i = 0; i < byte.length; i++) s += String.fromCharCode(byte[i]);
    return decodeURIComponent(escape(s));
  }

  function base64(byte) {
    var fuori = '';
    for (var i = 0; i < byte.length; i += 3) {
      var n = (byte[i] << 16) | ((byte[i + 1] || 0) << 8) | (byte[i + 2] || 0);
      fuori += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63];
      if (i + 1 < byte.length) fuori += ALFABETO[(n >> 6) & 63];
      if (i + 2 < byte.length) fuori += ALFABETO[n & 63];
    }
    return fuori;
  }

  function daBase64(testo) {
    var byte = [];
    var buffer = 0, bit = 0;
    for (var i = 0; i < testo.length; i++) {
      var v = ALFABETO.indexOf(testo[i]);
      if (v < 0) throw new Error('Carattere non valido');
      buffer = (buffer << 6) | v;
      bit += 6;
      if (bit >= 8) {
        bit -= 8;
        byte.push((buffer >> bit) & 255);
      }
    }
    return byte;
  }

  /**
   * Lo schema da mettere nel link per i colleghi: ciclo, orari, colori e data
   * di inizio. I cambi personali (ferie, malattia) restano fuori.
   */
  function codifica(schema) {
    var corto = {
      v: 1,
      c: schema.ciclo,
      i: schema.inizio,
      t: schema.tipi.map(function (t) { return t.inizio ? [t.sigla, t.nome, t.colore, t.inizio, t.fine] : [t.sigla, t.nome, t.colore]; })
    };
    if (schema.modello) corto.m = schema.modello;
    return base64(utf8(JSON.stringify(corto)));
  }

  function decodifica(testo) {
    try {
      if (!/^[A-Za-z0-9_-]{1,4000}$/.test(String(testo || ''))) return null;
      var c = JSON.parse(daUtf8(daBase64(testo)));
      if (!c || c.v !== 1 || !Array.isArray(c.t)) return null;
      var s = {
        ciclo: c.c,
        inizio: c.i,
        tipi: c.t.map(function (x) {
          var t = { sigla: x[0], nome: x[1], colore: x[2] };
          if (x[3]) { t.inizio = x[3]; t.fine = x[4]; }
          return t;
        }),
        eccezioni: {}
      };
      if (typeof c.m === 'string' && SCHEMI[c.m]) s.modello = c.m;
      return problema(s) ? null : s;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------- calendario

  /**
   * Gli eventi da mettere nel calendario del telefono (js/calendario-ics.js):
   * uno per ogni turno con orario fra "da" e "a" inclusi.
   */
  function eventi(schema, da, a, opzioni) {
    var o = opzioni || {};
    var fuori = [];
    for (var n = giorno(da); n <= giorno(a); n++) {
      var t = turnoDel(schema, data(n));
      if (!t.ore) continue;
      fuori.push({
        id: 'turno-' + t.sigla,
        data: t.data,
        inizio: t.tipo.inizio,
        fine: t.tipo.fine,
        titolo: 'Turno ' + t.tipo.nome + ' (' + t.sigla + ')',
        descrizione: t.tipo.inizio + '–' + t.tipo.fine + (t.cambio ? ' · cambio turno' : ''),
        url: o.url,
        occupato: true,
        promemoria: o.promemoria || []
      });
    }
    return fuori;
  }

  return {
    SCHEMI: SCHEMI,
    ASSENZE: ASSENZE,
    daModello: daModello,
    tipoDi: tipoDi,
    turnoDel: turnoDel,
    mese: mese,
    riepilogo: riepilogo,
    segna: segna,
    allinea: allinea,
    posizione: posizione,
    problema: problema,
    leggiCiclo: leggiCiclo,
    codifica: codifica,
    decodifica: decodifica,
    eventi: eventi,
    ore: ore,
    scavalca: scavalca,
    aggiungi: aggiungi,
    giornoSettimana: giornoSettimana,
    lunediDi: lunediDi,
    valida: valida
  };
});
