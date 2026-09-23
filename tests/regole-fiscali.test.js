// tests/regole-fiscali.test.js — Integrità di data/regole-fiscali-2026.json.
// È la fonte di verità di tutte le calcolatrici: se si rompe qui, si rompe
// ovunque. Questi test non congelano valori, controllano la forma dei dati.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { caricaScript, regoleFiscali, RADICE } = require('./helpers/carica-script.js');

const { window } = caricaScript(['js/irpef.js']);
const IRPEF = window.StrumentiIrpef;
const regole = regoleFiscali();

test('il file e JSON valido con i metadati attesi', () => {
  assert.strictEqual(typeof regole.meta, 'object');
  assert.strictEqual(regole.meta.anno, 2026);
  assert.match(String(regole.meta.versione), /^\d+\.\d+\.\d+$/);
});

test('gli scaglioni IRPEF sono coerenti', () => {
  const scaglioni = regole.irpef.scaglioni;
  assert.ok(Array.isArray(scaglioni) && scaglioni.length >= 2, 'servono almeno due scaglioni');

  // limiti crescenti, ultimo aperto
  let precedente = 0;
  scaglioni.forEach((s, i) => {
    const ultimo = i === scaglioni.length - 1;
    if (ultimo) {
      assert.strictEqual(s.limite, null, 'l ultimo scaglione deve avere limite null');
    } else {
      assert.ok(typeof s.limite === 'number' && s.limite > precedente,
        `limite non crescente nello scaglione ${i}`);
      precedente = s.limite;
    }
    assert.ok(s.aliquota > 0 && s.aliquota < 1, `aliquota fuori scala nello scaglione ${i}`);
  });

  // aliquote progressive
  for (let i = 1; i < scaglioni.length; i++) {
    assert.ok(scaglioni[i].aliquota >= scaglioni[i - 1].aliquota,
      `l aliquota cala nello scaglione ${i}: non sarebbe progressiva`);
  }
});

test('il campo base di ogni scaglione e coerente con il calcolo progressivo', () => {
  // Array.from: il risultato nasce nel contesto vm, quindi ha un altro
  // Array.prototype e deepStrictEqual lo rifiuterebbe anche se vuoto.
  const incoerenze = Array.from(IRPEF.verificaBasiScaglioni(regole.irpef));
  assert.strictEqual(incoerenze.length, 0,
    'aggiornate le aliquote senza aggiornare le basi: ' + JSON.stringify(incoerenze));
});

test('le aliquote locali medie sono plausibili', () => {
  const locali = regole.irpef.aliquoteMedieLocali;
  assert.ok(locali.regionale > 0 && locali.regionale < 0.05, 'addizionale regionale fuori scala');
  assert.ok(locali.comunale >= 0 && locali.comunale < 0.02, 'addizionale comunale fuori scala');
});

test('le tariffe del bollo auto presenti sono numericamente valide', () => {
  const regioni = regole.bollo_auto_2026.regioni;
  const nomi = Object.keys(regioni);
  assert.ok(nomi.includes('nazionale'), 'manca la tariffa nazionale di ripiego');
  for (const nome of nomi) {
    const classi = regioni[nome].classi_euro;
    assert.ok(classi && Object.keys(classi).length > 0, `nessuna classe euro per ${nome}`);
    for (const [classe, tariffe] of Object.entries(classi)) {
      assert.ok(Number.isFinite(tariffe.tariffa_base) && tariffe.tariffa_base > 0,
        `tariffa_base non valida in ${nome}/${classe}`);
      assert.ok(Number.isFinite(tariffe.tariffa_eccedente) && tariffe.tariffa_eccedente > 0,
        `tariffa_eccedente non valida in ${nome}/${classe}`);
      assert.ok(tariffe.tariffa_eccedente >= tariffe.tariffa_base,
        `in ${nome}/${classe} la tariffa oltre i 100 kW e piu bassa di quella base`);
    }
  }
});

test('i parametri TFR sono presenti e sensati', () => {
  assert.ok(regole.tfr.divisoreFisso > 13 && regole.tfr.divisoreFisso < 14,
    'il divisore del TFR deve essere circa 13,5');
  assert.ok(regole.tfr.rivalsaInps >= 0 && regole.tfr.rivalsaInps < 0.05);
});

test('nessun valore numerico e NaN o Infinity in tutto il file', () => {
  const problemi = [];
  (function scorri(nodo, percorso) {
    if (typeof nodo === 'number') {
      if (!Number.isFinite(nodo)) problemi.push(percorso);
    } else if (nodo && typeof nodo === 'object') {
      for (const [chiave, valore] of Object.entries(nodo)) {
        scorri(valore, percorso ? `${percorso}.${chiave}` : chiave);
      }
    }
  })(regole, '');
  assert.deepStrictEqual(problemi, []);
});

