#!/usr/bin/env node
// scripts/prerendi-compilatori.js — Il primo passo dei compilatori dei modelli
// scritto direttamente nell'HTML delle pagine.
//
// Il compilatore (js/compilatore-moduli.js) disegna i passi solo dopo aver
// scaricato lo schema del modello. Fino ad allora il pannello restava vuoto,
// alto 92 px sul telefono; poi cresceva di colpo a 340-370 px e tutto quello
// che sta sotto scendeva: CLS 0,42 sul telefono, misurato la domenica sulla
// pagina dell'F24 Elide (ottobre 2026). Qui l'elenco dei passi, il primo passo
// e i pulsanti si scrivono nella pagina con le stesse funzioni del compilatore:
// quando lo script arriva li ridisegna uguali, e la pagina non salta.
//
// Si rigenera quando cambia uno schema (data/modello*-schema.json) o il modo
// in cui il compilatore disegna i campi; tests/compilatori-prerender.test.js
// fallisce se una pagina e' rimasta indietro.
//
//   node scripts/prerendi-compilatori.js           riscrive le pagine
//   node scripts/prerendi-compilatori.js --check   esce con 1 se una pagina va riscritta
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { caricaScript } = require('./carica-motori.js');

const RADICE = path.join(__dirname, '..');
const AVVISO = '<!-- scritto da scripts/prerendi-compilatori.js: non modificare a mano -->';

const PASSI = /(<nav\b[^>]*\bid="mp-passi"[^>]*>)[\s\S]*?(<\/nav>)/;
// il corpo contiene altri <div>: finisce dove comincia la barra dei pulsanti
const CORPO = /(<div id="mp-corpo">)[\s\S]*?(<\/div>\s*<div id="mp-nav")/;
const NAV = /(<div id="mp-nav" class="mp-nav">)[\s\S]*?(<\/div>)/;

function pagine() {
  const fuori = [];
  (function giro(dir) {
    for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'vendor', '.git', 'tests', 'scripts', 'widget'].includes(v.name)) continue;
      const p = path.join(dir, v.name);
      if (v.isDirectory()) giro(p);
      else if (v.name === 'index.html') fuori.push(p);
    }
  })(RADICE);
  return fuori.sort();
}

/** Le parti del pannello per lo schema e il modello indicati nella pagina. */
function parti(attributiApp) {
  const schema = (attributiApp.match(/data-schema="([^"]+)"/) || [])[1];
  if (!schema) throw new Error('#mp-app senza data-schema');
  const modello = (attributiApp.match(/data-modello="([^"]+)"/) || [])[1];
  const json = JSON.parse(fs.readFileSync(path.join(RADICE, schema.replace(/^\//, '')), 'utf8'));
  // un contesto nuovo per ogni pagina: il compilatore tiene uno stato solo
  const C = caricaScript(['js/compilatore-moduli.js']).window.CompilatoreModuli;
  return C.htmlIniziale(json, modello);
}

/** La pagina con il pannello gia' disegnato; le altre pagine restano uguali. */
function trasforma(html) {
  const app = html.match(/<section id="mp-app"[^>]*>/);
  if (!app) return html;
  for (const [nome, re] of [['passi', PASSI], ['corpo', CORPO], ['nav', NAV]]) {
    if (!re.test(html)) throw new Error('pannello del compilatore senza ' + nome);
  }
  const p = parti(app[0]);
  return html
    .replace(PASSI, (m, apre, chiude) => apre + p.passi + chiude)
    .replace(CORPO, (m, apre, chiude) => apre + AVVISO + p.corpo + chiude)
    .replace(NAV, (m, apre, chiude) => apre + p.nav + chiude);
}

function main() {
  const check = process.argv.includes('--check');
  const cambiate = [];
  let compilatori = 0;
  for (const f of pagine()) {
    const html = fs.readFileSync(f, 'utf8');
    if (!html.includes('id="mp-app"')) continue;
    compilatori++;
    const nuovo = trasforma(html);
    if (nuovo !== html) {
      cambiate.push(path.relative(RADICE, f));
      if (!check) fs.writeFileSync(f, nuovo);
    }
  }
  if (check) {
    if (cambiate.length) {
      console.error('Primo passo dei compilatori da riscrivere in: ' + cambiate.join(', ') + '\nEsegui: node scripts/prerendi-compilatori.js');
      process.exit(1);
    }
    console.log('Compilatori aggiornati (' + compilatori + ' pagine).');
    return;
  }
  console.log('Compilatori: ' + compilatori + ' pagine, ' + cambiate.length + ' riscritte.');
}

if (require.main === module) main();
module.exports = { trasforma, pagine };
