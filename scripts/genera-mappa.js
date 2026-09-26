#!/usr/bin/env node
// scripts/genera-mappa.js — La mappa del sito per le persone (/mappa-del-sito/).
//
// L'elenco si scrive da data/strumenti.json (lo stesso indice della ricerca),
// raggruppato per categoria, piu' le guide e le pagine del sito. Se la pagina
// non c'e' la crea; se c'e' riscrive solo la parte fra <!-- su:mappa --> e
// <!-- /su:mappa -->, cosi' intestazione e piede restano quelli di
// applica-layout.
//
//   node scripts/genera-mappa.js           scrive
//   node scripts/genera-mappa.js --check   esce con 1 se la pagina non e' aggiornata
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const L = require('./build-layout.js');
const B = require('./pagina-base.js');

const RADICE = path.join(__dirname, '..');
const FILE = path.join(RADICE, 'mappa-del-sito', 'index.html');
const APRI = '<!-- su:mappa -->';
const CHIUDI = '<!-- /su:mappa -->';

// Pagine che non sono strumenti. Le guide si aggiungono da data/guide.json se c'e'.
const ALTRE = [
  { percorso: '/contatti/', titolo: 'Chi siamo e contatti' },
  { percorso: '/politica-sulla-privacy/', titolo: 'Privacy e cookie' },
  { percorso: '/avviso-legale/', titolo: 'Avviso legale' }
];

function voci() {
  const indice = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'strumenti.json'), 'utf8')).strumenti;
  // le varianti (?regione=...) portano alla stessa pagina: una voce sola
  return indice.filter((v) => !v.variante && !v.percorso.includes('?'));
}

function guide() {
  const f = path.join(RADICE, 'data', 'guide.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).guide : [];
}

function elenco() {
  const tutte = voci();
  const blocchi = L.CATEGORIE.map((c) => {
    const sue = tutte.filter((v) => v.categoria === c.slug).sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
    if (!sue.length) return '';
    const righe = sue.map((v) => `          <li data-mappa="${B.esc((v.titolo + ' ' + v.descrizione).toLowerCase())}"><a href="${B.esc(v.percorso)}" class="font-semibold text-indigo-700 hover:underline">${B.esc(v.titolo)}</a><span class="block text-sm text-gray-600">${B.esc(v.descrizione)}</span></li>`).join('\n');
    return `      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6" aria-labelledby="m-${c.slug}">
        <h2 id="m-${c.slug}" class="text-xl font-bold text-gray-900"><a href="/${c.slug}/" class="hover:text-indigo-700">${B.esc(c.lungo)}</a> <span class="text-sm font-normal text-gray-500">(${sue.length})</span></h2>
        <ul class="mt-4 space-y-3">
${righe}
        </ul>
      </section>`;
  }).filter(Boolean);
  const g = guide();
  if (g.length) {
    blocchi.unshift(`      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6" aria-labelledby="m-guide">
        <h2 id="m-guide" class="text-xl font-bold text-gray-900"><a href="/guide/" class="hover:text-indigo-700">Guide</a> <span class="text-sm font-normal text-gray-500">(${g.length})</span></h2>
        <ul class="mt-4 space-y-3">
${g.map((v) => `          <li data-mappa="${B.esc((v.titolo + ' ' + v.descrizione).toLowerCase())}"><a href="${B.esc(v.percorso)}" class="font-semibold text-indigo-700 hover:underline">${B.esc(v.titolo)}</a><span class="block text-sm text-gray-600">${B.esc(v.descrizione)}</span></li>`).join('\n')}
        </ul>
      </section>`);
  }
  blocchi.push(`      <section class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6" aria-labelledby="m-sito">
        <h2 id="m-sito" class="text-xl font-bold text-gray-900">Il sito</h2>
        <ul class="mt-4 space-y-2">
${ALTRE.map((v) => `          <li data-mappa="${B.esc(v.titolo.toLowerCase())}"><a href="${v.percorso}" class="font-semibold text-indigo-700 hover:underline">${B.esc(v.titolo)}</a></li>`).join('\n')}
        </ul>
      </section>`);
  return blocchi.join('\n');
}

function corpo() {
  const n = voci().length;
  return `      <h1 class="text-3xl font-bold text-gray-900 tracking-tight">Mappa del sito</h1>
      <p class="mt-3 text-gray-700 leading-relaxed max-w-3xl">Tutti gli strumenti di StrumentiUtili.it in un&rsquo;unica pagina, divisi per argomento: ${n} strumenti per tasse, lavoro, documenti, PDF e piccole utilit&agrave; di tutti i giorni. Scrivi una parola per trovare subito quello che ti serve.</p>
      <form role="search" class="mt-5 max-w-xl">
        <label for="mappa-cerca" class="block text-sm font-semibold text-gray-800 mb-1">Filtra l&rsquo;elenco</label>
        <input id="mappa-cerca" name="q" type="search" autocomplete="off" placeholder="Es. bollo, dimissioni, PDF" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white" />
        <p id="mappa-esito" class="mt-2 text-sm text-gray-600" aria-live="polite"></p>
      </form>
      ${APRI}
${elenco()}
      ${CHIUDI}`;
}

function nuovaPagina() {
  return B.pagina({
    percorso: '/mappa-del-sito/',
    titolo: 'Mappa del sito: tutti gli strumenti',
    descrizione: 'Tutti gli strumenti gratuiti di StrumentiUtili.it in una pagina: tasse e F24, lavoro e stipendio, documenti, PDF, intelligenza artificiale locale e utilità.',
    corpo: corpo(),
    script: ['/js/mappa.js']
  });
}

function aggiorna(html) {
  const i = html.indexOf(APRI), j = html.indexOf(CHIUDI);
  if (i < 0 || j < i) throw new Error('Manca la regione su:mappa in mappa-del-sito/index.html');
  return html.slice(0, i + APRI.length) + '\n' + elenco() + '\n      ' + html.slice(j);
}

function main() {
  const check = process.argv.includes('--check');
  if (!fs.existsSync(FILE)) {
    if (check) { console.error('Manca mappa-del-sito/index.html: esegui node scripts/genera-mappa.js'); process.exit(1); }
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, nuovaPagina());
    console.log('Creata mappa-del-sito/index.html: esegui node scripts/applica-layout.js');
    return;
  }
  const html = fs.readFileSync(FILE, 'utf8');
  const nuovo = aggiorna(html);
  if (check) {
    if (nuovo !== html) { console.error('La mappa del sito non e\' aggiornata: esegui node scripts/genera-mappa.js'); process.exit(1); }
    console.log('Mappa del sito aggiornata.');
    return;
  }
  fs.writeFileSync(FILE, nuovo);
  console.log('Mappa del sito: ' + voci().length + ' strumenti.');
}

if (require.main === module) main();
module.exports = { aggiorna, elenco, voci };
