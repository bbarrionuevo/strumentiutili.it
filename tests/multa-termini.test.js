// tests/multa-termini.test.js — I termini di un verbale del Codice della Strada.
//
// Qui si fissano le tre cose che rendono questo calcolo diverso da una somma di
// giorni, e che sbagliate fanno danno:
//
//   1. Il termine decorre dal giorno DOPO. Un giorno di scarto trasforma una
//      notifica tardiva in una regolare, e viceversa.
//   2. Lo sconto del 30% non si applica sempre, e "non si sa" non e "si".
//      Mostrare un importo ridotto a chi non ne ha diritto gli fa fare un
//      pagamento incompleto: la multa resta aperta e cresce.
//   3. Le spese di notifica non si riducono.
//
// Diversi test sono in coppia: quello che verifica il comportamento giusto e il
// CONTRO-TEST che dimostra che senza la regola il risultato cambierebbe. Senza
// la seconda meta non si sa se il test sta davvero provando qualcosa.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../js/multa-termini.js');
const RADICE = path.resolve(__dirname, '..');
const REGOLE = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8'))
  .codice_strada_verbali;

// Scorciatoia: un verbale notificato, con tutto confermato e senza sanzioni
// accessorie, cosi ogni test cambia solo quello che gli interessa.
function verbale(extra) {
  return Object.assign({
    contestazioneImmediata: false,
    dataAccertamento: '2026-01-01',
    dataNotifica: '2026-02-01',
    importoSanzione: 173,
    spese: 17.2,
    residenzaEstero: false,
    sanzioniAccessorie: { sospensionePatente: false, confiscaVeicolo: false, esclusa3bis: false },
    oggi: '2026-02-02',
    confermato: { dataAccertamento: true, dataNotifica: true }
  }, extra || {});
}

const trova = (r, id) => r.termini.find((t) => t.id === id);

// --- le regole come dati ----------------------------------------------------

test('il nodo delle regole c e ed e completo', () => {
  assert.ok(REGOLE, 'manca codice_strada_verbali in regole-fiscali-2026.json');
  assert.strictEqual(REGOLE.notifica.giorni, 90);
  assert.strictEqual(REGOLE.notifica.giorni_residenti_estero, 360);
  assert.strictEqual(REGOLE.pagamento.giorni_misura_ridotta, 60);
  assert.strictEqual(REGOLE.sconto_30.giorni, 5);
  assert.strictEqual(REGOLE.sconto_30.percentuale, 0.3);
  assert.strictEqual(REGOLE.sconto_30.si_applica_alle_spese, false);
  assert.strictEqual(REGOLE.prescrizione.anni, 5);
  assert.match(REGOLE.fonte_ufficiale, /normattiva\.it/);
});

test('ogni regola cita l articolo da cui viene', () => {
  // Una regola senza riferimento non e verificabile da chi la legge.
  const senza = [];
  (function cerca(nodo, percorso) {
    if (!nodo || typeof nodo !== 'object') return;
    if (Array.isArray(nodo)) return nodo.forEach((v, i) => cerca(v, percorso + '[' + i + ']'));
    if (nodo.certezza && !nodo.riferimento) senza.push(percorso);
    Object.keys(nodo).forEach((k) => cerca(nodo[k], percorso + '.' + k));
  })(REGOLE, 'codice_strada_verbali');
  assert.deepStrictEqual(senza, []);
});

test('i due ricorsi hanno organi e termini distinti', () => {
  const perOrgano = {};
  REGOLE.ricorsi.forEach((r) => { perOrgano[r.organo] = r.giorni; });
  assert.strictEqual(perOrgano['Prefetto'], 60);
  assert.strictEqual(perOrgano['Giudice di Pace'], 30);
});

// --- il giorno dopo ---------------------------------------------------------

