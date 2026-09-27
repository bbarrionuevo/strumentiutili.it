#!/usr/bin/env node
// scripts/carburanti/aggiorna.js — Scarica i prezzi dei carburanti del MIMIT e
// scrive data/vivi/carburanti/.
//
// Lo lancia ogni giorno .github/workflows/carburanti.yml. Se i file del
// Ministero non passano i controlli (vuoti, troncati, vecchi) lo script esce
// con errore e non scrive niente: online restano i dati del giorno prima e,
// se il problema dura, la sentinella apre una segnalazione (dati_vivi in
// data/fonti-monitorate.json).
//
//   node scripts/carburanti/aggiorna.js                      scarica e scrive
//   node scripts/carburanti/aggiorna.js --da-file A.csv P.csv  usa file locali
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const E = require('./elabora.js');

const RADICE = path.join(__dirname, '..', '..');
const CARTELLA = path.join(RADICE, 'data', 'vivi', 'carburanti');
const FONTI = {
  anagrafica: 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv',
  prezzi: 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv'
};

async function scarica(url) {
  for (let tentativo = 1; ; tentativo++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (StrumentiUtili.it prezzi carburanti; +https://strumentiutili.it/metodo/)' } });
      if (r.status !== 200) throw new Error('risposta ' + r.status);
      return await r.text();
    } catch (e) {
      if (tentativo >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 20000 * tentativo));
    }
  }
}

function province() {
  const comuni = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'comuni.json'), 'utf8').replace(/^﻿/, ''));
  const fuori = {};
  for (const c of comuni) if (c.sigla && !fuori[c.sigla]) fuori[c.sigla] = { nome: c.provincia.nome, regione: c.regione.nome };
  return fuori;
}

/** Scrive solo se il contenuto cambia: niente commit vuoti. */
function scrivi(file, testo, scritti) {
  scritti.add(path.resolve(file));
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === testo) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, testo);
  return true;
}

async function main() {
  const i = process.argv.indexOf('--da-file');
  const [testoA, testoP] = i > 0
    ? [fs.readFileSync(process.argv[i + 1], 'utf8'), fs.readFileSync(process.argv[i + 2], 'utf8')]
    : await Promise.all([scarica(FONTI.anagrafica), scarica(FONTI.prezzi)]);

  const anagrafica = E.leggiAnagrafica(testoA);
  const listino = E.leggiPrezzi(testoP);
  const dati = E.componi(anagrafica, listino, province());
  const oggi = new Date().toISOString().slice(0, 10);
  const guai = E.problemi(anagrafica, listino, dati, oggi);
  console.log(`Estrazione ${listino.estrazione}: ${anagrafica.impianti.size} impianti (${anagrafica.scartate} righe scartate), ` +
    `${listino.conta.usate} prezzi validi su ${listino.conta.righe} (${listino.conta.speciali} speciali, ${listino.conta.vecchie} vecchi, ${listino.conta.fuori} fuori scala), ` +
    `${Object.keys(dati.riepilogo.province).length} province.`);
  if (guai.length && i < 0) {
    console.error('I dati non si pubblicano:\n  - ' + guai.join('\n  - '));
    process.exit(1);
  }

  const storicoFile = path.join(CARTELLA, 'storico.json');
  const storico = fs.existsSync(storicoFile) ? JSON.parse(fs.readFileSync(storicoFile, 'utf8')) : null;
  const scritti = new Set();
  let cambiati = 0;
  const riepilogo = { ...dati.riepilogo, aggiornato: new Date().toISOString() };
  // "aggiornato" cambia a ogni giro: si riscrive il riepilogo solo se cambia il resto
  const vecchio = fs.existsSync(path.join(CARTELLA, 'riepilogo.json')) ? JSON.parse(fs.readFileSync(path.join(CARTELLA, 'riepilogo.json'), 'utf8')) : null;
  if (!vecchio || JSON.stringify({ ...vecchio, aggiornato: 0 }) !== JSON.stringify({ ...riepilogo, aggiornato: 0 })) {
    cambiati += scrivi(path.join(CARTELLA, 'riepilogo.json'), JSON.stringify(riepilogo, null, 1) + '\n', scritti);
  } else scritti.add(path.resolve(path.join(CARTELLA, 'riepilogo.json')));
  cambiati += scrivi(storicoFile, JSON.stringify(E.aggiornaStorico(storico, dati.riepilogo)) + '\n', scritti);
  for (const [sigla, lista] of Object.entries(dati.impianti)) {
    cambiati += scrivi(path.join(CARTELLA, 'impianti', sigla + '.json'), JSON.stringify(lista) + '\n', scritti);
    cambiati += scrivi(path.join(CARTELLA, 'prezzi', sigla + '.json'), JSON.stringify({ estrazione: listino.estrazione, p: dati.prezzi[sigla] }) + '\n', scritti);
  }
  // province sparite (una sigla cambiata): via i file rimasti
  for (const sotto of ['impianti', 'prezzi']) {
    const dir = path.join(CARTELLA, sotto);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (!scritti.has(path.resolve(path.join(dir, f)))) { fs.unlinkSync(path.join(dir, f)); cambiati++; }
  }
  console.log(`${cambiati} file aggiornati in ${path.relative(RADICE, CARTELLA)}.`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