// Quello che resta da fare: cinque Regioni deliberano tariffe proprie che non
// abbiamo ancora caricato (abruzzo, calabria, emilia_romagna, liguria, veneto).
// Per loro il calcolo usa la tariffa nazionale e lo dichiara con un avviso, ma
// il numero resta indicativo. Le altre dodici applicano davvero la tariffa
// nazionale, quindi per loro non manca niente.
test('le Regioni con tariffa propria hanno le tariffe caricate', { todo: 'mancano 5 Regioni su 9' }, () => {
  const b = regole.bollo_auto_2026;
  const mancanti = b.regioni_con_tariffa_propria.filter((r) => !b.regioni[r]);
  assert.deepStrictEqual(mancanti, [], 'tariffe da caricare dal tariffario ACI: ' + mancanti.join(', '));
});

// Questo invece deve valere sempre: ogni pagina generata deve almeno comparire
// nell elenco regioniSEO, altrimenti e una pagina orfana anche nei dati.
test('ogni pagina regionale corrisponde a una voce di regioniSEO', () => {
  const slugSEO = Object.values(regole.bollo_auto_2026.regioniSEO).map((r) => r.slug);
  const cartelle = fs.readdirSync(path.join(RADICE, 'cittadino-tasse'))
    .filter((n) => n.startsWith('calcolo-bollo-auto-'))
    .map((n) => n.replace('calcolo-bollo-auto-', ''));
  const sconosciute = cartelle.filter((slug) => !slugSEO.includes(slug));
  assert.deepStrictEqual(sconosciute, [], 'pagine senza voce in regioniSEO: ' + sconosciute.join(', '));
});

// --- Tariffe regionali del bollo ------------------------------------------
// Il difetto: 17 pagine regionali su 20 calcolavano la tariffa nazionale
// mentre titolo e H1 promettevano un calcolo regionale, senza dirlo. Adesso
// la ricaduta sulla tariffa nazionale viene dichiarata, e per le Regioni che
// hanno tariffe proprie non ancora caricate diventa un avviso.

test('l elenco delle Regioni con tariffa propria esiste ed e coerente', () => {
  const b = regole.bollo_auto_2026;
  assert.ok(Array.isArray(b.regioni_con_tariffa_propria), 'manca regioni_con_tariffa_propria');
  assert.ok(b.regioni_con_tariffa_propria.length >= 5);

  // ogni Regione con tariffe caricate deve comparire nell elenco
  const caricate = Object.keys(b.regioni).filter((r) => r !== 'nazionale');
  const fuori = caricate.filter((r) => !b.regioni_con_tariffa_propria.includes(r));
  assert.deepStrictEqual(fuori, [],
    'ci sono tariffe caricate per Regioni non dichiarate come aventi tariffa propria');
});

test('le tariffe caricate sono coerenti fra classi Euro', () => {
  const b = regole.bollo_auto_2026;
  for (const [nome, dati] of Object.entries(b.regioni)) {
    const c = dati.classi_euro;
    // piu vecchio e il veicolo, piu alta la tariffa
    assert.ok(c.euro_0.tariffa_base >= c.euro_3.tariffa_base,
      nome + ': Euro 0 dovrebbe costare piu di Euro 3');
    assert.ok(c.euro_3.tariffa_base >= c.euro_4_5_6.tariffa_base,
      nome + ': Euro 3 dovrebbe costare piu di Euro 4-6');
    // oltre i 100 kW si paga di piu
    for (const [classe, t] of Object.entries(c)) {
      assert.ok(t.tariffa_eccedente > t.tariffa_base,
        nome + '/' + classe + ': la tariffa oltre i 100 kW deve essere maggiore');
    }
  }
});

test('la fonte ufficiale per le tariffe mancanti e indicata', () => {
  assert.match(regole.bollo_auto_2026.fonte_ufficiale || '', /aci.it/,
    'senza una fonte da citare l avviso sulle tariffe mancanti non aiuta nessuno');
});

test('js/bollo-auto.js dichiara quale tariffa sta usando', () => {
  const codice = fs.readFileSync(path.join(RADICE, 'js', 'bollo-auto.js'), 'utf8');
  assert.match(codice, /mostraOrigine/, 'manca la funzione che dichiara la tariffa');
  assert.match(codice, /nazionale_provvisoria/, 'manca il caso della Regione con tariffe non caricate');
  assert.match(codice, /regioni_con_tariffa_propria/, 'il codice non legge l elenco dal JSON');
});

test('tutte le pagine del bollo mostrano l origine della tariffa', () => {
  const dir = path.join(RADICE, 'cittadino-tasse');
  const pagine = fs.readdirSync(dir).filter((n) => n.startsWith('calcolo-bollo-auto'));
  const senza = pagine.filter((n) => {
    const f = path.join(dir, n, 'index.html');
    if (!fs.existsSync(f)) return false;
    return !fs.readFileSync(f, 'utf8').includes('id="res-origine"');
  });
  assert.deepStrictEqual(senza, [], 'pagine che calcolano senza dire quale tariffa applicano');
});
