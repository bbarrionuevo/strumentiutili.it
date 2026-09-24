// tests/estratto-import.test.js — Lettura dell'estratto conto INPS.
//
// Il tracciato dell'XML e il layout del PDF non sono documentati, quindi il
// riconoscimento non insegue nomi di tag o coordinate ma la FORMA di un
// periodo. Questi test fissano cosa deve riconoscere e, soprattutto, cosa deve
// lasciar perdere: una riga di intestazione scambiata per un periodo produce
// numeri sbagliati senza che nessuno se ne accorga.
const test = require('node:test');
const assert = require('node:assert');
const I = require('../js/estratto-import.js');
const { ParserFinto } = require('./helpers/albero-xml.js');

// --- normalizzazione delle date --------------------------------------------

test('accetta le date nei formati che compaiono nei documenti INPS', () => {
  assert.strictEqual(I.normalizzaData('2005-01-31'), '2005-01-31');
  assert.strictEqual(I.normalizzaData('31/01/2005'), '2005-01-31');
  assert.strictEqual(I.normalizzaData('31-01-2005'), '2005-01-31');
  assert.strictEqual(I.normalizzaData('1/1/2005'), '2005-01-01', 'giorno e mese a una cifra');
  assert.strictEqual(I.normalizzaData('2005-03'), '2005-03', 'anno e mese soltanto');
});

test('scarta quello che non e una data', () => {
  for (const x of ['', '   ', null, undefined, 'gennaio', '99/99/2005 ']) {
    const r = I.normalizzaData(x);
    assert.ok(r === null || /^d{4}-d{2}/.test(r), 'ha accettato ' + JSON.stringify(x) + ' -> ' + r);
  }
});

// --- righe del PDF ----------------------------------------------------------

test('riconosce una riga di periodo con due date e le settimane', () => {
  const p = I.rigaAPeriodo('Lavoratori Dipendenti 01/01/2005 31/12/2005 52 Azienda Alfa Srl');
  assert.ok(p);
  assert.strictEqual(p.dal, '2005-01-01');
  assert.strictEqual(p.al, '2005-12-31');
  assert.strictEqual(p.settimane, 52);
  assert.strictEqual(p.gestione, 'Lavoratori Dipendenti');
});

test('una riga senza settimane resta valida', () => {
  const p = I.rigaAPeriodo('Gestione Separata 01/07/2012 31/12/2012');
  assert.ok(p);
  assert.strictEqual(p.settimane, undefined, 'le settimane si ricaveranno dalla durata');
});

test('le righe che non sono periodi vengono ignorate', () => {
  const rumore = [
    'INPS - Estratto conto contributivo',
    'COGNOME ROSSI NOME MARIO DATA NASCITA 17/11/1994',   // una data sola
    'pag. 3 di 7',
    'Totale settimane 156',
    '',
    'Note: i periodi figurativi non danno luogo a retribuzione'
  ];
  rumore.forEach((r) => assert.strictEqual(I.rigaAPeriodo(r), null, 'ha riconosciuto: ' + r));
});

test('su un foglio intero prende solo le righe buone', () => {
  const periodi = I.periodiDaRighe([
    'INPS - Estratto conto contributivo',
    'COGNOME ROSSI NOME MARIO DATA NASCITA 17/11/1994',
    'Lavoratori Dipendenti 01/01/2005 31/12/2005 52 Alfa Srl',
    'Gestione Separata 01/07/2012 31/12/2012 26',
    'Contributi figurativi 2015-01-01 2015-06-30 26 Disoccupazione',
    'pag. 3 di 7',
    'Totale settimane 104'
  ]);
  assert.strictEqual(periodi.length, 3);
  assert.deepStrictEqual(periodi.map((p) => p.dal), ['2005-01-01', '2012-07-01', '2015-01-01']);
});

test('le righe ripetute non contano due volte', () => {
  const riga = 'Lavoratori Dipendenti 01/01/2005 31/12/2005 52';
  assert.strictEqual(I.periodiDaRighe([riga, riga, riga]).length, 1);
});

test('un numero fuori scala non viene scambiato per settimane', () => {
  // 2005 e un anno, 1250 un importo: le settimane stanno fra 0 e 53.
  const p = I.rigaAPeriodo('Dipendenti 01/01/2005 31/12/2005 1250,00 euro 52');
  assert.ok(p);
  assert.strictEqual(p.settimane, 52);
});

