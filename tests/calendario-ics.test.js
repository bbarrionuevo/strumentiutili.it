// tests/calendario-ics.test.js — Il file .ics deve aprirsi in qualsiasi calendario.
const test = require('node:test');
const assert = require('node:assert');

const C = require('../js/calendario-ics.js');
const ORA = new Date(Date.UTC(2026, 8, 24, 20, 30, 5));

function righe(ics) {
  // "Unfolding" come lo fa un calendario: CRLF seguito da spazio si toglie.
  return ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}

test('struttura: VCALENDAR con un VEVENT per scadenza, solo CRLF', () => {
  const ics = C.crea([
    { id: 'multa-sconto', data: '2026-10-05', titolo: 'Multa: sconto del 30%' },
    { id: 'multa-pagamento', data: '2026-11-29', titolo: 'Multa: pagamento' }
  ], { ora: ORA });
  assert.ok(!/[^\r]\n/.test(ics), 'ci sono a capo senza CR');
  assert.ok(ics.endsWith('\r\n'));
  const r = righe(ics);
  assert.strictEqual(r[0], 'BEGIN:VCALENDAR');
  assert.strictEqual(r[r.length - 1], 'END:VCALENDAR');
  assert.strictEqual(r.filter((x) => x === 'BEGIN:VEVENT').length, 2);
  assert.strictEqual(r.filter((x) => x === 'END:VEVENT').length, 2);
  assert.ok(r.includes('VERSION:2.0'));
  assert.ok(r.includes('DTSTAMP:20260924T203005Z'));
});

test('eventi di un giorno intero: DTEND e il giorno dopo, anche a fine mese e anno', () => {
  const casi = [['2026-10-05', '20261006'], ['2026-10-31', '20261101'], ['2026-12-31', '20270101'],
                ['2028-02-28', '20280229'], ['2027-02-28', '20270301']];
  for (const [data, fine] of casi) {
    const r = righe(C.crea([{ id: 'x', data, titolo: 't' }], { ora: ORA }));
    assert.ok(r.includes('DTSTART;VALUE=DATE:' + data.replace(/-/g, '')), data);
    assert.ok(r.includes('DTEND;VALUE=DATE:' + fine), data + ' -> ' + fine);
  }
});

test('nessuna riga supera 75 byte e il ripiegamento non rompe le lettere accentate', () => {
  const lungo = 'Pagare vuol dire rinunciare al ricorso: è una scelta, non si torna indietro. '.repeat(6);
  const ics = C.crea([{ id: 'x', data: '2026-10-05', titolo: 'Scadenza', descrizione: lungo }], { ora: ORA });
  for (const riga of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(riga, 'utf8') <= 75, 'riga di ' + Buffer.byteLength(riga, 'utf8') + ' byte');
  }
  const descr = righe(ics).find((x) => x.startsWith('DESCRIPTION:'));
  assert.strictEqual(descr, 'DESCRIPTION:' + C.testo(lungo));
});

test('testi protetti: virgole, punti e virgola, barre e a capo', () => {
  assert.strictEqual(C.testo('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const r = righe(C.crea([{ id: 'x', data: '2026-10-05', titolo: 'Ricorso al Prefetto, art. 203; gratuito' }], { ora: ORA }));
  assert.ok(r.includes('SUMMARY:Ricorso al Prefetto\\, art. 203\\; gratuito'));
});

test('UID stabile: riscaricare non duplica gli eventi', () => {
  const a = C.crea([{ id: 'multa-sconto', data: '2026-10-05', titolo: 't' }], { ora: ORA });
  const b = C.crea([{ id: 'multa-sconto', data: '2026-10-05', titolo: 't' }], { ora: new Date() });
  const uid = (ics) => righe(ics).find((x) => x.startsWith('UID:'));
  assert.strictEqual(uid(a), uid(b));
  assert.strictEqual(uid(a), 'UID:multa-sconto-20261005@strumentiutili.it');
});

test('promemoria: il giorno prima alle 9 e il giorno stesso alle 9', () => {
  const r = righe(C.crea([{ id: 'x', data: '2026-10-05', titolo: 't', promemoria: ['giornoPrima', 'giornoStesso', 'inventato'] }], { ora: ORA }));
  assert.deepStrictEqual(r.filter((x) => x.startsWith('TRIGGER')), ['TRIGGER;RELATED=START:-PT15H', 'TRIGGER;RELATED=START:PT9H']);
  assert.strictEqual(r.filter((x) => x === 'BEGIN:VALARM').length, 2);
});

test('il link allo strumento finisce nella descrizione e in URL', () => {
  const url = 'https://strumentiutili.it/cittadino-tasse/lettore-multa-codice-strada/';
  const r = righe(C.crea([{ id: 'x', data: '2026-10-05', titolo: 't', descrizione: 'd', url }], { ora: ORA }));
  assert.ok(r.includes('URL:' + url));
  assert.ok(r.find((x) => x.startsWith('DESCRIPTION:')).includes(url));
});

test('link a Google Calendar', () => {
  const l = C.linkGoogle({ data: '2026-12-31', titolo: 'Multa: pagamento', descrizione: 'Entro oggi' });
  assert.ok(l.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&'));
  assert.ok(l.includes('dates=20261231/20270101'));
  assert.ok(l.includes('text=Multa%3A%20pagamento'));
});

test('una data sbagliata non produce un file rotto', () => {
  assert.throws(() => C.crea([{ id: 'x', data: '05/10/2026', titolo: 't' }]), /Data non valida/);
});
