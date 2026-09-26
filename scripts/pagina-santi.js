// scripts/pagina-santi.js — La pagina "Santo del giorno": modello e parti
// scritte dai dati (il calendario dei santi e la fonte).
//
// La usa scripts/genera-santi.js: la pagina nasce insieme a data/santi.json,
// cosi' non esiste mai una pagina pubblicata senza i suoi dati.

'use strict';

const F = require('../js/festivita.js');

const URL_PAGINA = 'https://strumentiutili.it/utilita-web/santo-del-giorno/';
const CLIENT = 'ca-pub-9434300808171957';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TITOLO = 'Santo del giorno e onomastici di oggi, con gli auguri da inviare';
const DESCRIZIONE = 'Il santo di oggi e degli altri giorni, l’onomastico di ogni nome e un biglietto di auguri da mandare su WhatsApp. In più: fase lunare, alba e tramonto, prossima festa e ponte. Gratis, senza app.';

const FAQ = [
  { d: 'Da dove vengono i santi del giorno?', r: 'Il primo santo di ogni giorno è quello del Calendario romano generale, il calendario liturgico della Chiesa cattolica, con alcuni santi molto festeggiati in Italia (San Valentino, San Rocco, Santa Barbara…). Gli altri santi e beati vengono da Wikidata, la base di dati libera collegata a Wikipedia (licenza CC0). Il calendario della tua diocesi può avere feste proprie in più.' },
  { d: 'Come si trova il giorno dell’onomastico?', r: 'Scrivi il nome nel campo «Quando è l’onomastico di…»: compare il giorno del santo più festeggiato con quel nome. Per i nomi portati da più santi (Antonio, Teresa, Maria…) indichiamo la data più diffusa in Italia; in alcune famiglie e paesi si festeggia un altro giorno.' },
  { d: 'Onomastico e compleanno sono la stessa cosa?', r: 'No. Il compleanno è il giorno in cui sei nato; l’onomastico è la festa del santo di cui porti il nome. In Italia si fanno gli auguri per tutti e due.' },
  { d: 'Come mando gli auguri su WhatsApp?', r: 'Scegli il nome e i colori, poi premi «Condividi»: sul telefono si apre l’elenco delle app e puoi scegliere WhatsApp. Dal computer premi «Scarica l’immagine» e allegala al messaggio. Il biglietto si crea sul tuo dispositivo.' },
  { d: 'Alba e tramonto sono precisi?', r: 'Sono calcolati con l’algoritmo della NOAA, lo stesso degli almanacchi, con uno scarto di circa un minuto. Puoi scegliere il capoluogo di regione più vicino o usare la tua posizione, che resta sul dispositivo.' }
];

const AD_CONTENUTO = `      <div class="su-ad su-ad--contenuto mt-8 text-center rounded-xl w-full block" data-su-pos="contenuto">
        <ins data-su-pos="contenuto" data-ad-format="rectangle" class="adsbygoogle"
             style="display:block;width:100%;min-width:0;"
             data-ad-client="${CLIENT}"
             data-ad-slot="8859818557"></ins>
      </div>`;

