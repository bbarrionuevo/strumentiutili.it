#!/usr/bin/env node
// scripts/sentinella-issue.js — Dal rapporto della sentinella alle segnalazioni su GitHub.
//
// Ogni esito urgente diventa una issue con l'etichetta "sentinella": GitHub
// manda un'email e una notifica al proprietario del repository, e la routine
// di manutenzione (.claude/skills/aggiorna-fonti/SKILL.md) le prende da li'.
// Gli esiti minori della settimana finiscono tutti in una sola issue.
//
// Ogni issue porta nel testo un segno invisibile con l'id dell'esito e la sua
// impronta: la stessa cosa non si segnala due volte, anche se la issue e'
// stata chiusa. Se una issue aperta cambia ancora, si aggiunge un commento.
// Una issue fissata, "Stato delle fonti", riassume l'ultimo controllo.
//
//   node scripts/sentinella-issue.js rapporto-sentinella.json
//
// Usa la riga di comando gh con GH_TOKEN (nel workflow, il token del job).
// Il testo che arriva dai siti esterni passa solo da file, mai dalla shell.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MASSIMO_NUOVE = 15;
const ETICHETTE = [
  ['sentinella', 'd93f0b', 'Segnalazione automatica della sentinella delle fonti'],
  ['priorita:alta', 'b60205', 'Cambia qualcosa che il sito mostra o calcola'],
  ['priorita:bassa', 'fbca04', 'Cambiamento minore da guardare'],
  ['in-lavorazione', '0e8a16', 'Presa in carico dalla routine di manutenzione'],
  ['serve-brian', '5319e7', 'Serve una decisione del proprietario'],
  ['sentinella-stato', 'c5def5', 'Riepilogo dell\'ultimo controllo']
];

const segno = (id, impronta) => `<!-- sentinella:${id} impronta:${impronta} -->`;

/** I segni presenti nel testo di una issue: id -> impronta. */
function segni(corpo) {
  const fuori = new Map();
  for (const m of String(corpo || '').matchAll(/<!-- sentinella:(\S+) impronta:(\S*) -->/g)) fuori.set(m[1], m[2]);
  return fuori;
}

/**
 * Cosa fare con gli esiti, date le issue gia' esistenti (numero, stato, testo).
 * Funzione pura: la provano i test.
 */
function piano(esiti, esistenti) {
  const noti = [];
  for (const i of esistenti) for (const [id, imp] of segni(i.body)) noti.push({ id, imp, numero: i.number, aperta: i.state === 'OPEN' || i.state === 'open', body: i.body });
  const crea = [], commenta = [], minori = [];
  for (const e of esiti) {
    const stessi = noti.filter((n) => n.id === e.id);
    if (stessi.some((n) => n.imp === String(e.impronta))) continue; // gia' segnalato cosi'
    if (e.priorita !== 'alta') { minori.push(e); continue; }
    const aperta = stessi.find((n) => n.aperta);
    if (aperta) commenta.push({ numero: aperta.numero, body: aperta.body, esito: e });
    else crea.push(e);
  }
  return { crea, commenta, minori };
}

function corpoIssue(e, proprietario) {
  const testa = proprietario ? `@${proprietario} ` : '';
  return `${testa}la sentinella ha trovato un cambiamento.\n\n` +
    (e.url ? `**Fonte:** ${e.url}\n\n` : '') +
    e.corpo +
    '\n\n---\n_Il testo citato viene dal sito ufficiale e va verificato li\'. Cosa fare: la routine di manutenzione legge questa segnalazione, controlla la fonte e propone una pull request; se non serve cambiare niente sul sito, aggiorna solo la copia in `fonti/archivio/`._\n\n' +
    segno(e.id, e.impronta);
}

function corpoMinori(minori, data, proprietario) {
  return `${proprietario ? '@' + proprietario + ' ' : ''}cambiamenti minori trovati il ${data}: le cifre controllate ci sono ancora, ma conviene dare un'occhiata.\n\n` +
    minori.map((e) => `### ${e.titolo}\n\n${e.url ? e.url + '\n\n' : ''}${e.corpo}\n\n${segno(e.id, e.impronta)}`).join('\n\n');
}

