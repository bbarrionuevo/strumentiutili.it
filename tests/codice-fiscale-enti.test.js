// tests/codice-fiscale-enti.test.js — La pagina del modello AA5/6 (codice
// fiscale di enti, associazioni e condomini), riscritta sulle istruzioni del
// modello aggiornate al 18 novembre 2025, sulle schede dell'Agenzia («Che
// cos'è», «Come si richiede», variazioni e operazioni straordinarie,
// compilazione web), sul modulo di dichiarazione sostitutiva e su Normattiva
// (ottobre 2026): art. 7 del D.P.R. 605/1973 e del testo unico dal 2027. Ogni
// test ferma un errore della versione precedente della pagina, dello schema o
// del PDF compilabile.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./helpers/contenuti.js');
const { PDFDocument } = require('../vendor/pdf-lib@1.17.1/pdf-lib.min.js');

const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PAGINA = 'identita-burocrazia/codice-fiscale-enti/index.html';
const schema = () => JSON.parse(leggi('data/modello-aa5-6-schema.json'));
const campo = (passo, id) => schema().modelli.AA5_6.passi.find((p) => p.id === passo).campi.find((c) => c.id === id);
const NT = 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:';
// il testo come lo legge una persona: senza i trattini facoltativi (U+00AD)
// che lasciano andare a capo le parole lunghe nelle tabelle sul telefono
const testo = (html) => C.testoVisibile(html).replace(/­/g, '');