test('novanta giorni esatti sono ancora nei termini, novantuno no', () => {
  // Il termine decorre dal giorno successivo all accertamento: dal 1 gennaio,
  // il novantesimo giorno e il 1 aprile.
  const nei = M.analizza(verbale({ dataNotifica: '2026-04-01' }), REGOLE);
  assert.strictEqual(nei.notifica.giorniTrascorsi, 90);
  assert.strictEqual(nei.notifica.esito, 'nei_termini');

  const oltre = M.analizza(verbale({ dataNotifica: '2026-04-02' }), REGOLE);
  assert.strictEqual(oltre.notifica.giorniTrascorsi, 91);
  assert.strictEqual(oltre.notifica.esito, 'oltre_il_termine');
});

test('i cinque giorni dello sconto comprendono il quinto', () => {
  const r = M.analizza(verbale({ dataNotifica: '2026-01-01' }), REGOLE);
  assert.strictEqual(trova(r, 'sconto30').scadenza, '2026-01-06',
    'dal 1 gennaio il quinto giorno e il 6, non il 5');
});

test('i sessanta giorni del pagamento e i due ricorsi', () => {
  const r = M.analizza(verbale({ dataNotifica: '2026-01-01' }), REGOLE);
  assert.strictEqual(trova(r, 'pagamento').scadenza, '2026-03-02');
  assert.strictEqual(trova(r, 'ricorso_giudice_di_pace').scadenza, '2026-01-31');
  assert.strictEqual(trova(r, 'ricorso_prefetto').scadenza, '2026-03-02');
});

test('chi risiede all estero ha 360 giorni invece di 90', () => {
  const dati = verbale({ dataNotifica: '2026-06-01', residenzaEstero: true });
  const r = M.analizza(dati, REGOLE);
  assert.strictEqual(r.notifica.limite, 360);
  assert.strictEqual(r.notifica.esito, 'nei_termini');

  // Lo stesso caso senza residenza estera e invece fuori termine.
  const italia = M.analizza(verbale({ dataNotifica: '2026-06-01' }), REGOLE);
  assert.strictEqual(italia.notifica.esito, 'oltre_il_termine');
});

// --- fuso orario e ora legale -----------------------------------------------

test('le date non slittano di un giorno per il fuso orario', () => {
  // new Date('2026-01-01') e UTC: a ovest di Greenwich sarebbe il 2025.
  const d = M.data('2026-01-01');
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 0);
  assert.strictEqual(d.getDate(), 1);
  assert.strictEqual(M.testo(d), '2026-01-01');
});

// Il codice, senza le righe di commento: cosi si puo cercare una chiamata
// vietata senza inciampare nel commento che spiega perche e vietata.
function codiceDi(file) {
  return fs.readFileSync(path.join(RADICE, 'js', file), 'utf8')
    .split('\n')
    .filter((riga) => riga.trim().indexOf('//') !== 0)
    .join('\n');
}

test('nessuna data esce passando da toISOString', () => {
  // La forma subdola dello stesso errore: il calcolo e giusto ma la data
  // stampata slitta in uscita. Si controlla il sorgente, non il risultato.
  assert.strictEqual(codiceDi('multa-termini.js').indexOf('toISOString'), -1,
    'multa-termini.js non deve usare toISOString: reintrodurrebbe lo scarto UTC');
});

test('l ora legale non fa perdere un giorno', () => {
  // In Italia l ora legale inizia il 29 marzo 2026 e finisce il 25 ottobre:
  // quei giorni durano 23 e 25 ore. Con Math.floor il conteggio perderebbe un
  // giorno; con Math.round no.
  const marzo = M.analizza(verbale({ dataNotifica: '2026-03-01', oggi: '2026-03-01' }), REGOLE);
  assert.strictEqual(trova(marzo, 'pagamento').scadenza, '2026-04-30');

  const ottobre = M.analizza(verbale({ dataNotifica: '2026-10-01', oggi: '2026-10-01' }), REGOLE);
  assert.strictEqual(trova(ottobre, 'pagamento').scadenza, '2026-11-30');

  // Contro-prova: attraverso il cambio d ora la differenza in giorni resta
  // intera. Con Math.floor su una differenza di 59,958 giorni verrebbe 59.
  assert.strictEqual(M.giorniFra(M.data('2026-03-01'), M.data('2026-04-30')), 60);
  assert.strictEqual(M.giorniFra(M.data('2026-10-01'), M.data('2026-11-30')), 60);
});

