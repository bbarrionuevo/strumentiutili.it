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
    // Il preconnect deve precedere lo script di AdSense, altrimenti non serve
    // a niente: la connessione va aperta prima che il browser la chieda.
    const iPre = p.html.indexOf('rel="preconnect"');
    const iAds = p.html.indexOf('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js');
    if (iPre === -1) problemi.push(p.rel + ' -> nessun preconnect');
    else if (iAds !== -1 && iPre > iAds) problemi.push(p.rel + ' -> preconnect dopo AdSense');
  }
  assert.deepStrictEqual(problemi, []);
});

// Dopo la migrazione da Cookiebot alla CMP nativa di AdSense: nessuna pagina
// deve tornare a contattare i domini di Cookiebot, e nessuno script deve
// rimettere in piedi il vecchio giro del consenso. Il rischio non e teorico:
// scripts/sistema-consenso-adsense.py reinietterebbe tutto se lo si eseguisse.
test('nessuna traccia di Cookiebot nelle pagine', () => {
  const problemi = [];
  const VIETATI = ['consent.cookiebot.com', 'consentcdn.cookiebot.com', 'data-cookieconsent',
                   'CookiebotOnAccept', 'CookiebotOnDecline', 'CookiebotOnConsentReady',
                   'requestNonPersonalizedAds'];
  for (const p of PAGINE) {
    for (const v of VIETATI) {
      if (p.html.includes(v)) problemi.push(p.rel + ' -> ' + v);
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('AdSense si carica una volta sola, in modo asincrono, dentro head', () => {
  const problemi = [];
  for (const p of PAGINE) {
    const quante = (p.html.match(/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/g) || []).length;
    if (quante !== 1) { problemi.push(p.rel + ' -> ' + quante + ' script AdSense'); continue; }

    const i = p.html.indexOf('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js');
    const apertura = p.html.lastIndexOf('<script', i);
    const tag = p.html.slice(apertura, p.html.indexOf('>', i) + 1);
    if (!/\basync\b/.test(tag)) problemi.push(p.rel + ' -> senza async');

    const fineHead = p.html.indexOf('</head>');
    if (fineHead !== -1 && i > fineHead) problemi.push(p.rel + ' -> AdSense fuori da head');
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

test('ogni pagina offre il comando per riaprire il consenso', () => {
  // GDPR art. 7.3: ritirare il consenso dev'essere facile quanto darlo.
  // Il bottone parte nascosto e js/layout.js lo mostra solo dove la CMP di
  // Google esiste davvero, cioe' dove il messaggio viene mostrato.
  const problemi = [];
  for (const p of PAGINE) {
    if (!p.html.includes('id="riapri-consenso"')) problemi.push(p.rel + ' -> senza comando');
    else if (!p.html.includes('<li hidden id="riapri-consenso-voce">')) problemi.push(p.rel + ' -> non parte nascosto');
  }
  assert.deepStrictEqual(problemi, []);
});

test('js/layout.js apre la finestra del consenso con la CMP di Google', () => {
  const layout = fs.readFileSync('js/layout.js', 'utf8');
  assert.match(layout, /googlefc/, 'manca il collegamento alla CMP');
  assert.match(layout, /showRevocationMessage/, 'manca la chiamata che riapre la scelta');
});

test('ogni riquadro pubblicitario ha etichetta, segnaposto e altezza riservata', () => {
  // Senza il modificatore .su-ad--* il riquadro non riserva spazio e la pagina
  // salta quando arriva l'annuncio; senza etichetta l'annuncio non si
  // distingue dal contenuto, che le norme di AdSense chiedono.
  const problemi = [];
  for (const p of PAGINE) {
    // Pattern costruito da stringa: evita le sequenze di escape, che in questo
    // file sono gia' state mangiate una volta da un passaggio di editing.
    const re = new RegExp('<div class="su-ad[^"]*"[^>]*>([^]*?)</div>', 'g');
    for (const m of p.html.matchAll(re)) {
      const classe = m[0].slice(0, m[0].indexOf('>'));
      if (!/su-ad--/.test(classe)) problemi.push(p.rel + ' -> riquadro senza formato: ' + classe.slice(0, 60));
      if (!m[1].includes('su-ad-etichetta')) problemi.push(p.rel + ' -> riquadro senza etichetta');
      if (!m[1].includes('su-ad-segnaposto')) problemi.push(p.rel + ' -> riquadro senza segnaposto');
    }
  }
  assert.deepStrictEqual(problemi, []);
});

test('il foglio di stile nasconde annunci e comandi in stampa', () => {
  // Meta' degli strumenti produce documenti da stampare: F24, disdette,
  // autocertificazioni. Sul foglio non devono finire i riquadri pubblicitari.
  const css = fs.readFileSync('css/styles.css', 'utf8');
  assert.match(css, /@media print/, 'nessuna regola di stampa in css/styles.css');
  const i = css.indexOf('@media print');
  const blocco = css.slice(i, i + 400);
  for (const sel of ['.su-ad', '.su-salta', '#menu-toggle']) {
    assert.ok(blocco.includes(sel), sel + ' non nascosto in stampa');
  }
});

test('gli script della vecchia CMP non esistono piu', () => {
  // sistema-consenso-adsense.py reiniettava l'intero blocco di Cookiebot in
  // ogni pagina: lasciarlo in giro voleva dire poter annullare la migrazione
  // con una sola esecuzione.
  for (const f of ['scripts/sistema-consenso-adsense.py', 'scripts/prova-consenso-adsense.py']) {
    assert.ok(!fs.existsSync(f), f + ' e ancora presente');
  }
});

test('l informativa non descrive piu la CMP di Cookiebot', () => {
  const testo = fs.readFileSync('politica-sulla-privacy.html', 'utf8');
  assert.ok(!testo.includes('TCF v2.3'), 'dice ancora "TCF v2.3", che era la dicitura di Cookiebot');
  assert.ok(!testo.includes('cancellando la cache'), 'dice ancora di svuotare la cache per ritirare il consenso');
  assert.match(testo, /Gestisci il consenso ai cookie/, 'non rimanda al comando nel piede');
});

test('ogni pagina ha un solo canonical', () => {
  // Due canonical identici, o nessuno, confondono i motori. Le pagine
  // regionali del bollo li avevano doppi perche' ereditati dal modello.
  const problemi = [];
  for (const p of PAGINE) {
    const quanti = (p.html.match(/rel="canonical"/g) || []).length;
    if (quanti !== 1) problemi.push(p.rel + ' -> ' + quanti);
  }
  assert.deepStrictEqual(problemi, []);
});

test('le pagine del bollo rimandano allo strumento sull esenzione 2027', () => {
  // Chi cerca il bollo nel 2027 deve sapere che potrebbe non doverlo pagare:
  // senza questo rimando la pagina calcola un importo e tace sulla novita.
  const problemi = PAGINE
    .filter((p) => /calcolo-bollo-auto/.test(p.rel))
    .filter((p) => !p.html.includes('/cittadino-tasse/esenzione-bollo-auto-2027/'))
    .map((p) => p.rel);
  assert.deepStrictEqual(problemi, []);
});