test('AA5/6: la guida ha le sezioni e il modello compilato', () => {
  const s = leggi(PAGINA);
  for (const id of ['guida', 'quale-modello', 'caselle', 'come-si-presenta', 'documenti', 'campo-per-campo', 'esempi', 'dopo', 'dal-2027']) {
    assert.ok(s.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(s, /src="\/assets\/esempi\/aa5-6-associazione-culturale\.webp" width="1100" height="\d+"/);
  const t = testo(s);
  // i codici ATECO 2025 degli esempi, letti nella «Struttura e note» dell'ISTAT
  assert.match(t, /94\.99\.20 «Attività di organizzazioni associative culturali e ricreative»/);
  assert.match(t, /93\.12\.00 «Attività dei club sportivi»/);
  assert.match(leggi('scripts/genera-esempi-moduli.py'), /"ente\.codiceAttivita": "949920"/);
});

test('AA5/6: il riquadro laterale è quello dell\'AA5/6, non dell\'AA4/8', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  // la versione precedente mostrava le caselle dell'AA4/8 (decesso, tessera)
  assert.doesNotMatch(s, /rounded text-white">AA4\/8</);
  assert.doesNotMatch(t, /Tessera Sanitaria rubata/);
  assert.doesNotMatch(t, /Comunichi la morte di una persona/);
  assert.match(t, /5 · Codice di terzi Devi indicare il codice di un soggetto che non ce l'ha: si presenta in ufficio/);
  assert.match(t, /3 · Estinzione L'ente si estingue: solo per via telematica, entro trenta giorni/);
});

test('AA5/6: un ente chiede la partita IVA con l\'AA7/10, non con l\'AA9/12', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  assert.doesNotMatch(t, /servono l'AA7\/10 o l'AA9\/12/);
  assert.match(t, /Inizio attività con attribuzione della sola partita IVA/);
  assert.match(t, /Dal 1° aprile 2010, anche quando la dichiarazione ai fini IVA è l’unico adempimento da svolgere/);
  assert.ok(s.includes('https://www.agenziaentrate.gov.it/portale/schede/istanze/aa7_10/schedainfo-aa7_10'));
});

test('AA5/6: nel quadro C va il codice attribuito, non quello calcolato', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  // la barra laterale prometteva il codice calcolato «già pronto»
  assert.doesNotMatch(t, /te lo ritrovi qui già pronto/);
  assert.match(t, /un codice calcolato non vale/);
  assert.match(t, /«non hanno alcun valore e il loro utilizzo può comportare problemi ai cittadini»/);
  // il ponte dal generatore riporta solo i dati anagrafici, mai il codice
  const ponte = s.slice(s.indexOf('const mappa = {'), s.indexOf('};', s.indexOf('const mappa = {')));
  assert.doesNotMatch(ponte, /codiceFiscale/);
});

test('AA5/6: niente affermazioni senza fonte', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  for (const r of [/il caso più frequente in assoluto/, /La maggior parte delle associazioni/, /nella pratica si usano tre codici/,
    /costa un viaggio all'ufficio a vuoto/, /fanno perdere più tempo/, /modello ministeriale/, /la tassa sui rifiuti dell'ente serve/,
    /lo controlla con il verificatore/]) {
    assert.doesNotMatch(t, r, String(r));
  }
  // la domanda sulla via telematica compariva due volte, la seconda senza accenti
  assert.doesNotMatch(s, /si puo' mandare/);
  const aiuti = JSON.stringify(schema());
  for (const r of [/stragrande maggioranza/, /Se lo statuto non dice nulla/, /serve a ritrovare l'ente/, /non spedito/]) {
    assert.doesNotMatch(aiuti, r, String(r));
  }
  // gli accenti veri, non l'apostrofo (Societa', e')
  assert.doesNotMatch(aiuti, /[A-Za-z][aeiou]'(?=[\s,.;:)"])/);
  assert.strictEqual(schema().versione, '2026-10');
  assert.match(campo('ente', 'termineGiorno').help, /le istruzioni non aggiungono altro/);
  assert.match(campo('allegati', 'firma').help, /firma il file digitalmente/);
});

test('AA5/6: le strade per presentarlo, caso per caso', () => {
  const t = testo(leggi(PAGINA));
  assert.match(t, /categoria «Richiesta certificati, copie e codici fiscali»/);
  assert.match(t, /PEC a una qualunque Direzione provinciale/);
  assert.match(t, /consegna in duplice esemplare a un qualunque ufficio, con appuntamento/);
  // il cambio del rappresentante va all'ufficio del domicilio fiscale, mai per via telematica
  assert.match(t, /In duplice esemplare all’ufficio del domicilio fiscale dell’ente/);
  assert.match(t, /Questa variazione non passa dai servizi telematici del modello/);
  // estinzione e operazioni straordinarie: solo telematica, trenta giorni
  assert.match(t, /Estinzione, fusione, concentrazione, trasformazione Solo per via telematica, entro trenta giorni/);
  assert.match(t, /serve la registrazione a Fisconline o Entratel/);
  // la casella 5 si presenta in ufficio
  assert.match(t, /Codice fiscale di terzi \(casella 5\) Presso un ufficio dell’Agenzia/);
});

test('AA5/6: documenti, tabelle ufficiali e dichiarazione sostitutiva', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  assert.match(t, /«a titolo esemplificativo e non esaustivo»/);
  assert.match(t, /Condominio Di esercitare attualmente le funzioni di amministratore Il proprio documento d’identità e la copia del verbale dell’assemblea che lo ha nominato/);
  assert.ok(s.includes(NT + 'presidente.repubblica:decreto:2000-12-28;445~art46'));
  assert.ok(s.includes(NT + 'presidente.repubblica:decreto:2000-12-28;445~art47'));
  // le voci della tabella della natura giuridica coincidono con lo schema
  const voci = Object.fromEntries(schema().tabelle.naturaGiuridica.filter((v) => v.value).map((v) => [Number(v.value), v.label.replace(/^\d+ — /, '')]));
  for (const n of [8, 9, 10, 12, 13, 15, 54, 55, 56]) {
    assert.ok(t.includes(n + ' ' + voci[n]), 'natura giuridica ' + n);
  }
  assert.strictEqual(schema().tabelle.naturaGiuridica.filter((v) => v.value).length, 55);
  assert.strictEqual(schema().tabelle.codiceCarica.filter((v) => v.value).length, 15);
  assert.match(t, /13 Amministratore di condominio/);
});

test('AA5/6: dal 2027 la regola dei trenta giorni passa nel testo unico', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  assert.ok(s.includes(NT + 'presidente.repubblica:decreto:1973-09-29;605~art7'));
  assert.ok(s.includes(NT + 'stato:decreto.legislativo:2026-08-05;141:1~art7'));
  assert.match(t, /Normattiva riporta il testo dell’art\. 7 del D\.P\.R\. 605\/1973 come in vigore fino al 31 dicembre 2026/);
  assert.match(t, /Il comma 14 vuole queste comunicazioni solo per via telematica/);
  const R = JSON.parse(leggi('data/fonti-monitorate.json'));
  const promemoria = R.scadenze.find((x) => x.id === 'aa5-6-testo-unico-2027');
  assert.ok(promemoria, 'manca il promemoria del 2027');
  assert.strictEqual(promemoria.dal, '2027-01-02');
});

test('AA5/6: domande frequenti uguali nel testo e nei dati strutturati', () => {
  const s = leggi(PAGINA);
  const faq = s.slice(s.indexOf('>Domande frequenti</h3>'));
  const visibili = [...faq.matchAll(/<summary[^>]*>([\s\S]*?)<span/g)].map((m) => testo(m[1]).trim());
  const strutturate = C.domandeFaq(s);
  assert.ok(visibili.length >= 10);
  assert.deepStrictEqual(strutturate, visibili);
  assert.strictEqual(new Set(visibili).size, visibili.length, 'domande ripetute');
  // fuori dalla guida non restano altre domande frequenti
  assert.strictEqual((s.match(/<details/g) || []).length, visibili.length);
});

test('AA5/6: il PDF compilabile non mostra i pulsanti dell\'originale', async () => {
  // «STAMPA» e «CANCELLA DATI» erano figli del campo STAMPA: tolto il campo,
  // i due riquadri restavano a schermo, inerti
  const doc = await PDFDocument.load(fs.readFileSync(path.join(__dirname, '..', 'assets/pdf/modello-aa5-6-compilabile.pdf')));
  assert.ok(!doc.getForm().getFields().some((f) => f.getName() === 'STAMPA'));
  for (const pagina of doc.getPages()) {
    const annotazioni = pagina.node.Annots();
    for (let i = 0; annotazioni && i < annotazioni.size(); i++) {
      const a = doc.context.lookup(annotazioni.get(i));
      const padre = a.get(a.context.obj('Parent'));
      const nome = a.get(a.context.obj('T')) || (padre && doc.context.lookup(padre).get(a.context.obj('T')));
      assert.ok(!String(nome || '').includes('STAMPA'), 'riquadro STAMPA ancora sulla pagina');
    }
  }
});

test('AA5/6: le schede ufficiali sono sorvegliate', () => {
  const R = JSON.parse(leggi('data/fonti-monitorate.json'));
  const ids = new Set(R.schede.map((x) => x.id));
  for (const id of ['codice-fiscale-enti-che-cos-e', 'codice-fiscale-enti-come-si-richiede', 'codice-fiscale-enti-variazioni',
    'codice-fiscale-enti-compilazione-web', 'codice-fiscale-enti-normativa', 'codice-fiscale-enti-dichiarazione-sostitutiva']) {
    assert.ok(ids.has(id), 'manca la scheda ' + id);
  }
  // ogni pagina dell'Agenzia citata nelle fonti è sorvegliata: scheda,
  // pagina dei modelli o documento di MODELLI
  const modelli = Object.values(require('../scripts/sentinella.js').modelli());
  const note = new Set([...R.schede.map((x) => x.url), ...(R.pagine_modelli || []).map((x) => x.url), ...modelli.flat()]);
  const s = leggi(PAGINA);
  const fonti = s.slice(s.indexOf('>Fonti</h3>'));
  const servizi = /\/(prenota-un-appuntamento|consegna-documenti|verifica-codice-fiscale|pec-direzioni-provinciali)$/;
  for (const m of fonti.matchAll(/href="(https:\/\/www\.agenziaentrate\.gov\.it\/portale\/[^"]+)"/g)) {
    const url = m[1].replace(/&amp;/g, '&');
    if (servizi.test(url)) continue; // servizi, non fonti di regole: li segue il controllo dei collegamenti
    assert.ok(note.has(url), 'non sorvegliata: ' + url);
  }
});