// --- ricostruzione delle righe dal PDF --------------------------------------

test('i frammenti del PDF si ricompongono in righe, in ordine di lettura', () => {
  // pdf.js restituisce pezzi sparsi con una posizione: vanno raggruppati per
  // riga (stessa y) e ordinati da sinistra a destra.
  const items = [
    { str: '31/12/2005', transform: [1, 0, 0, 1, 300, 700] },
    { str: 'Dipendenti', transform: [1, 0, 0, 1, 50, 700] },
    { str: '01/01/2005', transform: [1, 0, 0, 1, 200, 700] },
    { str: 'Separata', transform: [1, 0, 0, 1, 50, 680] },
    { str: '01/07/2012', transform: [1, 0, 0, 1, 200, 680] }
  ];
  const righe = I.righeDaContenuto(items);
  assert.strictEqual(righe.length, 2);
  assert.strictEqual(righe[0], 'Dipendenti 01/01/2005 31/12/2005', 'prima la riga piu in alto');
  assert.ok(righe[1].startsWith('Separata'));
});

test('frammenti quasi allineati finiscono sulla stessa riga', () => {
  const items = [
    { str: 'A', transform: [1, 0, 0, 1, 10, 700] },
    { str: 'B', transform: [1, 0, 0, 1, 20, 701] }   // un punto di scarto
  ];
  assert.deepStrictEqual(I.righeDaContenuto(items), ['A B']);
});

// --- XML --------------------------------------------------------------------

test('senza DOMParser il modulo lo dice invece di fallire in silenzio', () => {
  // Node non ha DOMParser: e il caso di un browser troppo vecchio.
  const r = I.leggiXml('<e><p dataInizio="2020-01-01" dataFine="2020-12-31" settimane="52"/></e>', null);
  assert.strictEqual(r.ok, false);
  assert.ok(r.motivo.indexOf('Lettore XML non disponibile') !== -1, 'motivo: ' + r.motivo);
});

test('riconosce i periodi comunque siano scritti i tag', () => {
  // Tre forme diverse dello stesso periodo: attributi, figli foglia con date
  // italiane, e senza settimane. Il riconoscimento guarda la forma, non i nomi.
  const forme = [
    '<Estratto><Periodo dataInizio="2020-01-01" dataFine="2020-12-31" settimane="52"/></Estratto>',
    '<Estratto><Riga><Dal>01/01/2020</Dal><Al>31/12/2020</Al><Settimane>52</Settimane></Riga></Estratto>',
    '<Estratto><Riga><PeriodoDal>2020-01-01</PeriodoDal><PeriodoAl>2020-12-31</PeriodoAl></Riga></Estratto>'
  ];
  forme.forEach((xml, i) => {
    const r = I.leggiXml(xml, new ParserFinto());
    assert.strictEqual(r.ok, true, 'forma ' + i + ': ' + r.motivo);
    assert.strictEqual(r.periodi[0].dal, '2020-01-01', 'forma ' + i);
    assert.strictEqual(r.periodi[0].al, '2020-12-31', 'forma ' + i);
  });
  // Senza settimane dichiarate le ricava chi analizza, dalle date.
  assert.strictEqual(I.leggiXml(forme[2], new ParserFinto()).periodi[0].settimane, undefined);
});

test('un file senza periodi lo dice, invece di restituire zero e sembrare vuoto', () => {
  const soloAnagrafica =
    '<EstrattoConto><DatiAnagrafici><Cognome>ROSSI</Cognome>' +
    '<DataNascita><Giorno>03</Giorno><Mese>04</Mese><Anno>1985</Anno></DataNascita>' +
    '</DatiAnagrafici></EstrattoConto>';
  const r = I.leggiXml(soloAnagrafica, new ParserFinto());
  assert.strictEqual(r.ok, false);
  assert.ok(r.motivo.indexOf('a mano') !== -1, 'deve proporre l inserimento manuale: ' + r.motivo);
});

