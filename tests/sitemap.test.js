// tests/sitemap.test.js — Il sitemap deve descrivere il sito che esiste.
//
// Prima lo aggiornava update-ecosystem.js aggiungendo in coda senza ripulire:
// 121 URL su 129 senza lastmod e le tre pagine legali contate due volte.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const L = require('../scripts/build-layout.js');
const S = require('../scripts/genera-sitemap.js');

const XML = fs.readFileSync(path.join(L.RADICE, 'sitemap.xml'), 'utf8');
const voci = [...XML.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<priority>([^<]+)<\/priority>\s*<\/url>/g)]
  .map((m) => ({ loc: m[1], lastmod: m[2], priority: m[3] }));

test('il sitemap versionato elenca quello che il generatore produce', () => {
  // Il confronto ignora i valori dei lastmod. Non e una scorciatoia: quella
  // data viene dall ultimo commit che ha toccato il file, e finche il commit
  // non esiste vale il mtime. Chi modifica una pagina un giorno e la committa
  // il giorno dopo vedrebbe fallire questo test senza avere sbagliato niente.
  // URL, ordine e priority restano confrontati alla lettera.
  assert.strictEqual(S.senzaDate(XML), S.senzaDate(S.genera()),
    'sitemap.xml non rigenerato. Esegui: node scripts/genera-sitemap.js');
});

test('ogni lastmod e una data vera e non sta nel futuro', () => {
  // E la parte di lastmod che ha senso imporre: che ci sia e che sia una data.
  const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const sbagliate = voci
    .filter((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v.lastmod) ||
                   Number.isNaN(Date.parse(v.lastmod)) ||
                   v.lastmod > domani)
    .map((v) => v.loc + ' -> ' + v.lastmod);
  assert.deepStrictEqual(sbagliate, []);
});

test('ogni voce ha loc, lastmod e priority', () => {
  const totali = (XML.match(/<url>/g) || []).length;
  assert.strictEqual(voci.length, totali, 'ci sono <url> senza tutti e tre i campi');
  assert.ok(voci.length > 100, 'solo ' + voci.length + ' URL nel sitemap');
});

test('nessuna URL duplicata', () => {
  const viste = new Set();
  const doppie = [];
  for (const v of voci) {
    if (viste.has(v.loc)) doppie.push(v.loc);
    viste.add(v.loc);
  }
  assert.deepStrictEqual(doppie, [],
    'le pagine legali comparivano sia come .html sia con la barra finale');
});

test('il sitemap elenca esattamente le pagine attive', () => {
  const attese = new Set(L.pagineAttive().map((p) => L.SITO + L.urlPagina(p.rel)));
  const presenti = new Set(voci.map((v) => v.loc));

  const mancanti = [...attese].filter((u) => !presenti.has(u));
  const diPiu = [...presenti].filter((u) => !attese.has(u));

  assert.deepStrictEqual(mancanti, [], 'pagine attive fuori dal sitemap');
  assert.deepStrictEqual(diPiu, [], 'URL nel sitemap che non corrispondono a una pagina attiva');
});

test('niente URL delle vecchie cartelle o file di prova', () => {
  const vietate = voci.filter((v) =>
    /\/(burocrazia|lavoro|finanza|media)\//.test(v.loc) ||
    /test\.html|fototessera\.html|\.html$/.test(v.loc));
  assert.deepStrictEqual(vietate.map((v) => v.loc), []);
});

test('le date sono nel formato YYYY-MM-DD e non nel futuro', () => {
  const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const strane = voci.filter((v) => !/^\d{4}-\d{2}-\d{2}$/.test(v.lastmod) || v.lastmod > domani);
  assert.deepStrictEqual(strane.map((v) => v.loc + ' ' + v.lastmod), []);
});

test('le varianti pSEO hanno priority piu bassa delle pagine originali', () => {
  const indice = JSON.parse(fs.readFileSync(path.join(L.RADICE, 'data', 'strumenti.json'), 'utf8'));
  const varianti = new Set((indice.strumenti || []).filter((s) => s.variante).map((s) => s.percorso));
  assert.ok(varianti.size > 20, 'attese piu di 20 varianti, trovate ' + varianti.size);

  const sbagliate = voci.filter((v) => {
    const percorso = v.loc.replace(L.SITO, '');
    if (!varianti.has(percorso)) return false;
    return Number(v.priority) >= 0.8;
  });
  assert.deepStrictEqual(sbagliate.map((v) => v.loc), [],
    'sono quasi identiche fra loro: non vanno dichiarate come le pagine originali');
});

test('la home e la pagina con priority piu alta', () => {
  const home = voci.find((v) => v.loc === L.SITO + '/');
  assert.ok(home, 'la home non e nel sitemap');
  assert.strictEqual(home.priority, '1.0');
  assert.strictEqual(voci.filter((v) => v.priority === '1.0').length, 1);
});

test('robots.txt punta al sitemap', () => {
  const robots = fs.readFileSync(path.join(L.RADICE, 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap:\s*https:\/\/strumentiutili\.it\/sitemap\.xml/);
});
