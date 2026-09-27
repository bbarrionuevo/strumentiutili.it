// tests/contratto-locazione.test.js — Contratti di locazione dei tipi ministeriali.
//
// I testi di data/contratti-tipo-dm-2017.json devono essere quelli della
// Gazzetta Ufficiale (tests/fixtures/dm-2017: allegati A, B e C del D.M. 16
// gennaio 2017 letti il 27 settembre 2026), paragrafo per paragrafo e senza
// buchi. Le regole su durata e cauzione vengono dalle note dei modelli, dagli
// articoli 1-3 del decreto, dall'art. 2 della legge 431/1998 e dall'art. 11
// della legge 392/1978.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../js/contratto-locazione.js');

const RADICE = path.resolve(__dirname, '..');
const DATI = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'contratti-tipo-dm-2017.json'), 'utf8'));
const RUN = /(?:[.…]*…[.…]*|\.{3,})(?:\s+(?:[.…]*…[.…]*|\.{3,}))*/g;
const norm = (t) => t.replace(/\s+/g, ' ').replace(RUN, '…').replace(/(?:… ?)+…/g, '…').trim();

test('i testi dei modelli sono quelli della Gazzetta Ufficiale, senza parti mancanti', () => {
  for (const [lettera, modello] of Object.entries(DATI.modelli)) {
    const ufficiale = norm(fs.readFileSync(path.join(RADICE, 'tests', 'fixtures', 'dm-2017', `allegato-${lettera.toLowerCase()}.txt`), 'utf8'));
    const corpo = ufficiale.slice(0, ufficiale.indexOf(' NOTE '));
    let pos = corpo.indexOf(modello.titolo);
    assert.ok(pos >= 0, lettera);
    let coperto = 0;
    for (const t of K.letterale(modello)) {
      const n = norm(t);
      const i = corpo.indexOf(n, pos);
      assert.ok(i >= 0, `${lettera}: paragrafo non letterale: ${n.slice(0, 120)}`);
      assert.strictEqual(corpo.slice(pos, i).trim(), '', `${lettera}: testo saltato prima di: ${n.slice(0, 60)}`);
      pos = i + n.length;
      coperto += n.length;
    }
    assert.strictEqual(corpo.slice(pos).trim(), '', `${lettera}: testo saltato alla fine`);
    assert.ok(coperto > 0.97 * (corpo.length - corpo.indexOf(modello.titolo)), lettera);
    // le note del modello, lette per intero
    assert.ok(Object.keys(modello.note).length >= 12, lettera);
  }
  assert.strictEqual(DATI.modelli.A.note['6'], 'La durata minima è di anni tre.');
  assert.strictEqual(DATI.modelli.A.note['9'], 'Massimo tre mensilità.');
  assert.strictEqual(DATI.modelli.B.note['6'], 'La durata massima è di mesi diciotto.');
  assert.strictEqual(DATI.modelli.B.note['8'], 'Massimo tre mensilità.');
  assert.strictEqual(DATI.modelli.C.note['7'], 'La durata minima è di sei mesi e quella massima di trentasei mesi.');
  assert.strictEqual(DATI.modelli.C.note['10'], 'Massimo tre mensilità.');
});

test('fine del contratto, canone, rate e deposito', () => {
  assert.strictEqual(K.fineContratto('2026-10-01', 3, 'anni'), '2029-09-30');
  assert.strictEqual(K.fineContratto('2026-01-31', 1, 'mesi'), '2026-02-28');
  assert.strictEqual(K.fineContratto('2026-10-01', 18, 'mesi'), '2028-03-31');
  assert.strictEqual(K.fineContratto('2026-10-01', 30, 'giorni'), '2026-10-30');
  assert.strictEqual(K.fineContratto('2026-02-30', 3, 'anni'), '');
  const a = K.calcola('A', { dal: '2026-10-01', durata: 3, canoneMensile: '650', depositoMensilita: 2 });
  assert.deepStrictEqual([a.al, a.canone, a.numeroRate, a.importoRata, a.deposito, a.canoneRli], ['2029-09-30', 7800, 12, 650, 1300, 7800]);
  const b = K.calcola('B', { dal: '2026-10-01', durata: 10, unitaDurata: 'mesi', canoneMensile: '500,50' });
  assert.deepStrictEqual([b.canone, b.numeroRate, b.importoRata, b.canoneRli], [5005, 10, 500.5, 5005]);
  const breve = K.calcola('B', { dal: '2026-10-01', durata: 20, unitaDurata: 'giorni', canoneTotale: '900' });
  assert.deepStrictEqual([breve.al, breve.canone, breve.numeroRate], ['2026-10-20', 900, 1]);
  const c = K.calcola('C', { dal: '2026-10-01', durata: 10, canoneMensile: 400 });
  assert.deepStrictEqual([c.canone, c.canoneRli], [4800, 4000]); // canone annuo nel contratto, intera durata nell'RLI
  assert.strictEqual(K.euro(1234567.5), '1.234.567,50');
});

