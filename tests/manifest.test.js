// tests/manifest.test.js — Il manifest della PWA e il service worker devono
// parlare la stessa lingua: se il manifest manda il file come "file" e sw.js
// lo cerca come "files", la condivisione arriva vuota e nessuno se ne accorge.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(RADICE, 'manifest.json'), 'utf8'));
const SW = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');

const esiste = (url) => fs.existsSync(path.join(RADICE, url, 'index.html'));

test('share_target: POST multipart verso una pagina che esiste ed e in cache', () => {
  const st = M.share_target;
  assert.ok(st, 'share_target assente');
  assert.strictEqual(st.method, 'POST');
  assert.strictEqual(st.enctype, 'multipart/form-data');
  assert.ok(esiste(st.action), st.action + ' non esiste');
  assert.ok(SW.includes("'" + st.action + "'"), st.action + ' non e nel precache di sw.js');
  assert.ok(SW.includes("url.pathname === '" + st.action + "'"), 'sw.js non intercetta il POST verso ' + st.action);
});

test('i nomi dei campi condivisi sono quelli che sw.js legge', () => {
  const p = M.share_target.params;
  assert.ok(SW.includes("dati.getAll('" + p.files[0].name + "')"), 'sw.js non legge il campo file "' + p.files[0].name + '"');
  for (const campo of [p.title, p.text, p.url]) {
    assert.ok(SW.includes("'" + campo + "'"), 'sw.js non legge il campo di testo "' + campo + '"');
  }
});

test('file_handlers e shortcuts portano a pagine esistenti', () => {
  const problemi = [];
  for (const h of M.file_handlers || []) {
    if (!esiste(h.action)) problemi.push('file_handler -> ' + h.action);
    for (const [tipo, estensioni] of Object.entries(h.accept)) {
      if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(tipo)) problemi.push('tipo MIME non valido: ' + tipo);
      estensioni.forEach((e) => { if (!/^\.[a-z0-9]+$/.test(e)) problemi.push('estensione non valida: ' + e); });
    }
  }
  for (const s of M.shortcuts || []) {
    if (!esiste(s.url)) problemi.push('shortcut -> ' + s.url);
    if (!s.name || !s.short_name) problemi.push('shortcut senza nome: ' + s.url);
  }
  assert.ok((M.shortcuts || []).length >= 1 && (M.shortcuts || []).length <= 4, 'Android ne mostra al massimo 4');
  assert.deepStrictEqual(problemi, []);
});

test('le pagine che ricevono file dal sistema caricano condivisi.js', () => {
  const problemi = [];
  const destinazioni = new Set([M.share_target.action].concat((M.file_handlers || []).map((h) => h.action)));
  for (const url of destinazioni) {
    const html = fs.readFileSync(path.join(RADICE, url, 'index.html'), 'utf8');
    if (!html.includes('src="/js/condivisi.js"')) problemi.push(url);
  }
  assert.deepStrictEqual(problemi, []);
});

// Qualsiasi file si puo' condividere verso l'app: quelli che nessuno
// strumento lavora finiscono in /condividi/, che propone «Che file è?».
test('share_target accetta qualsiasi file', () => {
  assert.ok(M.share_target.params.files[0].accept.includes('*/*'));
  assert.ok(esiste('/utilita-web/che-file-e/'));
});