test('l anno bisestile non sposta le scadenze', () => {
  const r = M.analizza(verbale({ dataAccertamento: '2028-01-15', dataNotifica: '2028-01-15', oggi: '2028-01-15' }), REGOLE);
  assert.strictEqual(trova(r, 'pagamento').scadenza, '2028-03-15');
});

test('una data inesistente viene rifiutata', () => {
  // 31 febbraio ha la forma giusta: senza controllo diventerebbe il 2 marzo.
  assert.strictEqual(M.data('2026-02-31'), null);
  assert.strictEqual(M.data('2026-13-01'), null);
  assert.strictEqual(M.data('01/02/2026'), null, 'qui si accetta solo il formato ISO');
});

// --- lo sconto del 30% ------------------------------------------------------

test('lo sconto si calcola sulla sanzione e non sulle spese', () => {
  const r = M.analizza(verbale(), REGOLE);
  assert.strictEqual(r.riduzione30.applicabile, true);
  assert.strictEqual(r.riduzione30.importoSanzioneRidotta, 121.1, '173 meno il 30%');
  assert.strictEqual(r.riduzione30.spese, 17.2);
  assert.strictEqual(r.riduzione30.importoTotale, 138.3,
    'le spese di notifica non si riducono: 121,10 + 17,20, non 133,14');
});

test('la sospensione della patente esclude lo sconto', () => {
  const r = M.analizza(verbale({
    sanzioniAccessorie: { sospensionePatente: true, confiscaVeicolo: false, esclusa3bis: false }
  }), REGOLE);
  assert.strictEqual(r.riduzione30.applicabile, false);
  assert.strictEqual(r.riduzione30.importoTotale, null);
  assert.match(r.riduzione30.motivo, /sospensione della patente/);
});

test('la confisca del veicolo esclude lo sconto', () => {
  const r = M.analizza(verbale({
    sanzioniAccessorie: { sospensionePatente: false, confiscaVeicolo: true, esclusa3bis: false }
  }), REGOLE);
  assert.strictEqual(r.riduzione30.applicabile, false);
  assert.strictEqual(r.riduzione30.importoTotale, null);
});

test('se non si sa, la risposta e indeterminata e NON si calcola un importo', () => {
  // Il test piu importante del file. Collassare "non so" in "si applica"
  // farebbe pagare meno del dovuto: il pagamento e incompleto, la multa resta
  // aperta e cresce. L assert sull importo nullo e cio che impedisce a un
  // refactoring futuro di far ricomparire un numero.
  const r = M.analizza(verbale({
    sanzioniAccessorie: { sospensionePatente: null, confiscaVeicolo: null, esclusa3bis: null }
  }), REGOLE);
  assert.strictEqual(r.riduzione30.applicabile, 'indeterminata');
  assert.strictEqual(r.riduzione30.importoTotale, null);
  assert.strictEqual(r.riduzione30.importoSanzioneRidotta, null);
  assert.ok(r.daChiarire.some((x) => x.campo === 'sanzioniAccessorie'));
});

test('l elenco del comma 3-bis non blocca il calcolo, lo dichiara', () => {
  // Distinzione voluta. Sospensione e confisca l utente le legge sul verbale:
  // se non ha guardato, il calcolo si ferma. L elenco dell art. 202 c. 3-bis
  // invece qui non c e, quindi chiedergli se la sua violazione ci rientra e una
  // domanda senza risposta possibile: bloccare su quella non sarebbe prudenza,
  // sarebbe uno strumento che non calcola mai niente.
  const r = M.analizza(verbale({
    sanzioniAccessorie: { sospensionePatente: false, confiscaVeicolo: false, esclusa3bis: null }
  }), REGOLE);

  assert.strictEqual(r.riduzione30.applicabile, true, 'deve calcolare');
  assert.strictEqual(r.riduzione30.importoTotale, 138.3);

  const avviso = r.avvertenze.find((a) => /3-bis/.test(a.riferimento));
  assert.ok(avviso, 'ma deve dichiarare su quale assunzione poggia');
  assert.strictEqual(avviso.certezza, 'da_verificare');
});

