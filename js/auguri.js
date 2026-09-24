// js/auguri.js — Il biglietto di auguri da mandare su WhatsApp.
//
// Un'immagine quadrata 1080x1080 disegnata su canvas: niente foto da
// scaricare, niente font esterni, niente emoji (che ogni telefono disegna a
// modo suo). La parte che decide testi e misure e' pura e si prova in Node;
// disegna() usa solo l'API del canvas.
//
// Funziona nel browser (window.Auguri) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Auguri = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var LATO = 1080;
  var MARGINE = 110;

  var TEMI = {
    oro: { nome: 'Oro', sfondo: ['#fffbeb', '#fde68a'], testo: '#78350f', accento: '#b45309', decoro: '#f59e0b' },
    cielo: { nome: 'Cielo', sfondo: ['#eff6ff', '#bfdbfe'], testo: '#1e3a8a', accento: '#1d4ed8', decoro: '#60a5fa' },
    rosa: { nome: 'Rosa', sfondo: ['#fdf2f8', '#fbcfe8'], testo: '#831843', accento: '#be185d', decoro: '#f472b6' },
    notte: { nome: 'Notte', sfondo: ['#1e1b4b', '#312e81'], testo: '#fef3c7', accento: '#fbbf24', decoro: '#a5b4fc' }
  };

  var FONT_TITOLO = 'italic 600 {c}px Georgia, "Times New Roman", serif';
  var FONT_NOME = '700 {c}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  var FONT_SOTTO = '500 {c}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  function font(modello, corpo) { return modello.replace('{c}', String(corpo)); }

  /** I testi del biglietto. */
  function testi(o) {
    var nome = String(o.nome || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (o.tipo === 'compleanno') {
      return { titolo: 'Buon compleanno', nome: nome ? nome + '!' : '', sotto: o.messaggio || 'Tanti auguri di cuore' };
    }
    return {
      titolo: 'Buon onomastico',
      nome: nome ? nome + '!' : '',
      sotto: [o.data, o.santo].filter(Boolean).join(' · ')
    };
  }

  /** Va a capo per parole senza superare la larghezza. */
  function aCapo(testo, misura, larghezza) {
    var parole = String(testo).split(' ').filter(Boolean);
    var righe = [];
    var riga = '';
    parole.forEach(function (p) {
      var prova = riga ? riga + ' ' + p : p;
      if (!riga || misura(prova) <= larghezza) riga = prova;
      else { righe.push(riga); riga = p; }
    });
    if (riga) righe.push(riga);
    return righe;
  }

  /**
   * Il corpo piu' grande (fra max e min, a passi di 4) con cui il testo sta
   * in "righeMax" righe larghe al massimo "larghezza".
   * @param {function(string, number): number} misura larghezza del testo a un corpo
   */
  function adatta(testo, misura, larghezza, corpoMax, corpoMin, righeMax) {
    for (var corpo = corpoMax; corpo >= corpoMin; corpo -= 4) {
      var m = function (t) { return misura(t, corpo); };
      var righe = aCapo(testo, m, larghezza);
      if (righe.length <= righeMax && righe.every(function (r) { return m(r) <= larghezza; })) return { corpo: corpo, righe: righe };
    }
    // Non ci sta nemmeno al minimo: si tengono le prime righe e si taglia coi
    // puntini quello che esce (anche una parola sola troppo lunga).
    var mm = function (t) { return misura(t, corpoMin); };
    var tutte = aCapo(testo, mm, larghezza);
    var tenute = tutte.slice(0, righeMax);
    var taglia = function (r, sempre) {
      if (!sempre && mm(r) <= larghezza) return r;
      var t = r;
      while (t.length > 1 && mm(t + '…') > larghezza) t = t.slice(0, -1);
      return t.replace(/\s+$/, '') + '…';
    };
    tenute = tenute.map(function (r, i) { return taglia(r, i === tenute.length - 1 && tutte.length > righeMax); });
    return { corpo: corpoMin, righe: tenute };
  }

  /** Dove va ogni riga: blocchi centrati in verticale. */
  function impagina(o, misura) {
    var t = testi(o);
    var largo = LATO - 2 * MARGINE;
    var blocchi = [
      { testo: t.titolo, font: FONT_TITOLO, colore: 'accento', r: adatta(t.titolo, function (x, c) { return misura(x, font(FONT_TITOLO, c)); }, largo, 88, 56, 2), interlinea: 1.15 },
      { testo: t.nome, font: FONT_NOME, colore: 'testo', r: adatta(t.nome, function (x, c) { return misura(x, font(FONT_NOME, c)); }, largo, 150, 64, 2), interlinea: 1.1 },
      { testo: t.sotto, font: FONT_SOTTO, colore: 'testo', r: adatta(t.sotto, function (x, c) { return misura(x, font(FONT_SOTTO, c)); }, largo, 48, 32, 3), interlinea: 1.3 }
    ].filter(function (b) { return b.testo; });
    var spazio = 56;
    var altezza = blocchi.reduce(function (h, b) { return h + b.r.righe.length * b.r.corpo * b.interlinea; }, 0) + spazio * (blocchi.length - 1);
    var y = (LATO - altezza) / 2;
    var righe = [];
    blocchi.forEach(function (b) {
      b.r.righe.forEach(function (riga) {
        y += b.r.corpo * b.interlinea;
        righe.push({ testo: riga, font: font(b.font, b.r.corpo), colore: b.colore, y: Math.round(y - b.r.corpo * (b.interlinea - 1) / 2 - b.r.corpo * 0.12) });
      });
      y += spazio;
    });
    return righe;
  }

  // Coriandoli sempre uguali per lo stesso nome: il biglietto non cambia a ogni disegno.
  function coriandoli(seme, quanti) {
    var h = 2166136261;
    for (var i = 0; i < seme.length; i++) h = Math.imul(h ^ seme.charCodeAt(i), 16777619);
    var rnd = function () { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
    var fuori = [];
    for (var k = 0; k < quanti; k++) {
      var bordo = rnd() < 0.5;
      var x = rnd() * LATO, y = bordo ? rnd() * 150 + (rnd() < 0.5 ? 0 : LATO - 150) : rnd() * LATO;
      if (!bordo && x > 90 && x < LATO - 90) x = rnd() < 0.5 ? rnd() * 90 : LATO - rnd() * 90;
      fuori.push({ x: x, y: y, r: 6 + rnd() * 16, forma: rnd() < 0.6 ? 'cerchio' : 'stella', alfa: 0.35 + rnd() * 0.5 });
    }
    return fuori;
  }

  function stella(ctx, x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = Math.PI / 5 * i - Math.PI / 2;
      var rr = i % 2 ? r * 0.45 : r;
      ctx[i ? 'lineTo' : 'moveTo'](x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
  }

  /** Disegna il biglietto su un canvas 1080x1080. */
  function disegna(ctx, o) {
    var tema = TEMI[o.tema] || TEMI.oro;
    var g = ctx.createLinearGradient(0, 0, LATO, LATO);
    g.addColorStop(0, tema.sfondo[0]);
    g.addColorStop(1, tema.sfondo[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LATO, LATO);
    ctx.fillStyle = tema.decoro;
    coriandoli((o.nome || '') + (o.tipo || '') + (o.tema || ''), 46).forEach(function (c) {
      ctx.globalAlpha = c.alfa;
      if (c.forma === 'stella') stella(ctx, c.x, c.y, c.r);
      else { ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.6, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    // cornice
    ctx.strokeStyle = tema.accento;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(48, 48, LATO - 96, LATO - 96);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    var misura = function (t, f) { ctx.font = f; return ctx.measureText(t).width; };
    impagina(o, misura).forEach(function (r) {
      ctx.font = r.font;
      ctx.fillStyle = tema[r.colore];
      ctx.fillText(r.testo, LATO / 2, r.y);
    });
    ctx.font = font(FONT_SOTTO, 26);
    ctx.fillStyle = tema.testo;
    ctx.globalAlpha = 0.6;
    ctx.fillText('strumentiutili.it', LATO / 2, LATO - 78);
    ctx.globalAlpha = 1;
  }

  return { LATO: LATO, TEMI: TEMI, testi: testi, aCapo: aCapo, adatta: adatta, impagina: impagina, coriandoli: coriandoli, disegna: disegna };
});
