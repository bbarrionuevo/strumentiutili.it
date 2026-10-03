// tests/qualita.test.js — Le misure settimanali del sito (scripts/qualita/).
//
// Il controllo gira ogni domenica con Playwright sul sito vero e scrive una
// issue fissata; il laboratorio settimanale sceglie da li' cosa migliorare.
// Qui si prova la parte pura: soglie, confronto e lettura del Chrome UX Report.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../scripts/qualita/valuta.js');

const BUONA = { pagina: '/a/', stato: 200, lcp: 1300, cls: 0, tbt: 120, kb: 200, erroriJs: [], rotti: [] };

test('soglie: una pagina buona non ha problemi, una che salta o si rompe si', () => {
  assert.deepStrictEqual(V.problemi(BUONA), []);
  const brutta = { ...BUONA, cls: 0.21, tbt: 900, erroriJs: ['TypeError: x'], rotti: ['/js/manca.js'] };
  assert.deepStrictEqual(V.problemi(brutta).map((p) => p.tipo), ['cls', 'tbt', 'js', 'rotti']);
  assert.deepStrictEqual(V.problemi({ pagina: '/b/', errore: 'timeout' }).map((p) => p.tipo), ['errore']);
  assert.deepStrictEqual(V.problemi({ ...BUONA, stato: 404 }).map((p) => p.tipo), ['stato']);
});

test('peggioramenti: contano solo le differenze nette sulla stessa pagina', () => {
  const prima = [BUONA, { ...BUONA, pagina: '/b/' }];
  const ora = [{ ...BUONA, lcp: 1500, tbt: 450 }, { ...BUONA, pagina: '/b/', cls: 0.08, kb: 260 }, { ...BUONA, pagina: '/nuova/' }];
  assert.deepStrictEqual(V.peggioramenti(ora, prima).map((p) => `${p.pagina}:${p.metrica}`), ['/a/:tbt', '/b/:cls']);
  assert.deepStrictEqual(V.peggioramenti(ora, null), []);
});

test('Chrome UX Report: percentili letti, nessun dato = null', () => {
  const risposta = { record: { key: { url: 'https://strumentiutili.it/' }, metrics: {
    largest_contentful_paint: { percentiles: { p75: 2310 } },
    cumulative_layout_shift: { percentiles: { p75: '0.02' } },
    interaction_to_next_paint: { percentiles: { p75: 180 } }
  } } };
  assert.deepStrictEqual(V.daCrux(risposta), { lcp: 2310, cls: 0.02, inp: 180 });
  assert.strictEqual(V.daCrux({ error: { code: 404 } }), null);
  assert.strictEqual(V.daCrux(null), null);
});

test('gli errori degli script di terzi si contano a parte e non diventano avvisi', () => {
  const r = { data: '2026-10-04', sito: 'https://strumentiutili.it', crux: {}, cruxAttivo: false,
    misure: [{ ...BUONA, erroriTerzi: ['fundingchoicesmessages.google.com: W'] }, { ...BUONA, pagina: '/b/', erroriTerzi: ['fundingchoicesmessages.google.com: W'] }] };
  assert.deepStrictEqual(V.problemi(r.misure[0]), []);
  assert.deepStrictEqual(V.avvisi(r, null), []);
  assert.match(V.corpoRapporto(r, null), /errori di script di terzi .*: \*\*2\*\* \(fundingchoicesmessages\.google\.com: W ×2\)/);
});

test('rapporto: i dati grezzi tornano indietro per il confronto della settimana dopo', () => {
  const r = { data: '2026-10-04', sito: 'https://strumentiutili.it', misure: [BUONA, { ...BUONA, pagina: '/b/', cls: 0.3 }], crux: {}, cruxAttivo: false };
  const corpo = V.corpoRapporto(r, null);
  assert.match(corpo, /Pagine con problemi: \*\*1\*\*/);
  assert.match(corpo, /manca il segreto `PSI_KEY`/);
  const dati = V.datiPrecedenti(corpo);
  assert.strictEqual(dati.data, '2026-10-04');
  assert.strictEqual(dati.misure.length, 2);
  assert.strictEqual(V.datiPrecedenti('nessun dato'), null);
  // avvisi: la pagina che salta, e il peggioramento rispetto a prima
  const dopo = { ...r, misure: [{ ...BUONA, tbt: 500 }, { ...BUONA, pagina: '/b/', cls: 0.3 }] };
  assert.deepStrictEqual(V.avvisi(dopo, dati).map((a) => a.id), ['pagina:/b/', 'peggiora:/a/:tbt']);
});

test('il workflow delle misure legge soltanto: non scrive nel repository', () => {
  const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'metriche.yml'), 'utf8');
  assert.match(wf, /contents: read/);
  assert.doesNotMatch(wf, /contents: write/);
  assert.doesNotMatch(wf, /git push/);
  // il segreto, se c'e', passa dall'ambiente e non finisce nei log
  assert.doesNotMatch(wf, /echo .*PSI_KEY/);
});