test('controlli: durate, cauzione, aggiornamento Istat, esigenza e studenti', () => {
  const errori = (tipo, d) => K.controlla(tipo, d).filter((x) => x.livello === 'errore').map((x) => x.testo);
  assert.strictEqual(errori('A', { durata: 2 }).length, 1);
  assert.deepStrictEqual(errori('A', { durata: 3, depositoMensilita: 3 }), []);
  assert.match(errori('A', { durata: 3, depositoMensilita: 4 })[0], /tre mensilità/);
  assert.match(errori('A', { durata: 3, aggiornamentoIstat: 80 })[0], /75%/);
  assert.ok(K.controlla('A', { durata: 3, aggiornamentoIstat: 75, cedolare: true }).some((x) => /sospeso/.test(x.testo)));
  assert.ok(errori('B', { durata: 19, unitaDurata: 'mesi', esigenza: 'lavoro' }).some((x) => /diciotto mesi/.test(x)));
  assert.deepStrictEqual(errori('B', { durata: 18, unitaDurata: 'mesi', esigenza: 'lavoro' }), []);
  assert.ok(errori('B', { durata: 6, unitaDurata: 'mesi' }).some((x) => /esigenza/.test(x)));
  assert.ok(K.controlla('B', { durata: 6, unitaDurata: 'mesi', esigenza: 'lavoro' }).some((x) => /documentazione/.test(x.testo)));
  assert.ok(!K.controlla('B', { durata: 20, unitaDurata: 'giorni', esigenza: 'turismo' }).some((x) => /documentazione|attestazione/.test(x.testo)));
  assert.ok(errori('C', { durata: 5, corso: 'Ingegneria' }).length === 1);
  assert.ok(errori('C', { durata: 37, corso: 'Ingegneria' }).length === 1);
  assert.deepStrictEqual(errori('C', { durata: 36, corso: 'Ingegneria', comune: 'Pisa', residenzaStudente: 'Lucca' }), []);
  assert.ok(errori('C', { durata: 12, corso: 'Ingegneria', comune: 'Pisa', residenzaStudente: 'pisa' }).some((x) => /diverso/.test(x)));
  // senza assistenza delle organizzazioni: l'attestazione dell'accordo
  assert.ok(K.controlla('A', { durata: 3 }).some((x) => /attestazione/.test(x.testo) && /art\. 1, comma 8/.test(x.fonte)));
  assert.ok(!K.controlla('A', { durata: 3, assistenteLocatore: 'Confedilizia Roma' }).some((x) => /attestazione/.test(x.testo)));
});

function datiCompleti(tipo) {
  return {
    formaLocatore: 'sig', locatore: 'Mario Rossi, nato a Roma il 01/02/1960, residente in Roma, via Po 1, codice fiscale RSSMRA60B01H501X',
    formaConduttore: 'sigra', conduttore: 'Anna Bianchi, nata a Napoli il 03/04/1990, residente in Napoli, codice fiscale BNCNNA90D43F839Y',
    documentoConduttore: 'carta d\'identità n. CA12345AB', comune: 'Roma', via: 'Via Tevere', civico: '10', piano: '2', scala: 'A', interno: '5', vani: '3',
    accessori: 'cantina', arredo: 'si', catasto: 'foglio 1, particella 2, subalterno 3', ape: 'classe D', impianti: 'conformi', millesimiProprieta: '40',
    millesimiRiscaldamento: '38', millesimiAcqua: '40', millesimiAltre: 'nessuna', durata: tipo === 'A' ? 3 : 12, unitaDurata: 'mesi', dal: '2026-10-01',
    accordoTra: 'le organizzazioni firmatarie', accordoDepositato: '2023-05-10', accordoComune: 'Roma', canoneMensile: '650', modoPagamento: 'bonifico',
    dateRate: 'entro il giorno 5 di ogni mese', depositoMensilita: 2, quotaOneri: 50, periodicitaOneri: 'mensile', conviventi: 'nessun altro',
    consegnaStato: 'verbale', visite: 'standard', luogoFirma: 'Roma', dataFirma: '2026-09-28', esigenzaDi: 'conduttore', esigenza: 'trasferimento temporaneo per lavoro',
    documentazione: 'lettera del datore di lavoro', preavvisoRecesso: 'un mese', corso: 'laurea magistrale in Ingegneria', sedeCorso: 'Sapienza Università di Roma',
    altreUtenze: 'internet', depositoVersato: 'si'
  };
}