test('chi dichiara che la violazione e nel 3-bis non vede nessuno sconto', () => {
  const r = M.analizza(verbale({
    sanzioniAccessorie: { sospensionePatente: false, confiscaVeicolo: false, esclusa3bis: true }
  }), REGOLE);
  assert.strictEqual(r.riduzione30.applicabile, false);
  assert.strictEqual(r.riduzione30.importoTotale, null);
  assert.deepStrictEqual(r.avvertenze, [], 'niente avvertenza: qui la risposta c e');
});

test('basta un dubbio su una sola accessoria per non calcolare lo sconto', () => {
  const r = M.analizza(verbale({
    sanzioniAccessorie: { sospensionePatente: false, confiscaVeicolo: null, esclusa3bis: false }
  }), REGOLE);
  assert.strictEqual(r.riduzione30.applicabile, 'indeterminata');
  assert.strictEqual(r.riduzione30.importoTotale, null);
});

test('senza importo non si inventa uno sconto', () => {
  const r = M.analizza(verbale({ importoSanzione: null }), REGOLE);
  assert.strictEqual(r.riduzione30.applicabile, 'indeterminata');
  assert.strictEqual(r.riduzione30.importoTotale, null);
});

test('le spese assenti valgono zero, non NaN', () => {
  const r = M.analizza(verbale({ spese: null }), REGOLE);
  assert.strictEqual(r.riduzione30.importoTotale, 121.1);
});

// --- i dati non confermati --------------------------------------------------

test('una data non confermata non produce nessuna scadenza', () => {
  // Il testo estratto da una foto non e un dato: un 3 letto come 8 ribalta la
  // risposta e nulla, dentro il programma, puo accorgersene. Finche l utente
  // non conferma, il motore non si pronuncia.
  const r = M.analizza(verbale({ confermato: { dataAccertamento: true } }), REGOLE);
  assert.strictEqual(trova(r, 'pagamento').stato, 'indeterminato');
  assert.strictEqual(trova(r, 'pagamento').scadenza, null);
  assert.strictEqual(r.notifica.esito, 'non_verificabile');
  assert.ok(r.daChiarire.some((x) => x.campo === 'dataNotifica'));
});

test('dice dove si trova la data di notifica, perche non e sul verbale', () => {
  // E il punto in cui quasi tutti si bloccano: quella data sta sulla busta o
  // sulla cartolina verde, non sul verbale.
  const r = M.analizza(verbale({ confermato: {} }), REGOLE);
  const voce = r.daChiarire.find((x) => x.campo === 'dataNotifica');
  assert.ok(voce);
  assert.match(voce.doveTrovarlo, /cartolina|busta|raccomandata/i);
});

test('con la contestazione immediata il termine di notifica non si applica', () => {
  const r = M.analizza(verbale({
    contestazioneImmediata: true,
    dataContestazione: '2026-01-01',
    confermato: { dataAccertamento: true, dataContestazione: true }
  }), REGOLE);
  assert.strictEqual(r.notifica.esito, 'non_applicabile');
  assert.strictEqual(trova(r, 'pagamento').scadenza, '2026-03-02',
    'i termini decorrono comunque, dalla contestazione');
});

// --- robustezza -------------------------------------------------------------

