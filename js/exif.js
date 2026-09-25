// js/exif.js — Leggere e togliere i dati nascosti delle foto, senza
// ricomprimerle.
//
// Una foto del telefono porta con se' dove e quando e' stata scattata, con
// che telefono, a volte il nome del proprietario e una miniatura
// dell'originale non ritagliato. Qui si leggono quei dati per mostrarli e
// si tolgono tagliando dal file i blocchi che li contengono: i pixel non si
// toccano, quindi la qualita' resta identica al byte. Si conservano il
// profilo colore (senza, i colori cambiano) e, se serve, il solo
// orientamento, perche' la foto non si giri.
//
// JPEG: segmenti APP1 (EXIF, XMP), APP13 (IPTC), commenti e i segmenti dei
// produttori. PNG: blocchi eXIf, tEXt, zTXt, iTXt, tIME.
// Funziona nel browser (window.Exif) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Exif = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function ascii(b, da, a) {
    var s = '';
    for (var i = da; i < a && i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  function tipo(b) {
    if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (b.length > 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'png';
    return null;
  }

  // ------------------------------------------------------------ TIFF / EXIF

  var TIPI = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  /**
   * Legge un blocco TIFF (il cuore dell'EXIF). Restituisce le voci di IFD0,
   * dell'IFD Exif e dell'IFD GPS, piu' la presenza della miniatura (IFD1).
   */
  function leggiTiff(b, inizio, fine) {
    var le = ascii(b, inizio, inizio + 2) === 'II';
    if (!le && ascii(b, inizio, inizio + 2) !== 'MM') return null;
    var u16 = function (o) { return le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]; };
    var u32 = function (o) { return le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; };
    if (u16(inizio + 2) !== 42) return null;
    var dentro = function (o, n) { return o >= inizio && o + n <= fine; };

    function valore(voce) {
      var dim = TIPI[voce.tipo];
      if (!dim) return null;
      var totale = dim * voce.conta;
      var o = totale <= 4 ? voce.pos + 8 : inizio + u32(voce.pos + 8);
      if (!dentro(o, totale)) return null;
      if (voce.tipo === 2) return ascii(b, o, o + voce.conta).replace(/\0[\s\S]*$/, '').trim();
      var fuori = [];
      for (var i = 0; i < Math.min(voce.conta, 64); i++) {
        if (voce.tipo === 3) fuori.push(u16(o + 2 * i));
        else if (voce.tipo === 4) fuori.push(u32(o + 4 * i));
        else if (voce.tipo === 5) { var d = u32(o + 8 * i + 4); fuori.push(d ? u32(o + 8 * i) / d : 0); }
        else if (voce.tipo === 10) { var dd = u32(o + 8 * i + 4) | 0; fuori.push(dd ? (u32(o + 8 * i) | 0) / dd : 0); }
        else fuori.push(b[o + i]);
      }
      return voce.conta === 1 ? fuori[0] : fuori;
    }

    function ifd(offset, visti) {
      var o = inizio + offset;
      if (!offset || visti[o] || !dentro(o, 2)) return { voci: {}, prossimo: 0 };
      visti[o] = true;
      var n = u16(o);
      if (!dentro(o + 2, n * 12 + 4)) return { voci: {}, prossimo: 0 };
      var voci = {};
      for (var i = 0; i < n; i++) {
        var p = o + 2 + i * 12;
        var v = { tag: u16(p), tipo: u16(p + 2), conta: u32(p + 4), pos: p };
        voci[v.tag] = valore(v);
      }
      return { voci: voci, prossimo: u32(o + 2 + n * 12) };
    }

    var visti = {};
    var zero = ifd(u32(inizio + 4), visti);
    var exif = zero.voci[0x8769] ? ifd(zero.voci[0x8769], visti).voci : {};
    var gps = zero.voci[0x8825] ? ifd(zero.voci[0x8825], visti).voci : {};
    var uno = zero.prossimo ? ifd(zero.prossimo, visti).voci : {};
    // IFD1 descrive la miniatura: basta che ci sia l'etichetta.
    return { ifd0: zero.voci, exif: exif, gps: gps, miniatura: 0x0201 in uno || 0x0111 in uno };
  }

  function gradi(v, rif) {
    if (!Array.isArray(v) || v.length < 3) return null;
    var g = v[0] + v[1] / 60 + v[2] / 3600;
    if (!isFinite(g)) return null;
    return rif === 'S' || rif === 'W' ? -g : g;
  }

  // Le voci che contano, in chiaro.
  function riassumi(t) {
    var r = {};
    if (!t) return r;
    var a = t.ifd0, e = t.exif, g = t.gps;
    var lat = gradi(g[2], g[1]), lon = gradi(g[4], g[3]);
    if (lat !== null && lon !== null && (lat !== 0 || lon !== 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      r.posizione = { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
      if (typeof g[6] === 'number') r.posizione.altitudine = Math.round((g[5] === 1 ? -1 : 1) * g[6]);
    }
    var dispositivo = [a[0x010f], a[0x0110]].filter(function (x) { return typeof x === 'string' && x; });
    if (dispositivo.length) {
      // "Apple iPhone 15" e non "Apple Apple iPhone 15"
      r.dispositivo = dispositivo.length === 2 && dispositivo[1].indexOf(dispositivo[0]) === 0 ? dispositivo[1] : dispositivo.join(' ');
    }
    var quando = e[0x9003] || a[0x0132];
    if (typeof quando === 'string' && /^\d{4}:\d{2}:\d{2}/.test(quando)) r.data = quando.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    if (typeof a[0x0131] === 'string' && a[0x0131]) r.software = a[0x0131];
    var autore = [a[0x013b], a[0x8298]].filter(function (x) { return typeof x === 'string' && x; });
    if (autore.length) r.autore = autore.join(' · ');
    if (typeof e[0xa431] === 'string' && e[0xa431]) r.seriale = e[0xa431];
    if (typeof e[0xa434] === 'string' && e[0xa434]) r.obiettivo = e[0xa434];
    if (typeof a[0x0112] === 'number' && a[0x0112] >= 1 && a[0x0112] <= 8) r.orientamento = a[0x0112];
    if (t.miniatura) r.miniatura = true;
    return r;
  }

  // ------------------------------------------------------------ JPEG

  function segmentiJpeg(b) {
    var fuori = [];
    var o = 2;
    while (o + 4 <= b.length) {
      if (b[o] !== 0xff) return null;                   // file rovinato
      var m = b[o + 1];
      if (m === 0xff) { o++; continue; }                // riempimento
      if (m === 0xd9) { fuori.push({ marcatore: m, da: o, a: o + 2 }); break; }
      if (m >= 0xd0 && m <= 0xd7) { o += 2; continue; }
      var lung = (b[o + 2] << 8) | b[o + 3];
      if (lung < 2 || o + 2 + lung > b.length) return null;
      if (m === 0xda) {                                 // inizio dei dati: fino alla fine
        fuori.push({ marcatore: m, da: o, a: b.length, dati: true });
        break;
      }
      fuori.push({ marcatore: m, da: o, a: o + 2 + lung, corpo: o + 4 });
      o += 2 + lung;
    }
    return fuori;
  }

  function naturaJpeg(b, s) {
    var m = s.marcatore;
    if (m === 0xe1) {
      if (ascii(b, s.corpo, s.corpo + 6) === 'Exif\0\0') return 'exif';
      if (ascii(b, s.corpo, s.corpo + 28) === 'http://ns.adobe.com/xap/1.0/') return 'xmp';
      return 'app1';
    }
    if (m === 0xe0) return ascii(b, s.corpo, s.corpo + 5) === 'JFIF\0' ? 'jfif' : 'app0';
    if (m === 0xe2) return ascii(b, s.corpo, s.corpo + 12) === 'ICC_PROFILE\0' ? 'icc' : 'app2';
    if (m === 0xed) return 'iptc';
    if (m === 0xee) return 'adobe';                     // serve a decodificare i colori CMYK
    if (m === 0xfe) return 'commento';
    if (m >= 0xe0 && m <= 0xef) return 'produttore';
    return 'immagine';
  }

  // Quello che si tiene: struttura dell'immagine, JFIF, profilo colore, Adobe.
  var DA_TENERE = { immagine: true, jfif: true, icc: true, adobe: true };

  function analizzaJpeg(b) {
    var seg = segmentiJpeg(b);
    if (!seg) return null;
    var dati = { formato: 'jpeg', blocchi: [], tiff: null };
    seg.forEach(function (s) {
      var n = naturaJpeg(b, s);
      if (!DA_TENERE[n]) dati.blocchi.push({ tipo: n, byte: s.a - s.da });
      if (n === 'exif' && !dati.tiff) dati.tiff = leggiTiff(b, s.corpo + 6, s.a);
    });
    return dati;
  }

  // Un EXIF minimo con il solo orientamento (TIFF big-endian, una voce).
  function exifSoloOrientamento(n) {
    var corpo = [0x45, 0x78, 0x69, 0x66, 0, 0,          // "Exif\0\0"
      0x4d, 0x4d, 0, 42, 0, 0, 0, 8,                    // "MM", 42, IFD0 a 8
      0, 1,                                             // una voce
      0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, n, 0, 0,         // Orientation, SHORT, 1, valore
      0, 0, 0, 0];                                      // nessun IFD successivo
    var lung = corpo.length + 2;
    return [0xff, 0xe1, lung >> 8, lung & 0xff].concat(corpo);
  }

  function pulisciJpeg(b, o) {
    var seg = segmentiJpeg(b);
    if (!seg) throw new Error('JPEG non valido');
    var orient = 1;
    seg.forEach(function (s) {
      if (naturaJpeg(b, s) === 'exif') {
        var t = leggiTiff(b, s.corpo + 6, s.a);
        if (t && t.ifd0[0x0112] >= 2 && t.ifd0[0x0112] <= 8) orient = t.ifd0[0x0112];
      }
    });
    var parti = [b.subarray(0, 2)];
    var messo = false;
    seg.forEach(function (s) {
      var n = naturaJpeg(b, s);
      // L'orientamento va subito dopo JFIF, prima di tutto il resto.
      if (!messo && n !== 'jfif' && orient !== 1 && (!o || o.orientamento !== false)) {
        parti.push(new Uint8Array(exifSoloOrientamento(orient)));
        messo = true;
      }
      if (DA_TENERE[n]) parti.push(b.subarray(s.da, s.a));
    });
    var totale = parti.reduce(function (t, p) { return t + p.length; }, 0);
    var fuori = new Uint8Array(totale);
    var k = 0;
    parti.forEach(function (p) { fuori.set(p, k); k += p.length; });
    return fuori;
  }

  // ------------------------------------------------------------ PNG

  var PNG_VIA = { eXIf: 'exif', tEXt: 'testo', zTXt: 'testo', iTXt: 'testo', tIME: 'data' };

  function blocchiPng(b) {
    var fuori = [];
    var o = 8;
    while (o + 12 <= b.length) {
      var lung = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
      var nome = ascii(b, o + 4, o + 8);
      if (o + 12 + lung > b.length) return null;
      fuori.push({ nome: nome, da: o, a: o + 12 + lung, corpo: o + 8, lung: lung });
      o += 12 + lung;
      if (nome === 'IEND') break;
    }
    return fuori;
  }

  function analizzaPng(b) {
    var bl = blocchiPng(b);
    if (!bl) return null;
    var dati = { formato: 'png', blocchi: [], tiff: null, testi: {} };
    bl.forEach(function (c) {
      var n = PNG_VIA[c.nome];
      if (!n) return;
      dati.blocchi.push({ tipo: c.nome === 'iTXt' && ascii(b, c.corpo, c.corpo + 17) === 'XML:com.adobe.xmp' ? 'xmp' : n, byte: c.a - c.da });
      if (c.nome === 'eXIf') dati.tiff = leggiTiff(b, c.corpo, c.corpo + c.lung);
      if (c.nome === 'tEXt') {
        var z = c.corpo;
        while (z < c.corpo + c.lung && b[z] !== 0) z++;
        dati.testi[ascii(b, c.corpo, z)] = ascii(b, z + 1, c.corpo + c.lung).slice(0, 200);
      }
    });
    return dati;
  }

  function pulisciPng(b) {
    var bl = blocchiPng(b);
    if (!bl) throw new Error('PNG non valido');
    var parti = [b.subarray(0, 8)].concat(bl.filter(function (c) { return !PNG_VIA[c.nome]; }).map(function (c) { return b.subarray(c.da, c.a); }));
    var totale = parti.reduce(function (t, p) { return t + p.length; }, 0);
    var fuori = new Uint8Array(totale);
    var k = 0;
    parti.forEach(function (p) { fuori.set(p, k); k += p.length; });
    return fuori;
  }

  // ------------------------------------------------------------ interfaccia

  /**
   * Cosa rivela un file: formato, blocchi da togliere, dati in chiaro.
   * @returns {{ formato, blocchi: {tipo,byte}[], riassunto, testi? } | null}  null se non e' JPEG ne' PNG
   */
  function analizza(byte) {
    var b = byte instanceof Uint8Array ? byte : new Uint8Array(byte);
    var t = tipo(b);
    var a = t === 'jpeg' ? analizzaJpeg(b) : t === 'png' ? analizzaPng(b) : null;
    if (!a) return null;
    a.riassunto = riassumi(a.tiff);
    if (a.testi && a.testi.Software && !a.riassunto.software) a.riassunto.software = a.testi.Software;
    if (a.testi && (a.testi.Author || a.testi.Copyright) && !a.riassunto.autore) a.riassunto.autore = [a.testi.Author, a.testi.Copyright].filter(Boolean).join(' · ');
    return a;
  }

  /** Il file senza dati nascosti. Opzioni: { orientamento: false } per togliere anche quello. */
  function pulisci(byte, o) {
    var b = byte instanceof Uint8Array ? byte : new Uint8Array(byte);
    var t = tipo(b);
    if (t === 'jpeg') return pulisciJpeg(b, o);
    if (t === 'png') return pulisciPng(b);
    throw new Error('Formato non supportato');
  }

  return { analizza: analizza, pulisci: pulisci, tipo: tipo, leggiTiff: leggiTiff, riassumi: riassumi, segmentiJpeg: segmentiJpeg };
});
