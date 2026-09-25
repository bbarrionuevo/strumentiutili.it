// tests/flashcard.test.js — Il motore delle flashcard: testo e CSV, mazzi di
// Anki, calendario dei ripassi (FSRS), quiz e copia di sicurezza.
//
// Le librerie si prendono da vendor/, come nel browser: i test non hanno
// bisogno di node_modules.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const F = require('../js/flashcard.js');
const G = require('../js/giornaliero.js');

const VENDOR = path.join(__dirname, '..', 'vendor');
function libreria(prefisso, file) {
  const cartella = fs.readdirSync(VENDOR).find((c) => c.startsWith(prefisso + '@'));
  return path.join(VENDOR, cartella, file);
}
const FSRS = require(libreria('ts-fsrs', 'ts-fsrs.umd.js'));
const fflate = require(libreria('fflate', 'fflate.umd.js'));
const fzstd = require(libreria('fzstd', 'fzstd.umd.js'));
const initSqlJs = require(libreria('sqljs', 'sql-wasm.js'));
let SQL = null;
const sql = () => SQL || initSqlJs({ locateFile: (f) => path.join(path.dirname(libreria('sqljs', 'sql-wasm.js')), f) }).then((s) => (SQL = s));

// 25 settembre 2026, le 10 in Italia
const ADESSO = Date.UTC(2026, 8, 25, 8, 0);
const MIN = 60000, GIORNO = 86400000;

test('testo da HTML: tag, entita, immagini e suoni', () => {
  const r = F.testoDaHtml('<div>Art.&nbsp;1 della <b>Costituzione</b></div><div>L&#39;Italia &egrave; una Repubblica&hellip;</div><img src="a.jpg"><br>[sound:x.mp3]');
  assert.strictEqual(r.testo, 'Art. 1 della Costituzione\nL\'Italia è una Repubblica…');
  assert.strictEqual(r.immagini, 1);
  assert.strictEqual(r.suoni, 1);
  assert.strictEqual(F.testoDaHtml('<ul><li>uno</li><li>due</li></ul>').testo, '• uno\n• due');
  assert.strictEqual(F.testoDaHtml('<style>.x{}</style>a &lt; b &amp;&#x20AC;').testo, 'a < b &€');
});

test('testo incollato e CSV: separatori, virgolette, intestazione, righe scartate', () => {
  let r = F.leggiTesto('Capitale d\'Italia;Roma\r\nCapitale di Francia;Parigi\n\n');
  assert.strictEqual(r.separatore, ';');
  assert.deepStrictEqual(r.carte.map((c) => [c.domanda, c.risposta]), [['Capitale d\'Italia', 'Roma'], ['Capitale di Francia', 'Parigi']]);
  r = F.leggiTesto('﻿domanda\trisposta\nuno\t1\ndue\t2');
  assert.strictEqual(r.separatore, '\t');
  assert.strictEqual(r.carte.length, 2);
  r = F.leggiTesto('"Quanto fa 2+2; e 3+3?";"4 e 6"\n"Riga ""citata""";"su\ndue righe"\nsolo domanda;\n');
  assert.strictEqual(r.carte[0].domanda, 'Quanto fa 2+2; e 3+3?');
  assert.strictEqual(r.carte[0].risposta, '4 e 6');
  assert.strictEqual(r.carte[1].domanda, 'Riga "citata"');
  assert.strictEqual(r.carte[1].risposta, 'su\ndue righe');
  assert.strictEqual(r.scartate, 1);
  // risposta multipla: la seconda colonna e' quella giusta
  r = F.leggiTesto('L\'Italia è una Repubblica fondata su;il lavoro;la famiglia;la proprietà;il lavoro');
  assert.deepStrictEqual(r.carte[0].errate, ['la famiglia', 'la proprietà']);
  // senza separatore non si inventa niente
  r = F.leggiTesto('una riga\nun\'altra riga');
  assert.strictEqual(r.carte.length, 0);
  assert.strictEqual(r.scartate, 2);
});

test('CSV esportato e reimportato uguale', () => {
  const carte = [
    { domanda: 'Con; punto e virgola', risposta: 'e "virgolette"', errate: ['a capo\nqui', 'semplice'] },
    { domanda: 'Semplice', risposta: 'Sì', errate: [] }
  ];
  const csv = F.esportaCsv(carte);
  assert.ok(csv.startsWith('﻿domanda;risposta;sbagliate\r\n'));
  assert.deepStrictEqual(F.leggiTesto(csv).carte, carte);
});

