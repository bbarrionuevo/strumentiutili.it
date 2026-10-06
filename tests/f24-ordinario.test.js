// tests/f24-ordinario.test.js — Gli errori trovati rileggendo le fonti dell'F24
// ordinario e dell'indice dei modelli (ottobre 2026), perche' non tornino.
//
// Fonti lette:
// - D.Lgs. 241/1997, art. 20: rate mensili da completare entro il 16 dicembre
//   (D.Lgs. 1/2024, dal saldo del 2023); le avvertenze del modello dicono
//   ancora novembre;
// - esempio ufficiale del codice 3800: il Lazio ha il codice regione 08;
// - L. 388/2000, art. 34: limite annuo dei crediti compensabili di 2 milioni
//   dal 2022; le avvertenze riportano ancora 516.456,90 euro;
// - CIVIS «Richiesta modifica delega F24»: esclude le sezioni INPS, altri enti
//   e IMU e altri tributi locali;
// - esempi ufficiali dei codici tributo: un totale senza importi resta vuoto e
//   il saldo di sezione ha il suo segno.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./helpers/contenuti.js');

const leggi = (p) => fs.readFileSync(path.join(C.RADICE, p), 'utf8');
const SCHEMI = fs.readdirSync(path.join(C.RADICE, 'data'))
  .filter((f) => /^modell.*-schema\.json$/.test(f))
  .map((f) => ({ percorso: 'data/' + f, testo: leggi('data/' + f) }));
const pagine = () => C.tutteLePagine().map((p) => ({ percorso: p.percorso, testo: C.testoVisibile(p.html), html: p.html }));

test('le rate di saldo e acconto non finiscono piu\' a novembre', () => {
  const sbagliate = pagine().filter((p) => /rat[ae][^.;]{0,80}(fino a|entro) novembre/i.test(p.testo)).map((p) => p.percorso);
  assert.deepStrictEqual(sbagliate, []);
  const ord = leggi('cittadino-tasse/f24-editabile/f24-ordinario/index.html');
  assert.match(ord, /entro il 16 dicembre/);
});

test('codice regione del Lazio: 08, non 12', () => {
  const tutti = [...SCHEMI, ...pagine()];
  assert.deepStrictEqual(tutti.filter((x) => /12 per il Lazio|03 per la Lombardia/.test(x.testo)).map((x) => x.percorso), []);
  assert.match(leggi('data/modello-f24-ordinario-schema.json'), /08 per il Lazio/);
});

test('il vecchio limite di 516.456,90 euro compare solo come limite superato', () => {
  for (const x of [...SCHEMI, ...pagine()]) {
    for (const m of x.testo.matchAll(/516\.456,90/g)) {
      const intorno = x.testo.slice(Math.max(0, m.index - 120), m.index + 40);
      assert.match(intorno, /vecchio limite/, x.percorso + ': ' + intorno);
    }
  }
});

test('la correzione con CIVIS non vale per IMU e INPS', () => {
  const sbagliate = pagine().filter((p) => /CIVIS o in un ufficio/.test(p.testo)).map((p) => p.percorso);
  assert.deepStrictEqual(sbagliate, []);
  for (const p of ['cittadino-tasse/f24-editabile/', 'cittadino-tasse/f24-editabile/f24-ordinario/']) {
    const t = C.testoVisibile(leggi(p + 'index.html'));
    assert.match(t, /non vale per le sezioni INPS/, p);
  }
});

test('l\'arrotondamento dell\'IMU non viene attribuito al modello ne\' al compilatore', () => {
  const ord = leggi('cittadino-tasse/f24-editabile/f24-ordinario/index.html');
  assert.doesNotMatch(ord, /Il compilatore lo fa da solo/);
  assert.doesNotMatch(ord, /istruzioni del modello chiedono di arrotondare/);
  assert.doesNotMatch(ord, /con arrotondamento dei tributi locali/);
});

test('ogni saldo di sezione con crediti ha la casella del segno', () => {
  for (const f of ['data/modello-f24-ordinario-schema.json', 'data/modello-f24-accise-schema.json']) {
    const schema = JSON.parse(leggi(f));
    for (const modello of Object.values(schema.modelli)) {
      for (const passo of modello.passi) {
        const conCrediti = (passo.ripetibili || []).some((g) => g.sottocampi.some((s) => s.id === 'credito'));
        if (!conCrediti) continue;
        const saldo = (passo.campi || []).find((c) => c.calcolo && c.calcolo.differenza);
        assert.ok(saldo, f + ' ' + passo.id + ': manca il saldo');
        assert.strictEqual(saldo.pdfSegno, passo.id + '_segno', f + ' ' + passo.id);
      }
    }
  }
});

test('il compilatore lascia vuoti i totali senza importi e scrive il segno', () => {
  const js = leggi('js/compilatore-moduli.js');
  assert.match(js, /function calcoloHaValori/);
  assert.match(js, /pdfSegno, importo < 0 \? '-' : '\+'/);
});

test('la pagina dell\'F24 ordinario ha campo per campo, codici, rate, compensazione ed esempi', () => {
  const ord = leggi('cittadino-tasse/f24-editabile/f24-ordinario/index.html');
  for (const id of ['campo-per-campo', 'codici', 'rate', 'compensazione', 'dove-si-paga', 'esempi', 'errori', 'correzioni']) {
    assert.ok(ord.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(ord, /857,14/, 'l\'esempio ufficiale del codice 4001');
  assert.match(ord, /2 milioni di euro/);
  assert.match(ord, /50\.000 &euro;/);
  assert.match(ord, /src="\/assets\/esempi\/f24-ordinario-compensazione\.webp"/);
});

// Dal 1° gennaio 2027 gli articoli citati (artt. 17 e 20 D.Lgs. 241/1997,
// art. 34 L. 388/2000, art. 37 D.L. 223/2006...) sono abrogati dal D.Lgs.
// 33/2025: lo dice il testo multivigente di Normattiva salvato dalla
// sentinella. Finche' la pagina non e' riscritta, deve avvisarlo, e la
// sentinella ha il promemoria per farlo in tempo.
test('le pagine F24 avvisano del cambio di norme del 2027', () => {
  const R = JSON.parse(leggi('data/fonti-monitorate.json'));
  assert.ok(R.scadenze.some((s) => s.id === 'versamenti-2027-dlgs-33-2025'));
  const oggi = new Date().toISOString().slice(0, 10);
  if (oggi >= '2027-01-01') return; // dal 2027 l'avviso va tolto insieme alla riscrittura
  for (const p of ['cittadino-tasse/f24-editabile/f24-ordinario/', 'cittadino-tasse/f24-editabile/', 'cittadino-tasse/f24-editabile/f24-semplificato/']) {
    assert.match(C.testoVisibile(leggi(p + 'index.html')), /1° gennaio 2027[\s\S]{0,200}D\.Lgs\. 33\/2025/i, p);
  }
});
