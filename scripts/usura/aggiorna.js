#!/usr/bin/env node
// scripts/usura/aggiorna.js — Aggiunge a data/vivi/usura/soglie.json i
// trimestri nuovi pubblicati dal MEF.
//
// Lo lancia ogni giorno .github/workflows/usura.yml. Legge la pagina
// «Rilevazione trimestrale tassi soglia» del Dipartimento del Tesoro, scarica
// i decreti che non ha ancora, ne estrae il testo con pdftotext e lo controlla
// con scripts/usura/elabora.js. Un decreto elencato nella pagina che non passa
// i controlli ferma tutto (exit 1): online restano i dati di prima e, se il
// trimestre nuovo non arriva, la sentinella apre una segnalazione (dati_vivi).
//
//   node scripts/usura/aggiorna.js                         pagina del MEF (e nome abituale del trimestre dopo)
//   node scripts/usura/aggiorna.js --storico               anche i trimestri passati (nomi abituali dei file)
//   node scripts/usura/aggiorna.js --da-file testo.txt URL  un decreto gia' convertito in testo
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const E = require('./elabora.js');

const RADICE = path.join(__dirname, '..', '..');
const FILE = path.join(RADICE, 'data', 'vivi', 'usura', 'soglie.json');
const PAGINA = 'https://www.dt.mef.gov.it/it/attivita_istituzionali/sistema_bancario_finanziario/anti_usura/categorie_creditizie/';
const CARTELLA_PDF = 'https://www.dt.mef.gov.it/export/sites/sitodt/modules/documenti_it/prevenzione_reati_finanziari/antiusura/';
const AGENTE = 'Mozilla/5.0 (StrumentiUtili.it tassi soglia usura; +https://strumentiutili.it/metodo/)';
const PRIMO_ANNO_STORICO = 2017;

async function scarica(url, binario) {
  for (let tentativo = 1; ; tentativo++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': AGENTE } });
      if (r.status === 404) return null;
      if (r.status !== 200) throw new Error('risposta ' + r.status);
      return binario ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) {
      if (tentativo >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, 15000 * tentativo));
    }
  }
}

