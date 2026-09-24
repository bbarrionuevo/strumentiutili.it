#!/usr/bin/env node
// scripts/applica-layout.js — Scrive nelle pagine il layout generato da
// build-layout.js: salta-al-contenuto, intestazione, briciole di pane, piede
// e il JSON-LD BreadcrumbList.
//
// Idempotente: la prima esecuzione sostituisce il markup scritto a mano e
// lascia dei marcatori HTML; dalla seconda in poi riscrive solo quello che sta
// fra i marcatori. Tutto il resto della pagina non viene toccato.
//
//   node scripts/applica-layout.js           riscrive
//   node scripts/applica-layout.js --check   esce con 1 se qualcosa cambierebbe

'use strict';

const fs = require('node:fs');
const L = require('./build-layout.js');

const M = L.M;

// ------------------------------------------------------------------ utilita'

// Trova <tag ...> ... </tag> partendo dalla prima apertura. Le pagine non
// annidano header dentro header ne' footer dentro footer, quindi basta la
// prima chiusura; il caso di budget-planner (header dentro <main>) e' escluso
// perche' si cerca solo la PRIMA apertura del documento.
function blocco(html, tag) {
  const apre = html.indexOf('<' + tag);
  if (apre === -1) return null;
  const chiude = html.indexOf('</' + tag + '>', apre);
  if (chiude === -1) return null;
  return { inizio: apre, fine: chiude + tag.length + 3, testo: html.slice(apre, chiude + tag.length + 3) };
}

// Sostituisce quello che sta fra due marcatori; se non ci sono, restituisce null.
function traMarcatori(html, apri, chiudi, nuovo) {
  const i = html.indexOf(apri);
  if (i === -1) return null;
  const j = html.indexOf(chiudi, i);
  if (j === -1) return null;
  return html.slice(0, i) + apri + '\n' + nuovo + '\n' + '  ' + html.slice(j);
}

function avvolgi(apri, contenuto, chiudi, rientro) {
  const sp = rientro == null ? '  ' : rientro;
  return sp + apri + '\n' + contenuto + '\n' + sp + chiudi;
}

// --------------------------------------------------------------- sostituzioni

// I preconnect vanno il piu' presto possibile: subito dopo <head>, cioe' prima
// dello script di AdSense, che da li' carica anche la CMP nativa di Google.
function applicaTeste(html) {
  const nuovo = L.teste();
  const conMarcatori = traMarcatori(html, M.testeApri, M.testeChiudi, nuovo);
  if (conMarcatori !== null) return conMarcatori;

  const m = html.match(/<head[^>]*>/);
  if (!m) return html;
  const punto = m.index + m[0].length;
  return html.slice(0, punto) + '\n' + avvolgi(M.testeApri, nuovo, M.testeChiudi) + html.slice(punto);
}

function applicaSalta(html) {
  const nuovo = L.saltaAlContenuto();
  const conMarcatori = traMarcatori(html, M.saltaApri, M.saltaChiudi, nuovo);
  if (conMarcatori !== null) return conMarcatori;

  // Prima esecuzione: subito dopo <body ...>
  const m = html.match(/<body[^>]*>/);
  if (!m) return html;
  const punto = m.index + m[0].length;
  return html.slice(0, punto) + '\n' + avvolgi(M.saltaApri, nuovo, M.saltaChiudi) + html.slice(punto);
}

function applicaTestata(html, ctx) {
  const nuovo = L.intestazione(ctx);
  const conMarcatori = traMarcatori(html, M.testataApri, M.testataChiudi, nuovo);
  if (conMarcatori !== null) return conMarcatori;

  const b = blocco(html, 'header');
  if (!b) return html;
  return html.slice(0, b.inizio) + avvolgi(M.testataApri, nuovo, M.testataChiudi).trimStart() + html.slice(b.fine);
}

