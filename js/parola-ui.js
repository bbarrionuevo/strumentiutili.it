// js/parola-ui.js — Il gioco della "Parola del giorno".
//
// La parola la sceglie js/parola.js dalla data: qui ci sono solo griglia,
// tastiera e statistiche. Si scrive con la tastiera sullo schermo o con
// quella del computer (lettere, Invio, Backspace). Partite, statistiche e
// preferenze restano su questo dispositivo, nella chiave su_parola.
(function () {
  'use strict';

  var P = window.Parola;
  var el = function (id) { return document.getElementById(id); };
  var app = el('pa-app');
  if (!P || !app) return;

  var CHIAVE = 'su_parola';
  var GIORNI_ARCHIVIO = 7;
  var NOMI = { giusta: 'al posto giusto', presente: 'c’è ma in un altro posto', assente: 'non c’è' };

  var oggi = P.oggiInItalia();
  var memoria = leggi();
  var stato = null;
  var righe = [].slice.call(document.querySelectorAll('#pa-griglia .pa-riga'));
  var tasti = {};
  [].forEach.call(document.querySelectorAll('[data-tasto]'), function (b) { tasti[b.getAttribute('data-tasto')] = b; });

  // ------------------------------------------------------------ memoria

  function leggi() {
    var m;
    try { m = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { m = null; }
    if (!m || typeof m !== 'object') m = {};
    if (!m.partite || typeof m.partite !== 'object') m.partite = {};
    m.stat = P.statistiche(m.stat);
    m.daltonico = !!m.daltonico;
    m.difficile = !!m.difficile;
    return m;
  }

  function scrivi() {
    // Si tengono solo le partite delle ultime due settimane.
    var limite = P.spostaGiorni(oggi, -14);
    Object.keys(memoria.partite).forEach(function (d) { if (d < limite) delete memoria.partite[d]; });
    try { localStorage.setItem(CHIAVE, JSON.stringify(memoria)); } catch (e) { /* navigazione privata: si gioca senza salvare */ }
  }

  function salvaPartita() {
    memoria.partite[stato.data] = { t: stato.tentativi.slice(), d: stato.difficile ? 1 : 0 };
    scrivi();
  }

  // ------------------------------------------------------------ date

  function dataLunga(data) {
    var p = data.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }

  function dataBreve(data) {
    if (data === oggi) return 'Oggi';
    if (data === P.giornoPrima(oggi)) return 'Ieri';
    var p = data.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  // Minuti che mancano alla mezzanotte italiana, quando esce la parola nuova.
  function minutiAllaProssima() {
    try {
      var p = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      var v = {};
      p.forEach(function (x) { v[x.type] = Number(x.value); });
      return 24 * 60 - (v.hour * 60 + v.minute);
    } catch (e) {
      var d = new Date();
      return 24 * 60 - (d.getHours() * 60 + d.getMinutes());
    }
  }

  // ------------------------------------------------------------ partita

  function carica(data) {
    var giorno = P.delGiorno(data);
    var salvata = memoria.partite[data];
    var tentativi = salvata && Array.isArray(salvata.t)
      ? salvata.t.map(P.normalizza).filter(function (t) { return t.length === P.LETTERE; }).slice(0, P.TENTATIVI)
      : [];
    stato = {
      data: data, numero: giorno.numero, soluzione: giorno.parola,
      tentativi: tentativi, attuale: '',
      difficile: salvata ? !!salvata.d : memoria.difficile
    };
    el('pa-numero').textContent = String(giorno.numero);
    el('pa-data').textContent = data === oggi ? 'di oggi' : 'di ' + dataLunga(data);
    el('pa-difficile').checked = stato.difficile;
    el('pa-fine').hidden = true;
    el('pa-tastiera').hidden = false;
    messaggio('');
    disegna();
    disegnaArchivio();
    if (P.esito(stato.tentativi, stato.soluzione).finita) mostraFine(false);
  }

  function disegna() {
    righe.forEach(function (riga, r) {
      var parola = r < stato.tentativi.length ? stato.tentativi[r] : (r === stato.tentativi.length ? stato.attuale : '');
      var esito = r < stato.tentativi.length ? P.valuta(parola, stato.soluzione) : null;
      var caselle = riga.children;
      for (var i = 0; i < P.LETTERE; i++) {
        var c = caselle[i];
        var lettera = parola[i] || '';
        c.textContent = lettera;
        imposta(c, 'data-lettera', !!lettera);
        if (esito) c.setAttribute('data-esito', esito[i]); else c.removeAttribute('data-esito');
      }
      imposta(riga, 'data-fatta', !!esito);
      riga.setAttribute('aria-label', etichettaRiga(r, parola, esito));
    });
    var colori = P.tastiera(stato.tentativi, stato.soluzione);
    Object.keys(tasti).forEach(function (k) {
      if (k.length !== 1) return;
      var b = tasti[k];
      if (colori[k]) {
        b.setAttribute('data-esito', colori[k]);
        b.setAttribute('aria-label', k.toUpperCase() + ', ' + NOMI[colori[k]]);
      } else {
        b.removeAttribute('data-esito');
        b.removeAttribute('aria-label');
      }
    });
  }

  function etichettaRiga(r, parola, esito) {
    var testa = 'Tentativo ' + (r + 1) + ': ';
    if (!parola) return testa + 'vuoto';
    if (!esito) return testa + parola.toUpperCase() + ', da confermare';
    return testa + esito.map(function (e, i) { return parola[i].toUpperCase() + ' ' + NOMI[e]; }).join(', ');
  }

  function imposta(nodo, attributo, acceso) {
    if (acceso) nodo.setAttribute(attributo, ''); else nodo.removeAttribute(attributo);
  }

  function finita() { return P.esito(stato.tentativi, stato.soluzione).finita; }

  function scrivi1(lettera) {
    if (finita() || stato.attuale.length >= P.LETTERE) return;
    stato.attuale += lettera;
    disegna();
  }

  function cancella() {
    if (finita() || !stato.attuale) return;
    stato.attuale = stato.attuale.slice(0, -1);
    disegna();
  }

  function scuoti() {
    var riga = righe[stato.tentativi.length];
    if (!riga) return;
    riga.removeAttribute('data-scuoti');
    void riga.offsetWidth;
    riga.setAttribute('data-scuoti', '');
  }

  function conferma() {
    if (finita()) return;
    var errore = P.problema(stato.attuale, stato);
    if (errore) { messaggio(errore); scuoti(); return; }
    stato.tentativi.push(stato.attuale);
    stato.attuale = '';
    var e = P.esito(stato.tentativi, stato.soluzione);
    var colori = P.valuta(stato.tentativi[stato.tentativi.length - 1], stato.soluzione);
    salvaPartita();
    disegna();
    annuncia(etichettaRiga(stato.tentativi.length - 1, stato.tentativi[stato.tentativi.length - 1], colori));
    if (e.finita) {
      memoria.stat = P.registra(memoria.stat, stato.data, oggi, e.vinta, e.usati);
      scrivi();
      mostraFine(true);
    } else {
      messaggio('');
    }
  }

  // ------------------------------------------------------------ fine

  var LODI = ['Fenomenale!', 'Magnifico!', 'Bravissimo!', 'Ottimo!', 'Bene!', 'Per un pelo!'];

  function mostraFine(appenaFinita) {
    var e = P.esito(stato.tentativi, stato.soluzione);
    var serie = P.serieAttuale(memoria.stat.serie, oggi);
    var parola = stato.soluzione.toUpperCase();
    el('pa-fine-titolo').textContent = e.vinta ? (appenaFinita ? LODI[e.usati - 1] : 'Questa l’hai già indovinata') : 'Peccato!';
    el('pa-fine-testo').textContent = (e.vinta ? 'Hai trovato ' + parola + ' in ' + (e.usati === 1 ? '1 tentativo' : e.usati + ' tentativi') : 'La parola era ' + parola) +
      (stato.data === oggi && serie > 1 ? '. Sei a ' + serie + ' giorni di fila.' : '.');
    el('pa-significato').href = 'https://www.treccani.it/vocabolario/' + stato.soluzione + '/';
    el('pa-significato').textContent = 'Che cosa vuol dire ' + parola + '? Vocabolario Treccani';
    var testo = P.testoCondivisione({
      data: stato.data, oggi: oggi, tentativi: stato.tentativi, soluzione: stato.soluzione,
      daltonico: memoria.daltonico, difficile: stato.difficile, serie: stato.data === oggi ? serie : 0
    });
    el('pa-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(testo);
    el('pa-condividi').hidden = !navigator.share;
    el('pa-condividi').onclick = function () { navigator.share({ text: testo }).catch(function () {}); };
    el('pa-copia').onclick = function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(testo).then(function () { messaggio('Copiato: incollalo dove vuoi.'); }, function () {});
    };
    // A partita finita la tastiera non serve: al suo posto il risultato.
    el('pa-tastiera').hidden = true;
    el('pa-fine').hidden = false;
    aggiornaProssima();
    disegnaStatistiche(e.vinta && stato.data === oggi ? e.usati : 0);
    disegnaArchivio();
    if (appenaFinita) {
      messaggio('');
      el('pa-fine-titolo').focus();
      if (el('pa-fine').scrollIntoView) el('pa-fine').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function aggiornaProssima() {
    var m = minutiAllaProssima();
    var h = Math.floor(m / 60), min = m % 60;
    el('pa-prossima').textContent = 'La prossima parola esce a mezzanotte, fra ' +
      (h ? h + (h === 1 ? ' ora' : ' ore') + (min ? ' e ' : '') : '') + (min || !h ? min + (min === 1 ? ' minuto' : ' minuti') : '') + '.';
  }

  // ------------------------------------------------------------ statistiche e archivio

  function disegnaStatistiche(evidenzia) {
    var s = memoria.stat;
    el('pa-giocate').textContent = s.giocate;
    el('pa-vinte').textContent = s.giocate ? Math.round(100 * s.vinte / s.giocate) + '%' : '0%';
    el('pa-serie').textContent = P.serieAttuale(s.serie, oggi);
    el('pa-record').textContent = Number(s.serie.record) || 0;
    var massimo = Math.max.apply(null, s.distribuzione.concat([1]));
    var lista = el('pa-distribuzione');
    lista.textContent = '';
    s.distribuzione.forEach(function (n, i) {
      var li = document.createElement('li');
      li.className = 'flex items-center gap-2 text-sm';
      var etichetta = document.createElement('span');
      etichetta.className = 'w-4 text-right font-semibold text-gray-700';
      etichetta.textContent = String(i + 1);
      var barra = document.createElement('span');
      barra.className = 'rounded px-2 py-0.5 text-right text-xs font-bold ' + (evidenzia === i + 1 ? 'bg-green-700 text-white' : 'bg-gray-500 text-white');
      barra.style.width = Math.max(8, Math.round(100 * n / massimo)) + '%';
      barra.textContent = String(n);
      li.setAttribute('aria-label', (i + 1) + (i ? ' tentativi: ' : ' tentativo: ') + n + (n === 1 ? ' partita' : ' partite'));
      li.appendChild(etichetta);
      li.appendChild(barra);
      lista.appendChild(li);
    });
  }

  function disegnaArchivio() {
    var lista = el('pa-archivio');
    lista.textContent = '';
    var data = oggi;
    for (var k = 0; k < GIORNI_ARCHIVIO && P.numero(data); k++) {
      var p = memoria.partite[data];
      var e = p && Array.isArray(p.t) ? P.esito(p.t, P.delGiorno(data).parola) : null;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'w-full text-left rounded-lg border px-3 py-2 text-sm transition ' +
        (stato && data === stato.data ? 'border-indigo-500 bg-indigo-50 text-indigo-900 font-semibold' : 'border-gray-200 hover:border-indigo-300 text-gray-800');
      b.setAttribute('aria-pressed', stato && data === stato.data ? 'true' : 'false');
      b.setAttribute('data-giorno', data);
      var sopra = document.createElement('span');
      sopra.className = 'block';
      sopra.textContent = dataBreve(data);
      var sotto = document.createElement('span');
      sotto.className = 'block text-xs text-gray-600';
      sotto.textContent = 'n. ' + P.numero(data) + ' · ' + (!e || !e.usati ? 'da fare' : e.vinta ? '✓ in ' + e.usati + '/6' : e.finita ? '✗ non trovata' : 'iniziata');
      b.appendChild(sopra);
      b.appendChild(sotto);
      b.addEventListener('click', function () {
        carica(this.getAttribute('data-giorno'));
        el('gioco').scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      var li = document.createElement('li');
      li.appendChild(b);
      lista.appendChild(li);
      data = P.giornoPrima(data);
    }
  }

  // ------------------------------------------------------------ messaggi

  var timerMessaggio = null;
  function messaggio(testo) {
    el('pa-messaggio').textContent = testo;
    clearTimeout(timerMessaggio);
    if (testo) timerMessaggio = setTimeout(function () { el('pa-messaggio').textContent = ''; }, 4000);
  }

  function annuncia(testo) {
    el('pa-annuncio').textContent = '';
    setTimeout(function () { el('pa-annuncio').textContent = testo; }, 50);
  }

  // ------------------------------------------------------------ comandi

  function premi(tasto) {
    if (tasto === 'invio') conferma();
    else if (tasto === 'cancella') cancella();
    else if (/^[a-z]$/.test(tasto)) scrivi1(tasto);
  }

  Object.keys(tasti).forEach(function (k) {
    tasti[k].addEventListener('click', function () { premi(k); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !stato) return;
    var t = e.target;
    // Nei campi di testo si scrive testo; su caselle di spunta e pulsanti si gioca.
    if (t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) ||
      (t.tagName === 'INPUT' && !/^(checkbox|radio|button)$/i.test(t.type)))) return;
    // Invio su un pulsante o un link lo attiva: non e' un tentativo.
    if (e.key === 'Enter' && t && /^(BUTTON|A|SUMMARY)$/.test(t.tagName)) return;
    if (e.key === 'Enter') { e.preventDefault(); conferma(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); cancella(); return; }
    var lettera = P.normalizza(e.key);
    if (e.key.length === 1 && lettera.length === 1) { e.preventDefault(); scrivi1(lettera); }
  });

  el('pa-daltonico').addEventListener('change', function () {
    memoria.daltonico = this.checked;
    imposta(app, 'data-daltonico', memoria.daltonico);
    scrivi();
    if (finita()) mostraFine(false);
  });

  el('pa-difficile').addEventListener('change', function () {
    if (this.checked && stato.tentativi.length && !finita()) {
      this.checked = false;
      messaggio('La modalità difficile si attiva prima del primo tentativo.');
      return;
    }
    memoria.difficile = this.checked;
    if (!finita()) stato.difficile = this.checked;
    if (stato.tentativi.length) salvaPartita(); else scrivi();
    messaggio(this.checked ? 'Modalità difficile: le lettere trovate vanno usate nei tentativi dopo.' : 'Modalità difficile spenta.');
  });

  // Se la pagina resta aperta oltre la mezzanotte, si passa alla parola nuova.
  setInterval(function () {
    var adesso = P.oggiInItalia();
    if (adesso !== oggi) {
      var eraOggi = stato.data === oggi;
      oggi = adesso;
      if (eraOggi && (finita() || !stato.tentativi.length)) carica(oggi);
      else disegnaArchivio();
      disegnaStatistiche(0);
    } else if (!el('pa-fine').hidden) {
      aggiornaProssima();
    }
  }, 30000);

  // ------------------------------------------------------------ avvio

  imposta(app, 'data-daltonico', memoria.daltonico);
  el('pa-daltonico').checked = memoria.daltonico;

  // ?giorno=AAAA-MM-GG apre la parola condivisa da un amico, purche' non sia
  // nel futuro: quella di domani esce domani.
  var giorno = new URLSearchParams(location.search).get('giorno');
  if (!(giorno && P.valida(giorno) && giorno <= oggi && P.numero(giorno))) giorno = oggi;
  carica(giorno);
  disegnaStatistiche(0);
})();
