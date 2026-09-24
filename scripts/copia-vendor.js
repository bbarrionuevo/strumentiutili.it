#!/usr/bin/env node
// scripts/copia-vendor.js — Le librerie di terzi servite dal sito stesso.
//
// Prima pdf.js, pdf-lib, comlink e le altre arrivavano da unpkg, jsdelivr e
// cdnjs. Tre problemi:
//
//   1. Offline non funzionava niente: il service worker ignora le richieste
//      verso altri domini, quindi la promessa "funziona senza rete" valeva solo
//      per le pagine, non per gli strumenti.
//   2. Ogni visita consegnava l'indirizzo IP dell'utente a tre CDN, su un sito
//      che promette "nessun dato a terzi".
//   3. Se un CDN cade, cadono cinquanta strumenti.
//
// Qui le librerie si copiano da node_modules (versioni fissate in
// package.json con --save-exact) dentro vendor/<nome>@<versione>/. I file
// copiati sono versionati nel repository: il sito resta statico e non dipende
// dal fatto che l'hosting esegua npm run build.
//
//   node scripts/copia-vendor.js           copia
//   node scripts/copia-vendor.js --check   esce con 1 se vendor/ non combacia

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const MODULI = path.join(RADICE, 'node_modules');
const VENDOR = path.join(RADICE, 'vendor');

// pacchetto npm -> cartella in vendor/ e file da copiare (origine -> nome)
const LIBRERIE = [
  { pacchetto: 'pdf-lib', nome: 'pdf-lib', file: { 'dist/pdf-lib.min.js': 'pdf-lib.min.js' }, licenza: 'LICENSE.md' },
  { pacchetto: 'pdfjs-dist', nome: 'pdfjs', file: { 'build/pdf.min.js': 'pdf.min.js', 'build/pdf.worker.min.js': 'pdf.worker.min.js' }, licenza: 'LICENSE' },
  { pacchetto: '@pdf-lib/fontkit', nome: 'fontkit', file: { 'dist/fontkit.umd.min.js': 'fontkit.umd.min.js' } },
  { pacchetto: 'comlink', nome: 'comlink', file: { 'dist/esm/comlink.mjs': 'comlink.mjs', 'dist/umd/comlink.js': 'comlink.js' }, licenza: 'LICENSE' },
  { pacchetto: 'mammoth', nome: 'mammoth', file: { 'mammoth.browser.min.js': 'mammoth.browser.min.js' }, licenza: 'LICENSE' },
  { pacchetto: 'jspdf', nome: 'jspdf', file: { 'dist/jspdf.umd.min.js': 'jspdf.umd.min.js' }, licenza: 'LICENSE' },
  { pacchetto: 'chart.js', nome: 'chartjs', file: { 'dist/chart.umd.js': 'chart.umd.js' }, licenza: 'LICENSE.md' },
  { pacchetto: 'docx', nome: 'docx', file: { 'build/index.js': 'docx.js' }, licenza: 'LICENSE' },
  { pacchetto: 'qrcodejs', nome: 'qrcodejs', file: { 'qrcode.min.js': 'qrcode.min.js' }, licenza: 'LICENSE' },
  // I caratteri Roboto per il modello RLI: nel pacchetto npm di pdfmake
  // esistono solo dentro vfs_fonts.js, in base64. La licenza di pdfmake (MIT)
  // non e' quella dei caratteri, che e' la Apache 2.0 di Google.
  { pacchetto: 'pdfmake', nome: 'roboto', vfs: { 'Roboto-Regular.ttf': 'Roboto-Regular.ttf', 'Roboto-Medium.ttf': 'Roboto-Medium.ttf' },
    testoLicenza: 'Roboto, Copyright 2011 Google Inc. Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0).\n' +
      'File estratti da pdfmake/build/vfs_fonts.js (pdfmake, licenza MIT).\n' }
];

function versione(pacchetto) {
  return JSON.parse(fs.readFileSync(path.join(MODULI, pacchetto, 'package.json'), 'utf8')).version;
}

