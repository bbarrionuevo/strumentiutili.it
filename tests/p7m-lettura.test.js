// tests/p7m-lettura.test.js — Il lettore di buste .p7m su file veri.
//
// I file in tests/fixtures/p7m/ sono stati firmati con OpenSSL (cms -sign)
// usando una CA e due firmatari di prova, "MARIO ROSSI" e "LUCIA BIANCHI":
// codici fiscali, nomi e certificati sono inventati. Coprono le forme che si
// incontrano davvero: DER, BER in streaming (lunghezze indefinite e documento
// a pezzi), doppia firma .p7m.p7m, base64 con e senza intestazione PEM, firma
// separata, catena con piu' certificati e firmatario indicato per keyid.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const P = require('../js/p7m-lettura.js');

const DIR = path.join(__dirname, 'fixtures', 'p7m');
const file = (nome) => new Uint8Array(fs.readFileSync(path.join(DIR, nome)));
const PDF = file('originale.pdf');
const XML = file('originale.xml');

function rossi(f) {
  assert.strictEqual(f.nome, 'MARIO ROSSI');
  assert.strictEqual(f.codiceFiscale, 'RSSMRA80A01H501U');
  assert.strictEqual(f.organizzazione, 'Prova Srl');
  assert.strictEqual(f.emittente, 'CA di Prova Firma Qualificata');
  assert.match(f.dataFirma, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
  assert.ok(f.validoDal < f.validoAl);
}

test('un PDF firmato: documento identico all originale e dati del firmatario', () => {
  const r = P.leggi(file('contratto.pdf.p7m'), 'contratto.pdf.p7m');
  assert.deepStrictEqual(Buffer.from(r.contenuto), Buffer.from(PDF));
  assert.strictEqual(r.tipo.estensione, 'pdf');
  assert.strictEqual(r.tipo.mime, 'application/pdf');
  assert.strictEqual(r.nome, 'contratto.pdf');
  assert.strictEqual(r.buste, 1);
  assert.strictEqual(r.firme.length, 1);
  rossi(r.firme[0]);
});

test('BER in streaming: lunghezze indefinite e documento spezzato in piu blocchi', () => {
  // Molti programmi di firma scrivono cosi': un parser solo DER lo rifiuterebbe.
  const grezzo = file('IT01234567890_00001.xml.p7m');
  assert.deepStrictEqual([...grezzo.subarray(0, 2)], [0x30, 0x80], 'la fixture non e piu in BER indefinito');
  const r = P.leggi(grezzo, 'IT01234567890_00001.xml.p7m');
  assert.deepStrictEqual(Buffer.from(r.contenuto), Buffer.from(XML));
  assert.strictEqual(r.tipo.estensione, 'xml');
  assert.strictEqual(r.nome, 'IT01234567890_00001.xml');
  assert.strictEqual(r.fatturaElettronica, true);
  rossi(r.firme[0]);
});

test('doppia firma .p7m.p7m: si aprono tutte le buste e si leggono tutte le firme', () => {
  const r = P.leggi(file('contratto.pdf.p7m.p7m'), 'contratto.pdf.p7m.p7m');
  assert.deepStrictEqual(Buffer.from(r.contenuto), Buffer.from(PDF));
  assert.strictEqual(r.nome, 'contratto.pdf');
  assert.strictEqual(r.buste, 2);
  assert.deepStrictEqual(r.firme.map((f) => [f.busta, f.nome]), [[1, 'LUCIA BIANCHI'], [2, 'MARIO ROSSI']]);
  assert.strictEqual(r.firme[0].codiceFiscale, 'BNCLCU85M41F205Z');
});

test('base64 con intestazione PEM e senza: stesso documento del binario', () => {
  for (const nome of ['pem.pdf.p7m', 'base64.pdf.p7m']) {
    const r = P.leggi(file(nome), nome);
    assert.deepStrictEqual(Buffer.from(r.contenuto), Buffer.from(PDF), nome);
    rossi(r.firme[0]);
  }
});

test('con piu certificati nella busta si sceglie quello del firmatario', () => {
  // catena: firmatario + CA. keyid: firmatario indicato per SubjectKeyIdentifier
  // e un secondo certificato estraneo. Senza abbinamento vero verrebbe
  // mostrato il nome sbagliato.
  const catena = P.leggi(file('catena.pdf.p7m'), 'catena.pdf.p7m');
  rossi(catena.firme[0]);
  const keyid = P.leggi(file('keyid.pdf.p7m'), 'keyid.pdf.p7m');
  assert.strictEqual(keyid.firme[0].nome, 'LUCIA BIANCHI');
  assert.strictEqual(keyid.firme[0].codiceFiscale, 'BNCLCU85M41F205Z');
});

test('il tipo si ricava dal contenuto, anche quando il nome non lo dice', () => {
  const pdf = P.leggi(file('documento.p7m'), 'documento.p7m');
  assert.strictEqual(pdf.nome, 'documento.pdf');
  const docx = P.leggi(file('lettera.docx.p7m'), 'lettera.docx.p7m');
  assert.strictEqual(docx.tipo.estensione, 'docx');
  assert.strictEqual(docx.nome, 'lettera.docx');
});

test('firma separata: errore chiaro, non un documento vuoto', () => {
  assert.throws(() => P.leggi(file('separata.pdf.p7m'), 'separata.pdf.p7m'), (e) => e.codice === 'firma-separata');
});

test('un file che non e una busta di firma viene riconosciuto come tale', () => {
  assert.throws(() => P.leggi(PDF, 'finto.p7m'), (e) => e.codice === 'non-firmato');
  assert.throws(() => P.leggi(XML, 'finto.p7m'), (e) => e.codice === 'non-firmato');
  assert.throws(() => P.leggi(new Uint8Array(0), 'vuoto.p7m'), (e) => e.codice === 'vuoto');
});

test('un file troncato e segnalato come danneggiato, senza eccezioni strane', () => {
  const intero = file('contratto.pdf.p7m');
  for (const taglio of [10, 100, 700, intero.length - 1]) {
    assert.throws(() => P.leggi(intero.subarray(0, taglio), 'x.p7m'),
      (e) => e.codice === 'danneggiato', 'taglio a ' + taglio + ' byte');
  }
});

test('il nome del documento estratto', () => {
  const pdf = { estensione: 'pdf' };
  assert.strictEqual(P.nomeDocumento('contratto.pdf.p7m', pdf), 'contratto.pdf');
  assert.strictEqual(P.nomeDocumento('CONTRATTO.PDF.P7M', pdf), 'CONTRATTO.PDF');
  assert.strictEqual(P.nomeDocumento('scansione.p7m', pdf), 'scansione.pdf');
  assert.strictEqual(P.nomeDocumento('atto.pdf.p7m.p7m', pdf), 'atto.pdf');
  assert.strictEqual(P.nomeDocumento('C:\\Download\\atto.pdf.p7m', pdf), 'atto.pdf');
  assert.strictEqual(P.nomeDocumento('.p7m', pdf), 'documento.pdf');
  assert.strictEqual(P.nomeDocumento('foto.jpeg.p7m', { estensione: 'jpg' }), 'foto.jpeg');
  assert.strictEqual(P.nomeDocumento('misterioso.p7m', { estensione: 'bin' }), 'misterioso.bin');
});

test('il riconoscimento del tipo dai primi byte', () => {
  const b = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
  assert.strictEqual(P.tipoDaByte(b('%PDF-1.7')).estensione, 'pdf');
  assert.strictEqual(P.tipoDaByte(b('\xEF\xBB\xBF<?xml version="1.0"?>')).estensione, 'xml');   // con BOM
  assert.strictEqual(P.tipoDaByte(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).estensione, 'jpg');
  assert.strictEqual(P.tipoDaByte(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])).estensione, 'png');
  assert.strictEqual(P.tipoDaByte(b('{\\rtf1\\ansi')).estensione, 'rtf');
  assert.strictEqual(P.tipoDaByte(b('PK\x03\x04....xl/workbook.xml')).estensione, 'xlsx');
  assert.strictEqual(P.tipoDaByte(b('Testo semplice di una ricevuta.')).estensione, 'txt');
  assert.strictEqual(P.tipoDaByte(new Uint8Array([1, 0, 2, 3])).estensione, 'bin');
});

