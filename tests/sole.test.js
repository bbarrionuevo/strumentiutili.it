// tests/sole.test.js — Alba e tramonto contro valori di riferimento calcolati
// con un'implementazione indipendente (la libreria Python "astral"), anche
// nei giorni del cambio d'ora.
const test = require('node:test');
const assert = require('node:assert');

const Sole = require('../js/sole.js');

const oraItaliana = (ms) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(ms);
const secondi = (hms) => { const [h, m, s] = hms.split(':').map(Number); return h * 3600 + m * 60 + s; };

// citta, data, alba, tramonto, mezzogiorno (ora italiana)
const RIFERIMENTI = [
  ['Roma', '2026-03-28', '06:00:08', '18:30:42', '12:15:11'],
  ['Roma', '2026-03-29', '06:58:25', '19:31:49', '13:14:53'],   // primo giorno di ora legale
  ['Roma', '2026-06-21', '05:35:08', '20:48:30', '13:11:43'],
  ['Roma', '2026-10-25', '06:34:03', '17:13:27', '11:54:06'],   // ritorno all'ora solare
  ['Roma', '2026-12-21', '07:34:33', '16:41:35', '12:07:50'],
  ['Milano', '2026-06-21', '05:34:55', '21:15:11', '13:24:57'],
  ['Milano', '2026-12-21', '08:00:20', '16:42:15', '12:21:04'],
  ['Palermo', '2026-06-21', '05:44:05', '20:32:38', '13:08:16'],
  ['Palermo', '2027-01-01', '07:23:09', '16:56:56', '12:09:46']
];

test('alba, tramonto e mezzogiorno entro un minuto dal riferimento', () => {
  for (const [nome, data, alba, tramonto, mezzo] of RIFERIMENTI) {
    const c = Sole.CITTA.find((x) => x.nome === nome);
    const r = Sole.calcola(data, c.lat, c.lon);
    for (const [chiave, atteso] of [['alba', alba], ['tramonto', tramonto], ['mezzogiorno', mezzo]]) {
      const scarto = Math.abs(secondi(oraItaliana(r[chiave])) - secondi(atteso));
      assert.ok(scarto <= 60, nome + ' ' + data + ' ' + chiave + ': ' + oraItaliana(r[chiave]) + ' invece di ' + atteso);
    }
    assert.strictEqual(r.sempre, null);
    assert.ok(r.durata > 500 && r.durata < 960, nome + ' ' + data + ' durata ' + r.durata);
  }
});

test('il giorno piu lungo e piu corto dell anno a Roma', () => {
  const roma = Sole.CITTA.find((x) => x.nome === 'Roma');
  const giugno = Sole.calcola('2026-06-21', roma.lat, roma.lon).durata;
  const dicembre = Sole.calcola('2026-12-21', roma.lat, roma.lon).durata;
  assert.ok(Math.abs(giugno - 913) <= 2, 'giugno: ' + giugno + ' minuti');    // 15 h 13 min
  assert.ok(Math.abs(dicembre - 547) <= 2, 'dicembre: ' + dicembre + ' minuti'); // 9 h 7 min
});

test('oltre il circolo polare: sole di mezzanotte e notte polare', () => {
  const estate = Sole.calcola('2026-06-21', 78.22, 15.65);   // Svalbard
  assert.deepStrictEqual([estate.alba, estate.tramonto, estate.sempre], [null, null, 'giorno']);
  const inverno = Sole.calcola('2026-12-21', 78.22, 15.65);
  assert.strictEqual(inverno.sempre, 'notte');
});

test('capoluoghi di regione: 20, coordinate in Italia', () => {
  assert.strictEqual(Sole.CITTA.length, 20);
  for (const c of Sole.CITTA) assert.ok(c.lat > 36 && c.lat < 47.5 && c.lon > 6.5 && c.lon < 19, c.nome);
  assert.throws(() => Sole.calcola('21/06/2026', 41.9, 12.5), /Dati non validi/);
  assert.throws(() => Sole.calcola('2026-06-21', 100, 12.5), /Dati non validi/);
});
