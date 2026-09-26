// tests/tipo-file.test.js — "Che file è?": il riconoscimento dai byte.
// I file di prova si costruiscono qui: bastano le intestazioni. Gli ZIP si
// creano con fflate (da vendor/), i P7M sono quelli di tests/fixtures/p7m.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const T = require('../js/tipo-file.js');
const P = require('../js/p7m-lettura.js');
const VENDOR = path.join(__dirname, '..', 'vendor');
const fflate = require(path.join(VENDOR, fs.readdirSync(VENDOR).find((c) => c.startsWith('fflate@')), 'fflate.umd.js'));

// byte da pezzi: stringhe (latin-1), numeri o array
function b(...pezzi) {
  const fuori = [];
  for (const p of pezzi) {
    if (typeof p === 'string') for (const c of p) fuori.push(c.charCodeAt(0) & 0xff);
    else if (typeof p === 'number') fuori.push(p);
    else fuori.push(...p);
  }
  return new Uint8Array(fuori);
}
const zeri = (n) => new Array(n).fill(0);
const id = (byte, o) => T.riconosci(byte, Object.assign({ P7m: P }, o || {})).tipo.id;

test('documenti e testi con firma iniziale', () => {
  assert.strictEqual(id(b('%PDF-1.7\n%âãÏÓ\n1 0 obj')), 'pdf');
  assert.strictEqual(id(b('{\\rtf1\\ansi')), 'rtf');
  assert.strictEqual(id(b('%!PS-Adobe-3.0\n')), 'ps');
  assert.strictEqual(id(b('AC1032', zeri(20))), 'dwg');
  const pdf = T.riconosci(b('%PDF-1.4\n<< /Encrypt 5 0 R >> pdfaid:part'), {});
  assert.deepStrictEqual(pdf.dettagli.find((d) => d[0] === 'Versione PDF'), ['Versione PDF', '1.4']);
  assert.ok(pdf.avvisi.some((a) => /protetto/.test(a)));
});

test('immagini, con le misure', () => {
  const png = b([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13], 'IHDR', [0, 0, 0x0f, 0xa0], [0, 0, 0x0b, 0xb8], zeri(10));
  const r = T.riconosci(png, {});
  assert.strictEqual(r.tipo.id, 'png');
  assert.deepStrictEqual(r.misure, { larghezza: 4000, altezza: 3000 });
  assert.match(r.dettagli.find((d) => d[0] === 'Misure')[1], /4000 × 3000 pixel \(12 megapixel\)/);
  // JPEG con segmento SOF0: 1920 x 1080
  const jpg = b([0xff, 0xd8, 0xff, 0xe0, 0, 16], 'JFIF\0', zeri(9), [0xff, 0xc0, 0, 17, 8, 0x04, 0x38, 0x07, 0x80, 3], zeri(12));
  assert.deepStrictEqual(T.riconosci(jpg, {}).misure, { larghezza: 1920, altezza: 1080 });
  assert.strictEqual(id(b('GIF89a', [10, 0, 20, 0], zeri(10))), 'gif');
  assert.strictEqual(id(b('RIFF', [0, 0, 0, 0], 'WEBPVP8 ', zeri(20))), 'webp');
  assert.strictEqual(id(b('II*\0', zeri(10))), 'tif');
  assert.strictEqual(id(b('II*\0', [0x10, 0, 0, 0], 'CR', zeri(10))), 'raw_cr');
  assert.strictEqual(id(b('8BPS', zeri(30))), 'psd');
  assert.strictEqual(id(b(zeri(128), 'DICM', zeri(10))), 'dicom');
  assert.strictEqual(id(b([0, 0, 1, 0, 1, 0, 16, 16, 0, 0], zeri(20))), 'ico');
  const bmp = b('BM', [30, 0, 0, 0], zeri(24));
  assert.strictEqual(T.riconosci(bmp, { dimensione: 30 }).tipo.id, 'bmp');
});

