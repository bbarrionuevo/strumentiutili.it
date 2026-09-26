#!/usr/bin/env node
// scripts/controlla-collegamenti.js — I collegamenti esterni rispondono ancora?
//
// I siti degli enti cambiano indirizzi senza avvisare: a settembre 2026 le
// schede del modello F23 e dell'F24 accise dell'Agenzia delle Entrate
// rispondevano 404, e nessuno se n'era accorto. Questo script raccoglie tutti
// i collegamenti esterni delle pagine e li apre uno per uno.
//
// Lo esegue ogni mese .github/workflows/controlla-collegamenti.yml (dagli
// ambienti di sviluppo molti siti pubblici non si raggiungono). Esce con 1 se
// una pagina non esiste piu' (404 o 410); gli altri problemi (server lento,
// protezione anti-bot che risponde 403 o 202) si segnalano senza fallire.
//
//   node scripts/controlla-collegamenti.js           controlla
//   node scripts/controlla-collegamenti.js --elenco  stampa solo gli indirizzi
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');

// Indirizzi che non sono pagine da leggere: script degli annunci, moduli che
// accettano solo POST, collegamenti di condivisione.
const SALTA = /^https:\/\/(pagead2\.googlesyndication\.com|formspree\.io|wa\.me|myadcenter\.google\.com)\b/;

function pagine() {
  const fuori = [];
  (function giro(dir) {
    for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'vendor', '.git', 'tests', 'scripts'].includes(v.name)) continue;
      const p = path.join(dir, v.name);
      if (v.isDirectory()) giro(p);
      else if (v.name.endsWith('.html') && !v.name.endsWith('test.html')) fuori.push(p);
      // anche i collegamenti scritti dagli script (avvisi, risultati)
      else if (v.name.endsWith('.js') && path.relative(RADICE, p).startsWith('js' + path.sep)) fuori.push(p);
    }
  })(RADICE);
  return fuori.sort();
}

/** Mappa indirizzo -> pagine che lo usano. */
function collegamenti() {
  const dove = new Map();
  for (const f of pagine()) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/<a\b[^>]*?\bhref=\\?"(https:\/\/[^"\\]+)\\?"/g)) {
      const url = m[1].replace(/&amp;/g, '&');
      if (SALTA.test(url) || url.startsWith('https://strumentiutili.it')) continue;
      if (!dove.has(url)) dove.set(url, new Set());
      dove.get(url).add(path.relative(RADICE, f));
    }
  }
  return dove;
}

async function prova(url) {
  const ctrl = new AbortController();
  const tempo = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (StrumentiUtili.it controllo collegamenti)' }
    });
    const testo = r.status === 200 ? (await r.text()).slice(0, 200000) : '';
    const titolo = (testo.match(/<title[^>]*>([^<]{0,160})/i) || [, ''])[1].replace(/\s+/g, ' ').trim();
    return { stato: r.status, finale: r.url, titolo };
  } catch (e) {
    return { stato: 0, errore: e.name === 'AbortError' ? 'tempo scaduto' : e.message };
  } finally {
    clearTimeout(tempo);
  }
}

async function main() {
  const dove = collegamenti();
  const indirizzi = [...dove.keys()].sort();
  if (process.argv.includes('--elenco')) {
    console.log(indirizzi.join('\n'));
    return;
  }
  const rotti = [];
  const avvisi = [];
  // quattro alla volta: abbastanza veloce, senza martellare i siti pubblici
  for (let i = 0; i < indirizzi.length; i += 4) {
    const gruppo = indirizzi.slice(i, i + 4);
    const esiti = await Promise.all(gruppo.map(prova));
    gruppo.forEach((url, k) => {
      const e = esiti[k];
      const riga = e.stato + '  ' + url + (e.titolo ? '  «' + e.titolo + '»' : '') + (e.errore ? '  (' + e.errore + ')' : '');
      console.log(riga);
      const pagine = [...dove.get(url)].join(', ');
      if (e.stato === 404 || e.stato === 410) rotti.push(riga + '\n      in: ' + pagine);
      else if (e.stato < 200 || e.stato >= 300) avvisi.push(riga + '\n      in: ' + pagine);
    });
  }
  console.log('\n' + indirizzi.length + ' collegamenti controllati.');
  if (avvisi.length) console.log('\nDa guardare (non bloccano):\n' + avvisi.join('\n'));
  if (rotti.length) {
    console.log('\nPAGINE CHE NON ESISTONO PIU\':\n' + rotti.join('\n'));
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { collegamenti };
