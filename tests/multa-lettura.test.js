// tests/multa-lettura.test.js — Che cosa riconosce su un verbale, e soprattutto
// che cosa deve rifiutarsi di riconoscere.
//
// I test che contano davvero qui sono quelli negativi. Un estrattore che trova
// qualcosa in piu' non fa un errore visibile: riempie un campo con un valore
// plausibile e sbagliato, e da li' esce una data di scadenza sbagliata di cui
// nessuno sospetta. I due casi peggiori hanno un test ciascuno:
//
//   - il retro del verbale cita gli artt. 201, 202, 203 e 204-bis nelle proprie
//     istruzioni: nessuno di questi e' l'articolo violato;
//   - un verbale stampa quattro o cinque importi diversi, e prenderne uno a caso
//     porta l'utente a pagare la cifra sbagliata.
const test = require('node:test');
const assert = require('node:assert');

const L = require('../js/multa-lettura.js');

// Il testo che sta sul retro di qualunque verbale italiano. Nessuna di queste
// righe descrive la violazione: spiegano la procedura.
const RETRO_DEL_VERBALE = [
  'Ai sensi dell’art. 202 del Codice della Strada è ammesso il pagamento in misura ridotta',
  'entro 60 giorni dalla contestazione o dalla notificazione.',
  'Ai sensi dell’art. 203 CdS può essere proposto ricorso al Prefetto entro 60 giorni.',
  'Ai sensi dell’art. 204-bis CdS è ammesso ricorso al Giudice di Pace entro 30 giorni.',
  'La notificazione è effettuata nei termini dell’art. 201 CdS.',
  'In caso di mancato pagamento si applica l’art. 206 CdS, titolo esecutivo.'
];

const VERBALE = [
  'COMANDO POLIZIA LOCALE DI ESEMPIO',
  'Verbale n. 2026/00123456 del 05/04/2026',
  'Data della violazione 03/04/2026 ore 15:42',
  'Luogo Via Roma altezza civico 12',
  'Violazione art. 142 comma 8 CdS - superamento dei limiti di velocità',
  'Sanzione pecuniaria entro 60 giorni € 173,00',
  'Pagamento in misura ridotta del 30% entro 5 giorni € 121,10',
  'Spese di notifica € 17,20',
  'Importo massimo edittale € 694,00',
  'Decurtazione punti 3',
  'Data di notifica 12/06/2026'
].concat(RETRO_DEL_VERBALE);

const campi = (righe) => L.campiDaRighe(righe).campi;

// --- quello che deve trovare ------------------------------------------------

test('trova la data della violazione con la sua etichetta', () => {
  const c = campi(VERBALE);
  assert.strictEqual(c.dataViolazione.stato, 'trovato');
  assert.strictEqual(c.dataViolazione.candidati[0].valore, '2026-04-03');
});

test('trova la data di notifica quando c e', () => {
  const c = campi(VERBALE);
  assert.strictEqual(c.dataNotifica.stato, 'trovato');
  assert.strictEqual(c.dataNotifica.candidati[0].valore, '2026-06-12');
});

test('prende il valore dalla riga successiva quando l etichetta sta da sola', () => {
  // Nelle impaginazioni a due colonne il valore finisce sotto l etichetta.
  const c = campi(['Data della violazione', '03/04/2026']);
  assert.strictEqual(c.dataViolazione.candidati.length, 1);
  assert.strictEqual(c.dataViolazione.candidati[0].valore, '2026-04-03');
  assert.strictEqual(c.dataViolazione.candidati[0].fiducia, 'media',
    'trovata a una riga di distanza: vale meno di una trovata sulla stessa riga');
});

test('trova l articolo violato e non quelli della procedura', () => {
  const c = campi(VERBALE);
  const valori = c.articoli.candidati.map((a) => a.valore);
  assert.ok(valori.indexOf('142') !== -1, 'deve trovare il 142: ' + valori.join(', '));
});

test('trova i punti e il numero del verbale', () => {
  const c = campi(VERBALE);
  assert.strictEqual(c.punti.candidati[0].valore, 3);
  assert.strictEqual(c.verbale.candidati[0].valore, '2026/00123456');
});

test('riconosce che non ci sono punti da decurtare', () => {
  const c = campi(['Nessuna decurtazione di punti']);
  assert.strictEqual(c.punti.candidati[0].valore, 0);
});

// --- quello che deve RIFIUTARE ---------------------------------------------