test('contenitori ISO: foto dell iPhone, video, vocali', () => {
  const ftyp = (marca, ...altre) => b([0, 0, 0, 16 + 4 * altre.length], 'ftyp', marca, [0, 0, 0, 0], ...altre, zeri(8));
  assert.strictEqual(id(ftyp('heic', 'mif1')), 'heic');
  assert.strictEqual(id(ftyp('mif1', 'heic')), 'heic');
  assert.strictEqual(id(ftyp('avif', 'mif1')), 'avif');
  assert.strictEqual(id(ftyp('qt  ')), 'mov');
  assert.strictEqual(id(ftyp('M4A ', 'isom')), 'm4a');
  assert.strictEqual(id(ftyp('3gp4')), '3gp');
  assert.strictEqual(id(ftyp('isom', 'mp41')), 'mp4');
  assert.strictEqual(id(b(ftyp('isom'), 'moov', 'trak', 'hdlr', 'soun')), 'm4a', 'MP4 solo audio');
});

test('audio e video', () => {
  assert.strictEqual(id(b('OggS', zeri(24), 'OpusHead', zeri(10))), 'opus');
  assert.strictEqual(id(b('OggS', zeri(24), [1], 'vorbis', zeri(10))), 'ogg');
  assert.strictEqual(id(b('fLaC', zeri(10))), 'flac');
  assert.strictEqual(id(b('ID3', [4, 0], zeri(10))), 'mp3');
  assert.strictEqual(id(b([0xff, 0xfb, 0x90, 0x64], zeri(10))), 'mp3');
  assert.strictEqual(id(b([0xff, 0xf1, 0x50, 0x80], zeri(10))), 'aac');
  assert.strictEqual(id(b('RIFF', zeri(4), 'WAVEfmt ', zeri(10))), 'wav');
  assert.strictEqual(id(b('RIFF', zeri(4), 'AVI LIST', zeri(10))), 'avi');
  assert.strictEqual(id(b([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], 'webm', zeri(10))), 'webm');
  assert.strictEqual(id(b([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], 'matroska', zeri(10))), 'mkv');
  assert.strictEqual(id(b('MThd', zeri(10))), 'midi');
  assert.strictEqual(id(b('#!AMR\n', zeri(10))), 'amr');
});

test('archivi e programmi, con gli avvisi', () => {
  assert.strictEqual(id(b('Rar!', [0x1a, 0x07, 0x01, 0x00], zeri(10))), 'rar');
  assert.strictEqual(id(b([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], zeri(10))), '7z');
  const gz = T.riconosci(b([0x1f, 0x8b, 8, 0x08, 0, 0, 0, 0, 0, 3], 'bilancio.xlsx\0', zeri(10)), {});
  assert.strictEqual(gz.tipo.id, 'gz');
  assert.deepStrictEqual(gz.dettagli.find((d) => d[0] === 'File compresso dentro'), ['File compresso dentro', 'bilancio.xlsx']);
  assert.strictEqual(id(b(zeri(257), 'ustar\0', zeri(10))), 'tar');
  assert.strictEqual(id(b(zeri(32769), 'CD001', zeri(10))), 'iso');
  assert.strictEqual(id(b([0x78, 0x9f, 0x3e, 0x22], zeri(10))), 'tnef');
  // EXE vero: MZ, puntatore all'intestazione PE, macchina x64
  const exe = b('MZ', zeri(0x3a), [0x40, 0, 0, 0], 'PE\0\0', [0x64, 0x86], zeri(16), [0x22, 0x00], zeri(20));
  const r = T.riconosci(exe, { nome: 'fattura.pdf.exe' });
  assert.strictEqual(r.tipo.id, 'exe');
  assert.deepStrictEqual(r.dettagli.find((d) => d[0] === 'Per'), ['Per', 'Windows a 64 bit (x64)']);
  assert.ok(r.avvisi.some((a) => /Doppia estensione/.test(a)));
  assert.ok(r.avvisi.some((a) => /programma/.test(a)));
  const dll = b('MZ', zeri(0x3a), [0x40, 0, 0, 0], 'PE\0\0', [0x4c, 0x01], zeri(16), [0x02, 0x20], zeri(20));
  assert.strictEqual(id(dll), 'dll');
  // un programma chiamato .pdf: trucco delle truffe
  assert.ok(T.riconosci(exe, { nome: 'avviso.pdf' }).avvisi[0].includes('Non aprirlo'));
  assert.strictEqual(id(b([0x7f], 'ELF', zeri(10))), 'elf');
  assert.strictEqual(id(b([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52], zeri(8))), 'class');
  assert.strictEqual(id(b([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2], zeri(8))), 'macho');
  assert.strictEqual(id(b([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])), 'wasm');
  assert.strictEqual(id(b([0x4c, 0, 0, 0, 1, 0x14, 2, 0], zeri(10))), 'lnk');
  assert.strictEqual(id(b('SQLite format 3\0', zeri(10))), 'sqlite');
  assert.strictEqual(id(b('wOF2', zeri(10))), 'woff2');
});

