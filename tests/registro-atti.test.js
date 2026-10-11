// tests/registro-atti.test.js — Le pagine dei modelli per registrare
// contratti e atti (RLI, 69, RAP), riscritte sulle istruzioni ufficiali, le
// schede dell'Agenzia e Normattiva (ottobre 2026). Ogni test ferma un errore
// che c'era nella versione precedente.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./helpers/contenuti.js');

const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const RLI = 'cittadino-tasse/modello-rli/index.html';

test('RLI: la guida ha le sezioni e il modello compilato', () => {
  const s = leggi(RLI);
  for (const id of ['chi-quando', 'quanto-si-paga', 'esempi', 'cedolare', 'campo-per-campo', 'adempimenti', 'ritardi', 'dal-2027']) {
    assert.ok(s.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(s, /src="\/assets\/esempi\/rli-cedolare-l1\.webp" width="1100" height="\d+"/);
});

test('RLI: L2 e cedolare al 10% solo nei comuni ad alta tensione abitativa', () => {
  const t = C.testoVisibile(leggi(RLI));
  // prima: «L2 - Locazione abitativa agevolata (3+2)» e «il 10% con il canone
  // concordato», senza la condizione del comune (L. 431/1998 art. 8;
  // D.Lgs. 23/2011 art. 3, c. 2; istruzioni RLI)
  assert.doesNotMatch(t, /agevolata \(3\+2\)|o il 10% con il canone concordato/);
  // ogni volta che si parla di L2 con il 70% o le agevolazioni, il comune ad
  // alta tensione abitativa compare li' accanto
  for (const m of t.matchAll(/\bL2\b/g)) {
    const pezzo = t.slice(Math.max(0, m.index - 120), m.index + 220);
    if (/70%|agevolazion/.test(pezzo)) assert.match(pezzo, /alta tensione abitativa/, pezzo);
  }
  assert.match(t, /10% per i contratti a canone concordato su abitazioni nei comuni con carenza di abitazioni/);
});

test('RLI: niente affermazioni senza fonte, e quelle corrette al loro posto', () => {
  const t = C.testoVisibile(leggi(RLI));
  // la detrazione per l'inquilino legata alla registrazione non era verificata
  assert.doesNotMatch(t, /non pu[oò] avere le detrazioni/);
  // l'agente immobiliare e' obbligato per i contratti mediati (TUR art. 10, d-bis)
  assert.match(t, /agente immobiliare per i contratti conclusi con la sua mediazione/);
  // la raccomandata non serve se la rinuncia e' gia' nel contratto (istruzioni RLI)
  assert.match(t, /La raccomandata non serve se la rinuncia è già scritta nel contratto/);
  // con la cedolare la risoluzione e' gratuita solo se tutti i locatori l'avevano
  assert.match(t, /se tutti i locatori l’avevano scelta/);
  // il termine: firma o decorrenza, se anteriore (scheda dell'Agenzia)
  assert.match(t, /30 giorni dalla firma, oppure dalla decorrenza del contratto se è anteriore/);
});

test('RLI: l\'esempio del terreno e quello del minimo tornano col motore', () => {
  const I = require('../js/rli-imposte.js');
  const R = JSON.parse(leggi('data/regole-fiscali-2026.json')).rli_parametri;
  assert.strictEqual(I.calcola({ canone: 42000, tipo: 'T1' }, R).registro, 210);    // FAQ dell'Agenzia, 7 × 6.000
  assert.strictEqual(I.calcola({ canone: 3000, tipo: 'L1' }, R).registro, 67);
  assert.strictEqual(I.calcola({ canone: 7500, tipo: 'L2', pagine: 4, copie: 2 }, R).registro, 105);
  const t = C.testoVisibile(leggi(RLI));
  assert.match(t, /0,50% di 42\.000 = 210 €/);
  assert.match(t, /7\.500 × 70% × 2% = 105 €/);
});

// --- modello RAP --------------------------------------------------------------
const RAP = 'cittadino-tasse/modello-rap/index.html';
const M69 = 'cittadino-tasse/modello-69/index.html';

/** La data «AAAA-MM-GG» spostata di n giorni, senza fusi orari di mezzo. */
function piuGiorni(iso, n) {
  const [a, m, g] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g + n));
  return { iso: d.toISOString().slice(0, 10), festivo: d.getUTCDay() === 0 || d.getUTCDay() === 6 };
}

const euro = (n) => n.toFixed(2).replace('.', ',');