test('codice fiscale solo dai formati dei certificati italiani', () => {
  assert.strictEqual(P.codiceFiscale('TINIT-RSSMRA80A01H501U'), 'RSSMRA80A01H501U');
  assert.strictEqual(P.codiceFiscale('IT:RSSMRA80A01H501U'), 'RSSMRA80A01H501U');
  assert.strictEqual(P.codiceFiscale('tinit-rssmra80a01h501u'), 'RSSMRA80A01H501U');
  // Un numero di serie qualsiasi non e' un codice fiscale.
  assert.strictEqual(P.codiceFiscale('20231234567'), null);
  assert.strictEqual(P.codiceFiscale(undefined), null);
});

test('le date dei certificati: UTCTime a due cifre e GeneralizedTime', () => {
  // RFC 5280: 50-99 sono 1950-1999, 00-49 sono 2000-2049.
  assert.strictEqual(P.tempo('500101000000Z', false), '1950-01-01T00:00:00.000Z');
  assert.strictEqual(P.tempo('491231235959Z', false), '2049-12-31T23:59:59.000Z');
  assert.strictEqual(P.tempo('20260924202422Z', true), '2026-09-24T20:24:22.000Z');
  assert.strictEqual(P.tempo('20260924202422.123Z', true), '2026-09-24T20:24:22.000Z');
  assert.strictEqual(P.tempo('non una data', false), null);
});
