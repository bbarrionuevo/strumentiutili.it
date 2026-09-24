// js/accordatore-ui.js — L'accordatore con il microfono.
//
// Il riconoscimento della nota e' in js/intonazione.js. Qui: il permesso del
// microfono (chiesto solo al clic), la lettura dei campioni, le note di
// riferimento da ascoltare e il quadrante. L'audio non esce dal browser e non
// viene registrato: si analizzano 170 ms alla volta e si buttano.
(function () {
  'use strict';

  var I = window.Intonazione;
  var el = function (id) { return document.getElementById(id); };
  var bottone = el('acc-avvia');
  if (!I || !bottone) return;

  var CHIAVE = 'su_accordatore';
  var campo = { strumento: el('acc-strumento'), la: el('acc-la') };
  var vista = {
    nota: el('acc-nota'), inglese: el('acc-inglese'), frequenza: el('acc-frequenza'),
    cent: el('acc-cent'), ago: el('acc-ago'), consiglio: el('acc-consiglio'),
    corde: el('acc-corde'), esito: el('acc-esito'), quadrante: el('acc-quadrante')
  };

  var audio = null;        // { ctx, stream, analizzatore, buffer, timer }
  var letture = [];
  var ultimaLettura = 0;
  var eraIntonata = false;
  var ctxToni = null;

  // ------------------------------------------------------------ scelte

  (function () {
    var o = document.createElement('option');
    o.value = 'cromatico';
    o.textContent = 'Cromatico (tutte le note)';
    campo.strumento.appendChild(o);
    Object.keys(I.ACCORDATURE).forEach(function (k) {
      var x = document.createElement('option');
      x.value = k;
      x.textContent = I.ACCORDATURE[k].nome;
      campo.strumento.appendChild(x);
    });
    var s;
    try { s = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { s = null; }
    campo.strumento.value = s && (s.strumento === 'cromatico' || I.ACCORDATURE[s.strumento]) ? s.strumento : 'chitarra';
    campo.la.value = s && Number(s.la) >= 415 && Number(s.la) <= 466 ? String(s.la) : '440';
  })();

  function la() {
    var v = Number(campo.la.value);
    return v >= 415 && v <= 466 ? v : 440;
  }

  function ricorda() {
    try { localStorage.setItem(CHIAVE, JSON.stringify({ strumento: campo.strumento.value, la: la() })); } catch (e) { /* pazienza */ }
  }

  function strumento() { return I.ACCORDATURE[campo.strumento.value] ? campo.strumento.value : null; }

  // Le frequenze da cercare: attorno alle corde dello strumento, oppure
  // tutto il campo utile in modalita' cromatica.
  function intervallo() {
    var s = strumento();
    if (!s) return { fMin: 30, fMax: 1400 };
    var f = I.ACCORDATURE[s].corde.map(function (m) { return I.frequenzaMidi(m, la()); });
    return { fMin: Math.max(25, Math.min.apply(null, f) / 1.6), fMax: Math.min(1600, Math.max.apply(null, f) * 1.6) };
  }

  function disegnaCorde(evidenzia) {
    var s = strumento();
    vista.corde.hidden = !s;
    if (!s) return;
    var corde = I.ACCORDATURE[s].corde;
    if (vista.corde.childElementCount !== corde.length || vista.corde.getAttribute('data-per') !== s) {
      vista.corde.textContent = '';
      vista.corde.setAttribute('data-per', s);
      corde.forEach(function (m, i) {
        var n = I.nota(I.frequenzaMidi(m));
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-corda', String(i));
        b.className = 'rounded-lg border border-gray-200 bg-white px-2 py-2 text-center hover:border-indigo-300 transition';
        b.innerHTML = '<span class="block text-lg font-bold text-gray-900">' + n.nome + '</span><span class="block text-xs text-gray-500">' + n.inglese + n.ottava + '</span>';
        b.setAttribute('aria-label', 'Ascolta il ' + n.nome + ' (' + n.inglese + n.ottava + '), corda ' + (corde.length - i));
        b.addEventListener('click', function () { suona(I.frequenzaMidi(m, la())); });
        vista.corde.appendChild(b);
      });
    }
    Array.prototype.forEach.call(vista.corde.children, function (b, i) {
      var attiva = i === evidenzia;
      b.classList.toggle('ring-2', attiva);
      b.classList.toggle('ring-indigo-500', attiva);
      b.classList.toggle('bg-indigo-50', attiva);
    });
  }

  // ------------------------------------------------------------ nota di riferimento

  // Un suono pizzicato: armoniche che si spengono in due secondi e mezzo.
  function suona(frequenza) {
    try {
      ctxToni = ctxToni || new (window.AudioContext || window.webkitAudioContext)();
      if (ctxToni.state === 'suspended') ctxToni.resume();
      var t = ctxToni.currentTime;
      var onda = ctxToni.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.55, 0.3, 0.18, 0.1]));
      var osc = ctxToni.createOscillator();
      var gain = ctxToni.createGain();
      osc.setPeriodicWave(onda);
      osc.frequency.value = frequenza;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      osc.connect(gain).connect(ctxToni.destination);
      osc.start(t);
      osc.stop(t + 2.6);
    } catch (e) { /* senza Web Audio non si suona */ }
  }

  // ------------------------------------------------------------ quadrante

  function mostra(frequenza) {
    var n = I.nota(frequenza, la());
    var s = strumento();
    var corda = s ? I.cordaPiuVicina(frequenza, s, la()) : null;
    var cent = corda && Math.abs(corda.cent) < 600 ? corda.cent : n.cent;
    var bersaglio = corda && Math.abs(corda.cent) < 600 ? corda.nota : n;
    vista.nota.textContent = bersaglio.nome;
    vista.inglese.textContent = bersaglio.inglese + bersaglio.ottava;
    vista.frequenza.textContent = frequenza.toFixed(1).replace('.', ',') + ' Hz';
    var c = Math.max(-50, Math.min(50, cent));
    vista.ago.style.left = (50 + c) + '%';
    var arrotondato = Math.round(cent);
    vista.cent.textContent = (arrotondato > 0 ? '+' : arrotondato < 0 ? '−' : '') + Math.abs(arrotondato) + ' cent';
    var intonata = Math.abs(cent) < 4;
    var colore = intonata ? 'bg-emerald-500' : Math.abs(cent) < 15 ? 'bg-amber-500' : 'bg-red-500';
    vista.ago.className = 'absolute top-0 bottom-0 w-1.5 -ml-[3px] rounded-full transition-all duration-150 ' + colore;
    vista.quadrante.setAttribute('data-intonata', intonata ? 'si' : 'no');
    var testo = intonata ? '✓ Intonata'
      : cent < 0 ? (s ? 'Calante: tendi un po’ la corda' : 'Calante: la nota è bassa')
        : (s ? 'Crescente: allenta un po’ la corda' : 'Crescente: la nota è alta');
    vista.consiglio.textContent = testo;
    // All'utente del lettore di schermo si annuncia solo quando la corda
    // arriva in tono, non ogni decimo di secondo.
    if (intonata && !eraIntonata) vista.esito.textContent = bersaglio.nome + ' intonata';
    eraIntonata = intonata;
    disegnaCorde(corda && Math.abs(corda.cent) < 600 ? corda.indice : -1);
  }

  function attesa() {
    vista.nota.textContent = '—';
    vista.inglese.textContent = '';
    vista.frequenza.textContent = '';
    vista.cent.textContent = '';
    vista.consiglio.textContent = audio ? 'Suona una corda, vicino al microfono' : 'Premi «Avvia» e consenti il microfono';
    vista.ago.style.left = '50%';
    vista.ago.className = 'absolute top-0 bottom-0 w-1.5 -ml-[3px] rounded-full bg-gray-300';
    vista.quadrante.setAttribute('data-intonata', 'no');
    eraIntonata = false;
    disegnaCorde(-1);
  }

  // ------------------------------------------------------------ microfono

  function analizza() {
    if (!audio) return;
    audio.analizzatore.getFloatTimeDomainData(audio.buffer);
    var x = audio.buffer, sr = audio.ctx.sampleRate;
    // A 44,1 o 48 kHz si dimezza: quattro volte meno calcoli, stessa nota.
    if (sr > 32000) { x = I.dimezza(x); sr /= 2; }
    var opz = intervallo();
    var r = I.yin(x, sr, { fMin: opz.fMin, fMax: opz.fMax, rmsMinimo: 0.006 });
    var adesso = Date.now();
    if (r && r.chiarezza > 0.7) {
      // Letture di un'altra nota azzerano la media: si segue la corda nuova.
      if (letture.length && Math.abs(I.cent(r.frequenza, I.mediana(letture))) > 60) letture = [];
      letture.push(r.frequenza);
      if (letture.length > 5) letture.shift();
      ultimaLettura = adesso;
      mostra(I.mediana(letture));
    } else if (adesso - ultimaLettura > 1500) {
      letture = [];
      attesa();
    }
  }

  function avvia() {
    vista.esito.textContent = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      vista.esito.textContent = 'Questo browser non dà accesso al microfono. Prova con Chrome, Firefox, Edge o Safari aggiornati. Le note di riferimento qui sotto funzionano lo stesso.';
      return;
    }
    bottone.disabled = true;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (stream) {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var sorgente = ctx.createMediaStreamSource(stream);
        var analizzatore = ctx.createAnalyser();
        analizzatore.fftSize = 8192;
        sorgente.connect(analizzatore);
        audio = { ctx: ctx, stream: stream, analizzatore: analizzatore, buffer: new Float32Array(analizzatore.fftSize) };
        audio.timer = setInterval(analizza, 90);
        bottone.textContent = 'Ferma';
        bottone.setAttribute('aria-pressed', 'true');
        attesa();
      })
      .catch(function (e) {
        vista.esito.textContent = e && e.name === 'NotAllowedError'
          ? 'Il microfono è bloccato. Consentilo dall’icona accanto all’indirizzo e riprova: l’audio resta sul dispositivo.'
          : 'Non trovo un microfono. Collegane uno o usa le note di riferimento qui sotto.';
      })
      .then(function () { bottone.disabled = false; });
  }

  function ferma() {
    if (!audio) return;
    clearInterval(audio.timer);
    audio.stream.getTracks().forEach(function (t) { t.stop(); });
    audio.ctx.close();
    audio = null;
    letture = [];
    bottone.textContent = 'Avvia l’accordatore';
    bottone.setAttribute('aria-pressed', 'false');
    attesa();
  }

  bottone.addEventListener('click', function () { if (audio) ferma(); else avvia(); });
  campo.strumento.addEventListener('change', function () { letture = []; ricorda(); disegnaCorde(-1); });
  campo.la.addEventListener('change', function () { campo.la.value = String(la()); ricorda(); });

  // Il microfono non resta acceso in una scheda che non si guarda.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && audio) {
      ferma();
      vista.esito.textContent = 'Accordatore fermato perché hai cambiato scheda: premi «Avvia» per riprendere.';
    }
  });

  attesa();
})();
