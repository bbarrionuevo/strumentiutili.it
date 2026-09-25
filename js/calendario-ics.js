// js/calendario-ics.js — Scadenze nel calendario del telefono, senza server.
//
// Un file .ics (RFC 5545) si genera nel browser e si apre con il calendario di
// iPhone, Outlook, Samsung e con la maggior parte delle app. E' anche l'unico
// modo che un sito senza server ha per "ricordarsi" di qualcuno: il giorno
// della scadenza l'evento compare, e nella descrizione c'e' il link per
// tornare allo strumento. Per Google Calendar, che dal telefono non importa
// i file .ics, c'e' il link al modulo di creazione evento.
//
// Tre regole che rendono il file valido ovunque:
//   1. Righe terminate da CRLF, lunghe al massimo 75 byte (non caratteri):
//      le piu' lunghe si piegano con CRLF + spazio, senza spezzare una lettera
//      accentata a meta'.
//   2. Nei testi \ ; , e gli a capo vanno protetti con la barra rovescia.
//   3. Le scadenze sono eventi "di un giorno intero" (VALUE=DATE): non hanno
//      fuso orario, quindi non slittano di un giorno per chi apre il file
//      all'estero o con l'ora legale.
//   4. Gli eventi con un orario (i turni di lavoro) sono scritti nell'ora di
//      Roma (TZID=Europe/Rome) e il file porta la definizione del fuso, con
//      il passaggio all'ora legale: le 22:00 restano le 22:00 anche a marzo.
//
// Funziona nel browser (window.CalendarioIcs) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CalendarioIcs = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function testo(t) {
    return String(t == null ? '' : t)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  function byteUtf8(ch) {
    var c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }

  // Piega una riga a 75 byte. Le righe di continuazione iniziano con uno
  // spazio, che conta nei 75.
  function piega(riga) {
    var fuori = [];
    var corrente = '';
    var byte = 0;
    var limite = 75;
    Array.from(riga).forEach(function (ch) {
      var b = byteUtf8(ch);
      if (byte + b > limite) {
        fuori.push(corrente);
        corrente = ' ';
        byte = 1;
      }
      corrente += ch;
      byte += b;
    });
    fuori.push(corrente);
    return fuori.join('\r\n');
  }

  function dataCompatta(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) throw new Error('Data non valida per il calendario: ' + iso);
    return m[1] + m[2] + m[3];
  }

  // Il giorno dopo, in calendario puro (niente Date locali: niente ora legale).
  function giornoDopo(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
    return d.toISOString().slice(0, 10);
  }

  function istanteUtc(d) {
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  // Promemoria rispetto all'inizio dell'evento. Per gli eventi di un giorno
  // intero l'inizio e' la mezzanotte: "-PT15H" e' il giorno prima alle 9,
  // "PT9H" il giorno stesso alle 9, "-P29DT15H" trenta giorni prima alle 9.
  // "oraPrima" e' pensato per gli eventi con orario, come i turni.
  var PROMEMORIA = {
    giornoPrima: '-PT15H', giornoStesso: 'PT9H', settimanaPrima: '-P6DT15H', mesePrima: '-P29DT15H', oraPrima: '-PT1H'
  };

  var ORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

  function oraCompatta(hhmm) {
    var m = ORA.exec(String(hhmm || ''));
    if (!m) throw new Error('Ora non valida per il calendario: ' + hhmm);
    return m[1] + m[2] + '00';
  }

  // Il fuso di Roma con le regole europee dell'ora legale (dall'ultima
  // domenica di marzo all'ultima di ottobre).
  var FUSO_ROMA = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Rome',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  /**
   * @param {Array} eventi  [{ id, data: 'AAAA-MM-GG', titolo, descrizione?, url?, promemoria?: ['giornoPrima', ...],
   *                         inizio?: 'HH:MM', fine?: 'HH:MM', occupato?: boolean }]
   *                         Con inizio e fine l'evento ha un orario; se fine non e' dopo inizio
   *                         (22:00-06:00) finisce il giorno dopo.
   * @param {Object} [opzioni]  { ora: Date (per DTSTAMP), nome: nome del calendario }
   * @returns {string} il contenuto del file .ics
   */
  function crea(eventi, opzioni) {
    var o = opzioni || {};
    var stamp = istanteUtc(o.ora instanceof Date ? o.ora : new Date());
    var righe = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//StrumentiUtili.it//Scadenze//IT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];
    if (o.nome) righe.push('X-WR-CALNAME:' + testo(o.nome));
    var conOrario = (eventi || []).some(function (e) { return e.inizio; });
    if (conOrario) righe.push.apply(righe, FUSO_ROMA);

    (eventi || []).forEach(function (e) {
      var inizio = dataCompatta(e.data);
      var descrizione = [e.descrizione, e.url ? 'Apri lo strumento: ' + e.url : null].filter(Boolean).join('\n\n');
      righe.push('BEGIN:VEVENT');
      righe.push('UID:' + testo(String(e.id || 'evento') + '-' + inizio + '@strumentiutili.it'));
      righe.push('DTSTAMP:' + stamp);
      if (e.inizio) {
        var da = oraCompatta(e.inizio), a = oraCompatta(e.fine);
        var giornoFine = a <= da ? dataCompatta(giornoDopo(e.data)) : inizio;
        righe.push('DTSTART;TZID=Europe/Rome:' + inizio + 'T' + da);
        righe.push('DTEND;TZID=Europe/Rome:' + giornoFine + 'T' + a);
      } else {
        righe.push('DTSTART;VALUE=DATE:' + inizio);
        righe.push('DTEND;VALUE=DATE:' + dataCompatta(giornoDopo(e.data)));
      }
      righe.push('SUMMARY:' + testo(e.titolo));
      if (descrizione) righe.push('DESCRIPTION:' + testo(descrizione));
      if (e.url) righe.push('URL:' + e.url);
      righe.push(e.occupato ? 'TRANSP:OPAQUE' : 'TRANSP:TRANSPARENT');
      (e.promemoria || []).forEach(function (quando) {
        var trigger = PROMEMORIA[quando];
        if (!trigger) return;
        righe.push('BEGIN:VALARM');
        righe.push('ACTION:DISPLAY');
        righe.push('DESCRIPTION:' + testo(e.titolo));
        righe.push('TRIGGER;RELATED=START:' + trigger);
        righe.push('END:VALARM');
      });
      righe.push('END:VEVENT');
    });

    righe.push('END:VCALENDAR');
    return righe.map(piega).join('\r\n') + '\r\n';
  }

  // Link al modulo "nuovo evento" di Google Calendar: si apre solo se
  // l'utente lo tocca, e porta con se' titolo, data e descrizione.
  function linkGoogle(e) {
    var parametri = [
      'action=TEMPLATE',
      'text=' + encodeURIComponent(e.titolo),
      'dates=' + dataCompatta(e.data) + '/' + dataCompatta(giornoDopo(e.data)),
      'details=' + encodeURIComponent([e.descrizione, e.url].filter(Boolean).join('\n\n'))
    ];
    return 'https://calendar.google.com/calendar/render?' + parametri.join('&');
  }

  function scarica(nomeFile, contenuto) {
    var blob = new Blob([contenuto], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  return { crea: crea, linkGoogle: linkGoogle, scarica: scarica, piega: piega, testo: testo, giornoDopo: giornoDopo };
});