test('RAP: la guida ha le sezioni e il modello compilato', () => {
  const s = leggi(RAP);
  for (const id of ['quali-atti', 'comodato-imu', 'preliminare', 'come-si-presenta', 'campo-per-campo', 'esempi', 'eventi', 'controlli', 'ritardi', 'dal-2027']) {
    assert.ok(s.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(s, /src="\/assets\/esempi\/rap-comodato-figlio\.webp" width="1100" height="\d+"/);
});

test('RAP: il preliminare paga lo 0,5% su caparra e acconti dal 2025, non piu\' il 3% sugli acconti', () => {
  // prima: «lo 0,50% sulla caparra confirmatoria e il 3% sugli acconti non
  // soggetti a IVA», la regola in vigore fino al 31/12/2024 (nota all'art. 10
  // della Tariffa, D.Lgs. 139/2024; circolare 2/E del 14/3/2025)
  const testi = C.tutteLePagine().map((p) => [p.percorso, C.testoVisibile(p.html)]);
  testi.push(['data/modello-rap-schema.json', leggi('data/modello-rap-schema.json')]);
  for (const [dove, t] of testi) {
    for (const m of t.matchAll(/3 ?% sugli acconti/g)) {
      const pezzo = t.slice(Math.max(0, m.index - 200), m.index + 200);
      assert.match(pezzo, /fino al 31 dicembre 2024|fino al 2024/, dove + ': ' + pezzo);
    }
  }
  const t = C.testoVisibile(leggi(RAP));
  assert.match(t, /caparra confirmatoria e acconti di prezzo non soggetti a IVA: lo 0,5%/);
  assert.match(t, /200 \+ 0,5% di 20\.000 = 300 €/);
  assert.match(t, /200 \+ 150 \(0,5% di 30\.000\) \+ 150 \(3% di 5\.000\) = 500 €/);
  assert.strictEqual(200 + 20000 * 0.005, 300);
  assert.strictEqual(200 + 30000 * 0.005 + 5000 * 0.03, 500);
  // l'imposta dello 0,5% si scala da quella del rogito (nota all'art. 10)
  assert.match(t, /si scala dall’imposta principale dovuta per la registrazione del contratto definitivo/);
});

test('RAP: lo sconto IMU del comodato con tutte le condizioni del comma 747', () => {
  const s = leggi(RAP);
  const t = C.testoVisibile(s);
  // prima mancavano la residenza del comodante nello stesso comune e il
  // coniuge con figli minori (L. 160/2019, art. 1, c. 747, lett. c), e si
  // parlava di «comodato a parenti»
  assert.match(t, /ha la residenza e vive abitualmente nello stesso comune/);
  assert.match(t, /figlio o a un genitore/);
  assert.match(t, /non è di categoria A\/1, A\/8 o A\/9/);
  assert.match(t, /continua per il suo coniuge, quando ci sono figli minori/);
  assert.doesNotMatch(s, /comodato a parenti/);
  // l'esempio: rendita 600, moltiplicatore 160 (c. 745), aliquota di base 0,86% (c. 754)
  const base = 600 * 1.05 * 160;
  assert.strictEqual(base, 100800);
  assert.match(t, /600 × 1,05 × 160 = 100\.800 €/);
  assert.match(t, new RegExp(euro(Math.round(base * 0.0086 * 100) / 100) + ' €'));
  assert.match(t, new RegExp(euro(Math.round(base / 2 * 0.0086 * 100) / 100) + ' €'));
});

test('RAP: 200 euro fissi e bollo solo sul comodato scritto (schede dell\'Agenzia)', () => {
  const t = C.testoVisibile(leggi(RAP));
  // prima la pagina non diceva quanto costa: «imposta di registro in misura fissa»
  assert.match(t, /200 € fissi/);
  assert.match(t, /Il comodato verbale paga solo i 200 euro/);
  assert.match(t, /16 euro ogni 4 facciate scritte e comunque ogni 100 righe/);
  // il verbale degli utili si presenta solo online
  assert.match(t, /Il verbale degli utili si presenta solo online/);
});

test('RAP e 69: gli atti privati si pagano con l\'F24, sezione Erario (codice 1550), non con l\'F24 ELIDE', () => {
  // prima: «L'imposta di registro sugli atti privati si versa con il modello
  // F24 Elide» (risoluzione 9/E del 20/2/2020: codici 1550-1554, sezione Erario)
  for (const p of C.tutteLePagine()) {
    assert.doesNotMatch(C.testoVisibile(p.html), /atti privati si versa con il modello F24 Elide/i, p.percorso);
  }
  for (const f of [RAP, M69]) {
    const t = C.testoVisibile(leggi(f));
    assert.match(t, /1550/, f);
    assert.match(t, /1552/, f);
    assert.match(t, /sezione Erario/, f);
  }
});

test('RAP e 69: le sanzioni delle tabelle tornano con il 45% e il 120% e le riduzioni del ravvedimento', () => {
  // TUR art. 69 (violazioni dal 1/9/2024) e D.Lgs. 472/1997 art. 13
  const sanzione = (registro, oltre30) => Math.max(oltre30 ? 250 : 150, registro * (oltre30 ? 1.2 : 0.45));
  const r = (n) => euro(Math.round(n * 100) / 100);
  const rap = C.testoVisibile(leggi(RAP));
  assert.strictEqual(sanzione(200, false), 150);
  assert.strictEqual(sanzione(200, true), 250);
  for (const [n, d] of [[150, 10], [250, 9], [250, 8], [250, 7]]) assert.ok(rap.includes(r(n / d) + ' €'), r(n / d));
  const m69 = C.testoVisibile(leggi(M69));
  assert.strictEqual(sanzione(370, false), 166.5);
  assert.strictEqual(Math.round(sanzione(370, true) * 100) / 100, 444);
  for (const [n, d] of [[166.5, 1], [166.5, 10], [444, 1], [444, 9], [444, 8], [444, 7]]) assert.ok(m69.includes(r(n / d) + ' €'), r(n / d));
});

test('RAP e 69: le scadenze degli esempi sono calcolate giuste e non cadono di sabato o di domenica', () => {
  // 30 giorni dalla stipula (TUR art. 13), 60 per gli atti formati all'estero
  const casi = [
    [RAP, '2026-10-20', 30, '19 novembre 2026'],
    [RAP, '2026-11-04', 30, '4 dicembre 2026'],
    [M69, '2026-10-12', 30, '11 novembre 2026'],
    [M69, '2026-09-07', 60, '6 novembre 2026'],
  ];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  for (const [f, da, n, scritto] of casi) {
    const fine = piuGiorni(da, n);
    const [a, m, g] = fine.iso.split('-').map(Number);
    assert.strictEqual(`${g} ${MESI[m - 1]} ${a}`, scritto);
    assert.ok(!fine.festivo, scritto);
    assert.ok(C.testoVisibile(leggi(f)).includes(scritto), f + ': ' + scritto);
  }
});

// --- modello 69 ---------------------------------------------------------------

test('69: per affitti, proroghe, cessioni e risoluzioni la pagina rimanda al modello RLI', () => {
  const s = leggi(M69);
  const t = C.testoVisibile(s);
  // prima: «Per prorogarlo, cederlo o risolverlo compili questo Modello 69» e
  // il titolo «proroga, cessione e risoluzione del contratto di locazione».
  // La scheda «Registrazione atti - Come si registra»: per le locazioni e gli
  // adempimenti successivi «deve essere, invece, adoperato il modello RLI»
  assert.doesNotMatch(t, /Per prorogarlo, cederlo o risolverlo compili/i);
  assert.match(t, /«deve essere, invece, adoperato il modello RLI»/);
  assert.doesNotMatch(s.match(/<title>[^<]*<\/title>/)[0], /proroga|risoluzione/i);
  // le istruzioni del 2011 citano la cedolare al 19%: la pagina lo segnala
  assert.match(t, /cedolare al 19% per il canone concordato, che oggi è al 10%/);
  const schema = leggi('data/modello-69-schema.json');
  assert.match(schema, /l'Agenzia indica il modello RLI/);
});

test('69: sezioni, termini, arrotondamento e minimo come nel D.P.R. 131/1986', () => {
  const s = leggi(M69);
  for (const id of ['quale-modello', 'quali-atti', 'quanto-si-paga', 'come-si-presenta', 'campo-per-campo', 'esempi', 'controlli', 'ritardi', 'dal-2027']) {
    assert.ok(s.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(s, /src="\/assets\/esempi\/modello-69-scrittura-privata\.webp" width="1100" height="\d+"/);
  const t = C.testoVisibile(s);
  // art. 13: 30 giorni in Italia, 60 all'estero; art. 41: arrotondamento all'euro
  assert.match(t, /30 giorni dalla data dell’atto se è formato in Italia, 60 se è formato all’estero/);
  assert.strictEqual(Math.round(12345 * 0.03), 370);
  assert.match(t, /3% = 370,35 €, che si arrotonda per difetto a 370 €/);
  // art. 41, c. 2: mai sotto la misura fissa
  assert.match(t, /il 3% sarebbe 120 €, ma l’imposta principale non può scendere sotto la misura fissa, quindi si pagano 200 €/);
});
