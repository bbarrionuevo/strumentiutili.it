#!/usr/bin/env node
// scripts/build-layout.js — Genera intestazione, piede e briciole di pane
// nelle pagine attive del sito.
//
// Il sito e' HTML statico scritto a mano: header e footer erano copiati in 128
// file e col tempo si erano sdoppiati in sei varianti diverse. Qui c'e' una
// sola definizione; questo script la riscrive dentro ogni pagina, delimitata
// da marcatori, senza toccare il resto del contenuto.
//
//   node scripts/build-layout.js            riscrive le pagine
//   node scripts/build-layout.js --check    verifica senza scrivere

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const SITO = 'https://strumentiutili.it';

// Cartelle della vecchia struttura, servite solo dai redirect 301.
const LEGACY = ['burocrazia', 'lavoro', 'finanza', 'media'];
const ESCLUSI = new Set(['fototessera.html']);
const SALTA_CARTELLE = [
  '.git', 'node_modules', 'tests', '.github', 'scripts',
  'assets', 'data', 'src', 'css', 'js', '_prova_volti'
];

const CATEGORIE = [
  { slug: 'fisco-professioni',   breve: 'Fisco & Professioni', lungo: 'Fisco & Professioni',        emoji: '\u{1F4BC}' },
  { slug: 'cittadino-tasse',     breve: 'Cittadino & Tasse',   lungo: 'Cittadino & Tasse',          emoji: '\u{1F3DB}️' },
  { slug: 'lavoro-contratti',    breve: 'Lavoro',              lungo: 'Lavoro & Contratti',         emoji: '\u{1F91D}' },
  { slug: 'identita-burocrazia', breve: 'Identità',       lungo: 'Identità & Burocrazia', emoji: '\u{1FAAA}' },
  { slug: 'pdf',                 breve: 'PDF',                 lungo: 'PDF & Scanner',              emoji: '\u{1F4C4}' },
  { slug: 'ia',                  breve: 'IA',                  lungo: 'IA Locale',                  emoji: '\u{1F916}' },
  { slug: 'utilita-web',         breve: 'Utilità',        lungo: 'Utilità & Web',         emoji: '\u{1F6E0}️' }
];

const LEGALI = [
  { href: '/contatti/', testo: 'Chi siamo / Contatti' },
  { href: '/politica-sulla-privacy/', testo: 'Privacy' },
  { href: '/avviso-legale/', testo: 'Avviso legale' }
];

// Origini di terzi presenti in TUTTE le pagine e sul percorso critico: vale la
// pena aprire la connessione mentre il browser legge ancora l'HTML. Le librerie
// (unpkg, jsdelivr, cdnjs) cambiano da pagina a pagina e non entrano qui: un
// preconnect di troppo ruba banda invece di guadagnarne.
// Solo AdSense: da li' si carica anche la CMP nativa di Google, che ha preso il
// posto di Cookiebot. Il preconnect a consent.cookiebot.com e' stato tolto con
// quella migrazione: scaldava una connessione verso un dominio che il sito non
// contatta piu'.
const ORIGINI_CRITICHE = [
  'https://pagead2.googlesyndication.com'
];

// Marcatori: tutto quello che sta in mezzo e' generato da qui.
const M = {
  testeApri: '<!-- su:teste -->',
  testeChiudi: '<!-- /su:teste -->',
  saltaApri: '<!-- su:salta -->',
  saltaChiudi: '<!-- /su:salta -->',
  testataApri: '<!-- su:testata -->',
  testataChiudi: '<!-- /su:testata -->',
  briciolaApri: '<!-- su:briciole -->',
  briciolaChiudi: '<!-- /su:briciole -->',
  piedeApri: '<!-- su:piede -->',
  piedeChiudi: '<!-- /su:piede -->',
  ldApri: '<!-- su:briciole-ld -->',
  ldChiudi: '<!-- /su:briciole-ld -->'
};

// ----------------------------------------------------------------- utilita'

const APICE = String.fromCharCode(39);

const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Testo senza tag ne' entita', per il JSON-LD.
function testoSemplice(t) {
  return String(t == null ? '' : t)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, APICE)
    .replace(/&apos;/g, APICE)
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function* percorriHtml(dir) {
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SALTA_CARTELLE.includes(voce.name)) continue;
    const completo = path.join(dir, voce.name);
    if (voce.isDirectory()) yield* percorriHtml(completo);
    else if (voce.name.endsWith('.html')) yield completo;
  }
}

