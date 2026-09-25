// tests/parola.test.js — Il motore della "Parola del giorno" e gli elenchi
// di parole, piu' le funzioni dei giochi del giorno in js/giornaliero.js.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const G = require('../js/giornaliero.js');
const P = require('../js/parola.js');
const SOLUZIONI = require('../js/parole-soluzioni.js');
const VALIDE = require('../js/parole-valide.js');

test('elenchi: cinque lettere senza accenti, niente doppioni', () => {
  assert.ok(SOLUZIONI.length >= 900, 'soluzioni: ' + SOLUZIONI.length);
  assert.ok(VALIDE.length >= 4500 && VALIDE.length <= 5500, 'valide: ' + VALIDE.length);
  for (const w of SOLUZIONI.concat(VALIDE)) assert.ok(/^[a-z]{5}$/.test(w), w);
  assert.strictEqual(new Set(SOLUZIONI).size, SOLUZIONI.length);
  assert.strictEqual(new Set(VALIDE).size, VALIDE.length);
  assert.deepStrictEqual(VALIDE, VALIDE.slice().sort(), 'le valide sono in ordine alfabetico');
  // ogni soluzione si puo' anche scrivere come tentativo
  const v = new Set(VALIDE);
  for (const w of SOLUZIONI) assert.ok(v.has(w), w);
});

test('fra le soluzioni niente parolacce, nomi propri o lettere straniere', () => {
  const vietate = ['cazzo', 'merda', 'troia', 'porno', 'tette', 'negro', 'pirla', 'fesso', 'cagna', 'paolo', 'luigi', 'dante', 'roma', 'india', 'email', 'party'];
  for (const w of vietate) assert.ok(!SOLUZIONI.includes(w), w);
  for (const w of SOLUZIONI) assert.ok(!/[jkwxy]/.test(w), w);
});

test('le parole gia uscite non cambiano: si aggiunge solo in fondo', () => {
  assert.strictEqual(P.INIZIO, '2026-09-01');
  assert.deepStrictEqual(P.delGiorno('2026-09-01'), { data: '2026-09-01', numero: 1, parola: 'tappe' });
  assert.strictEqual(P.delGiorno('2026-09-25').parola, 'suole');
  const impronta = crypto.createHash('sha256').update(SOLUZIONI.slice(0, 400).join(' ')).digest('hex').slice(0, 16);
  assert.strictEqual(impronta, 'c139d37aca21f196', 'ordine delle prime 400 parole');
});

test('numero del giorno e giro dell elenco', () => {
  assert.strictEqual(P.numero('2026-09-01'), 1);
  assert.strictEqual(P.numero('2026-08-31'), 0);
  assert.strictEqual(P.numero('2026-02-30'), 0);
  assert.strictEqual(P.numero('ieri'), 0);
  // l'ora legale non sposta i numeri
  assert.strictEqual(P.numero('2026-10-26') - P.numero('2026-10-24'), 2);
  assert.strictEqual(P.numero('2027-03-29') - P.numero('2027-03-27'), 2);
  assert.throws(() => P.delGiorno('2026-08-31'));
  const dopoUnGiro = G.spostaGiorni('2026-09-01', SOLUZIONI.length);
  assert.strictEqual(P.delGiorno(dopoUnGiro).parola, 'tappe');
});

test('valuta: colori e lettere doppie come sui giornali', () => {
  assert.deepStrictEqual(P.valuta('suole', 'suole'), ['giusta', 'giusta', 'giusta', 'giusta', 'giusta']);
  assert.deepStrictEqual(P.valuta('aiuto', 'suole'), ['assente', 'assente', 'presente', 'assente', 'presente']);
  // una sola L da trovare oltre a quelle al posto giusto: nessuna
  assert.deepStrictEqual(P.valuta('lilla', 'palla'), ['assente', 'assente', 'giusta', 'giusta', 'giusta']);
  // la T in piu' resta grigia, E e O sono altrove
  assert.deepStrictEqual(P.valuta('tetto', 'notte'), ['assente', 'presente', 'giusta', 'giusta', 'presente']);
  // la prima A e' gialla, la seconda grigia: nella parola ce n'e' una sola da trovare
  assert.deepStrictEqual(P.valuta('arata', 'carta'), ['presente', 'presente', 'assente', 'giusta', 'giusta']);
  assert.deepStrictEqual(P.valuta('aaaaa', 'abate'), ['giusta', 'assente', 'giusta', 'assente', 'assente']);
  assert.deepStrictEqual(P.valuta('SUOLE', 'suole'), P.valuta('suole', 'suole'));
  assert.throws(() => P.valuta('sole', 'suole'));
});

