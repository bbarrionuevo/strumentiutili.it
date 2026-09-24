// tests/calendario-pdf.test.js — Il calendario da stampare: pagine giuste e
// feste scritte davvero nel PDF (si legge il testo dai content stream).
const test = require('node:test');
const assert = require('node:assert');

const PDFLib = require('../vendor/pdf-lib@1.17.1/pdf-lib.min.js');
const F = require('../js/festivita.js');
const C = require('../js/calendario-pdf.js');

// Caratteri WinAnsi fuori da Latin-1 che usiamo nei testi.
const WIN_ANSI = { 0x85: '…', 0x92: '’', 0x97: '—' };

function decodifica(hex) {
  let s = '';
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.slice(i, i + 2), 16);
    s += WIN_ANSI[b] || String.fromCharCode(b);
  }
  return s;
}

// Il testo di ogni pagina, una stringa per disegno.
async function testiPerPagina(byte) {
  const doc = await PDFLib.PDFDocument.load(byte);
  return doc.getPages().map((p) => {
    const c = p.node.Contents();
    const flussi = c instanceof PDFLib.PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
    const sorgente = flussi.map((f) => Buffer.from(PDFLib.decodePDFRawStream(f).decode()).toString('latin1')).join('\n');
    return [...sorgente.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((m) => decodifica(m[1]));
  });
}

async function carica(byte) {
  return PDFLib.PDFDocument.load(byte);
}

test('annuale: un foglio A4 verticale con titolo e metadati', async () => {
  const byte = await C.crea(PDFLib, F, { anno: 2027 });
  const doc = await carica(byte);
  assert.strictEqual(doc.getPageCount(), 1);
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 0.01 && Math.abs(height - 841.89) < 0.01);
  assert.strictEqual(doc.getTitle(), 'Calendario 2027');
  assert.strictEqual(doc.getAuthor(), 'StrumentiUtili.it');
  assert.ok(byte.length < 60000, 'il PDF annuale pesa ' + byte.length + ' byte');
});

test('annuale: tutti i mesi e tutte le feste nazionali, 4 ottobre compreso', async () => {
  const [testi] = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027 }));
  assert.ok(testi.includes('Calendario 2027'));
  for (const mese of F.NOMI_MESI) assert.ok(testi.includes(mese), mese);
  for (const f of F.festivita(2027)) assert.ok(testi.some((t) => t.startsWith(f.nome.slice(0, 20))), f.nome);
  assert.ok(testi.includes('4 ottobre (lunedì)'));
  assert.ok(testi.includes('San Francesco d’Assisi'));
  // Senza i numeri di settimana, il 31 compare una volta per ogni mese che ce l'ha.
  const [soloGiorni] = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027, settimane: false }));
  assert.strictEqual(soloGiorni.filter((t) => t === '31').length, 7);
});

test('mensile: dodici fogli A4 orizzontali, uno per mese nell’ordine', async () => {
  const byte = await C.crea(PDFLib, F, { anno: 2027, formato: 'mensile' });
  const doc = await carica(byte);
  assert.strictEqual(doc.getPageCount(), 12);
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    assert.ok(width > height, 'orizzontale');
  }
  const pagine = await testiPerPagina(byte);
  pagine.forEach((testi, i) => assert.strictEqual(testi[0], F.NOMI_MESI[i] + ' 2027'));
  // Senza i numeri di settimana restano solo i giorni: l'ultimo e' quello giusto.
  const soloGiorni = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027, formato: 'mensile', settimane: false }));
  soloGiorni.forEach((testi, i) => {
    const giorni = F.giorniNelMese(2027, i + 1);
    assert.ok(testi.includes(String(giorni)) && !testi.includes(String(giorni + 1)), F.NOMI_MESI[i]);
  });
  assert.ok(pagine[9].includes('San Francesco d’Assisi'), 'ottobre');
  assert.ok(pagine[11].includes('Immacolata Concezione') && pagine[11].includes('Natale'), 'dicembre');
  assert.ok(pagine[2].includes('Lunedì dell’Angelo (Pasquetta)'), 'marzo 2027');
});

