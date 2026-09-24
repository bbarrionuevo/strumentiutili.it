// js/sudoku-ui.js — Il gioco del sudoku del giorno.
//
// Il sudoku lo costruisce js/sudoku.js dalla data: qui c'e' solo il gioco.
// Si tocca una casella e poi un numero (o si usa la tastiera: frecce, 1-9,
// Canc, N per le note, Ctrl+Z). La partita, la serie di giorni e il livello
// preferito si salvano su questo dispositivo, nella chiave su_sudoku.
(function () {
  'use strict';

  var S = window.Sudoku;
  var el = function (id) { return document.getElementById(id); };
  var grigliaEl = el('sdk-griglia');
  if (!S || !grigliaEl) return;

  var CHIAVE = 'su_sudoku';
  var URL_PAGINA = 'https://strumentiutili.it/utilita-web/sudoku-del-giorno/';
  var PDF_LIB = '/vendor/pdf-lib@1.17.1/pdf-lib.min.js';
  var GIORNI_ARCHIVIO = 7;

  var oggi = S.oggiInItalia();
  var memoria = leggi();
  var stato = null;
  var celle = [];
  var cronometro = null;

  // ------------------------------------------------------------ memoria

  function leggi() {
    var m;
    try { m = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { m = null; }
    if (!m || typeof m !== 'object') m = {};
    if (!m.partite || typeof m.partite !== 'object') m.partite = {};
    if (!m.serie || typeof m.serie !== 'object') m.serie = {};
    if (S.LIVELLI.indexOf(m.livello) < 0) m.livello = 'facile';
    return m;
  }

  function scrivi() {
    // Si tengono solo le partite delle ultime due settimane.
    var limite = oggi;
    for (var k = 0; k < 14; k++) limite = S.giornoPrima(limite);
    Object.keys(memoria.partite).forEach(function (c) { if (c.slice(0, 10) < limite) delete memoria.partite[c]; });
    try { localStorage.setItem(CHIAVE, JSON.stringify(memoria)); } catch (e) { /* navigazione privata: si gioca senza salvare */ }
  }

  function salvaPartita() {
    if (!stato) return;
    memoria.partite[stato.data + '|' + stato.livello] = {
      v: stato.valori.join(''),
      n: stato.note.some(Boolean) ? stato.note.join(',') : '',
      t: Math.floor(stato.tempo),
      a: stato.aiuti,
      f: stato.finito ? 1 : 0
    };
    memoria.livello = stato.livello;
    scrivi();
  }

  // ------------------------------------------------------------ date

  function dataLunga(data, conAnno) {
    var p = data.split('-').map(Number);
    var opz = { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' };
    if (conAnno) opz.year = 'numeric';
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('it-IT', opz);
  }

  function dataBreve(data) {
    if (data === oggi) return 'Oggi';
    if (data === S.giornoPrima(oggi)) return 'Ieri';
    var p = data.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  // ------------------------------------------------------------ partita

  function carica(data, livello) {
    fermaTempo();
    var puzzle = S.delGiorno(data, livello);
    var salvata = memoria.partite[data + '|' + livello];
    var valori = puzzle.griglia.slice();
    var note = new Array(81).fill(0);
    if (salvata && typeof salvata.v === 'string' && salvata.v.length === 81) {
      for (var i = 0; i < 81; i++) {
        var v = Number(salvata.v[i]);
        if (!puzzle.griglia[i] && v >= 0 && v <= 9) valori[i] = v;
      }
      if (salvata.n) salvata.n.split(',').forEach(function (x, j) { if (j < 81) note[j] = (Number(x) || 0) & 0x3fe; });
    }
    stato = {
      data: data, livello: livello, puzzle: puzzle, valori: valori, note: note,
      tempo: salvata ? Number(salvata.t) || 0 : 0,
      aiuti: salvata ? Number(salvata.a) || 0 : 0,
      finito: !!(salvata && salvata.f),
      iniziato: !!salvata, sel: -1, modoNote: false, pila: [], pausa: false
    };
    memoria.livello = livello;
    el('sdk-note').setAttribute('aria-pressed', 'false');
    el('sdk-fine').hidden = true;
    messaggio('');
    disegna();
    if (stato.finito) mostraFine(false);
    else if (stato.iniziato) avviaTempo();
    aggiornaIntestazione();
  }

  function disegna() {
    var sel = stato.sel;
    var valSel = sel >= 0 ? stato.valori[sel] : 0;
    var conflitti = {};
    S.conflitti(stato.valori).forEach(function (i) { conflitti[i] = true; });
    for (var i = 0; i < 81; i++) {
      var c = celle[i];
      var v = stato.valori[i];
      var dato = !!stato.puzzle.griglia[i];
      var zona = sel >= 0 && i !== sel && (S.riga(i) === S.riga(sel) || S.colonna(i) === S.colonna(sel) || S.riquadro(i) === S.riquadro(sel));
      imposta(c, 'data-dato', dato);
      imposta(c, 'data-zona', zona && !stato.finito);
      imposta(c, 'data-uguale', !!valSel && v === valSel && i !== sel && !stato.finito);
      imposta(c, 'data-conflitto', !!conflitti[i] && !dato);
      // La sottolineatura di "Controlla" sparisce appena il numero si corregge.
      if (!v || v === stato.puzzle.soluzione[i] || stato.finito) c.removeAttribute('data-sbagliato');
      if (i === sel) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
      c.tabIndex = i === (sel >= 0 ? sel : 0) ? 0 : -1;
      if (v) {
        c.textContent = String(v);
      } else if (stato.note[i]) {
        var html = '<span class="sdk-note" aria-hidden="true">';
        for (var d = 1; d <= 9; d++) html += '<span>' + (stato.note[i] & (1 << d) ? d : '') + '</span>';
        c.innerHTML = html + '</span>';
      } else {
        c.textContent = '';
      }
      c.setAttribute('aria-label', etichetta(i));
    }
    imposta(grigliaEl, 'data-finito', stato.finito);
    // quanti ne mancano per ogni numero
    var usati = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    stato.valori.forEach(function (v) { usati[v]++; });
    document.querySelectorAll('[data-cifra]').forEach(function (b) {
      var d = Number(b.getAttribute('data-cifra'));
      var resto = Math.max(0, 9 - usati[d]);
      b.querySelector('[data-resto]').textContent = resto ? String(resto) : '✓';
      b.disabled = stato.finito;
      b.setAttribute('aria-label', 'Metti il ' + d + (resto ? ', ne mancano ' + resto : ', sono tutti in griglia'));
    });
    ['sdk-cancella', 'sdk-annulla', 'sdk-aiuto', 'sdk-controlla', 'sdk-note'].forEach(function (id) { el(id).disabled = stato.finito; });
    el('sdk-annulla').disabled = stato.finito || !stato.pila.length;
  }

  function imposta(nodo, attributo, acceso) {
    if (acceso) nodo.setAttribute(attributo, ''); else nodo.removeAttribute(attributo);
  }

  function etichetta(i) {
    var testo = 'Riga ' + (S.riga(i) + 1) + ', colonna ' + (S.colonna(i) + 1) + ': ';
    var v = stato.valori[i];
    if (v) return testo + v + (stato.puzzle.griglia[i] ? ', dato' : '');
    var n = [];
    for (var d = 1; d <= 9; d++) if (stato.note[i] & (1 << d)) n.push(d);
    return testo + 'vuota' + (n.length ? ', note ' + n.join(' ') : '');
  }

  function aggiornaIntestazione() {
    el('sdk-data').textContent = dataLunga(stato.data, false);
    document.querySelectorAll('[data-livello]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-livello') === stato.livello ? 'true' : 'false');
    });
    el('sdk-tempo').textContent = S.formatoTempo(stato.tempo);
    disegnaArchivio();
    disegnaSerie();
  }

  // ------------------------------------------------------------ mosse

  function registra(i) {
    stato.pila.push({ i: i, v: stato.valori[i], note: stato.note.slice() });
    if (stato.pila.length > 200) stato.pila.shift();
  }

  function inizia() {
    if (!stato.iniziato) { stato.iniziato = true; avviaTempo(); }
  }

  function modificabile(i) {
    return i >= 0 && !stato.finito && !stato.pausa && !stato.puzzle.griglia[i];
  }

  function metti(d) {
    var i = stato.sel;
    if (!modificabile(i)) return;
    if (stato.modoNote && stato.valori[i]) return;
    inizia();
    registra(i);
    if (stato.modoNote) {
      stato.note[i] ^= 1 << d;
    } else {
      stato.valori[i] = stato.valori[i] === d ? 0 : d;
      stato.note[i] = 0;
      // Il numero messo sparisce dalle note delle caselle che lo vedono.
      if (stato.valori[i]) S.VICINI[i].forEach(function (j) { stato.note[j] &= ~(1 << d); });
    }
    dopoMossa();
  }

  function cancella() {
    var i = stato.sel;
    if (!modificabile(i) || (!stato.valori[i] && !stato.note[i])) return;
    registra(i);
    stato.valori[i] = 0;
    stato.note[i] = 0;
    dopoMossa();
  }

  function annulla() {
    var m = stato.pila.pop();
    if (!m || stato.finito) return;
    stato.valori[m.i] = m.v;
    stato.note = m.note;
    stato.sel = m.i;
    dopoMossa();
    celle[m.i].focus();
  }

  function aiuto() {
    if (stato.finito) return;
    var sol = stato.puzzle.soluzione;
    var i = modificabile(stato.sel) && stato.valori[stato.sel] !== sol[stato.sel] ? stato.sel : -1;
    if (i < 0) {
      for (var k = 0; k < 81; k++) if (stato.valori[k] !== sol[k]) { i = k; break; }
    }
    if (i < 0) return;
    inizia();
    registra(i);
    stato.valori[i] = sol[i];
    stato.note[i] = 0;
    S.VICINI[i].forEach(function (j) { stato.note[j] &= ~(1 << sol[i]); });
    stato.aiuti++;
    stato.sel = i;
    messaggio('Aiuto: nella riga ' + (S.riga(i) + 1) + ', colonna ' + (S.colonna(i) + 1) + ' va il ' + sol[i] + '.');
    dopoMossa();
    celle[i].focus();
  }

  function controlla() {
    var sbagliate = [];
    stato.valori.forEach(function (v, i) {
      if (v && !stato.puzzle.griglia[i] && v !== stato.puzzle.soluzione[i]) sbagliate.push(i);
    });
    sbagliate.forEach(function (i) { celle[i].setAttribute('data-sbagliato', ''); });
    setTimeout(function () { sbagliate.forEach(function (i) { celle[i].removeAttribute('data-sbagliato'); }); }, 4000);
    messaggio(sbagliate.length
      ? (sbagliate.length === 1 ? 'C’è 1 numero sbagliato: è sottolineato in rosso.' : 'Ci sono ' + sbagliate.length + ' numeri sbagliati: sono sottolineati in rosso.')
      : 'Finora è tutto giusto.');
  }

  function dopoMossa() {
    var completo = stato.valori.every(function (v, i) { return v === stato.puzzle.soluzione[i]; });
    if (completo) {
      stato.finito = true;
      fermaTempo();
      memoria.serie = S.aggiornaSerie(memoria.serie, stato.data, oggi);
      salvaPartita();
      disegna();
      mostraFine(true);
      disegnaArchivio();
      disegnaSerie();
      return;
    }
    if (stato.valori.indexOf(0) < 0) messaggio('La griglia è piena ma qualcosa non torna: premi «Controlla» per vedere dove.');
    salvaPartita();
    disegna();
  }

  // ------------------------------------------------------------ tempo

  function avviaTempo() {
    fermaTempo();
    if (stato.finito) return;
    var ultimo = Date.now();
    cronometro = setInterval(function () {
      var adesso = Date.now();
      if (!stato.pausa && document.visibilityState === 'visible') stato.tempo += (adesso - ultimo) / 1000;
      ultimo = adesso;
      el('sdk-tempo').textContent = S.formatoTempo(stato.tempo);
      if (Math.floor(stato.tempo) % 10 === 0) salvaPartita();
    }, 1000);
  }

  function fermaTempo() {
    if (cronometro) { clearInterval(cronometro); cronometro = null; }
  }

  function pausa(attiva) {
    if (stato.finito) return;
    stato.pausa = attiva;
    grigliaEl.hidden = attiva;
    el('sdk-in-pausa').hidden = !attiva;
    el('sdk-pausa').setAttribute('aria-pressed', attiva ? 'true' : 'false');
    el('sdk-pausa').textContent = attiva ? 'Riprendi' : 'Pausa';
    if (!attiva) (celle[stato.sel] || celle[0]).focus();
  }

  // ------------------------------------------------------------ fine

  function mostraFine(appenaRisolto) {
    var serie = S.serieAttuale(memoria.serie, oggi);
    var testo = S.testoCondivisione({
      data: stato.data, livello: stato.livello, tempo: stato.tempo, aiuti: stato.aiuti,
      serie: stato.data === oggi ? serie : 0,
      url: URL_PAGINA + '?giorno=' + stato.data + '&livello=' + stato.livello
    });
    el('sdk-fine-titolo').textContent = appenaRisolto ? 'Risolto!' : 'Questo sudoku l’hai già risolto';
    el('sdk-fine-testo').textContent = 'Tempo ' + S.formatoTempo(stato.tempo) +
      (stato.aiuti ? ', con ' + (stato.aiuti === 1 ? '1 aiuto' : stato.aiuti + ' aiuti') : ', senza aiuti') +
      (stato.data === oggi && serie > 1 ? '. Sei a ' + serie + ' giorni di fila.' : '.');
    el('sdk-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(testo);
    el('sdk-condividi').hidden = !navigator.share;
    el('sdk-condividi').onclick = function () { navigator.share({ text: testo }).catch(function () {}); };
    el('sdk-copia').onclick = function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(testo).then(function () { messaggio('Copiato: incollalo dove vuoi.'); }, function () {});
    };
    // Il prossimo passo: il livello dopo, oppure domani.
    var dopo = S.LIVELLI[S.LIVELLI.indexOf(stato.livello) + 1];
    var prossimo = el('sdk-prossimo');
    prossimo.hidden = !dopo;
    if (dopo) {
      prossimo.textContent = 'Prova il ' + S.NOMI_LIVELLI[dopo].toLowerCase();
      prossimo.onclick = function () { carica(stato.data, dopo); };
    }
    el('sdk-fine').hidden = false;
    if (appenaRisolto) messaggio('Risolto in ' + S.formatoTempo(stato.tempo) + '!');
  }

  // ------------------------------------------------------------ archivio e serie

  function disegnaArchivio() {
    var lista = el('sdk-archivio');
    lista.textContent = '';
    var data = oggi;
    for (var k = 0; k < GIORNI_ARCHIVIO; k++) {
      var fatti = S.LIVELLI.filter(function (l) { var p = memoria.partite[data + '|' + l]; return p && p.f; });
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'w-full text-left rounded-lg border px-3 py-2 text-sm transition ' +
        (data === stato.data ? 'border-indigo-500 bg-indigo-50 text-indigo-900 font-semibold' : 'border-gray-200 hover:border-indigo-300 text-gray-800');
      b.setAttribute('aria-pressed', data === stato.data ? 'true' : 'false');
      b.innerHTML = '<span class="block">' + dataBreve(data) + '</span><span class="block text-xs text-gray-500">' +
        (fatti.length ? '✓ ' + fatti.map(function (l) { return S.NOMI_LIVELLI[l]; }).join(', ') : 'Da fare') + '</span>';
      b.setAttribute('data-giorno', data);
      b.addEventListener('click', function () { carica(this.getAttribute('data-giorno'), stato.livello); });
      var li = document.createElement('li');
      li.appendChild(b);
      lista.appendChild(li);
      data = S.giornoPrima(data);
    }
  }

  function disegnaSerie() {
    var s = memoria.serie;
    el('sdk-serie').textContent = S.serieAttuale(s, oggi);
    el('sdk-record').textContent = Number(s.record) || 0;
    el('sdk-risolti').textContent = Number(s.risolti) || 0;
  }

  // ------------------------------------------------------------ stampa

  var promessaPdfLib = null;
  function caricaPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (promessaPdfLib) return promessaPdfLib;
    promessaPdfLib = new Promise(function (risolvi, rifiuta) {
      var s = document.createElement('script');
      s.src = PDF_LIB;
      s.onload = function () { window.PDFLib ? risolvi(window.PDFLib) : rifiuta(new Error('pdf-lib')); };
      s.onerror = function () { promessaPdfLib = null; rifiuta(new Error('pdf-lib')); };
      document.head.appendChild(s);
    });
    return promessaPdfLib;
  }

  el('sdk-stampa').addEventListener('click', function () {
    if (!window.SudokuPdf) return;
    var bottone = this;
    var data = stato.data;
    bottone.disabled = true;
    caricaPdfLib().then(function (PDFLib) {
      var tutti = S.LIVELLI.map(function (l) { return S.delGiorno(data, l); });
      return window.SudokuPdf.crea(PDFLib, tutti, { titolo: 'Sudoku del giorno · ' + dataLunga(data, true), nomiLivelli: S.NOMI_LIVELLI });
    }).then(function (byte) {
      var url = URL.createObjectURL(new Blob([byte], { type: 'application/pdf' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = 'sudoku-' + data + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      messaggio('Scaricato sudoku-' + data + '.pdf: i tre livelli su un foglio, le soluzioni sul secondo.');
    }).catch(function () {
      messaggio('Non sono riuscito a preparare il PDF. Se sei senza connessione, riprova quando torna.');
    }).then(function () { bottone.disabled = false; });
  });

  // ------------------------------------------------------------ comandi

  function messaggio(testo) { el('sdk-esito').textContent = testo; }

  function seleziona(i) {
    stato.sel = i;
    disegna();
    celle[i].focus();
  }

  for (var i = 0; i < 81; i++) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sdk-cella';
    b.setAttribute('data-i', String(i));
    celle.push(b);
    grigliaEl.appendChild(b);
  }

  grigliaEl.addEventListener('click', function (e) {
    var c = e.target.closest('.sdk-cella');
    if (!c) return;
    inizia();
    seleziona(Number(c.getAttribute('data-i')));
  });

  document.querySelectorAll('[data-cifra]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (stato.sel < 0) { messaggio('Tocca prima una casella vuota.'); return; }
      metti(Number(b.getAttribute('data-cifra')));
      celle[stato.sel].focus();
    });
  });

  // Dopo un comando si torna sulla casella, cosi' dalla tastiera si continua.
  function tornaAllaCasella() { if (stato.sel >= 0 && !stato.pausa) celle[stato.sel].focus(); }

  el('sdk-note').addEventListener('click', function () {
    stato.modoNote = !stato.modoNote;
    this.setAttribute('aria-pressed', stato.modoNote ? 'true' : 'false');
    messaggio(stato.modoNote ? 'Note attive: i numeri si scrivono piccoli, come promemoria.' : 'Note spente.');
    if (document.activeElement === this) tornaAllaCasella();
  });
  el('sdk-cancella').addEventListener('click', function () { cancella(); tornaAllaCasella(); });
  el('sdk-annulla').addEventListener('click', annulla);
  el('sdk-aiuto').addEventListener('click', aiuto);
  el('sdk-controlla').addEventListener('click', controlla);
  el('sdk-pausa').addEventListener('click', function () { pausa(!stato.pausa); });
  el('sdk-riprendi').addEventListener('click', function () { pausa(false); });
  el('sdk-ricomincia').addEventListener('click', function () {
    if (!confirm('Ricominciare questo sudoku da capo? Tempo e numeri messi si azzerano.')) return;
    delete memoria.partite[stato.data + '|' + stato.livello];
    scrivi();
    carica(stato.data, stato.livello);
  });

  document.querySelectorAll('[data-livello]').forEach(function (b) {
    b.addEventListener('click', function () {
      salvaPartita();
      carica(stato.data, b.getAttribute('data-livello'));
    });
  });

  grigliaEl.addEventListener('keydown', function (e) {
    var i = stato.sel >= 0 ? stato.sel : 0;
    var muovi = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (muovi) {
      e.preventDefault();
      var j = i + muovi;
      if (e.key === 'ArrowLeft' && i % 9 === 0) j = i + 8;
      if (e.key === 'ArrowRight' && i % 9 === 8) j = i - 8;
      seleziona((j + 81) % 81);
      return;
    }
    if (stato.sel < 0) stato.sel = i;
    if (/^[1-9]$/.test(e.key)) { e.preventDefault(); metti(Number(e.key)); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); cancella(); return; }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); el('sdk-note').click(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); annulla(); }
  });

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') salvaPartita(); });
  window.addEventListener('pagehide', salvaPartita);

  // ------------------------------------------------------------ avvio

  // ?giorno=AAAA-MM-GG&livello=medio apre il sudoku condiviso da un amico,
  // purche' non sia nel futuro: quello di domani esce domani.
  var parametri = new URLSearchParams(location.search);
  var giorno = parametri.get('giorno');
  var livello = parametri.get('livello');
  if (!(giorno && /^\d{4}-\d{2}-\d{2}$/.test(giorno) && giorno <= oggi && giorno >= '2026-01-01')) giorno = oggi;
  if (S.LIVELLI.indexOf(livello) < 0) livello = memoria.livello;
  carica(giorno, livello);
})();
