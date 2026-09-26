#!/usr/bin/env node
// scripts/collega-fonti.js — Le fonti delle pagine diventano collegamenti.
//
// Le liste «Fonti» in fondo agli strumenti citano leggi e decreti per esteso
// («Legge 27 dicembre 2019, n. 160, art. 1»), ma come testo semplice: chi
// voleva controllare doveva cercarsele. Qui ogni citazione riconosciuta
// diventa un collegamento al testo ufficiale:
//
//   - leggi, decreti legislativi, decreti-legge, D.P.R., D.P.C.M. e codici:
//     Normattiva, con l'URN (l'indirizzo stabile previsto dallo standard
//     NIR), e l'articolo quando la citazione ne indica uno solo;
//   - regolamenti e direttive dell'Unione: EUR-Lex, testo in italiano;
//   - modelli e istruzioni dell'Agenzia delle Entrate: la loro pagina.
//
// Ogni schema di indirizzo e' stato provato con .github/workflows/leggi-fonti.yml
// (modo «stato»): tutti rispondono 200 e portano al testo giusto. Una
// citazione che non si riconosce resta testo, senza indovinare.
//
//   node scripts/collega-fonti.js            scrive
//   node scripts/collega-fonti.js --check    esce con 1 se qualcosa cambierebbe
//   node scripts/collega-fonti.js --elenco   stampa gli indirizzi (per verificarli)
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const NORMATTIVA = 'https://www.normattiva.it/uri-res/N2Ls?';
const EURLEX = 'https://eur-lex.europa.eu/eli/';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// Il tipo di atto come si scrive nella pagina -> la parte dell'URN NIR
const ATTI = {
  'Legge': 'stato:legge',
  'D.Lgs.': 'stato:decreto.legislativo',
  'D.L.': 'stato:decreto.legge',
  'D.P.R.': 'presidente.repubblica:decreto',
  'D.P.C.M.': 'presidente.consiglio.ministri:decreto'
};

// I codici si citano senza data e numero: sono atti fissi
const CODICI = {
  'Codice civile': 'stato:regio.decreto:1942-03-16;262:2',
  'Codice di procedura civile': 'stato:regio.decreto:1940-10-28;1443:1'
};

// Le pagine dell'Agenzia delle Entrate gia' usate dai compilatori del sito
const ENTRATE = 'https://www.agenziaentrate.gov.it/portale/schede/';
const MODELLI = [
  [/modello F24 accise/i, ENTRATE + 'pagamenti/f24+accise/modello+f24+accise+2012'],
  [/F24 ELIDE/, ENTRATE + 'pagamenti/f24-elementi-identificativi-f24elide/modello-e-istruzioni-f24elide'],
  [/modello F24 semplificato/i, ENTRATE + 'pagamenti/f24-semplificato/modello-e-istruzioni-f24-semplificato'],
  [/modello F23/i, ENTRATE + 'pagamenti/f23/modello+f23'],
  [/modelli F24, F24 semplificato|modello F24 e istruzioni/i, ENTRATE + 'pagamenti/f24/modello-e-istruzioni-f24'],
  [/Modello RLI/i, ENTRATE + 'pagamenti/registrazione-atti/modelli-e-istruzioni-registrazione-atti'],
  [/Modelli AA9\/12 e AA7\/10/, ENTRATE + 'istanze/aa9_11-apertura-variazione-chiusura-pf/modello-e-istr-pi-pf']
];

const GIORNO = '(\\d{1,2}|1&deg;|1°)';
const MESE = '(' + MESI.join('|') + ')';
const TIPO = '(Legge|D\\.Lgs\\.|D\\.L\\.|D\\.P\\.R\\.|D\\.P\\.C\\.M\\.)';
// «Legge 27 dicembre 2019, n. 160» con, facoltativo, «, art. 1» o «, art. 13-bis».
// «art. 5 della Tariffa» e' un articolo dell'allegato, non del decreto: li'
// si collega l'atto intero.
const ATTO = new RegExp(TIPO + ' ' + GIORNO + ' ' + MESE + ' (\\d{4}), n\\. (\\d+)((?:,? \\([^)]*\\))?,? art\\. (\\d+)(?:-(bis|ter|quater|quinquies|sexies|septies|octies))?(?![\\d-])(?! della Tariffa))?', 'g');
const CODICE = new RegExp('(' + Object.keys(CODICI).join('|') + ')(,? art\\. (\\d+)(?:-(bis|ter|quater))?(?![\\d-]))?', 'g');
const UE = /(Regolamento UE|Direttiva) (\d{4})\/(\d+)(\/UE)?/g;

function due(n) { return String(n).padStart(2, '0'); }

