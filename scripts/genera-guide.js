#!/usr/bin/env node
// scripts/genera-guide.js — Le guide pratiche (/guide/).
//
// Ogni guida e' un modulo in scripts/guide/: testo, esempi, errori comuni,
// domande e fonti. Le cifre degli esempi non sono scritte a mano: le calcolano
// i motori degli strumenti (js/bollo-calcolo.js, js/imu.js, js/naspi-calcolo.js
// ...) al momento di generare la pagina. Se una regola cambia nel file delle
// regole, la guida e lo strumento cambiano insieme, e il --check lo segnala.
//
// Scrive:
//   guide/<slug>/index.html   una pagina per guida (con il layout del sito)
//   guide/index.html          l'elenco
//   data/guide.json           l'elenco per la mappa del sito e la ricerca
//   e, nelle pagine degli strumenti collegati, il rimando alla guida
//   (fra <!-- su:guida --> e <!-- /su:guida -->, dentro «Strumenti collegati»).
//
//   node scripts/genera-guide.js           scrive
//   node scripts/genera-guide.js --check   esce con 1 se qualcosa non e' aggiornato
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const B = require('./pagina-base.js');
const L = require('./build-layout.js');
const A = require('./applica-layout.js');
const F = require('./collega-fonti.js');
const { caricaScript, regoleFiscali } = require('./carica-motori.js');

const RADICE = path.join(__dirname, '..');
const AUTORE = { '@type': 'Person', name: 'Brian Barrionuevo', url: B.SITO + '/contatti/' };
const EDITORE = { '@type': 'Organization', name: 'StrumentiUtili.it', url: B.SITO + '/', logo: { '@type': 'ImageObject', url: B.SITO + '/assets/icon.png' } };

// L'ordine e' quello dell'elenco; i temi raggruppano le guide nella pagina /guide/
const TEMI = [
  { id: 'casa', nome: 'Auto, casa e affitto' },
  { id: 'lavoro', nome: 'Lavoro e INPS' },
  { id: 'documenti', nome: 'Documenti, PEC e firma' },
  { id: 'partita-iva', nome: 'Partita IVA e fatture' }
];

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// ------------------------------------------------------------ contesto

function formato(x, decimali) {
  // useGrouping 'always': in italiano Intl non separa le migliaia nei numeri di
  // quattro cifre (1654,20), mentre nel resto del sito si scrive 1.654,20
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali, useGrouping: 'always' }).format(x);
}

function contesto() {
  const { window } = caricaScript(['js/irpef.js', 'js/stipendio-netto.js', 'js/tfr.js', 'js/imu.js']);
  const ctx = {
    regole: regoleFiscali(),
    motori: {
      bollo: require('../js/bollo-calcolo.js'),
      naspi: require('../js/naspi-calcolo.js'),
      rli: require('../js/rli-imposte.js'),
      rliSanzioni: require('../js/rli-sanzioni.js'),
      estratto: require('../js/estratto-contributivo.js'),
      irpef: window.StrumentiIrpef,
      stipendio: window.StipendioNetto,
      tfr: window.TFRCalculator,
      imu: window.IMUCalculator
    },
    // 1142.4 -> "1.142,40 €"; con decimali = 0 -> "1.142 €"
    euro: (x, decimali) => formato(x, decimali == null ? 2 : decimali) + '&nbsp;&euro;',
    num: (x, decimali) => formato(x, decimali || 0),
    pct: (x, decimali) => formato(x * 100, decimali == null ? 0 : decimali) + '%',
    data: (iso) => { const [a, m, g] = iso.split('-').map(Number); return g + ' ' + MESI[m - 1] + ' ' + a; }
  };
  ctx.h = elementi();
  return ctx;
}