test('il santo patrono compare solo se scelto, in entrambi i formati', async () => {
  const patrono = { md: '12-07', nome: 'Sant’Ambrogio (Milano)' };
  const con = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027, patrono }));
  const senza = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027 }));
  assert.ok(con[0].includes('Sant’Ambrogio (Milano)'));
  assert.ok(con[0].includes('7 dicembre (martedì)'));
  assert.ok(!senza[0].some((t) => t.includes('Ambrogio')));
  const mensile = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027, formato: 'mensile', patrono }));
  assert.ok(mensile[11].includes('Sant’Ambrogio (Milano)'));
});

test('opzioni: senza settimane e senza lune cambia il disegno, non le date', async () => {
  const pieno = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027, formato: 'mensile' }));
  const essenziale = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027, formato: 'mensile', settimane: false, lune: false }));
  // gennaio 2027 inizia nella settimana ISO 53 del 2026
  assert.ok(pieno[0].includes('53'));
  assert.ok(!essenziale[0].includes('53'));
  assert.ok(pieno[0].includes('luna piena'));
  assert.ok(!essenziale[0].includes('luna piena'));
  const numeri = (t) => t.filter((x) => /^\d{1,2}$/.test(x) && Number(x) <= 31);
  assert.deepStrictEqual(numeri(essenziale[0]), Array.from({ length: 31 }, (_, i) => String(i + 1)));
});

test('funziona per piu’ anni e rifiuta un anno sbagliato', async () => {
  for (let anno = 2026; anno <= 2030; anno++) {
    for (const formato of ['annuale', 'mensile']) {
      const doc = await carica(await C.crea(PDFLib, F, { anno, formato }));
      assert.strictEqual(doc.getPageCount(), formato === 'mensile' ? 12 : 1, anno + ' ' + formato);
    }
  }
  // La festa del 4 ottobre vale dal 2026 (L. 151/2025): c'e' nel 2026, non nel 2025.
  const [t2026] = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2026 }));
  assert.ok(t2026.includes('San Francesco d’Assisi'));
  const [t2025] = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2025 }));
  assert.ok(!t2025.includes('San Francesco d’Assisi'));
  await assert.rejects(C.crea(PDFLib, F, { anno: 20270 }), /Anno non valido/);
  await assert.rejects(C.crea(PDFLib, F, { anno: '2027' }), /Anno non valido/);
});

test('ricorrenze nelle caselle del mensile: ora legale, carnevale, festa della mamma', async () => {
  const pagine = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027, formato: 'mensile' }));
  assert.ok(pagine[1].includes('Martedì grasso'), 'febbraio');
  assert.ok(pagine[2].includes('Inizio ora legale') && pagine[2].includes('Pasqua'), 'marzo: il 28 sono tutte e due');
  assert.ok(pagine[4].includes('Festa della mamma'), 'maggio');
  assert.ok(pagine[9].includes('Fine ora legale'), 'ottobre');
  const senza = await testiPerPagina(await C.crea(PDFLib, F, { anno: 2027, formato: 'mensile', ricorrenze: false }));
  assert.ok(!senza[2].includes('Inizio ora legale'));
  assert.ok(senza[2].includes('Pasqua'), 'le feste restano');
});

test('un nome del patrono con caratteri che il PDF non sa scrivere non rompe nulla', async () => {
  assert.strictEqual(C.winAnsi('San Nicola 🎉 Никола'), 'San Nicola');
  assert.strictEqual(C.winAnsi('Sant’Agata – “festa”'), 'Sant’Agata – “festa”');
  for (const nome of ['🎉🎉', 'Святой', '', '<script>']) {
    const byte = await C.crea(PDFLib, F, { anno: 2027, formato: 'mensile', patrono: { md: '06-24', nome } });
    const pagine = await testiPerPagina(byte);
    const atteso = nome === '<script>' ? '<script>' : 'Santo patrono';
    assert.ok(pagine[5].includes(atteso), JSON.stringify(nome));
  }
});