function corpoStato(r) {
  const righe = Object.entries(r.stato || {}).map(([cat, v]) => `| ${cat} | ${v.controllate} | ${v.cambiate} | ${v.errori} | ${v.senza_copia} |`);
  return `Ultimo controllo: **${r.data}** — ${r.tentativi} documenti scaricati, ${r.falliti} non letti${r.cieca ? ' (**troppi: confronti sospesi**)' : ''}.\n\n` +
    '| Fonti | Controllate | Cambiate | Non lette | Senza copia |\n|---|---|---|---|---|\n' + righe.join('\n') +
    `\n\nEsiti: ${r.esiti.length} (${r.esiti.filter((e) => e.priorita === 'alta').length} urgenti).` +
    (r.errori && r.errori.length ? '\n\n<details><summary>Documenti non letti</summary>\n\n' + r.errori.slice(0, 100).map((e) => '- ' + e).join('\n') + '\n\n</details>' : '') +
    '\n\n_Questa issue si aggiorna da sola a ogni controllo: non serve chiuderla._';
}

function taglia(s) {
  return s.length > 60000 ? s.slice(0, 60000) + '\n\n… (testo tagliato)' : s;
}

// --- GitHub -----------------------------------------------------------------

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('gh ' + args.slice(0, 2).join(' ') + ': ' + r.stderr);
  return r.stdout;
}

function file(testo) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sentinella-')), 'corpo.md');
  fs.writeFileSync(p, taglia(testo));
  return p;
}

function main() {
  const r = JSON.parse(fs.readFileSync(process.argv[2] || 'rapporto-sentinella.json', 'utf8'));
  const proprietario = process.env.GITHUB_REPOSITORY_OWNER || '';
  for (const [nome, colore, descr] of ETICHETTE) gh(['label', 'create', nome, '--color', colore, '--description', descr, '--force']);

  const esistenti = JSON.parse(gh(['issue', 'list', '--label', 'sentinella', '--state', 'all', '--limit', '1000', '--json', 'number,state,body']));
  const { crea, commenta, minori } = piano(r.esiti, esistenti);

  for (const e of crea.slice(0, MASSIMO_NUOVE)) {
    const url = gh(['issue', 'create', '--title', e.titolo.slice(0, 200), '--body-file', file(corpoIssue(e, proprietario)), '--label', 'sentinella', '--label', 'priorita:alta']).trim();
    console.log('Nuova: ' + url + '  ' + e.titolo);
  }
  if (crea.length > MASSIMO_NUOVE) console.log(`Altre ${crea.length - MASSIMO_NUOVE} segnalazioni rimandate al prossimo controllo.`);

  for (const c of commenta) {
    gh(['issue', 'comment', String(c.numero), '--body-file', file(`Cambiato ancora il ${r.data}:\n\n${c.esito.corpo}`)]);
    const nuovo = String(c.body).replace(new RegExp(`<!-- sentinella:${c.esito.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} impronta:\\S* -->`), segno(c.esito.id, c.esito.impronta));
    gh(['issue', 'edit', String(c.numero), '--body-file', file(nuovo)]);
    console.log(`Commento su #${c.numero}: ${c.esito.titolo}`);
  }

  if (minori.length) {
    const url = gh(['issue', 'create', '--title', `Cambiamenti minori nelle fonti (${r.data})`, '--body-file', file(corpoMinori(minori, r.data, proprietario)), '--label', 'sentinella', '--label', 'priorita:bassa']).trim();
    console.log('Minori: ' + url);
  }

  const stato = JSON.parse(gh(['issue', 'list', '--label', 'sentinella-stato', '--state', 'open', '--limit', '5', '--json', 'number']));
  if (stato.length) gh(['issue', 'edit', String(stato[0].number), '--body-file', file(corpoStato(r))]);
  else {
    const url = gh(['issue', 'create', '--title', 'Stato delle fonti (sentinella)', '--body-file', file(corpoStato(r)), '--label', 'sentinella-stato']).trim();
    try { gh(['issue', 'pin', url]); } catch (e) { console.log('Issue di stato non fissata: ' + e.message); }
  }
}

if (require.main === module) main();
module.exports = { piano, segni, segno, corpoIssue, corpoMinori, corpoStato };
