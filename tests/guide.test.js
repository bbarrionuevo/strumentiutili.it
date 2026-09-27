// tests/guide.test.js — Le guide pratiche (/guide/).
//
// Sono il contenuto editoriale del sito: devono essere lunghe abbastanza da
// spiegare davvero, firmate e datate, con le fonti ufficiali, collegate agli
// strumenti (e viceversa) e con cifre uguali a quelle degli strumenti. Le
// cifre le garantisce il --check: le pagine si rigenerano con i motori.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const G = require('../scripts/genera-guide.js');
const { testoVisibile } = require('./helpers/contenuti.js');

const leggi = (rel) => fs.readFileSync(path.join(RADICE, rel), 'utf8');
const DATI = JSON.parse(leggi('data/guide.json')).guide;
const PAGINE = DATI.map((g) => ({ g, html: leggi(g.percorso.replace(/^\//, '') + 'index.html') }));
const UFFICIALI = /^https:\/\/(www\.normattiva\.it|eur-lex\.europa\.eu|www\.agenziaentrate\.gov\.it|www\.inps\.it|online\.aci\.it|aci\.gov\.it|www\.istat\.it|www\.finanze\.gov\.it|www\.lavoro\.gov\.it|www\.fatturapa\.gov\.it|www\.agid\.gov\.it|www\.commissariatodips\.it)\//;

function main(html) {
  return html.slice(html.indexOf('<main'), html.indexOf('</main>'));
}

test('le guide sono aggiornate (cifre comprese)', () => {
  const { file } = G.tuttiIFile();
  const diversi = [];
  for (const [f, contenuto] of file) {
    if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== contenuto) diversi.push(path.relative(RADICE, f));
  }
  assert.deepStrictEqual(diversi, [], 'Esegui: node scripts/genera-guide.js');
});

test('ci sono almeno dodici guide, ognuna con la sua pagina', () => {
  assert.ok(DATI.length >= 12, 'solo ' + DATI.length + ' guide');
  for (const g of DATI) assert.ok(fs.existsSync(path.join(RADICE, g.percorso, 'index.html')), g.percorso);
});

test('ogni guida e lunga abbastanza da spiegare', () => {
  const corte = PAGINE
    .map(({ g, html }) => ({ p: g.percorso, n: testoVisibile(main(html)).split(/\s+/).filter(Boolean).length }))
    .filter((x) => x.n < 1200);
  assert.deepStrictEqual(corte, []);
});

test('ogni guida e firmata e datata', () => {
  for (const { g, html } of PAGINE) {
    assert.match(html, /di <a href="\/contatti\/#chi-cura-il-sito"[^>]*>Brian Barrionuevo<\/a>/, g.percorso);
    assert.match(html, new RegExp('aggiornata il <time datetime="' + g.aggiornata + '">'), g.percorso);
  }
});

test('ogni guida cita almeno tre fonti ufficiali con il collegamento', () => {
  for (const { g, html } of PAGINE) {
    const fonti = html.slice(html.indexOf('id="fonti"'));
    const link = [...fonti.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')).filter((u) => UFFICIALI.test(u));
    assert.ok(new Set(link).size >= 3, g.percorso + ': ' + link.length + ' fonti ufficiali');
  }
});

test('guida e strumento si rimandano a vicenda', () => {
  for (const { g, html } of PAGINE) {
    for (const s of g.strumenti) {
      assert.ok(main(html).includes('href="' + s + '"'), g.percorso + ' non porta a ' + s);
      const strumento = leggi(s.replace(/^\//, '') + 'index.html');
      assert.ok(strumento.includes('<!-- su:guida -->') && strumento.includes('href="' + g.percorso + '"'), s + ' non porta alla guida');
    }
  }
});

test('dati strutturati: Article con autore e date, e le domande visibili', () => {
  for (const { g, html } of PAGINE) {
    const blocchi = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const nodi = blocchi.flatMap((b) => b['@graph'] || [b]);
    const art = nodi.find((n) => n['@type'] === 'Article');
    assert.ok(art, g.percorso + ': manca Article');
    assert.strictEqual(art.author.name, 'Brian Barrionuevo');
    assert.strictEqual(art.author['@type'], 'Person');
    assert.match(art.datePublished, /^\d{4}-\d{2}-\d{2}$/);
    assert.strictEqual(art.dateModified, g.aggiornata);
    const faq = nodi.find((n) => n['@type'] === 'FAQPage');
    assert.ok(faq && faq.mainEntity.length >= 4, g.percorso + ': poche domande');
    assert.ok((html.match(/<details /g) || []).length >= faq.mainEntity.length);
    assert.match(html, /<meta property="og:type" content="article" \/>/);
  }
});

test('le briciole passano dalla sezione Guide', () => {
  for (const { g, html } of PAGINE) {
    assert.match(html, /<li><a href="\/guide\/" class="[^"]*">Guide<\/a><\/li>/, g.percorso);
  }
  assert.match(leggi('guide/index.html'), /aria-current="page">Guide<\/span>/);
});

test('le guide si trovano: indice, home, piede, mappa, ricerca, sitemap e offline', () => {
  const indice = leggi('guide/index.html');
  const home = leggi('index.html');
  const mappa = leggi('mappa-del-sito/index.html');
  const ricerca = JSON.parse(leggi('data/strumenti.json')).strumenti;
  const sitemap = leggi('sitemap.xml');
  const sw = leggi('sw.js');
  assert.match(home, /href="\/guide\/"/);
  assert.match(require('../scripts/build-layout.js').piede(null), /href="\/guide\/"/);
  assert.match(sw, /'\/guide\/'/);
  for (const g of DATI) {
    assert.ok(indice.includes('href="' + g.percorso + '"'), 'indice: ' + g.percorso);
    assert.ok(home.includes('href="' + g.percorso + '"'), 'home: ' + g.percorso);
    assert.ok(mappa.includes('href="' + g.percorso + '"'), 'mappa: ' + g.percorso);
    assert.ok(ricerca.some((v) => v.percorso === g.percorso && v.nomeCategoria === 'Guida'), 'ricerca: ' + g.percorso);
    assert.ok(sitemap.includes('<loc>https://strumentiutili.it' + g.percorso + '</loc>'), 'sitemap: ' + g.percorso);
    assert.ok(sw.includes("'" + g.percorso + "'"), 'service worker: ' + g.percorso);
  }
});

test('le cifre di esempio sono quelle dei motori', () => {
  // Controlli a campione, calcolati a mano: se il --check passa e questi
  // passano, guida e strumento dicono la stessa cosa.
  const testo = (slug) => testoVisibile(leggi('guide/' + slug + '/index.html'));
  assert.match(testo('bollo-auto-2026'), /85 × 2,58 € = 219,30 €/);
  assert.match(testo('bollo-auto-2026'), /Totale annuo: 1\.142,40 €/);
  assert.match(testo('imu-2026'), /IMU annua 1\.603 €/);
  assert.match(testo('registrare-contratto-affitto'), /Registro: 9\.600 € × 2% = 192,00 €/);
  assert.match(testo('leggere-busta-paga'), /Netto annuo 22\.145,90 €/);
  assert.match(testo('dimissioni-tfr-naspi'), /= 1\.311,24 € lordi al mese/);
  assert.match(testo('regime-forfettario'), /Restano 28\.406,24 € l’anno/);
  assert.match(testo('ravvedimento-operoso'), /8,33/);
  assert.match(testo('fattura-elettronica-scartata'), /33,33 × 3 = 99,99 €/);
  assert.match(testo('fattura-elettronica-scartata'), /71,05 € × 22% = 15,63 €/);
});

test('le guide sui file mostrano quello che dice lo strumento «Che file è?»', () => {
  // le righe delle tabelle le scrive js/tipo-file.js al momento di generare
  const testo = (slug) => testoVisibile(leggi('guide/' + slug + '/index.html'));
  assert.match(testo('file-non-si-apre'), /scansione\.dat .*Documento PDF.* scansione\.pdf/);
  assert.match(testo('file-non-si-apre'), /IMG_2031 .*Foto HEIC \(iPhone\) IMG_2031\.heic/);
  assert.match(testo('file-non-si-apre'), /Doppia estensione \(\.pdf\.exe\)/);
  assert.match(testo('file-p7m-pec-daticert'), /daticert\.xml Ricevuta della PEC \(daticert\.xml\)/);
});
