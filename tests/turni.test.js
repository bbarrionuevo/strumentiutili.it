// tests/turni.test.js — Il calendario dei turni: ciclo, cambi, ore del mese,
// link per i colleghi, calendario del telefono e PDF.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const PDFLib = require('../vendor/pdf-lib@1.17.1/pdf-lib.min.js');
const F = require('../js/festivita.js');
const T = require('../js/turni.js');
const Ics = require('../js/calendario-ics.js');
const CP = require('../js/calendario-pdf.js');
const TP = require('../js/turni-pdf.js');

test('il ciclo in quinta si ripete ogni cinque giorni, anche prima dell inizio', () => {
  const s = T.daModello('quinta', '2026-10-01');
  const sigle = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']
    .map((d) => T.turnoDel(s, d).sigla);
  assert.deepStrictEqual(sigle, ['M', 'P', 'N', 'S', 'R', 'M']);
  assert.strictEqual(T.turnoDel(s, '2026-09-30').sigla, 'R');
  assert.strictEqual(T.turnoDel(s, '2025-10-01').sigla, T.SCHEMI.quinta.ciclo[((-365 % 5) + 5) % 5]);
});

test('le ore di un turno, anche quando scavalca la mezzanotte', () => {
  assert.strictEqual(T.ore({ inizio: '07:00', fine: '14:00' }), 7);
  assert.strictEqual(T.ore({ inizio: '21:00', fine: '07:00' }), 10);
  assert.strictEqual(T.ore({ inizio: '22:30', fine: '06:00' }), 7.5);
  assert.strictEqual(T.ore({ inizio: '08:00', fine: '08:00' }), 24);
  assert.strictEqual(T.ore({ sigla: 'R' }), 0);
  assert.ok(T.scavalca({ inizio: '22:00', fine: '06:00' }));
  assert.ok(!T.scavalca({ inizio: '06:00', fine: '14:00' }));
});

test('ottobre 2026 in quinta: turni, ore e notti del mese', () => {
  const s = T.daModello('quinta', '2026-10-01');
  const giorni = T.mese(s, 2026, 10, F.mappaFestivita(2026));
  assert.strictEqual(giorni.length, 31);
  const r = T.riepilogo(giorni);
  assert.deepStrictEqual(r.perSigla, { M: 7, P: 6, N: 6, S: 6, R: 6 });
  assert.strictEqual(r.ore, 7 * 7 + 6 * 7 + 6 * 10);
  assert.strictEqual(r.notti, 6);
  assert.strictEqual(r.lavorati, 19);
});

test('dal lunedi al venerdi: il ciclo parte sempre dal lunedi', () => {
  const s = T.daModello('settimana', '2026-10-01'); // giovedi'
  assert.strictEqual(s.inizio, '2026-09-28');
  assert.strictEqual(T.turnoDel(s, '2026-10-03').sigla, 'R'); // sabato
  assert.strictEqual(T.turnoDel(s, '2026-10-05').sigla, 'L'); // lunedi'
  const r = T.riepilogo(T.mese(s, 2026, 10));
  assert.strictEqual(r.lavorati, 22);
  assert.strictEqual(r.ore, 22 * 9);
});

test('festivi e domeniche lavorati', () => {
  const s = T.daModello('quarta', '2026-12-24'); // 24 G, 25 N, 26 S, 27 R
  const r = T.riepilogo(T.mese(s, 2026, 12, F.mappaFestivita(2026)));
  const natale = T.turnoDel(s, '2026-12-25');
  assert.strictEqual(natale.sigla, 'N');
  assert.ok(r.festiviLavorati >= 1);
  assert.ok(r.domenicheLavorate >= 1);
});

test('ferie, malattia e cambi: si segnano sopra il ciclo e si tolgono', () => {
  const s = T.daModello('quinta', '2026-10-01');
  T.segna(s, '2026-10-01', 'FE');
  const g = T.turnoDel(s, '2026-10-01');
  assert.deepStrictEqual([g.sigla, g.ore, g.cambio, g.ciclo], ['FE', 0, true, 'M']);
  T.segna(s, '2026-10-02', 'N');
  assert.strictEqual(T.turnoDel(s, '2026-10-02').ore, 10);
  T.segna(s, '2026-10-01', 'M');
  assert.ok(!('2026-10-01' in s.eccezioni));
  const r = T.riepilogo(T.mese(s, 2026, 10));
  assert.strictEqual(r.perSigla.N, 7);
});

