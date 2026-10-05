#!/usr/bin/env node
// scripts/qualita/contenuti.js — Quanto vale il testo delle pagine principali.
//
// AdSense ha rifiutato il sito con «concentrati sui contenuti». Questo
// controllo (solo lettura) misura, per le pagine del nucleo (i modelli
// ufficiali e i calcolatori fiscali con impressioni), cio' che un revisore
// guarda: quanto testo proprio c'e', quanto e' ripetuto uguale in altre pagine
// (testo «in serie»), se ci sono esempi, tabelle, immagini, domande frequenti e
// fonti ufficiali. Ne esce una tabella dalla pagina piu' debole alla piu' forte.
//
//   node scripts/qualita/contenuti.js            tabella in Markdown
//   node scripts/qualita/contenuti.js --json     dati grezzi
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const C = require('../../tests/helpers/contenuti.js');

const RADICE = path.join(__dirname, '..', '..');

// Le pagine del nucleo: i 15 compilatori di modelli ufficiali, l'indice dei
// modelli F24 e i calcolatori fiscali e del lavoro con impressioni.
const NUCLEO = [
  '/cittadino-tasse/f24-editabile/f24-elide/',
  '/cittadino-tasse/f24-editabile/f24-ordinario/',
  '/cittadino-tasse/f24-editabile/f23-editabile/',
  '/cittadino-tasse/f24-editabile/f24-semplificato/',
  '/cittadino-tasse/f24-editabile/f24-accise/',
  '/cittadino-tasse/f24-editabile/',
  '/cittadino-tasse/modello-rli/',
  '/cittadino-tasse/modello-69/',
  '/cittadino-tasse/modello-rap/',
  '/cittadino-tasse/accredito-rimborsi/',
  '/cittadino-tasse/disdetta-canone-rai/',
  '/cittadino-tasse/esenzione-canone-rai-over-75/',
  '/cittadino-tasse/rimborso-canone-rai/',
  '/fisco-professioni/modelli-partita-iva/',
  '/identita-burocrazia/richiesta-codice-fiscale/',
  '/identita-burocrazia/codice-fiscale-enti/',
  '/lavoro-contratti/stipendio-netto/',
  '/lavoro-contratti/lettera-dimissioni-preavviso/',
  '/lavoro-contratti/ritenuta-acconto/',
  '/cittadino-tasse/calcolo-bollo-auto/',
  '/cittadino-tasse/passaggio-di-proprieta/',
  '/cittadino-tasse/assegno-unico/',
  '/cittadino-tasse/simulatore-isee/',
  '/cittadino-tasse/simulatore-pensione/',
  '/fisco-professioni/ravvedimento-operoso/'
];

const FONTI_UFFICIALI = /https?:\/\/(?:www\.)?(?:agenziaentrate\.gov\.it|normattiva\.it|inps\.it|gazzettaufficiale\.it|mef\.gov\.it|agenziaentrateriscossione\.gov\.it|aci\.gov\.it|lavoro\.gov\.it|istat\.it|finanze\.gov\.it)/g;

/** Il corpo della pagina senza testata, piede, briciole, link correlati e script. */
function corpo(html) {
  const via = (h, a, b) => { const i = h.indexOf(a), j = h.indexOf(b); return i < 0 || j < 0 ? h : h.slice(0, i) + h.slice(j + b.length); };
  let b = html.slice(Math.max(0, html.indexOf('<body')));
  for (const k of ['testata', 'piede', 'briciole', 'salta']) b = via(b, '<!-- su:' + k + ' -->', '<!-- /su:' + k + ' -->');
  return b.replace(/<nav aria-label="Strumenti collegati"[\s\S]*?<\/nav>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
}

/** Le frasi di un testo, normalizzate; solo quelle di almeno 8 parole (le altre sono etichette). */
function frasi(testo) {
  return String(testo)
    .split(/(?<=[.!?:])\s+|\n+/)
    .map((f) => C.normalizza(f).replace(/[^a-z0-9àèéìòù ]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((f) => f.split(' ').length >= 8);
}

/**
 * Per ogni frase, in quante pagine compare. Una frase identica in tre o piu'
 * pagine e' testo «in serie»: a chi legge (e al revisore) non aggiunge niente.
 */
function contaFrasi(pagine) {
  const conta = new Map();
  for (const p of pagine) {
    for (const f of new Set(frasi(p.testo))) conta.set(f, (conta.get(f) || 0) + 1);
  }
  return conta;
}

/** Le misure di una pagina (pura: riceve l'HTML e la mappa delle frasi del sito). */
function misura(html, conteggio) {
  const b = corpo(html);
  const testo = C.testoVisibile(b);
  const parole = testo.split(/\s+/).filter(Boolean).length;
  const mie = frasi(testo);
  const inSerie = mie.filter((f) => (conteggio.get(f) || 0) >= 3).length;
  const titolo = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const descrizione = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  return {
    parole,
    frasi: mie.length,
    inSerie,
    quotaInSerie: mie.length ? Math.round((inSerie / mie.length) * 100) : 0,
    faq: C.domandeFaq(html).length,
    esempi: (testo.match(/\besemp(?:io|i)\b/gi) || []).length,
    tabelle: (b.match(/<table\b/g) || []).length,
    immagini: (b.match(/<(?:img|svg|figure|canvas)\b/g) || []).length,
    fonti: new Set((b.match(FONTI_UFFICIALI) || [])).size,
    titolo: titolo.replace(/\s+—\s+StrumentiUtili\.it$/, '').length,
    descrizione: descrizione.length
  };
}

/** Un punteggio da 0 a 100: piu' basso = pagina da rinforzare prima. */
function punteggio(m) {
  let p = 0;
  p += Math.min(30, (m.parole / 1500) * 30);           // testo: pieno a 1500 parole proprie
  p += Math.max(0, 20 - m.quotaInSerie);                // poco testo in serie
  p += Math.min(15, m.esempi * 3);                      // esempi concreti
  p += Math.min(10, m.faq * 2);                         // domande frequenti
  p += Math.min(10, m.fonti * 2);                       // fonti ufficiali citate
  p += Math.min(10, m.tabelle * 5);                     // tabelle (codici, scadenze)
  p += Math.min(5, m.immagini * 5);                     // immagini o schemi
  return Math.round(p);
}

function percorsoFile(u) {
  return path.join(RADICE, u.slice(1), 'index.html');
}

function main() {
  const tutte = C.pagineIndicizzabili().map((p) => ({ percorso: p.percorso, testo: C.testoVisibile(corpo(p.html)) }));
  const conteggio = contaFrasi(tutte);
  const righe = NUCLEO.map((u) => {
    const html = fs.readFileSync(percorsoFile(u), 'utf8');
    const m = misura(html, conteggio);
    return Object.assign({ pagina: u, punteggio: punteggio(m) }, m);
  }).sort((a, b) => a.punteggio - b.punteggio);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(righe, null, 1)); return; }
  console.log('| Pagina | Punti | Parole | Testo in serie | Esempi | FAQ | Tabelle | Immagini | Fonti uff. |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of righe) {
    console.log(`| ${r.pagina} | ${r.punteggio} | ${r.parole} | ${r.quotaInSerie}% (${r.inSerie}/${r.frasi}) | ${r.esempi} | ${r.faq} | ${r.tabelle} | ${r.immagini} | ${r.fonti} |`);
  }
}

if (require.main === module) main();
module.exports = { NUCLEO, corpo, frasi, contaFrasi, misura, punteggio };