test('cloze di Anki: una carta per ogni buco', () => {
  const c = F.cloze('{{c1::Dante}} scrisse la {{c2::Divina Commedia::opera}} nel {{c1::Trecento}}');
  assert.strictEqual(c.length, 2);
  assert.deepStrictEqual(c[0], { domanda: '[...] scrisse la Divina Commedia nel [...]', risposta: 'Dante, Trecento', contesto: 'Dante scrisse la Divina Commedia nel Trecento' });
  assert.strictEqual(c[1].domanda, 'Dante scrisse la [opera] nel Trecento');
  assert.strictEqual(c[1].risposta, 'Divina Commedia');
  assert.deepStrictEqual(F.cloze('niente buchi'), []);
});

// Un .apkg "vecchio stile" (Anki 2.1 fino alla 2.1.49): SQLite con i
// modelli e i mazzi in JSON nella tabella col.
async function apkgVecchio(nomeFile) {
  const S = await sql();
  const db = new S.Database();
  db.run(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);`);
  const decks = { 1: { name: 'Default' }, 7: { name: 'Diritto::Costituzione' } };
  db.run('INSERT INTO col VALUES (1,0,0,0,11,0,0,0,?,?,?,?,?)', ['{}', '{}', JSON.stringify(decks), '{}', '{}']);
  const note = [
    [1, 'Chi elegge il Presidente della Repubblica?\x1fIl Parlamento in seduta comune'],
    [2, 'Quanti sono i senatori elettivi?\x1f200\x1f<i>dal 2020</i>'],
    [3, '\x1fsenza domanda'],
  ];
  note.forEach(([id, flds]) => {
    db.run('INSERT INTO notes VALUES (?,?,?,0,0,?,?,?,0,0,?)', [id, 'g' + id, 1, '', flds, '', '']);
    db.run('INSERT INTO cards (id, nid, did, ord) VALUES (?,?,?,0)', [100 + id, id, 7]);
  });
  const byte = db.export();
  db.close();
  const zip = {};
  zip[nomeFile] = byte;
  zip.media = fflate.strToU8('{}');
  return fflate.zipSync(zip);
}

test('Anki: pacchetto vecchio stile (collection.anki2 e anki21)', async () => {
  const S = await sql();
  for (const nome of ['collection.anki2', 'collection.anki21']) {
    const r = F.leggiApkg(await apkgVecchio(nome), { unzipSync: fflate.unzipSync, SQL: S, decompress: fzstd.decompress });
    assert.strictEqual(r.mazzo, 'Diritto › Costituzione', nome);
    assert.strictEqual(r.note, 3);
    assert.deepStrictEqual(r.carte.map((c) => [c.domanda, c.risposta]), [
      ['Chi elegge il Presidente della Repubblica?', 'Il Parlamento in seduta comune'],
      ['Quanti sono i senatori elettivi?', '200\ndal 2020']
    ]);
  }
});

test('Anki: pacchetto recente con zstd, preferito alla raccolta finta', async () => {
  const S = await sql();
  const byte = fs.readFileSync(path.join(__dirname, 'fixtures', 'anki', 'mazzo-recente.apkg'));
  const r = F.leggiApkg(new Uint8Array(byte), { unzipSync: fflate.unzipSync, SQL: S, decompress: fzstd.decompress });
  assert.strictEqual(r.mazzo, 'Concorsi › Storia');
  assert.strictEqual(r.note, 3);
  assert.strictEqual(r.cloze, 1);
  assert.strictEqual(r.immagini, 1);
  assert.strictEqual(r.suoni, 1);
  assert.deepStrictEqual(r.carte.map((c) => c.domanda), [
    'Capitale d\'Italia?', 'Che animale è?', '[...] scrisse la Divina Commedia', 'Dante scrisse la [opera]'
  ]);
  assert.strictEqual(r.carte[0].risposta, 'Roma');
  assert.strictEqual(r.carte[1].risposta, 'Il gatto');
  assert.strictEqual(r.carte[2].risposta, 'Dante\n\nDante scrisse la Divina Commedia\n\nNel Trecento');
  assert.ok(!r.carte.some((c) => /update to the latest Anki/.test(c.domanda)));
  // senza zstd si dice chiaramente cosa manca
  assert.throws(() => F.leggiApkg(new Uint8Array(byte), { unzipSync: fflate.unzipSync, SQL: S }), /zstd/);
});

test('Anki: file sbagliati danno un errore chiaro', async () => {
  const S = await sql();
  const lib = { unzipSync: fflate.unzipSync, SQL: S, decompress: fzstd.decompress };
  assert.throws(() => F.leggiApkg(new Uint8Array([1, 2, 3, 4]), lib), /non è un pacchetto di Anki/);
  assert.throws(() => F.leggiApkg(fflate.zipSync({ 'altro.txt': fflate.strToU8('x') }), lib), /raccolta di Anki/);
});

function carta(id, stato, extra) {
  const c = F.nuovaCarta({ domanda: 'D' + id, risposta: 'R' + id }, 'm1', ADESSO - GIORNO, id, Number(id.replace(/\D/g, '')) || 0);
  Object.assign(c.fsrs, stato || {});
  return Object.assign(c, extra || {});
}

test('FSRS: primi voti su una carta nuova', () => {
  const P = F.pianificatore(FSRS, { casuale: false });
  const c = carta('c1');
  const prevista = P.anteprima(c, ADESSO);
  assert.deepStrictEqual([prevista[1], prevista[2], prevista[3]], [1 * MIN, 6 * MIN, 10 * MIN]);
  assert.ok(prevista[4] >= 3 * GIORNO && prevista[4] <= 15 * GIORNO, 'facile: ' + prevista[4] / GIORNO + ' giorni');
  const bene = P.valuta(c, 3, ADESSO);
  assert.strictEqual(bene.fsrs.state, F.STATO.apprendimento);
  assert.strictEqual(bene.fsrs.due, ADESSO + 10 * MIN);
  assert.strictEqual(bene.prima, ADESSO);
  assert.strictEqual(c.fsrs.state, F.STATO.nuova, 'la carta di partenza non cambia');
  const facile = P.valuta(c, 4, ADESSO);
  assert.strictEqual(facile.fsrs.state, F.STATO.ripasso);
  assert.strictEqual(facile.fsrs.due, ADESSO + prevista[4]);
  // dopo "bene" e ancora "bene" la carta passa ai ripassi a giorni
  const dopo = P.valuta(bene, 3, ADESSO + 10 * MIN);
  assert.strictEqual(dopo.fsrs.state, F.STATO.ripasso);
  assert.ok(dopo.fsrs.due - (ADESSO + 10 * MIN) >= GIORNO);
  // un errore su una carta imparata la rimette in riapprendimento
  const sbagliata = P.valuta(dopo, 1, dopo.fsrs.due);
  assert.strictEqual(sbagliata.fsrs.state, F.STATO.riapprendimento);
  assert.strictEqual(sbagliata.fsrs.lapses, 1);
  assert.throws(() => P.valuta(c, 5, ADESSO));
});

test('coda di studio: apprendimento, poi ripassi, poi nuove entro il limite', () => {
  const nuovaA = carta('n1');
  const nuovaB = carta('n2');
  const ripasso = carta('r1', { state: 2, due: ADESSO - GIORNO, stability: 3, reps: 3 });
  const inArrivo = carta('a1', { state: 1, due: ADESSO + 5 * MIN, reps: 1 });
  const scaduta = carta('a2', { state: 1, due: ADESSO - MIN, reps: 1 });
  const futura = carta('r2', { state: 2, due: ADESSO + 3 * GIORNO, stability: 5, reps: 4 });
  let tutte = [nuovaB, futura, ripasso, inArrivo, nuovaA, scaduta];
  assert.strictEqual(F.prossima(tutte, ADESSO, 20).id, 'a2');
  tutte = tutte.filter((c) => c.id !== 'a2');
  assert.strictEqual(F.prossima(tutte, ADESSO, 20).id, 'r1');
  tutte = tutte.filter((c) => c.id !== 'r1');
  assert.strictEqual(F.prossima(tutte, ADESSO, 20).id, 'n1', 'le nuove nell ordine in cui sono entrate');
  // limite di nuove raggiunto: resta la carta che scade fra 5 minuti
  assert.strictEqual(F.prossima(tutte, ADESSO, 0).id, 'a1');
  // una nuova gia' vista oggi conta per il limite
  const vistaOggi = carta('v1', { state: 1, due: ADESSO + 2 * GIORNO, reps: 1 }, { prima: ADESSO - 30 * MIN });
  assert.strictEqual(F.prossima(tutte.concat(vistaOggi), ADESSO, 1).id, 'a1');
  // niente da fare: null
  assert.strictEqual(F.prossima([futura], ADESSO, 20), null);
});

test('conteggi del mazzo', () => {
  const carte = [
    carta('n1'), carta('n2'), carta('n3'),
    carta('r1', { state: 2, due: ADESSO + 5 * 3600000, stability: 3 }),   // stasera: e' di oggi
    carta('r2', { state: 2, due: ADESSO + 2 * GIORNO, stability: 5 }),
    carta('a1', { state: 3, due: ADESSO + 10 * MIN }),
    carta('v1', { state: 1, due: ADESSO + 3 * 3600000 }, { prima: ADESSO - MIN })
  ];
  const n = F.conteggi(carte, ADESSO, 2);
  assert.deepStrictEqual({ nuove: n.nuove, apprendimento: n.apprendimento, ripasso: n.ripasso, totale: n.totale, imparate: n.imparate },
    { nuove: 1, apprendimento: 1, ripasso: 1, totale: 7, imparate: 2 });
  assert.strictEqual(n.prossima, ADESSO + 3 * 3600000);
});

test('intervalli scritti per i pulsanti', () => {
  assert.strictEqual(F.formatoIntervallo(20 * 1000), '1 min');
  assert.strictEqual(F.formatoIntervallo(10 * MIN), '10 min');
  assert.strictEqual(F.formatoIntervallo(3 * 3600000), '3 h');
  assert.strictEqual(F.formatoIntervallo(4 * GIORNO), '4 g');
  assert.strictEqual(F.formatoIntervallo(31 * GIORNO), '1 mese');
  assert.strictEqual(F.formatoIntervallo(76 * GIORNO), '2,5 mesi');
  assert.strictEqual(F.formatoIntervallo(365 * GIORNO), '1 anno');
  assert.strictEqual(F.formatoIntervallo(800 * GIORNO), '2,2 anni');
});

test('quiz: quattro risposte diverse, prima quelle sbagliate scritte nella carta', () => {
  const carte = [
    { id: 'q1', domanda: 'Capitale d\'Italia', risposta: 'Roma', errate: ['Milano', 'Napoli', 'Torino', 'Firenze'] },
    { id: 'q2', domanda: 'Capitale di Francia', risposta: 'Parigi', errate: [] },
    { id: 'q3', domanda: 'Capitale di Spagna', risposta: 'Madrid', errate: ['madrid'] },
    { id: 'q4', domanda: 'Capitale di Germania', risposta: 'Berlino', errate: [] },
    { id: 'q5', domanda: 'Capitale del Portogallo', risposta: 'Lisbona', errate: [] }
  ];
  const q = F.quiz(carte, 10, G.casuale('quiz'));
  assert.strictEqual(q.length, 5);
  for (const d of q) {
    const c = carte.find((x) => x.id === d.id);
    assert.strictEqual(d.opzioni.length, 4, d.id);
    assert.strictEqual(new Set(d.opzioni.map((o) => o.toLowerCase())).size, 4, d.id);
    assert.strictEqual(d.opzioni[d.giusta], c.risposta);
    assert.strictEqual(d.domanda, c.domanda);
  }
  const roma = q.find((d) => d.id === 'q1');
  assert.ok(roma.opzioni.every((o) => ['Roma', 'Milano', 'Napoli', 'Torino', 'Firenze'].includes(o)), 'usa le sbagliate della carta');
  assert.strictEqual(F.quiz(carte, 2, G.casuale('x')).length, 2);
  // stesso seme, stesso quiz
  assert.deepStrictEqual(F.quiz(carte, 5, G.casuale('s')), F.quiz(carte, 5, G.casuale('s')));
  // una carta sola non basta per le alternative
  assert.deepStrictEqual(F.quiz([carte[1]], 5, G.casuale('y')), []);
});

test('copia di sicurezza: andata e ritorno, e niente spazzatura', () => {
  const P = F.pianificatore(FSRS, { casuale: false });
  const mazzi = [{ id: 'm1', nome: 'Concorso INPS', creato: ADESSO, nuoveAlGiorno: 15 }];
  const carte = [P.valuta(carta('c1'), 3, ADESSO), carta('c2')];
  const testo = F.esportaJson(mazzi, carte, ADESSO);
  const r = F.leggiJson(testo, ADESSO);
  assert.deepStrictEqual(r.mazzi, mazzi);
  assert.deepStrictEqual(r.carte, carte);
  assert.throws(() => F.leggiJson('non json', ADESSO), /non è una copia/);
  assert.throws(() => F.leggiJson('{"formato":"altro"}', ADESSO), /non è una copia/);
  const sporco = JSON.parse(testo);
  sporco.carte.push({ id: 'x', mazzo: 'inesistente', domanda: 'a', risposta: 'b' }, { id: 'y', mazzo: 'm1', domanda: '', risposta: 'b' });
  sporco.carte[1].fsrs = { state: 9 };
  sporco.mazzi[0].nuoveAlGiorno = 99999;
  const pulito = F.leggiJson(JSON.stringify(sporco), ADESSO);
  assert.strictEqual(pulito.carte.length, 2);
  assert.strictEqual(pulito.carte[1].fsrs.state, F.STATO.nuova, 'uno stato impossibile torna "nuova"');
  assert.strictEqual(pulito.mazzi[0].nuoveAlGiorno, 500);
});