test('il motore non legge l orologio', () => {
  // Senza `oggi` calcola le scadenze ma non i giorni residui. Se leggesse
  // Date.now() i test non sarebbero deterministici e il risultato cambierebbe
  // da solo di giorno in giorno.
  const r = M.analizza(verbale({ oggi: null }), REGOLE);
  assert.strictEqual(trova(r, 'pagamento').scadenza, '2026-04-02');
  assert.strictEqual(trova(r, 'pagamento').giorniResidui, null);
  assert.strictEqual(trova(r, 'pagamento').stato, 'indeterminato');
});

test('distingue un termine scaduto da uno ancora aperto', () => {
  const aperto = M.analizza(verbale({ dataNotifica: '2026-01-01', oggi: '2026-01-04' }), REGOLE);
  assert.strictEqual(trova(aperto, 'sconto30').stato, 'aperto');
  assert.strictEqual(trova(aperto, 'sconto30').giorniResidui, 2);

  const scaduto = M.analizza(verbale({ dataNotifica: '2026-01-01', oggi: '2026-01-10' }), REGOLE);
  assert.strictEqual(trova(scaduto, 'sconto30').stato, 'scaduto');
});

test('notifica precedente all accertamento: lo dice invece di dare un numero negativo', () => {
  const r = M.analizza(verbale({ dataAccertamento: '2026-03-01', dataNotifica: '2026-01-01' }), REGOLE);
  assert.strictEqual(r.notifica.esito, 'date_incoerenti');
  assert.strictEqual(r.notifica.verificabile, false);
});

test('la prescrizione si conta dall accertamento', () => {
  const r = M.analizza(verbale(), REGOLE);
  assert.strictEqual(r.prescrizione.anni, 5);
  assert.strictEqual(r.prescrizione.scadenza, '2031-01-01');
});

test('riporta sempre acquiescenza e inerzia, che sono fatti di legge', () => {
  const r = M.analizza(verbale(), REGOLE);
  assert.ok(r.acquiescenza && /non può più ricorrere|chi paga/i.test(r.acquiescenza.nota),
    'pagare chiude la possibilita di ricorso: va detto sempre');
  assert.ok(r.inerzia && /metà del massimo/i.test(r.inerzia.nota));
});

test('input vuoto o assurdo non produce NaN ne eccezioni', () => {
  for (const input of [{}, null, undefined]) {
    const r = M.analizza(input, REGOLE);
    assert.ok(Array.isArray(r.termini));
    assert.ok(Array.isArray(r.daChiarire) && r.daChiarire.length > 0);
    assert.strictEqual(r.riduzione30.importoTotale, null);
    assert.ok(r.termini.every((t) => t.stato === 'indeterminato'));
  }
});

test('senza le regole non inventa termini', () => {
  const r = M.analizza(verbale(), {});
  assert.strictEqual(r.notifica.limite, 90, 'il valore di ripiego resta quello di legge');
  assert.strictEqual(r.termini.filter((t) => t.id.indexOf('ricorso_') === 0).length, 0,
    'i ricorsi vengono dall elenco nel JSON: senza elenco, nessun ricorso inventato');
});

// --- quello che il motore non deve poter dire -------------------------------

test('non esiste nessun campo che dica se il ricorso si vince', () => {
  // Il vincolo strutturale che tiene onesto lo strumento: puo dire quanti
  // giorni sono passati, non se hai ragione. Si controlla sul sorgente perche
  // e una proprieta del progetto, non di una singola risposta.
  const sorgente = codiceDi('multa-termini.js');
  for (const vietato of ['vinci', 'annullabile:', 'haiRagione', 'successo:', 'probabilita']) {
    assert.strictEqual(sorgente.indexOf(vietato), -1, 'il motore non deve avere un campo ' + vietato);
  }

  // E l esito del controllo e un fatto sul conteggio, non un giudizio sul caso.
  const r = M.analizza(verbale({ dataNotifica: '2026-05-01' }), REGOLE);
  assert.strictEqual(r.notifica.esito, 'oltre_il_termine');
  assert.strictEqual(JSON.stringify(r).indexOf('annullat'), -1);
});