test('con tutti i dati il contratto non ha piu\' puntini, note o scelte in sospeso', () => {
  for (const tipo of ['A', 'B', 'C']) {
    const { blocchi, mancanti } = K.componi(DATI.modelli[tipo], tipo, datiCompleti(tipo));
    assert.deepStrictEqual(mancanti, [], tipo);
    const testo = K.comeTesto(blocchi);
    const senzaFirme = blocchi.filter((b) => b.k !== 'firme').map((b) => b.testo).join('\n');
    assert.doesNotMatch(senzaFirme, /…/, tipo + ': puntini rimasti');
    assert.doesNotMatch(testo, /\(\d{1,2}\)|\{\{|versa\/non versa|ammobiliata \/|ammobiliata\/|Il locatore\/conduttore|sig\.\/soc|indicare quali|mesi\/giorni/, tipo);
    assert.match(testo, /Il sig\. Mario Rossi/, tipo);
    assert.match(testo, /alla sig\.ra Anna Bianchi/, tipo);
    assert.match(testo, /7\.800,00|6\.500,00|650,00/, tipo);
    assert.match(testo, /01\/10\/2026/, tipo);
    assert.match(testo, /Articolo 1\n\(Durata\)/, tipo);
    assert.match(testo, /verbale di consegna\./, tipo);
    assert.match(testo, /versa al locatore/, tipo);
  }
  const a = K.comeTesto(K.componi(DATI.modelli.A, 'A', datiCompleti('A')).blocchi);
  assert.match(a, /per la durata di 3 anni, dal 01\/10\/2026 al 30\/09\/2029/);
  assert.match(a, /è convenuto in euro 7\.800,00, che il conduttore si obbliga a corrispondere a mezzo di bonifico bancario, in n\. 12 rate eguali anticipate di euro 650,00 ciascuna/);
  assert.match(a, /una somma di euro 1\.300,00 pari a 2 mensilità del canone/);
  assert.match(a, /presso il Comune di Roma, è convenuto/); // senza accordo integrativo
  assert.match(a, /conviventi: nessun altro\. Salvo espresso/);
  assert.match(a, /una quota di euro 50,00 con cadenza mensile salvo conguaglio\./);
  assert.doesNotMatch(a, /aggiornato ogni anno/); // aggiornamento Istat non indicato
  const b = K.comeTesto(K.componi(DATI.modelli.B, 'B', datiCompleti('B')).blocchi);
  assert.match(b, /Articolo 2\n\(Esigenza del conduttore\)/);
  assert.match(b, /Il conduttore, nel rispetto/);
  assert.match(b, /allegando lettera del datore di lavoro\./);
});

test('transitorio fino a trenta giorni: gli articoli che non si applicano restano con la loro nota', () => {
  const d = Object.assign(datiCompleti('B'), { durata: 20, unitaDurata: 'giorni', canoneTotale: 900 });
  const { blocchi } = K.componi(DATI.modelli.B, 'B', d);
  const testo = K.comeTesto(blocchi);
  assert.match(testo, /per la durata di 20 giorni/);
  assert.match(testo, /Articolo 3\n\(Inadempimento delle modalità di stipula\)\n\n\(Il presente articolo non si applica ai contratti con durata pari o inferiore ai 30 giorni\)/);
  assert.doesNotMatch(testo, /ricondotto alla durata|documenta, in caso di durata superiore/);
  assert.match(testo, /è convenuto in euro 900,00/);
  assert.doesNotMatch(testo, /Nei Comuni con un numero di abitanti superiore a diecimila/);
});

test('scelte del modello: porzione, senza accordo, comune grande, parti assistite', () => {
  const d = Object.assign(datiCompleti('A'), { porzione: true, usoPorzione: 'camera con uso condiviso di cucina e bagno', senzaAccordo: true, assistenteLocatore: 'APPC Roma', personaAssistenteLocatore: 'Luca Verdi', accessori: '' });
  const a = K.comeTesto(K.componi(DATI.modelli.A, 'A', d).blocchi);
  assert.match(a, /una porzione dell’unità immobiliare posta in Roma/);
  assert.match(a, /regolato nel seguente modo: camera con uso condiviso di cucina e bagno, ammobiliata/);
  assert.doesNotMatch(a, /^l’unità immobiliare posta in/m);
  assert.match(a, /secondo quanto stabilito dal decreto di cui all'articolo 4, comma 3/);
  assert.match(a, /\(assistito da APPC Roma in persona di Luca Verdi\)/);
  const b = Object.assign(datiCompleti('B'), { comuneGrande: true });
  const tb = K.comeTesto(K.componi(DATI.modelli.B, 'B', b).blocchi);
  assert.match(tb, /Nei Comuni con un numero di abitanti superiore a diecimila/);
});
