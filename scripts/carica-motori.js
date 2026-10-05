// scripts/carica-motori.js — Carica gli script del sito dentro un contesto
// Node con un DOM finto: cosi' i motori di calcolo scritti per il browser
// (window.IMUCalculator, window.StipendioNetto...) si usano anche fuori.
//
// Lo usano i test (tests/helpers/carica-script.js lo riesporta) e i
// generatori che scrivono cifre nelle pagine, come scripts/genera-guide.js:
// i numeri di una guida li calcola lo stesso codice dello strumento.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');

function elementoFinto() {
  return {
    value: '',
    textContent: '',
    innerHTML: '',
    checked: false,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

// Carica uno o più script (percorsi relativi alla radice del progetto) in un
// unico contesto condiviso, nell'ordine dato — come farebbe il browser.
function caricaScript(percorsi) {
  const ascoltatori = {};

  const document = {
    addEventListener(evento, richiamo) {
      (ascoltatori[evento] = ascoltatori[evento] || []).push(richiamo);
    },
    removeEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return elementoFinto(); },
    body: elementoFinto(),
    documentElement: elementoFinto()
  };

  const window = {
    document,
    addEventListener() {},
    removeEventListener() {},
    navigator: { userAgent: 'node' },
    location: { href: 'https://strumentiutili.it/' },
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    }
  };

  const contesto = {
    window,
    document,
    console,
    Intl,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    fetch: undefined
  };
  contesto.self = window;
  contesto.globalThis = contesto;

  vm.createContext(contesto);

  for (const relativo of percorsi) {
    const assoluto = path.join(RADICE, relativo);
    const codice = fs.readFileSync(assoluto, 'utf8');
    vm.runInContext(codice, contesto, { filename: relativo });
  }

  return { window, document, contesto, ascoltatori };
}

function regoleFiscali() {
  return JSON.parse(
    fs.readFileSync(path.join(RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8')
  );
}

module.exports = { caricaScript, regoleFiscali, RADICE };
