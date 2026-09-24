// js/calendario-stampa.js — Interfaccia del calendario da stampare.
//
// Le date sono in js/festivita.js, l'HTML in js/calendario-vista.js, il PDF in
// js/calendario-pdf.js. Qui: le scelte dell'utente, l'anteprima che segue
// anno e patrono, il PDF (pdf-lib si scarica solo al primo clic) e il file
// .ics con le feste. Le scelte si ricordano su questo dispositivo.
(function () {
  'use strict';

  var F = window.Festivita;
  var V = window.CalendarioVista;
  var modulo = document.getElementById('cal-modulo');
  if (!F || !V || !modulo) return;

  var campo = {
    anno: document.getElementById('cal-anno'),
    patrono: document.getElementById('cal-patrono'),
    altro: document.getElementById('cal-patrono-altro'),
    giorno: document.getElementById('cal-altro-giorno'),
    mese: document.getElementById('cal-altro-mese'),
    nome: document.getElementById('cal-altro-nome'),
    settimane: document.getElementById('cal-settimane'),
    lune: document.getElementById('cal-lune'),
    ricorrenze: document.getElementById('cal-ricorrenze'),
    soloMensile: document.getElementById('cal-solo-mensile')
  };
  var bottonePdf = document.getElementById('cal-scarica');
  var bottoneIcs = document.getElementById('cal-ics');
  var esito = document.getElementById('cal-esito');
  var CHIAVE = 'su_calendario';
  var PDF_LIB = '/vendor/pdf-lib@1.17.1/pdf-lib.min.js';

  // ------------------------------------------------------------ scelte

  function opzione(valore, testo) {
    var o = document.createElement('option');
    o.value = valore;
    o.textContent = testo;
    return o;
  }

  // Da settembre si cerca il calendario dell'anno dopo: e' quello proposto.
  var oggi = F.oggi();
  var annoOggi = Number(oggi.slice(0, 4));
  var annoProposto = Number(oggi.slice(5, 7)) >= 9 ? annoOggi + 1 : annoOggi;
  campo.anno.textContent = '';
  for (var a = annoOggi - 1; a <= annoOggi + 3; a++) campo.anno.appendChild(opzione(a, a));
  campo.anno.value = String(annoProposto);

  var gruppo = document.createElement('optgroup');
  gruppo.label = 'Capoluoghi';
  V.PATRONI.forEach(function (p, i) {
    gruppo.appendChild(opzione(String(i), p.citta + ' — ' + p.santo + ', ' + V.giornoMese(F, '2000-' + p.md)));
  });
  campo.patrono.appendChild(gruppo);
  campo.patrono.appendChild(opzione('altro', 'Un altro comune…'));
  for (var g = 1; g <= 31; g++) campo.giorno.appendChild(opzione(g, g));
  F.NOMI_MESI.forEach(function (m, i) { campo.mese.appendChild(opzione(i + 1, m)); });

  function formato() {
    var scelto = modulo.querySelector('input[name="cal-formato"]:checked');
    return scelto ? scelto.value : 'annuale';
  }

  function patrono() {
    var v = campo.patrono.value;
    if (v === '') return null;
    if (v === 'altro') {
      var g = Number(campo.giorno.value), m = Number(campo.mese.value);
      if (!g || !m || g > F.giorniNelMese(2000, m)) return null;   // il 2000 e' bisestile: il 29 febbraio vale
      return { md: String(m).padStart(2, '0') + '-' + String(g).padStart(2, '0'), nome: campo.nome.value.trim() || 'Santo patrono' };
    }
    var p = V.PATRONI[Number(v)];
    return p ? { md: p.md, nome: p.santo + ' (' + p.citta + ')' } : null;
  }

  function anno() { return Number(campo.anno.value); }

  function ricorda() {
    try {
      localStorage.setItem(CHIAVE, JSON.stringify({
        patrono: campo.patrono.value, giorno: campo.giorno.value, mese: campo.mese.value,
        nome: campo.nome.value, formato: formato(),
        settimane: campo.settimane.checked, lune: campo.lune.checked, ricorrenze: campo.ricorrenze.checked
      }));
    } catch (e) { /* navigazione privata o spazio pieno: pazienza */ }
  }

  function ripristina() {
    var s;
    try { s = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') return;
    if (s.patrono === 'altro' || V.PATRONI[Number(s.patrono)]) campo.patrono.value = s.patrono;
    if (s.giorno) campo.giorno.value = s.giorno;
    if (s.mese) campo.mese.value = s.mese;
    if (typeof s.nome === 'string') campo.nome.value = s.nome.slice(0, 40);
    var radio = modulo.querySelector('input[name="cal-formato"][value="' + (s.formato === 'mensile' ? 'mensile' : 'annuale') + '"]');
    if (radio) radio.checked = true;
    ['settimane', 'lune', 'ricorrenze'].forEach(function (k) { if (typeof s[k] === 'boolean') campo[k].checked = s[k]; });
  }

  // ------------------------------------------------------------ anteprima

  function aggiornaVista() {
    var a = anno();
    var p = patrono();
    campo.altro.hidden = campo.patrono.value !== 'altro';
    campo.soloMensile.hidden = formato() !== 'mensile';
    document.querySelectorAll('[data-cal-anno]').forEach(function (el) { el.textContent = String(a); });
    document.getElementById('cal-mesi').innerHTML = V.anno(F, a, { patrono: p, oggi: oggi });
    document.getElementById('cal-festivita').innerHTML = V.festivita(F, a, p);
    document.getElementById('cal-ponti').innerHTML = V.ponti(F, a, p);
    document.getElementById('cal-ricorrenze').innerHTML = V.ricorrenze(F, a);
  }

  function messaggio(testo, errore) {
    esito.textContent = testo;
    esito.className = 'text-sm font-medium ' + (errore ? 'text-red-700' : 'text-emerald-700');
  }

  // ------------------------------------------------------------ PDF

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

  function scarica(nome, blob) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  modulo.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (!window.CalendarioPdf) return;
    var a = anno(), f = formato();
    bottonePdf.disabled = true;
    messaggio('Preparo il PDF…');
    caricaPdfLib().then(function (PDFLib) {
      return window.CalendarioPdf.crea(PDFLib, F, {
        anno: a, formato: f, patrono: patrono(),
        settimane: campo.settimane.checked, lune: campo.lune.checked, ricorrenze: campo.ricorrenze.checked
      });
    }).then(function (byte) {
      var nome = 'calendario-' + a + '-' + f + '.pdf';
      scarica(nome, new Blob([byte], { type: 'application/pdf' }));
      messaggio('Fatto: ' + nome + ' (' + (f === 'mensile' ? '12 fogli' : '1 foglio') + ' A4, ' +
        Math.max(1, Math.round(byte.length / 1024)) + ' KB). Stampa con la scala al 100%.');
      ricorda();
    }).catch(function () {
      messaggio('Non sono riuscito a preparare il PDF. Se sei senza connessione, riprova quando torna: la prima volta serve scaricare il programma che lo crea.', true);
    }).then(function () { bottonePdf.disabled = false; });
  });

  // ------------------------------------------------------------ .ics

  bottoneIcs.addEventListener('click', function () {
    if (!window.CalendarioIcs) return;
    var a = anno();
    var eventi = F.festivita(a, patrono()).map(function (x) {
      return {
        id: 'festa-' + (x.tipo === 'patrono' ? 'patrono' : x.data.slice(5)),
        data: x.data,
        titolo: x.nome,
        descrizione: x.tipo === 'patrono' ? 'Santo patrono: festa nel comune.' : 'Festività nazionale.',
        url: 'https://strumentiutili.it/utilita-web/calendario-da-stampare/'
      };
    });
    window.CalendarioIcs.scarica('festivita-' + a + '.ics', window.CalendarioIcs.crea(eventi, { nome: 'Festività ' + a }));
    messaggio('Scaricato festivita-' + a + '.ics con ' + eventi.length + ' feste: aprilo per aggiungerle al tuo calendario.');
    ricorda();
  });

  // ------------------------------------------------------------ avvio

  ripristina();
  modulo.addEventListener('change', function () { aggiornaVista(); ricorda(); });
  campo.nome.addEventListener('input', aggiornaVista);
  aggiornaVista();
})();