test('normalizza e esiste: accenti e maiuscole non contano', () => {
  assert.strictEqual(P.normalizza('Perché '), 'perche');
  assert.strictEqual(P.normalizza('  PaLLa'), 'palla');
  assert.ok(P.esiste('PALLA'));
  assert.ok(P.esiste('mangi') && P.esiste('cavia') && P.esiste('notti'));
  assert.ok(!P.esiste('abcde'));
  assert.ok(!P.esiste('pall'));
});

test('tastiera: ogni lettera prende il colore migliore', () => {
  const t = P.tastiera(['aiuto', 'sedia'], 'suole');
  assert.strictEqual(t.s, 'giusta');
  assert.strictEqual(t.u, 'presente');
  assert.strictEqual(t.e, 'presente');
  assert.strictEqual(t.a, 'assente');
  assert.strictEqual(t.z, undefined);
  assert.strictEqual(P.tastiera(['sedia', 'suole'], 'suole').e, 'giusta');
});

test('problema e modalita difficile', () => {
  assert.strictEqual(P.problema('pal'), 'Servono 5 lettere');
  assert.match(P.problema('abcde'), /elenco/);
  assert.strictEqual(P.problema('palla'), null);
  const partita = { difficile: true, soluzione: 'notte', tentativi: ['tetto'] };
  assert.strictEqual(P.problema('sorte', partita), 'La terza lettera deve essere T');
  assert.strictEqual(P.problema('fatto', partita), 'Nella parola ci deve essere la E');
  assert.strictEqual(P.problema('notte', partita), null);
  assert.strictEqual(P.problema('sorte', { difficile: false, soluzione: 'notte', tentativi: ['tetto'] }), null);
  // conta anche quante volte: due L verdi vanno rimesse entrambe
  assert.strictEqual(P.rispettaIndizi(['lilla'], 'palla', 'balla'), null);
  assert.strictEqual(P.rispettaIndizi(['palle'], 'palla', 'polli'), 'La seconda lettera deve essere A');
  assert.strictEqual(P.rispettaIndizi(['lilla'], 'palla', 'palma'), 'La quarta lettera deve essere L');
});

test('esito della partita', () => {
  assert.deepStrictEqual(P.esito([], 'suole'), { vinta: false, finita: false, usati: 0 });
  assert.deepStrictEqual(P.esito(['aiuto', 'suole'], 'suole'), { vinta: true, finita: true, usati: 2 });
  const sei = ['aiuto', 'sedia', 'carte', 'piano', 'palla', 'notte'];
  assert.deepStrictEqual(P.esito(sei, 'suole'), { vinta: false, finita: true, usati: 6 });
});

test('statistiche: contano solo le parole del giorno, una volta sola', () => {
  let s = P.statistiche(null);
  assert.deepStrictEqual(s.distribuzione, [0, 0, 0, 0, 0, 0]);
  s = P.registra(s, '2026-09-25', '2026-09-25', true, 3);
  assert.strictEqual(s.giocate, 1);
  assert.strictEqual(s.vinte, 1);
  assert.deepStrictEqual(s.distribuzione, [0, 0, 1, 0, 0, 0]);
  assert.strictEqual(P.serieAttuale(s.serie, '2026-09-25'), 1);
  // riaprire la pagina non la conta due volte
  s = P.registra(s, '2026-09-25', '2026-09-25', true, 3);
  assert.strictEqual(s.giocate, 1);
  // l'archivio non conta
  s = P.registra(s, '2026-09-24', '2026-09-25', true, 2);
  assert.strictEqual(s.giocate, 1);
  // il giorno dopo la serie cresce
  s = P.registra(s, '2026-09-26', '2026-09-26', true, 4);
  assert.strictEqual(P.serieAttuale(s.serie, '2026-09-26'), 2);
  assert.strictEqual(s.serie.record, 2);
  // una partita persa azzera la serie ma non il record
  s = P.registra(s, '2026-09-27', '2026-09-27', false, 6);
  assert.strictEqual(s.giocate, 3);
  assert.strictEqual(s.vinte, 2);
  assert.strictEqual(P.serieAttuale(s.serie, '2026-09-27'), 0);
  assert.strictEqual(s.serie.record, 2);
  s = P.registra(s, '2026-09-28', '2026-09-28', true, 1);
  assert.strictEqual(P.serieAttuale(s.serie, '2026-09-28'), 1);
  // chi salta un giorno riparte da zero
  assert.strictEqual(P.serieAttuale(s.serie, '2026-09-30'), 0);
  // dati rovinati nel browser non rompono niente
  assert.deepStrictEqual(P.statistiche({ giocate: 'x', distribuzione: [1, 'a'] }).distribuzione, [1, 0, 0, 0, 0, 0]);
});

