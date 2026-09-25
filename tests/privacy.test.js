// tests/privacy.test.js — L'informativa privacy contiene quello che chiede
// l'art. 13 del GDPR: chi e' il titolare e come contattarlo, perche' e per
// quanto si trattano i dati, i trasferimenti fuori dall'UE, i diritti e il
// reclamo al Garante.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testoVisibile } = require('./helpers/contenuti.js');

const RADICE = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');

test('titolare e contatto per la privacy', () => {
  const t = testoVisibile(leggi('politica-sulla-privacy.html'));
  assert.match(t, /titolare del trattamento/i);
  assert.match(t, /privacy@strumentiutili\.it/);
  assert.match(t, /con sede in Italia/);
  assert.match(t, /Ultimo aggiornamento: \d{1,2} [a-z]+ 20\d\d/);
  // lo stesso indirizzo si trova anche dalla pagina dei contatti
  assert.match(testoVisibile(leggi('contatti.html')), /privacy@strumentiutili\.it/);
});

test('basi giuridiche, conservazione, trasferimenti, diritti e Garante', () => {
  const t = testoVisibile(leggi('politica-sulla-privacy.html'));
  assert.match(t, /art\. 6, par\. 1, lett\. a/);
  assert.match(t, /legittimo interesse/);
  assert.match(t, /non oltre 12 mesi/);
  assert.match(t, /fuori dall.Unione europea/);
  assert.match(t, /da 15 a 22 del GDPR/);
  assert.match(t, /Garante per la protezione dei dati personali/);
  assert.match(t, /responsabile del trattamento \(art\. 28/);
});
