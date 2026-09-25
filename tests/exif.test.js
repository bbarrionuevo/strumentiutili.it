// tests/exif.test.js — Leggere e togliere i dati nascosti senza toccare i
// pixel. Le foto di prova sono vere (fatte con Pillow): tests/fixtures/exif/.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const E = require('../js/exif.js');
const DIR = path.join(__dirname, 'fixtures', 'exif');
const leggi = (f) => new Uint8Array(fs.readFileSync(path.join(DIR, f)));

// I segmenti che fanno l'immagine: tabelle, dimensioni e dati compressi.
const immagine = (b) => E.segmentiJpeg(b).filter((s) => [0xdb, 0xc0, 0xc2, 0xc4, 0xdd, 0xda].includes(s.marcatore))
  .map((s) => Buffer.from(b.subarray(s.da, s.a)).toString('hex')).join('|');

test('una foto del telefono rivela posto, telefono, data e autore', () => {
  const a = E.analizza(leggi('foto-gps.jpg'));
  assert.strictEqual(a.formato, 'jpeg');
  assert.deepStrictEqual(a.riassunto.posizione, { lat: 45.4642, lon: 9.19, altitudine: 121 });
  assert.strictEqual(a.riassunto.dispositivo, 'Apple iPhone 15');
  assert.strictEqual(a.riassunto.data, '2026-09-20 18:45:10', 'la data dello scatto, non quella di modifica');
  assert.strictEqual(a.riassunto.autore, 'Mario Rossi');
  assert.strictEqual(a.riassunto.seriale, 'SN123456');
  assert.strictEqual(a.riassunto.orientamento, 6);
  assert.deepStrictEqual(a.blocchi.map((x) => x.tipo), ['exif', 'xmp', 'commento']);
});

test('pulita: niente dati, pixel e profilo colore identici, orientamento conservato', () => {
  const prima = leggi('foto-gps.jpg');
  const dopo = E.pulisci(prima);
  assert.strictEqual(immagine(dopo), immagine(prima), 'la parte che disegna l immagine non cambia di un byte');
  const a = E.analizza(dopo);
  assert.deepStrictEqual(a.riassunto, { orientamento: 6 });
  assert.deepStrictEqual(a.blocchi.map((x) => x.tipo), ['exif']);
  assert.ok(a.blocchi[0].byte < 40, 'resta solo un EXIF minimo');
  const seg = E.segmentiJpeg(dopo).map((s) => s.marcatore);
  assert.ok(seg.includes(0xe2), 'il profilo colore ICC resta');
  assert.strictEqual(seg[0], 0xe0, 'JFIF resta il primo segmento');
  assert.ok(!Buffer.from(dopo).toString('latin1').includes('Mario'), 'nessuna traccia del nome');
  assert.deepStrictEqual(E.pulisci(dopo), dopo, 'ripulire una foto pulita non cambia nulla');
  // Anche l'orientamento, se si chiede
  assert.deepStrictEqual(E.analizza(E.pulisci(prima, { orientamento: false })).blocchi, []);
});

test('una foto gia pulita esce identica', () => {
  const b = leggi('foto-pulita.jpg');
  assert.deepStrictEqual(E.analizza(b).blocchi, []);
  assert.deepStrictEqual(E.pulisci(b), b);
});

test('PNG: eXIf e testi via, immagine uguale', () => {
  const b = leggi('immagine.png');
  const a = E.analizza(b);
  assert.deepStrictEqual(a.riassunto.posizione, { lat: -33.865, lon: -70.65 });
  assert.strictEqual(a.riassunto.dispositivo, 'Samsung Galaxy S24');
  assert.strictEqual(a.riassunto.software, 'Editor Foto 2.1');
  assert.strictEqual(a.riassunto.autore, 'Mario Rossi');
  const p = E.pulisci(b);
  assert.deepStrictEqual(E.analizza(p).blocchi, []);
  const idat = (x) => Buffer.from(x).toString('latin1').split('IDAT')[1].split('IEND')[0];
  assert.strictEqual(idat(p), idat(b));
});