// --- il tracciato vero dell'INPS -------------------------------------------
//
// Fino a qui il riconoscimento era stato provato contro formati PLAUSIBILI,
// inventati da me. Poi e arrivato un file vero, e non ne leggeva niente: nel
// tracciato dell'INPS le date non sono un valore ma tre elementi annidati
//
//     <Dal><Giorno>16</Giorno><Mese>09</Mese><Anno>2024</Anno></Dal>
//
// e il raccoglitore di campi saltava ogni figlio che avesse figli. Zero periodi
// riconosciuti, su un file corretto. Questi test fissano la struttura reale.
// I dati personali qui sono inventati: serve la forma, non la persona.

const TRACCIATO_INPS = [
  '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
  '<EstrattoConto>',
  '  <DatiAnagrafici>',
  '    <Cognome>ROSSI</Cognome>',
  '    <Nome>MARIA</Nome>',
  '    <DataNascita><Giorno>03</Giorno><Mese>04</Mese><Anno>1985</Anno></DataNascita>',
  '    <Sesso>Femmina</Sesso>',
  '    <CodiceFiscale>RSSMRA85D43H501Z</CodiceFiscale>',
  '  </DatiAnagrafici>',
  '  <Aggiornamento>',
  '    <DataEmissioneEstratto><Giorno>24</Giorno><Mese>09</Mese><Anno>2026</Anno></DataEmissioneEstratto>',
  '    <EsitoElaborazione>Elaborazione regolare</EsitoElaborazione>',
  '  </Aggiornamento>',
  '  <RegimeGenerale>',
  '    <Contributi>',
  '      <RigaContributi>',
  '        <Dal><Giorno>16</Giorno><Mese>09</Mese><Anno>2024</Anno></Dal>',
  '        <Al><Giorno>16</Giorno><Mese>10</Mese><Anno>2024</Anno></Al>',
  '        <TipoContribuzione>Apprendista</TipoContribuzione>',
  '        <TipoContributo>Settimane</TipoContributo>',
  '        <ContributiUtiliDiritto>5</ContributiUtiliDiritto>',
  '        <ContributiUtiliCalcolo>3.0</ContributiUtiliCalcolo>',
  '        <RetribuzioneEuro>2696.0</RetribuzioneEuro>',
  '        <Azienda>',
  '          <Codice>2804115386</Codice>',
  '          <Descrizione>ALFA COSTRUZIONI S.R.L.</Descrizione>',
  '        </Azienda>',
  '      </RigaContributi>',
  '    </Contributi>',
  '    <Avvertenze>Il presente estratto conto ha carattere provvisorio ed informativo. Non ha valore certificativo.</Avvertenze>',
  '  </RegimeGenerale>',
  '</EstrattoConto>'
].join(' ');

const letto = () => I.leggiXml(TRACCIATO_INPS, new ParserFinto());

test('legge il tracciato vero, con le date spezzate in giorno, mese e anno', () => {
  const r = letto();
  assert.strictEqual(r.ok, true, 'motivo: ' + r.motivo);
  assert.strictEqual(r.periodi.length, 1);
  assert.strictEqual(r.periodi[0].dal, '2024-09-16');
  assert.strictEqual(r.periodi[0].al, '2024-10-16');
});

test('le settimane vengono da ContributiUtiliDiritto, non da Calcolo', () => {
  // Diritto conta per RAGGIUNGERE il requisito, Calcolo per determinare
  // l'importo: sono numeri diversi e qui serve il primo. Nel file di prova
  // valgono 5 e 3 proprio per accorgersi se si prende quello sbagliato.
  assert.strictEqual(letto().periodi[0].settimane, 5);
});

test('la gestione si ricava dall elemento che contiene il periodo', () => {
  // Nel tracciato la gestione non e un campo: e il contenitore, RegimeGenerale.
  assert.strictEqual(letto().periodi[0].gestione, 'Regime Generale');
});

test('riporta tipo di contribuzione e datore di lavoro', () => {
  const p = letto().periodi[0];
  assert.strictEqual(p.tipo, 'Apprendista');
  assert.strictEqual(p.datore, 'ALFA COSTRUZIONI S.R.L.',
    'il datore e quello che permette di riconoscere il periodo guardando la tabella');
});

