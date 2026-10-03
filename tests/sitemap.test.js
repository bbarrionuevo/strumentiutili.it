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
  // Le varianti pSEO (noindex) non ci sono: restano le pagine vere.
  assert.ok(voci.length > 80, 'solo ' + voci.length + ' URL nel sitemap');
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

test('il sitemap elenca esattamente le pagine attive indicizzabili', () => {
  const attese = new Set(L.pagineAttive()
    .filter((p) => !S.noindex(fs.readFileSync(p.assoluto, 'utf8')))
    .map((p) => L.SITO + L.urlPagina(p.rel)));
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

test('le varianti della ricerca portano allo strumento con la voce gia scelta', () => {
  // Bollo per Regione, dimissioni per contratto: un tempo pagine copiate e
  // noindex, ora voci della ricerca che aprono lo strumento con ?regione= o
  // ?ccnl= (js/parametri-url.js). Il parametro deve essere un'opzione vera.
  const indice = JSON.parse(fs.readFileSync(path.join(L.RADICE, 'data', 'strumenti.json'), 'utf8'));
  const varianti = (indice.strumenti || []).filter((s) => s.variante);
  assert.ok(varianti.length > 20, 'attese piu di 20 varianti, trovate ' + varianti.length);
  const presenti = new Set(voci.map((v) => v.loc.replace(L.SITO, '')));
  for (const v of varianti) {
    const [pagina, query] = v.percorso.split('?');
    assert.strictEqual(pagina, v.variante.originale, v.percorso);
    assert.ok(presenti.has(pagina), pagina + ' non e nel sitemap');
    if (!query) continue;
    const [nome, valore] = query.split('=');
    const html = fs.readFileSync(path.join(L.RADICE, pagina, 'index.html'), 'utf8');
    const menu = new RegExp('<select[^>]*data-parametro="' + nome + '"[\\s\\S]*?</select>').exec(html);
    assert.ok(menu, pagina + ': manca il menu con data-parametro="' + nome + '"');
    assert.ok(menu[0].includes('value="' + valore + '"'), v.percorso + ': opzione inesistente');
  }
});

test('i vecchi indirizzi delle pagine per regione, professione e contratto hanno il loro 301', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(L.RADICE, 'vercel.json'), 'utf8'));
  const redirect = new Map(vercel.redirects.map((r) => [r.source, r.destination]));
  const regole = JSON.parse(fs.readFileSync(path.join(L.RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8'));
  const attesi = [
    ...regole.bollo_auto_2026.regioniSEO.map((x) => ['/cittadino-tasse/calcolo-bollo-auto-' + x.slug + '/', '/cittadino-tasse/calcolo-bollo-auto/?regione=' + x.slug]),
    ...regole.partitaIvaForfettario.profesioniSEO.map((x) => ['/fisco-professioni/partita-iva-' + x.slug + '/', '/fisco-professioni/partita-iva/']),
    ...regole.ccnl_dimissioni.ccnlSEO.map((x) => ['/lavoro-contratti/lettera-dimissioni-' + x.slug + '/', '/lavoro-contratti/lettera-dimissioni-preavviso/?ccnl=' + (x.codice || x.slug)])
  ];
  assert.strictEqual(attesi.length, 42);
  for (const [da, a] of attesi) {
    assert.strictEqual(redirect.get(da), a, da);
    assert.ok(!fs.existsSync(path.join(L.RADICE, da, 'index.html')), da + ' esiste ancora: il redirect non scatterebbe');
  }
});

// Come instrada Vercel (vercel.json: cleanUrls e trailingSlash): prima toglie
// «.html» e aggiunge la barra finale, poi applica i redirect. Per questo un
// redirect da «/vecchia.html» non scatta mai: serve quello da «/vecchia/».
// Google segnalava 49 indirizzi «Non trovato (404)»: alcuni erano proprio questi.
function instrada(percorso, redirect) {
  const passi = [];
  let p = percorso;
  for (let i = 0; i < 10; i++) {
    const [via, query] = p.split('?');
    let dopo = null;
    if (via.endsWith('.html')) dopo = via.slice(0, -5).replace(/\/index$/, '') + '/';
    else if (!via.endsWith('/') && !path.extname(via)) dopo = via + '/';
    else if (redirect.has(via)) dopo = redirect.get(via);
    if (!dopo) {
      const pagina = fs.existsSync(path.join(L.RADICE, via, 'index.html')) || fs.existsSync(path.join(L.RADICE, via.replace(/\/$/, '') + '.html'));
      return { finale: via + (query ? '?' + query : ''), stato: pagina ? 200 : 404, passi };
    }
    passi.push(dopo);
    p = dopo.includes('?') || !query ? dopo : dopo + '?' + query;
  }
  return { finale: p, stato: 'ciclo', passi };
}

test('ogni vecchio indirizzo arriva a una pagina vera, in pochi passi (come instrada Vercel)', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(L.RADICE, 'vercel.json'), 'utf8'));
  assert.strictEqual(vercel.cleanUrls, true);
  assert.strictEqual(vercel.trailingSlash, true);
  const redirect = new Map(vercel.redirects.map((r) => [r.source, r.destination]));
  const rotti = [];
  for (const sorgente of redirect.keys()) {
    for (const variante of new Set([sorgente, sorgente.replace(/\/$/, '')])) {
      if (!variante) continue;
      const r = instrada(variante, redirect);
      if (r.stato !== 200 || r.passi.length > 3) rotti.push(`${variante} → ${r.passi.join(' → ')} (${r.stato}, ${r.passi.length} passi)`);
    }
  }
  assert.deepStrictEqual(rotti, []);
  // il caso che si era rotto: la pagina .html della prima versione del sito
  assert.deepStrictEqual(instrada('/partita-iva.html', redirect), { finale: '/fisco-professioni/partita-iva/', stato: 200, passi: ['/partita-iva/', '/fisco-professioni/partita-iva/'] });
});

test('il riconoscimento del noindex', () => {
  assert.strictEqual(S.noindex('<meta name="robots" content="noindex, follow" />'), true);
  assert.strictEqual(S.noindex("<meta content='noindex' name='robots'>"), true);
  assert.strictEqual(S.noindex('<meta name="robots" content="index, follow">'), false);
  assert.strictEqual(S.noindex('<meta name="description" content="noindex">'), false);
  assert.strictEqual(S.noindex('<title>Pagina</title>'), false);
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