// Piccoli costruttori di HTML, cosi' le guide scrivono testo e non classi
function elementi() {
  return {
    h2: (id, testo) => `      <h2 id="${id}" class="text-2xl font-bold text-gray-900 pt-6 scroll-mt-24">${testo}</h2>`,
    h3: (testo) => `      <h3 class="text-lg font-bold text-gray-900 pt-3">${testo}</h3>`,
    p: (testo) => `      <p>${testo}</p>`,
    ul: (voci) => `      <ul class="list-disc pl-5 space-y-1.5">\n${voci.map((v) => '        <li>' + v + '</li>').join('\n')}\n      </ul>`,
    ol: (voci) => `      <ol class="list-decimal pl-5 space-y-1.5">\n${voci.map((v) => '        <li>' + v + '</li>').join('\n')}\n      </ol>`,
    tabella: (didascalia, intestazioni, righe) => `      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-gray-200">
          <caption class="text-left text-sm font-semibold text-gray-700 pb-2">${didascalia}</caption>
          <thead class="bg-gray-50 text-left"><tr>${intestazioni.map((t) => '<th scope="col" class="p-2.5 font-semibold text-gray-900">' + t + '</th>').join('')}</tr></thead>
          <tbody class="divide-y divide-gray-100">
${righe.map((r) => '            <tr>' + r.map((c, i) => (i === 0 ? '<th scope="row" class="p-2.5 text-left font-medium text-gray-800">' : '<td class="p-2.5 tabular-nums">') + c + (i === 0 ? '</th>' : '</td>')).join('') + '</tr>').join('\n')}
          </tbody>
        </table>
      </div>`,
    // Un esempio con i conti in vista: titolo, passaggi, risultato
    esempio: (titolo, passaggi, risultato) => `      <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p class="font-bold text-emerald-900">Esempio: ${titolo}</p>
        <ol class="mt-2 list-decimal pl-5 space-y-1 text-emerald-950">
${passaggi.map((v) => '          <li>' + v + '</li>').join('\n')}
        </ol>
        <p class="mt-3 font-semibold text-emerald-900">${risultato}</p>
      </div>`,
    nota: (testo) => `      <p class="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 text-amber-950">${testo}</p>`
  };
}

// ------------------------------------------------------------ guide

function guide(ctx) {
  const elenco = require('./guide/elenco.js');
  return elenco.map((modulo) => {
    const g = modulo(ctx);
    for (const campo of ['slug', 'tema', 'titolo', 'titoloBreve', 'descrizione', 'pubblicata', 'aggiornata', 'introduzione', 'riassunto', 'strumenti', 'corpo', 'errori', 'faq', 'fonti']) {
      if (g[campo] == null) throw new Error('Guida ' + (g.slug || '?') + ': manca ' + campo);
    }
    if (!TEMI.some((t) => t.id === g.tema)) throw new Error('Guida ' + g.slug + ': tema sconosciuto ' + g.tema);
    g.percorso = '/guide/' + g.slug + '/';
    return g;
  });
}

function parole(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').split(/\s+/).filter(Boolean).length;
}

const RIQUADRO = `      <div class="su-ad su-ad--contenuto mt-8 text-center rounded-xl w-full block" data-su-pos="contenuto">
        <ins data-su-pos="contenuto" data-ad-format="rectangle" class="adsbygoogle" style="display:block;width:100%;min-width:0;" data-ad-client="ca-pub-9434300808171957" data-ad-slot="8859818557" data-full-width-responsive="true"></ins>
      </div>`;

