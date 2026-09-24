// tests/vendor.test.js — Le librerie servite dal sito stesso.
//
// Le librerie dei documenti (pdf.js, pdf-lib, comlink...) stanno in vendor/,
// copiate da node_modules con scripts/copia-vendor.js. Qui si controlla, senza
// bisogno di node_modules, che le pagine le prendano da li' e che i CDN
// rimasti siano solo quelli dichiarati: la pila dell'IA locale (modelli e
// motori pesanti), che passera' a vendor/ con l'aggiornamento a WebGPU.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const V = require('../scripts/copia-vendor.js');
const pacchetto = JSON.parse(fs.readFileSync(path.join(RADICE, 'package.json'), 'utf8'));

function* file(dir) {
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'vendor', 'tests', 'scripts'].includes(voce.name)) continue;
    const completo = path.join(dir, voce.name);
    if (voce.isDirectory()) yield* file(completo);
    else if (/\.(html|js)$/.test(voce.name) && !voce.name.endsWith('test.html')) yield completo;
  }
}
const SORGENTI = [...file(RADICE)].map((f) => ({ rel: path.relative(RADICE, f), testo: fs.readFileSync(f, 'utf8') }));

// Librerie che devono arrivare da vendor/: se ricompaiono su un CDN, il sito
// torna a non funzionare offline e a consegnare l'IP degli utenti a terzi.
const SOLO_VENDOR = /https:\/\/[^'"`\s]*(pdf-lib|pdf\.js\/|pdfjs-dist|fontkit|comlink|mammoth|jspdf|Chart\.js|chart\.js|docx@|qrcodejs|pdfmake)/i;

// Terze parti ancora ammesse, una per una.
const AMMESSI = [
  'pagead2.googlesyndication.com',               // AdSense (e la CMP di Google)
  'cdn.jsdelivr.net/npm/tesseract.js',           // OCR: motore...
  'cdn.jsdelivr.net/npm/tesseract.js-core',
  'unpkg.com/tesseract.js-core',
  'cdn.jsdelivr.net/npm/@tesseract.js-data/',    // ...e dati delle lingue
  'cdn.jsdelivr.net/gh/naptha/tessdata',
  'cdn.jsdelivr.net/npm/@xenova/transformers',   // trascrizione e traduzione
  'cdn.jsdelivr.net/npm/@vladmandic/face-api',   // fototessera
  'cdn.jsdelivr.net/npm/@mediapipe/tasks-vision',
  'storage.googleapis.com/mediapipe-models/',
  'docs.opencv.org/4.8.0/opencv.js',             // scanner documenti
  'esm.run/@mlc-ai/web-llm',                     // assistente documenti
];

test('le librerie dei documenti arrivano da vendor/, non da un CDN', () => {
  const problemi = [];
  for (const s of SORGENTI) {
    for (const riga of s.testo.split('\n')) {
      const m = riga.match(SOLO_VENDOR);
      if (m) problemi.push(s.rel + ' -> ' + m[0]);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('ogni percorso /vendor/ usato dal sito esiste', () => {
  const problemi = [];
  let trovati = 0;
  for (const s of SORGENTI) {
    for (const m of s.testo.matchAll(/\/vendor\/[A-Za-z0-9@._-]+\/[A-Za-z0-9._-]+/g)) {
      trovati++;
      if (!fs.existsSync(path.join(RADICE, m[0]))) problemi.push(s.rel + ' -> ' + m[0]);
    }
  }
  assert.ok(trovati > 50, 'solo ' + trovati + ' riferimenti a /vendor/: il test non sta guardando niente');
  assert.deepStrictEqual(problemi, []);
});

test('i CDN rimasti sono solo quelli dichiarati', () => {
  const problemi = [];
  const re = /https:\/\/(unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.run|docs\.opencv\.org|storage\.googleapis\.com)\/[^'"`\s)]*/g;
  for (const s of SORGENTI) {
    for (const m of s.testo.matchAll(re)) {
      if (!AMMESSI.some((a) => m[0].includes(a))) problemi.push(s.rel + ' -> ' + m[0]);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('ogni cartella di vendor/ corrisponde a una versione fissata in package.json', () => {
  // La versione nel nome della cartella e nell'URL deve essere quella esatta
  // del package.json (--save-exact): un "^" la farebbe cambiare a ogni npm ci.
  const dip = Object.assign({}, pacchetto.dependencies, pacchetto.devDependencies);
  const cartelle = fs.readdirSync(path.join(RADICE, 'vendor'));
  const problemi = [];
  for (const lib of V.LIBRERIE) {
    const versione = dip[lib.pacchetto];
    if (!versione || !/^\d+\.\d+\.\d+$/.test(versione)) { problemi.push(lib.pacchetto + ': versione non fissata (' + versione + ')'); continue; }
    const cartella = lib.nome + '@' + versione;
    if (!cartelle.includes(cartella)) problemi.push('manca vendor/' + cartella);
    else if (!fs.existsSync(path.join(RADICE, 'vendor', cartella, 'LICENSE'))) problemi.push('vendor/' + cartella + ' senza LICENSE');
  }
  const attese = new Set(V.LIBRERIE.map((l) => l.nome + '@' + dip[l.pacchetto]));
  cartelle.filter((c) => !attese.has(c)).forEach((c) => problemi.push('cartella non dichiarata: vendor/' + c));
  assert.deepStrictEqual(problemi, []);
});
