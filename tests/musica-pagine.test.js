// tests/musica-pagine.test.js — Accordatore e metronomo: gli elementi che gli
// script cercano esistono, il microfono si chiede solo al clic, tutto e' nel
// precache per funzionare offline.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');
const PAGINE = {
  accordatore: { html: leggi('utilita-web/accordatore/index.html'), ui: leggi('js/accordatore-ui.js'), motore: 'intonazione.js' },
  metronomo: { html: leggi('utilita-web/metronomo/index.html'), ui: leggi('js/metronomo-ui.js'), motore: 'metronomo.js' }
};

for (const [nome, p] of Object.entries(PAGINE)) {
  test(nome + ': ogni id usato dallo script esiste nella pagina', () => {
    const usati = new Set([...p.ui.matchAll(/el\('([a-z-]+)'\)/g)].map((m) => m[1]));
    assert.ok(usati.size >= 6);
    for (const id of usati) assert.ok(p.html.includes('id="' + id + '"'), id);
  });

  test(nome + ': prima il motore, poi l interfaccia', () => {
    const ordine = [...p.html.matchAll(/<script defer src="\/js\/([^"]+)"/g)].map((m) => m[1]);
    assert.ok(ordine.indexOf(p.motore) >= 0 && ordine.indexOf(p.motore) < ordine.indexOf(nome + '-ui.js'));
  });

  test(nome + ': nel precache del service worker', () => {
    const sw = leggi('sw.js');
    for (const u of ['/utilita-web/' + nome + '/', '/js/' + p.motore, '/js/' + nome + '-ui.js']) assert.ok(sw.includes("'" + u + "'"), u);
  });
}

test('il microfono si chiede solo quando si preme Avvia', () => {
  const ui = PAGINE.accordatore.ui;
  const chiamate = [...ui.matchAll(/getUserMedia\(/g)].length;
  assert.strictEqual(chiamate, 1);
  const avvia = ui.slice(ui.indexOf('function avvia()'), ui.indexOf('function ferma()'));
  assert.ok(avvia.includes('getUserMedia('), 'getUserMedia fuori da avvia()');
  // e si spegne davvero: le tracce si fermano
  assert.ok(ui.includes('getTracks().forEach(function (t) { t.stop(); })'));
  // niente elaborazione di rumore o eco del browser, che falserebbe la nota
  assert.ok(/echoCancellation: false, noiseSuppression: false, autoGainControl: false/.test(ui));
});

test('le impostazioni restano in chiavi su_', () => {
  assert.ok(PAGINE.accordatore.ui.includes("CHIAVE = 'su_accordatore'"));
  assert.ok(PAGINE.metronomo.ui.includes("CHIAVE = 'su_metronomo'"));
});
