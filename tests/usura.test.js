// tests/usura.test.js — Tassi soglia usura dai decreti trimestrali del MEF.
//
// I quattro decreti del 2026 (tests/fixtures/usura, testo di pdftotext -layout
// letto con il workflow leggi-fonti il 28 settembre e il 3 ottobre 2026) hanno
// impaginazioni diverse: il parser deve leggerli tutti e rifiutare una tabella alterata.
// La formula viene dall'art. 2, comma 4, della legge 108/1996.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../scripts/usura/elabora.js');
const U = require('../js/usura.js');

const RADICE = path.resolve(__dirname, '..');
const fixture = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', 'usura', `decreto-${n}.txt`), 'utf8');

test('formula della soglia: un quarto piu\' 4 punti, al massimo 8 punti sopra il TEGM', () => {
  assert.strictEqual(E.sogliaDaTegm(11.68), 18.6);
  assert.strictEqual(E.sogliaDaTegm(15.75), 23.6875);
  assert.strictEqual(E.sogliaDaTegm(16.21), 24.21); // qui vale il tetto degli 8 punti
  assert.strictEqual(U.soglia(4.21), 9.2625);
});

test('i quattro decreti del 2026 si leggono tutti, con le loro impaginazioni', () => {
  const attesi = {
    '2026-01': { dal: '2026-01-01', al: '2026-03-31', ril: '2025-07-01', prot: '57950/2025', data: '2025-12-23', mutuiFisso: [3.96, 8.95] },
    '2026-04': { dal: '2026-04-01', al: '2026-06-30', ril: '2025-10-01', prot: '16420/2026', data: '2026-03-27', mutuiFisso: [4.05, 9.0625] },
    '2026-07': { dal: '2026-07-01', al: '2026-09-30', ril: '2026-01-01', prot: '31747/2026', data: '2026-06-23', mutuiFisso: [4.21, 9.2625] },
    // classificazione nuova (decreto MEF del 25 settembre 2026), stesse 24 voci
    '2026-10': { dal: '2026-10-01', al: '2026-12-31', ril: '2026-04-01', prot: '47593/2026', data: '2026-09-28', mutuiFisso: [4.52, 9.65], classificazione: '2026-09-25' }
  };
  for (const [f, a] of Object.entries(attesi)) {
    const r = E.leggiDecreto(fixture(f), 'https://example.org/' + f);
    assert.deepStrictEqual(r.errori, [], f);
    const t = r.trimestre;
    assert.deepStrictEqual([t.dal, t.al, t.rilevazione.dal, t.decreto.protocollo, t.decreto.data], [a.dal, a.al, a.ril, a.prot, a.data], f);
    assert.strictEqual(Object.keys(t.tassi).length, E.RIGHE_ATTESE, f);
    assert.deepStrictEqual(t.tassi['mutui:fisso'], a.mutuiFisso, f);
    assert.deepStrictEqual(t.mora, { mutui: 1.9, leasing: 4.1, altri: 3.1 }, f);
    assert.strictEqual(t.classificazione, a.classificazione || '2025-09-23', f);
  }
  assert.strictEqual(E.RIGHE_ATTESE, 24);
  const luglio = E.leggiDecreto(fixture('2026-07')).trimestre.tassi;
  assert.deepStrictEqual(luglio['aperture-conto:fino-5000'], [10.57, 17.2125]);
  assert.deepStrictEqual(luglio['anticipi:50000-200000'], [6.53, 12.1625]);
  assert.deepStrictEqual(luglio['altri:unica'], [14.48, 22.1]);
  // nel decreto di ottobre la riga degli anticipi va a capo prima della classe "oltre"
  const ottobre = E.leggiDecreto(fixture('2026-10')).trimestre.tassi;
  assert.deepStrictEqual(ottobre['anticipi:oltre-200000'], [5.31, 10.6375]);
  assert.deepStrictEqual(ottobre['revolving:unica'], [16.5, 24.5]);
});

