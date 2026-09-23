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

// Le varianti pSEO (bollo per regione, P.IVA per professione, dimissioni per
// CCNL) hanno priority piu' bassa delle pagine originali: sono quasi identiche
// fra loro e non e' onesto dichiararle allo stesso livello.
function priorita(ctx, variante) {
  if (ctx.tipo === 'home') return '1.0';
  if (ctx.tipo === 'categoria') return '0.9';
  if (ctx.tipo === 'legale') return '0.3';
  return variante ? '0.5' : '0.8';
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

function varianti() {
  const insieme = new Set();
  try {
    const indice = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'strumenti.json'), 'utf8'));
    for (const voce of indice.strumenti || []) {
      if (voce.variante) insieme.add(voce.percorso);
    }
  } catch (e) { /* senza indice, nessuna variante */ }
  return insieme;
}

function genera() {
  const gitDate = dateDaGit();
  const pSeo = varianti();
  const oggi = new Date().toISOString().slice(0, 10);

  const righe = L.pagineAttive().map((p) => {
    const html = fs.readFileSync(p.assoluto, 'utf8');
    const ctx = L.contestoPagina(p.rel, html);
    const lastmod = gitDate.get(p.rel) ||
      fs.statSync(p.assoluto).mtime.toISOString().slice(0, 10) || oggi;
    return {
      url: SITO + ctx.url,
      lastmod,
      priority: priorita(ctx, pSeo.has(ctx.url)),
      ordine: ctx.tipo === 'home' ? 0 : ctx.tipo === 'categoria' ? 1 : ctx.tipo === 'legale' ? 3 : 2
    };
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

function esegui(opzioni) {
  const soloVerifica = !!(opzioni && opzioni.soloVerifica);
  const destinazione = path.join(RADICE, 'sitemap.xml');
  const nuovo = genera();
  const attuale = fs.existsSync(destinazione) ? fs.readFileSync(destinazione, 'utf8') : '';
  const uguale = nuovo.split('\r\n').join('\n') === attuale.split('\r\n').join('\n');
  const quante = (nuovo.match(/<loc>/g) || []).length;

  if (soloVerifica) {
    if (uguale) console.log('sitemap.xml aggiornato (' + quante + ' URL).');
    else {
      console.error('sitemap.xml non rigenerato. Esegui: node scripts/genera-sitemap.js');
      process.exitCode = 1;
    }
    return { quante, uguale };
  }

  if (!uguale) fs.writeFileSync(destinazione, nuovo);
  console.log('sitemap.xml: ' + quante + ' URL' + (uguale ? ' (nessuna modifica)' : ' scritte') + '.');
  return { quante, uguale };
}

module.exports = { genera, esegui, priorita };

if (require.main === module) {
  esegui({ soloVerifica: process.argv.includes('--check') });
}
