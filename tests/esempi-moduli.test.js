// tests/esempi-moduli.test.js — Le immagini dei modelli compilati con un esempio
// (assets/esempi/, create da scripts/genera-esempi-moduli.py) e le correzioni
// fatte leggendo le fonti ufficiali dei modelli F23 e F24 accise.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./helpers/contenuti.js');

const RADICE = C.RADICE;

/** Larghezza e altezza di un WebP (VP8, VP8L o VP8X), lette dall'intestazione. */
function misureWebp(buf) {
  assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(buf.toString('ascii', 8, 12), 'WEBP');
  const tipo = buf.toString('ascii', 12, 16);
  if (tipo === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (tipo === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  if (tipo === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  throw new Error('WebP sconosciuto: ' + tipo);
}

test('ogni esempio dello script ha la sua immagine', () => {
  const script = fs.readFileSync(path.join(RADICE, 'scripts/genera-esempi-moduli.py'), 'utf8');
  const nomi = [...script.matchAll(/^ {4}"([a-z0-9-]+)": \{$/gm)].map((m) => m[1]);
  assert.ok(nomi.length >= 3, nomi.join(', '));
  for (const n of nomi) assert.ok(fs.existsSync(path.join(RADICE, 'assets/esempi', n + '.webp')), n + '.webp mancante');
});

test('le immagini d\'esempio nelle pagine hanno le misure vere (niente salti) e dicono che i dati sono inventati', () => {
  const problemi = [];
  let trovate = 0;
  for (const p of C.tutteLePagine()) {
    for (const m of p.html.matchAll(/<img src="\/assets\/esempi\/([^"]+\.webp)"([^>]*)>/g)) {
      trovate += 1;
      const file = path.join(RADICE, 'assets/esempi', m[1]);
      if (!fs.existsSync(file)) { problemi.push(p.percorso + ': manca ' + m[1]); continue; }
      const vero = misureWebp(fs.readFileSync(file));
      const w = Number((m[2].match(/width="(\d+)"/) || [])[1]);
      const h = Number((m[2].match(/height="(\d+)"/) || [])[1]);
      if (w !== vero.w || h !== vero.h) problemi.push(`${p.percorso}: ${m[1]} dichiarata ${w}x${h}, vera ${vero.w}x${vero.h}`);
      if (!/alt="[^"]{20,}"/.test(m[2])) problemi.push(p.percorso + ': ' + m[1] + ' senza un testo alternativo che la descriva');
      if (!/inventat/.test(C.testoVisibile(p.html))) problemi.push(p.percorso + ': non dice che i dati sono inventati');
    }
  }
  assert.ok(trovate >= 3, 'immagini trovate: ' + trovate);
  assert.deepStrictEqual(problemi, []);
});

// --- correzioni dalle fonti ufficiali ----------------------------------------

test('accise: 2806 e\' l\'energia elettrica, 2814 il gas naturale (elenco codici tributo dell\'Agenzia)', () => {
  const sbagliate = C.tutteLePagine()
    .filter((p) => /\b2814\b[^.;:]{0,30}accisa sull.energia elettrica/i.test(C.testoVisibile(p.html)))
    .map((p) => p.percorso);
  assert.deepStrictEqual(sbagliate, []);
  const accise = fs.readFileSync(path.join(RADICE, 'cittadino-tasse/f24-editabile/f24-accise/index.html'), 'utf8');
  const testo = C.testoVisibile(accise);
  assert.match(testo, /2806[^.]{0,20}Accisa sull.energia elettrica|energia elettrica[^.]{0,40}2806/);
  // avvertenze del modello: «Il mese e l'anno di riferimento non devono essere indicati»
  assert.match(testo, /non vanno indicati/);
  assert.doesNotMatch(testo, /con il mese a cui si riferisce la rata/);
  // art. 26-ter del D.Lgs. 504/1995 dal 2026: rate entro la fine del mese
  assert.match(testo, /entro la fine del mese/);
});

test('F23: affitti con l\'F24 ELIDE dal 2015 e contributo unificato con pagoPA', () => {
  const f23 = C.testoVisibile(fs.readFileSync(path.join(RADICE, 'cittadino-tasse/f24-editabile/f23-editabile/index.html'), 'utf8'));
  // comunicato dell'Agenzia del 3 gennaio 2014: dal 1° gennaio 2015 solo F24 ELIDE
  assert.match(f23, /1° gennaio 2015/);
  const dal2014 = C.tutteLePagine()
    .filter((p) => /dal 2014 l.imposta di registro sulle locazioni/i.test(C.testoVisibile(p.html)))
    .map((p) => p.percorso);
  assert.deepStrictEqual(dal2014, []);
  // art. 192 D.P.R. 115/2002: dal 1° gennaio 2023 il contributo unificato si paga con pagoPA
  assert.match(f23, /pagoPA/);
  assert.doesNotMatch(f23, /118,50 € con il codice 941T/);
});
