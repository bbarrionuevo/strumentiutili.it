// tests/heic.test.js — Convertire le foto HEIC dell'iPhone (utilita-web/convertire-heic-jpg).
//
// Le foto di prova in tests/fixtures/heic sono state create con pillow-heif
// (encoder x265): un gradiente noto, una tinta unita con dimensioni dispari e
// un file con due immagini. Qui si prova il motore puro (js/heic.js) e che la
// libreria in vendor/ (libheif compilato in WebAssembly) le decodifichi con i
// colori giusti: e' la stessa che usa il browser.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../js/heic.js');

const FIX = path.join(__dirname, 'fixtures', 'heic');
const leggi = (n) => new Uint8Array(fs.readFileSync(path.join(FIX, n)));
const VENDOR = path.join(__dirname, '..', 'vendor', 'libheif@1.23.2');

test('riconosce i file HEIC/HEIF dall\'intestazione, non dall\'estensione', () => {
  assert.strictEqual(H.eHeic(leggi('gradiente-64x48.heic')), true);
  assert.strictEqual(H.eHeic(leggi('due-immagini.heic')), true);
  // un JPEG e un PNG non lo sono, anche se si chiamassero .heic
  assert.strictEqual(H.eHeic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1])), false);
  assert.strictEqual(H.eHeic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])), false);
  // ftyp con i marchi delle foto iPhone e delle sequenze
  const ftyp = (marca) => new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...Buffer.from(marca), 0, 0, 0, 0, ...Buffer.from('mif1'), ...Buffer.from('heic')]);
  for (const m of ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']) assert.strictEqual(H.eHeic(ftyp(m)), true, m);
  assert.strictEqual(H.eHeic(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...Buffer.from('isom'), 0, 0, 0, 0, ...Buffer.from('mp42'), ...Buffer.from('avc1')])), false);
  assert.strictEqual(H.eHeic(new Uint8Array(4)), false);
});

test('nomi dei file convertiti: estensione nuova e niente doppioni', () => {
  const nomi = H.nomiUscita(['IMG_0001.HEIC', 'IMG_0002.heic', 'vacanze.HEIF', 'IMG_0001.heic', 'senza estensione'], 'jpeg');
  assert.deepStrictEqual(nomi, ['IMG_0001.jpg', 'IMG_0002.jpg', 'vacanze.jpg', 'IMG_0001 (2).jpg', 'senza estensione.jpg']);
  assert.deepStrictEqual(H.nomiUscita(['a.heic'], 'png'), ['a.png']);
  assert.deepStrictEqual(H.nomiUscita(['a.heic'], 'webp'), ['a.webp']);
});

test('dimensioni: si riduce solo se serve, mantenendo le proporzioni', () => {
  assert.deepStrictEqual(H.dimensioni(4032, 3024, 0), { larghezza: 4032, altezza: 3024 });
  assert.deepStrictEqual(H.dimensioni(4032, 3024, 2048), { larghezza: 2048, altezza: 1536 });
  assert.deepStrictEqual(H.dimensioni(3024, 4032, 2048), { larghezza: 1536, altezza: 2048 });
  assert.deepStrictEqual(H.dimensioni(1200, 900, 2048), { larghezza: 1200, altezza: 900 });
  assert.deepStrictEqual(H.dimensioni(17, 9, 10), { larghezza: 10, altezza: 5 });
});

test('quante conversioni in parallelo: lascia un processore libero, al massimo 4', () => {
  assert.strictEqual(H.lavoratori(1, 8), 1);
  assert.strictEqual(H.lavoratori(30, 8), 4);
  assert.strictEqual(H.lavoratori(30, 2), 1);
  assert.strictEqual(H.lavoratori(30, undefined), 2);
  assert.strictEqual(H.lavoratori(0, 8), 0);
});

test('riepilogo: quante foto, peso prima e dopo, tempo', () => {
  const r = H.riepilogo([{ prima: 3_000_000, dopo: 1_200_000, ms: 900 }, { prima: 2_000_000, dopo: 800_000, ms: 700 }, { errore: 'x', prima: 500 }], 1600);
  assert.deepStrictEqual(r, { convertite: 2, errori: 1, prima: 5_000_000, dopo: 2_000_000, secondi: 1.6 });
});

// --- la libreria vera, sugli stessi file -------------------------------------
// Con wasmBinary gia' pronto, onRuntimeInitialized puo' arrivare prima che la
// fabbrica restituisca il modulo: si aspetta il giro successivo (come nel worker).
function carica() {
  return new Promise((ok) => {
    let pronto = false, modulo = null;
    const fine = () => { if (pronto && modulo) ok(modulo); };
    modulo = require(path.join(VENDOR, 'libheif.js'))({
      wasmBinary: fs.readFileSync(path.join(VENDOR, 'libheif.wasm')),
      onRuntimeInitialized() { pronto = true; setTimeout(fine, 0); }
    });
    fine();
  });
}

function decodifica(byte) {
  return carica().then((libheif) => new Promise((ok, ko) => {
    {
        try {
          const immagini = new libheif.HeifDecoder().decode(byte);
          const im = immagini[0];
          const w = im.get_width(), h = im.get_height();
          im.display({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }, (out) => {
            if (!out) return ko(new Error('decodifica fallita'));
            ok({ quante: immagini.length, w, h, px: (x, y) => Array.from(out.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3)) });
          });
        } catch (e) { ko(e); }
    }
  }));
}

const vicino = (a, b, tolleranza) => a.every((v, i) => Math.abs(v - b[i]) <= tolleranza);

test('la libreria in vendor/ decodifica le foto con i colori giusti', async () => {
  const g = await decodifica(leggi('gradiente-64x48.heic'));
  assert.deepStrictEqual([g.quante, g.w, g.h], [1, 64, 48]);
  // gradiente: rosso cresce con x, verde con y, blu fisso a 128 (HEVC e' con perdita: tolleranza)
  for (const [x, y] of [[0, 0], [63, 0], [0, 47], [32, 24], [63, 47]]) {
    const atteso = [Math.round(255 * x / 63), Math.round(255 * y / 47), 128];
    assert.ok(vicino(g.px(x, y), atteso, 12), `(${x},${y}) ${g.px(x, y)} invece di ${atteso}`);
  }
  const r = await decodifica(leggi('rosso-17x9.heic'));
  assert.deepStrictEqual([r.w, r.h], [17, 9]);
  assert.ok(vicino(r.px(8, 4), [200, 30, 40], 8), String(r.px(8, 4)));
  const d = await decodifica(leggi('due-immagini.heic'));
  assert.strictEqual(d.quante, 2);
});