// Un EXIF big-endian (Motorola, come molte fotocamere) costruito a mano, con
// una miniatura nascosta in IFD1.
function exifMotorola() {
  const v = [];
  const u16 = (n) => v.push(n >> 8, n & 255);
  const u32 = (n) => v.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  v.push(0x4d, 0x4d); u16(42); u32(8);
  // IFD0 a 8: Make (ASCII in coda), GPS IFD
  u16(2);
  u16(0x010f); u16(2); u32(6); u32(0);             // offset scritto dopo
  const posMake = v.length - 4;
  u16(0x8825); u16(4); u32(1); u32(0);
  const posGps = v.length - 4;
  u32(0);                                          // IFD1 dopo
  const posIfd1 = v.length - 4;
  const setU32 = (pos, n) => { v[pos] = (n >>> 24) & 255; v[pos + 1] = (n >>> 16) & 255; v[pos + 2] = (n >>> 8) & 255; v[pos + 3] = n & 255; };
  setU32(posMake, v.length); 'Canon\0'.split('').forEach((c) => v.push(c.charCodeAt(0)));
  // GPS IFD: 1 'N', 2 lat, 3 'W', 4 lon
  setU32(posGps, v.length);
  u16(4);
  u16(1); u16(2); u32(2); v.push(0x4e, 0, 0, 0);
  u16(2); u16(5); u32(3); u32(0); const posLat = v.length - 4;
  u16(3); u16(2); u32(2); v.push(0x57, 0, 0, 0);
  u16(4); u16(5); u32(3); u32(0); const posLon = v.length - 4;
  u32(0);
  setU32(posLat, v.length); [[41, 1], [53, 1], [2400, 100]].forEach(([n, d]) => { u32(n); u32(d); });
  setU32(posLon, v.length); [[87, 1], [37, 1], [3900, 100]].forEach(([n, d]) => { u32(n); u32(d); });
  // IFD1 con la miniatura
  setU32(posIfd1, v.length);
  u16(1); u16(0x0201); u16(4); u32(1); u32(0); u32(0);
  return v;
}

test('EXIF big-endian, coordinate a ovest e miniatura nascosta', () => {
  const pulita = leggi('foto-pulita.jpg');
  const tiff = exifMotorola();
  const corpo = [0x45, 0x78, 0x69, 0x66, 0, 0].concat(tiff);
  const app1 = [0xff, 0xe1, (corpo.length + 2) >> 8, (corpo.length + 2) & 255].concat(corpo);
  const b = new Uint8Array([0xff, 0xd8].concat(app1, Array.from(pulita.subarray(2))));
  const r = E.analizza(b).riassunto;
  assert.strictEqual(r.dispositivo, 'Canon');
  assert.deepStrictEqual(r.posizione, { lat: 41.89, lon: -87.6275 });
  assert.strictEqual(r.miniatura, true);
  assert.deepStrictEqual(E.pulisci(b), pulita, 'senza orientamento non si aggiunge nulla');
});

test('file rovinati o di altro tipo: nessun crash', () => {
  const b = leggi('foto-gps.jpg');
  assert.strictEqual(E.analizza(b.subarray(0, 120)), null, 'JPEG troncato');
  assert.throws(() => E.pulisci(b.subarray(0, 120)), /JPEG non valido/);
  assert.strictEqual(E.analizza(new TextEncoder().encode('GIF89a....')), null);
  assert.throws(() => E.pulisci(new Uint8Array([1, 2, 3])), /Formato non supportato/);
  // un EXIF con offset fuori dal file non fa saltare nulla
  const rotto = new Uint8Array(b);
  const i = Buffer.from(rotto).indexOf('Exif');
  rotto[i + 6 + 4] = 0xff; rotto[i + 6 + 5] = 0xff;
  assert.doesNotThrow(() => E.analizza(rotto));
});
