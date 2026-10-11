// tests/accredito-rimborsi.test.js — La pagina per comunicare l'IBAN dei
// rimborsi, riscritta sulle istruzioni del modello, sulle schede dell'Agenzia
// (carta dei servizi, servizio web, FAQ) e su Normattiva (ottobre 2026). Ogni
// test ferma un errore che c'era nella versione precedente.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./helpers/contenuti.js');

const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PAGINA = 'cittadino-tasse/accredito-rimborsi/index.html';
const VALIDATORE = 'identita-burocrazia/validatore-iban/index.html';
const SCHEMA = 'data/modello-accredito-rimborsi-schema.json';

/** Una data ISO piu' n giorni, in UTC (nessun fuso orario sposta il giorno). */
function piuGiorni(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test('accredito: la guida ha le sezioni e il modello compilato', () => {
  const s = leggi(PAGINA);
  for (const id of ['con-e-senza-iban', 'tre-strade', 'il-conto', 'campo-per-campo', 'esempi', 'cartelle', 'stato']) {
    assert.ok(s.includes('id="' + id + '"'), 'manca #' + id);
  }
  assert.match(s, /src="\/assets\/esempi\/accredito-rimborsi-iban\.webp" width="1100" height="\d+"/);
});

test('accredito: il conto puo\' essere cointestato (servizio Check IBAN)', () => {
  const t = C.testoVisibile(leggi(PAGINA));
  // prima: «Non si può indicare il conto di un familiare, nemmeno del coniuge».
  // L'informativa del modello: Check IBAN verifica che il conto sia
  // «intestato o cointestato al codice fiscale del beneficiario»
  assert.doesNotMatch(t, /nemmeno del coniuge|conto di un familiare/);
  assert.match(t, /«intestato o cointestato» al codice fiscale di chi riceve il rimborso/);
  assert.match(t, /Un conto cointestato con il coniuge va quindi bene/);
  const conto = JSON.parse(leggi(SCHEMA)).modelli.RIMBORSI.passi.find((p) => p.id === 'conto');
  assert.match(conto.descrizione, /intestato o cointestato a te/);
  assert.doesNotMatch(conto.descrizione, /non accredita su conti di terzi/);
});

test('accredito: senza IBAN arriva l\'assegno vidimato, non «altre forme»', () => {
  const s = leggi(PAGINA);
  const t = C.testoVisibile(s);
  // prima: «in alcuni casi viene messo a disposizione in altre forme, molto più
  // lente», senza dire quali (scheda «Modalità erogazione rimborsi»)
  assert.doesNotMatch(t, /altre forme, molto più lente/);
  assert.match(t, /Assegno vidimato di Poste Italiane, spedito con raccomandata al domicilio fiscale/);
  assert.match(t, /Entro 60 giorni dall’emissione lo versi sul tuo conto o lo incassi in contanti/);
  // il vecchio sistema (contanti alla posta, vaglia) e' finito nel 2019: le
  // cifre compaiono solo accanto a quella data
  for (const cifra of ['1.549,37', '51.645,69']) {
    for (const m of t.matchAll(new RegExp(cifra.replace(/\./g, '\\.'), 'g'))) {
      assert.match(t.slice(Math.max(0, m.index - 120), m.index + 120), /2019/, cifra);
    }
  }
  // l'introduzione non promette un rimborso «dal 730» come se lo pagasse
  // sempre l'Agenzia: con un sostituto d'imposta lo paga il sostituto
  assert.doesNotMatch(t, /dal 730, da una dichiarazione/);
});

test('accredito: AIRE, società ed enti solo con il bonifico', () => {
  const t = C.testoVisibile(leggi(PAGINA));
  // scheda «Compilazione e invio via web»: l'accredito e' l'unica modalita' per
  // le persone giuridiche e per i residenti all'estero iscritti all'AIRE
  assert.match(t, /Residente all’estero iscritto all’AIRE, società, enti\s+Solo accredito sul conto/);
  assert.match(t, /iscritti all’AIRE il bonifico è l’unica modalità di pagamento/);
});

test('accredito: PEC solo dall\'interessato, delega solo allo sportello', () => {
  const t = C.testoVisibile(leggi(PAGINA));
  assert.match(t, /«di uso esclusivo dell’interessato»/);
  assert.match(t, /«attività non delegabile»/);
  assert.match(t, /Vale solo per la consegna allo sportello, mai con la PEC/);
  // i due percorsi dell'area riservata, come li scrivono istruzioni e scheda
  assert.match(t, /«Il tuo profilo – IBAN per accredito rimborsi»/);
  assert.match(t, /«Servizi per – Richiedere – Accredito rimborso e altre somme su c\/c»/);
});

test('accredito: l\'IBAN del validatore non torna qui, perche\' non si salva', () => {
  // js/storage-helper.js non salva i campi che per nome sono IBAN o codici
  // fiscali: il banner che riprendeva l'IBAN dal validatore non poteva comparire
  // e le due pagine promettevano «te lo ritrovi qui già pronto»
  const helper = leggi('js/storage-helper.js');
  const sorgente = helper.match(/const SENSIBILE = \/(.+)\/i;/)[1];
  const SENSIBILE = new RegExp(sorgente, 'i');
  assert.ok(SENSIBILE.test('iban-input'), 'il campo del validatore non e\' piu\' sensibile: rivedere il test');
  for (const f of [PAGINA, VALIDATORE]) {
    const s = leggi(f);
    assert.doesNotMatch(s, /ritrov[ai] (?:qui )?gi(?:à|&agrave;) pront/, f);
    assert.doesNotMatch(s, /validatore_iban_|ponte-iban/, f);
  }
  assert.match(C.testoVisibile(leggi(VALIDATORE)), /Per sicurezza l'IBAN non viene salvato/);
});

test('accredito: l\'esempio dell\'assegno scade 60 giorni dopo l\'emissione', () => {
  const t = C.testoVisibile(leggi(PAGINA));
  assert.strictEqual(piuGiorni('2026-10-20', 60), '2026-12-19');
  assert.match(t, /emesso il 20 ottobre 2026[^.]*\. L’assegno vale 60 giorni dall’emissione, cioè fino al 19 dicembre 2026/);
});

test('accredito: le cartelle, con le due regole e le loro norme', () => {
  const t = C.testoVisibile(leggi(PAGINA));
  // D.P.R. 602/1973 art. 28-ter: proposta dell'agente della riscossione e
  // sessanta giorni per accettarla; soglia di 1.500 euro (D.L. 78/2010, art.
  // 31) e regola dei 500 euro della riforma, legata a un regolamento del MEF
  assert.match(t, /Hai sessanta giorni per dire se la accetti/);
  assert.match(t, /non opera per i ruoli fino a 1\.500 euro \(D\.L\. 78\/2010, art\. 31\)/);
  assert.match(t, /\(D\.Lgs\. 110\/2024\) la lega invece ai rimborsi oltre 500 euro/);
  assert.match(t, /regolamento del Ministero dell’economia e delle finanze/);
});

test('accredito: i numeri dell\'assistenza come nelle FAQ dell\'Agenzia', () => {
  const t = C.testoVisibile(leggi(PAGINA));
  assert.match(t, /800\.90\.96\.96 da rete fissa/);
  assert.match(t, /06 97617689 da cellulare/);
  assert.match(t, /0039 0645470468 dall’estero/);
  assert.match(t, /dal lunedì al venerdì dalle 9 alle 17/);
});

test('accredito: lo schema dice come cambiare conto e annullare', () => {
  const R = JSON.parse(leggi(SCHEMA));
  assert.strictEqual(R.versione, '2026-10');
  const tipo = R.modelli.RIMBORSI.passi[0].campi.find((c) => c.id === 'tipo');
  assert.match(tipo.help, /si usa anche per indicare un conto nuovo/);
  assert.match(tipo.help, /il riquadro delle coordinate bancarie non va compilato/);
  const delega = R.modelli.RIMBORSI.passi.find((p) => p.id === 'delega');
  assert.match(delega.descrizione, /con l'invio via PEC la delega non e' ammessa/);
});