function pagineAttive() {
  const elenco = [];
  for (const assoluto of percorriHtml(RADICE)) {
    const rel = path.relative(RADICE, assoluto).split(path.sep).join('/');
    if (LEGACY.includes(rel.split('/')[0])) continue;
    if (ESCLUSI.has(rel)) continue;
    if (rel.endsWith('/test.html')) continue;
    elenco.push({ assoluto, rel });
  }
  return elenco.sort((a, b) => a.rel.localeCompare(b.rel));
}

// URL pubblica, tenendo conto di cleanUrls + trailingSlash di vercel.json.
function urlPagina(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel.replace(/\.html$/, '') + '/';
}

function contestoPagina(rel, html) {
  const url = urlPagina(rel);
  const primoSegmento = rel.split('/')[0];
  const categoria = CATEGORIE.find((c) => c.slug === primoSegmento) || null;

  let tipo;
  if (rel === 'index.html') tipo = 'home';
  else if (categoria && rel === categoria.slug + '/index.html') tipo = 'categoria';
  else if (categoria) tipo = 'strumento';
  else tipo = 'legale';

  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return { rel, url, tipo, categoria, titolo: m ? testoSemplice(m[1]) : '' };
}

// ---------------------------------------------------------- teste della pagina

// Statistiche di visita: Vercel Web Analytics, dallo stesso dominio del sito
// (/_vercel/insights/), senza cookie ne' identificativi. Conta pagine viste,
// provenienza, paese e tipo di dispositivo in forma aggregata. Si accende dal
// pannello di Vercel (Analytics > Enable): finche' e' spento lo script risponde
// 404 e non misura nulla. Senza la coda window.va in linea: serve solo agli
// eventi personalizzati, che il piano gratuito non ha.
const STATISTICHE = '/_vercel/insights/script.js';

function teste() {
  return ORIGINI_CRITICHE
    .map((o) => '  <link rel="preconnect" href="' + o + '" crossorigin>')
    .concat('  <script defer src="' + STATISTICHE + '"></script>')
    .join('\n');
}

// ------------------------------------------------------------- salta al contenuto

function saltaAlContenuto() {
  return '  <a href="#contenuto" class="su-salta">Salta al contenuto</a>';
}

// ------------------------------------------------------------- intestazione

function intestazione(ctx) {
  const attiva = (slug) => ctx.categoria && ctx.categoria.slug === slug;

  const voceDesktop = (c) => {
    const classe = attiva(c.slug)
      ? 'text-indigo-600 font-semibold'
      : 'text-gray-600 hover:text-indigo-600 font-medium';
    const corrente = attiva(c.slug) ? ' aria-current="page"' : '';
    return '          <a href="/' + c.slug + '/" class="' + classe + '"' + corrente + '>' +
      c.emoji + ' ' + esc(c.breve) + '</a>';
  };

  const voceMobile = (c) => {
    const classe = attiva(c.slug)
      ? 'flex items-center gap-3 px-3 py-3 rounded-lg bg-indigo-50 text-indigo-700 font-semibold'
      : 'flex items-center gap-3 px-3 py-3 rounded-lg text-gray-700 hover:bg-gray-50 font-medium';
    const corrente = attiva(c.slug) ? ' aria-current="page"' : '';
    return '          <a href="/' + c.slug + '/" class="' + classe + '"' + corrente + '>' +
      '<span aria-hidden="true">' + c.emoji + '</span>' + esc(c.lungo) + '</a>';
  };

  return [
    '  <header class="bg-white shadow sticky top-0 z-50">',
    '    <div class="container mx-auto px-4 py-3">',
    '',
    '      <div class="flex items-center gap-3">',
    '',
    '        <a href="/" class="flex items-center gap-3 shrink-0" aria-label="StrumentiUtili.it, vai alla home">',
    '          <span class="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-bold shadow-sm" aria-hidden="true">SU</span>',
    '          <span class="hidden sm:block">',
    '            <span class="block text-xl lg:text-2xl font-semibold tracking-tight text-gray-900">StrumentiUtili.it</span>',
    '            <span class="block text-xs text-gray-500">Micro-strumenti gratuiti 100% client-side</span>',
    '          </span>',
    '        </a>',
    '',
    '        <nav class="hidden lg:flex items-center gap-3 xl:gap-4 text-sm mx-auto" aria-label="Categorie">',
    CATEGORIE.map(voceDesktop).join('\n'),
    '        </nav>',
    '',
    '        <div class="relative flex-1 lg:flex-none lg:w-64 min-w-0">',
    '          <label for="search" class="sr-only">Cerca uno strumento</label>',
    '          <input id="search" type="search" autocomplete="off" placeholder="Cerca uno strumento…"',
    '                 role="combobox" aria-expanded="false" aria-controls="risultati-menu" aria-autocomplete="list"',
    '                 class="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white transition" />',
    '          <div id="risultati-menu" role="listbox" aria-label="Risultati della ricerca" hidden',
    '               class="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50"></div>',
    '        </div>',
    '',
    '        <button type="button" id="menu-toggle" aria-expanded="false" aria-controls="menu-mobile" aria-label="Apri il menu delle categorie"',
    '                class="lg:hidden shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">',
    '          <svg data-menu-icona="apri" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round"/></svg>',
    '          <svg data-menu-icona="chiudi" class="w-6 h-6 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>',
    '        </button>',
    '',
    '      </div>',
    '',
    '      <nav id="menu-mobile" hidden class="lg:hidden mt-3 pt-3 pb-1 border-t border-gray-100 grid gap-1" aria-label="Categorie">',
    CATEGORIE.map(voceMobile).join('\n'),
    '      </nav>',
    '',
    '    </div>',
    '  </header>'
  ].join('\n');
}

