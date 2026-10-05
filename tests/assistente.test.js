// tests/assistente.test.js — La ricerca del sito capisce le frasi (js/assistente.js).
//
// Le domande vengono da Search Console: sono ricerche vere con cui Google ha
// mostrato il sito fra agosto e ottobre 2026. Con la vecchia ricerca (tutte le
// parole uguali nel titolo o nella descrizione) il 58% non trovava niente,
// anche «f24 elide compilabile» (95 impressioni). Ogni domanda deve portare
// allo strumento giusto come primo risultato.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../js/assistente.js');

const RADICE = path.join(__dirname, '..');
const leggi = (f) => JSON.parse(fs.readFileSync(path.join(RADICE, f), 'utf8'));
const motore = A.prepara(leggi('data/strumenti.json').strumenti, leggi('data/sinonimi.json'));
const primo = (q) => (A.cerca(motore, q, 5)[0] || {}).percorso || null;

test('normalizza: accenti, apostrofi, punteggiatura e parole attaccate ai numeri', () => {
  assert.deepStrictEqual(A.parole('Com\'è il bollo dell\'auto?'), ['bollo', 'auto']);
  assert.deepStrictEqual(A.parole('f24elide editabile'), ['f24', 'elide', 'editabile']);
  assert.deepStrictEqual(A.parole('mod. AA7/10 online'), ['modello', 'aa7', '10']);
  assert.strictEqual(A.radice('dimissioni'), A.radice('dimissione'));
  assert.strictEqual(A.radice('editabili'), A.radice('editabile'));
  assert.strictEqual(A.radice('f24'), 'f24');
});

const DOMANDE = [
  // ricerche vere da Search Console
  ['f24 elide compilabile', '/cittadino-tasse/f24-editabile/f24-elide/'],
  ['f24elide editabile', '/cittadino-tasse/f24-editabile/f24-elide/'],
  ['modello f24 versamenti con elementi identificativi editabile', '/cittadino-tasse/f24-editabile/f24-elide/'],
  ['mod f24 con elementi identificativi editabile', '/cittadino-tasse/f24-editabile/f24-elide/'],
  ['f24 identificativo editabile', '/cittadino-tasse/f24-editabile/f24-elide/'],
  ['modello f23 editabile 2026', '/cittadino-tasse/f24-editabile/f23-editabile/'],
  ['modello f23 da compilare e stampare', '/cittadino-tasse/f24-editabile/f23-editabile/'],
  ['f24 accise editabile', '/cittadino-tasse/f24-editabile/f24-accise/'],
  ['f24 ordinario editabile', '/cittadino-tasse/f24-editabile/f24-ordinario/'],
  ['modello rli editabile 2026', '/cittadino-tasse/modello-rli/'],
  ['mod.rli editabile', '/cittadino-tasse/modello-rli/'],
  ['registrare un contratto di comodato d uso gratuito online', '/cittadino-tasse/modello-rap/'],
  ['modello aa7/10 online', '/fisco-professioni/modelli-partita-iva/'],
  ['modello variazione iva società', '/fisco-professioni/modelli-partita-iva/'],
  ['codice tipologia richiedente (solo per attribuzione codice fiscale)', '/identita-burocrazia/richiesta-codice-fiscale/'],
  ['capitalizzazione composta', '/utilita-web/interessi-composti/'],
  ['simulatore auu', '/cittadino-tasse/assegno-unico/'],
  ['qrcode offline', '/utilita-web/generatore-qr/'],
  ['come si calcola la ritenuta d\'acconto', '/lavoro-contratti/ritenuta-acconto/'],
  ['costo passaggio di proprietà auto calcolo online', '/cittadino-tasse/passaggio-di-proprieta/'],
  ['calcolo ravvedimento operoso agenzia entrate excel 2026', '/fisco-professioni/ravvedimento-operoso/'],
  ['mef aliquote irpef 2026 scaglioni 23 35 43', '/cittadino-tasse/aliquote-irpef/'],
  ['in pensione a 60 anni nuove regole', '/cittadino-tasse/simulatore-pensione/'],
  ['come leggere una busta paga pdf', '/guide/leggere-busta-paga/'],
  // frasi di tutti i giorni
  ['ho preso una multa', '/cittadino-tasse/lettore-multa-codice-strada/'],
  ['voglio dimettermi dal lavoro', '/lavoro-contratti/lettera-dimissioni-preavviso/'],
  ['quanto prendo di disoccupazione', '/lavoro-contratti/calcolo-naspi/'],
  ['quanto mi resta in busta dalla RAL', '/lavoro-contratti/stipendio-netto/'],
  ['devo unire due pdf', '/pdf/unisci-pdf/'],
  ['il pdf è troppo pesante per la pec', '/pdf/comprimi-pdf/'],
  ['convertire le foto dell\'iphone in jpg', '/utilita-web/convertire-heic-jpg/'],
  ['togliere la posizione gps dalle foto', '/utilita-web/rimuovi-dati-foto/'],
  ['aprire un allegato p7m', '/pdf/apri-file-p7m/'],
  ['disdire il canone tv', '/cittadino-tasse/disdetta-canone-rai/'],
  ['quanto costa la benzina oggi', '/utilita-web/prezzi-carburanti-oggi/'],
  ['calcolare la rata del mutuo', '/fisco-professioni/calcolo-rata-mutuo/'],
  ['tassa di possesso auto', '/cittadino-tasse/calcolo-bollo-auto/'],
  ['pagare l\'imu della seconda casa', '/cittadino-tasse/calcolo-imu/'],
  ['fare una fototessera per la carta d\'identità', '/identita-burocrazia/fototessera/'],
  ['quanti giorni lavorativi ci sono a dicembre', '/lavoro-contratti/giorni-lavorativi/'],
  // lo strumento prima della guida, la guida a chi chiede come si fa
  ['calcolo imu', '/cittadino-tasse/calcolo-imu/'],
  ['come si calcola l\'imu', '/guide/imu-2026/'],
  ['f24 editabile', '/cittadino-tasse/f24-editabile/f24-ordinario/'],
  ['modello f24', '/cittadino-tasse/f24-editabile/f24-ordinario/'],
  // errori di battitura (ricerche vere)
  ['calcolo napsi', '/lavoro-contratti/calcolo-naspi/'],
  ['calcolo suoerbollo', '/cittadino-tasse/calcolo-bollo-auto/'],
  ['f24 elide edittabile', '/cittadino-tasse/f24-editabile/f24-elide/'],
  // F23 e F24 scritti staccati (ricerca vera di Search Console, 5/10)
  ['f 23', '/cittadino-tasse/f24-editabile/f23-editabile/'],
  ['modello f-24 elide', '/cittadino-tasse/f24-editabile/f24-elide/'],
  // sinonimi presi dalle ricerche vere
  ['autodichiarazione fac simile', '/identita-burocrazia/autocertificazione/'],
  ['calcola retribuzione', '/lavoro-contratti/stipendio-netto/']
];