test('condivisione: solo colori, niente lettere della parola', () => {
  const testo = P.testoCondivisione({ data: '2026-09-25', oggi: '2026-09-25', tentativi: ['aiuto', 'sedia', 'suole'], soluzione: 'suole', serie: 4 });
  const righe = testo.split('\n');
  assert.strictEqual(righe[0], 'Parola del giorno n. 25 · 3/6');
  assert.strictEqual(righe[1], '⬛⬛🟨⬛🟨');
  assert.strictEqual(righe[2], '🟩🟨⬛⬛⬛');
  assert.strictEqual(righe[3], '🟩🟩🟩🟩🟩');
  assert.strictEqual(righe[4], '🔥 4 giorni di fila');
  assert.strictEqual(righe[5], 'https://strumentiutili.it/utilita-web/parola-del-giorno/');
  assert.ok(!/suole|SUOLE|aiuto|sedia/.test(testo));
  // persa, difficile, colori per daltonici, dall'archivio
  const altro = P.testoCondivisione({
    data: '2026-09-20', oggi: '2026-09-25', tentativi: ['aiuto', 'sedia', 'carte', 'piano', 'palla', 'notte'],
    soluzione: P.delGiorno('2026-09-20').parola, difficile: true, daltonico: true
  });
  assert.match(altro, /^Parola del giorno n\. 20 · X\/6\*/);
  assert.ok(!/🟩|🟨/.test(altro));
  assert.ok(altro.endsWith('/utilita-web/parola-del-giorno/?giorno=2026-09-20'));
});

test('giornaliero: data italiana, giorni e serie condivise con il sudoku', () => {
  const S = require('../js/sudoku.js');
  assert.strictEqual(S.oggiInItalia, G.oggiInItalia);
  assert.strictEqual(S.aggiornaSerie, G.aggiornaSerie);
  assert.strictEqual(S.serieAttuale, G.serieAttuale);
  assert.strictEqual(S.giornoPrima, G.giornoPrima);
  assert.strictEqual(S.casuale, G.casuale);
  // alle 23:30 UTC del 31 dicembre in Italia e' gia' capodanno
  assert.strictEqual(G.oggiInItalia(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.strictEqual(G.oggiInItalia(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
  assert.strictEqual(G.oggiInItalia(new Date('2026-07-01T22:01:00Z')), '2026-07-02');
  assert.strictEqual(G.spostaGiorni('2026-02-28', 1), '2026-03-01');
  assert.strictEqual(G.spostaGiorni('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(G.spostaGiorni('2026-01-01', -1), '2025-12-31');
  assert.strictEqual(G.giorniFra('2026-03-28', '2026-03-30'), 2);
  assert.strictEqual(G.giorniFra('2026-09-25', '2026-09-01'), -24);
  assert.ok(G.valida('2028-02-29') && !G.valida('2026-02-29') && !G.valida('2026-9-1'));
  const a = G.casuale('seme'), b = G.casuale('seme');
  for (let i = 0; i < 5; i++) assert.strictEqual(a(), b());
  // interrompere la serie tocca solo il giorno di oggi
  const s = { ultima: '2026-09-24', giorni: 5, record: 7, risolti: 20 };
  assert.deepStrictEqual(G.interrompiSerie(s, '2026-09-20', '2026-09-25'), s);
  assert.deepStrictEqual(G.interrompiSerie(s, '2026-09-25', '2026-09-25'), { ultima: '2026-09-25', giorni: 0, record: 7, risolti: 20 });
});