// --------------------------------------------------------------------- piede

// `bloccoPubblicitario` e' lo spazio AdSense gia' presente nella pagina: viene
// riportato tale e quale, perche' lo slot cambia da pagina a pagina e non e'
// compito di questo script deciderlo.
function piede(bloccoPubblicitario) {
  const vociCategoria = (c) =>
    '            <li><a href="/' + c.slug + '/" class="hover:text-indigo-600 transition-colors">' +
    esc(c.lungo) + '</a></li>';

  const vociLegali = (l) =>
    '            <li><a href="' + l.href + '" class="hover:text-indigo-600 transition-colors">' +
    esc(l.testo) + '</a></li>';

  const pubblicita = bloccoPubblicitario
    ? bloccoPubblicitario.split('\n').map((l) => (l.trim() ? '      ' + l.trim() : l)).join('\n') + '\n'
    : '';

  return [
    '  <footer class="bg-white border-t mt-12 w-full block">',
    '    <div class="container mx-auto px-4 py-8 w-full block">',
    '',
    pubblicita,
    '      <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">',
    '',
    '        <div class="sm:col-span-2 lg:col-span-1">',
    '          <h2 class="font-semibold text-gray-800 text-lg">StrumentiUtili.it</h2>',
    '          <p class="text-sm text-gray-600 mt-2">Micro-strumenti gratuiti. I calcoli avvengono nel browser: i tuoi dati non lasciano il dispositivo.</p>',
    '        </div>',
    '',
    '        <nav aria-label="Categorie del sito">',
    '          <h2 class="font-semibold text-gray-800 text-sm uppercase tracking-wide">Categorie</h2>',
    '          <ul class="mt-3 space-y-2 text-sm text-gray-600">',
    CATEGORIE.slice(0, 4).map(vociCategoria).join('\n'),
    '          </ul>',
    '        </nav>',
    '',
    '        <nav aria-label="Altre categorie">',
    '          <h2 class="sr-only">Altre categorie</h2>',
    '          <ul class="mt-3 lg:mt-8 space-y-2 text-sm text-gray-600">',
    CATEGORIE.slice(4).map(vociCategoria).join('\n'),
    '          </ul>',
    '        </nav>',
    '',
    '        <nav aria-label="Informazioni">',
    '          <h2 class="font-semibold text-gray-800 text-sm uppercase tracking-wide">Informazioni</h2>',
    '          <ul class="mt-3 space-y-2 text-sm text-gray-600">',
    LEGALI.map(vociLegali).join('\n'),
    // Il GDPR (art. 7.3) chiede che ritirare il consenso sia facile quanto
    // darlo. La CMP di Google espone googlefc.showRevocationMessage(): il
    // bottone resta nascosto finche' js/layout.js non trova quella funzione,
    // cosi' fuori dallo SEE, dove la CMP non si carica, non compare un comando
    // che non farebbe nulla.
    '            <li hidden id="riapri-consenso-voce">',
    '              <button type="button" id="riapri-consenso"',
    '                      class="hover:text-indigo-600 transition-colors text-left underline-offset-2 hover:underline">Gestisci il consenso ai cookie</button>',
    '            </li>',
    // I valori dei calcolatori, i preferiti e i recenti restano nel browser:
    // chi li ha generati deve poterli togliere con un clic (js/spazio.js).
    '            <li hidden id="su-cancella-voce">',
    '              <button type="button" id="su-cancella-dati"',
    '                      class="hover:text-indigo-600 transition-colors text-left underline-offset-2 hover:underline">Cancella i dati salvati su questo dispositivo</button>',
    '            </li>',
    '          </ul>',
    '        </nav>',
    '',
    '      </div>',
    '',
    '    </div>',
    '  </footer>'
  ].join('\n');
}

