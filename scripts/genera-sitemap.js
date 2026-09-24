#!/usr/bin/env node
// scripts/genera-sitemap.js — Rigenera sitemap.xml dalle pagine che esistono
// davvero, con lastmod reale.
//
// Prima il sitemap veniva aggiornato da update-ecosystem.js, che aggiungeva in
// coda senza mai ripulire: 121 URL su 129 senza lastmod, tutte con la stessa
// priority, e le tre pagine legali elencate due volte (in forma .html e con la
// barra finale). Qui si riscrive tutto da zero, ordinato.
//
//   node scripts/genera-sitemap.js           riscrive sitemap.xml
//   node scripts/genera-sitemap.js --check   esce con 1 se cambierebbe

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const L = require('./build-layout.js');
const RADICE = L.RADICE;
const SITO = L.SITO;

function priorita(ctx) {
  if (ctx.tipo === 'home') return '1.0';
  if (ctx.tipo === 'categoria') return '0.9';
  if (ctx.tipo === 'legale') return '0.3';
  return '0.8';
}

// Una pagina con <meta name="robots" content="noindex"> non va nel sitemap:
// sarebbe chiedere a Google di indicizzare una pagina a cui si dice di non
// farlo, e Search Console lo segnala come errore ("URL inviato contrassegnato
// come noindex"). Oggi sono le varianti pSEO (bollo per regione, P.IVA per
// professione, dimissioni per CCNL): quasi identiche fra loro, restano
// raggiungibili ma fuori dall'indice.
function noindex(html) {
  const m = String(html).match(/<meta\b[^>]*\bname=(['"])robots\1[^>]*>/i);
  return !!m && /\bcontent=(['"])[^'"]*\bnoindex\b/i.test(m[0]);
}

// Data dell'ultimo commit che ha toccato ciascun file, in un solo passaggio su
// tutta la storia. I file non ancora committati prendono la data di modifica
// sul disco: il mtime da solo non serve, perche' dopo un clone e' uguale per
// tutti.
function dateDaGit() {
  const date = new Map();
  let uscita;
  try {
    uscita = execSync('git log --date=short --format="D:%ad" --name-only --no-renames',
      { cwd: RADICE, encoding: 'utf8', maxBuffer: 1 << 28 });
  } catch (e) {
    return date;
  }
  let corrente = null;
  for (const riga of uscita.split('\n')) {
    if (riga.startsWith('D:')) { corrente = riga.slice(2).trim(); continue; }
    const f = riga.trim();
    if (!f || !corrente) continue;
    if (!date.has(f)) date.set(f, corrente);   // il log arriva dal piu' recente
  }
  return date;
}

function genera() {
  const gitDate = dateDaGit();
  const oggi = new Date().toISOString().slice(0, 10);

  const righe = L.pagineAttive().flatMap((p) => {
    const html = fs.readFileSync(p.assoluto, 'utf8');
    if (noindex(html)) return [];
    const ctx = L.contestoPagina(p.rel, html);
    const lastmod = gitDate.get(p.rel) ||
      fs.statSync(p.assoluto).mtime.toISOString().slice(0, 10) || oggi;
    return [{
      url: SITO + ctx.url,
      lastmod,
      priority: priorita(ctx),
      ordine: ctx.tipo === 'home' ? 0 : ctx.tipo === 'categoria' ? 1 : ctx.tipo === 'legale' ? 3 : 2
    }];
  });

  righe.sort((a, b) => a.ordine - b.ordine || a.url.localeCompare(b.url));

  const corpo = righe.map((r) =>
    '  <url>\n' +
    '    <loc>' + r.url + '</loc>\n' +
    '    <lastmod>' + r.lastmod + '</lastmod>\n' +
    '    <priority>' + r.priority + '</priority>\n' +
    '  </url>'
  ).join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!-- Generato da scripts/genera-sitemap.js: non modificare a mano. -->\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    corpo + '\n' +
    '</urlset>\n';
}

// Il confronto del --check ignora i VALORI dei lastmod, e il motivo non e'
// pigrizia. Il lastmod viene dalla data dell'ultimo commit che ha toccato il
// file, e quella data non esiste finche' il commit non e' fatto: mentre si
// lavora vale il mtime. Chi modifica una pagina un giorno e la committa il
// giorno dopo si trova la CI rossa per una differenza che non dipende da niente
// che abbia scritto, e che sparisce rigenerando e ricommittando — cioe' un
// controllo che punisce il calendario invece del codice.
//
// Resta verificato tutto il resto, che e' quello che conta: quali URL ci sono,
// in che ordine e con che priority. Che ogni voce abbia un lastmod, e che sia
// una data vera, lo controlla tests/sitemap.test.js.
function senzaDate(xml) {
  return String(xml).split('\r\n').join('\n')
    .replace(/<lastmod>[^<]*<\/lastmod>/g, '<lastmod/>');
}

function esegui(opzioni) {
  const soloVerifica = !!(opzioni && opzioni.soloVerifica);
  const destinazione = path.join(RADICE, 'sitemap.xml');
  const nuovo = genera();
  const attuale = fs.existsSync(destinazione) ? fs.readFileSync(destinazione, 'utf8') : '';
  const identico = nuovo.split('\r\n').join('\n') === attuale.split('\r\n').join('\n');
  const equivalente = senzaDate(nuovo) === senzaDate(attuale);
  const quante = (nuovo.match(/<loc>/g) || []).length;

  if (soloVerifica) {
    if (equivalente) console.log('sitemap.xml aggiornato (' + quante + ' URL).');
    else {
      console.error('sitemap.xml non rigenerato. Esegui: node scripts/genera-sitemap.js');
      process.exitCode = 1;
    }
    return { quante, uguale: equivalente, identico };
  }

  // Scrivendo invece si aggiorna anche solo per le date: il file versionato
  // deve restare accurato.
  if (!identico) fs.writeFileSync(destinazione, nuovo);
  console.log('sitemap.xml: ' + quante + ' URL' + (identico ? ' (nessuna modifica)' : ' scritte') + '.');
  return { quante, uguale: identico, identico };
}

module.exports = { genera, esegui, priorita, senzaDate, noindex };

if (require.main === module) {
  esegui({ soloVerifica: process.argv.includes('--check') });
}