function applicaPiede(html) {
  const b = blocco(html, 'footer');

  // Lo spazio pubblicitario si recupera dal piede attuale (o da quello gia'
  // generato) e si riporta identico: gli slot cambiano da pagina a pagina.
  let pubblicita = null;
  if (b) {
    const i = b.testo.indexOf('<div class="su-ad');
    if (i !== -1) {
      const j = b.testo.indexOf('</div>', i);
      if (j !== -1) pubblicita = b.testo.slice(i, j + 6);
    }
  }

  const nuovo = L.piede(pubblicita);
  const conMarcatori = traMarcatori(html, M.piedeApri, M.piedeChiudi, nuovo);
  if (conMarcatori !== null) return conMarcatori;

  if (!b) return html;
  return html.slice(0, b.inizio) + avvolgi(M.piedeApri, nuovo, M.piedeChiudi).trimStart() + html.slice(b.fine);
}

function applicaBriciole(html, ctx) {
  const nuovo = L.briciole(ctx);

  // La home non ha briciole: se ne restano tracce da un giro precedente, via.
  if (nuovo === null) {
    const i = html.indexOf(M.briciolaApri);
    if (i === -1) return html;
    const j = html.indexOf(M.briciolaChiudi, i);
    if (j === -1) return html;
    return html.slice(0, i).replace(/[ \t]*$/, '') + html.slice(j + M.briciolaChiudi.length).replace(/^\n/, '');
  }

  const conMarcatori = traMarcatori(html, M.briciolaApri, M.briciolaChiudi, nuovo);
  if (conMarcatori !== null) return conMarcatori;

  const avvolto = avvolgi(M.briciolaApri, nuovo, M.briciolaChiudi, '      ');

  // Prima esecuzione: al posto del vecchio link "torna a...", che stava
  // esattamente li' e faceva lo stesso mestiere con 26 diciture diverse.
  const vecchio = html.match(/[ \t]*<a [^>]*>\s*←[^<]*<\/a>\n?/);
  if (vecchio) {
    return html.slice(0, vecchio.index) + avvolto + '\n' + html.slice(vecchio.index + vecchio[0].length);
  }

  // Se non c'era, si mette in cima al contenuto.
  const m = html.match(/<main[^>]*>/);
  if (!m) return html;
  const punto = m.index + m[0].length;
  return html.slice(0, punto) + '\n' + avvolto + '\n' + html.slice(punto);
}

// Sostituisce SOLO il nodo BreadcrumbList, dentro o fuori da un @graph, senza
// toccare WebApplication, HowTo e FAQPage che convivono nello stesso blocco.
function applicaJsonLd(html, ctx) {
  const nuovo = L.jsonLdBriciole(ctx);
  const datiNuovi = nuovo === null ? null : JSON.parse(nuovo.replace(/^\s*<script[^>]*>/, '').replace(/<\/script>\s*$/, ''));

  const blocchi = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

  for (const b of blocchi) {
    let dati;
    try { dati = JSON.parse(b[1]); } catch (e) { continue; }

    let toccato = false;
    const sostituisci = (elenco) => {
      for (let i = 0; i < elenco.length; i++) {
        if (elenco[i] && elenco[i]['@type'] === 'BreadcrumbList') {
          if (datiNuovi === null) { elenco.splice(i, 1); i--; }
          else { elenco[i] = Object.assign({}, datiNuovi); delete elenco[i]['@context']; }
          toccato = true;
        }
      }
    };

    if (Array.isArray(dati)) sostituisci(dati);
    else if (Array.isArray(dati['@graph'])) sostituisci(dati['@graph']);
    else if (dati['@type'] === 'BreadcrumbList') {
      if (datiNuovi === null) {
        return html.slice(0, b.index).replace(/[ \t]*$/, '') + html.slice(b.index + b[0].length).replace(/^\n/, '');
      }
      dati = datiNuovi;
      toccato = true;
    }

    if (toccato) {
      const corpo = JSON.stringify(dati, null, 2).split('\n').map((l) => '  ' + l).join('\n');
      const rimpiazzo = '<script type="application/ld+json">\n' + corpo + '\n  </script>';
      return html.slice(0, b.index) + rimpiazzo + html.slice(b.index + b[0].length);
    }
  }

  if (datiNuovi === null) return html;

  // Nessun BreadcrumbList: se ne aggiunge uno prima di </head>.
  const i = html.indexOf('</head>');
  if (i === -1) return html;
  return html.slice(0, i) + nuovo + '\n' + html.slice(i);
}

