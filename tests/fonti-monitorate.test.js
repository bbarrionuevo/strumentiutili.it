// tests/fonti-monitorate.test.js — Il registro delle fonti che la sentinella controlla.
//
// data/fonti-monitorate.json dice alla sentinella quali schede ufficiali
// rileggere, quali cifre ci devono essere e quando ricontrollare i dati che
// scadono. Qui si controlla che ogni voce punti a dati e pagine che esistono:
// un registro sbagliato e' una sentinella che non vede. Le date non fanno
// fallire i test: le scadenze arrivano come issue, non come CI rossa.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../scripts/sentinella/controlli.js');

const RADICE = path.resolve(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');
const R = JSON.parse(leggi('data/fonti-monitorate.json'));
const regole = JSON.parse(leggi('data/regole-fiscali-2026.json'));

function datiEsistono(dati, chi) {
  for (const d of dati || []) assert.notStrictEqual(C.valore(regole, d), undefined, `${chi}: ${d} non esiste in regole-fiscali-2026.json`);
}

test('schede: id unici, indirizzi ufficiali, dati e pagine che esistono', () => {
  const ids = new Set();
  for (const s of R.schede) {
    assert.ok(/^[a-z0-9-]+$/.test(s.id) && !ids.has(s.id), 'id non valido o ripetuto: ' + s.id);
    ids.add(s.id);
    assert.ok(['pagina', 'pdf', 'stato'].includes(s.tipo), s.id + ': tipo ' + s.tipo);
    assert.match(s.url, /^https:\/\/[^\s]+$/, s.id);
    datiEsistono(s.dati, s.id);
    for (const p of s.pagine || []) assert.ok(fs.existsSync(path.join(RADICE, p, 'index.html')), `${s.id}: la pagina ${p} non esiste`);
    for (const m of s.motori || []) assert.ok(fs.existsSync(path.join(RADICE, m)), `${s.id}: ${m} non esiste`);
    if (s.deve_contenere) {
      assert.strictEqual(s.tipo, 'pagina', s.id + ': le espressioni si cercano solo nelle pagine');
      assert.ok(s.deve_contenere.length && s.deve_contenere.every((e) => typeof e === 'string' && e.trim().length >= 3), s.id);
    }
  }
});

test('ogni indirizzo scritto nelle regole fiscali e\' sorvegliato', () => {
  const nelRegistro = new Set(R.schede.map((s) => s.url));
  const indirizzi = [];
  (function giro(o) {
    if (typeof o === 'string' && /^https:\/\//.test(o)) indirizzi.push(o);
    else if (o && typeof o === 'object') Object.values(o).forEach(giro);
  })(regole);
  assert.ok(indirizzi.length >= 8);
  // quelli di Normattiva la sentinella li trova da sola
  const scoperti = indirizzi.filter((u) => !u.startsWith('https://www.normattiva.it/') && !nelRegistro.has(u));
  assert.deepStrictEqual(scoperti, [], 'aggiungere queste fonti a data/fonti-monitorate.json');
});

test('le cifre del canone controllate nella fonte sono quelle dei dati', () => {
  const come = R.schede.find((s) => s.id === 'canone-tv-come-si-paga');
  assert.ok(come.deve_contenere.includes(`${regole.canone_tv.importo_annuo} euro l'anno`));
  const over75 = R.schede.find((s) => s.id === 'canone-tv-over-75');
  assert.ok(over75.deve_contenere.includes(String(regole.canone_tv.esenzione_over_75.soglia_reddito).replace(/\B(?=(\d{3})+$)/g, '.') + ' euro'));
});

test('pagine dei modelli in piu\': file che esistono', () => {
  for (const p of R.pagine_modelli) {
    assert.match(p.url, /^https:\/\/www\.agenziaentrate\.gov\.it\/portale\//, p.id);
    for (const f of p.file) assert.ok(fs.existsSync(path.join(RADICE, f)), `${p.id}: ${f} non esiste`);
  }
});

test('scadenze: id unici, date valide, testo e dati collegati', () => {
  const ids = new Set();
  for (const s of R.scadenze) {
    assert.ok(/^[a-z0-9-]+$/.test(s.id) && !ids.has(s.id), 'id non valido o ripetuto: ' + s.id);
    ids.add(s.id);
    assert.ok(C.isoValida(s.dal), s.id + ': data ' + s.dal);
    assert.ok(s.ripeti === undefined || ['mese', 'trimestre', 'anno'].includes(s.ripeti), s.id + ': ripeti ' + s.ripeti);
    assert.ok(s.titolo && s.titolo.length <= 120, s.id + ': titolo');
    assert.ok(s.cosa && s.cosa.length >= 40, s.id + ': spiegare cosa controllare');
    if (s.fonte) assert.match(s.fonte, /^https:\/\//, s.id);
    datiEsistono(s.dati, s.id);
  }
});

test('la sentinella gira ogni settimana, non scrive su main e non passa testo esterno alla shell', () => {
  const w = leggi('.github/workflows/sentinella.yml');
  assert.match(w, /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* 1'/);
  assert.match(w, /main\|''\) echo/);
  assert.match(w, /issues: write/);
  assert.doesNotMatch(w, /\$\{\{\s*(steps|needs)\./, 'nessun output di un passo interpolato nel codice');
  assert.doesNotMatch(w, /run:[^\n]*\$\{\{\s*inputs\./, 'gli input passano da variabili d\'ambiente');
  const issue = leggi('scripts/sentinella-issue.js');
  assert.match(issue, /--body-file/);
  assert.doesNotMatch(issue, /shell:\s*true|execSync|exec\(/);
  assert.ok(!fs.existsSync(path.join(RADICE, '.github', 'workflows', 'controlla-collegamenti.yml')), 'i collegamenti li controlla la sentinella');
});

test('archivio e istruzioni per la manutenzione non finiscono online', () => {
  const ignora = leggi('.vercelignore');
  for (const voce of ['fonti/', 'CLAUDE.md', '.claude/']) assert.match(ignora, new RegExp('^/?' + voce.replace('.', '\\.') + '$', 'm'), voce);
});
