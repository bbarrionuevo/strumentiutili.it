// tests/richiesta-codice-fiscale.test.js — La pagina del modello AA4/8,
// riscritta sulle istruzioni del modello, sulle schede dell'Agenzia (codice
// fiscale, tessera sanitaria, tesserino, FAQ, riemissione, neonato) e su
// Normattiva (ottobre 2026). Ogni test ferma un errore della versione
// precedente o del compilatore.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./helpers/contenuti.js');
const { caricaScript } = require('./helpers/carica-script.js');

const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PAGINA = 'identita-burocrazia/richiesta-codice-fiscale/index.html';
const SCHEMA = 'data/modello-aa4-8-schema.json';
const passi = () => JSON.parse(leggi(SCHEMA)).modelli.AA48.passi;
const campo = (passo, id) => passi().find((p) => p.id === passo).campi.find((c) => c.id === id);

test('AA4/8: la guida ha le sezioni e il modello compilato', () => {
  const s = leggi(PAGINA);
  for (const id of ['quando-serve', 'come-si-presenta', 'tipologia', 'campo-per-campo', 'esempi', 'codice', 'dopo', 'dal-2027']) {
    assert.ok(s.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(s, /src="\/assets\/esempi\/aa4-8-duplicato-tessera\.webp" width="1100" height="\d+"/);
});

test('AA4/8: nel modello va il codice attribuito, non quello calcolato', () => {
  const s = leggi(PAGINA);
  const t = C.testoVisibile(s);
  // prima la barra laterale diceva: «Serve per i quadri 2, 3, 4 e 5 del
  // modello. Calcolalo lì e te lo ritrovi qui già pronto», e sotto il
  // compilatore c'era «Calcola prima il codice fiscale». Sono caselle, non
  // quadri, e il generatore riporta solo i dati anagrafici del Quadro B
  assert.doesNotMatch(t, /quadri 2, 3, 4 e 5/);
  assert.doesNotMatch(s, /ritrov[ai] (?:qui )?gi(?:à|&agrave;) pront/);
  assert.doesNotMatch(t, /Calcola prima il codice fiscale/);
  assert.match(t, /Nelle caselle 2, 3, 4 e 5 va il codice già attribuito, quello della tessera: un codice calcolato\s+non vale/);
  // le due avvertenze dell'Agenzia, scheda «Che cos'è» e FAQ
  assert.match(t, /«l’unico codice fiscale valido è quello rilasciato dall’Agenzia delle Entrate e mai quello generato mediante software e procedure non gestite dall’Agenzia»/);
  assert.match(t, /«calcolati con applicazioni pubblicate su siti web non hanno alcun valore e il loro utilizzo può comportare problemi ai cittadini»/);
  // il ponte dal generatore riempie solo il Quadro B, senza codici fiscali
  const ponte = s.slice(s.indexOf('PONTE: dal generatore'), s.indexOf('</script>', s.indexOf('PONTE: dal generatore')));
  const chiavi = [...ponte.matchAll(/'anagrafica\.(\w+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(chiavi.sort(), ['cognome', 'comuneNascita', 'dataNascita', 'nome', 'provinciaNascita', 'sesso']);
});

test('AA4/8: PEC, sportello con appuntamento e stranieri di persona', () => {
  const t = C.testoVisibile(leggi(PAGINA));
  // prima: «Il modello si presenta a un qualunque ufficio» e, per i canali
  // telematici, «verifica sulla pagina ufficiale quale sia la via più rapida»
  assert.doesNotMatch(t, /quale sia la via più rapida/);
  assert.match(t, /Via PEC a un ufficio dell'Agenzia: il modello firmato e la copia di un documento d'identità, che non serve se firmi digitalmente/);
  assert.match(t, /PEC a un ufficio dell’Agenzia\s+Il modello compilato e firmato, con la copia di un documento d’identità; se lo firmi digitalmente il documento non serve/);
  // scheda «Il codice fiscale - Che cos'è»: primo codice ai cittadini
  // stranieri, UE o extra UE, solo con appuntamento in presenza
  assert.match(t, /per il primo codice di un cittadino straniero, dell’Unione europea o no, la presenza allo sportello è obbligatoria/);
  assert.match(t, /il passaporto valido con il visto, quando è richiesto/);
  // la tessera in scadenza non si chiede; la prima tessera solo alla ASL
  assert.match(t, /il duplicato di una tessera in scadenza non va chiesto/);
  assert.match(t, /la prima emissione si chiede solo alla ASL/);
});

test('AA4/8: niente gratuità e tessera europea senza fonte', () => {
  const t = C.testoVisibile(leggi(PAGINA));
  // prima: «Nulla. L'attribuzione del codice fiscale, il duplicato ... e il
  // certificato ... sono gratuiti», senza una scheda che lo dicesse; la scheda
  // sulla tessera dice che la tessera «è gratuita»
  assert.doesNotMatch(t, /sono gratuiti/);
  assert.match(t, /quella sulla tessera sanitaria dice che la tessera «è gratuita»/);
  // prima: «la tessera porta sul retro anche la Tessera Europea di
  // Assicurazione Malattia»; la scheda dice che permette di ottenere servizi
  // sanitari anche nei Paesi dell'Unione europea
  assert.doesNotMatch(t, /Tessera Europea di Assicurazione Malattia/);
  assert.match(t, /vale anche per i servizi sanitari nei Paesi dell’Unione europea/);
  // prima: «Se il documento d'identità da allegare è scaduto, parti da qui»
  assert.doesNotMatch(t, /scaduto, parti da qui/);
});

test('AA4/8: la tabella dei codici tipologia è quella del compilatore', () => {
  const s = leggi(PAGINA);
  const tabella = s.slice(s.indexOf('id="tipologia"'), s.indexOf('id="campo-per-campo"'));
  const righe = [...tabella.matchAll(/<td[^>]*>([DT])<\/td><td[^>]*>(\d\d)<\/td>/g)].map((m) => m[1] + m[2]);
  const D = campo('richiesta', 'codiceTipologiaD').options.map((o) => 'D' + o.value);
  const T = campo('richiesta', 'codiceTipologiaT').options.map((o) => 'T' + o.value);
  assert.deepStrictEqual(righe, D.concat(T));
});

test('AA4/8: dal 2027 le norme citate dalle istruzioni cambiano posto', () => {
  const s = leggi(PAGINA);
  const t = C.testoVisibile(s);
  // D.Lgs. 141/2026: abroga dal 1/1/2027 l'art. 6 del D.P.R. 605/1973 e gli
  // artt. 58 e 59 del D.P.R. 600/1973; l'art. 6 del testo unico riprende il 6
  assert.match(t, /dal 1° gennaio 2027 sono abrogati dal D\.Lgs\. 5 agosto 2026, n\. 141/);
  assert.match(t, /art\. 6 del D\.P\.R\. 605\/1973\s*, nel codice tipologia 17, e gli artt\. 58 e 59 del D\.P\.R\. 600\/1973/);
  assert.match(s, /decreto\.legislativo:2026-08-05;141:1~art6"/);
  assert.match(t, /almeno dieci giorni prima della scadenza/);
});

test('AA4/8: i codici fiscali del modello non si salvano nel browser', () => {
  // la scheda «I tuoi dati» lo promette: vale se ogni campo con un codice
  // fiscale ha un nome che js/storage-helper.js riconosce come sensibile
  const AppStorage = caricaScript(['js/storage-helper.js']).window.AppStorage;
  const cf = [];
  for (const p of passi()) {
    for (const c of p.campi || []) if (/^cf/.test(c.type)) cf.push(`AA48.${p.id}.${c.id}`);
  }
  assert.ok(cf.length >= 8, cf.join(' '));
  for (const k of cf) assert.ok(AppStorage.campoSensibile(k), k + ' verrebbe salvato');
  assert.match(C.testoVisibile(leggi(PAGINA)), /I codici fiscali che scrivi non vengono salvati nemmeno nel browser/);
});

test('AA4/8: con l\'attribuzione il compilatore non chiede un codice che non esiste', () => {
  // istruzioni: con la casella 1 e il codice 13 si barra anche la casella 3,
  // «indicando la data del decesso». Il compilatore chiedeva comunque il codice
  // fiscale del defunto, che in questo caso non esiste ancora
  const M = caricaScript(['js/compilatore-moduli.js']).window.CompilatoreModuli;
  const cfDecesso = campo('richiesta', 'cfDecesso');
  const dataDecesso = campo('richiesta', 'dataDecesso');
  const valori = (o) => (id) => o[id];
  assert.strictEqual(M.obbligatorioCon(cfDecesso, valori({ decesso: true })), true);
  const erede = { tipologia: 'T', codiceTipologiaT: '13', attribuzione: true, decesso: true };
  assert.strictEqual(M.obbligatorioCon(cfDecesso, valori(erede)), false);
  assert.strictEqual(M.obbligatorioCon(dataDecesso, valori(erede)), true);
  // un codice 13 rimasto in memoria dopo il passaggio alla richiesta diretta non conta
  assert.strictEqual(M.obbligatorioCon(cfDecesso, valori(Object.assign({}, erede, { tipologia: 'D' }))), true);
  // senza la casella 3 il campo non si vede e non e' obbligatorio
  assert.strictEqual(M.obbligatorioCon(cfDecesso, valori({ tipologia: 'T', codiceTipologiaT: '13', attribuzione: true })), false);
  // il certificato chiesto insieme all'attribuzione (caselle 1 e 4, ammesso
  // dalle istruzioni): il codice non esiste ancora. Con la variazione (2 e 4) si'
  const cfCertificato = campo('richiesta', 'cfCertificato');
  assert.strictEqual(M.obbligatorioCon(cfCertificato, valori({ certificato: true })), true);
  assert.strictEqual(M.obbligatorioCon(cfCertificato, valori({ certificato: true, attribuzione: true })), false);
  assert.strictEqual(M.obbligatorioCon(cfCertificato, valori({ certificato: true, variazione: true })), true);
});

test('AA4/8: lo schema rimanda al codice attribuito e ai servizi online', () => {
  const R = JSON.parse(leggi(SCHEMA));
  assert.strictEqual(R.versione, '2026-10');
  for (const id of ['cfVariazione', 'cfCertificato', 'cfDuplicato']) {
    assert.match(campo('richiesta', id).help, /già attribuito dall'Agenzia.*un codice calcolato non vale/, id);
  }
  assert.match(campo('richiesta', 'duplicato').help, /Con SPID, CIE o CNS la nuova tessera o il nuovo tesserino si chiedono online/);
  assert.match(campo('richiesta', 'attribuzione').help, /primo codice fiscale di un cittadino straniero si va di persona/);
  const firma = passi().find((p) => p.id === 'sottoscrizione');
  assert.match(firma.descrizione, /Via PEC .* che non serve se lo firmi digitalmente/);
});

test('AA4/8: le schede citate fra le fonti sono sotto controllo', () => {
  // ogni scheda dell'Agenzia da cui vengono regole della pagina ha la sua voce
  // in data/fonti-monitorate.json, con frasi lette nella pagina ufficiale
  const R = JSON.parse(leggi('data/fonti-monitorate.json'));
  const seguite = new Map(R.schede.map((s) => [s.url, s]));
  const schede = [
    'codice-fiscale-e-tessera-sanitaria/che-cos-',
    'codice-fiscale-e-tessera-sanitaria/la-tessera-sanitaria-che-cos-e-e-come-si-ottiene',
    'codice-fiscale-e-tessera-sanitaria/il-tesserino-del-codice-fiscale-che-cos-e-e-come-si-ottiene',
    'codice-fiscale-e-tessera-sanitaria/risposte-alle-domande-piu-frequenti',
    'richiesta-del-duplicato-della-tessera-sanitaria',
    'richiesta-del-duplicato-del-tesserino-del-codice-fiscale',
    'richiesta-del-codice-fiscale-del-neonato-da-parte-dei-genitori',
  ].map((p) => 'https://www.agenziaentrate.gov.it/portale/' + p);
  const s = leggi(PAGINA);
  for (const url of schede) {
    assert.ok(s.includes('href="' + url + '"'), 'la pagina non cita ' + url);
    const voce = seguite.get(url);
    assert.ok(voce && voce.deve_contenere.length > 0, 'senza controllo: ' + url);
    assert.ok(voce.pagine.includes('identita-burocrazia/richiesta-codice-fiscale/'), url);
  }
  assert.ok(R.scadenze.some((x) => x.id === 'aa4-8-testo-unico-2027' && x.dal === '2027-01-02'));
});