test('ZIP: Office, OpenDocument, EPUB, app, Anki, e l elenco dei file', () => {
  const zip = (voci) => fflate.zipSync(voci);
  const t = (s) => fflate.strToU8(s);
  assert.strictEqual(id(zip({ '[Content_Types].xml': t('<x/>'), 'word/document.xml': t('<w/>') })), 'docx');
  assert.strictEqual(id(zip({ '[Content_Types].xml': t('<x/>'), 'word/document.xml': t('<w/>'), 'word/vbaProject.bin': t('x') })), 'docm');
  assert.strictEqual(id(zip({ '[Content_Types].xml': t('<x/>'), 'xl/workbook.xml': t('<w/>') })), 'xlsx');
  assert.strictEqual(id(zip({ '[Content_Types].xml': t('<x/>'), 'ppt/presentation.xml': t('<w/>') })), 'pptx');
  // ODF ed EPUB: "mimetype" come prima voce, non compressa
  const odf = (mime) => zip({ mimetype: [t(mime), { level: 0 }], 'content.xml': t('<c/>') });
  assert.strictEqual(id(odf('application/vnd.oasis.opendocument.text')), 'odt');
  assert.strictEqual(id(odf('application/vnd.oasis.opendocument.spreadsheet')), 'ods');
  assert.strictEqual(id(odf('application/epub+zip')), 'epub');
  assert.strictEqual(id(zip({ 'AndroidManifest.xml': t('x'), 'classes.dex': t('x') })), 'apk');
  assert.strictEqual(id(zip({ 'META-INF/MANIFEST.MF': t('x'), 'a/B.class': t('x') })), 'jar');
  assert.strictEqual(id(zip({ 'collection.anki21': t('x'), media: t('{}') })), 'apkg');
  const foto = zip({ 'vacanze/1.jpg': new Uint8Array(100), 'vacanze/2.jpg': new Uint8Array(50), 'leggimi.txt': t('ciao') });
  const r = T.riconosci(foto, { nome: 'foto.zip' });
  assert.strictEqual(r.tipo.id, 'zip');
  assert.deepStrictEqual(r.zip.voci.map((v) => v.nome), ['vacanze/1.jpg', 'vacanze/2.jpg', 'leggimi.txt']);
  assert.strictEqual(r.zip.voci[0].dimensione, 100);
  // ZIP grande: si passano inizio e fine, la directory centrale e' in fondo
  const grande = zip({ 'a.bin': new Uint8Array(200000).map((_, i) => (i * 7) & 255), 'word/document.xml': t('<w/>'), '[Content_Types].xml': t('<x/>') });
  const r2 = T.riconosci(grande.subarray(0, 1000), { fine: grande.subarray(grande.length - 5000), dimensione: grande.length });
  assert.strictEqual(r2.tipo.id, 'docx');
});

