// tests/integrazione-caricamento.test.js — Percorso reale di avvio.
//
// Ogni calcolatrice legge le regole fiscali attraverso js/data-loader.js.
// Qui si simula quello che fa il browser: si caricano data-loader e la
// calcolatrice nello stesso contesto, si scatena DOMContentLoaded e si
// verifica che l avvio non sollevi eccezioni e che il JSON venga scaricato
// UNA volta sola, anche con più strumenti nella stessa pagina.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.resolve(__dirname, '..');
const REGOLE = fs.readFileSync(path.join(RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8');

// Tutte le calcolatrici che dipendono dalle regole fiscali.
const CALCOLATRICI = [
  'aliquote-irpef', 'analizzatore-bolletta', 'assegno-unico', 'bollo-auto',
  'contributo-unificato', 'fatturapa', 'hr-dimissioni', 'imposta-locazioni',
  'imposte-casa', 'interessi-moratori', 'isee', 'mutuo', 'naspi',
  'parcella-avvocato', 'partita-iva', 'passaggio-proprieta', 'ravvedimento',
  'ricevuta-occasionale', 'ritenuta', 'rivalutazione-istat', 'rli',
  'simulatore-pensione', 'stipendio-netto', 'successioni', 'tfr', 'usufrutto'
];

function elementoFinto() {
  const el = {
    value: '', textContent: '', innerHTML: '', checked: false, files: [],
    dataset: {}, style: {}, options: [], selectedIndex: 0, hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, click() {}, insertAdjacentHTML() {}
  };
  return el;
}

// Monta un contesto browser-like. `conDom` decide se getElementById trova
// elementi: con null molte calcolatrici escono subito, con elementi finti
// arrivano più a fondo nel codice di avvio.
function montaContesto({ conDom }) {
  let chiamateFetch = 0;
  const ascoltatori = {};

  const document = {
    addEventListener(ev, cb) { (ascoltatori[ev] = ascoltatori[ev] || []).push(cb); },
    removeEventListener() {},
    getElementById() { return conDom ? elementoFinto() : null; },
    querySelector() { return conDom ? elementoFinto() : null; },
    querySelectorAll() { return []; },
    createElement() { return elementoFinto(); },
    body: elementoFinto(),
    documentElement: elementoFinto(),
    readyState: 'loading'
  };

  const window = {
    document,
    addEventListener() {}, removeEventListener() {},
    navigator: { userAgent: 'node' },
    location: { href: 'https://strumentiutili.it/', search: '' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    alert() {}, print() {}, requestAnimationFrame(cb) { return setTimeout(cb, 0); }
  };

  const contesto = {
    window, document, console: { log() {}, warn() {}, error() {} },
    Intl, URL, URLSearchParams, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch(url) {
      chiamateFetch++;
      if (String(url).includes('regole-fiscali-2026.json')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(REGOLE)) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    }
  };
  contesto.self = window;
  contesto.globalThis = contesto;
  vm.createContext(contesto);

  return {
    contesto, ascoltatori, window,
    get chiamateFetch() { return chiamateFetch; },
    carica(relativo) {
      vm.runInContext(fs.readFileSync(path.join(RADICE, relativo), 'utf8'), contesto, { filename: relativo });
    },
    async avvia() {
      for (const cb of ascoltatori.DOMContentLoaded || []) await cb({ type: 'DOMContentLoaded' });
    }
  };
}

for (const nome of CALCOLATRICI) {
  test(`${nome}.js si avvia senza eccezioni`, async () => {
    // conDom: true perche nella pagina reale gli elementi esistono; con null
    // gli script falliscono nel cablare gli eventi, che e una loro fragilita
    // nota ma non c entra con il caricamento delle regole.
    const amb = montaContesto({ conDom: true });
    amb.carica('js/data-loader.js');
    amb.carica('js/irpef.js');          // richiesto da stipendio-netto e tfr
    amb.carica(`js/${nome}.js`);
    await amb.avvia();
    // lascia sfogare le promesse pendenti dell avvio
    await new Promise((r) => setTimeout(r, 0));
  });
}

test('tutte le calcolatrici passano dal data-loader', () => {
  for (const nome of CALCOLATRICI) {
    const codice = fs.readFileSync(path.join(RADICE, 'js', `${nome}.js`), 'utf8');
    assert.ok(
      !codice.includes("fetch('/data/regole-fiscali-2026.json')"),
      `${nome}.js scarica ancora il JSON per conto suo invece di usare StrumentiData`
    );
  }
});

test('il JSON fiscale viene scaricato una volta sola per pagina', async () => {
  const amb = montaContesto({ conDom: true });
  amb.carica('js/data-loader.js');
  const regole = amb.contesto.window.StrumentiData;

  // Cinque richieste concorrenti, come cinque strumenti nella stessa pagina
  const risultati = await Promise.all([
    regole.getRegoleFiscali(), regole.getRegoleFiscali(), regole.getRegoleFiscali(),
    regole.getRegoleFiscali(), regole.getRegoleFiscali()
  ]);

  assert.strictEqual(amb.chiamateFetch, 1, `il JSON e stato scaricato ${amb.chiamateFetch} volte`);
  for (const r of risultati) assert.ok(r && r.irpef, 'regole non caricate');
  // e la cache regge anche dopo
  await regole.getRegoleFiscali();
  assert.strictEqual(amb.chiamateFetch, 1);
});

test('ogni pagina che carica una calcolatrice carica prima il data-loader', () => {
  function* html(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) yield* html(p);
      else if (e.name.endsWith('.html')) yield p;
    }
  }

  const problemi = [];
  for (const file of html(RADICE)) {
    const s = fs.readFileSync(file, 'utf8');
    let prima = Infinity;
    for (const nome of CALCOLATRICI) {
      for (const defer of [' defer', '']) {
        const i = s.indexOf(`<script${defer} src="/js/${nome}.js"></script>`);
        if (i !== -1 && i < prima) prima = i;
      }
    }
    if (prima === Infinity) continue;
    const loader = s.indexOf('src="/js/data-loader.js"');
    if (loader === -1 || loader > prima) problemi.push(path.relative(RADICE, file));
  }

  assert.deepStrictEqual(problemi, [], 'pagine senza data-loader prima della calcolatrice');
});
