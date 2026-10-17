// tests/opposizione-spese-sanitarie.test.js — Il compilatore del modello di
// opposizione all'utilizzo dei dati delle spese sanitarie per la precompilata
// (spese del 2026). Date, canali e regole vengono dalla scheda «Che cos'e'»
// dell'Agenzia delle Entrate aggiornata il 7 ottobre 2026; le tipologie e i
// riquadri dal modello stesso. Se l'Agenzia cambia la scheda, la sentinella
// lo segnala (data/fonti-monitorate.json, opposizione-spese-sanitarie-che-cos-e).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, PDFName } = require('../vendor/pdf-lib@1.17.1/pdf-lib.min.js');
const C = require('./helpers/contenuti.js');
const { caricaScript } = require('./helpers/carica-script.js');

const RADICE = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');
const PAGINA = 'cittadino-tasse/opposizione-spese-sanitarie/index.html';
const SCHEMA = JSON.parse(leggi('data/modello-opposizione-spese-sanitarie-schema.json'));
const MODELLO = SCHEMA.modelli.OPPOSIZIONE;
const passo = (id) => MODELLO.passi.find((p) => p.id === id);

test('opposizione: le sei tipologie del modello, almeno una barrata', () => {
  const spese = passo('spese');
  assert.deepStrictEqual(spese.campi.map((c) => [c.type, c.pdf]),
    ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ['check', l]));
  // senza nessuna tipologia il modello non chiede niente
  assert.deepStrictEqual(spese.almenoUno.campi, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.ok(spese.almenoUno.messaggio);
});

test('opposizione: chi firma e la persona rappresentata, con tutti i dati', () => {
  // il riquadro «Il sottoscritto» e' di chi firma; «In qualita' di
  // rappresentante/tutore di» (nel PDF i campi «... rappresentante/tutore»)
  // e' della persona rappresentata ed e' facoltativo
  const firma = passo('sottoscritto');
  const rapp = passo('rappresentato');
  assert.ok(!firma.opzionale);
  assert.strictEqual(rapp.opzionale, true);
  assert.deepStrictEqual(firma.campi.map((c) => c.pdf), ['Codice Fiscale', 'Cognome e Nome', 'Luogo di nascita',
    'Data di nascita', 'Tessera sanitaria n', 'Data di scadenza']);
  assert.ok(rapp.campi.every((c) => /rappresentante ?\/ ?tutore$/.test(c.pdf)), 'il secondo passo scrive nel secondo riquadro');
  // l'informativa: i dati richiesti vanno forniti obbligatoriamente
  for (const p of [firma, rapp]) {
    assert.ok(p.campi.every((c) => c.required === true), p.id);
    assert.deepStrictEqual(p.campi.map((c) => c.type), ['cf', 'testo', 'testo', 'dataEstesa', 'tessera', 'dataEstesa']);
  }
  assert.match(rapp.descrizione, /16 anni/);
});

test('opposizione: luogo e data in due caselle, la firma a mano', () => {
  const f = passo('firma');
  assert.deepStrictEqual(f.campi.map((c) => [c.pdf, c.type, c.required]),
    [['luogo_firma', 'testo', true], ['data_firma', 'dataEstesa', true]]);
  assert.match(f.descrizione, /documento d'identita'/);
  assert.match(f.campi[1].help, /2 febbraio 2027/);
});

test('opposizione: numero della tessera sanitaria, al massimo 20 caratteri e senza spazi', () => {
  const CM = caricaScript(['js/compilatore-moduli.js']).window.CompilatoreModuli;
  assert.strictEqual(CM.controllaValore('tessera', '12345678901234567890'), null);
  assert.strictEqual(CM.controllaValore('tessera', '1234 5678 9012'), null);
  assert.ok(CM.controllaValore('tessera', '123456789012345678901'), 'il riquadro del modello tiene 20 caratteri');
  assert.ok(CM.controllaValore('tessera', '1234-5678'));
  assert.strictEqual(CM.perModello(' 1234 5678 ', 'tessera'), '12345678');
});

