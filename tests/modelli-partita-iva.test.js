// tests/modelli-partita-iva.test.js — La pagina dei modelli AA9/12 e AA7/10,
// riscritta sulle istruzioni dei modelli, sulle schede dell'Agenzia (apertura,
// variazione, chiusura d'ufficio, VIES) e su Normattiva (ottobre 2026): art. 35
// del D.P.R. 633/1972, art. 5 del D.Lgs. 471/1997, art. 9 del D.L. 7/2007 e i
// testi unici IVA e sanzioni dal 2027. Ogni test ferma un errore della versione
// precedente della pagina, dello schema, del motore o dei PDF compilabili.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./helpers/contenuti.js');
const { caricaScript } = require('./helpers/carica-script.js');
const { PDFDocument } = require('../vendor/pdf-lib@1.17.1/pdf-lib.min.js');

const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PAGINA = 'fisco-professioni/modelli-partita-iva/index.html';
const schema = () => JSON.parse(leggi('data/modelli-piva-schema.json'));
const campo = (m, passo, id) => schema().modelli[m].passi.find((p) => p.id === passo).campi.find((c) => c.id === id);
const NT = 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:';
// il testo come lo legge una persona: senza i trattini facoltativi (U+00AD)
// che lasciano andare a capo le parole lunghe nelle tabelle sul telefono
const testo = (html) => C.testoVisibile(html).replace(/\u00ad/g, '');

test('partita IVA: la guida ha le sezioni e il modello AA9/12 compilato', () => {
  const s = leggi(PAGINA);
  for (const id of ['quale-modello', 'tipo-dichiarazione', 'come-si-presenta', 'termini-sanzioni', 'campo-per-campo', 'regime-vies', 'esempi', 'chiusura', 'dal-2027']) {
    assert.ok(s.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(s, /src="\/assets\/esempi\/aa9-12-inizio-forfetario\.webp" width="1100" height="\d+"/);
  // l'immagine nasce dal compilatore con il codice ATECO 2025 citato nel testo
  assert.match(leggi('scripts/genera-esempi-moduli.py'), /"quadroB2\.codiceAteco": "743000"/);
  const t = testo(s);
  assert.match(t, /74\.30\.00, «Attività di traduzione e interpretariato»/);
  assert.match(t, /62\.10\.00, «Attività di programmazione informatica»/);
  assert.match(t, /69\.20\.01, «Attività di commercialisti»/);
});

test('partita IVA: le caselle del quadro A sono diverse nei due modelli', () => {
  const t = testo(leggi(PAGINA));
  // prima: «Nel modello si indica il tipo di operazione: 1 inizio attività,
  // 2 variazione dati, 3 cessazione». Nell'AA7/10 la variazione è la casella 3,
  // la cessazione la 4 e il duplicato la 5; nell'AA9/12 c'è anche il duplicato
  assert.doesNotMatch(t, /tipo di operazione: 1 inizio attività, 2 variazione dati, 3 cessazione/);
  assert.match(t, /Variazione dei dati\s+Casella 2\s+Casella 3/);
  assert.match(t, /Cessazione\s+Casella 3\s+Casella 4/);
  assert.match(t, /Duplicato del certificato di attribuzione\s+Casella 4\s+Casella 5/);
  const valori = (m) => campo(m, 'quadroA', 'tipoDichiarazione').options.map((o) => o.value + ' ' + o.label.split(' ')[0]);
  assert.deepStrictEqual(valori('AA9'), ['1 Inizio', '2 Variazione', '3 Cessazione', '4 Richiesta']);
  assert.deepStrictEqual(valori('AA7'), ['1 Inizio', '2 Inizio', '3 Variazione', '4 Cessazione', '5 Richiesta']);
  // e in regole-fiscali non restano le tabelle sbagliate che nessuno usava
  // (natura giuridica «1 = SPA», «50 = ETS»; tipo operazione a tre caselle)
  const regole = JSON.parse(leggi('data/regole-fiscali-2026.json')).modelli_partita_iva;
  assert.deepStrictEqual(Object.keys(regole), ['blacklist_cap_generici']);
  const natura = schema().tabelle.naturaGiuridica;
  assert.strictEqual(natura.find((v) => v.value === '1').label, '1 — Società in accomandita per azioni (SAPA)');
  assert.strictEqual(natura.find((v) => v.value === '3').label, '3 — Società per azioni (SPA)');
  assert.match(t, /1 è la società in accomandita per azioni, 2 la SRL, 3 la SPA/);
});

test('partita IVA: la data e il regime non si comunicano come diceva la pagina', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  // prima: «non si può indicare una data successiva alla prima operazione»;
  // le istruzioni dicono che la data non può seguire quella di presentazione
  assert.doesNotMatch(t, /successiva alla prima operazione/);
  assert.match(t, /La data di inizio, di variazione o di cessazione non può essere successiva al giorno in cui presenti il modello/);
  assert.doesNotMatch(campo('AA9', 'quadroA', 'dataInizio').help, /inizierai/);
  // prima: «Il cambio di sede, di attività o di regime si comunica sempre entro
  // 30 giorni»; opzioni e revoche vanno nel quadro VO (art. 2 D.P.R. 442/1997)
  assert.doesNotMatch(t, /di attività o di regime si comunica/);
  assert.match(t, /vanno nel quadro VO della dichiarazione annuale IVA/);
  assert.match(t, /art\. 2 del D\.P\.R\. 442\/1997, richiamato dalle istruzioni/);
  // la cessazione: i 30 giorni dalla fine delle operazioni di liquidazione
  assert.match(t, /Per la cessazione i 30 giorni decorrono dalla fine delle operazioni di liquidazione dell’azienda/);
  assert.match(campo('AA9', 'quadroA', 'dataCessazione').help, /art\. 35, comma 4/);
  assert.match(campo('AA7', 'quadroA', 'dataCessazione').help, /art\. 35, comma 4/);
});

test('partita IVA: imprese con la Comunicazione Unica, condomini con l\'AA5/6', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  // prima l'AA7/10 era «per una società, un ente, un'associazione, una
  // fondazione o un condominio»: il condominio che chiede solo il codice
  // fiscale usa l'AA5/6 (istruzioni AA5/6, carica 13 amministratore di condominio)
  assert.doesNotMatch(s, /una fondazione o un condominio/);
  assert.doesNotMatch(s, /un ente o un condominio/);
  assert.doesNotMatch(schema().modelli.AA7.descrizione, /condomin/i);
  assert.match(s, /href="\/identita-burocrazia\/codice-fiscale-enti\/"/);
  assert.match(t, /Fra le cariche di chi firma l’AA5\/6 c’è anche l’amministratore di condominio/);
  // prima l'AA9/12 era «per ditta individuale, artigiano, commerciante»: per
  // un'attività d'impresa o artigianale la scheda dell'Agenzia vuole ComUnica
  assert.doesNotMatch(s, /ditta individuale, artigiano, commerciante/);
  assert.match(t, /Impresa individuale, anche artigiana o commerciale\s+Comunicazione Unica \(ComUnica\) al Registro delle imprese/);
  assert.ok(s.includes(NT + 'stato:decreto.legge:2007-01-31;7~art9'));
  // la guida al forfettario diceva che la partita IVA si apre con l'AA9/12 per tutti
  const g = testo(leggi('guide/regime-forfettario/index.html'));
  assert.match(g, /Artigiani, commercianti e le altre imprese individuali usano invece la Comunicazione Unica/);
  assert.doesNotMatch(g, /dopo aver incassato le fatture ancora aperte/);
});