test('allinea: "il 3 ottobre faccio la notte"', () => {
  const s = T.daModello('quinta', '2026-01-01');
  T.allinea(s, '2026-10-03', 2);
  assert.strictEqual(T.turnoDel(s, '2026-10-03').sigla, 'N');
  assert.strictEqual(s.inizio, '2026-10-01');
});

test('il ciclo scritto a mano', () => {
  assert.deepStrictEqual(T.leggiCiclo('m m p p n n r r'), ['M', 'M', 'P', 'P', 'N', 'N', 'R', 'R']);
  assert.deepStrictEqual(T.leggiCiclo('MPNSR'), ['M', 'P', 'N', 'S', 'R']);
  assert.deepStrictEqual(T.leggiCiclo('G, N12, S'), ['G', 'N12', 'S']);
  assert.deepStrictEqual(T.leggiCiclo('  '), []);
});

test('controlli sugli schemi arrivati da fuori', () => {
  const s = T.daModello('quinta', '2026-10-01');
  assert.strictEqual(T.problema(s), null);
  assert.match(T.problema(Object.assign({}, s, { ciclo: ['M', 'X'] })), /X/);
  assert.match(T.problema(Object.assign({}, s, { inizio: '2026-02-30' })), /inizio/);
  const riservata = JSON.parse(JSON.stringify(s));
  riservata.tipi[0].sigla = 'FE';
  riservata.ciclo[0] = 'FE';
  assert.match(T.problema(riservata), /riservata/);
  const orario = JSON.parse(JSON.stringify(s));
  orario.tipi[0].inizio = '25:00';
  assert.match(T.problema(orario), /Orario/);
  const colore = JSON.parse(JSON.stringify(s));
  colore.tipi[0].colore = 'red';
  assert.match(T.problema(colore), /Colore/);
});

test('il link per i colleghi porta ciclo e orari, non le ferie', () => {
  const s = T.daModello('quinta', '2026-10-01');
  s.tipi[0].nome = 'Mattina lunga è così';
  T.segna(s, '2026-10-02', 'MA');
  const codice = T.codifica(s);
  assert.match(codice, /^[A-Za-z0-9_-]+$/);
  const d = T.decodifica(codice);
  assert.deepStrictEqual(d.ciclo, s.ciclo);
  assert.strictEqual(d.inizio, '2026-10-01');
  assert.strictEqual(d.tipi[0].nome, 'Mattina lunga è così');
  assert.deepStrictEqual(d.eccezioni, {});
  assert.strictEqual(d.modello, 'quinta');
  assert.strictEqual(T.decodifica('%%%'), null);
  assert.strictEqual(T.decodifica(''), null);
  assert.strictEqual(T.decodifica(codice.slice(0, -6)), null);
  // Uno schema manomesso che non passa i controlli viene rifiutato.
  const falso = Buffer.from(JSON.stringify({ v: 1, c: ['<'], i: '2026-10-01', t: [['<', 'x', '#000000']] })).toString('base64url');
  assert.strictEqual(T.decodifica(falso), null);
});

test('calendario del telefono: turni con orario nel fuso di Roma', () => {
  const s = T.daModello('quinta', '2026-10-01');
  const ev = T.eventi(s, '2026-10-01', '2026-10-10', { url: 'https://strumentiutili.it/lavoro-contratti/calendario-turni/', promemoria: ['oraPrima'] });
  assert.strictEqual(ev.length, 6); // M P N, M P N
  const ics = Ics.crea(ev, { ora: new Date(Date.UTC(2026, 8, 25, 10, 0, 0)), nome: 'Turni' });
  assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Rome/);
  assert.match(ics, /DTSTART;TZID=Europe\/Rome:20261001T070000\r\nDTEND;TZID=Europe\/Rome:20261001T140000/);
  // La notte del 3 finisce alle 7 del 4.
  assert.match(ics, /DTSTART;TZID=Europe\/Rome:20261003T210000\r\nDTEND;TZID=Europe\/Rome:20261004T070000/);
  assert.match(ics, /TRANSP:OPAQUE/);
  assert.match(ics, /TRIGGER;RELATED=START:-PT1H/);
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 6);
  for (const riga of ics.split('\r\n')) assert.ok(Buffer.byteLength(riga) <= 75, riga);
});

