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

// --- come vede il sito Google (scripts/qualita/google.js) ---------------------
const G = require('../scripts/qualita/google.js');
const crypto = require('node:crypto');
const URL_A = 'https://strumentiutili.it/a/';
const pagina = (testa) => `<!doctype html><html><head>${testa}</head><body><link rel="canonical" href="https://altro.it/"></body></html>`;

test('Googlebot: legge meta robots e canonical solo nella <head>', () => {
  const t = G.leggiTesta(pagina(`<title> Titolo </title><meta name='googlebot' content='noindex'><link href="${URL_A}" rel="canonical">`));
  assert.deepStrictEqual(t, { robots: 'noindex', canonical: URL_A, canonicali: 1, titolo: 'Titolo' });
  assert.deepStrictEqual(G.leggiTesta('<head><meta name="description" content="noindex"></head>'), { robots: null, canonical: null, canonicali: 0, titolo: null });
});

test('Googlebot: cio\' che toglie una pagina da Google diventa un problema «indice»', () => {
  const buona = { stato: 200, html: pagina(`<link rel="canonical" href="${URL_A}">`) };
  assert.deepStrictEqual(G.vistaGooglebot(URL_A, buona).problemi, []);
  const tipi = (r) => G.vistaGooglebot(URL_A, r).problemi.map((p) => p.tipo + ': ' + p.testo);
  assert.deepStrictEqual(tipi({ ...buona, xRobots: 'noindex, nofollow' }), ['indice: intestazione X-Robots-Tag: noindex, nofollow']);
  assert.deepStrictEqual(tipi({ stato: 200, html: pagina(`<meta name="robots" content="noindex, follow"><link rel="canonical" href="${URL_A}">`) }), ['indice: meta robots: noindex, follow']);
  assert.deepStrictEqual(tipi({ stato: 200, html: pagina('<link rel="canonical" href="https://strumentiutili.it/b/">') }), ['indice: il canonical punta a https://strumentiutili.it/b/']);
  assert.deepStrictEqual(tipi({ stato: 200, html: pagina('') }), ['indice: manca il canonical']);
  assert.deepStrictEqual(tipi({ stato: 308, location: '/a' }), ['indice: a Googlebot reindirizza a /a']);
  // respinto solo il Googlebot simulato: probabile protezione dai bot falsi, non un avviso
  assert.deepStrictEqual(tipi({ stato: 403, statoBrowser: 200 }).map((x) => x.split(':')[0]), ['googlebot']);
  assert.deepStrictEqual(tipi({ stato: 500, statoBrowser: 500 }), ['indice: a Googlebot risponde 500']);
});

test('Search Console: stato nell\'indice e causa tecnica dalla risposta di URL Inspection', () => {
  const risposta = (r) => ({ inspectionResult: { indexStatusResult: r } });
  const dentro = G.statoIndice(risposta({ verdict: 'PASS', coverageState: 'Inviata e indicizzata', robotsTxtState: 'ALLOWED', indexingState: 'INDEXING_ALLOWED', pageFetchState: 'SUCCESSFUL', googleCanonical: URL_A, lastCrawlTime: '2026-10-01T08:12:00Z' }), URL_A);
  assert.deepStrictEqual([dentro.indicizzata, dentro.causa, dentro.ultimaScansione], [true, null, '2026-10-01']);
  // scansionata ma non indicizzata: nessuna causa tecnica, e' una scelta di Google
  const scelta = G.statoIndice(risposta({ verdict: 'NEUTRAL', coverageState: 'Pagina scansionata, ma attualmente non indicizzata', robotsTxtState: 'ALLOWED', indexingState: 'INDEXING_ALLOWED', pageFetchState: 'SUCCESSFUL' }), URL_A);
  assert.deepStrictEqual([scelta.indicizzata, scelta.causa], [false, null]);
  // mai scaricata: nessun errore di recupero
  assert.strictEqual(G.statoIndice(risposta({ verdict: 'NEUTRAL', coverageState: 'Rilevata, ma attualmente non indicizzata', pageFetchState: 'PAGE_FETCH_STATE_UNSPECIFIED' }), URL_A).causa, null);
  const causa = (r) => G.statoIndice(risposta({ verdict: 'NEUTRAL', ...r }), URL_A).causa;
  assert.match(causa({ googleCanonical: 'https://strumentiutili.it/b/' }), /pagina principale .*\/b\//);
  assert.match(causa({ indexingState: 'BLOCKED_BY_META_TAG' }), /noindex nel codice/);
  assert.match(causa({ indexingState: 'BLOCKED_BY_HTTP_HEADER' }), /X-Robots-Tag/);
  assert.match(causa({ robotsTxtState: 'DISALLOWED' }), /robots\.txt/);
  assert.match(causa({ pageFetchState: 'SOFT_404' }), /SOFT_404/);
  assert.strictEqual(G.statoIndice({}, URL_A), null);
});

test('Search Console: proprieta\' da usare e clic per pagina', () => {
  const elenco = { siteEntry: [{ siteUrl: 'https://strumentiutili.it/', permissionLevel: 'siteRestrictedUser' }, { siteUrl: 'sc-domain:strumentiutili.it', permissionLevel: 'siteFullUser' }, { siteUrl: 'sc-domain:altro.it', permissionLevel: 'siteOwner' }] };
  assert.strictEqual(G.sceltaProprieta(elenco, 'https://strumentiutili.it'), 'sc-domain:strumentiutili.it');
  assert.strictEqual(G.sceltaProprieta({ siteEntry: [elenco.siteEntry[0]] }, 'https://strumentiutili.it'), 'https://strumentiutili.it/');
  assert.strictEqual(G.sceltaProprieta({ siteEntry: [{ siteUrl: 'sc-domain:strumentiutili.it', permissionLevel: 'siteUnverifiedUser' }] }, 'https://strumentiutili.it'), null);
  assert.strictEqual(G.sceltaProprieta(null, 'https://strumentiutili.it'), null);
  const righe = { rows: [
    { keys: ['https://strumentiutili.it/a/'], clicks: 3, impressions: 100, position: 8 },
    { keys: ['https://strumentiutili.it/a/#faq'], clicks: 1, impressions: 100, position: 12 },
    { keys: ['https://strumentiutili.it/'], clicks: 0, impressions: 5, position: 30.04 },
    { keys: ['https://altro.it/x/'], clicks: 9, impressions: 9, position: 1 }
  ] };
  assert.deepStrictEqual(G.daAnalytics(righe, 'https://strumentiutili.it'), { '/a/': { clic: 4, impressioni: 200, posizione: 10 }, '/': { clic: 0, impressioni: 5, posizione: 30 } });
});

test('Search Console: l\'asserzione JWT dell\'account di servizio e\' firmata e valida un\'ora', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cred = { client_email: 'misure@progetto.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const jwt = G.asserzione(cred, 1790000000);
  const [testa, corpo, firma] = jwt.split('.');
  const leggi = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepStrictEqual(leggi(testa), { alg: 'RS256', typ: 'JWT' });
  assert.deepStrictEqual(leggi(corpo), { iss: cred.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: 1790000000, exp: 1790003600 });
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(testa + '.' + corpo), publicKey, Buffer.from(firma, 'base64url')));
});

