// tests/calendario-vista.test.js — Il calendario in HTML: date giuste, testi
// italiani corretti e nessun HTML che passa dal nome del patrono.
const test = require('node:test');
const assert = require('node:assert');

const F = require('../js/festivita.js');
const V = require('../js/calendario-vista.js');

// Le celle di tabella diventano spazi, i tag in linea spariscono.
const testo = (html) => html.replace(/<\/?(td|th|tr|li)[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

test('i dodici mesi: una tabella per mese, con i giorni giusti', () => {
  const html = V.anno(F, 2027);
  assert.strictEqual((html.match(/<table/g) || []).length, 12);
  assert.ok(html.includes('<caption class="text-left font-bold text-indigo-700 mb-1">Febbraio 2027</caption>'));
  // febbraio 2027 ha 28 giorni: nella sua tabella non c'e' il 29
  const febbraio = html.split('<table').find((t) => t.includes('Febbraio 2027'));
  assert.ok(/>28</.test(febbraio) && !/>29</.test(febbraio));
  // le celle dei giorni sono 365
  assert.strictEqual((html.match(/<td class=/g) || []).length, 365);
});

test('i festivi sono segnati con il nome, anche per chi usa un lettore di schermo', () => {
  const html = V.anno(F, 2027);
  assert.ok(html.includes('title="San Francesco d’Assisi"'));
  assert.ok(html.includes('<span class="sr-only">, San Francesco d’Assisi</span>'));
  const conPatrono = V.anno(F, 2027, { patrono: { md: '12-07', nome: 'Sant’Ambrogio' } });
  assert.ok(conPatrono.includes('text-orange-700 font-bold" title="Sant’Ambrogio"'));
});

test('oggi e cerchiato e marcato come data corrente', () => {
  const html = V.anno(F, 2027, { oggi: '2027-03-15' });
  assert.strictEqual((html.match(/aria-current="date"/g) || []).length, 1);
  assert.ok(!V.anno(F, 2027, { oggi: '2026-03-15' }).includes('aria-current'));
});

test('il nome del patrono scritto a mano non diventa HTML', () => {
  const nome = '<img src=x onerror=alert(1)>"';
  const patrono = { md: '06-24', nome };
  for (const html of [V.anno(F, 2027, { patrono }), V.festivita(F, 2027, patrono), V.ponti(F, 2027, patrono)]) {
    assert.ok(!html.includes('<img'), 'tag passato');
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  }
});

test('elenco delle feste 2027 con il giorno della settimana', () => {
  const t = testo(V.festivita(F, 2027));
  assert.ok(t.includes('1° gennaio venerdì Capodanno'));
  assert.ok(t.includes('4 ottobre lunedì San Francesco d’Assisi'));
  assert.ok(t.includes('25 dicembre sabato Natale'));
});

test('ponti in italiano corretto: elisioni, stesso mese, alternative', () => {
  const t = testo(V.ponti(F, 2027));
  assert.ok(t.includes('Capodanno, venerdì 1° gennaio: weekend lungo di 3 giorni; con 2 giorni di ferie (lunedì 4 e martedì 5 gennaio) 6 giorni di fila, dal 1° al 6 gennaio.'));
  assert.ok(t.includes('dal 4 all’8 dicembre; oppure dall’8 al 12 dicembre con giovedì 9 e venerdì 10 dicembre.'));
  assert.ok(t.includes('(lunedì 31 maggio e martedì 1° giugno) 5 giorni di fila, dal 29 maggio al 2 giugno'));
  assert.ok(t.includes('Natale, sabato 25 dicembre: cade nel fine settimana'));
  assert.ok(!/\b(dal|al) (8|11)\b/.test(t), 'manca l’elisione');
});

test('ricorrenze e riepilogo dell anno', () => {
  const t = V.ricorrenze(F, 2027).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(t.includes('Martedì grasso (Carnevale) martedì 9 febbraio'));
  assert.ok(t.includes('Festa della mamma domenica 9 maggio'));
  const r = V.riepilogo(F, 2027);
  assert.deepStrictEqual(r, { festivita: 12, infrasettimanali: 7, nelWeekend: 5, lavorativi: 254, weekendLunghi: 3, ponti: 4, pasqua: '2027-03-28' });
});

test('patroni: date valide, citta in ordine e senza doppioni', () => {
  const citta = V.PATRONI.map((p) => p.citta);
  assert.deepStrictEqual(citta, citta.slice().sort((a, b) => a.localeCompare(b, 'it')));
  assert.strictEqual(new Set(citta).size, citta.length);
  for (const p of V.PATRONI) assert.ok(F.valida('2027-' + p.md), p.citta);
  assert.strictEqual(V.PATRONI.find((p) => p.citta === 'Milano').md, '12-07');
  assert.strictEqual(V.PATRONI.find((p) => p.citta === 'Roma').md, '06-29');
});
