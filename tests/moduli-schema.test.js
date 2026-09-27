// tests/moduli-schema.test.js — Ogni campo degli schemi esiste nel PDF.
//
// Il compilatore (js/compilatore-moduli.js) scrive i valori nei campi del PDF
// cercandoli per nome: se un nome nello schema e' sbagliato, il valore si perde
// in silenzio (in pagina resta solo un avviso nella console). Qui si aprono i
// PDF compilabili con la stessa pdf-lib del sito e si controlla che ogni nome
// usato negli schemi data/modell*-schema.json ci sia davvero.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('../vendor/pdf-lib@1.17.1/pdf-lib.min.js');

const RADICE = path.resolve(__dirname, '..');
const SCHEMI = fs.readdirSync(path.join(RADICE, 'data'))
  .filter((f) => /^modell.*-schema\.json$/.test(f)).sort();

// Tutti i nomi di campo PDF che uno schema puo' citare.
function nomiCitati(modello) {
  const nomi = new Set();
  const aggiungi = (x) => {
    if (typeof x === 'string') nomi.add(x);
    else if (x && typeof x === 'object') Object.values(x).forEach(aggiungi);
  };
  const campo = (c) => {
    aggiungi(c.pdf);
    aggiungi(c.pdfCentesimi);
    (Array.isArray(c.options) ? c.options : []).forEach((o) => aggiungi(o.pdf));
    (c.campi || []).forEach(campo);
  };
  (modello.passi || []).forEach((passo) => {
    (passo.campi || []).forEach(campo);
    (passo.ripetibili || []).forEach((g) => (g.righe || []).forEach(aggiungi));
  });
  const t = modello.testata || {};
  (t.copie || []).forEach((r) => (r.a || []).forEach(aggiungi));
  (t.numeroPagina || []).forEach(aggiungi);
  aggiungi(t.totalePagine);
  aggiungi(modello.caselleQuadri);
  return nomi;
}

for (const file of SCHEMI) {
  const schema = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', file), 'utf8'));
  for (const [id, modello] of Object.entries(schema.modelli)) {
    test(`${file} ${id}: i campi citati esistono nel PDF`, async () => {
      const percorso = path.join(RADICE, modello.pdf.replace(/^\//, ''));
      assert.ok(fs.existsSync(percorso), 'manca ' + modello.pdf);
      const pdf = await PDFDocument.load(fs.readFileSync(percorso), { ignoreEncryption: true });
      const presenti = new Set(pdf.getForm().getFields().map((f) => f.getName()));
      const citati = nomiCitati(modello);
      assert.ok(citati.size > 5, 'lo schema cita solo ' + citati.size + ' campi');
      const mancanti = [...citati].filter((n) => !presenti.has(n));
      assert.deepStrictEqual(mancanti, [], `${id}: campi dello schema assenti in ${modello.pdf}`);
      if (modello.istruzioni) {
        assert.ok(fs.existsSync(path.join(RADICE, modello.istruzioni.replace(/^\//, ''))), 'mancano le istruzioni ' + modello.istruzioni);
      }
    });
  }
}

test('ci sono tutti gli schemi dei compilatori', () => {
  assert.ok(SCHEMI.length >= 15, 'trovati solo ' + SCHEMI.length + ' schemi');
  assert.ok(SCHEMI.includes('modello-canone-tv-schema.json'));
});