test('partita IVA: niente affermazioni senza fonte', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  for (const r of [/Presso l’Agenzia delle Entrate è gratis/, /causa frequente di scarto/, /inquadramento previdenziale/,
    /Gestione separata INPS/, /non cancella eventuali sanzioni/, /zero backend/i, /PDF ministeriale/, /20146/]) {
    assert.doesNotMatch(s + t, r, String(r));
  }
  // il CAP generico: le istruzioni chiedono un indirizzo completo, non c'è
  // scritto che l'Agenzia «scarta» o «non accetta» la dichiarazione
  assert.doesNotMatch(leggi('js/compilatore-moduli.js'), /non lo accetta/);
  const aiuti = JSON.stringify(schema());
  for (const r of [/scarta le dichiarazioni/, /non sono accettati/, /maggior parte delle nuove partite IVA/,
    /Senza VIES non puoi/, /Nel dubbio compilali/, /studi di settore/, /di proprietà\)/]) {
    assert.doesNotMatch(aiuti, r, String(r));
  }
  // i campi per le attività a rischio si compilano «esclusivamente» per quelle
  assert.match(campo('AA9', 'quadroI', 'tipologiaClientela').help, /esclusivamente/);
  // il domicilio fiscale dell'AA7/10 è solo per i non residenti
  assert.match(campo('AA7', 'quadroB2', 'domicilioDiverso').help, /solo ai soggetti non residenti/);
});