test('dell anagrafica legge il sesso e nient altro', () => {
  // Il sesso cambia il requisito della pensione anticipata, quindi serve.
  // Nome, cognome e codice fiscale no: quello che non si legge non si puo
  // mostrare o registrare per sbaglio.
  const r = letto();
  assert.strictEqual(r.anagrafica.sesso, 'F');
  const serializzato = JSON.stringify(r);
  for (const dato of ['ROSSI', 'MARIA', 'RSSMRA85D43H501Z']) {
    assert.ok(serializzato.indexOf(dato) === -1, 'il risultato contiene ' + dato);
  }
});

test('riporta le avvertenze dell INPS invece di riscriverle', () => {
  const r = letto();
  assert.strictEqual(r.avvertenze.length, 1);
  assert.ok(r.avvertenze[0].indexOf('Non ha valore certificativo') !== -1);
});

test('anagrafica e data di emissione non diventano periodi', () => {
  // Hanno anche loro giorno, mese e anno: se si riconoscessero come periodi,
  // l anzianita contributiva conterebbe la data di nascita.
  assert.strictEqual(letto().periodi.length, 1);
});

test('i contributi espressi in giorni non si spacciano per settimane', () => {
  // Per gli operai agricoli i contributi sono in giornate e una settimana non
  // sono sette giornate: convertire a occhio falserebbe l anzianita. Si dichiara
  // l unita e si lasciano ricavare le settimane dalle date.
  const giorni = TRACCIATO_INPS
    .replace('<TipoContributo>Settimane</TipoContributo>', '<TipoContributo>Giorni</TipoContributo>');
  const p = I.leggiXml(giorni, new ParserFinto()).periodi[0];
  assert.strictEqual(p.settimane, undefined);
  assert.strictEqual(p.unita, 'Giorni');
  assert.strictEqual(p.dichiarato, 5);
});

test('i contributi espressi in mesi si convertono, dichiarandolo', () => {
  const mesi = TRACCIATO_INPS
    .replace('<TipoContributo>Settimane</TipoContributo>', '<TipoContributo>Mesi</TipoContributo>')
    .replace('<ContributiUtiliDiritto>5</ContributiUtiliDiritto>', '<ContributiUtiliDiritto>12</ContributiUtiliDiritto>');
  const p = I.leggiXml(mesi, new ParserFinto()).periodi[0];
  assert.strictEqual(p.settimane, 52, '12 mesi sono 52 settimane');
  assert.strictEqual(p.unita, 'Mesi');
});

test('una data composta impossibile viene scartata', () => {
  // 31/02 e 16/13 hanno la forma giusta. Senza controllo new Date le farebbe
  // slittare al mese dopo, in silenzio.
  const rotto = TRACCIATO_INPS
    .replace('<Mese>09</Mese><Anno>2024</Anno></Dal>', '<Mese>13</Mese><Anno>2024</Anno></Dal>');
  const r = I.leggiXml(rotto, new ParserFinto());
  assert.strictEqual(r.periodi.length, 0, 'ha accettato il mese 13');
});

test('un XML malformato viene rifiutato dicendolo', () => {
  const r = I.leggiXml('<EstrattoConto><RegimeGenerale></EstrattoConto>', new ParserFinto());
  assert.strictEqual(r.ok, false);
  assert.ok(r.motivo.indexOf('XML') !== -1, 'motivo: ' + r.motivo);
});

// --- il PDF vero: la pagina e ruotata ---------------------------------------
//
// L'estratto conto in PDF e stampato su una pagina con page.rotate === 90.
// Nelle coordinate grezze le celle di una riga condividono la X e cambiano la Y:
// raggruppando per Y si ottengono le COLONNE, una per riga, e da un PDF valido
// non si riconosceva nessun periodo. Il rimedio e passare per la matrice della
// vista, che tiene conto della rotazione. Qui si simula quella pagina.

