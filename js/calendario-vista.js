// js/calendario-vista.js — Il calendario in HTML: i dodici mesi, l'elenco delle
// feste, i ponti e le ricorrenze.
//
// Lo stesso codice scrive la pagina statica (scripts/genera-calendario.js, per
// chi arriva da Google e per chi non ha JavaScript) e la aggiorna nel browser
// quando si cambia anno o patrono: le due versioni non possono divergere.
//
// Funziona nel browser (window.CalendarioVista) e in Node. Restituisce
// stringhe HTML; ogni testo che arriva da fuori (il nome del patrono scritto
// a mano) passa da esc().
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CalendarioVista = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  var INIZIALI = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

  // I patroni dei capoluoghi piu' grandi. Per gli altri comuni si sceglie
  // giorno e mese a mano. Sono date che non cambiano.
  var PATRONI = [
    { citta: 'Ancona', md: '05-04', santo: 'San Ciriaco' },
    { citta: 'Bari', md: '12-06', santo: 'San Nicola' },
    { citta: 'Bergamo', md: '08-26', santo: 'Sant’Alessandro' },
    { citta: 'Bologna', md: '10-04', santo: 'San Petronio' },
    { citta: 'Brescia', md: '02-15', santo: 'Santi Faustino e Giovita' },
    { citta: 'Cagliari', md: '10-30', santo: 'San Saturnino' },
    { citta: 'Catania', md: '02-05', santo: 'Sant’Agata' },
    { citta: 'Firenze', md: '06-24', santo: 'San Giovanni Battista' },
    { citta: 'Genova', md: '06-24', santo: 'San Giovanni Battista' },
    { citta: 'Lecce', md: '08-26', santo: 'Sant’Oronzo' },
    { citta: 'Messina', md: '06-03', santo: 'Madonna della Lettera' },
    { citta: 'Milano', md: '12-07', santo: 'Sant’Ambrogio' },
    { citta: 'Modena', md: '01-31', santo: 'San Geminiano' },
    { citta: 'Monza', md: '06-24', santo: 'San Giovanni Battista' },
    { citta: 'Napoli', md: '09-19', santo: 'San Gennaro' },
    { citta: 'Padova', md: '06-13', santo: 'Sant’Antonio' },
    { citta: 'Palermo', md: '07-15', santo: 'Santa Rosalia' },
    { citta: 'Parma', md: '01-13', santo: 'Sant’Ilario' },
    { citta: 'Perugia', md: '01-29', santo: 'San Costanzo' },
    { citta: 'Pisa', md: '06-17', santo: 'San Ranieri' },
    { citta: 'Reggio Calabria', md: '04-23', santo: 'San Giorgio' },
    { citta: 'Rimini', md: '10-14', santo: 'San Gaudenzo' },
    { citta: 'Roma', md: '06-29', santo: 'Santi Pietro e Paolo' },
    { citta: 'Salerno', md: '09-21', santo: 'San Matteo' },
    { citta: 'Siracusa', md: '12-13', santo: 'Santa Lucia' },
    { citta: 'Torino', md: '06-24', santo: 'San Giovanni Battista' },
    { citta: 'Trento', md: '06-26', santo: 'San Vigilio' },
    { citta: 'Trieste', md: '11-03', santo: 'San Giusto' },
    { citta: 'Venezia', md: '04-25', santo: 'San Marco' },
    { citta: 'Verona', md: '05-21', santo: 'San Zeno' }
  ];

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // "4 ottobre", "1° novembre": il primo del mese si scrive con l'ordinale.
  function giornoMese(F, iso) {
    var g = Number(iso.slice(8));
    return (g === 1 ? '1°' : String(g)) + ' ' + F.NOMI_MESI[Number(iso.slice(5, 7)) - 1].toLowerCase();
  }

  function giornoSettimana(F, iso) { return GIORNI[F.giornoSettimana(iso)]; }

  // "lunedì 4 ottobre"
  function dataLunga(F, iso) { return giornoSettimana(F, iso) + ' ' + giornoMese(F, iso); }

  function nazionale(feste) {
    return feste.some(function (f) { return f.tipo === 'nazionale'; });
  }

  /** Un mese come tabella: festivi in rosso con il nome nel title, oggi cerchiato. */
  function mese(F, anno, m, mappa, oggi) {
    var righe = F.grigliaMese(anno, m).map(function (r) {
      return '<tr>' + r.giorni.map(function (d, i) {
        if (!d) return '<td></td>';
        var feste = mappa[d];
        var classi = 'py-0.5';
        if (feste && nazionale(feste)) classi += ' text-red-700 font-bold';
        else if (feste) classi += ' text-orange-700 font-bold';
        else if (i === 6) classi += ' text-red-700';
        var numero = String(Number(d.slice(8)));
        if (d === oggi) numero = '<span class="inline-block w-5 leading-5 sm:w-6 sm:leading-6 rounded-full ring-2 ring-indigo-500">' + numero + '</span>';
        var titolo = feste ? ' title="' + esc(feste.map(function (f) { return f.nome; }).join(', ')) + '"' : '';
        var sr = feste ? '<span class="sr-only">, ' + esc(feste.map(function (f) { return f.nome; }).join(', ')) + '</span>' : '';
        return '<td class="' + classi + '"' + titolo + (d === oggi ? ' aria-current="date"' : '') + '>' + numero + sr + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var testa = INIZIALI.map(function (g, i) {
      return '<th scope="col" class="font-semibold pb-1' + (i === 6 ? ' text-red-700' : ' text-gray-500') + '"><abbr title="' + GIORNI[i] + '" class="no-underline">' + g + '</abbr></th>';
    }).join('');
    return '<table class="w-full text-center text-xs sm:text-sm tabular-nums">' +
      '<caption class="text-left font-bold text-indigo-700 mb-1">' + F.NOMI_MESI[m - 1] + ' ' + anno + '</caption>' +
      '<thead><tr>' + testa + '</tr></thead><tbody>' + righe + '</tbody></table>';
  }

  /**
   * I dodici mesi in griglia.
   * @param {object} o { patrono: { md, nome }, oggi: 'AAAA-MM-GG' }
   */
  function anno(F, a, o) {
    var opz = o || {};
    var mappa = F.mappaFestivita(a, opz.patrono);
    var mesi = [];
    for (var m = 1; m <= 12; m++) {
      mesi.push('<div class="rounded-lg border border-gray-100 p-2 sm:p-3">' + mese(F, a, m, mappa, opz.oggi) + '</div>');
    }
    // Due colonne gia' sul telefono: dodici mesi uno sotto l'altro sono
    // tre schermate di scorrimento.
    return '<div class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3">' + mesi.join('') + '</div>';
  }

  /** L'elenco delle feste dell'anno, con il giorno della settimana. */
  function festivita(F, a, patrono) {
    var righe = F.festivita(a, patrono).map(function (f) {
      var weekend = F.giornoSettimana(f.data) >= 5;
      return '<tr class="border-t border-gray-100">' +
        '<td class="py-2 pr-3 whitespace-nowrap font-semibold text-gray-900">' + giornoMese(F, f.data) + '</td>' +
        '<td class="py-2 pr-3 whitespace-nowrap ' + (weekend ? 'text-gray-500' : 'text-gray-900') + '">' + giornoSettimana(F, f.data) + '</td>' +
        '<td class="py-2 ' + (f.tipo === 'patrono' ? 'text-orange-700' : 'text-gray-700') + '">' + esc(f.nome) +
        (f.tipo === 'patrono' ? ' <span class="text-xs text-gray-500">(patrono)</span>' : '') + '</td></tr>';
    }).join('');
    return '<table class="w-full text-sm text-left">' +
      '<thead><tr class="text-xs uppercase tracking-wide text-gray-500"><th scope="col" class="pb-2 pr-3">Data</th><th scope="col" class="pb-2 pr-3">Giorno</th><th scope="col" class="pb-2">Festività</th></tr></thead>' +
      '<tbody>' + righe + '</tbody></table>';
  }

  function stessoMese(a, b) { return a.slice(0, 7) === b.slice(0, 7); }

  // "lunedì 4 e martedì 5 gennaio", "lunedì 31 maggio e martedì 1° giugno"
  function elenco(F, date) {
    if (date.length === 1) return dataLunga(F, date[0]);
    var primo = stessoMese(date[0], date[1])
      ? giornoSettimana(F, date[0]) + ' ' + giornoMese(F, date[0]).split(' ')[0]
      : dataLunga(F, date[0]);
    return primo + ' e ' + dataLunga(F, date[1]);
  }

  // "dal 27 al 29 marzo", "dal 29 maggio al 2 giugno", "dall'8 al 12 dicembre"
  function preposizione(p, testo) {
    return /^(8|11)\b/.test(testo) ? p + 'll\u2019' + testo : p + 'l ' + testo;
  }
  function periodo(F, dal, al) {
    var inizio = stessoMese(dal, al) ? giornoMese(F, dal).split(' ')[0] : giornoMese(F, dal);
    return preposizione('da', inizio) + ' ' + preposizione('a', giornoMese(F, al));
  }

  function giorniDiFila(n) {
    return '<span class="text-emerald-700 font-semibold">' + n + ' giorni di fila</span>';
  }

  /** Come cadono le feste: weekend lunghi, ponti, feste perse nel fine settimana. */
  function ponti(F, a, patrono) {
    var voci = F.ponti(a, patrono).map(function (p) {
      var testa = '<strong class="text-gray-900">' + esc(p.festa.nome) + '</strong>, ' + dataLunga(F, p.festa.data) + ': ';
      if (p.tipo === 'nel-weekend') return '<li>' + testa + 'cade nel fine settimana, nessun giorno libero in più.</li>';
      if (p.tipo === 'festa') return '<li>' + testa + 'un giorno libero in mezzo alla settimana.</li>';
      if (p.tipo === 'weekend-lungo') {
        return '<li>' + testa + giorniDiFila(p.giorniLiberi) + ' senza usare ferie, ' + periodo(F, p.dal, p.al) + '.</li>';
      }
      var prima = p.senzaFerie >= 3 ? 'weekend lungo di ' + p.senzaFerie + ' giorni; ' : '';
      var ferie = p.ferie === 1 ? '1 giorno di ferie' : p.ferie + ' giorni di ferie';
      var altro = p.altro ? '; oppure ' + periodo(F, p.altro.dal, p.altro.al) + ' con ' + elenco(F, p.altro.ponte) : '';
      return '<li>' + testa + prima + 'con ' + ferie + ' (' + elenco(F, p.ponte) + ') ' + giorniDiFila(p.giorniLiberi) +
        ', ' + periodo(F, p.dal, p.al) + altro + '.</li>';
    }).join('');
    return '<ul class="space-y-2 text-sm text-gray-700 leading-relaxed">' + voci + '</ul>';
  }

  /** Le date che non sono festivi ma che si cercano: carnevale, ora legale... */
  function ricorrenze(F, a) {
    var voci = F.ricorrenze(a).map(function (r) {
      return '<li class="flex justify-between gap-3 border-t border-gray-100 py-2"><span class="text-gray-700">' + esc(r.nome) +
        '</span><span class="whitespace-nowrap font-semibold text-gray-900">' + dataLunga(F, r.data) + '</span></li>';
    }).join('');
    return '<ul class="text-sm">' + voci + '</ul>';
  }

  /** I numeri dell'anno, per le frasi della pagina. */
  function riepilogo(F, a) {
    var feste = F.festivita(a).filter(function (f) { return f.nome !== 'Pasqua'; });
    var feriali = feste.filter(function (f) { return F.giornoSettimana(f.data) < 5; });
    var conto = F.contaGiorni(a + '-01-01', a + '-12-31', { escludiWeekend: true, escludiFestivi: true });
    var p = F.ponti(a);
    return {
      festivita: feste.length,
      infrasettimanali: feriali.length,
      nelWeekend: feste.length - feriali.length,
      lavorativi: conto.lavorativi,
      weekendLunghi: p.filter(function (x) { return x.tipo === 'weekend-lungo'; }).length,
      ponti: p.filter(function (x) { return x.tipo === 'ponte' || x.tipo === 'ponte-lungo'; }).length,
      pasqua: F.pasqua(a)
    };
  }

  return {
    PATRONI: PATRONI, esc: esc, giornoMese: giornoMese, dataLunga: dataLunga,
    mese: mese, anno: anno, festivita: festivita, ponti: ponti, ricorrenze: ricorrenze, riepilogo: riepilogo
  };
});
