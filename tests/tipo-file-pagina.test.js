// tests/tipo-file-pagina.test.js — La pagina "Che file è?": elementi, script,
// sicurezza (il contenuto del file entra solo come testo e non si apre mai
// come pagina del sito), passaggio agli altri strumenti e registrazione.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testoVisibile } = require('./helpers/contenuti.js');

const RADICE = path.join(__dirname, '..');
const leggi = (...p) => fs.readFileSync(path.join(RADICE, ...p), 'utf8');
const HTML = leggi('utilita-web', 'che-file-e', 'index.html');
const UI = leggi('js', 'tipo-file-ui.js');
const C = require('../js/condivisi.js');
const T = require('../js/tipo-file.js');

test('ogni id usato dallo script esiste nella pagina', () => {
  const usati = new Set([...UI.matchAll(/getElementById\('([a-z0-9-]+)'\)/g)].map((m) => m[1]));
  // quelli creati dallo script stesso
  const creati = new Set([...UI.matchAll(/\.id = '([a-z0-9-]+)'/g)].map((m) => m[1]));
  for (const id of usati) assert.ok(HTML.includes('id="' + id + '"') || creati.has(id), id);
  for (const id of ['tf-file', 'tf-drop', 'tf-nome', 'tf-esito', 'tf-risultato']) assert.ok(HTML.includes('id="' + id + '"'), id);
});

test('il campo accetta qualsiasi file e riceve quelli condivisi', () => {
  const campo = HTML.match(/<input id="tf-file"[^>]*>/)[0];
  assert.ok(/data-condivisi/.test(campo));
  assert.ok(!/accept=/.test(campo), 'nessun filtro: deve accettare anche i file senza estensione');
  const ordine = [...HTML.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  const ui = ordine.indexOf('tipo-file-ui.js');
  for (const s of ['dropzone.js', 'p7m-lettura.js', 'exif.js', 'tipo-file.js']) {
    assert.ok(ordine.indexOf(s) >= 0 && ordine.indexOf(s) < ui, s + ' prima della UI');
  }
  assert.ok(ordine.includes('condivisi.js'));
  for (const m of UI.matchAll(/'(\/vendor\/[^']+)'/g)) assert.ok(fs.existsSync(path.join(RADICE, m[1])), m[1]);
});

test('il contenuto del file entra solo come testo', () => {
  assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=|document\.write/.test(UI));
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(UI), 'il file non esce dal browser');
  // pdf.js senza la strada del CVE-2024-4367
  for (const m of UI.matchAll(/getDocument\(([^)]*)\)/g)) assert.match(m[1], /isEvalSupported: false/);
});

test('HTML, SVG e XML non si aprono mai in una scheda del sito', () => {
  const blocco = (nome) => {
    const m = UI.match(new RegExp('var ' + nome + ' = \\{([^}]*)\\}'));
    return new Set([...m[1].matchAll(/(\w+):/g)].map((x) => x[1]));
  };
  const scheda = blocco('IN_SCHEDA');
  const mai = blocco('MAI_IN_SCHEDA');
  for (const id of ['html', 'svg', 'xml', 'fatturapa']) {
    assert.ok(!scheda.has(id), id + ' non deve aprirsi in una scheda');
    assert.ok(mai.has(id), id + ' va scaricato come dato generico');
  }
  // i testi si aprono come text/plain, qualunque cosa contengano
  assert.match(UI, /text\/plain;charset=/);
});

test('"Continua con" porta a strumenti che esistono e accettano il file', () => {
  const generi = [...UI.slice(UI.indexOf('var GENERE = {'), UI.indexOf('};', UI.indexOf('var GENERE = {'))).matchAll(/(\w+): '(\w+)'/g)];
  assert.ok(generi.length >= 15);
  const problemi = [];
  for (const [, id, genere] of generi) {
    const tipo = T.TIPI[id];
    if (!tipo) { problemi.push(id + ': tipo sconosciuto al motore'); continue; }
    const azioni = C.azioniPerGenere(genere);
    if (!azioni.length) problemi.push(id + ': nessuna azione per ' + genere);
    for (const a of azioni) {
      const html = leggi(a.percorso, 'index.html');
      const campo = (html.match(/<input[^>]*type="file"[^>]*data-condivisi[^>]*>|<input[^>]*data-condivisi[^>]*type="file"[^>]*>/) || [''])[0];
      if (!campo) { problemi.push(a.percorso + ' senza campo data-condivisi'); continue; }
      if (!html.includes('src="/js/condivisi.js"')) problemi.push(a.percorso + ' non carica condivisi.js');
      // il file arriva con nome e tipo giusti: deve passare il filtro "accept"
      const accetta = ((campo.match(/accept="([^"]*)"/) || [])[1] || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      const ok = !accetta.length || accetta.some((x) => x === '.' + tipo.estensione || x === tipo.mime || (x.endsWith('/*') && tipo.mime.startsWith(x.slice(0, -1))));
      if (!ok) problemi.push(id + ' -> ' + a.percorso + ' rifiuterebbe ' + tipo.mime);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('le domande frequenti sono visibili e il testo parla del contenuto, non del nome', () => {
  const visibile = testoVisibile(HTML);
  const blocchi = [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocchi.flatMap((b) => b['@graph'] || [b]).find((x) => x['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage presente');
  const domande = faq.mainEntity.map((q) => q.name);
  assert.ok(domande.length >= 6);
  for (const d of domande) assert.ok(visibile.includes(d), 'domanda non visibile: ' + d);
  assert.match(visibile, /dal contenuto, non dal nome/);
  assert.match(visibile, /non viene caricato su nessun server/);
});

test('registrata: precache, indice, sitemap, categoria, home, barre laterali, privacy e stile', () => {
  const sw = leggi('sw.js');
  for (const u of ['/utilita-web/che-file-e/', '/js/tipo-file.js', '/js/tipo-file-ui.js', '/js/exif.js', '/js/p7m-lettura.js']) {
    assert.ok(sw.includes("'" + u + "'"), u);
  }
  assert.ok(leggi('data', 'strumenti.json').includes('/utilita-web/che-file-e/'));
  assert.ok(leggi('sitemap.xml').includes('/utilita-web/che-file-e/'));
  assert.ok(leggi('utilita-web', 'index.html').includes('href="/utilita-web/che-file-e/"'));
  assert.ok(leggi('index.html').includes('href="/utilita-web/che-file-e/"'));
  for (const p of ['pdf/apri-file-p7m', 'utilita-web/convertitore-immagini', 'utilita-web/rimuovi-dati-foto', 'fisco-professioni/fattura-elettronica']) {
    assert.ok(leggi(p, 'index.html').includes('href="/utilita-web/che-file-e/"'), p);
  }
  assert.match(leggi('politica-sulla-privacy.html'), /Che file è\?/);
  assert.ok(leggi('src', 'input.css').includes('@source "../js/tipo-file-ui.js"'));
});

test('"Aprire un file P7M" usa il motore per i documenti che non riconosce', () => {
  const pagina = leggi('pdf', 'apri-file-p7m', 'index.html');
  const ordine = [...pagina.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ordine.indexOf('tipo-file.js') >= 0 && ordine.indexOf('tipo-file.js') < ordine.indexOf('p7m-ui.js'));
  const ui = leggi('js', 'p7m-ui.js');
  assert.match(ui, /window\.TipoFile/);
  assert.match(ui, /\/utilita-web\/che-file-e\//);
});
