// scripts/pagina-base.js — Lo scheletro di una pagina del sito.
//
// Le pagine scritte da un generatore (mappa del sito, pagina 404, guide)
// partono da qui: <head> completo, <header>, <main> e <footer> vuoti.
// Intestazione, piede, briciole e il loro JSON-LD li mette poi
// scripts/applica-layout.js, come per tutte le altre pagine.
'use strict';

const SITO = 'https://strumentiutili.it';
const CLIENT = 'ca-pub-9434300808171957';

function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function jsonLd(dati) {
  return '  <script type="application/ld+json">\n' +
    JSON.stringify(dati, null, 2).split('\n').map((l) => '  ' + l).join('\n') + '\n  </script>';
}

/**
 * @param {object} o
 *   percorso     "/mappa-del-sito/"
 *   titolo       il <title>, senza " — StrumentiUtili.it"
 *   descrizione  meta description
 *   corpo        l'HTML dentro <main> (H1 compreso)
 *   laterale     HTML della colonna laterale (facoltativo)
 *   ld           oggetti JSON-LD da aggiungere (le briciole le aggiunge applica-layout)
 *   noindex      true per le pagine da non indicizzare (404)
 *   script       altri script da caricare con defer
 *   tipoOg       "website" (predefinito) o "article"
 */
function pagina(o) {
  const url = SITO + o.percorso;
  const titolo = o.titolo + ' — StrumentiUtili.it';
  const principale = o.laterale
    ? `  <div class="container mx-auto px-4 py-8 max-w-7xl flex flex-col lg:grid lg:grid-cols-12 gap-8">
    <main id="contenuto" class="w-full lg:col-span-8 lg:col-start-1 block">
${o.corpo}
    </main>
    <aside class="w-full lg:col-span-4 lg:col-start-9 block">
${o.laterale}
    </aside>
  </div>`
    : `  <main id="contenuto" class="container mx-auto px-4 py-8 block">
${o.corpo}
  </main>`;
  const script = ['/js/pubblicita.js'].concat(o.script || [], ['/js/spazio.js', '/js/layout.js']);
  return `<!doctype html>
<html lang="it" class="scroll-smooth">
<head>

  <!-- Google AdSense (La CMP nativa e il Consent Mode si caricano in automatico tramite questo script) -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}"
     crossorigin="anonymous"></script>

  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(titolo)}</title>
  <meta name="description" content="${esc(o.descrizione)}" />
${o.noindex
    // una pagina da non indicizzare (la 404) non indica un indirizzo canonico
    ? '  <meta name="robots" content="noindex, follow" />'
    : '  <link rel="canonical" href="' + url + '" />'}

  <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/icon.png" />
  <link rel="apple-touch-icon" href="/assets/icon.png" />
  <link rel="manifest" href="/manifest.json">

  <meta property="og:site_name" content="StrumentiUtili.it" />
  <meta property="og:type" content="${o.tipoOg || 'website'}" />
  <meta property="og:title" content="${esc(o.titolo)}" />
  <meta property="og:description" content="${esc(o.descrizione)}" />
${o.noindex ? '' : '  <meta property="og:url" content="' + url + '" />\n'}  <meta property="og:locale" content="it_IT" />
  <meta property="og:image" content="${SITO}/assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${SITO}/assets/og-image.png">

  <link rel="stylesheet" href="/css/styles.css">
${(o.ld || []).map(jsonLd).join('\n')}
</head>
<body class="bg-gray-50 text-gray-800 pb-28 block">
  <header></header>

${principale}

  <footer>
  </footer>

${script.map((s) => '  <script defer src="' + s + '"></script>').join('\n')}
</body>
</html>
`;
}

module.exports = { pagina, esc, SITO };