// Il salta-al-contenuto ha bisogno di un bersaglio.
function applicaIdContenuto(html) {
  const m = html.match(/<main[^>]*>/);
  if (!m) return html;
  if (/\sid=/.test(m[0])) return html;
  const nuovo = m[0].replace(/^<main/, '<main id="contenuto"');
  return html.slice(0, m.index) + nuovo + html.slice(m.index + m[0].length);
}

// Il menu mobile e la ricerca vivono in js/layout.js: deve esserci ovunque.
function applicaScriptLayout(html) {
  if (html.includes('src="/js/layout.js"')) return html;
  const i = html.lastIndexOf('</body>');
  if (i === -1) return html;
  const riga = '  <script defer src="/js/layout.js"></script>\n';
  return html.slice(0, i) + riga + html.slice(i);
}

// js/spazio.js (recenti, preferiti, cancellazione) serve a js/layout.js:
// deve esserci ovunque, e prima.
function applicaScriptSpazio(html) {
  if (html.includes('src="/js/spazio.js"')) return html;
  const m = html.match(/[ \t]*<script[^>]*src="\/js\/layout\.js"[^>]*><\/script>/);
  if (!m) return html;
  return html.slice(0, m.index) + '  <script defer src="/js/spazio.js"></script>\n' + html.slice(m.index);
}

// js/main.js e' stato assorbito da js/layout.js.
function rimuoviMainJs(html) {
  return html.replace(/[ \t]*<script[^>]*src="\/js\/main\.js"[^>]*><\/script>\n?/g, '');
}

// --------------------------------------------------------------------- guida

function trasforma(html, ctx) {
  let fuori = html;
  fuori = applicaTeste(fuori);
  fuori = applicaSalta(fuori);
  fuori = applicaTestata(fuori, ctx);
  fuori = applicaPiede(fuori);
  fuori = applicaIdContenuto(fuori);
  fuori = applicaBriciole(fuori, ctx);
  fuori = applicaJsonLd(fuori, ctx);
  fuori = rimuoviMainJs(fuori);
  fuori = applicaScriptLayout(fuori);
  fuori = applicaScriptSpazio(fuori);
  return fuori;
}

function esegui(opzioni) {
  const soloVerifica = !!(opzioni && opzioni.soloVerifica);
  const pagine = L.pagineAttive();
  let cambiate = 0;
  const elenco = [];

  for (const p of pagine) {
    const prima = fs.readFileSync(p.assoluto, 'utf8');
    const ctx = L.contestoPagina(p.rel, prima);
    const dopo = trasforma(prima, ctx);
    if (dopo !== prima) {
      cambiate++;
      elenco.push(p.rel);
      if (!soloVerifica) fs.writeFileSync(p.assoluto, dopo);
    }
  }

  if (soloVerifica) {
    if (cambiate) {
      console.error('Layout non aggiornato in ' + cambiate + ' pagine su ' + pagine.length + '.');
      elenco.slice(0, 10).forEach((r) => console.error('  ' + r));
      if (elenco.length > 10) console.error('  ... e altre ' + (elenco.length - 10));
      console.error('Esegui: node scripts/applica-layout.js');
      process.exitCode = 1;
    } else {
      console.log('Layout aggiornato in tutte le ' + pagine.length + ' pagine.');
    }
    return { pagine: pagine.length, cambiate };
  }

  console.log('Layout riscritto: ' + cambiate + ' pagine modificate su ' + pagine.length + '.');
  return { pagine: pagine.length, cambiate };
}

module.exports = { esegui, trasforma };

if (require.main === module) {
  esegui({ soloVerifica: process.argv.includes('--check') });
}
