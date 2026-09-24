// tests/condivisi.test.js — Che cosa si puo' fare con i file condivisi verso l'app.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../js/condivisi.js');
const RADICE = path.resolve(__dirname, '..');

test('il genere dal tipo o, se manca, dall estensione', () => {
  assert.strictEqual(C.genere({ nome: 'a.pdf', tipo: 'application/pdf' }), 'pdf');
  assert.strictEqual(C.genere({ name: 'SCAN.PDF', type: '' }), 'pdf', 'File del browser, tipo vuoto');
  assert.strictEqual(C.genere({ nome: 'contratto.pdf.p7m', tipo: 'application/octet-stream' }), 'p7m');
  assert.strictEqual(C.genere({ nome: 'foto.jpg', tipo: 'image/jpeg' }), 'foto');
  assert.strictEqual(C.genere({ nome: 'IMG_1234.HEIC', tipo: '' }), 'immagine');
  assert.strictEqual(C.genere({ nome: 'PTT-20260924-WA0001.opus', tipo: 'audio/ogg' }), 'audio', 'vocale di WhatsApp');
  assert.strictEqual(C.genere({ nome: 'lettera.docx', tipo: '' }), 'docx');
  assert.strictEqual(C.genere({ nome: 'boh.xyz', tipo: '' }), 'altro');
});

test('le azioni proposte portano a pagine che esistono e accettano i file', () => {
  const generi = ['pdf', 'foto', 'immagine', 'p7m', 'xml', 'docx', 'audio', 'video'];
  const esempi = { pdf: 'a.pdf', foto: 'a.jpg', immagine: 'a.heic', p7m: 'a.xml.p7m', xml: 'a.xml', docx: 'a.docx', audio: 'a.opus', video: 'a.mp4' };
  const problemi = [];
  for (const g of generi) {
    const azioni = C.azioni([{ nome: esempi[g], tipo: '' }]);
    if (!azioni.length) problemi.push(g + ': nessuna azione');
    for (const a of azioni) {
      const file = path.join(RADICE, a.percorso, 'index.html');
      if (!fs.existsSync(file)) { problemi.push(g + ' -> ' + a.percorso + ' non esiste'); continue; }
      // La pagina deve avere un campo pronto a ricevere i file condivisi...
      const html = fs.readFileSync(file, 'utf8');
      if (!/<input[^>]*type="file"[^>]*data-condivisi/.test(html)) problemi.push(a.percorso + ' senza campo data-condivisi');
      // ...e caricare js/condivisi.js, che glieli consegna.
      if (!html.includes('src="/js/condivisi.js"')) problemi.push(a.percorso + ' non carica condivisi.js');
    }
  }
  assert.deepStrictEqual(problemi, []);
  assert.deepStrictEqual(C.azioni([]), []);
  assert.deepStrictEqual(C.azioni([{ nome: 'x.xyz' }]), []);
});

test('una fattura firmata si puo anche leggere impaginata', () => {
  const percorsi = C.azioni([{ nome: 'IT01234567890_00001.xml.p7m' }]).map((a) => a.percorso);
  assert.deepStrictEqual(percorsi, ['/pdf/apri-file-p7m/', '/fisco-professioni/fattura-elettronica/']);
});

test('file di generi diversi: si tengono quelli come il primo', () => {
  const tenuti = C.stessoGenere([{ nome: 'a.pdf' }, { nome: 'b.jpg' }, { nome: 'c.pdf' }]);
  assert.deepStrictEqual(tenuti.map((f) => f.nome), ['a.pdf', 'c.pdf']);
});

test('i file ricevuti scadono dopo un ora', () => {
  const ora = 1_800_000_000_000;
  assert.strictEqual(C.scaduto({ ora: ora - 10 * 60 * 1000 }, ora), false);
  assert.strictEqual(C.scaduto({ ora: ora - C.DURATA_MS - 1 }, ora), true);
  assert.strictEqual(C.scaduto(null, ora), true);
});