function pagina() {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication', '@id': URL_PAGINA + '#app', name: 'Santo del giorno', url: URL_PAGINA,
        applicationCategory: 'LifestyleApplication', operatingSystem: 'Any',
        browserRequirements: 'Richiede JavaScript. Funziona senza inviare dati a server.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        description: DESCRIZIONE,
        featureList: ['Santo del giorno e degli altri giorni', 'Onomastico di ogni nome', 'Biglietto di auguri da condividere', 'Fase lunare, alba e tramonto', 'Prossima festa e ponte'],
        author: { '@type': 'Person', name: 'Brian Barrionuevo', url: 'https://strumentiutili.it/contatti/' },
        publisher: { '@type': 'Organization', name: 'StrumentiUtili.it', url: 'https://strumentiutili.it/' }
      },
      { '@type': 'FAQPage', '@id': URL_PAGINA + '#faq', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.d, acceptedAnswer: { '@type': 'Answer', text: f.r } })) }
    ]
  };
  const faq = FAQ.map((f) => `          <details class="group border-b border-gray-100 py-3">
            <summary class="cursor-pointer font-semibold text-gray-900 list-none flex justify-between items-center gap-3">${esc(f.d)}<span class="text-indigo-600 transition-transform group-open:rotate-45 text-lg leading-none" aria-hidden="true">+</span></summary>
            <p class="mt-2 text-sm text-gray-700 leading-relaxed">${esc(f.r)}</p>
          </details>`).join('\n');
  const temi = [['oro', 'Oro', 'bg-amber-200'], ['cielo', 'Cielo', 'bg-blue-200'], ['rosa', 'Rosa', 'bg-pink-200'], ['notte', 'Notte', 'bg-indigo-900']]
    .map(([v, n, c], i) => `              <label class="cursor-pointer"><input type="radio" name="sdg-tema" value="${v}"${i ? '' : ' checked'} class="peer sr-only" /><span class="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 peer-checked:border-indigo-600 peer-checked:ring-2 peer-checked:ring-indigo-200 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500"><span class="w-4 h-4 rounded-full ${c}" aria-hidden="true"></span>${n}</span></label>`).join('\n');

  return `<!doctype html>
<html lang="it" class="scroll-smooth">
<head>

  <!-- Google AdSense (La CMP nativa e il Consent Mode si caricano in automatico tramite questo script) -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}"
     crossorigin="anonymous"></script>

  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(TITOLO)} — StrumentiUtili.it</title>
  <meta name="description" content="${esc(DESCRIZIONE)}" />
  <link rel="canonical" href="${URL_PAGINA}" />

  <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/icon.png" />
  <link rel="apple-touch-icon" href="/assets/icon.png" />
  <link rel="manifest" href="/manifest.json">

  <meta property="og:site_name" content="StrumentiUtili.it" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Santo del giorno, onomastici e auguri" />
  <meta property="og:description" content="${esc(DESCRIZIONE)}" />
  <meta property="og:url" content="${URL_PAGINA}" />
  <meta property="og:locale" content="it_IT" />
  <meta property="og:image" content="https://strumentiutili.it/assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://strumentiutili.it/assets/og-image.png">

  <link rel="stylesheet" href="/css/styles.css">

  <script type="application/ld+json">
${JSON.stringify(ld, null, 2).split('\n').map((l) => '  ' + l).join('\n')}
  </script>
</head>
<body class="bg-gray-50 text-gray-800 pb-28 block">
  <header></header>

  <div class="container mx-auto px-4 py-8 max-w-7xl flex flex-col lg:grid lg:grid-cols-12 gap-8 min-h-screen">

    <main id="contenuto" class="w-full lg:col-span-8 lg:col-start-1 block">

      <h1 class="text-3xl font-bold text-gray-900 tracking-tight">Santo del giorno</h1>
      <p class="mt-3 text-gray-700 leading-relaxed">
        Il santo di oggi, chi festeggia l&rsquo;onomastico e un biglietto di auguri pronto da mandare. Sotto, le altre cose da sapere sulla giornata: la luna, l&rsquo;alba e il tramonto, la prossima festa.
      </p>

      <section id="sdg-oggi" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 mt-6" aria-labelledby="sdg-santo">
        <div class="flex items-center justify-between gap-2">
          <button type="button" id="sdg-ieri" class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition" aria-label="Giorno prima">&lsaquo; <span class="hidden sm:inline">Giorno prima</span></button>
          <p id="sdg-data" class="text-sm font-semibold text-indigo-700 text-center">Oggi</p>
          <button type="button" id="sdg-domani" class="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition" aria-label="Giorno dopo"><span class="hidden sm:inline">Giorno dopo</span> &rsaquo;</button>
        </div>
        <h2 id="sdg-santo" class="mt-4 text-center text-3xl sm:text-4xl font-extrabold text-gray-900">&mdash;</h2>
        <p class="mt-2 text-center text-sm"><a id="sdg-wiki" hidden href="#" target="_blank" rel="noopener" class="text-indigo-700 font-semibold hover:underline">La sua storia su Wikipedia</a></p>
        <div id="sdg-altri-blocco" hidden class="mt-4 text-center">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Si festeggiano anche</p>
          <ul id="sdg-altri" class="mt-1 text-sm text-gray-700 space-y-0.5"></ul>
        </div>
        <p id="sdg-nomi-blocco" class="mt-4 text-center text-sm text-gray-700"><span class="font-semibold">Onomastico oggi:</span> <span id="sdg-nomi">&mdash;</span></p>
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          <a id="sdg-whatsapp" href="https://wa.me/" target="_blank" rel="noopener" class="inline-flex items-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition">Manda su WhatsApp</a>
          <button type="button" id="sdg-torna-oggi" hidden class="bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold px-4 py-2.5 rounded-lg text-sm transition">Torna a oggi</button>
        </div>
        <noscript><p class="mt-3 text-sm text-red-700 text-center">Per vedere il santo di oggi serve JavaScript. Il calendario di tutti i giorni &egrave; qui sotto.</p></noscript>
      </section>

      <section id="sdg-onomastico" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 mt-6" aria-labelledby="t-onomastico">
        <h2 id="t-onomastico" class="text-xl font-bold text-gray-900">Quando &egrave; l&rsquo;onomastico di&hellip;</h2>
        <form id="sdg-cerca" class="mt-3 flex gap-2" role="search">
          <label for="sdg-nome" class="sr-only">Nome</label>
          <input id="sdg-nome" list="sdg-suggerimenti" type="search" autocomplete="off" autocapitalize="words" placeholder="Scrivi un nome, per esempio Giulia" class="flex-1 min-w-0 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          <datalist id="sdg-suggerimenti"></datalist>
          <button type="submit" class="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-lg transition">Cerca</button>
        </form>
        <div id="sdg-risultato" class="mt-4" aria-live="polite"></div>
      </section>

      <section id="sdg-auguri" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 mt-6" aria-labelledby="t-auguri">
        <h2 id="t-auguri" class="text-xl font-bold text-gray-900">Il biglietto di auguri</h2>
        <p class="text-sm text-gray-600 mt-1">Si crea sul tuo dispositivo: scegli, guarda l&rsquo;anteprima e condividi.</p>
        <div class="mt-4 grid gap-5 md:grid-cols-2 items-start">
          <div class="space-y-4">
            <fieldset>
              <legend class="text-sm font-semibold text-gray-800">Per</legend>
              <div class="mt-2 flex gap-2">
                <label class="cursor-pointer"><input type="radio" name="sdg-tipo" value="onomastico" checked class="peer sr-only" /><span class="inline-block rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:border-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500">Onomastico</span></label>
                <label class="cursor-pointer"><input type="radio" name="sdg-tipo" value="compleanno" class="peer sr-only" /><span class="inline-block rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:border-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500">Compleanno</span></label>
              </div>
            </fieldset>
            <div>
              <label for="sdg-auguri-nome" class="block text-sm font-semibold text-gray-800">Nome</label>
              <input id="sdg-auguri-nome" type="text" maxlength="30" autocomplete="off" autocapitalize="words" class="mt-1 w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <fieldset>
              <legend class="text-sm font-semibold text-gray-800">Colori</legend>
              <div class="mt-2 flex flex-wrap gap-2">
${temi}
              </div>
            </fieldset>
            <div class="flex flex-wrap gap-2 pt-1">
              <button type="button" id="sdg-auguri-condividi" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-xl transition">Condividi</button>
              <button type="button" id="sdg-auguri-scarica" class="bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold px-5 py-3 rounded-xl transition">Scarica l&rsquo;immagine</button>
            </div>
            <p id="sdg-auguri-esito" class="text-sm text-gray-700" aria-live="polite"></p>
          </div>
          <canvas id="sdg-tela" width="1080" height="1080" class="w-full max-w-sm mx-auto rounded-xl shadow-md border border-gray-100" role="img" aria-label="Anteprima del biglietto di auguri"></canvas>
        </div>
      </section>

      <section id="sdg-breve" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 mt-6" aria-labelledby="t-breve">
        <h2 id="t-breve" class="text-xl font-bold text-gray-900">Oggi in breve</h2>
        <dl class="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
          <div class="rounded-lg bg-gray-50 p-3"><dt class="text-xs font-semibold uppercase tracking-wide text-gray-500">Giorno dell&rsquo;anno</dt><dd id="sdg-giorno-anno" class="mt-1 font-semibold text-gray-900">&mdash;</dd></div>
          <div class="rounded-lg bg-gray-50 p-3"><dt class="text-xs font-semibold uppercase tracking-wide text-gray-500">Luna</dt><dd id="sdg-luna" class="mt-1 font-semibold text-gray-900">&mdash;</dd></div>
          <div class="rounded-lg bg-gray-50 p-3 sm:col-span-2">
            <dt class="text-xs font-semibold uppercase tracking-wide text-gray-500 flex flex-wrap items-center gap-2">Alba e tramonto a
              <label for="sdg-citta" class="sr-only">Citt&agrave;</label>
              <select id="sdg-citta" class="normal-case tracking-normal bg-white border border-gray-300 rounded-md px-2 py-1 text-sm font-semibold text-gray-900"></select>
              <button type="button" id="sdg-posizione" class="normal-case tracking-normal text-indigo-700 font-semibold hover:underline">usa la mia posizione</button>
            </dt>
            <dd id="sdg-sole" class="mt-1 font-semibold text-gray-900">&mdash;</dd>
          </div>
          <div class="rounded-lg bg-gray-50 p-3 sm:col-span-2"><dt class="text-xs font-semibold uppercase tracking-wide text-gray-500">Prossima festa</dt><dd id="sdg-festa" class="mt-1 font-semibold text-gray-900">&mdash;</dd></div>
          <div id="sdg-ricorrenze-blocco" hidden class="rounded-lg bg-amber-50 p-3 sm:col-span-2"><dt class="text-xs font-semibold uppercase tracking-wide text-amber-800">Oggi &egrave; anche</dt><dd id="sdg-ricorrenze" class="mt-1 font-semibold text-amber-900"></dd></div>
        </dl>
      </section>

${AD_CONTENUTO}

      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-8" aria-labelledby="t-calendario">
        <h2 id="t-calendario" class="text-xl font-bold text-gray-900 mb-1">Il calendario dei santi</h2>
        <p class="text-sm text-gray-600 mb-4">Il santo principale di ogni giorno dell&rsquo;anno. Tocca un mese per aprirlo.</p>
        <!-- su:santi:calendario -->
        <!-- /su:santi:calendario -->
      </section>

      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-8" aria-labelledby="t-faq">
        <h2 id="t-faq" class="text-xl font-bold text-gray-900 mb-2">Domande frequenti</h2>
${faq}
        <p class="mt-4 text-xs text-gray-500"><!-- su:santi:fonte --><!-- /su:santi:fonte --></p>
      </section>
    </main>

    <aside class="w-full lg:col-span-4 lg:col-start-9 lg:row-span-2 block">
      <nav aria-label="Strumenti collegati" class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 class="font-bold text-gray-900 mb-3">Strumenti collegati</h2>
        <ul class="space-y-2 text-sm text-gray-700">
          <li><a href="/utilita-web/calendario-da-stampare/" class="hover:text-indigo-600 transition">Calendario da stampare</a></li>
          <li><a href="/utilita-web/sudoku-del-giorno/" class="hover:text-indigo-600 transition">Sudoku del giorno</a></li>
          <li><a href="/lavoro-contratti/giorni-lavorativi/" class="hover:text-indigo-600 transition">Giorni lavorativi</a></li>
          <li><a href="/utilita-web/" class="hover:text-indigo-600 transition font-semibold">Tutti gli strumenti Utilit&agrave; &amp; Web &rarr;</a></li>
        </ul>
      </nav>

      <div class="su-ad su-ad--laterale ad-slot-desktop w-full text-center mt-6" data-su-pos="laterale">
        <ins data-su-pos="laterale" data-ad-format="vertical" class="adsbygoogle"
             style="display:block;width:100%;min-width:0;"
             data-ad-client="${CLIENT}"
             data-ad-slot="6912312067"></ins>
      </div>
    </aside>

  </div>

  <footer>
  </footer>

  <script defer src="/js/festivita.js"></script>
  <script defer src="/js/sole.js"></script>
  <script defer src="/js/santi.js"></script>
  <script defer src="/js/auguri.js"></script>
  <script defer src="/js/santi-ui.js"></script>
  <script defer src="/js/pubblicita.js"></script>
  <script defer src="/js/layout.js"></script>
</body>
</html>
`;
}