test('vecchi Office (OLE): Word, Excel, PowerPoint, Outlook', () => {
  const ole = (nome) => {
    const u16 = [];
    for (const c of nome) u16.push(c.charCodeAt(0), 0);
    return b([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], zeri(504), u16, zeri(20));
  };
  assert.strictEqual(id(ole('WordDocument')), 'doc');
  assert.strictEqual(id(ole('Workbook')), 'xls');
  assert.strictEqual(id(ole('PowerPoint Document')), 'ppt');
  assert.strictEqual(id(ole('__substg1.0_0037001F')), 'msg');
  assert.strictEqual(id(ole('Qualcosa')), 'ole');
});

test('firma digitale: il documento dentro il .p7m', () => {
  const cartella = path.join(__dirname, 'fixtures', 'p7m');
  const leggi = (f) => new Uint8Array(fs.readFileSync(path.join(cartella, f)));
  let r = T.riconosci(leggi('contratto.pdf.p7m'), { P7m: P, nome: 'contratto.pdf.p7m' });
  assert.strictEqual(r.tipo.id, 'p7m');
  assert.strictEqual(r.interno.tipo.id, 'pdf');
  assert.strictEqual(r.interno.nome, 'contratto.pdf');
  assert.strictEqual(r.nomeSuggerito, 'contratto.pdf.p7m', 'un .p7m con il nome giusto non si rinomina');
  r = T.riconosci(leggi('IT01234567890_00001.xml.p7m'), { P7m: P });
  assert.strictEqual(r.interno.tipo.id, 'fatturapa');
  r = T.riconosci(leggi('pem.pdf.p7m'), { P7m: P });
  assert.strictEqual(r.tipo.id, 'p7m', 'anche in base64 con intestazione PEM');
  r = T.riconosci(leggi('contratto.pdf.p7m.p7m'), { P7m: P });
  assert.ok(r.dettagli.some((d) => d[0] === 'Buste di firma'));
  // senza estensione: si propone quella giusta
  r = T.riconosci(leggi('documento.p7m'), { P7m: P, nome: 'ALLEGATO' });
  assert.strictEqual(r.nomeSuggerito, 'ALLEGATO.p7m');
  assert.strictEqual(T.riconosci(leggi('separata.pdf.p7m'), { P7m: P }).tipo.id, 'p7s');
  assert.strictEqual(id(leggi('originale.xml')), 'fatturapa');
});

