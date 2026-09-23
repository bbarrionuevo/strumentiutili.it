// tests/layout.test.js — Coerenza del layout generato da scripts/applica-layout.js.
//
// Header e footer erano copiati a mano in 128 pagine e si erano sdoppiati in
// sei varianti. Questi test servono a non tornare li'.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const L = require('../scripts/build-layout.js');
const A = require('../scripts/applica-layout.js');

const PAGINE = L.pagineAttive().map((p) => ({
  rel: p.rel,
  assoluto: p.assoluto,
  html: fs.readFileSync(p.assoluto, 'utf8')
}));

PAGINE.forEach((p) => { p.ctx = L.contestoPagina(p.rel, p.html); });

test('ci sono pagine da controllare', () => {
  assert.ok(PAGINE.length >= 120, 'trovate solo ' + PAGINE.length + ' pagine attive');
});

test('il layout e stabile: rieseguire lo script non cambia nulla', () => {
  const instabili = PAGINE
    .filter((p) => A.trasforma(p.html, p.ctx) !== p.html)
    .map((p) => p.rel);
  assert.deepStrictEqual(instabili, [],
    'layout non rigenerato. Esegui: node scripts/applica-layout.js');
});

test('ogni pagina ha i marcatori di testata e piede', () => {
  const mancanti = [];
  for (const p of PAGINE) {
    for (const marcatore of [L.M.testataApri, L.M.testataChiudi, L.M.piedeApri, L.M.piedeChiudi]) {
      if (!p.html.includes(marcatore)) mancanti.push(p.rel + ' -> ' + marcatore);
    }
  }
  assert.deepStrictEqual(mancanti, []);
});

test('una sola testata del sito per pagina', () => {
  const problemi = PAGINE
    .filter((p) => (p.html.match(/<header class="bg-white shadow sticky top-0 z-50">/g) || []).length !== 1)
    .map((p) => p.rel);
  assert.deepStrictEqual(problemi, []);
});