test('una tabella alterata non passa: soglia sbagliata, riga mancante, classe diversa, periodo strano', () => {
  const t = fixture('2026-07');
  const soglia = E.leggiDecreto(t.replace('18,6000', '18,7000'));
  assert.ok(soglia.errori.some((e) => /credito-personale.*diversa da quella di legge/.test(e)), soglia.errori.join('|'));
  const riga = E.leggiDecreto(t.replace(/^.*CREDITO REVOLVING.*$/m, 'CREDITO REVOLVING'));
  assert.ok(riga.errori.some((e) => /23 righe/.test(e)));
  const classe = E.leggiDecreto(t.replace('fino a 1.500', 'fino a 2.000'));
  assert.ok(classe.errori.some((e) => /scoperti\/fino-1500/.test(e)));
  const periodo = E.leggiDecreto(t.replace('FINO AL 30 SETTEMBRE 2026', 'FINO AL 31 OTTOBRE 2026'));
  assert.ok(periodo.errori.some((e) => /non e' un trimestre/.test(e)));
});

test('collegamenti ai decreti nella pagina del MEF e nomi abituali dei file', () => {
  const html = '<a href="/export/sites/sitodt/modules/documenti_it/prevenzione_reati_finanziari/antiusura/Decreto-tassi-usura-luglio-settembre-2026.pdf">x</a>' +
    '<a href="http://redazionecmsdt10.mef.gov.it/modules/documenti_it/prevenzione_reati_finanziari/antiusura/Categorie-operazioni-creditizie-2025.pdf">c</a>' +
    '<a href="/export/sites/sitodt/modules/documenti_it/prevenzione_reati_finanziari/antiusura/decreto-tassi-aprile-giugno-2026-completo.pdf">y</a>';
  const u = E.collegamentiDecreti(html, 'https://www.dt.mef.gov.it/it/attivita_istituzionali/sistema_bancario_finanziario/anti_usura/categorie_creditizie/');
  assert.deepStrictEqual(u, [
    'https://www.dt.mef.gov.it/export/sites/sitodt/modules/documenti_it/prevenzione_reati_finanziari/antiusura/Decreto-tassi-usura-luglio-settembre-2026.pdf',
    'https://www.dt.mef.gov.it/export/sites/sitodt/modules/documenti_it/prevenzione_reati_finanziari/antiusura/decreto-tassi-aprile-giugno-2026-completo.pdf'
  ]);
  assert.strictEqual(E.nomeProbabile(2025, 4), 'Decreto-tassi-usura-ottobre-dicembre-2025.pdf');
});

// --- I dati pubblicati (scritti dal workflow) --------------------------------
const FILE = path.join(RADICE, 'data', 'vivi', 'usura', 'soglie.json');
test('dati pubblicati: trimestri contigui, soglie di legge, categorie complete', { skip: !fs.existsSync(FILE) && 'dati non ancora scritti' }, () => {
  const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.ok(d.trimestri.length >= 1);
  assert.strictEqual(d.vigente_dal, d.trimestri[0].dal);
  assert.match(d.classificazione, /^Decreto MEF del \d{2}\/\d{2}\/\d{4} /);
  const chiavi = d.categorie.flatMap((c) => c.classi.map((cl) => `${c.id}:${cl.id}`));
  assert.strictEqual(chiavi.length, 24);
  for (const t of d.trimestri) {
    assert.deepStrictEqual(Object.keys(t.tassi).sort(), [...chiavi].sort(), t.dal);
    for (const [k, [tegm, s]] of Object.entries(t.tassi)) assert.strictEqual(U.soglia(tegm), s, `${t.dal} ${k}`);
    assert.match(t.decreto.url, /^https:\/\/www\.dt\.mef\.gov\.it\//);
  }
  for (let i = 1; i < d.trimestri.length; i++) assert.ok(d.trimestri[i - 1].dal > d.trimestri[i].al, 'trimestri in ordine e senza sovrapposizioni');
});

// --- Il motore della pagina ---------------------------------------------------
const DATI = { categorie: require('../scripts/usura/aggiorna.js').componi([E.leggiDecreto(fixture('2026-07'), 'u').trimestre]).categorie,
  trimestri: ['2026-10', '2026-07', '2026-04', '2026-01'].map((f) => E.leggiDecreto(fixture(f), 'u').trimestre) };

test('pagina: trimestre per data, classe per importo, verifica', () => {
  assert.strictEqual(U.trimestreDi(DATI.trimestri, '2026-03-31').dal, '2026-01-01');
  assert.strictEqual(U.trimestreDi(DATI.trimestri, '2026-04-01').dal, '2026-04-01');
  assert.strictEqual(U.trimestreDi(DATI.trimestri, '2025-12-31'), null);
  const v = U.vigenti(DATI.trimestri, '2026-09-28');
  assert.deepStrictEqual([v.ora.dal, v.prossimo.dal], ['2026-07-01', '2026-10-01']);
  assert.strictEqual(U.vigenti(DATI.trimestri, '2026-10-03').prossimo, null);
  const aperture = DATI.categorie.find((c) => c.id === 'aperture-conto');
  assert.strictEqual(U.classe(aperture, 5000).id, 'fino-5000');
  assert.strictEqual(U.classe(aperture, 5000.01).id, 'oltre-5000');
  const anticipi = DATI.categorie.find((c) => c.id === 'anticipi');
  assert.deepStrictEqual([50000, 50001, 200000, 200001].map((x) => U.classe(anticipi, x).id), ['fino-50000', '50000-200000', '50000-200000', 'oltre-200000']);
  assert.strictEqual(U.classe(DATI.categorie.find((c) => c.id === 'mutui'), 100000), null); // fisso o variabile lo sceglie l'utente
  assert.strictEqual(U.classe(DATI.categorie.find((c) => c.id === 'revolving')).id, 'unica');

  const cp = U.verifica(DATI, { categoria: 'credito-personale', data: '2026-08-10', tasso: 19 });
  assert.deepStrictEqual([cp.tegm, cp.soglia, cp.differenza, cp.esito], [11.68, 18.6, 0.4, 'oltre']);
  assert.strictEqual(U.verifica(DATI, { categoria: 'credito-personale', data: '2026-02-10', tasso: 18 }).esito, 'vicino'); // soglia 18,325
  assert.strictEqual(U.verifica(DATI, { categoria: 'mutui', classe: 'fisso', data: '2026-05-10', tasso: 4 }).esito, 'sotto');
  assert.strictEqual(U.verifica(DATI, { categoria: 'credito-personale', data: '2024-01-01', tasso: 5 }).errore, 'data');
  assert.strictEqual(U.righe(DATI, DATI.trimestri[0]).length, 24);
  // il 1° ottobre vale gia' il decreto nuovo
  assert.strictEqual(U.verifica(DATI, { categoria: 'mutui', classe: 'fisso', data: '2026-10-01', tasso: 9.6 }).soglia, 9.65);
});

test('pagina: tasso annuo dalla rata', () => {
  // 10.000 euro in 60 rate mensili da 212,47: circa il 10% nominale, 10,47% effettivo
  assert.ok(Math.abs(U.tassoDaRata(10000, 212.47, 60) - 10.47) < 0.02);
  // le spese iniziali alzano il tasso
  assert.ok(U.tassoDaRata(10000, 212.47, 60, 300) > U.tassoDaRata(10000, 212.47, 60));
  assert.strictEqual(U.tassoDaRata(1200, 100, 12), 0);
  assert.strictEqual(U.tassoDaRata(1200, 90, 12), null);
});