test('rapporto: indice di Google, motivi, uscite e avvisi', () => {
  const indice = (indicizzata, extra) => ({ indice: { indicizzata, stato: indicizzata ? 'Inviata e indicizzata' : 'Pagina scansionata, ma attualmente non indicizzata', causa: null, ultimaScansione: '2026-10-01', ...extra }, clic: indicizzata ? 7 : 0, impressioni: indicizzata ? 90 : 0, posizione: indicizzata ? 9.5 : null });
  const r = { data: '2026-10-11', sito: 'https://strumentiutili.it', crux: {}, cruxAttivo: false,
    google: { attivo: true, proprieta: 'sc-domain:strumentiutili.it', dal: '2026-09-11', al: '2026-10-08', totale: { clic: 7, impressioni: 90 } },
    misure: [{ ...BUONA, google: indice(true) }, { ...BUONA, pagina: '/b/', google: indice(false) },
      { ...BUONA, pagina: '/c/', google: indice(false, { causa: 'noindex nel codice della pagina' }), googlebot: { problemi: [{ tipo: 'googlebot', testo: 'solo informativo' }] } }] };
  const corpo = V.corpoRapporto(r, null);
  assert.match(corpo, /Pagine nell'indice di Google: \*\*1 su 3\*\*; da Google dal 2026-09-11 al 2026-10-08: \*\*7\*\* clic e \*\*90\*\* impressioni/);
  assert.match(corpo, /Motivi: Pagina scansionata, ma attualmente non indicizzata ×2\./);
  assert.match(corpo, /\| \/b\/ \| Pagina scansionata, ma attualmente non indicizzata \| nessuna: scelta di Google \| 2026-10-01 \|/);
  assert.match(corpo, /Pagine mai mostrate nei risultati: \*\*2\*\* su 3/);
  assert.match(corpo, /\| \/a\/ \| 7 \| 90 \| 9,5 \|/);
  // una causa tecnica e' un problema grave della pagina; l'avviso solo informativo no
  assert.deepStrictEqual(V.avvisi(r, null).map((a) => a.id), ['pagina:/c/']);
  // la settimana dopo: /a/ esce dall'indice
  const prima = V.datiPrecedenti(corpo);
  assert.deepStrictEqual(prima.misure.map((m) => m.ind), [true, false, false]);
  const dopo = { ...r, data: '2026-10-18', misure: [{ ...BUONA, google: indice(false) }, r.misure[1]] };
  assert.deepStrictEqual(V.usciteDallIndice(dopo.misure, prima.misure), ['/a/']);
  const uscita = V.avvisi(dopo, prima).find((a) => a.id === 'uscite:2026-10-18');
  assert.match(uscita.titolo, /1 pagina uscita dall'indice/);
  assert.match(V.corpoRapporto(dopo, prima), /Uscite dall'indice di Google rispetto al controllo precedente: \*\*1\*\* \(\/a\/\)/);
  // senza Search Console il rapporto lo dice
  assert.match(V.corpoRapporto({ ...r, google: { attivo: false } }, null), /manca il segreto `GSC_CREDENZIALI`/);
});

test('il workflow passa le chiavi di Google solo come variabili d\'ambiente', () => {
  const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'metriche.yml'), 'utf8');
  assert.match(wf, /GSC_CREDENZIALI: \$\{\{ secrets\.GSC_CREDENZIALI \}\}/);
  assert.match(wf, /node scripts\/qualita\/google\.js/);
  assert.doesNotMatch(wf, /echo .*GSC_CREDENZIALI/);
});