function paginaGuida(g, tutte, ctx) {
  const tema = TEMI.find((t) => t.id === g.tema);
  const fonti = g.fonti.map((f) => typeof f === 'string' ? F.collegaVoce(f).html
    : '<a href="' + B.esc(f.href) + '" class="text-indigo-700 underline" target="_blank" rel="noopener">' + f.testo + '</a>' + (f.dopo || ''));
  const collegati = tutte.filter((a) => a.slug !== g.slug && a.tema === g.tema).slice(0, 3);
  const strumenti = g.strumenti.map((s) => `<a href="${s.href}" class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 text-sm">${s.testo} <span aria-hidden="true">&rarr;</span></a>`).join('\n          ');

  const corpoArticolo = [
    `      <p class="text-sm font-semibold text-indigo-700"><a href="/guide/" class="hover:underline">Guida</a> &middot; ${B.esc(tema.nome)}</p>`,
    `      <h1 class="mt-1 text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">${g.titolo}</h1>`,
    `      <p class="mt-3 text-sm text-gray-500">di <a href="/contatti/#chi-cura-il-sito" class="text-indigo-700 underline">Brian Barrionuevo</a> &middot; aggiornata il <time datetime="${g.aggiornata}">${ctx.data(g.aggiornata)}</time> &middot; ${Math.max(1, Math.round(parole(g.corpo + g.introduzione) / 200))} minuti di lettura</p>`,
    `      <p class="mt-5 text-lg text-gray-700 leading-relaxed">${g.introduzione}</p>`,
    `      <div class="mt-6 rounded-xl bg-indigo-50 border border-indigo-100 p-5">
        <h2 class="text-base font-bold text-indigo-900">In breve</h2>
        <ul class="mt-2 list-disc pl-5 space-y-1.5 text-indigo-950">
${g.riassunto.map((r) => '          <li>' + r + '</li>').join('\n')}
        </ul>
      </div>`,
    `      <div class="mt-5 flex flex-wrap items-center gap-3">
          <span class="text-sm text-gray-700">Fai il conto con i tuoi dati:</span>
          ${strumenti}
      </div>`,
    `      <div class="mt-6 space-y-4 text-gray-700 leading-relaxed">`,
    g.corpo,
    `      </div>`,
    RIQUADRO,
    `      <div class="mt-6 space-y-4 text-gray-700 leading-relaxed">`,
    `      <h2 id="errori" class="text-2xl font-bold text-gray-900 pt-6 scroll-mt-24">Errori comuni</h2>`,
    `      <ul class="list-disc pl-5 space-y-1.5">\n${g.errori.map((e) => '        <li>' + e + '</li>').join('\n')}\n      </ul>`,
    `      <h2 id="domande" class="text-2xl font-bold text-gray-900 pt-6 scroll-mt-24">Domande frequenti</h2>`,
    `      <div>\n${g.faq.map((f) => `        <details class="group border-b border-gray-100 py-3">
          <summary class="cursor-pointer font-semibold text-gray-900 list-none flex justify-between items-center gap-3">${f.d}<span class="text-indigo-600 transition-transform group-open:rotate-45 text-lg leading-none" aria-hidden="true">+</span></summary>
          <p class="mt-2 text-gray-700">${f.r}</p>
        </details>`).join('\n')}\n      </div>`,
    `      <h2 id="fonti" class="text-2xl font-bold text-gray-900 pt-6 scroll-mt-24">Fonti ufficiali</h2>`,
    `      <ul class="list-disc pl-5 space-y-1 text-sm text-gray-600">\n${fonti.map((f) => '        <li>' + f + '</li>').join('\n')}\n      </ul>`,
    `      <p class="text-sm text-gray-600">Le cifre degli esempi sono calcolate con gli stessi motori degli strumenti del sito, sulle regole in vigore alla data di aggiornamento. Come le controlliamo: <a href="/metodo/" class="text-indigo-700 underline">come verifichiamo i dati</a>. Questa guida non sostituisce il parere di un professionista.</p>`,
    `      </div>`,
    collegati.length ? `      <nav aria-label="Altre guide" class="mt-10 border-t border-gray-100 pt-6">
        <h2 class="text-lg font-bold text-gray-900">Leggi anche</h2>
        <ul class="mt-3 space-y-2">
${collegati.map((a) => `          <li><a href="${a.percorso}" class="font-semibold text-indigo-700 hover:underline">${a.titolo}</a></li>`).join('\n')}
        </ul>
      </nav>` : ''
  ].filter(Boolean).join('\n');

  const corpo = `      <article class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-10 max-w-3xl mx-auto">
${corpoArticolo}
      </article>`;

  const url = B.SITO + g.percorso;
  const html = B.pagina({
    percorso: g.percorso,
    titolo: g.titoloBreve,
    descrizione: g.descrizione,
    corpo,
    tipoOg: 'article',
    ld: [{
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          '@id': url + '#articolo',
          headline: testo(g.titolo),
          description: g.descrizione,
          inLanguage: 'it-IT',
          datePublished: g.pubblicata,
          dateModified: g.aggiornata,
          author: AUTORE,
          publisher: EDITORE,
          image: B.SITO + '/assets/og-image.png',
          mainEntityOfPage: url,
          about: g.strumenti.map((s) => ({ '@type': 'WebApplication', name: testo(s.testo), url: B.SITO + s.href }))
        },
        {
          '@type': 'FAQPage',
          '@id': url + '#domande',
          mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: testo(f.d), acceptedAnswer: { '@type': 'Answer', text: testo(f.r) } }))
        }
      ]
    }]
  });
  return conLayout('guide/' + g.slug + '/index.html', html);
}