// ------------------------------------------------------------------ briciole

function catenaBriciole(ctx) {
  const catena = [{ nome: 'Home', href: '/' }];
  if (ctx.categoria) catena.push({ nome: ctx.categoria.lungo, href: '/' + ctx.categoria.slug + '/' });
  if (ctx.tipo === 'strumento' || ctx.tipo === 'legale') {
    catena.push({ nome: ctx.titolo || ctx.url, href: ctx.url });
  }
  return catena;
}

function briciole(ctx) {
  if (ctx.tipo === 'home') return null;

  const catena = catenaBriciole(ctx);
  const voci = catena.map((v, i) => {
    const ultimo = i === catena.length - 1;
    const dentro = ultimo
      ? '<span class="text-gray-700 font-medium" aria-current="page">' + esc(v.nome) + '</span>'
      : '<a href="' + v.href + '" class="hover:text-indigo-600 hover:underline">' + esc(v.nome) + '</a>';
    const sep = ultimo ? '' : '\n        <li aria-hidden="true" class="text-gray-300">/</li>';
    return '        <li>' + dentro + '</li>' + sep;
  }).join('\n');

  // Sulle pagine degli strumenti, accanto al percorso, la stella per fissarli
  // in "Il tuo spazio". Parte nascosta: la mostra js/layout.js solo se il
  // browser permette di salvare, altrimenti sarebbe un bottone che non fa nulla.
  const stella = ctx.tipo === 'strumento'
    ? '        <button type="button" id="su-fissa" hidden aria-pressed="false" data-percorso="' + esc(ctx.url) + '" data-titolo="' + esc(testoSemplice(ctx.titolo)) + '"' +
      ' class="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-indigo-700 border border-gray-200 hover:border-indigo-300 bg-white rounded-full px-3 py-1 transition">' +
      '<span data-stella aria-hidden="true">&#9734;</span><span data-stella-testo>Salva tra i preferiti</span></button>'
    : null;

  return [
    '      <nav aria-label="Percorso" class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">',
    '        <ol class="flex flex-wrap items-center gap-2 text-sm text-gray-500">',
    voci,
    '        </ol>',
    stella,
    '      </nav>'
  ].filter((r) => r !== null).join('\n');
}

function jsonLdBriciole(ctx) {
  if (ctx.tipo === 'home') return null;
  const dati = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: catenaBriciole(ctx).map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: testoSemplice(v.nome),
      item: SITO + v.href
    }))
  };
  const corpo = JSON.stringify(dati, null, 2)
    .split('\n').map((l) => '  ' + l).join('\n');
  return '  <script type="application/ld+json">\n' + corpo + '\n  </script>';
}

module.exports = {
  RADICE, SITO, CATEGORIE, LEGALI, M, APICE, ORIGINI_CRITICHE, STATISTICHE,
  pagineAttive, urlPagina, contestoPagina, catenaBriciole,
  teste, saltaAlContenuto, intestazione, piede, briciole, jsonLdBriciole,
  esc, testoSemplice
};