// Il calendario: un <details> per mese, il santo principale di ogni giorno.
function calendario(dati) {
  const mesi = [];
  for (let m = 1; m <= 12; m++) {
    const righe = [];
    const n = new Date(Date.UTC(2000, m, 0)).getUTCDate();
    for (let g = 1; g <= n; g++) {
      const k = String(m).padStart(2, '0') + '-' + String(g).padStart(2, '0');
      const santi = dati.giorni[k] || [];
      const altri = santi.length > 1 ? ' <span class="text-gray-500">e altri ' + (santi.length - 1) + '</span>' : '';
      righe.push('            <li class="flex gap-3 py-1 border-t border-gray-100"><span class="w-24 shrink-0 font-semibold text-gray-900">' +
        (g === 1 ? '1°' : g) + ' ' + F.NOMI_MESI[m - 1].toLowerCase() + '</span><span class="text-gray-700">' + esc(santi[0] ? santi[0][0] : '') + altri + '</span></li>');
    }
    mesi.push([
      '        <details class="group border-b border-gray-100">',
      '          <summary class="cursor-pointer py-3 font-semibold text-gray-900 list-none flex justify-between items-center">' + F.NOMI_MESI[m - 1] +
        '<span class="text-indigo-600 transition-transform group-open:rotate-180" aria-hidden="true">&#9662;</span></summary>',
      '          <ul class="pb-3 text-sm">',
      righe.join('\n'),
      '          </ul>',
      '        </details>'
    ].join('\n'));
  }
  return mesi.join('\n');
}

