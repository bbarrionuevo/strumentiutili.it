// js/multa-ui.js — Interfaccia del lettore di multe.
//
// Il calcolo sta in js/multa-termini.js, la lettura del verbale in
// js/multa-lettura.js, l'OCR in js/ocr-testo.js. Qui si tiene insieme il flusso:
// carica (facoltativo) -> controlla -> calcola.
//
// Una regola che vale per tutto questo file: quello che si legge dal file entra
// SOLO nei campi del modulo, mai direttamente nel calcolo. L'utente deve poter
// vedere e correggere ogni valore prima che diventi una scadenza.
(function () {
  'use strict';

  var input = document.getElementById('file-verbale');
  var esito = document.getElementById('esito-file');
  var anteprima = document.getElementById('anteprima-campi');
  var risultato = document.getElementById('risultato');
  var bottone = document.getElementById('calcola');
  var esitoCalcolo = document.getElementById('esito-calcolo');
  if (!bottone || !risultato) return;

  var campo = {
    violazione: document.getElementById('data-violazione'),
    notifica: document.getElementById('data-notifica'),
    sanzione: document.getElementById('importo-sanzione'),
    spese: document.getElementById('spese-notifica'),
    sospensione: document.getElementById('sospensione-patente'),
    confisca: document.getElementById('confisca-veicolo'),
    estero: document.getElementById('residenza-estero'),
    immediata: document.getElementById('consegna-immediata'),
    riquadroNotifica: document.getElementById('riquadro-notifica')
  };

  var regole = null;

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function messaggio(dove, testo, tipo) {
    if (!dove) return;
    var colore = tipo === 'errore' ? 'text-red-600' : (tipo === 'ok' ? 'text-emerald-700' : 'text-gray-600');
    dove.className = 'mt-3 text-sm ' + colore;
    dove.textContent = testo;
  }

  function euro(n) {
    if (n === null || n === undefined) return '';
    return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  }

  function dataIt(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
  }

  // Con la contestazione immediata la data di notifica non serve: nasconderla
  // evita di far cercare all'utente un dato che non esiste.
  function aggiornaConsegna() {
    var immediata = campo.immediata && campo.immediata.checked;
    if (campo.riquadroNotifica) campo.riquadroNotifica.hidden = !!immediata;
  }
  ['consegna-notifica', 'consegna-immediata'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', aggiornaConsegna);
  });
  aggiornaConsegna();

  // ------------------------------------------------- lettura del file

  // Riempie i campi solo dove sono vuoti: quello che l'utente ha gia' scritto
  // vince sempre su quello che si e' letto dal documento.
  function proponi(el, valore) {
    if (!el || valore === null || valore === undefined || valore === '') return false;
    if (String(el.value).trim()) return false;
    el.value = valore;
    el.classList.add('bg-amber-50', 'border-amber-300');
    return true;
  }

  function scegliImporto(importi, tipo) {
    var trovato = (importi || []).filter(function (i) { return i.tipo === tipo; });
    return trovato.length === 1 ? trovato[0].valore : null;
  }

  function mostraLettura(campi) {
    var righe = [];

    function voce(etichetta, stato, candidati, nota) {
      var testo;
      if (stato === 'assente') testo = '<span class="text-gray-500">non trovato</span>';
      else if (stato === 'ambiguo') {
        testo = '<span class="text-amber-800">' + candidati.length + ' valori possibili: ' +
                esc(candidati.map(function (c) { return c.valore; }).join(', ')) + '</span>';
      } else testo = '<span class="text-gray-900">' + esc(candidati[0].valore) + '</span>';

      righe.push('<li class="py-1.5 flex flex-wrap justify-between gap-2 text-xs">' +
                 '<span class="font-medium text-gray-700">' + esc(etichetta) + '</span>' + testo +
                 (nota ? '<span class="w-full text-gray-500">' + esc(nota) + '</span>' : '') + '</li>');
    }

    voce('Data della violazione', campi.dataViolazione.stato, campi.dataViolazione.candidati);
    voce('Data di notifica', campi.dataNotifica.stato, campi.dataNotifica.candidati, campi.dataNotifica.perche);
    voce('Articolo contestato', campi.articoli.stato, campi.articoli.candidati);
    voce('Punti', campi.punti.stato, campi.punti.candidati);

    (campi.importi || []).forEach(function (i) {
      var nomi = { sanzione: 'Sanzione', ridotto5: 'Importo ridotto (5 giorni)', spese: 'Spese di notifica', massimo: 'Massimo edittale' };
      righe.push('<li class="py-1.5 flex justify-between gap-2 text-xs">' +
                 '<span class="font-medium text-gray-700">' + esc(nomi[i.tipo] || 'Importo non identificato') + '</span>' +
                 '<span class="' + (i.tipo ? 'text-gray-900' : 'text-amber-800') + '">' + euro(i.valore) + '</span></li>');
    });

    anteprima.innerHTML =
      '<div class="border border-amber-200 bg-amber-50/50 rounded-lg p-4">' +
      '<p class="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-2">Letto dal documento</p>' +
      '<ul class="divide-y divide-amber-100">' + righe.join('') + '</ul>' +
      '<p class="text-xs text-amber-900 mt-3">I campi compilati automaticamente sono evidenziati nel passo 2. ' +
      'Controllali sul verbale: una cifra letta male sposta una scadenza.</p></div>';
  }

  function applica(campi) {
    mostraLettura(campi);
    var messi = 0;
    if (campi.dataViolazione.stato === 'trovato') messi += proponi(campo.violazione, campi.dataViolazione.candidati[0].valore) ? 1 : 0;
    if (campi.dataNotifica.stato === 'trovato') messi += proponi(campo.notifica, campi.dataNotifica.candidati[0].valore) ? 1 : 0;

    var sanzione = scegliImporto(campi.importi, 'sanzione');
    var spese = scegliImporto(campi.importi, 'spese');
    if (sanzione !== null) messi += proponi(campo.sanzione, sanzione) ? 1 : 0;
    if (spese !== null) messi += proponi(campo.spese, spese) ? 1 : 0;
    return messi;
  }

  var promessaPdfJs = null;
  function caricaPdfJs() {
    if (typeof pdfjsLib !== 'undefined') return Promise.resolve(pdfjsLib);
    if (promessaPdfJs) return promessaPdfJs;

    promessaPdfJs = new Promise(function (risolvi) {
      var s = document.createElement('script');
      s.src = '/vendor/pdfjs@3.11.174/pdf.min.js';
      s.onload = function () {
        if (typeof pdfjsLib !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs@3.11.174/pdf.worker.min.js';
          risolvi(pdfjsLib);
        } else risolvi(null);
      };
      s.onerror = function () { risolvi(null); };
      document.head.appendChild(s);
    });
    return promessaPdfJs;
  }

  function conclusione(r) {
    if (!r || !r.ok) {
      messaggio(esito, (r && r.motivo) || 'Non è stato possibile leggere il file. Scrivi le date a mano qui sotto.', 'errore');
      return;
    }
    var messi = applica(r.campi);
    messaggio(esito, messi
      ? 'Letti ' + messi + ' campi dal documento. Controllali qui sotto prima di calcolare.'
      : 'Il documento è stato letto ma non sono stati riconosciuti campi utilizzabili: inseriscili a mano.',
      messi ? 'ok' : 'info');
  }

  function conOcr(file) {
    messaggio(esito, 'Riconoscimento del testo in corso…', 'info');
    return caricaPdfJs().then(function (lib) {
      return window.OcrTesto.leggi(file, {
        pdfjs: lib,
        onProgresso: function (t) { messaggio(esito, t, 'info'); }
      });
    }).then(function (o) {
      var r = window.MultaLettura.leggiParole(o.parole);
      if (!r.ok && o.testo) r = window.MultaLettura.leggiTesto(o.testo);
      conclusione(r);
    }).catch(function (e) {
      messaggio(esito, (e && e.message) || 'Riconoscimento non riuscito: inserisci i dati a mano.', 'errore');
    });
  }

  function leggiFile(file) {
    if (!file) return;
    if (!window.MultaLettura) return;

    var pdf = /\.pdf$/i.test(file.name || '') || file.type === 'application/pdf';
    if (!pdf) return conOcr(file);

    messaggio(esito, 'Lettura del PDF in corso…', 'info');
    caricaPdfJs().then(function (lib) {
      if (!lib) { messaggio(esito, 'Non è stato possibile caricare il lettore PDF.', 'errore'); return null; }
      return file.arrayBuffer().then(function (d) {
        return window.MultaLettura.leggiPdf(new Uint8Array(d), lib);
      });
    }).then(function (r) {
      if (!r) return;
      // Un verbale scansionato non ha testo: si passa all'OCR invece di dire
      // che il file e' vuoto.
      if (r.serveOcr) return conOcr(file);
      conclusione(r);
    }).catch(function () {
      messaggio(esito, 'Il file non è un PDF leggibile: inserisci i dati a mano.', 'errore');
    });
  }

  if (input) {
    input.addEventListener('change', function (e) { leggiFile(e.target.files && e.target.files[0]); });
    var zona = input.closest('label');
    if (zona) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('border-indigo-500'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.remove('border-indigo-500'); });
      });
      zona.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files) leggiFile(e.dataTransfer.files[0]);
      });
    }
  }

  // ----------------------------------------------------------- risultato

  var COLORE = { aperto: 'border-emerald-300', scaduto: 'border-red-300', indeterminato: 'border-gray-200' };

  function trovaTermine(a, id) {
    return (a.termini || []).filter(function (t) { return t.id === id; })[0] || null;
  }

  function schedaTermine(t) {
    var quando = t.scadenza ? dataIt(t.scadenza) : '&mdash;';
    var sotto;
    if (t.stato === 'indeterminato') sotto = esc(t.perche || 'Dato mancante.');
    else if (t.giorniResidui === null) sotto = 'scadenza calcolata';
    else if (t.giorniResidui < 0) sotto = 'scaduto da ' + Math.abs(t.giorniResidui) + ' giorni';
    else if (t.giorniResidui === 0) sotto = 'scade oggi';
    else sotto = 'mancano ' + t.giorniResidui + ' giorni';

    return '<div class="rounded-xl border-2 ' + (COLORE[t.stato] || COLORE.indeterminato) + ' bg-white p-4">' +
           '<p class="text-xs uppercase tracking-wide text-gray-500">' + esc(t.etichetta) + '</p>' +
           '<p class="text-xl font-bold text-gray-900 mt-1">' + quando + '</p>' +
           '<p class="text-xs text-gray-600 mt-1">' + sotto + '</p>' +
           '<p class="text-[11px] text-gray-400 mt-1">' + esc(t.riferimento || '') + '</p></div>';
  }

  function bloccoNotifica(n) {
    if (n.esito === 'non_applicabile') return '';
    if (!n.verificabile) {
      return '<div class="mt-6 rounded-xl border border-gray-200 bg-white p-5">' +
             '<h3 class="font-bold text-gray-900 mb-1">Termine per la notifica</h3>' +
             '<p class="text-sm text-gray-600">' + esc(n.perche || 'Non verificabile con i dati inseriti.') + '</p></div>';
    }
    var tardiva = n.esito === 'oltre_il_termine';
    return '<div class="mt-6 rounded-xl border-2 ' + (tardiva ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-white') + ' p-5">' +
           '<h3 class="font-bold text-gray-900 mb-1">Termine per la notifica</h3>' +
           '<p class="text-sm text-gray-800">Dall’accertamento alla notifica sono passati <strong>' +
           n.giorniTrascorsi + ' giorni</strong>. L’' + esc(n.riferimento) + ' ne prevede ' + n.limite + '.</p>' +
           (tardiva
             ? '<p class="text-sm text-amber-900 mt-2">Il termine risulta superato. &Egrave; <strong>uno</strong> dei motivi ' +
               'che si possono far valere davanti al Prefetto o al Giudice di Pace: la decisione spetta a loro, ' +
               'e questo strumento non valuta gli altri aspetti del tuo caso.</p>'
             : '<p class="text-sm text-gray-600 mt-2">La notifica risulta nei termini.</p>') +
           '</div>';
  }

  function bloccoSconto(r, termine) {
    if (r.applicabile === true) {
      // Un importo esatto per un'opzione scaduta e' un numero che invita a
      // sbagliare: chi paga la cifra ridotta fuori termine versa meno del dovuto
      // e la multa resta aperta. L'importo si mostra lo stesso, perche' serve a
      // capire cosa si e' perso, ma non come cifra da versare.
      var scaduto = termine && termine.stato === 'scaduto';
      if (scaduto) {
        return '<div class="mt-6 rounded-xl border border-gray-300 bg-gray-50 p-5">' +
               '<h3 class="font-bold text-gray-900 mb-1">Pagamento ridotto del 30%: termine scaduto</h3>' +
               '<p class="text-sm text-gray-700">I cinque giorni sono passati il <strong>' +
               dataIt(termine.scadenza) + '</strong>. La riduzione sarebbe stata di ' +
               euro(r.importoTotale) + ' invece dell’importo pieno: adesso non è più applicabile, ' +
               'e versare quella cifra sarebbe un pagamento incompleto.</p>' +
               '<p class="text-[11px] text-gray-400 mt-2">' + esc(r.riferimento) + '</p></div>';
      }
      return '<div class="mt-6 rounded-xl border border-gray-200 bg-white p-5">' +
             '<h3 class="font-bold text-gray-900 mb-2">Pagamento ridotto del 30%</h3>' +
             '<ul class="text-sm text-gray-800 space-y-1">' +
             '<li class="flex justify-between"><span>Sanzione ridotta</span><span class="font-semibold">' + euro(r.importoSanzioneRidotta) + '</span></li>' +
             '<li class="flex justify-between"><span>Spese di notifica <span class="text-gray-500">(non si riducono)</span></span><span>' + euro(r.spese) + '</span></li>' +
             '<li class="flex justify-between border-t border-gray-100 pt-1 mt-1"><span class="font-semibold">Totale da versare</span>' +
             '<span class="font-bold text-gray-900">' + euro(r.importoTotale) + '</span></li></ul>' +
             '<p class="text-[11px] text-gray-400 mt-2">' + esc(r.riferimento) + '</p></div>';
    }
    var ambra = r.applicabile === 'indeterminata';
    return '<div class="mt-6 rounded-xl border-2 ' + (ambra ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white') + ' p-5">' +
           '<h3 class="font-bold text-gray-900 mb-1">Pagamento ridotto del 30%</h3>' +
           '<p class="text-sm ' + (ambra ? 'text-amber-900' : 'text-gray-700') + '">' + esc(r.motivo || '') + '</p>' +
           '<p class="text-[11px] text-gray-400 mt-2">' + esc(r.riferimento) + '</p></div>';
  }

  function disegna(a) {
    var schede = a.termini.map(schedaTermine).join('');

    var daChiarire = a.daChiarire.length
      ? '<div class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">' +
        '<h3 class="font-bold text-amber-900 mb-2">Da chiarire</h3><ul class="space-y-2">' +
        a.daChiarire.map(function (d) {
          return '<li class="text-sm text-amber-900">' + esc(d.perche) +
                 (d.doveTrovarlo ? '<span class="block text-xs text-amber-800 mt-0.5">' + esc(d.doveTrovarlo) + '</span>' : '') +
                 '</li>';
        }).join('') + '</ul></div>'
      : '';

    var assunzioni = (a.avvertenze || []).length
      ? '<div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5">' +
        '<h3 class="font-bold text-amber-900 mb-2">Su cosa poggia questo calcolo</h3><ul class="space-y-2">' +
        a.avvertenze.map(function (v) {
          return '<li class="text-sm text-amber-900">' + esc(v.testo) +
                 '<span class="block text-[11px] text-amber-700 mt-0.5">' + esc(v.riferimento) + '</span></li>';
        }).join('') + '</ul></div>'
      : '';

    var avvisi = '<div class="mt-6 rounded-xl border-l-4 border-red-500 bg-red-50 p-5">' +
      '<h3 class="font-bold text-red-900 mb-1">Pagare e ricorrere sono alternativi</h3>' +
      '<p class="text-sm text-red-900">' + esc((a.acquiescenza && a.acquiescenza.nota) || '') +
      '</p><p class="text-[11px] text-red-700 mt-1">' + esc((a.acquiescenza && a.acquiescenza.riferimento) || '') + '</p></div>';

    var inerzia = a.inerzia
      ? '<div class="mt-4 rounded-xl border border-gray-200 bg-white p-5">' +
        '<h3 class="font-bold text-gray-900 mb-1">Se non fai niente</h3>' +
        '<p class="text-sm text-gray-700">' + esc(a.inerzia.nota) + '</p>' +
        '<p class="text-[11px] text-gray-400 mt-1">' + esc(a.inerzia.riferimento) + '</p></div>'
      : '';

    var prescrizione = a.prescrizione
      ? '<p class="mt-4 text-xs text-gray-500">Prescrizione: ' + dataIt(a.prescrizione.scadenza) +
        ' (' + a.prescrizione.anni + ' anni, ' + esc(a.prescrizione.riferimento) + ').</p>'
      : '';

    risultato.innerHTML =
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' + schede + '</div>' +
      bloccoSconto(a.riduzione30, trovaTermine(a, 'sconto30')) + assunzioni + bloccoNotifica(a.notifica) +
      daChiarire + avvisi + inerzia + prescrizione;
    risultato.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ------------------------------------------------------------- calcolo

  function triStato(select) {
    if (!select || select.value === '') return null;
    return select.value === 'si';
  }

  function valore(el) {
    return el && String(el.value).trim() ? el.value : null;
  }

  function oggiLocale() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  bottone.addEventListener('click', function () {
    if (!window.MultaTermini) return;
    var immediata = !!(campo.immediata && campo.immediata.checked);
    var violazione = valore(campo.violazione);
    var notifica = valore(campo.notifica);

    // Conferma esplicita solo per i campi che l'utente ha davanti e ha
    // compilato: e' il modulo stesso il passaggio di verifica.
    var confermato = {
      dataAccertamento: !!violazione,
      dataNotifica: !!notifica,
      dataContestazione: immediata && !!violazione
    };

    var dati = {
      contestazioneImmediata: immediata,
      dataAccertamento: violazione,
      dataContestazione: immediata ? violazione : null,
      dataNotifica: notifica,
      importoSanzione: valore(campo.sanzione),
      spese: valore(campo.spese),
      residenzaEstero: !!(campo.estero && campo.estero.checked),
      sanzioniAccessorie: {
        sospensionePatente: triStato(campo.sospensione),
        confiscaVeicolo: triStato(campo.confisca),
        // L'elenco dell'art. 202 comma 3-bis non e' riprodotto nei dati: resta
        // dichiarato come punto da verificare invece di essere dato per assente.
        esclusa3bis: null
      },
      oggi: oggiLocale(),
      confermato: confermato
    };

    if (!violazione && !notifica) {
      messaggio(esitoCalcolo, 'Serve almeno una data per calcolare qualcosa.', 'errore');
      return;
    }
    messaggio(esitoCalcolo, '', 'info');
    disegna(window.MultaTermini.analizza(dati, regole));
  });

  if (window.StrumentiData) {
    window.StrumentiData.getRegoleFiscali().then(function (d) {
      if (d && d.codice_strada_verbali) regole = d.codice_strada_verbali;
    });
  }
})();