function testo(html) {
  return String(html).replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&euro;/g, '€').replace(/&rsquo;/g, '’').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é').replace(/&igrave;/g, 'ì').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù')
    .replace(/&Egrave;/g, 'È').replace(/&times;/g, '×').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&deg;/g, '°').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function paginaIndice(tutte) {
  const blocchi = TEMI.map((t) => {
    const sue = tutte.filter((g) => g.tema === t.id);
    if (!sue.length) return '';
    return `      <section class="mt-8" aria-labelledby="tema-${t.id}">
        <h2 id="tema-${t.id}" class="text-xl font-bold text-gray-900">${B.esc(t.nome)}</h2>
        <ul class="mt-4 grid gap-4 md:grid-cols-2">
${sue.map((g) => `          <li class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <a href="${g.percorso}" class="text-lg font-bold text-indigo-700 hover:underline">${g.titolo}</a>
            <p class="mt-2 text-sm text-gray-600 leading-relaxed">${B.esc(g.descrizione)}</p>
          </li>`).join('\n')}
        </ul>
      </section>`;
  }).filter(Boolean).join('\n');

  const corpo = `      <div class="max-w-5xl">
      <h1 class="text-3xl font-bold text-gray-900 tracking-tight">Guide pratiche</h1>
      <p class="mt-3 text-gray-700 leading-relaxed max-w-3xl">Spiegazioni passo per passo delle pratiche per cui si usano gli strumenti del sito: quanto si paga, entro quando, con quali moduli e quali errori evitare. Ogni guida ha esempi con i numeri, calcolati con gli stessi motori degli strumenti, e rimanda ai testi ufficiali. Le scrive e le aggiorna <a href="/contatti/#chi-cura-il-sito" class="text-indigo-700 underline">Brian Barrionuevo</a>, seguendo il <a href="/metodo/" class="text-indigo-700 underline">metodo di verifica</a> del sito.</p>
${blocchi}
      </div>`;

  const html = B.pagina({
    percorso: '/guide/',
    titolo: 'Guide pratiche su tasse, casa, lavoro e documenti',
    descrizione: 'Guide passo per passo su bollo auto, affitto e RLI, IMU, busta paga, dimissioni e INPS: regole, esempi con i numeri, errori comuni e fonti ufficiali.',
    corpo,
    ld: [{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': B.SITO + '/guide/#pagina',
      name: 'Guide pratiche',
      url: B.SITO + '/guide/',
      inLanguage: 'it-IT',
      author: AUTORE,
      publisher: EDITORE,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: tutte.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: B.SITO + g.percorso, name: testo(g.titolo) }))
      }
    }]
  });
  return conLayout('guide/index.html', html);
}

// Testata, piede e briciole come in ogni altra pagina
function conLayout(rel, html) {
  return A.trasforma(html, L.contestoPagina(rel, html));
}

// ------------------------------------------------ rimandi dagli strumenti

const APRI = '<!-- su:guida -->';
const CHIUDI = '<!-- /su:guida -->';

function rimandi(tutte) {
  const perStrumento = new Map();
  for (const g of tutte) {
    for (const s of g.strumenti) {
      if (!perStrumento.has(s.href)) perStrumento.set(s.href, []);
      perStrumento.get(s.href).push(g);
    }
  }
  return perStrumento;
}

function conRimando(html, guideDelloStrumento, file) {
  // via il blocco precedente, se c'e'
  const i = html.indexOf(APRI);
  if (i !== -1) {
    const j = html.indexOf(CHIUDI, i);
    const inizioRiga = html.lastIndexOf('\n', i) + 1;
    html = html.slice(0, inizioRiga) + html.slice(j + CHIUDI.length).replace(/^\n/, '');
  }
  const m = html.match(/(<nav aria-label="Strumenti collegati"[^>]*>\s*<h2[^>]*>Strumenti collegati<\/h2>\n)/);
  if (!m) throw new Error(file + ': manca il blocco «Strumenti collegati» dove mettere il rimando alla guida');
  const blocco = '          ' + APRI + '\n' +
    guideDelloStrumento.map((g) => `          <p class="mb-3 text-sm"><a href="${g.percorso}" class="font-semibold text-indigo-700 hover:underline"><span aria-hidden="true">📖</span> Guida: ${g.titoloBreve}</a></p>`).join('\n') +
    '\n          ' + CHIUDI + '\n';
  return html.replace(m[1], m[1] + blocco);
}