test('partita IVA: sanzione, chiusura d\'ufficio e testo unico dal 2027', () => {
  const s = leggi(PAGINA);
  const t = testo(s);
  assert.match(t, /rischia una sanzione da 500 a 2\.000 euro \(art\. 5, comma 6, del D\.Lgs\. 471\/1997\)/);
  assert.match(t, /la sanzione scende a un quinto del minimo, cioè 100 euro/);
  assert.ok(s.includes(NT + 'stato:decreto.legislativo:1997-12-18;471~art5'));
  assert.match(t, /nelle tre annualità precedenti/);
  assert.match(t, /«Risposta a comunicazione di chiusura della Partita IVA»/);
  // dal 1° gennaio 2027 l'art. 35 è abrogato (D.Lgs. 10/2026) e la sanzione
  // passa nel testo unico delle sanzioni tributarie
  assert.ok(s.includes(NT + 'stato:decreto.legislativo:2026-01-19;10:1~art68'));
  assert.ok(s.includes(NT + 'stato:decreto.legislativo:2026-01-19;10:1~art70'));
  assert.ok(s.includes(NT + 'stato:decreto.legislativo:2024-11-05;173:1~art30'));
  assert.match(t, /Dal 1° gennaio 2027 l’art\. 35 del D\.P\.R\. 633\/1972 è abrogato dal D\.Lgs\. 19 gennaio 2026, n\. 10/);
  // e la sentinella lo ricorda il 2 gennaio 2027
  const R = JSON.parse(leggi('data/fonti-monitorate.json'));
  const promemoria = R.scadenze.find((x) => x.id === 'partita-iva-testo-unico-2027');
  assert.strictEqual(promemoria.dal, '2027-01-02');
});

test('partita IVA: domande frequenti uguali nel testo e nei dati strutturati', () => {
  const s = leggi(PAGINA);
  const faq = s.slice(s.indexOf('>Domande frequenti</h3>'));
  const visibili = [...faq.matchAll(/<summary[^>]*>([\s\S]*?)<span/g)].map((m) => testo(m[1]).trim());
  const strutturate = C.domandeFaq(s);
  assert.ok(visibili.length >= 10);
  assert.deepStrictEqual(strutturate, visibili);
});

test('AA7/10: con la casella 1 in alto va il codice del rappresentante', () => {
  // le istruzioni: con l'inizio attività e l'attribuzione del codice fiscale
  // (casella 1) in alto su ogni pagina va il codice fiscale del rappresentante
  // del quadro C. Il compilatore copiava solo quello del soggetto: con la
  // casella 1, nascosto, la testata restava vuota (o con un codice vecchio)
  const M = caricaScript(['js/compilatore-moduli.js']).window.CompilatoreModuli;
  const aa7 = schema().modelli.AA7;
  assert.deepStrictEqual(aa7.testata.copie[0].da, ['quadroA.cfContribuente', 'quadroC.cfRappr']);
  const dati = (tipo) => ({ quadroA: { tipoDichiarazione: tipo, cfContribuente: '01234567897' }, quadroC: { cfRappr: 'VRDGLI90C55A944A' } });
  const valoreDi = (d) => (p, c) => (d[p] || {})[c];
  assert.strictEqual(M.primoValore(aa7.testata.copie[0].da, aa7, valoreDi(dati('1'))), 'VRDGLI90C55A944A');
  assert.strictEqual(M.primoValore(aa7.testata.copie[0].da, aa7, valoreDi(dati('3'))), '01234567897');
  // nell'AA9/12 il codice del contribuente c'è sempre
  const aa9 = schema().modelli.AA9;
  assert.strictEqual(M.primoValore(aa9.testata.copie[0].da, aa9, valoreDi({ quadroA: { cfContribuente: 'VRDGLI90C55A944A' } })), 'VRDGLI90C55A944A');
});

test('AA7/10: il luogo di esercizio solo se diverso dalla sede legale', () => {
  // istruzioni del quadro B: «indicare il luogo in cui viene principalmente
  // esercitata l'attività indicata se diverso dalla sede legale». Il
  // compilatore lo rendeva obbligatorio e faceva ripetere l'indirizzo della sede
  for (const id of ['eserIndirizzo', 'eserCap', 'eserComune', 'eserProvincia']) {
    assert.notStrictEqual(campo('AA7', 'quadroB3', id).required, true, id);
  }
  assert.match(campo('AA7', 'quadroB3', 'eserIndirizzo').help, /diverso dalla sede legale/);
});

