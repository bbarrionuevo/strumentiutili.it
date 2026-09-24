// js/metronomo-ui.js — Il metronomo: suono con Web Audio, luci a tempo.
//
// Il "quando" e' in js/metronomo.js. Qui un timer chiede ogni 25 ms i colpi
// dei prossimi 100 ms (1,5 s se la scheda e' in secondo piano, dove i timer
// rallentano) e li affida all'orologio audio, che li suona all'istante
// esatto. Lo schermo resta acceso mentre suona (Wake Lock). Le impostazioni
// si ricordano su questo dispositivo.
(function () {
  'use strict';

  var M = window.Metronomo;
  var el = function (id) { return document.getElementById(id); };
  var avviaBtn = el('met-avvia');
  if (!M || !avviaBtn) return;

  var CHIAVE = 'su_metronomo';
  var campo = {
    bpm: el('met-cursore'), misura: el('met-misura'), suddivisione: el('met-suddivisione'),
    suono: el('met-suono'), volume: el('met-volume')
  };
  var vista = { bpm: el('met-bpm'), tempo: el('met-tempo'), battiti: el('met-battiti'), esito: el('met-esito') };

  var ctx = null, uscita = null;
  var stato = null;        // stato di js/metronomo.js mentre suona
  var timer = null;
  var coda = [];           // colpi pianificati, per accendere le luci a tempo
  var luce = null;
  var tocchi = [];
  var blocco = null;       // Wake Lock

  // ------------------------------------------------------------ impostazioni

  (function () {
    Object.keys(M.MISURE).filter(function (m) { return m !== '1/4'; }).forEach(function (m) {
      var o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      campo.misura.appendChild(o);
    });
    var s;
    try { s = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { s = null; }
    s = s || {};
    campo.bpm.value = String(M.limita(s.bpm || 100));
    campo.misura.value = M.MISURE[s.misura] ? s.misura : '4/4';
    campo.suddivisione.value = String([1, 2, 3, 4].indexOf(Number(s.suddivisione)) >= 0 ? s.suddivisione : 1);
    campo.suono.value = s.suono === 'legno' || s.suono === 'beep' ? s.suono : 'clic';
    campo.volume.value = String(Number(s.volume) >= 0 && Number(s.volume) <= 100 ? s.volume : 80);
  })();

  function impostazioni() {
    return {
      bpm: M.limita(campo.bpm.value), misura: campo.misura.value,
      suddivisione: Number(campo.suddivisione.value), suono: campo.suono.value, volume: Number(campo.volume.value)
    };
  }

  function ricorda() {
    try { localStorage.setItem(CHIAVE, JSON.stringify(impostazioni())); } catch (e) { /* pazienza */ }
  }

  function disegnaBattiti() {
    var n = M.MISURE[campo.misura.value].length;
    if (vista.battiti.childElementCount === n) return;
    vista.battiti.textContent = '';
    for (var i = 0; i < n; i++) {
      var d = document.createElement('span');
      d.className = 'met-battito';
      if (M.MISURE[campo.misura.value][i] !== 'debole') d.setAttribute('data-accento', '');
      vista.battiti.appendChild(d);
    }
  }

  function aggiornaVista() {
    var o = impostazioni();
    vista.bpm.textContent = String(o.bpm);
    vista.tempo.textContent = M.nomeTempo(o.bpm);
    campo.bpm.setAttribute('aria-valuetext', o.bpm + ' battiti al minuto, ' + M.nomeTempo(o.bpm));
    disegnaBattiti();
  }

  // ------------------------------------------------------------ suono

  var rumore = null;
  function bufferRumore() {
    if (rumore) return rumore;
    rumore = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    var d = rumore.getChannelData(0);
    var seme = 1;
    for (var i = 0; i < d.length; i++) {
      seme = (Math.imul(seme, 1664525) + 1013904223) | 0;
      d[i] = (seme >>> 0) / 4294967296 * 2 - 1;
    }
    return rumore;
  }

  var ALTEZZE = { forte: 1.5, medio: 1.25, debole: 1, sotto: 0.8 };
  var VOLUMI = { forte: 1, medio: 0.8, debole: 0.65, sotto: 0.35 };

  function colpo(tempo, tipo, suono) {
    var g = ctx.createGain();
    g.connect(uscita);
    var picco = VOLUMI[tipo];
    if (suono === 'legno') {
      // legnetto: rumore breve filtrato attorno a una frequenza
      var sorgente = ctx.createBufferSource();
      sorgente.buffer = bufferRumore();
      var filtro = ctx.createBiquadFilter();
      filtro.type = 'bandpass';
      filtro.frequency.value = 1400 * ALTEZZE[tipo];
      filtro.Q.value = 12;
      sorgente.connect(filtro).connect(g);
      g.gain.setValueAtTime(picco * 3, tempo);
      g.gain.exponentialRampToValueAtTime(0.0001, tempo + 0.045);
      sorgente.start(tempo);
      sorgente.stop(tempo + 0.05);
      return;
    }
    var osc = ctx.createOscillator();
    osc.type = suono === 'beep' ? 'sine' : 'triangle';
    osc.frequency.value = (suono === 'beep' ? 880 : 1000) * ALTEZZE[tipo];
    osc.connect(g);
    var durata = suono === 'beep' ? 0.08 : 0.03;
    g.gain.setValueAtTime(0.0001, tempo);
    g.gain.exponentialRampToValueAtTime(picco, tempo + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, tempo + durata);
    osc.start(tempo);
    osc.stop(tempo + durata + 0.01);
  }

  function pianifica() {
    if (!stato) return;
    var anticipo = document.visibilityState === 'visible' ? 0.1 : 1.5;
    var suono = campo.suono.value;
    M.pianifica(stato, ctx.currentTime + anticipo).forEach(function (c) {
      colpo(c.tempo, c.tipo, suono);
      coda.push(c);
    });
  }

  // Le luci seguono l'orologio audio, non il timer: si accendono quando il
  // colpo suona davvero.
  function anima() {
    if (!stato) return;
    var adesso = ctx.currentTime;
    while (coda.length && coda[0].tempo <= adesso) {
      var c = coda.shift();
      if (c.tipo !== 'sotto') {
        Array.prototype.forEach.call(vista.battiti.children, function (d, i) {
          if (i === c.battito) d.setAttribute('data-acceso', ''); else d.removeAttribute('data-acceso');
        });
      }
    }
    luce = requestAnimationFrame(anima);
  }

  function volume() {
    if (uscita) uscita.gain.setTargetAtTime(Math.pow(Number(campo.volume.value) / 100, 2), ctx.currentTime, 0.02);
  }

  // ------------------------------------------------------------ avvio e arresto

  function tieniAcceso() {
    if (!('wakeLock' in navigator) || blocco) return;
    navigator.wakeLock.request('screen').then(function (b) {
      blocco = b;
      b.addEventListener('release', function () { blocco = null; });
    }).catch(function () { /* batteria scarica o permesso negato: pazienza */ });
  }

  function avvia() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      vista.esito.textContent = 'Questo browser non supporta l’audio web: prova con un browser aggiornato.';
      return;
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (!uscita) { uscita = ctx.createGain(); uscita.connect(ctx.destination); }
    volume();
    stato = M.avvia(impostazioni(), ctx.currentTime + 0.06);
    coda = [];
    pianifica();
    timer = setInterval(pianifica, 25);
    luce = requestAnimationFrame(anima);
    avviaBtn.setAttribute('aria-pressed', 'true');
    avviaBtn.textContent = 'Ferma';
    tieniAcceso();
  }

  function ferma() {
    stato = null;
    clearInterval(timer);
    cancelAnimationFrame(luce);
    coda = [];
    Array.prototype.forEach.call(vista.battiti.children, function (d) { d.removeAttribute('data-acceso'); });
    avviaBtn.setAttribute('aria-pressed', 'false');
    avviaBtn.textContent = 'Avvia';
    if (blocco) blocco.release().catch(function () {});
    // I colpi gia' affidati all'audio si spengono subito.
    if (uscita) { uscita.disconnect(); uscita = null; }
  }

  // Un cambio mentre suona entra dal prossimo colpo, senza fermarsi.
  function cambia() {
    var o = impostazioni();
    aggiornaVista();
    ricorda();
    if (!stato) return;
    // I colpi gia' affidati all'audio restano: il nuovo tempo parte dal primo
    // colpo non ancora pianificato.
    stato = M.cambia(stato, { bpm: o.bpm, misura: o.misura, suddivisione: o.suddivisione });
  }

  function imposta(bpm) {
    campo.bpm.value = String(M.limita(bpm));
    cambia();
  }

  avviaBtn.addEventListener('click', function () { if (stato) ferma(); else avvia(); });
  el('met-meno').addEventListener('click', function () { imposta(Number(campo.bpm.value) - 1); });
  el('met-piu').addEventListener('click', function () { imposta(Number(campo.bpm.value) + 1); });
  el('met-tap').addEventListener('click', function () {
    tocchi.push(performance.now());
    if (tocchi.length > 12) tocchi.shift();
    var bpm = M.bpmDaTocchi(tocchi);
    vista.esito.textContent = bpm ? 'Tap: ' + bpm + ' BPM' : 'Continua a toccare a tempo…';
    if (bpm) imposta(bpm);
  });
  campo.bpm.addEventListener('input', cambia);
  [campo.misura, campo.suddivisione].forEach(function (c) {
    c.addEventListener('change', function () { vista.battiti.textContent = ''; cambia(); });
  });
  campo.suono.addEventListener('change', ricorda);
  campo.volume.addEventListener('input', function () { volume(); ricorda(); });

  // Spazio avvia e ferma, frecce su e giu' cambiano il tempo, T fa il tap:
  // ma non mentre si scrive in un campo o si usa un menu.
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && t.tagName !== 'BUTTON') { e.preventDefault(); avviaBtn.click(); }
    else if (e.key === 'ArrowUp' || e.key === '+') { e.preventDefault(); imposta(Number(campo.bpm.value) + (e.shiftKey ? 5 : 1)); }
    else if (e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); imposta(Number(campo.bpm.value) - (e.shiftKey ? 5 : 1)); }
    else if (e.key === 't' || e.key === 'T') { el('met-tap').click(); }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && stato) tieniAcceso();
  });

  aggiornaVista();
})();