// La stessa formula di pdfjsLib.Util.transform.
function moltiplica(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

// `matriceVista`: quella che pdf.js costruisce per la rotazione della pagina.
// Con [0,1,1,0,0,0] gli assi si scambiano, come in una pagina ruotata di 90.
function pdfFinto(pezziPerPagina, matriceVista) {
  return {
    Util: { transform: moltiplica },
    getDocument() {
      return {
        promise: Promise.resolve({
          numPages: pezziPerPagina.length,
          getPage(n) {
            return Promise.resolve({
              getViewport: () => ({ transform: matriceVista, width: 842, height: 595 }),
              getTextContent: () => Promise.resolve({
                items: pezziPerPagina[n - 1].map((p) => ({
                  str: p[0],
                  transform: [1, 0, 0, 1, p[1], p[2]]    // x, y grezze
                }))
              })
            });
          }
        })
      };
    }
  };
}

// Una riga dell'estratto vero, con le coordinate come le restituisce pdf.js:
// stessa X per tutte le celle, Y crescente lungo la riga.
const RIGA_RUOTATA = [
  ['16/09/2024', 279.4, 56.1],
  ['16/10/2024', 279.4, 112.2],
  ['Apprendista', 279.4, 180.0],
  ['sett.', 279.4, 338.8],
  ['5', 279.4, 394.5],
  ['5,000', 279.4, 435.1],
  ['2.696,00', 279.4, 496.1],
  ['S.R.L. TECHNICAL WORK S.R.L.', 279.4, 560.0],
  // riga di intestazione, piu in alto nella pagina ruotata
  ['Dal', 262.0, 56.1],
  ['Al', 262.0, 112.2],
  ['al diritto e al calcolo', 262.0, 338.8]
];

test('legge una pagina ruotata di 90 gradi, come quella dell INPS', async () => {
  const r = await I.leggiPdf(new Uint8Array(0), pdfFinto([RIGA_RUOTATA], [0, 1, 1, 0, 0, 0]));
  assert.strictEqual(r.ok, true, 'motivo: ' + r.motivo);
  assert.strictEqual(r.periodi.length, 1);
  assert.strictEqual(r.periodi[0].dal, '2024-09-16');
  assert.strictEqual(r.periodi[0].al, '2024-10-16');
  assert.strictEqual(r.periodi[0].settimane, 5);
});

test('senza la matrice della vista la stessa pagina non si legge', () => {
  // Non e un requisito: e la prova che il test qui sopra verifica davvero il
  // rimedio. Raggruppando per Y grezza ogni cella diventa una riga a se, e
  // nessuna riga ha due date.
  const righe = I.righeDaContenuto(RIGA_RUOTATA.map((p) => ({
    str: p[0], transform: [1, 0, 0, 1, p[1], p[2]]
  })));
  assert.strictEqual(I.periodiDaRighe(righe).length, 0,
    'senza rotazione non si dovrebbe riconoscere niente: il test non sta provando il rimedio');
});

test('una pagina non ruotata continua a funzionare', async () => {
  // Matrice della vista di una pagina normale: ribalta solo la Y.
  const dritta = [
    ['Lavoratori Dipendenti', 50, 700],
    ['01/01/2005', 200, 700],
    ['31/12/2005', 300, 700],
    ['52', 400, 700]
  ];
  const r = await I.leggiPdf(new Uint8Array(0), pdfFinto([dritta], [1, 0, 0, -1, 0, 842]));
  assert.strictEqual(r.ok, true, 'motivo: ' + r.motivo);
  assert.strictEqual(r.periodi[0].dal, '2005-01-01');
  assert.strictEqual(r.periodi[0].settimane, 52);
});

test('dalla riga del PDF ricava anche il tipo e il datore', () => {
  // Sono le due colonne che permettono di riconoscere un periodo guardando la
  // tabella di verifica. Nessun conteggio dipende da loro.
  const p = I.rigaAPeriodo('16/09/2024 16/10/2024 Apprendista sett. 5 5,000 2.696,00 S.R.L. TECHNICAL WORK S.R.L.');
  assert.ok(p);
  assert.strictEqual(p.settimane, 5);
  assert.strictEqual(p.tipo, 'Apprendista', 'il "sett." non fa parte del tipo');
  assert.strictEqual(p.datore, 'S.R.L. TECHNICAL WORK S.R.L.');
});

test('le righe di intestazione del PDF non diventano periodi', () => {
  const rumore = [
    'Estratto Conto Previdenziale Regime generale',
    'Emesso il 24/09/2026 Codice fiscale RSSMRA85D43H501Z',
    'Dal Al al diritto e al calcolo Euro',
    'Periodo Contributi utili pensione Retribuzione o',
    'Pagina 1 di 1'
  ];
  assert.deepStrictEqual(I.periodiDaRighe(rumore), []);
});
