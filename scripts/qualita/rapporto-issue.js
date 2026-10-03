#!/usr/bin/env node
// scripts/qualita/rapporto-issue.js — Dalle misure settimanali alle issue.
//
// Aggiorna la issue fissata «Qualità del sito (misure settimanali)» con
// l'ultimo controllo (in fondo i dati grezzi, che la settimana dopo servono
// per il confronto) e apre una issue con le etichette «qualita» e
// «priorita:alta» per ogni problema grave nuovo: pagina che non si apre,
// salti della pagina, errori JavaScript, risorse mancanti, peggioramenti
// netti. Lo stesso problema non si segnala due volte (segno invisibile nel
// testo, come per la sentinella). Le issue le legge il laboratorio
// settimanale (.claude/skills/laboratorio/SKILL.md).
//
//   node scripts/qualita/rapporto-issue.js misure.json
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const V = require('./valuta.js');

const MASSIMO_NUOVE = 10;
const ETICHETTE = [
  ['qualita', '1d76db', 'Segnalazione automatica delle misure settimanali del sito'],
  ['qualita-stato', 'c5def5', 'Riepilogo dell\'ultimo controllo di qualità'],
  ['priorita:alta', 'b60205', 'Cambia qualcosa che il sito mostra o calcola']
];

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('gh ' + args.slice(0, 2).join(' ') + ': ' + r.stderr);
  return r.stdout;
}

function file(testo) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qualita-')), 'corpo.md');
  fs.writeFileSync(p, testo.length > 60000 ? testo.slice(0, 60000) + '\n\n… (testo tagliato)' : testo);
  return p;
}

function main() {
  const r = JSON.parse(fs.readFileSync(process.argv[2] || 'misure.json', 'utf8'));
  for (const [nome, colore, descr] of ETICHETTE) gh(['label', 'create', nome, '--color', colore, '--description', descr, '--force']);

  const stato = JSON.parse(gh(['issue', 'list', '--label', 'qualita-stato', '--state', 'open', '--limit', '5', '--json', 'number,body']));
  const prima = stato.length ? V.datiPrecedenti(stato[0].body) : null;
  const corpo = V.corpoRapporto(r, prima);
  if (stato.length) gh(['issue', 'edit', String(stato[0].number), '--body-file', file(corpo)]);
  else {
    const url = gh(['issue', 'create', '--title', 'Qualità del sito (misure settimanali)', '--body-file', file(corpo), '--label', 'qualita-stato']).trim();
    try { gh(['issue', 'pin', url]); } catch (e) { console.log('Issue di stato non fissata: ' + e.message); }
  }

  const esistenti = JSON.parse(gh(['issue', 'list', '--label', 'qualita', '--state', 'open', '--limit', '500', '--json', 'body']));
  const gia = new Set(esistenti.flatMap((i) => [...String(i.body).matchAll(/<!-- qualita:(\S+) -->/g)].map((m) => m[1])));
  const nuovi = V.avvisi(r, prima).filter((a) => !gia.has(a.id));
  const proprietario = process.env.GITHUB_REPOSITORY_OWNER || '';
  for (const a of nuovi.slice(0, MASSIMO_NUOVE)) {
    const testo = `${a.testo}\n\nMisura del ${r.data} (telefono a 390 px, CPU rallentata 4 volte, rete mobile). Rapporto completo nella issue fissata «Qualità del sito».\n\n${proprietario ? '@' + proprietario : ''}\n\n<!-- qualita:${a.id} -->`;
    const url = gh(['issue', 'create', '--title', a.titolo.slice(0, 200), '--body-file', file(testo), '--label', 'qualita', '--label', 'priorita:alta']).trim();
    console.log('Nuova: ' + url);
  }
  console.log(`Rapporto aggiornato: ${r.misure.length} pagine, ${nuovi.length} avvisi nuovi.`);
}

if (require.main === module) main();
