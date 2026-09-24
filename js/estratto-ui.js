// js/estratto-ui.js — Interfaccia dell'analisi dell'estratto conto INPS.
// Il conteggio sta in js/estratto-contributivo.js, la lettura del file in
// js/estratto-import.js. Qui si tiene insieme il flusso: carica, verifica,
// analizza.
(function () {
  'use strict';

  var input = document.getElementById('file-xml');
  var esito = document.getElementById('esito-file');
  var sezioneVerifica = document.getElementById('sezione-verifica');
  var anteprima = document.getElementById('anteprima');
  var risultato = document.getElementById('risultato');
  var manuale = document.getElementById('manuale');
  var bottoneManuale = document.getElementById('usa-manuale');
  var sesso = document.getElementById('sesso');
  var sessoDalFile = document.getElementById('sesso-dal-file');
  var avvertenze = document.getElementById('avvertenze-inps');
  var avvertenzeTesto = document.getElementById('avvertenze-testo');
  if (!input || !risultato) return;

  var pensioni = null;
  var ultimiPeriodi = null;      // per rifare l'analisi se cambia il sesso

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function dataIt(d) {
    if (!(d instanceof Date)) return '';
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function messaggio(testo, tipo) {
    var colore = tipo === 'errore' ? 'text-red-600' : (tipo === 'ok' ? 'text-emerald-700' : 'text-gray-600');
    esito.className = 'mt-3 text-sm ' + colore;
    esito.textContent = testo;
  }

  // --------------------------------------------------- anteprima e verifica

  // Nella tabella di verifica le date vanno scritte come sul documento
  // dell'INPS, cioe' 16/09/2024: e' una tabella che si legge confrontandola.
  function dataItDaTesto(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return String(iso || '');
    return (m[3] ? m[3] + '/' : '') + m[2] + '/' + m[1];
  }

  // Le settimane possono mancare perche' il file le dichiara in un'altra unita'
  // di misura: si scrive quello che c'era scritto, invece di una cella vuota.
  function cellaSettimane(p) {
    if (p.settimane != null) return esc(p.settimane);
    if (p.dichiarato != null && p.unita) {
      return '<span class="text-amber-800">' + esc(p.dichiarato) + ' ' + esc(String(p.unita).toLowerCase()) + '</span>';
    }
    return '&mdash;';
  }

  function mostraAnteprima(periodi) {
    // Il datore e' quello che permette di riconoscere un periodo a occhio, ma
    // non tutti i tracciati lo hanno: la colonna appare solo se c'e' qualcosa.
    var conDatore = periodi.some(function (p) { return p.datore; });

    var righe = periodi.slice(0, 200).map(function (p) {
      return '<tr class="border-b border-gray-100 last:border-0">' +
             '<td class="py-1.5 pr-3 font-mono text-xs">' + esc(dataItDaTesto(p.dal)) + '</td>' +
             '<td class="py-1.5 pr-3 font-mono text-xs">' + esc(dataItDaTesto(p.al)) + '</td>' +
             '<td class="py-1.5 pr-3 text-xs text-right">' + cellaSettimane(p) + '</td>' +
             '<td class="py-1.5 pr-3 text-xs text-gray-600">' + esc(p.gestione || '') +
             (p.tipo ? '<span class="block text-gray-400">' + esc(p.tipo) + '</span>' : '') + '</td>' +
             (conDatore ? '<td class="py-1.5 text-xs text-gray-600">' + esc(p.datore || '') + '</td>' : '') +
             '</tr>';
    }).join('');

    anteprima.innerHTML =
      '<table class="w-full text-sm"><caption class="sr-only">Periodi letti dal file</caption>' +
      '<thead><tr class="text-left text-xs uppercase tracking-wide text-gray-500">' +
      '<th scope="col" class="pb-2 pr-3">Dal</th><th scope="col" class="pb-2 pr-3">Al</th>' +
      '<th scope="col" class="pb-2 pr-3 text-right">Settimane</th><th scope="col" class="pb-2 pr-3">Gestione</th>' +
      (conDatore ? '<th scope="col" class="pb-2">Datore</th>' : '') +
      '</tr></thead><tbody>' + righe + '</tbody></table>' +
      (periodi.length > 200 ? '<p class="text-xs text-gray-500 mt-2">Mostrati i primi 200 di ' + periodi.length + '.</p>' : '');

    // Un'unita' diversa dalle settimane non si converte a occhio: si dichiara.
    var altraUnita = periodi.filter(function (p) { return p.settimane == null && p.unita; });
    if (altraUnita.length) {
      anteprima.innerHTML +=
        '<p class="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">' +
        altraUnita.length + ' periodi sono espressi in <strong>' + esc(String(altraUnita[0].unita).toLowerCase()) +
        '</strong>, non in settimane. La conversione non &egrave; uniforme (per i lavoratori agricoli una settimana ' +
        'non sono sette giornate), quindi non la si inventa: per quei periodi le settimane sono ricavate dalle date. ' +
        'Verificale sul tuo estratto.</p>';
    }

    sezioneVerifica.hidden = false;
  }

  // --------------------------------------------------------------- risultato

  function scheda(titolo, valore, nota, colore) {
    return '<div class="rounded-xl border-2 ' + (colore || 'border-gray-200') + ' bg-white p-5">' +
           '<p class="text-xs uppercase tracking-wide text-gray-500">' + esc(titolo) + '</p>' +
           '<p class="text-2xl font-bold text-gray-900 mt-1">' + valore + '</p>' +
           (nota ? '<p class="text-xs text-gray-600 mt-1">' + nota + '</p>' : '') + '</div>';
  }

  function disegna(a) {
    if (!a.periodi.length) {
      risultato.innerHTML = '<p class="text-sm text-gray-600">Nessun periodo valido da analizzare.</p>';
      return;
    }

    var anz = a.anzianita;
    var testa =
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">' +
      scheda('Anzianità contributiva', anz.anni + ' anni' + (anz.settimane ? ' e ' + anz.settimane + ' sett.' : ''),
             anz.totale + ' settimane valide', 'border-indigo-300') +
      scheda('Periodo coperto', a.primoAnno + '&ndash;' + a.ultimoAnno, a.periodi.length + ' periodi') +
      scheda('Intervalli scoperti', String(a.buchi.length),
             a.buchi.length ? 'da verificare' : 'nessuno rilevato',
             a.buchi.length ? 'border-amber-300' : 'border-emerald-300') +
      '</div>';

    // Settimane scartate per il tetto annuo: spiegano perche' il totale e'
    // piu' basso della somma dei periodi.
    var tetto = a.settimaneEccedenti > 0
      ? '<p class="mt-4 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">' +
        'La somma dei periodi d&agrave; ' + a.settimaneGrezze + ' settimane, ma ai fini pensionistici un anno vale ' +
        'al massimo 52: ' + a.settimaneEccedenti + ' settimane non aumentano l&rsquo;anzianit&agrave;. ' +
        'Succede quando si versa in pi&ugrave; gestioni nello stesso anno.</p>'
      : '';

    var buchi = a.buchi.length
      ? '<div class="mt-6 bg-white rounded-xl border border-gray-200 p-5">' +
        '<h3 class="font-bold text-gray-900 mb-1">Periodi senza contributi</h3>' +
        '<p class="text-xs text-gray-600 mb-3">Non sono per forza errori. Ma se in uno di questi periodi hai ' +
        'lavorato, chiedi all&rsquo;INPS la variazione della posizione assicurativa.</p>' +
        '<ul class="divide-y divide-gray-100">' +
        a.buchi.map(function (b) {
          return '<li class="flex justify-between gap-3 py-2 text-sm">' +
                 '<span class="text-gray-800">' + dataIt(b.dal) + ' &ndash; ' + dataIt(b.al) + '</span>' +
                 '<span class="text-gray-500">' + b.settimaneMancate + ' settimane</span></li>';
        }).join('') + '</ul></div>'
      : '';

    var requisiti = a.requisiti.length
      ? '<div class="mt-6 bg-white rounded-xl border border-gray-200 p-5">' +
        '<h3 class="font-bold text-gray-900 mb-3">Quanto manca</h3>' +
        a.requisiti.map(function (q) {
          var perc = Math.min(100, Math.round(100 * (q.settimaneNecessarie - q.settimaneMancanti) / q.settimaneNecessarie));
          return '<div class="mb-4 last:mb-0">' +
                 '<div class="flex justify-between gap-3 text-sm">' +
                 '<span class="font-medium text-gray-900">' + esc(q.nome) + '</span>' +
                 '<span class="' + (q.raggiunto ? 'text-emerald-700 font-semibold' : 'text-gray-600') + '">' +
                 (q.raggiunto ? 'requisito contributivo raggiunto'
                              : 'mancano ' + q.settimaneMancanti + ' settimane (' + (q.settimaneMancanti / 52).toFixed(1) + ' anni)') +
                 '</span></div>' +
                 '<div class="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">' +
                 '<div class="h-full ' + (q.raggiunto ? 'bg-emerald-500' : 'bg-indigo-500') + '" style="width:' + perc + '%"></div></div>' +
                 '<p class="text-xs text-gray-500 mt-1">' + esc(q.dettaglio) + '</p></div>';
        }).join('') +
        '<p class="text-xs text-gray-500 border-t border-gray-100 pt-3 mt-1">Qui si valuta solo il requisito ' +
        'contributivo. L&rsquo;et&agrave; anagrafica dipende dalla data di nascita e non si ricava dall&rsquo;estratto conto.</p>' +
        '</div>'
      : '';

    var gestioni = Object.keys(a.gestioni).length > 1
      ? '<div class="mt-6 bg-white rounded-xl border border-gray-200 p-5">' +
        '<h3 class="font-bold text-gray-900 mb-3">Per gestione</h3><ul class="divide-y divide-gray-100">' +
        Object.keys(a.gestioni).map(function (g) {
          return '<li class="flex justify-between gap-3 py-2 text-sm">' +
                 '<span class="text-gray-800">' + esc(g) + '</span>' +
                 '<span class="text-gray-500">' + a.gestioni[g] + ' settimane</span></li>';
        }).join('') + '</ul></div>'
      : '';

    var scartati = a.scartati.length
      ? '<p class="mt-4 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">' +
        a.scartati.length + ' righe sono state scartate perch&eacute; non leggibili: ' +
        esc(a.scartati.map(function (s) { return s.motivo; }).join('; ')) + '.</p>'
      : '';

    risultato.innerHTML = testa + tetto + buchi + requisiti + gestioni + scartati;
    risultato.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function analizza(periodi) {
    if (!window.EstrattoContributivo) return;
    ultimiPeriodi = periodi;
    mostraAnteprima(periodi);
    // Il sesso era cablato a 'M': per una donna il requisito dell'anticipata
    // usciva sbagliato di un anno, e niente lo segnalava.
    disegna(window.EstrattoContributivo.analizza(periodi, {
      pensioni: pensioni,
      sesso: sesso && sesso.value === 'F' ? 'F' : 'M'
    }));
  }

  if (sesso) {
    sesso.addEventListener('change', function () {
      if (ultimiPeriodi) analizza(ultimiPeriodi);
    });
  }

  // Le avvertenze si riportano come le scrive l'INPS: e' l'istituto a dire che
  // l'estratto non ha valore certificativo, e detto da lui pesa di piu'.
  function mostraAvvertenze(elenco) {
    if (!avvertenze || !avvertenzeTesto) return;
    if (!elenco || !elenco.length) { avvertenze.hidden = true; return; }
    avvertenzeTesto.innerHTML = elenco.map(function (a) { return '<p>' + esc(a) + '</p>'; }).join('');
    avvertenze.hidden = false;
  }

  // ------------------------------------------------------------- ingresso

  function esitoLettura(r) {
    if (!r.ok) {
      messaggio(r.motivo, 'errore');
      sezioneVerifica.hidden = true;
      risultato.innerHTML = '';
      return;
    }
    // Il tracciato dell'INPS contiene il sesso: si usa quello invece di
    // chiederlo, e si dice all'utente da dove viene.
    if (r.anagrafica && r.anagrafica.sesso && sesso) {
      sesso.value = r.anagrafica.sesso;
      if (sessoDalFile) sessoDalFile.hidden = false;
    } else if (sessoDalFile) {
      sessoDalFile.hidden = true;
    }
    mostraAvvertenze(r.avvertenze);

    messaggio('Letti ' + r.periodi.length + ' periodi dal file. Controllali qui sotto prima di fidarti dei numeri.', 'ok');
    analizza(r.periodi);
  }

  function leggiFile(file) {
    if (!file) return;
    var lettore = new FileReader();
    lettore.onerror = function () { messaggio('Non è stato possibile leggere il file.', 'errore'); };

    // Il PDF e la via piu battuta: il pulsante XML sta in fondo alla pagina
    // del servizio INPS e molti non lo trovano.
    var pdf = /.pdf$/i.test(file.name) || file.type === 'application/pdf';

    if (pdf) {
      messaggio('Lettura del PDF in corso…', 'info');
      lettore.onload = function () {
        caricaPdfJs().then(function (lib) {
          if (!lib) { messaggio('Non è stato possibile caricare il lettore PDF.', 'errore'); return; }
          window.EstrattoImport.leggiPdf(new Uint8Array(lettore.result), lib).then(esitoLettura);
        });
      };
      lettore.readAsArrayBuffer(file);
      return;
    }

    messaggio('Lettura in corso…', 'info');
    lettore.onload = function () { esitoLettura(window.EstrattoImport.leggiXml(String(lettore.result))); };
    lettore.readAsText(file);
  }

  // pdf.js si scarica solo quando serve davvero: chi usa l XML non paga
  // il peso della libreria.
  var promessaPdfJs = null;
  function caricaPdfJs() {
    if (typeof pdfjsLib !== 'undefined') return Promise.resolve(pdfjsLib);
    if (promessaPdfJs) return promessaPdfJs;

    promessaPdfJs = new Promise(function (risolvi) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.integrity = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = function () {
        if (typeof pdfjsLib !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          risolvi(pdfjsLib);
        } else risolvi(null);
      };
      s.onerror = function () { risolvi(null); };
      document.head.appendChild(s);
    });
    return promessaPdfJs;
  }

  input.addEventListener('change', function (e) { leggiFile(e.target.files && e.target.files[0]); });

  // trascinamento sul riquadro
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

  // Inserimento manuale: dal;al;settimane;gestione
  if (bottoneManuale && manuale) {
    bottoneManuale.addEventListener('click', function () {
      var periodi = manuale.value.split('\n').map(function (r) { return r.trim(); }).filter(Boolean).map(function (r) {
        var c = r.split(';').map(function (x) { return x.trim(); });
        return { dal: c[0], al: c[1], settimane: c[2] ? Number(c[2].replace(',', '.')) : undefined, gestione: c[3] || undefined };
      });
      if (!periodi.length) { messaggio('Inserisci almeno un periodo.', 'errore'); return; }
      messaggio('Analizzo ' + periodi.length + ' periodi inseriti a mano.', 'ok');
      analizza(periodi);
    });
  }

  window.StrumentiData.getRegoleFiscali().then(function (d) {
    if (d && d.pensioni) pensioni = d.pensioni;
  });
})();
