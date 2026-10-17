// tests/rivalutazione-istat.test.js — Gli indici ISTAT FOI del calcolatore di
// rivalutazione. La sentinella apre una issue verso meta' mese quando manca
// l'indice del mese prima (scripts/sentinella/controlli.js): chi lo aggiunge
// in data/regole-fiscali-2026.json deve aggiornare anche la riga della pagina
// che dice qual e' l'ultimo indice caricato. Il 17 ottobre 2026 l'indice di
// settembre (104,3, comunicato ISTAT «Prezzi al consumo - settembre 2026»)
// mancava e la pagina diceva ancora «agosto 2026».
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const REGOLE = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8'));
const FOI = REGOLE.rivalutazione_interessi_2026.serie_istat_foi;
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
  'settembre', 'ottobre', 'novembre', 'dicembre'];

/** L'ultimo mese della serie, come [anno, 'MM']. */
function ultimoMese() {
  const anno = Object.keys(FOI).sort().pop();
  return [anno, Object.keys(FOI[anno]).sort().pop()];
}

test('FOI: la pagina dice qual e\' l\'ultimo indice caricato, quello della serie', () => {
  const [anno, mese] = ultimoMese();
  const html = fs.readFileSync(path.join(RADICE, 'fisco-professioni', 'rivalutazione-istat', 'index.html'), 'utf8');
  assert.match(html, new RegExp(`l'ultimo indice caricato è quello di ${MESI[Number(mese) - 1]} ${anno}\\.`));
});

test('FOI: settembre 2026 dal comunicato ISTAT, senza buchi nella serie del 2026', () => {
  // ISTAT, «Prezzi al consumo - settembre 2026» (dati definitivi), prospetto 1:
  // FOI senza tabacchi 104,3, +0,6% su agosto (base 2025=100)
  assert.strictEqual(FOI['2026']['09'], 104.3);
  const mesi = Object.keys(FOI['2026']).sort();
  assert.deepStrictEqual(mesi, mesi.map((_, i) => String(i + 1).padStart(2, '0')));
  // +0,6% sul mese prima, come dice il comunicato (arrotondato a un decimale)
  assert.strictEqual(Math.round((FOI['2026']['09'] / FOI['2026']['08'] - 1) * 1000) / 10, 0.6);
});
