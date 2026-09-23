// tests/service-worker.test.js — sw.js deve almeno valutarsi senza errori.
//
// Perche' esiste: js/layout.js registra il service worker con un .catch() vuoto.
// Un errore dentro sw.js quindi non si vede da nessuna parte, il worker non si
// registra e il sito perde la modalita offline in silenzio. E' successo davvero
// durante questo lavoro, con una espressione regolare scritta male.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.resolve(__dirname, '..');
const SORGENTE = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');

// Contesto minimo che imita l'ambiente di un service worker.
function contestoWorker() {
  const ascoltatori = {};
  const cacheFinta = {
    add: async () => {}, addAll: async () => {}, put: async () => {},
    match: async () => undefined, keys: async () => []
  };
  const self = {
    addEventListener(evento, richiamo) { (ascoltatori[evento] = ascoltatori[evento] || []).push(richiamo); },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    location: new URL('https://strumentiutili.it/sw.js'),
    registration: {}
  };
  const contesto = {
    self,
    caches: { open: async () => cacheFinta, keys: async () => [], delete: async () => true, match: async () => undefined },
    fetch: async () => ({ status: 200, type: 'basic', clone: () => ({}) }),
    URL, Request: class {}, Response: class {}, console,
    Promise, setTimeout, clearTimeout
  };
  contesto.globalThis = contesto;
  vm.createContext(contesto);
  return { contesto, ascoltatori, self };
}

test('sw.js si valuta senza errori', () => {
  const { contesto } = contestoWorker();
  assert.doesNotThrow(() => {
    vm.runInContext(SORGENTE, contesto, { filename: 'sw.js' });
  }, 'sw.js non si valuta: il service worker non si registrerebbe, e il .catch() vuoto in js/layout.js lo nasconderebbe');
});

test('registra i gestori install, activate e fetch', () => {
  const { contesto, ascoltatori } = contestoWorker();
  vm.runInContext(SORGENTE, contesto, { filename: 'sw.js' });
  for (const evento of ['install', 'activate', 'fetch']) {
    assert.ok(ascoltatori[evento] && ascoltatori[evento].length, 'manca il gestore ' + evento);
  }
});

test('il nome della cache e versionato', () => {
  assert.match(SORGENTE, /const CACHE_NAME = 'strumentiutili-v\d+'/,
    'senza versione nel nome della cache i client restano su file vecchi');
});

test('le voci del precache esistono su disco', () => {
  const voci = [...SORGENTE.matchAll(/^\s*'(\/[^']*)',?\s*$/gm)].map((m) => m[1]);
  assert.ok(voci.length > 100, 'trovate solo ' + voci.length + ' voci nel precache');

  // /contatti/ e le altre legali esistono solo come .html: le risolve
  // cleanUrls di Vercel, quindi qui si accettano entrambe le forme.
  const mancanti = voci.filter((voce) => {
    let p = voce === '/' ? 'index.html' : voce.replace(/^\//, '');
    if (p.endsWith('/')) p += 'index.html';
    if (fs.existsSync(path.join(RADICE, p))) return false;
    const conHtml = voce.replace(/\/$/, '') + '.html';
    return !fs.existsSync(path.join(RADICE, conHtml.replace(/^\//, '')));
  });
  assert.deepStrictEqual(mancanti, [], 'voci del precache che non esistono');
});

test('il dataset dei comuni non e nel precache', () => {
  // 4,65 MB usati da tre pagine su 126: li prende la strategia di runtime.
  assert.ok(!/'\/data\/comuni\.json'/.test(SORGENTE),
    'comuni.json nel precache: da solo era un terzo del peso iniziale');
});

test('il precache resta sotto i 10 MB', () => {
  const voci = [...SORGENTE.matchAll(/^\s*'(\/[^']*)',?\s*$/gm)].map((m) => m[1]);
  let byte = 0;
  for (const voce of voci) {
    let p = voce === '/' ? 'index.html' : voce.replace(/^\//, '');
    if (p.endsWith('/')) p += 'index.html';
    try { byte += fs.statSync(path.join(RADICE, p)).size; } catch (e) { /* risolta da cleanUrls */ }
  }
  const mb = byte / (1024 * 1024);
  assert.ok(mb < 10, 'il precache pesa ' + mb.toFixed(2) + ' MB: si scarica tutto alla prima visita');
});

test('gli statici usano la cache prima della rete', () => {
  assert.match(SORGENTE, /const STATICI = \/\^\\\/\(js\|css\|assets\|data\)\\\/\//,
    'espressione regolare degli statici assente o malformata');
});
