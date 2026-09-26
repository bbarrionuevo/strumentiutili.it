// tests/fonti.test.js — Chi cura il sito e da dove vengono i numeri.
//
// Un sito che fa calcoli fiscali deve dire chi ne risponde e permettere di
// controllare le fonti: il nome del curatore nelle pagine legali e sugli
// strumenti, la pagina sul metodo, e le leggi citate collegate al testo
// ufficiale (Normattiva, EUR-Lex, Agenzia delle Entrate).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const F = require('../scripts/collega-fonti.js');
const L = require('../scripts/build-layout.js');
const { tutteLePagine, testoVisibile } = require('./helpers/contenuti.js');

const leggi = (rel) => fs.readFileSync(path.join(RADICE, rel), 'utf8');
const NOME = 'Brian Barrionuevo';
const PAGINE = tutteLePagine();

test('gli URN di Normattiva si costruiscono dalla citazione', () => {
  assert.strictEqual(F.urnAtto('Legge', '27', 'dicembre', '2019', '160', '1'),
    'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2019-12-27;160~art1');
  assert.strictEqual(F.urnAtto('D.Lgs.', '1&deg;', 'settembre', '1993', '385'),
    'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1993-09-01;385');
  assert.strictEqual(F.urnAtto('D.P.R.', '22', 'dicembre', '1986', '917', '11'),
    'https://www.normattiva.it/uri-res/N2Ls?urn:nir:presidente.repubblica:decreto:1986-12-22;917~art11');
  assert.strictEqual(F.urnAtto('D.Lgs.', '6', 'settembre', '2005', '206', '17', 'bis'),
    'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-09-06;206~art17bis');
  assert.strictEqual(F.urnCodice('Codice civile', '2120'),
    'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262:2~art2120');
  assert.strictEqual(F.ue('Regolamento UE', '2016', '679'), 'https://eur-lex.europa.eu/eli/reg/2016/679/oj/ita');
  assert.strictEqual(F.ue('Direttiva', '2011', '7'), 'https://eur-lex.europa.eu/eli/dir/2011/7/oj/ita');
});

test('le citazioni diventano collegamenti, senza indovinare', () => {
  const r = F.collegaVoce('D.P.R. 26 aprile 1986, n. 131, art. 5 della Tariffa: registro.');
  // l'articolo 5 della Tariffa e' nell'allegato: si collega l'atto intero
  assert.deepStrictEqual(r.usati, ['https://www.normattiva.it/uri-res/N2Ls?urn:nir:presidente.repubblica:decreto:1986-04-26;131']);
  const due = F.collegaVoce('D.Lgs. 30 dicembre 2023, n. 216, e Legge 30 dicembre 2024, n. 207: tre scaglioni.');
  assert.strictEqual(due.usati.length, 2);
  const niente = F.collegaVoce('Indici FOI senza tabacchi pubblicati dall&rsquo;ISTAT.');
  assert.deepStrictEqual(niente.usati, []);
  // gia' collegata: resta com'e'
  const gia = '<a href="https://example.org">Legge 9 dicembre 1998, n. 431</a>';
  assert.strictEqual(F.collegaVoce(gia).html, gia);
});

test('le fonti di tutte le pagine sono collegate', () => {
  const da = PAGINE.filter((p) => F.trasforma(p.html).html !== p.html).map((p) => p.percorso);
  assert.deepStrictEqual(da, [], 'Esegui: node scripts/collega-fonti.js');
});