function urnAtto(tipo, giorno, mese, anno, numero, articolo, suffisso) {
  const g = /^1(&deg;|°)$/.test(giorno) ? 1 : Number(giorno);
  const data = anno + '-' + due(MESI.indexOf(mese) + 1) + '-' + due(g);
  let urn = 'urn:nir:' + ATTI[tipo] + ':' + data + ';' + numero;
  if (articolo) urn += '~art' + articolo + (suffisso || '');
  return NORMATTIVA + urn;
}

function urnCodice(nome, articolo, suffisso) {
  let urn = 'urn:nir:' + CODICI[nome];
  if (articolo) urn += '~art' + articolo + (suffisso || '');
  return NORMATTIVA + urn;
}

function ue(tipo, anno, numero) {
  return EURLEX + (tipo === 'Direttiva' ? 'dir' : 'reg') + '/' + anno + '/' + Number(numero) + '/oj/ita';
}

function link(href, testo) {
  return '<a href="' + href.replace(/&/g, '&amp;') + '" class="text-indigo-700 underline" target="_blank" rel="noopener">' + testo + '</a>';
}

// Le parti di una voce gia' dentro a un <a>, da non toccare
function fuoriDaiLink(html, fn) {
  return html.split(/(<a\b[\s\S]*?<\/a>)/).map((pezzo, i) => (i % 2 ? pezzo : fn(pezzo))).join('');
}

/** Collega le citazioni di una voce della lista. Restituisce l'HTML e gli indirizzi usati. */
function collegaVoce(html) {
  const usati = [];
  // una sostituzione alla volta, ognuna solo sul testo rimasto fuori dai link
  const passo = (h, schema, indirizzo) => fuoriDaiLink(h, (t) => t.replace(schema, (...m) => {
    const href = indirizzo(...m);
    usati.push(href);
    return link(href, m[0]);
  }));
  let fuori = passo(html, ATTO, (tutto, tipo, giorno, mese, anno, numero, coda, articolo, suffisso) =>
    urnAtto(tipo, giorno, mese, anno, numero, articolo, suffisso));
  fuori = passo(fuori, CODICE, (tutto, nome, coda, articolo, suffisso) => urnCodice(nome, articolo, suffisso));
  fuori = passo(fuori, UE, (tutto, tipo, anno, numero) => ue(tipo, anno, numero));
  // Nessuna legge riconosciuta ma un modello dell'Agenzia: si collega il
  // nome del modello (il primo schema che corrisponde)
  if (!usati.length && !/<a\b/.test(fuori)) {
    for (const [schema, href] of MODELLI) {
      const m = fuori.match(schema);
      if (!m) continue;
      fuori = fuori.replace(schema, (t) => link(href, t));
      usati.push(href);
      break;
    }
  }
  return { html: fuori, usati };
}

const LISTA = /(>Fonti<\/h3>\s*<ul[^>]*>)([\s\S]*?)(<\/ul>)/;

function trasforma(html) {
  const m = html.match(LISTA);
  if (!m) return { html, usati: [] };
  const usati = [];
  const voci = m[2].replace(/<li>([\s\S]*?)<\/li>/g, (tutto, dentro) => {
    const r = collegaVoce(dentro);
    usati.push(...r.usati);
    return '<li>' + r.html + '</li>';
  });
  return { html: html.replace(LISTA, m[1] + voci + m[3]), usati };
}

function pagine() {
  const fuori = [];
  (function giro(dir) {
    for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'vendor', '.git', 'tests', 'scripts'].includes(v.name)) continue;
      const p = path.join(dir, v.name);
      if (v.isDirectory()) giro(p);
      else if (v.name === 'index.html') fuori.push(p);
    }
  })(RADICE);
  return fuori.sort();
}

function main() {
  const check = process.argv.includes('--check');
  const elenco = process.argv.includes('--elenco');
  const tutti = new Set();
  const cambiate = [];
  for (const f of pagine()) {
    const html = fs.readFileSync(f, 'utf8');
    const r = trasforma(html);
    r.usati.forEach((u) => tutti.add(u));
    // per --elenco: anche i collegamenti gia' presenti nelle liste
    const lista = r.html.match(LISTA);
    if (lista) for (const a of lista[2].matchAll(/<a href="([^"]+)"/g)) tutti.add(a[1].replace(/&amp;/g, '&'));
    if (r.html !== html) {
      cambiate.push(path.relative(RADICE, f));
      if (!check && !elenco) fs.writeFileSync(f, r.html);
    }
  }
  if (elenco) {
    console.log([...tutti].sort().join('\n'));
    return;
  }
  if (check) {
    if (cambiate.length) {
      console.error('Fonti da collegare in: ' + cambiate.join(', ') + '\nEsegui: node scripts/collega-fonti.js');
      process.exit(1);
    }
    console.log('Fonti collegate.');
    return;
  }
  console.log('Fonti collegate: ' + cambiate.length + ' pagine cambiate, ' + tutti.size + ' indirizzi diversi nelle liste.');
}

if (require.main === module) main();
module.exports = { trasforma, collegaVoce, urnAtto, urnCodice, ue };
