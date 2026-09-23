// tests/pdf-corpo-carattere.test.js — Corpo del carattere nei PDF dell'Agenzia.
//
// Il difetto: nei moduli compilabili dell'Agenzia la stringa /DA di ogni campo
// scrive la barra del nome del carattere sfuggita in ottale ("\057Helv 0 Tf"
// invece di "/Helv 0 Tf"). pdf-lib non la riconosce, setFontSize() lancia
// "No Tf operator found" e il corpo resta automatico: pdf-lib allora ingrandisce
// il testo finche' riempie il riquadro, quindi piu' il testo e' corto piu' le
// lettere diventano grandi. Nel F24 Elide la provincia usciva a 16pt dentro un
// riquadro alto 12, tagliata sopra e sotto.
//
// Qui si collaudano le due parti pure del rimedio, estratte dal sorgente che
// gira davvero in pagina: l'espressione regolare che legge il /DA e la formula
// che sceglie la misura.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const SORGENTE = fs.readFileSync(path.join(RADICE, 'js', 'compilatore-moduli.js'), 'utf8');

const BARRA = String.fromCharCode(92);

// --- estrazione dal sorgente ------------------------------------------------

function regexDalSorgente() {
  const m = SORGENTE.match(/const RE_TF = (\/.+\/);/);
  assert.ok(m, 'RE_TF non trovata in js/compilatore-moduli.js');
  return new Function('return ' + m[1])();
}

function formulaDalSorgente() {
  const i = SORGENTE.indexOf('function corpoPerAltezza(');
  assert.ok(i !== -1, 'corpoPerAltezza non trovata in js/compilatore-moduli.js');
  const fine = SORGENTE.indexOf('\n  }', i);
  const testo = SORGENTE.slice(i, fine + 4);
  return new Function(testo + '; return corpoPerAltezza;')();
}

const RE_TF = regexDalSorgente();
const corpoPerAltezza = formulaDalSorgente();

// Stringhe /DA osservate davvero nei 13 modelli dell'Agenzia.
const DA_REALI = [
  { da: BARRA + '057Helv 0 Tf 0 g',        fonte: 'Helv',    misura: 0,  resto: '0 g' },
  { da: BARRA + '057Helv 8 Tf 0 g',        fonte: 'Helv',    misura: 8,  resto: '0 g' },
  { da: BARRA + '057HeBo 10 Tf 0 g',       fonte: 'HeBo',    misura: 10, resto: '0 g' },
  { da: BARRA + '057Courier 0 Tf 0 0 0 rg', fonte: 'Courier', misura: 0,  resto: '0 0 0 rg' },
  { da: '/Helv 10 Tf 0 g',                 fonte: 'Helv',    misura: 10, resto: '0 g' }
];

test('l espressione regolare legge tutte le forme di /DA dei modelli', () => {
  for (const caso of DA_REALI) {
    const m = RE_TF.exec(caso.da);
    assert.ok(m, 'non riconosciuto: ' + JSON.stringify(caso.da));
    assert.strictEqual(m[1], caso.fonte, 'carattere sbagliato in ' + JSON.stringify(caso.da));
    assert.strictEqual(parseFloat(m[2]), caso.misura, 'misura sbagliata in ' + JSON.stringify(caso.da));
  }
});

test('il resto del /DA, cioe il colore, si puo conservare', () => {
  for (const caso of DA_REALI) {
    const m = RE_TF.exec(caso.da);
    const resto = caso.da.slice(m.index + m[0].length).trim();
    assert.strictEqual(resto, caso.resto, 'colore perso in ' + JSON.stringify(caso.da));
  }
});

test('la misura ricavata combacia con quella che l Agenzia dichiara', () => {
  // I campi degli importi dei modelli F24 stanno in riquadri alti 10,5 e
  // l'Agenzia ci scrive 8pt: la formula deve arrivare allo stesso numero.
  assert.strictEqual(corpoPerAltezza(10.5), 8);
  // Nei riquadri alti degli AA4/8 e AA5/6 l'Agenzia dichiara 10pt.
  assert.strictEqual(corpoPerAltezza(18.1), 10);
  assert.strictEqual(corpoPerAltezza(18), 10);
});

test('la misura resta dentro limiti leggibili', () => {
  for (let h = 1; h <= 60; h += 0.5) {
    const corpo = corpoPerAltezza(h);
    assert.ok(corpo >= 6 && corpo <= 10, 'altezza ' + h + ' -> ' + corpo);
  }
});

test('la misura non supera mai l altezza del riquadro', () => {
  // E' il difetto di partenza: 16pt in un riquadro alto 12.
  for (let h = 8; h <= 60; h += 0.5) {
    assert.ok(corpoPerAltezza(h) <= h, 'altezza ' + h + ' -> ' + corpoPerAltezza(h));
  }
});

test('riquadri piu alti non danno mai un corpo piu piccolo', () => {
  let precedente = 0;
  for (let h = 1; h <= 40; h += 0.5) {
    const corpo = corpoPerAltezza(h);
    assert.ok(corpo >= precedente, 'cala a ' + h);
    precedente = corpo;
  }
});

test('altezza mancante o assurda non produce NaN', () => {
  for (const h of [0, null, undefined, NaN, -5]) {
    const corpo = corpoPerAltezza(h);
    assert.ok(Number.isFinite(corpo) && corpo >= 6 && corpo <= 10,
      'altezza ' + String(h) + ' -> ' + corpo);
  }
});

// --- il rimedio deve restare collegato --------------------------------------

test('il compilatore chiama la correzione prima di scrivere il testo', () => {
  assert.match(SORGENTE, /fissaCorpoDelCampo\(campo\);/,
    'senza questa chiamata il corpo torna automatico e le lettere si tagliano');

  const iFissa = SORGENTE.indexOf('fissaCorpoDelCampo(campo);');
  const iSetText = SORGENTE.indexOf('campo.setText(', iFissa);
  assert.ok(iSetText > iFissa, 'la misura va fissata prima di setText');
});

test('la correzione riscrive il /DA invece di affidarsi a setFontSize', () => {
  // setFontSize() da sola non basta: sul /DA originale lancia sempre.
  assert.match(SORGENTE, /setDefaultAppearance\(/,
    'il /DA va riscritto: e l unico modo di aggirare il parser di pdf-lib');
});

test('i modelli dell Agenzia hanno ancora il /DA scritto in ottale', () => {
  // Se un giorno l'Agenzia pubblicasse i moduli con la barra normale, questo
  // test resterebbe verde lo stesso: serve solo a documentare che i PDF in
  // assets/pdf sono quelli su cui il rimedio e stato misurato.
  const cartella = path.join(RADICE, 'assets', 'pdf');
  const modelli = fs.readdirSync(cartella).filter((n) => n.startsWith('modello-') && n.endsWith('.pdf'));
  assert.ok(modelli.length >= 10, 'attesi almeno 10 modelli, trovati ' + modelli.length);

  const conOttale = modelli.filter((n) => {
    const grezzo = fs.readFileSync(path.join(cartella, n), 'latin1');
    return grezzo.includes(BARRA + '057Helv') || grezzo.includes(BARRA + '057HeBo') ||
           grezzo.includes(BARRA + '057Courier');
  });
  assert.ok(conOttale.length > 0,
    'nessun modello con il /DA in ottale: verificare se il rimedio serve ancora');
});
