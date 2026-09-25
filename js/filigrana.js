// js/filigrana.js — Proteggere la copia di un documento prima di inviarla.
//
// Chi manda la foto della carta d'identita' al padrone di casa o a
// un'agenzia non sa dove finira'. Una scritta ripetuta di traverso su tutto
// il documento ("Copia per contratto di affitto – 25/09/2026 – non valida
// per altri usi") la rende inutile per altri scopi: per rubare l'identita'
// serve una copia pulita. In piu' si possono coprire del tutto le parti che
// il destinatario non deve vedere.
//
// Qui c'e' la parte pura (testo, posizioni delle scritte, misure,
// impaginazione in A4), provata in Node; il disegno usa il canvas del
// browser. Funziona nel browser (window.Filigrana) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Filigrana = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var FINALITA = [
    { id: 'affitto', testo: 'contratto di affitto' },
    { id: 'banca', testo: 'apertura conto' },
    { id: 'lavoro', testo: 'assunzione' },
    { id: 'utenze', testo: 'attivazione utenze' },
    { id: 'scuola', testo: 'iscrizione' },
    { id: 'noleggio', testo: 'noleggio' },
    { id: 'viaggio', testo: 'prenotazione viaggio' }
  ];

  var COLORI = {
    grigio: '#374151',
    rosso: '#b91c1c',
    blu: '#1d4ed8'
  };

  function pulisci(t, max) {
    return String(t == null ? '' : t).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function dataItaliana(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  /**
   * Il testo della filigrana.
   * @param {object} o { finalita: id o testo libero, destinatario, data: 'AAAA-MM-GG', avviso: true }
   */
  function testo(o) {
    var opz = o || {};
    var preset = FINALITA.filter(function (f) { return f.id === opz.finalita; })[0];
    var scopo = preset ? preset.testo : pulisci(opz.finalita, 60);
    var parti = [scopo ? 'Copia per ' + scopo : 'Copia'];
    var chi = pulisci(opz.destinatario, 50);
    if (chi) parti.push(chi);
    var d = dataItaliana(opz.data);
    if (d) parti.push(d);
    if (opz.avviso !== false) parti.push('non valida per altri usi');
    return parti.join(' – ');
  }

  /** Il corpo del testo: proporzionato al lato corto, mai illeggibile. */
  function corpo(w, h, dimensione) {
    var fattore = { piccola: 0.032, media: 0.045, grande: 0.062 }[dimensione] || 0.045;
    return Math.max(14, Math.round(Math.min(w, h) * fattore));
  }

  /**
   * Dove scrivere le copie del testo per coprire tutta l'immagine.
   * Le coordinate sono nel riferimento ruotato con origine al centro
   * dell'immagine: chi disegna fa translate(w/2, h/2), rotate(angolo) e
   * scrive ogni copia in (x, y) con allineamento a sinistra.
   * @param {number} w,h           misure dell'immagine
   * @param {number} larghezza     larghezza del testo al corpo scelto
   * @param {number} c             corpo del testo
   * @param {number} angoloGradi   inclinazione (negativo: sale verso destra)
   * @returns {{ x: number, y: number }[]}
   */
  function tassellatura(w, h, larghezza, c, angoloGradi) {
    var a = (angoloGradi === undefined ? -30 : angoloGradi) * Math.PI / 180;
    // Il rettangolo dell'immagine visto nel riferimento ruotato di -a.
    var cos = Math.cos(-a), sin = Math.sin(-a);
    var angoli = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(function (p) {
      return [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
    });
    var minX = Math.min.apply(null, angoli.map(function (p) { return p[0]; }));
    var maxX = Math.max.apply(null, angoli.map(function (p) { return p[0]; }));
    var minY = Math.min.apply(null, angoli.map(function (p) { return p[1]; }));
    var maxY = Math.max.apply(null, angoli.map(function (p) { return p[1]; }));
    var passoY = c * 3.2;
    var spazio = c * 2;
    var passoX = larghezza + spazio;
    var fuori = [];
    var riga = 0;
    for (var y = minY + passoY / 2; y < maxY + passoY; y += passoY, riga++) {
      // righe sfalsate di mezzo passo, come i mattoni: nessuna colonna vuota
      var inizio = minX - passoX + (riga % 2 ? passoX / 2 : 0);
      for (var x = inizio; x < maxX; x += passoX) fuori.push({ x: x, y: y });
    }
    return fuori;
  }

  /** Le misure d'uscita: il lato lungo al massimo "max", mai ingrandire. */
  function scala(w, h, max) {
    var m = max || 2000;
    var f = Math.min(1, m / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)), fattore: f };
  }

  /** Un riquadro disegnato con il dito o il mouse, da due punti qualsiasi, dentro l'immagine. */
  function riquadro(x1, y1, x2, y2, w, h) {
    var x = Math.max(0, Math.min(x1, x2)), y = Math.max(0, Math.min(y1, y2));
    var X = Math.min(w, Math.max(x1, x2)), Y = Math.min(h, Math.max(y1, y2));
    if (X - x < 2 || Y - y < 2) return null;
    return { x: x, y: y, w: X - x, h: Y - y };
  }

  var A4 = [595.28, 841.89];

  /**
   * Le immagini sui fogli A4 del PDF: una per foglio, oppure fronte e retro
   * sullo stesso foglio, una sopra l'altra (come si fotocopia la carta
   * d'identita'). Misure in punti PDF, origine in basso a sinistra.
   * @param {{w:number,h:number}[]} immagini
   * @param {boolean} insieme  due per foglio
   */
  function impagina(immagini, insieme) {
    var margine = 40, gap = 24;
    var W = A4[0], H = A4[1];
    var fogli = [];
    var perFoglio = insieme ? 2 : 1;
    for (var i = 0; i < immagini.length; i += perFoglio) {
      var gruppo = immagini.slice(i, i + perFoglio);
      var altezzaCella = (H - 2 * margine - gap * (gruppo.length - 1)) / gruppo.length;
      var foglio = [];
      gruppo.forEach(function (im, k) {
        var f = Math.min((W - 2 * margine) / im.w, altezzaCella / im.h);
        var lw = im.w * f, lh = im.h * f;
        var cimaCella = H - margine - k * (altezzaCella + gap);
        foglio.push({ indice: i + k, x: (W - lw) / 2, y: cimaCella - (altezzaCella + lh) / 2, w: lw, h: lh });
      });
      fogli.push(foglio);
    }
    return fogli;
  }

  /**
   * Disegna l'immagine protetta su un canvas gia' dimensionato w x h.
   * @param {CanvasRenderingContext2D} ctx
   * @param {CanvasImageSource} sorgente
   * @param {object} o { testo, colore, opacita (0-1), dimensione, angolo, riquadri: [{x,y,w,h}] in pixel dell'uscita }
   */
  function disegna(ctx, sorgente, w, h, o) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(sorgente, 0, 0, w, h);
    ctx.fillStyle = '#000000';
    (o.riquadri || []).forEach(function (r) { ctx.fillRect(r.x, r.y, r.w, r.h); });
    var c = corpo(w, h, o.dimensione);
    ctx.font = '700 ' + c + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    var t = o.testo || testo({});
    var larghezza = ctx.measureText(t).width;
    var angolo = o.angolo === undefined ? -30 : o.angolo;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angolo * Math.PI / 180);
    var posizioni = tassellatura(w, h, larghezza, c, angolo);
    // Un filo chiaro attorno alle lettere: la scritta si legge anche sulle
    // parti scure della foto.
    ctx.globalAlpha = Math.min(1, (o.opacita === undefined ? 0.35 : o.opacita) * 0.9);
    ctx.lineWidth = Math.max(1, c / 12);
    ctx.strokeStyle = '#ffffff';
    ctx.lineJoin = 'round';
    posizioni.forEach(function (p) { ctx.strokeText(t, p.x, p.y); });
    ctx.globalAlpha = o.opacita === undefined ? 0.35 : o.opacita;
    ctx.fillStyle = COLORI[o.colore] || o.colore || COLORI.grigio;
    posizioni.forEach(function (p) { ctx.fillText(t, p.x, p.y); });
    ctx.restore();
  }

  return {
    FINALITA: FINALITA, COLORI: COLORI, A4: A4,
    testo: testo, corpo: corpo, tassellatura: tassellatura, scala: scala,
    riquadro: riquadro, impagina: impagina, disegna: disegna, dataItaliana: dataItaliana
  };
});