test('le ricerche vere e le frasi di tutti i giorni portano allo strumento giusto', () => {
  const sbagliate = DOMANDE.map(([q, atteso]) => [q, atteso, primo(q)]).filter(([, atteso, trovato]) => !trovato || !trovato.startsWith(atteso));
  assert.deepStrictEqual(sbagliate.map(([q, atteso, trovato]) => `${q} → ${trovato} (atteso ${atteso})`), []);
});

test('la variante giusta: la Regione o il contratto scritti nella domanda', () => {
  assert.strictEqual(primo('quanto costa il bollo auto in puglia'), '/cittadino-tasse/calcolo-bollo-auto/?regione=puglia');
  assert.strictEqual(primo('calcolo bollo auto veneto euro 6'), '/cittadino-tasse/calcolo-bollo-auto/?regione=veneto');
  assert.strictEqual(primo('ccnl multiservizi preavviso dimissioni tempo indeterminato'), '/lavoro-contratti/lettera-dimissioni-preavviso/?ccnl=multiservizi');
  // senza Regione resta lo strumento principale, e le varianti non affollano l'elenco
  assert.strictEqual(primo('calcolo bollo auto'), '/cittadino-tasse/calcolo-bollo-auto/');
  assert.ok(A.cerca(motore, 'voglio dimettermi', 8).every((x) => !x.voce.variante));
});

test('una sola parola funziona ancora come prima', () => {
  assert.strictEqual(primo('isee'), '/cittadino-tasse/simulatore-isee/');
  assert.strictEqual(primo('fototessera'), '/identita-burocrazia/fototessera/');
  assert.strictEqual(primo('iban'), '/identita-burocrazia/validatore-iban/');
  assert.strictEqual(primo('tfr'), '/lavoro-contratti/calcolo-tfr/');
});

test('niente risultati inventati: parole che non c\'entrano non portano da nessuna parte', () => {
  assert.deepStrictEqual(A.cerca(motore, 'ricetta della carbonara', 5), []);
  assert.deepStrictEqual(A.cerca(motore, '', 5), []);
  assert.deepStrictEqual(A.cerca(motore, 'di la il', 5), []);
});

test('quasi tutte le ricerche vere di Search Console trovano qualcosa', () => {
  // elenco salvato dalle esportazioni del 3/10 (solo le parole cercate)
  const domande = leggi('tests/fixtures/ricerche-google.json').ricerche;
  assert.ok(domande.length >= 900, 'elenco troppo corto: ' + domande.length);
  const senza = domande.filter((q) => !A.cerca(motore, q, 1).length);
  const quota = senza.length / domande.length;
  assert.ok(quota < 0.06, `${senza.length} ricerche senza risultato (${Math.round(quota * 100)}%): ${senza.slice(0, 15).join(' | ')}`);
});