test('le scadenze di un giorno intero non cambiano', () => {
  const ics = Ics.crea([{ id: 'x', data: '2026-10-01', titolo: 'Scadenza', promemoria: ['mesePrima'] }], { ora: new Date(0) });
  assert.doesNotMatch(ics, /VTIMEZONE/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261001/);
  assert.match(ics, /TRANSP:TRANSPARENT/);
  assert.match(ics, /TRIGGER;RELATED=START:-P29DT15H/);
});

// Il testo di ogni pagina di un PDF.
function decodifica(hex) {
  const extra = { 0x96: '–', 0x97: '—' };
  let s = '';
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.slice(i, i + 2), 16);
    s += extra[b] || String.fromCharCode(b);
  }
  return s;
}

async function testi(byte) {
  const doc = await PDFLib.PDFDocument.load(byte);
  return doc.getPages().map((p) => {
    const c = p.node.Contents();
    const flussi = c instanceof PDFLib.PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
    const sorgente = flussi.map((f) => Buffer.from(PDFLib.decodePDFRawStream(f).decode()).toString('latin1')).join('\n');
    return [...sorgente.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((m) => decodifica(m[1]));
  });
}

test('PDF dei turni: un foglio per mese, turni, legenda e ore', async () => {
  const s = T.daModello('quinta', '2026-10-01');
  const byte = await TP.crea(PDFLib, F, CP, T, s, { anno: 2026, mese: 10, mesi: 3, titolo: 'Reparto 3B' });
  const doc = await PDFLib.PDFDocument.load(byte);
  assert.strictEqual(doc.getPageCount(), 3);
  const [ott, nov, dic] = await testi(byte);
  assert.ok(ott.includes('Ottobre 2026'));
  assert.ok(ott.includes('Reparto 3B'));
  assert.ok(ott.includes('M  Mattina'));
  assert.ok(ott.includes('21:00–07:00'));
  assert.ok(ott.some((t) => t.startsWith('Ore: 151')), ott.filter((t) => t.startsWith('Ore')).join());
  assert.ok(nov.includes('Novembre 2026'));
  assert.ok(dic.includes('Dicembre 2026'));
  assert.ok(ott.includes('strumentiutili.it — calendario turni'));
});

test('PDF dei turni: rifiuta uno schema non valido', async () => {
  const s = T.daModello('quinta', '2026-10-01');
  s.ciclo.push('Z');
  await assert.rejects(TP.crea(PDFLib, F, CP, T, s, { anno: 2026, mese: 10 }), /Z/);
});

test('il calendario da stampare mensile e rimasto identico dopo aver separato la pagina del mese', async () => {
  // Impronta dei disegni di tutte le pagine, presa prima della modifica.
  const attese = {
    base: '86e62b628087c260fe6a40c5980a2caf7178fa7e5361cc6b2216ef834ed8d350',
    senzaExtra: 'cdbab618a44fbce6eb7908749f7243c7a7353608f49a1a2e62040f84071e073b'
  };
  const casi = {
    base: { anno: 2027, formato: 'mensile' },
    senzaExtra: { anno: 2027, formato: 'mensile', settimane: false, lune: false, ricorrenze: false, patrono: { md: '06-24', nome: 'San Giovanni' } }
  };
  for (const k of Object.keys(casi)) {
    const doc = await PDFLib.PDFDocument.load(await CP.crea(PDFLib, F, casi[k]));
    const h = crypto.createHash('sha256');
    doc.getPages().forEach((p) => {
      const c = p.node.Contents();
      const flussi = c instanceof PDFLib.PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
      flussi.forEach((f) => h.update(Buffer.from(PDFLib.decodePDFRawStream(f).decode())));
    });
    assert.strictEqual(h.digest('hex'), attese[k], k);
  }
});