// In home, subito dopo l'apertura: le guide sono il contenuto da leggere,
// gli strumenti vengono dopo.
const HOME_APRI = '<!-- su:guide-home -->';
const HOME_CHIUDI = '<!-- /su:guide-home -->';

function conGuideInHome(html, tutte) {
  const blocco = `    ${HOME_APRI}
    <section id="guide" class="mb-10" aria-labelledby="guide-titolo">
      <div class="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 id="guide-titolo" class="text-2xl font-bold text-gray-900">📖 Guide pratiche</h2>
        <a href="/guide/" class="text-sm font-bold text-indigo-600 hover:text-indigo-800">Tutte le guide <span aria-hidden="true">&rarr;</span></a>
      </div>
      <p class="mt-2 text-gray-700 max-w-3xl">Come funzionano le pratiche per cui servono gli strumenti: quanto si paga, entro quando, con quali moduli. Con esempi e fonti ufficiali.</p>
      <ul class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
${tutte.map((g) => `        <li class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <a href="${g.percorso}" class="font-bold text-gray-900 hover:text-indigo-700">${g.titoloBreve}</a>
          <p class="mt-2 text-sm text-gray-600 leading-relaxed">${B.esc(g.descrizione)}</p>
        </li>`).join('\n')}
      </ul>
    </section>
    ${HOME_CHIUDI}`;
  const i = html.indexOf(HOME_APRI);
  if (i !== -1) {
    const inizio = html.lastIndexOf('\n', i) + 1;
    const j = html.indexOf(HOME_CHIUDI, i) + HOME_CHIUDI.length;
    return html.slice(0, inizio) + blocco + html.slice(j);
  }
  // prima del commento che apre la sezione Fisco, se c'e', altrimenti prima della sezione
  const commento = html.indexOf('    <!-- 1. FISCO E PROFESSIONI -->');
  const punto = commento !== -1 ? commento : html.indexOf('    <section id="fisco-professioni"');
  if (punto === -1) throw new Error('index.html: non trovo dove mettere le guide');
  return html.slice(0, punto) + blocco + '\n\n' + html.slice(punto);
}

function fileDi(percorso) {
  return path.join(RADICE, percorso.replace(/^\//, ''), 'index.html');
}

// ------------------------------------------------------------ uscita

function tuttiIFile() {
  const ctx = contesto();
  const tutte = guide(ctx);
  const file = new Map();
  for (const g of tutte) file.set(path.join(RADICE, 'guide', g.slug, 'index.html'), paginaGuida(g, tutte, ctx));
  file.set(path.join(RADICE, 'guide', 'index.html'), paginaIndice(tutte));
  file.set(path.join(RADICE, 'data', 'guide.json'), JSON.stringify({
    guide: tutte.map((g) => ({ percorso: g.percorso, titolo: testo(g.titolo), titoloBreve: testo(g.titoloBreve), descrizione: g.descrizione, tema: TEMI.find((t) => t.id === g.tema).nome, aggiornata: g.aggiornata, strumenti: g.strumenti.map((s) => s.href) }))
  }, null, 2) + '\n');
  const home = path.join(RADICE, 'index.html');
  file.set(home, conGuideInHome(fs.readFileSync(home, 'utf8'), tutte));
  for (const [href, sue] of rimandi(tutte)) {
    const f = fileDi(href);
    const attuale = file.has(f) ? file.get(f) : fs.readFileSync(f, 'utf8');
    file.set(f, conRimando(attuale, sue, path.relative(RADICE, f)));
  }
  return { file, tutte };
}

function main() {
  const check = process.argv.includes('--check');
  const { file, tutte } = tuttiIFile();
  const diversi = [];
  for (const [f, contenuto] of file) {
    const attuale = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    if (attuale === contenuto) continue;
    diversi.push(path.relative(RADICE, f));
    if (!check) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, contenuto);
    }
  }
  if (check) {
    if (diversi.length) {
      console.error('Guide non aggiornate: ' + diversi.join(', ') + '\nEsegui: node scripts/genera-guide.js');
      process.exit(1);
    }
    console.log('Guide aggiornate (' + tutte.length + ').');
    return;
  }
  console.log('Guide: ' + tutte.length + ', file scritti: ' + diversi.length + (diversi.length ? ' (' + diversi.join(', ') + ')' : ''));
}

if (require.main === module) main();
module.exports = { tuttiIFile, contesto, guide, testo, parole, TEMI };