test('il retro del verbale non produce nessun articolo violato', () => {
  // Il test negativo piu importante del file. Quelle righe citano gli artt.
  // 201, 202, 203, 204-bis e 206 per spiegare la procedura: annunciare
  // all utente che ha violato l art. 203 sarebbe un errore credibilissimo.
  const c = campi(RETRO_DEL_VERBALE);
  assert.deepStrictEqual(c.articoli.candidati.map((a) => a.valore), [],
    'ha scambiato le istruzioni per la contestazione');
  assert.strictEqual(c.articoli.stato, 'assente');
});

test('gli articoli della procedura spariscono anche dal verbale completo', () => {
  const c = campi(VERBALE);
  const valori = c.articoli.candidati.map((a) => a.valore);
  for (const procedurale of ['201', '202', '203', '204-bis', '206']) {
    assert.ok(valori.indexOf(procedurale) === -1,
      'ha preso per violato l articolo procedurale ' + procedurale + ': ' + valori.join(', '));
  }
});

test('i quattro importi restano quattro candidati classificati', () => {
  // Non si sceglie: si classifica e si mostra. Applicare il 30% alla cifra
  // gia scontata, o alle spese, fa pagare meno del dovuto e la multa resta
  // aperta.
  const c = campi(VERBALE);
  const perTipo = {};
  c.importi.forEach((i) => { perTipo[i.tipo] = i.valore; });

  assert.strictEqual(perTipo.sanzione, 173);
  assert.strictEqual(perTipo.ridotto5, 121.1);
  assert.strictEqual(perTipo.spese, 17.2);
  assert.strictEqual(perTipo.massimo, 694);
  assert.strictEqual(c.importi.length, 4, 'nessun importo inventato o perso');
});

test('un importo senza etichetta resta senza tipo invece di indovinarlo', () => {
  const c = campi(['Importo da pagare € 190,20', 'Qualcosa € 12,00']);
  const senzaTipo = c.importi.filter((i) => i.tipo === null);
  assert.strictEqual(senzaTipo.length, 1, 'solo il secondo e senza etichetta');
  assert.strictEqual(senzaTipo[0].valore, 12);
  assert.strictEqual(senzaTipo[0].fiducia, 'nessuna');
});

test('un "Totale" generico non viene classificato', () => {
  // "Totale" da solo non dice totale DI COSA: potrebbe comprendere le spese o
  // no. Attribuirgli un tipo vorrebbe dire scegliere al posto dell utente su
  // quale cifra applicare lo sconto.
  const c = campi(['Totale € 190,20']);
  assert.strictEqual(c.importi.length, 1);
  assert.strictEqual(c.importi[0].tipo, null);
});

test('una data senza etichetta non diventa la data della violazione', () => {
  // Su un verbale compaiono la data di nascita, quella di emissione, quella di
  // stampa. Prenderne una a caso sposterebbe ogni scadenza di anni.
  const c = campi([
    'ROSSI MARIO nato il 17/11/1994',
    'Stampato il 05/04/2026',
    'Scadenza documento 01/01/2030'
  ]);
  assert.strictEqual(c.dataViolazione.stato, 'assente');
  assert.strictEqual(c.dataNotifica.stato, 'assente');
  assert.strictEqual(c.altreDate.length, 3, 'le date ci sono, ma dichiarate come non attribuite');
  assert.ok(c.altreDate.every((d) => d.fiducia === 'nessuna'));
});

test('quando manca la data di notifica dice dove cercarla', () => {
  const c = campi(['Data della violazione 03/04/2026']);
  assert.strictEqual(c.dataNotifica.stato, 'assente');
  assert.match(c.dataNotifica.perche, /cartolina|busta|raccomandata/i);
});

test('un numero fuori scala non diventa un punteggio', () => {
  const c = campi(['Importo 173,00 euro', 'Prot. 2026 del registro']);
  assert.deepStrictEqual(c.punti.candidati, []);
});

test('due date etichettate allo stesso modo diventano un caso ambiguo', () => {
  // Non si sceglie la prima: si chiede.
  const c = campi([
    'Data della violazione 03/04/2026',
    'Data della violazione 04/04/2026'
  ]);
  assert.strictEqual(c.dataViolazione.stato, 'ambiguo');
  assert.strictEqual(c.dataViolazione.candidati.length, 2);
});

test('una data impossibile viene scartata, non corretta', () => {
  const c = campi(['Data della violazione 31/02/2026']);
  assert.strictEqual(c.dataViolazione.stato, 'assente');
});

// --- numeri all italiana ----------------------------------------------------

