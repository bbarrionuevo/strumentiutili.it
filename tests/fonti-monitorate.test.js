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

// Regola del progetto: ogni dato che invecchia deve avere un modo per
// accorgersi che e' cambiato. Chi aggiunge un blocco a regole-fiscali (o uno
// strumento nuovo con dati propri) deve dire qui come lo si sorveglia.
test('ogni blocco delle regole fiscali ha una sorveglianza', () => {
  const blocchi = Object.keys(regole).filter((k) => k !== 'meta').sort();
  assert.deepStrictEqual(Object.keys(R.copertura).sort(), blocchi,
    'aggiungere in data/fonti-monitorate.json, sotto "copertura", come si sorvegliano i blocchi nuovi (e togliere quelli spariti)');

  const { collegamenti } = require('../scripts/controlla-collegamenti.js');
  const seguite = new Set([...collegamenti().keys()].filter((u) => u.includes('normattiva.it/uri-res/')));
  (function giro(o) {
    if (typeof o === 'string' && o.includes('normattiva.it/uri-res/')) seguite.add(o);
    else if (o && typeof o === 'object') Object.values(o).forEach(giro);
  })(regole);
  for (const u of R.norme) seguite.add(u);
  const urn = (u) => u.split('urn:nir:')[1];
  const schede = new Set(R.schede.map((s) => s.id));
  const scadenze = new Set(R.scadenze.map((s) => s.id));
  const modelli = new Set([...R.pagine_modelli.map((m) => m.id), ...Object.keys(require('../scripts/sentinella.js').modelli())]);
  const serie = new Set(['tasso-bce', 'interessi-legali', 'istat-foi']);
  const vivi = new Set(R.dati_vivi.map((d) => d.id));

  for (const [k, c] of Object.entries(R.copertura)) {
    for (const n of c.norme || []) assert.ok([...seguite].some((u) => urn(u) === n), `${k}: la norma ${n} non e' fra quelle che la sentinella rilegge (aggiungerla a "norme")`);
    for (const x of c.schede || []) assert.ok(schede.has(x), `${k}: scheda ${x} inesistente`);
    for (const x of c.scadenze || []) assert.ok(scadenze.has(x), `${k}: scadenza ${x} inesistente`);
    for (const x of c.modelli || []) assert.ok(modelli.has(x), `${k}: modello ${x} non sorvegliato`);
    for (const x of c.serie || []) assert.ok(serie.has(x), `${k}: serie ${x} sconosciuta`);
    for (const x of c.dati_vivi || []) assert.ok(vivi.has(x), `${k}: dati_vivi ${x} inesistente`);
    // qualcosa che scatta nel tempo (scheda, scadenza, modello, serie, dati vivi)
    // oppure la sola legge, ma allora si spiega perche' basta
    const periodico = ['schede', 'scadenze', 'modelli', 'serie', 'dati_vivi'].some((f) => (c[f] || []).length);
    assert.ok(periodico || ((c.norme || []).length && c.nota && c.nota.length >= 40),
      `${k}: serve una scheda, una scadenza, un modello, una serie o dati vivi; con le sole norme, una nota che spieghi perche' bastano`);
  }
});

test('ogni modello ufficiale in assets/pdf e\' sorvegliato', () => {
  // un compilatore nuovo parte da un PDF ufficiale: deve stare in MODELLI di
  // scripts/scarica-modelli-ufficiali.py (o, se l'ha caricato Brian, in pagine_modelli)
  const inModelli = new Set(Object.keys(require('../scripts/sentinella.js').modelli()));
  const inPagine = new Set(R.pagine_modelli.flatMap((m) => m.file.map((f) => path.basename(f))));
  const ufficiali = fs.readdirSync(path.join(RADICE, 'assets', 'pdf')).filter((f) => /-(ufficiale|editabile)\.pdf$|^istruzioni-/.test(f));
  assert.ok(ufficiali.length >= 20);
  assert.deepStrictEqual(ufficiali.filter((f) => !inModelli.has(f) && !inPagine.has(f)), [],
    'aggiungere questi PDF a MODELLI o a pagine_modelli, perche\' la sentinella se ne accorga quando l\'Agenzia li cambia');
});

test('norme in piu\' e dati vivi: indirizzi e file validi', () => {
  for (const u of R.norme) assert.match(u, /^https:\/\/www\.normattiva\.it\/uri-res\/N2Ls\?urn:nir:/, u);
  const ids = new Set();
  for (const d of R.dati_vivi) {
    assert.ok(/^[a-z0-9-]+$/.test(d.id) && !ids.has(d.id), 'id non valido o ripetuto: ' + d.id);
    ids.add(d.id);
    assert.ok(fs.existsSync(path.join(RADICE, d.file)), `${d.id}: ${d.file} non esiste`);
    assert.ok(Number.isInteger(d.max_giorni) && d.max_giorni >= 1, d.id + ': max_giorni');
    assert.ok(typeof d.campo === 'string' && d.campo, d.id + ': campo con la data');
    if (d.workflow) assert.ok(fs.existsSync(path.join(RADICE, '.github', 'workflows', d.workflow)), `${d.id}: workflow ${d.workflow} inesistente`);
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