test('opposizione: codice fiscale e tessera non si salvano nel browser', () => {
  const { window } = caricaScript(['js/storage-helper.js']);
  for (const p of ['sottoscritto', 'rappresentato']) {
    for (const id of ['codiceFiscale', 'tessera']) {
      assert.ok(window.AppStorage.campoSensibile(`OPPOSIZIONE.${p}.${id}`), `${p}.${id}`);
    }
    assert.ok(!window.AppStorage.campoSensibile(`OPPOSIZIONE.${p}.cognomeNome`));
  }
});

test('opposizione: il PDF compilabile senza pulsanti di Acrobat e con le caselle /On', async () => {
  const pdf = await PDFDocument.load(fs.readFileSync(path.join(RADICE, MODELLO.pdf.slice(1))));
  const form = pdf.getForm();
  const nomi = form.getFields().map((f) => f.getName());
  for (const via of ['STAMPA', 'CANCELLA DATI', 'SALVA CON NOME', 'Luogo e Data']) assert.ok(!nomi.includes(via), via);
  for (const l of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const casella = form.getCheckBox(l);
    const aspetti = casella.acroField.getWidgets()[0].dict.lookup(PDFName.of('AP')).lookup(PDFName.of('N'));
    assert.deepStrictEqual(aspetti.keys().map(String).sort(), ['/Off', '/On'], l);
  }
  assert.strictEqual(form.getTextField('Codice Fiscale').getMaxLength(), 16);
  assert.strictEqual(form.getTextField('Tessera sanitaria n').getMaxLength(), 20);
});

test('opposizione: date, canali e regole della scheda ufficiale', () => {
  const s = leggi(PAGINA);
  const t = C.testoVisibile(s);
  assert.match(s, /data-schema="\/data\/modello-opposizione-spese-sanitarie-schema\.json"/);
  assert.match(s, /data-modello="OPPOSIZIONE"/);
  // le due strade per le spese del 2026
  assert.match(t, /Dal 1° ottobre 2026 al 2 febbraio 2027 \(il 31 gennaio cade di domenica\)/);
  assert.match(t, /Dal 9 febbraio all’8 marzo 2027/);
  assert.match(t, /TS-CNS, SPID o CIE/);
  // chi puo' farla
  assert.match(t, /ha compiuto 16 anni/);
  assert.match(t, /il tutore o il rappresentante legale/);
  // canali: e-mail e telefono, nient'altro (la scheda non prevede PEC o posta)
  assert.match(t, /opposizioneutilizzospesesanitarie@agenziaentrate\.it/);
  assert.match(t, /numero verde 800909696/);
  assert.match(t, /0697617689 da cellulare/);
  assert.match(t, /\+39 0645470468 dall’estero/);
  assert.doesNotMatch(t, /\bPEC\b|raccomandata|posta elettronica certificata/i);
  // documento, forma libera, scontrino parlante, detrazione
  assert.match(t, /Con il modello la copia del documento d’identità serve sempre/);
  assert.match(t, /in forma libera/);
  assert.match(t, /scontrino parlante/);
  assert.match(t, /fase di modifica o integrazione della precompilata/);
  // il modello e' di un anno solo
  assert.match(t, /anno d’imposta 2026/);
});

test('opposizione: sezioni della guida, esempio compilato e fonti', () => {
  const s = leggi(PAGINA);
  for (const id of ['due-strade', 'tipologie', 'chi-firma', 'campo-per-campo', 'casi', 'come-si-invia', 'errori', 'privacy', 'ogni-anno']) {
    assert.ok(s.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(s, /src="\/assets\/esempi\/opposizione-spese-sanitarie-studentessa\.webp" width="1100" height="1280"/);
  const fonti = s.match(/>Fonti<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/)[1];
  assert.match(fonti, /infogen-2017-opposizione-730-precompilato/);
  assert.match(fonti, /modello-2017-opposizione-730-precompilato/);
  assert.match(fonti, /urn:nir:stato:regio\.decreto:1942-03-16;262:2~art320/);
  // le domande frequenti visibili sono le stesse dei dati strutturati
  const ld = JSON.parse(s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage').mainEntity.map((q) => q.name);
  const visibili = [...s.matchAll(/<summary[^>]*>([\s\S]*?)<span/g)].map((m) => C.testoVisibile(m[1]).trim());
  assert.deepStrictEqual(visibili, faq);
});
