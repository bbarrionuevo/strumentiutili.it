// tests/prossimo.test.js — "E adesso?": i passi proposti dopo ogni
// strumento, e i collegamenti che li rendono possibili.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/prossimo.js');
const C = require('../js/condivisi.js');

const RADICE = path.join(__dirname, '..');
const pdf = (name) => ({ name, type: 'application/pdf' });
const jpg = (name) => ({ name, type: 'image/jpeg' });
const percorsi = (elenco) => elenco.map((a) => a.percorso);

function pagina(percorso) {
  return fs.readFileSync(path.join(RADICE, percorso, 'index.html'), 'utf8');
}

test('dopo le foto in PDF: comprimere, firmare, unire', () => {
  const passi = P.passi('/pdf/jpg-in-pdf/', [pdf('foto.pdf')], C);
  assert.deepStrictEqual(percorsi(passi), ['/pdf/comprimi-pdf/', '/pdf/firma/', '/pdf/unisci-pdf/']);
  for (const a of passi) assert.ok(a.titolo && a.descrizione, a.percorso);
});

test('dopo un documento generato si propone prima la firma', () => {
  for (const p of ['/identita-burocrazia/disdetta/', '/identita-burocrazia/autocertificazione/', '/lavoro-contratti/ricevuta-prestazione-occasionale/']) {
    assert.strictEqual(P.passi(p, [pdf('documento.pdf')], C)[0].percorso, '/pdf/firma/', p);
  }
});

test('mai lo strumento in cui si e gia, al massimo tre passi', () => {
  assert.ok(!percorsi(P.passi('/pdf/firma/', [pdf('a-firmato.pdf')], C)).includes('/pdf/firma/'));
  assert.ok(!percorsi(P.passi('/pdf/comprimi-pdf/', [pdf('a-compresso.pdf')], C)).includes('/pdf/comprimi-pdf/'));
  assert.ok(!percorsi(P.passi('/pdf/firma/index.html', [pdf('a.pdf')], C)).includes('/pdf/firma/'));
  assert.strictEqual(P.passi('/pdf/unisci-pdf/', [pdf('a.pdf')], C, 2).length, 2);
});

test('i passi dipendono dal file creato', () => {
  // la copia protetta in PDF si comprime; in JPG si mette in un PDF
  assert.deepStrictEqual(percorsi(P.passi('/identita-burocrazia/proteggi-documento/', [pdf('documento-protetto.pdf')], C)), ['/pdf/comprimi-pdf/', '/pdf/unisci-pdf/']);
  assert.deepStrictEqual(percorsi(P.passi('/identita-burocrazia/proteggi-documento/', [jpg('documento-protetto.jpg')], C)), ['/pdf/jpg-in-pdf/']);
  // foto pulite: in un PDF o protette come documento
  assert.deepStrictEqual(percorsi(P.passi('/utilita-web/rimuovi-dati-foto/', [jpg('a.jpg'), jpg('b.jpg')], C)), ['/pdf/jpg-in-pdf/', '/identita-burocrazia/proteggi-documento/']);
  // immagini convertite in WebP: nessuno strumento qui le usa come passo successivo
  assert.deepStrictEqual(P.passi('/utilita-web/convertitore-immagini/', [{ name: 'a.webp', type: 'image/webp' }], C), []);
  assert.deepStrictEqual(P.passi('/pdf/firma/', [], C), []);
});

test('ogni passo porta a uno strumento che riceve il file', () => {
  const destinazioni = new Set([...Object.values(P.SEGUITI), ...Object.values(P.PER_GENERE)].flat());
  for (const d of destinazioni) {
    const html = pagina(d);
    const campo = /<input[^>]*data-condivisi[^>]*>/.exec(html);
    assert.ok(campo, d + ': manca il campo data-condivisi');
    assert.ok(/<script[^>]*src="\/js\/condivisi\.js"/.test(html), d + ': manca condivisi.js');
    const accept = (/accept="([^"]*)"/.exec(campo[0]) || [, ''])[1];
    const tipi = d.startsWith('/pdf/') && d !== '/pdf/jpg-in-pdf/' ? ['application/pdf'] : ['image/jpeg'];
    for (const t of tipi) assert.ok(accept === '' || accept.includes(t) || accept.includes(t.split('/')[0] + '/*'), d + ' non accetta ' + t);
  }
});

test('le pagine che creano file mostrano "E adesso?"', () => {
  const sorgenti = Object.keys(P.SEGUITI).concat(['/identita-burocrazia/disdetta/', '/identita-burocrazia/autocertificazione/', '/lavoro-contratti/ricevuta-prestazione-occasionale/', '/lavoro-contratti/lettera-dimissioni-preavviso/']);
  for (const p of sorgenti) assert.ok(/<script defer src="\/js\/prossimo\.js"><\/script>/.test(pagina(p)), p);
  const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
  assert.ok(sw.includes("'/js/prossimo.js'"));
  // ogni script che lo usa gli passa il punto della pagina dove comparire
  for (const js of ['pdf-tools', 'scanner', 'filigrana-ui', 'exif-ui', 'convertitore-immagini', 'disdetta', 'autocertificazione', 'hr-dimissioni', 'ricevuta-occasionale']) {
    const codice = fs.readFileSync(path.join(RADICE, 'js', js + '.js'), 'utf8');
    assert.ok(/Prossimo\.offri\([^;]*dopo:/.test(codice), js);
  }
});