function fonte(dati) {
  const d = String(dati.generato || '').split('-');
  return 'Santi e onomastici: <a href="https://it.wikipedia.org/wiki/Calendario_romano_generale" target="_blank" rel="noopener" class="underline">Calendario romano generale</a> e <a href="https://www.wikidata.org" target="_blank" rel="noopener" class="underline">Wikidata</a> (licenza CC0)' +
    (d.length === 3 ? ', dati del ' + d[2] + '/' + d[1] + '/' + d[0] : '') + '. Alba e tramonto: algoritmo NOAA. Fasi lunari: J. Meeus.';
}

function sostituisci(html, nome, contenuto, inLinea) {
  const apri = '<!-- su:santi:' + nome + ' -->';
  const chiudi = '<!-- /su:santi:' + nome + ' -->';
  const i = html.indexOf(apri), j = html.indexOf(chiudi);
  if (i < 0 || j < i) throw new Error('Manca la regione su:santi:' + nome);
  const rientro = html.slice(html.lastIndexOf('\n', i) + 1, i).replace(/\S.*$/, '');
  const dentro = inLinea ? contenuto : '\n' + contenuto + '\n' + rientro;
  return html.slice(0, i + apri.length) + dentro + html.slice(j);
}

/** Riscrive le parti che vengono dai dati; il resto della pagina resta com'e'. */
function aggiorna(html, dati) {
  let fuori = sostituisci(html, 'calendario', calendario(dati), false);
  fuori = sostituisci(fuori, 'fonte', fonte(dati), true);
  return fuori;
}

module.exports = { pagina, aggiorna, calendario, fonte, FAQ, URL_PAGINA };