function leggiVfs(pacchetto) {
  const testo = fs.readFileSync(path.join(MODULI, pacchetto, 'build', 'vfs_fonts.js'), 'utf8');
  const vfs = {};
  for (const m of testo.matchAll(/"([^"]+\.ttf)":\s*"([A-Za-z0-9+/=]+)"/g)) vfs[m[1]] = Buffer.from(m[2], 'base64');
  return vfs;
}

// Elenco di tutti i file che vendor/ deve contenere: percorso -> contenuto.
function atteso() {
  const fuori = new Map();
  for (const lib of LIBRERIE) {
    const cartella = lib.nome + '@' + versione(lib.pacchetto);
    for (const [origine, nome] of Object.entries(lib.file || {})) {
      fuori.set(path.join(cartella, nome), fs.readFileSync(path.join(MODULI, lib.pacchetto, origine)));
    }
    if (lib.vfs) {
      const vfs = leggiVfs(lib.pacchetto);
      for (const [origine, nome] of Object.entries(lib.vfs)) {
        if (!vfs[origine]) throw new Error(lib.pacchetto + ': ' + origine + ' non trovato in vfs_fonts.js');
        fuori.set(path.join(cartella, nome), vfs[origine]);
      }
    }
    // Alcuni pacchetti (fontkit) dichiarano la licenza solo in package.json.
    const fileLicenza = lib.licenza && path.join(MODULI, lib.pacchetto, lib.licenza);
    const licenza = lib.testoLicenza ? Buffer.from(lib.testoLicenza)
      : fileLicenza && fs.existsSync(fileLicenza)
      ? fs.readFileSync(fileLicenza)
      : Buffer.from(lib.pacchetto + ' ' + versione(lib.pacchetto) + ' - licenza dichiarata in package.json: ' +
          JSON.parse(fs.readFileSync(path.join(MODULI, lib.pacchetto, 'package.json'), 'utf8')).license + '\n');
    fuori.set(path.join(cartella, 'LICENSE'), licenza);
  }
  return fuori;
}

function presenti(dir, base) {
  const fuori = [];
  if (!fs.existsSync(dir)) return fuori;
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, voce.name);
    if (voce.isDirectory()) fuori.push(...presenti(path.join(dir, voce.name), rel));
    else fuori.push(rel);
  }
  return fuori;
}

function esegui(opzioni) {
  const soloVerifica = !!(opzioni && opzioni.soloVerifica);
  if (!fs.existsSync(MODULI)) {
    console.error('node_modules non trovato: esegui prima npm ci.');
    process.exitCode = 1;
    return;
  }
  const voluti = atteso();
  const diversi = [];
  for (const [rel, contenuto] of voluti) {
    const dove = path.join(VENDOR, rel);
    const uguale = fs.existsSync(dove) && fs.readFileSync(dove).equals(contenuto);
    if (uguale) continue;
    diversi.push(rel);
    if (!soloVerifica) {
      fs.mkdirSync(path.dirname(dove), { recursive: true });
      fs.writeFileSync(dove, contenuto);
    }
  }
  const superflui = presenti(VENDOR, '').filter((rel) => !voluti.has(rel));
  if (!soloVerifica) {
    for (const rel of superflui) fs.unlinkSync(path.join(VENDOR, rel));
  }

  if (soloVerifica) {
    if (diversi.length || superflui.length) {
      console.error('vendor/ non combacia con node_modules. Esegui: node scripts/copia-vendor.js');
      diversi.forEach((r) => console.error('  diverso o mancante: ' + r));
      superflui.forEach((r) => console.error('  in piu: ' + r));
      process.exitCode = 1;
    } else {
      console.log('vendor/ aggiornato (' + voluti.size + ' file).');
    }
    return;
  }
  console.log('vendor/: ' + voluti.size + ' file, ' + diversi.length + ' scritti, ' + superflui.length + ' rimossi.');
}

module.exports = { LIBRERIE, esegui };

if (require.main === module) esegui({ soloVerifica: process.argv.includes('--check') });