test('AA9/12 e AA7/10: ogni carattere nella sua casella', async () => {
  // nei PDF dell'Agenzia questi campi hanno le caselline stampate ma non sono
  // «a pettine»: il codice attività, la data di inizio dell'AA7/10 o il codice
  // fiscale in alto alle pagine 3-5 uscivano tutti attaccati a sinistra
  const attesi = {
    'assets/pdf/modello-aa9-12-compilabile.pdf': { codice_attivita_8i2j: 6, partita_iva_richiesta_duplicato_8g9q: 11, volume_d_affari_presunto_7l7g: 11 },
    'assets/pdf/modello-aa7-10-compilabile.pdf': {
      'data_inizio_4k5m-QUADRO A': 8, 'data_inizio_4k5m-QUADRO A__2': 8, 'codice_attivita_1v0n-QUADRO B': 6,
      codice_fiscale_4z9s: 16, codice_fiscale_3m6a: 16, codice_fiscale_5i8h: 16,
      'quadri_compilati_codice_fiscale_4q7q-QUADRO I': 16, 'investimenti_effettuati_dai_costruttori_7q8x-QUADRO I': 10
    }
  };
  for (const [file, campi] of Object.entries(attesi)) {
    const modulo = (await PDFDocument.load(fs.readFileSync(path.join(__dirname, '..', file)))).getForm();
    for (const [nome, caselle] of Object.entries(campi)) {
      const f = modulo.getTextField(nome);
      assert.ok(f.isCombed(), `${file}: ${nome} non è a pettine`);
      assert.strictEqual(f.getMaxLength(), caselle, `${file}: ${nome}`);
    }
  }
  // l'opzione forfetaria degli enti del Terzo settore: dieci volte il 9
  assert.match(campo('AA7', 'quadroI', 'investimentiCostruttori').help, /9999999999/);
});

test('AA9/12 e AA7/10: le date in caselle e quelle su una riga libera', async () => {
  // la data della firma usciva «20102026» su una riga senza caselline: si
  // scrive 20/10/2026 (tipo dataEstesa), le altre date restano nel pettine da 8
  const M = caricaScript(['js/compilatore-moduli.js']).window.CompilatoreModuli;
  assert.strictEqual(M.perModello('2026-10-20', 'dataEstesa'), '20/10/2026');
  const pdf = { AA9: 'assets/pdf/modello-aa9-12-compilabile.pdf', AA7: 'assets/pdf/modello-aa7-10-compilabile.pdf' };
  for (const [m, file] of Object.entries(pdf)) {
    const modulo = (await PDFDocument.load(fs.readFileSync(path.join(__dirname, '..', file)))).getForm();
    for (const passo of schema().modelli[m].passi) {
      for (const c of passo.campi || []) {
        if (c.type !== 'data' && c.type !== 'dataEstesa') continue;
        const f = modulo.getTextField(c.pdf);
        if (c.type === 'data') assert.ok(f.isCombed() && f.getMaxLength() === 8, `${m} ${c.id}: data senza pettine da 8`);
        else assert.ok(!f.isCombed(), `${m} ${c.id}: data estesa in un pettine`);
      }
    }
    for (const id of ['dataFirma', 'delegatoNatoIl', 'delegaData']) assert.strictEqual(campo(m, 'firma', id).type, 'dataEstesa', m + ' ' + id);
  }
});

test('partita IVA: le schede ufficiali sono sorvegliate', () => {
  const R = JSON.parse(leggi('data/fonti-monitorate.json'));
  const ids = new Set(R.schede.map((x) => x.id));
  for (const id of ['partita-iva-pf-che-cos-e', 'partita-iva-pf-come-aprire', 'partita-iva-pf-come-variare', 'partita-iva-pf-chiusura-ufficio',
    'partita-iva-pf-vies', 'partita-iva-sd-che-cos-e', 'partita-iva-sd-quando-utilizzare', 'partita-iva-sd-come-variare',
    'partita-iva-sd-chiusura-ufficio', 'partita-iva-aa7-motivi-aggiornamento', 'ateco-2025-struttura']) {
    assert.ok(ids.has(id), 'manca la scheda ' + id);
  }
  // ogni scheda citata nelle fonti della pagina è nel registro
  const s = leggi(PAGINA);
  const fonti = s.slice(s.indexOf('>Fonti</h3>'));
  for (const m of fonti.matchAll(/href="(https:\/\/www\.agenziaentrate\.gov\.it\/portale\/schede\/istanze\/[^"]+)"/g)) {
    assert.ok(R.schede.some((x) => x.url === m[1]) || (R.pagine_modelli || []).some((x) => x.url === m[1]), 'non sorvegliata: ' + m[1]);
  }
});