function testoPdf(buffer) {
  if (!buffer || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
  const tmp = path.join(os.tmpdir(), `usura-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, buffer);
  try { return execFileSync('pdftotext', ['-layout', tmp, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }); } finally { fs.unlinkSync(tmp); }
}

function leggiArchivio() {
  if (!fs.existsSync(FILE)) return null;
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

// "Decreto MEF del 25/09/2026 (...)": la data la riporta ogni decreto trimestrale
function classificazioneDi(trimestre) {
  const c = trimestre && trimestre.classificazione;
  const quando = c ? ' del ' + c.split('-').reverse().join('/') : '';
  return `Decreto MEF${quando} di classificazione delle operazioni creditizie per categorie omogenee`;
}

function componi(trimestri) {
  return {
    fonte: 'Ministero dell\'Economia e delle Finanze, Dipartimento del Tesoro: decreti trimestrali di rilevazione dei tassi effettivi globali medi (legge 7 marzo 1996, n. 108, art. 2)',
    pagina: PAGINA,
    classificazione: classificazioneDi(trimestri[0]),
    vigente_dal: trimestri[0].dal,
    categorie: E.CATEGORIE.map((c) => ({ id: c.id, nome: c.nome, classi: c.classi.map((cl) => {
      const x = { id: cl.id, etichetta: cl.etichetta };
      if (cl.min !== undefined) x.min = cl.min;
      if (cl.max !== undefined) x.max = cl.max;
      return x;
    }) })),
    trimestri
  };
}

function scrivi(trimestri) {
  const nuovo = componi(trimestri);
  const vecchio = leggiArchivio();
  if (vecchio && JSON.stringify({ ...vecchio, aggiornato: 0 }) === JSON.stringify({ ...nuovo, aggiornato: 0 })) return false;
  nuovo.aggiornato = new Date().toISOString();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(nuovo, null, 1) + '\n');
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  const archivio = leggiArchivio();
  let trimestri = archivio ? archivio.trimestri : [];
  const noti = new Set(trimestri.map((t) => t.decreto && t.decreto.url).filter(Boolean));
  const guai = [];

  const i = argv.indexOf('--da-file');
  if (i >= 0) {
    const r = E.leggiDecreto(fs.readFileSync(argv[i + 1], 'utf8'), argv[i + 2]);
    if (r.errori.length) { console.error('Decreto non valido:\n  - ' + r.errori.join('\n  - ')); process.exit(1); }
    trimestri = E.aggiungi(trimestri, r.trimestre);
  } else {
    const html = await scarica(PAGINA, false);
    if (!html) throw new Error('pagina del MEF non trovata: ' + PAGINA);
    const collegamenti = E.collegamentiDecreti(html, PAGINA);
    // La pagina elenca solo i decreti dell'anno scelto nel filtro: a cavallo
    // d'anno puo' restare vuota. Non e' un errore del giorno (se il trimestre
    // nuovo non arriva avvisa la sentinella, con dati_vivi e la scheda della
    // pagina), ma si prova anche il nome abituale del trimestre che segue.
    if (!collegamenti.length) console.log('Nessun decreto tassi elencato oggi nella pagina del MEF.');
    const daProvare = collegamenti.filter((u) => !noti.has(u)).map((u) => ({ url: u, obbligatorio: true }));
    if (trimestri.length) {
      const [a, m] = trimestri[0].al.split('-').map(Number);
      const dopo = m === 12 ? [a + 1, 1] : [a, (m / 3) + 1];
      const u = CARTELLA_PDF + E.nomeProbabile(dopo[0], dopo[1]);
      if (!noti.has(u) && !daProvare.some((x) => x.url === u)) daProvare.push({ url: u, obbligatorio: false });
    }
    if (argv.includes('--storico')) {
      const oggi = new Date();
      for (let a = PRIMO_ANNO_STORICO; a <= oggi.getUTCFullYear(); a++) {
        for (let q = 1; q <= 4; q++) {
          const u = CARTELLA_PDF + E.nomeProbabile(a, q);
          if (!noti.has(u) && !daProvare.some((x) => x.url === u)) daProvare.push({ url: u, obbligatorio: false });
        }
      }
    }
    for (const { url, obbligatorio } of daProvare) {
      const testo = testoPdf(await scarica(url, true));
      if (!testo) { if (obbligatorio) guai.push(`${url}: non e' un PDF leggibile`); continue; }
      const r = E.leggiDecreto(testo, url);
      if (r.errori.length) {
        (obbligatorio ? guai : []).push(`${url}:\n    - ${r.errori.join('\n    - ')}`);
        if (!obbligatorio) console.log(`Saltato ${url}: ${r.errori[0]}`);
        continue;
      }
      if (trimestri.some((t) => t.dal === r.trimestre.dal && t.decreto && t.decreto.url && t.decreto.url !== url)) continue;
      trimestri = E.aggiungi(trimestri, r.trimestre);
      console.log(`Trimestre ${r.trimestre.dal} - ${r.trimestre.al} dal decreto ${r.trimestre.decreto.protocollo}.`);
      await new Promise((ok) => setTimeout(ok, 1000)); // un documento al secondo
    }
  }
  if (guai.length) {
    console.error('Decreti del MEF che non passano i controlli (non si pubblica niente):\n  - ' + guai.join('\n  - '));
    process.exit(1);
  }
  if (!trimestri.length) throw new Error('nessun trimestre valido');
  const cambiato = scrivi(trimestri);
  console.log(cambiato ? `Scritto ${path.relative(RADICE, FILE)}: ${trimestri.length} trimestri, ultimo dal ${trimestri[0].dal}.` : 'Nessun trimestre nuovo.');
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { componi };