test('legge gli importi nel formato italiano', () => {
  assert.strictEqual(L.numeroIt('173,00'), 173);
  assert.strictEqual(L.numeroIt('1.234,56'), 1234.56);
  assert.strictEqual(L.numeroIt('12.345.678,90'), 12345678.9);
  assert.strictEqual(L.numeroIt('non un numero'), null);
});

// --- le due strade d ingresso ----------------------------------------------

test('le parole dell OCR danno lo stesso risultato dei frammenti del PDF', () => {
  // La ragione per cui esiste itemsDaParole: una foto e un PDF devono passare
  // per lo stesso lettore di righe, non per due parser da mantenere separati.
  const parole = [
    { text: 'Data', x0: 10, y0: 100 },
    { text: 'della', x0: 40, y0: 100 },
    { text: 'violazione', x0: 80, y0: 100 },
    { text: '03/04/2026', x0: 160, y0: 100 },
    { text: 'Violazione', x0: 10, y0: 130 },
    { text: 'art.', x0: 70, y0: 130 },
    { text: '142', x0: 95, y0: 130 },
    { text: 'CdS', x0: 120, y0: 130 }
  ];
  const r = L.leggiParole(parole);
  assert.strictEqual(r.ok, true, r.motivo);
  assert.strictEqual(r.campi.dataViolazione.candidati[0].valore, '2026-04-03');
  assert.ok(r.campi.articoli.candidati.some((a) => a.valore === '142'));
});

test('un documento senza testo chiede l OCR invece di dire che e vuoto', () => {
  // Molti comuni mandano il verbale scansionato: senza questa distinzione lo
  // strumento direbbe "non ho trovato niente" su un file perfettamente valido.
  const r = L.leggiTesto('   \n  \n ');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.serveOcr, true);
  assert.match(r.motivo, /scansione|foto|ottico/i);
});

test('un testo normale non chiede l OCR', () => {
  const r = L.leggiTesto(VERBALE.join('\n'));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.serveOcr, false);
  assert.ok(r.righeLette > 10);
});

// --- piu pagine -------------------------------------------------------------

const O = require('../js/ocr-testo.js');
const R = require('../js/pdf-righe.js');

test('le pagine dell OCR non si mescolano fra loro', () => {
  // Ogni pagina ha coordinate che ripartono da zero. Unite cosi come sono,
  // l ultima riga di pagina 1 e la prima di pagina 2 hanno la stessa y e
  // finiscono sulla stessa riga: nascerebbero righe che non esistono in nessun
  // documento, e un estrattore che cerca "due date sulla stessa riga" le
  // troverebbe dove non ci sono.
  const pagina1 = [{ text: 'Data', x0: 10, y0: 50 }, { text: 'violazione', x0: 40, y0: 50 }];
  const pagina2 = [{ text: 'Spese', x0: 10, y0: 50 }, { text: 'notifica', x0: 40, y0: 50 }];

  const unite = O.unisciPagine([pagina1, pagina2]);
  const righe = R.righeDaContenuto(R.itemsDaParole(unite));
  assert.strictEqual(righe.length, 2, 'due pagine, due righe: ' + JSON.stringify(righe));

  // Contro-prova: senza lo scostamento diventano una riga sola.
  const senza = R.righeDaContenuto(R.itemsDaParole(pagina1.concat(pagina2)));
  assert.strictEqual(senza.length, 1,
    'se anche senza scostamento restassero due righe, il test sopra non proverebbe niente');
});

test('la confidenza media dice quanto fidarsi della lettura', () => {
  assert.strictEqual(O.confidenzaMedia([{ confidence: 90 }, { confidence: 70 }]), 80);
  assert.strictEqual(O.confidenzaMedia([]), 0);
  assert.strictEqual(O.confidenzaMedia(null), 0);
});

test('le parole suggerite al motore OCR sono quelle di un verbale', () => {
  // Il worker le usa per scegliere fra le due passate di riconoscimento: sono
  // un guadagno di precisione che non costa niente.
  assert.ok(O.PAROLE_VERBALE.indexOf('verbale') !== -1);
  assert.ok(O.PAROLE_VERBALE.indexOf('misura ridotta') !== -1);
});

test('input assurdo non fa esplodere niente', () => {
  for (const input of [[], null, undefined, ['']]) {
    const r = L.campiDaRighe(input);
    assert.strictEqual(r.campi.dataViolazione.stato, 'assente');
    assert.deepStrictEqual(r.campi.importi, []);
  }
});