test('i collegamenti alle fonti hanno la forma giusta e si aprono a parte', () => {
  const sbagliati = [];
  const URN = /^https:\/\/www\.normattiva\.it\/uri-res\/N2Ls\?urn:nir:(stato:(legge|decreto\.legislativo|decreto\.legge|regio\.decreto)|presidente\.(repubblica|consiglio\.ministri):decreto):\d{4}-\d{2}-\d{2};\d+(:\d)?(~art\d+[a-z]*)?$/;
  let quanti = 0;
  for (const p of PAGINE) {
    const m = p.html.match(/>Fonti<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
    if (!m) continue;
    for (const a of m[1].matchAll(/<a href="([^"]+)"([^>]*)>/g)) {
      quanti++;
      const href = a[1].replace(/&amp;/g, '&');
      if (!/rel="noopener"/.test(a[2])) sbagliati.push(p.percorso + ': senza rel=noopener ' + href);
      if (href.includes('normattiva.it') && !URN.test(href)) sbagliati.push(p.percorso + ': URN ' + href);
      if (!/^https:\/\/(www\.normattiva\.it|eur-lex\.europa\.eu|www\.agenziaentrate\.gov\.it)\//.test(href)) sbagliati.push(p.percorso + ': fonte non ufficiale ' + href);
    }
  }
  assert.deepStrictEqual(sbagliati, []);
  assert.ok(quanti >= 120, 'solo ' + quanti + ' collegamenti alle fonti');
});

test('ogni strumento con leggi citate ne collega almeno una', () => {
  const senza = [];
  for (const p of PAGINE) {
    const m = p.html.match(/>Fonti<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
    if (!m) continue;
    const citaLeggi = /(Legge|D\.Lgs\.|D\.L\.|D\.P\.R\.) \d/.test(m[1]);
    if (citaLeggi && !/<a href="https:\/\/www\.normattiva\.it/.test(m[1])) senza.push(p.percorso);
  }
  assert.deepStrictEqual(senza, []);
});

test('il curatore del sito ha un nome, nelle pagine legali e su ogni scheda di affidabilita', () => {
  assert.match(testoVisibile(leggi('contatti.html')), new RegExp('curato da ' + NOME));
  assert.match(testoVisibile(leggi('politica-sulla-privacy.html')), new RegExp('titolare del trattamento è ' + NOME));
  const avviso = leggi('avviso-legale.html');
  assert.match(testoVisibile(avviso), new RegExp(NOME));
  assert.doesNotMatch(avviso, /nostro team|sviluppatori e i proprietari/);
  const schede = PAGINE.filter((p) => p.html.includes('su-trust-card'));
  assert.ok(schede.length >= 60);
  const senza = schede.filter((p) => !/Chi lo cura<\/p>/.test(p.html) || !p.html.includes(NOME) || !p.html.includes('href="/metodo/"'));
  assert.deepStrictEqual(senza.map((p) => p.percorso), []);
  assert.deepStrictEqual(PAGINE.filter((p) => /Chi lo ha realizzato/.test(p.html)).map((p) => p.percorso), []);
});

test('i dati strutturati degli strumenti indicano l\'autore', () => {
  const senza = [];
  for (const p of PAGINE) {
    for (const m of p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const dati = JSON.parse(m[1]);
      const nodi = [].concat(dati['@graph'] || dati);
      for (const n of nodi) {
        if (n['@type'] !== 'WebApplication' && n['@type'] !== 'SoftwareApplication') continue;
        if (!n.author || n.author['@type'] !== 'Person' || n.author.name !== NOME) senza.push(p.percorso);
      }
    }
  }
  assert.deepStrictEqual(senza, []);
  const chi = leggi('contatti.html');
  assert.match(chi, /"@type": "AboutPage"/);
  assert.match(chi, /"founder": \{\s*"@type": "Person",\s*"name": "Brian Barrionuevo"/);
});

test('la pagina sul metodo esiste, si indicizza ed e collegata', () => {
  const html = leggi('metodo/index.html');
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /<h1[^>]*>Come verifichiamo i dati<\/h1>/);
  const testo = testoVisibile(html);
  assert.ok(testo.split(/\s+/).length >= 700, 'la pagina sul metodo e troppo corta');
  assert.match(testo, new RegExp(NOME));
  assert.match(leggi('sitemap.xml'), /<loc>https:\/\/strumentiutili\.it\/metodo\/<\/loc>/);
  assert.match(L.piede(null), /href="\/metodo\/"/);
  assert.match(leggi('contatti.html'), /href="\/metodo\/"/);
  assert.match(leggi('mappa-del-sito/index.html'), /href="\/metodo\/"/);
});

test('nessun collegamento a pagine ufficiali sparite', () => {
  // Indirizzi che rispondevano 404 (o non esistevano piu') a settembre 2026:
  // non devono tornare. Il controllo completo lo fa ogni mese
  // .github/workflows/controlla-collegamenti.yml.
  const SPARITI = [
    'iservices.aci.it',
    'www.aci.it/i-servizi/servizi-online/calcolo-bollo-auto.html',
    'pagamenti/f23/modello-e-istruzioni-f23',
    'pagamenti/f24-accise/modello-e-istruzioni-f24-accise'
  ];
  const { collegamenti } = require('../scripts/controlla-collegamenti.js');
  const tutti = [...collegamenti().keys()];
  assert.ok(tutti.length >= 100, 'raccolti solo ' + tutti.length + ' collegamenti');
  assert.deepStrictEqual(tutti.filter((u) => SPARITI.some((s) => u.includes(s))), []);
});