test('testi: email, PEC, calendario, contatti, JSON, CSV, codifiche', () => {
  const eml = 'Return-Path: <a@b.it>\r\nReceived: from x\r\nFrom: a@b.it\r\nTo: c@d.it\r\nSubject: prova\r\n\r\nciao';
  assert.strictEqual(id(b(eml)), 'eml');
  assert.strictEqual(id(b(eml.replace('Subject', 'X-Trasporto: posta-certificata\r\nSubject'))), 'pec');
  assert.strictEqual(id(b('<?xml version="1.0"?>\n<postacert tipo="posta-certificata">')), 'daticert');
  assert.strictEqual(id(b('BEGIN:VCALENDAR\r\nVERSION:2.0')), 'ics');
  assert.strictEqual(id(b('BEGIN:VCARD\r\nFN:Mario')), 'vcf');
  assert.strictEqual(id(b('{"nome": "Mario", "eta": 40}')), 'json');
  assert.strictEqual(id(b('nome;cognome;eta\nMario;Rossi;40\nAnna;Bianchi;35\n')), 'csv');
  assert.strictEqual(id(b('<!DOCTYPE html><html><body>ciao</body></html>')), 'html');
  assert.strictEqual(id(b('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), 'svg');
  assert.strictEqual(id(b('<?xml version="1.0"?><gpx version="1.1">')), 'gpx');
  assert.strictEqual(id(b('<?xml version="1.0"?><qualcosa/>')), 'xml');
  assert.strictEqual(id(b('-----BEGIN CERTIFICATE-----\nMIIB')), 'pem_cert');
  assert.ok(T.riconosci(b('-----BEGIN PRIVATE KEY-----\nMIIE'), {}).avvisi.some((a) => /chiave privata/.test(a)));
  assert.strictEqual(id(b('#!/bin/sh\necho ciao')), 'script');
  assert.strictEqual(id(b('Ciao, questo è un testo.\nSeconda riga.')), 'txt');
  // codifiche
  assert.strictEqual(T.codifica(b('ciao')).nome, 'ASCII');
  assert.strictEqual(T.codifica(b([0x63, 0xc3, 0xa0])).nome, 'UTF-8');
  assert.strictEqual(T.codifica(b([0x63, 0xe0, 0x20, 0x61])).nome, 'Windows-1252 / Latin-1');
  assert.strictEqual(T.codifica(b([0xff, 0xfe, 0x63, 0])).nome, 'UTF-16 (Windows)');
  assert.strictEqual(id(b([0xff, 0xfe], 'c\0i\0a\0o\0')), 'txt');
});

test('file vuoto, sconosciuto, nome ed estensione giusta', () => {
  assert.strictEqual(T.riconosci(new Uint8Array(0), { dimensione: 0 }).tipo.id, 'vuoto');
  const ignoto = T.riconosci(b([0x13, 0x37, 0, 0xfe, 0x01, 0x02, 0x00, 0x99]), { nome: 'misterioso.xyz' });
  assert.strictEqual(ignoto.tipo.id, 'bin');
  assert.strictEqual(ignoto.avvisi.length, 0);
  assert.strictEqual(T.nomeCorretto('scansione', T.TIPI.pdf), 'scansione.pdf');
  assert.strictEqual(T.nomeCorretto('foto.JPEG', T.TIPI.jpg), 'foto.JPEG');
  assert.strictEqual(T.nomeCorretto('documento.bin', T.TIPI.pdf), 'documento.pdf');
  assert.strictEqual(T.nomeCorretto('relazione.doc', T.TIPI.docx), 'relazione.doc.docx');
  assert.strictEqual(T.nomeCorretto('C:\\Users\\a\\file', T.TIPI.zip), 'file.zip');
  // estensione sbagliata ma innocua: un avviso gentile
  const r = T.riconosci(b('%PDF-1.7'), { nome: 'foto.jpg' });
  assert.match(r.avvisi[0], /l’estensione giusta è \.pdf/);
  assert.strictEqual(T.formatoDimensione(0), '0 byte');
  assert.strictEqual(T.formatoDimensione(1536), '1,5 KB');
  assert.strictEqual(T.formatoDimensione(5 * 1024 * 1024), '5 MB');
  assert.match(T.esadecimale(b('%PDF-1.7\n')), /^00000000  25 50 44 46 2D 31 2E 37  0A {23}%PDF-1\.7·$/);
});

test('ogni tipo del catalogo ha nome, categoria e indicazioni per aprirlo', () => {
  const categorie = new Set(['documento', 'firma', 'posta', 'fattura', 'immagine', 'audio', 'video', 'archivio', 'programma', 'dati', 'testo', 'font', 'altro']);
  for (const [chiave, t] of Object.entries(T.TIPI)) {
    assert.strictEqual(t.id, chiave);
    assert.ok(t.nome && t.apri, chiave);
    assert.ok(categorie.has(t.categoria), chiave + ': ' + t.categoria);
    assert.ok(/^[a-z0-9]*$/.test(t.estensione), chiave);
    assert.ok(/^[a-z]+\/[\w.+-]+$/.test(t.mime), chiave + ': ' + t.mime);
  }
});

test('avvisi sul nome leggibili; niente ".bin" suggerito per i file sconosciuti', () => {
  const docx = T.riconosci(new TextEncoder().encode('%PDF-1.7\n'), { nome: 'documento.dat', dimensione: 9 });
  assert.ok(docx.avvisi.some((a) => a === 'Il nome finisce in .dat, ma il file è di tipo «Documento PDF»: l’estensione giusta è .pdf.'), docx.avvisi.join(' | '));
  const ignoto = T.riconosci(new Uint8Array([0, 1, 2, 3, 250, 251, 252]), { nome: 'mistero' });
  assert.strictEqual(ignoto.tipo.id, 'bin');
  assert.ok(!ignoto.dettagli.some((d) => d[0] === 'Estensione giusta'));
});