test('il menu contiene tutte le categorie, due volte: computer e telefono', () => {
  const problemi = [];
  for (const p of PAGINE) {
    for (const c of L.CATEGORIE) {
      const quante = (p.html.match(new RegExp('href="/' + c.slug + '/"', 'g')) || []).length;
      // due nel menu + una nel piede, piu' eventuali link nel contenuto
      if (quante < 3) problemi.push(p.rel + ' -> ' + c.slug + ' (' + quante + ')');
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('il menu mobile esiste ed e chiuso di partenza', () => {
  const problemi = [];
  for (const p of PAGINE) {
    if (!p.html.includes('id="menu-toggle"')) problemi.push(p.rel + ' -> senza bottone');
    else if (!p.html.includes('id="menu-mobile" hidden')) problemi.push(p.rel + ' -> pannello non chiuso');
    else if (!p.html.includes('aria-expanded="false" aria-controls="menu-mobile"')) problemi.push(p.rel + ' -> senza aria');
  }
  assert.deepStrictEqual(problemi, []);
});

test('la categoria corrente e segnalata una volta per menu', () => {
  const problemi = [];
  for (const p of PAGINE) {
    const quante = (p.html.match(/aria-current="page"/g) || []).length;
    if (p.ctx.tipo === 'home' || p.ctx.tipo === 'legale') {
      // nessuna categoria attiva; le briciole ne aggiungono una sulle legali
      const atteso = p.ctx.tipo === 'legale' ? 1 : 0;
      if (quante !== atteso) problemi.push(p.rel + ' -> ' + quante + ' (atteso ' + atteso + ')');
    } else {
      // due nei menu + una nelle briciole (strumento) o due (categoria)
      if (quante < 2) problemi.push(p.rel + ' -> ' + quante);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('ogni pagina ha salta-al-contenuto con il suo bersaglio', () => {
  const problemi = [];
  for (const p of PAGINE) {
    if (!p.html.includes('<a href="#contenuto" class="su-salta">')) problemi.push(p.rel + ' -> senza link');
    else if (!/<main[^>]*id="contenuto"/.test(p.html)) problemi.push(p.rel + ' -> senza bersaglio');
  }
  assert.deepStrictEqual(problemi, []);
});

test('il campo di ricerca c e su tutte le pagine, una volta sola', () => {
  const problemi = [];
  for (const p of PAGINE) {
    const quanti = (p.html.match(/id="search"/g) || []).length;
    if (quanti !== 1) problemi.push(p.rel + ' -> ' + quanti);
    if (!p.html.includes('id="risultati-menu"')) problemi.push(p.rel + ' -> senza tendina');
    if (!p.html.includes('<label for="search"')) problemi.push(p.rel + ' -> input senza label');
  }
  assert.deepStrictEqual(problemi, []);
});

test('js/layout.js e caricato e js/main.js non esiste piu', () => {
  const problemi = [];
  for (const p of PAGINE) {
    if (!p.html.includes('src="/js/layout.js"')) problemi.push(p.rel + ' -> senza layout.js');
    if (p.html.includes('/js/main.js')) problemi.push(p.rel + ' -> ancora main.js');
  }
  assert.deepStrictEqual(problemi, []);
  assert.ok(!fs.existsSync('js/main.js'), 'js/main.js dovrebbe essere stato rimosso');
});

test('le briciole di pane ci sono e dicono il percorso giusto', () => {
  const problemi = [];
  for (const p of PAGINE) {
    if (p.ctx.tipo === 'home') {
      if (p.html.includes('aria-label="Percorso"')) problemi.push(p.rel + ' -> la home non deve averle');
      continue;
    }
    if (!p.html.includes('aria-label="Percorso"')) { problemi.push(p.rel + ' -> mancanti'); continue; }

    const catena = L.catenaBriciole(p.ctx);
    for (const voce of catena.slice(0, -1)) {
      if (!p.html.includes('<a href="' + voce.href + '" class="hover:text-indigo-600 hover:underline">')) {
        problemi.push(p.rel + ' -> manca il passo ' + voce.href);
      }
    }
    const ultimo = catena[catena.length - 1];
    if (!p.html.includes('aria-current="page">' + L.esc(ultimo.nome) + '</span>')) {
      problemi.push(p.rel + ' -> ultimo passo diverso da ' + ultimo.nome);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('non resta nessun vecchio link "torna a"', () => {
  const problemi = PAGINE
    .filter((p) => /<a [^>]*>\s*←/.test(p.html))
    .map((p) => p.rel);
  assert.deepStrictEqual(problemi, [],
    'sostituiti dalle briciole: prima erano 26 diciture diverse per la stessa cosa');
});

test('il BreadcrumbList JSON-LD combacia con le briciole visibili', () => {
  const problemi = [];
  for (const p of PAGINE) {
    const nodi = [];
    for (const b of p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let d;
      try { d = JSON.parse(b[1]); } catch (e) { problemi.push(p.rel + ' -> JSON-LD non valido'); continue; }
      const arr = Array.isArray(d) ? d : (Array.isArray(d['@graph']) ? d['@graph'] : [d]);
      for (const n of arr) if (n && n['@type'] === 'BreadcrumbList') nodi.push(n);
    }

    if (p.ctx.tipo === 'home') {
      if (nodi.length) problemi.push(p.rel + ' -> la home non deve avere BreadcrumbList');
      continue;
    }
    if (nodi.length !== 1) { problemi.push(p.rel + ' -> ' + nodi.length + ' BreadcrumbList'); continue; }

    const atteso = L.catenaBriciole(p.ctx).map((v, i) => ({
      '@type': 'ListItem', position: i + 1, name: L.testoSemplice(v.nome), item: L.SITO + v.href
    }));
    try {
      assert.deepStrictEqual(nodi[0].itemListElement, atteso);
    } catch (e) {
      problemi.push(p.rel + ' -> catena diversa');
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('nessun BreadcrumbList punta a una vecchia URL da redirect', () => {
  const vecchie = ['/burocrazia/', '/lavoro/', '/finanza/', '/media/'];
  const problemi = [];
  for (const p of PAGINE) {
    for (const v of vecchie) {
      if (p.html.includes('"item": "' + L.SITO + v + '"')) problemi.push(p.rel + ' -> ' + v);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('il piede conserva lo spazio pubblicitario della pagina', () => {
  const problemi = [];
  for (const p of PAGINE) {
    const i = p.html.indexOf(L.M.piedeApri);
    const j = p.html.indexOf(L.M.piedeChiudi, i);
    const piede = p.html.slice(i, j);
    if (!piede.includes('adsbygoogle')) problemi.push(p.rel);
  }
  assert.deepStrictEqual(problemi, [],
    'il generatore del piede deve riportare il blocco AdSense che trova');
});

test('il piede porta a tutte le categorie e alle pagine legali', () => {
  const problemi = [];
  for (const p of PAGINE) {
    const i = p.html.indexOf(L.M.piedeApri);
    const piede = p.html.slice(i, p.html.indexOf(L.M.piedeChiudi, i));
    for (const c of L.CATEGORIE) {
      if (!piede.includes('href="/' + c.slug + '/"')) problemi.push(p.rel + ' -> ' + c.slug);
    }
    for (const l of L.LEGALI) {
      if (!piede.includes('href="' + l.href + '"')) problemi.push(p.rel + ' -> ' + l.href);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('nessuna pagina attiva usa il CDN di Tailwind', () => {
  const problemi = PAGINE.filter((p) => p.html.includes('cdn.tailwindcss.com')).map((p) => p.rel);
  assert.deepStrictEqual(problemi, []);
});

test('il CSS compilato contiene le classi del layout', () => {
  const css = fs.readFileSync('css/styles.css', 'utf8');
  for (const classe of ['.su-salta', '.sr-only', 'lg\\:hidden', 'lg\\:flex', 'prefers-reduced-motion']) {
    assert.ok(css.includes(classe), classe + ' assente da css/styles.css: esegui npm run build');
  }
});

test('ogni pagina apre in anticipo le connessioni ai terzi critici', () => {
  const problemi = [];
  for (const p of PAGINE) {
    for (const origine of L.ORIGINI_CRITICHE) {
      const tag = '<link rel="preconnect" href="' + origine + '" crossorigin>';
      if (!p.html.includes(tag)) problemi.push(p.rel + ' -> ' + origine);
    }
    // devono stare prima dello script di Cookiebot, che e sincrono
    const iPre = p.html.indexOf('rel="preconnect"');
    const iCmp = p.html.indexOf('consent.cookiebot.com/uc.js');
    if (iPre !== -1 && iCmp !== -1 && iPre > iCmp) problemi.push(p.rel + ' -> preconnect dopo Cookiebot');
  }
  assert.deepStrictEqual(problemi, []);
});

test('nessuna libreria di terzi resta senza versione fissata', () => {
  // Una URL senza @versione serve sempre l ultima build: puo rompere il sito
  // da un giorno all altro e rende impossibile il controllo di integrita.
  const problemi = [];
  for (const p of PAGINE) {
    for (const m of p.html.matchAll(/https:\/\/(unpkg\.com|cdn\.jsdelivr\.net)\/([^"\s]+)/g)) {
      const percorso = m[2];
      if (!/@\d/.test(percorso)) problemi.push(p.rel + ' -> ' + m[0]);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('gli script di terzi in HTML hanno controllo di integrita', () => {
  // Escluse: AdSense e Cookiebot cambiano per definizione, e docs.opencv.org
  // non manda intestazioni CORS, quindi SRI la bloccherebbe.
  const SENZA = ['pagead2.googlesyndication.com', 'consent.cookiebot.com', 'docs.opencv.org', 'cdn.tailwindcss.com'];
  const problemi = [];
  for (const p of PAGINE) {
    // [ ] invece di una classe di spazi: cosi il pattern non ha caratteri di
    // escape e sopravvive a qualsiasi passaggio di editing.
    const re = new RegExp("<script[^>]*[ ]src=\"(https://[^\"]+)\"[^>]*>", 'g');
    for (const m of p.html.matchAll(re)) {
      if (SENZA.some((x) => m[1].includes(x))) continue;
      if (m[0].indexOf('integrity="sha') === -1) problemi.push(p.rel + ' -> ' + m[1]);
      else if (m[0].indexOf('crossorigin=') === -1) problemi.push(p.rel + ' -> senza crossorigin: ' + m[1]);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('OpenCV non si scarica al caricamento della pagina', () => {
  // Sono 9,5 MB. Li carica il worker con importScripts quando si scansiona
  // davvero, non prima.
  const problemi = PAGINE
    .filter((p) => new RegExp("<script[^>]*src=\"[^\"]*opencv[.]js").test(p.html))
    .map((p) => p.rel);
  assert.deepStrictEqual(problemi, []);
});
