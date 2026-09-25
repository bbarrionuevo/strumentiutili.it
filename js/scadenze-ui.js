// js/scadenze-ui.js — La pagina dello scadenziario: elenco ordinato per data,
// aggiunta e modifica, aiuto per calcolare la data, promemoria nel calendario
// del telefono e in Google Calendar.
//
// Le scadenze restano su questo dispositivo (chiave su_scadenze). Tutto il
// testo scritto dall'utente entra nella pagina con textContent.
(function () {
  'use strict';

  var S = window.Scadenze;
  var F = window.Festivita;
  var Ics = window.CalendarioIcs;
  var radice = document.getElementById('sc-app');
  if (!S || !F || !Ics || !radice) return;

  var CHIAVE = 'su_scadenze';
  var URL_PAGINA = 'https://strumentiutili.it/identita-burocrazia/scadenziario/';
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var ESEMPI = {
    revisione: 'Es. Revisione Panda', patente: 'Es. Patente di Marco', identita: 'Es. Carta d’identità di Giulia',
    passaporto: 'Es. Passaporto', assicurazione: 'Es. Assicurazione Panda', bollo: 'Es. Bollo Panda', isee: 'Es. ISEE famiglia',
    caldaia: 'Es. Controllo caldaia', altro: 'Es. Abbonamento palestra'
  };
  var RIPETI = [['no', 'Non si ripete'], ['mese', 'Ogni mese'], ['anno', 'Ogni anno'], ['2anni', 'Ogni 2 anni']];

  function $(id) { return document.getElementById(id); }
  var el = {
    elenco: $('sc-elenco'), vuoto: $('sc-vuoto'), form: $('sc-form'), tipo: $('sc-tipo'), titolo: $('sc-titolo'),
    data: $('sc-data'), ripeti: $('sc-ripeti'), nota: $('sc-nota'), salva: $('sc-salva'), annulla: $('sc-annulla'),
    errore: $('sc-errore'), aiuto: $('sc-aiuto'), aiutoCampi: $('sc-aiuto-campi'), risultato: $('sc-risultato'), usa: $('sc-usa'),
    ics: $('sc-ics'), pMese: $('sc-p-mese'), pSettimana: $('sc-p-settimana'), pGiorno: $('sc-p-giorno'), messaggio: $('sc-messaggio'),
    titoloForm: $('sc-titolo-form')
  };

  var elenco = [];
  var inModifica = null;
  var proposta = null;

  function oggi() { return F.oggi(); }

  function leggi() {
    try {
      var m = JSON.parse(localStorage.getItem(CHIAVE) || 'null');
      return m && Array.isArray(m.elenco) ? m.elenco.filter(function (s) { return !S.problema(s); }) : [];
    } catch (e) { return []; }
  }

  function scrivi() {
    try { localStorage.setItem(CHIAVE, JSON.stringify({ v: 1, elenco: elenco })); } catch (e) { /* navigazione privata */ }
  }

  function messaggio(testo, errore) {
    el.messaggio.textContent = testo || '';
    el.messaggio.className = 'mt-3 text-sm ' + (errore ? 'text-red-700' : 'text-emerald-800');
  }

  function dataLunga(iso) {
    return Number(iso.slice(8)) + ' ' + MESI[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4);
  }

  function quando(st) {
    if (st.stato === 'scaduta') return st.giorni === -1 ? 'scaduta ieri' : 'scaduta da ' + (-st.giorni) + ' giorni';
    if (st.stato === 'tolleranza') return 'scaduta: ancora ' + (15 + st.giorni) + ' giorni di tolleranza';
    if (st.giorni === 0) return 'scade oggi';
    if (st.giorni === 1) return 'scade domani';
    return 'fra ' + st.giorni + ' giorni';
  }

  var COLORI = {
    scaduta: 'border-l-red-600 bg-red-50', tolleranza: 'border-l-orange-500 bg-orange-50', vicina: 'border-l-amber-500 bg-amber-50',
    presto: 'border-l-sky-500 bg-white', ok: 'border-l-emerald-500 bg-white'
  };
  var ETICHETTE = { scaduta: 'Scaduta', tolleranza: 'In tolleranza', vicina: 'Entro 30 giorni', presto: 'Entro 3 mesi', ok: 'In regola' };

  function bottone(testo, classe, azione) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-sm font-semibold underline underline-offset-2 ' + classe;
    b.textContent = testo;
    b.addEventListener('click', azione);
    return b;
  }

  function disegna() {
    var o = oggi();
    el.elenco.textContent = '';
    el.vuoto.hidden = elenco.length > 0;
    el.ics.disabled = elenco.length === 0;
    S.ordina(elenco, o).forEach(function (s) {
      var st = S.stato(s, o);
      var tipo = S.TIPI[s.tipo];
      var li = document.createElement('li');
      li.className = 'rounded-xl border border-gray-200 border-l-4 p-4 ' + COLORI[st.stato];

      var testa = document.createElement('div');
      testa.className = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1';
      var nome = document.createElement('h3');
      nome.className = 'font-bold text-gray-900';
      nome.textContent = s.titolo;
      var badge = document.createElement('span');
      badge.className = 'text-xs font-semibold text-gray-700';
      badge.textContent = ETICHETTE[st.stato];
      testa.appendChild(nome);
      testa.appendChild(badge);

      var riga = document.createElement('p');
      riga.className = 'mt-1 text-sm text-gray-800';
      riga.textContent = dataLunga(st.data) + ' · ' + quando(st);
      var sotto = document.createElement('p');
      sotto.className = 'mt-1 text-xs text-gray-600';
      var ripetizione = RIPETI.filter(function (r) { return r[0] === s.ripeti; })[0];
      sotto.textContent = tipo.nome + (s.ripeti !== 'no' ? ' · ' + ripetizione[1].toLowerCase() : '') + (s.nota ? ' · ' + s.nota : '');

      li.appendChild(testa);
      li.appendChild(riga);
      li.appendChild(sotto);
      if (tipo.consiglio) {
        var c = document.createElement('p');
        c.className = 'mt-2 text-xs text-gray-700';
        c.textContent = tipo.consiglio;
        li.appendChild(c);
      }

      var azioni = document.createElement('div');
      azioni.className = 'mt-3 flex flex-wrap gap-x-4 gap-y-2';
      var g = document.createElement('a');
      g.href = Ics.linkGoogle({ titolo: 'Scadenza: ' + s.titolo, data: st.data, descrizione: [tipo.nome, s.nota].filter(Boolean).join(' · '), url: URL_PAGINA });
      g.target = '_blank';
      g.rel = 'noopener noreferrer';
      g.className = 'text-sm font-semibold text-indigo-700 underline underline-offset-2';
      g.textContent = 'Google Calendar';
      azioni.appendChild(g);
      if (s.ripeti !== 'no') {
        azioni.appendChild(bottone('Fatto: passa alla prossima', 'text-emerald-800', function () {
          s.data = S.rinnova(s, oggi());
          scrivi();
          disegna();
          messaggio('Prossima scadenza di \u00ab' + s.titolo + '\u00bb: ' + dataLunga(s.data) + '.');
        }));
      }
      azioni.appendChild(bottone('Modifica', 'text-gray-800', function () { modifica(s); }));
      azioni.appendChild(bottone('Elimina', 'text-red-700', function () {
        if (!window.confirm('Eliminare «' + s.titolo + '»?')) return;
        elenco = elenco.filter(function (x) { return x !== s; });
        scrivi();
        disegna();
      }));
      li.appendChild(azioni);
      el.elenco.appendChild(li);
    });
  }

  // ------------------------------------------------------------ modulo

  function riempiSelect(select, voci) {
    voci.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v[0];
      o.textContent = v[1];
      select.appendChild(o);
    });
  }

  function campoData(id, etichetta) {
    var box = document.createElement('div');
    var l = document.createElement('label');
    l.htmlFor = id;
    l.className = 'block text-xs font-semibold text-gray-800 mb-1';
    l.textContent = etichetta;
    var i = document.createElement('input');
    i.type = 'date';
    i.id = id;
    i.className = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500';
    i.addEventListener('change', calcola);
    box.appendChild(l);
    box.appendChild(i);
    return box;
  }

  // I campi dell'aiuto dipendono dal tipo.
  var AIUTI = {
    revisione: [['sc-a-immatricolazione', 'Prima immatricolazione (libretto, campo B)'], ['sc-a-ultima', 'Ultima revisione fatta (se c’è)']],
    patente: [['sc-a-nascita', 'Data di nascita'], ['sc-a-rilascio', 'Data dell’ultimo rinnovo o del rilascio']],
    identita: [['sc-a-nascita', 'Data di nascita'], ['sc-a-rilascio', 'Data di rilascio']],
    passaporto: [['sc-a-nascita', 'Data di nascita'], ['sc-a-rilascio', 'Data di rilascio']],
    isee: [['sc-a-presentazione', 'Data di presentazione della DSU']]
  };

  function disegnaAiuto() {
    var campi = AIUTI[el.tipo.value];
    el.aiuto.hidden = !campi;
    el.aiutoCampi.textContent = '';
    el.risultato.textContent = '';
    el.usa.hidden = true;
    proposta = null;
    if (!campi) return;
    campi.forEach(function (c) { el.aiutoCampi.appendChild(campoData(c[0], c[1])); });
  }

  function valore(id) { var i = $(id); return i && S.valida(i.value) ? i.value : null; }

  function calcola() {
    var t = el.tipo.value, r = null, spiega = '';
    if (t === 'revisione' && valore('sc-a-immatricolazione')) {
      r = S.revisione(valore('sc-a-immatricolazione'), valore('sc-a-ultima'));
      spiega = valore('sc-a-ultima') ? 'Due anni dopo l’ultima revisione, entro la fine del mese.' : 'Quattro anni dopo la prima immatricolazione, entro la fine del mese.';
    } else if ((t === 'patente' || t === 'identita' || t === 'passaporto') && valore('sc-a-nascita') && valore('sc-a-rilascio')) {
      var x = t === 'patente' ? S.patente(valore('sc-a-nascita'), valore('sc-a-rilascio'))
        : t === 'identita' ? S.cartaIdentita(valore('sc-a-nascita'), valore('sc-a-rilascio'))
          : S.passaporto(valore('sc-a-nascita'), valore('sc-a-rilascio'));
      r = x.scadenza;
      spiega = 'Valida ' + x.anni + ' anni' + (t === 'passaporto' ? ' dal rilascio.' : ', fino al compleanno successivo.');
    } else if (t === 'isee' && valore('sc-a-presentazione')) {
      r = S.isee(valore('sc-a-presentazione'));
      spiega = 'La DSU vale fino al 31 dicembre dell’anno in cui la presenti.';
    }
    proposta = r;
    el.risultato.textContent = r ? 'Data proposta: ' + dataLunga(r) + '. ' + spiega + ' Controlla comunque la data sul documento.' : '';
    el.usa.hidden = !r;
  }

  el.usa.addEventListener('click', function () {
    if (!proposta) return;
    el.data.value = proposta;
    el.data.focus();
  });

  el.tipo.addEventListener('change', function () {
    el.titolo.placeholder = ESEMPI[el.tipo.value] || '';
    el.ripeti.value = S.TIPI[el.tipo.value].ripeti;
    disegnaAiuto();
  });

  function azzera() {
    inModifica = null;
    el.form.reset();
    el.tipo.value = 'revisione';
    el.titolo.placeholder = ESEMPI.revisione;
    el.ripeti.value = S.TIPI.revisione.ripeti;
    el.salva.textContent = 'Aggiungi la scadenza';
    el.titoloForm.textContent = 'Aggiungi una scadenza';
    el.annulla.hidden = true;
    el.errore.textContent = '';
    disegnaAiuto();
  }

  function modifica(s) {
    inModifica = s;
    el.tipo.value = s.tipo;
    el.titolo.value = s.titolo;
    el.data.value = s.data;
    el.ripeti.value = s.ripeti;
    el.nota.value = s.nota || '';
    el.salva.textContent = 'Salva le modifiche';
    el.titoloForm.textContent = 'Modifica «' + s.titolo + '»';
    el.annulla.hidden = false;
    el.errore.textContent = '';
    disegnaAiuto();
    el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.titolo.focus({ preventScroll: true });
  }

  el.annulla.addEventListener('click', azzera);

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var s = {
      id: inModifica ? inModifica.id : 's' + Date.now().toString(36),
      tipo: el.tipo.value,
      titolo: el.titolo.value.trim() || S.TIPI[el.tipo.value].nome,
      data: el.data.value,
      ripeti: el.ripeti.value
    };
    if (el.nota.value.trim()) s.nota = el.nota.value.trim();
    var p = S.problema(s);
    if (p) { el.errore.textContent = p; return; }
    if (inModifica) elenco[elenco.indexOf(inModifica)] = s;
    else elenco.push(s);
    scrivi();
    var nuovo = !inModifica;
    azzera();
    disegna();
    messaggio(nuovo ? 'Aggiunta. Per non dimenticarla, mettila anche nel calendario del telefono.' : 'Modifiche salvate.');
  });

  // ------------------------------------------------------------ calendario

  el.ics.addEventListener('click', function () {
    var promemoria = [];
    if (el.pMese.checked) promemoria.push('mesePrima');
    if (el.pSettimana.checked) promemoria.push('settimanaPrima');
    if (el.pGiorno.checked) promemoria.push('giornoStesso');
    var eventi = S.eventi(S.ordina(elenco, oggi()), oggi(), { url: URL_PAGINA, promemoria: promemoria });
    Ics.scarica('scadenze.ics', Ics.crea(eventi, { nome: 'Scadenze' }));
    messaggio('Scaricato scadenze.ics con ' + eventi.length + (eventi.length === 1 ? ' evento' : ' eventi') +
      ': aprilo con il telefono per aggiungerli al calendario. Se lo avevi già importato, cancella prima i vecchi eventi per non averli doppi.');
  });

  // ------------------------------------------------------------ avvio

  riempiSelect(el.tipo, Object.keys(S.TIPI).map(function (k) { return [k, S.TIPI[k].nome]; }));
  riempiSelect(el.ripeti, RIPETI);
  elenco = leggi();
  azzera();
  disegna();
})();
