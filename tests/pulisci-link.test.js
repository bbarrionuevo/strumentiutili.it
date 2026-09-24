// tests/pulisci-link.test.js — Il pulitore di link su casi veri.
const test = require('node:test');
const assert = require('node:assert');

const P = require('../js/pulisci-link.js');
const pulito = (u) => P.pulisciUrl(u).pulito;

test('toglie utm e identificativi di clic, lascia i parametri che servono alla pagina', () => {
  assert.strictEqual(
    pulito('https://www.esempio.it/articolo?id=42&utm_source=newsletter&utm_medium=email&fbclid=IwAR0abc'),
    'https://www.esempio.it/articolo?id=42');
  assert.strictEqual(pulito('https://negozio.it/p?gclid=Cj0K&colore=rosso'), 'https://negozio.it/p?colore=rosso');
  const r = P.pulisciUrl('https://esempio.it/?UTM_Source=x&q=pizza');
  assert.strictEqual(r.pulito, 'https://esempio.it/?q=pizza');
  assert.deepStrictEqual(r.rimossi.map((x) => x.nome), ['UTM_Source']);
});

test('senza parametri rimasti non resta un ? vuoto, e il frammento # si conserva', () => {
  assert.strictEqual(pulito('https://esempio.it/pagina?utm_campaign=x'), 'https://esempio.it/pagina');
  assert.strictEqual(pulito('https://esempio.it/pagina?fbclid=1#sezione-2'), 'https://esempio.it/pagina#sezione-2');
});

test('YouTube e Spotify: via l identificativo di condivisione, resta il video', () => {
  assert.strictEqual(pulito('https://youtu.be/dQw4w9WgXcQ?si=AbCdEf123'), 'https://youtu.be/dQw4w9WgXcQ');
  assert.strictEqual(pulito('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42&si=xyz&feature=shared'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42');
  assert.strictEqual(pulito('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=9f8e7d'),
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
});

test('"si" si toglie solo dove si sa che cosa e', () => {
  // Su un sito qualsiasi potrebbe essere un parametro vero.
  assert.strictEqual(pulito('https://comune.esempio.it/cerca?si=1&utm_source=x'), 'https://comune.esempio.it/cerca?si=1');
});

test('Amazon: resta solo il prodotto', () => {
  assert.strictEqual(
    pulito('https://www.amazon.it/Nome-Prodotto-Lungo/dp/B08N5WRWNW/ref=sr_1_3?crid=2X&keywords=cuffie&qid=1700000000&sr=8-3&tag=qualcuno-21'),
    'https://www.amazon.it/dp/B08N5WRWNW');
  assert.strictEqual(pulito('https://www.amazon.it/gp/product/B08N5WRWNW?pf_rd_r=ABC&psc=1'), 'https://www.amazon.it/dp/B08N5WRWNW');
  // Una pagina Amazon che non e' un prodotto: si tolgono solo i parametri noti.
  assert.strictEqual(pulito('https://www.amazon.it/s?k=cuffie&pf_rd_p=123'), 'https://www.amazon.it/s?k=cuffie');
});

test('i reindirizzamenti di Google, Facebook, Outlook portano dritti a destinazione', () => {
  assert.strictEqual(pulito('https://www.google.com/url?sa=t&url=https%3A%2F%2Fwww.inps.it%2Fprestazioni%3Futm_source%3Dg&usg=AOv'),
    'https://www.inps.it/prestazioni');
  assert.strictEqual(pulito('https://l.facebook.com/l.php?u=https%3A%2F%2Fesempio.it%2F%3Ffbclid%3Dabc&h=AT0'), 'https://esempio.it/');
  const r = P.pulisciUrl('https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.google.com%2Furl%3Fq%3Dhttps%253A%252F%252Fesempio.it%252Fdoc&data=05');
  assert.strictEqual(r.pulito, 'https://esempio.it/doc');
  assert.strictEqual(r.avvisi.length, 2, 'Outlook dentro cui c e Google: due involucri');
});

test('un testo con piu link: si puliscono tutti, il resto resta uguale', () => {
  const r = P.pulisciTesto('Guarda qui https://youtu.be/abc?si=x, e anche https://esempio.it/?utm_source=wa. Ciao!');
  assert.strictEqual(r.testo, 'Guarda qui https://youtu.be/abc, e anche https://esempio.it/. Ciao!');
  assert.strictEqual(r.link.length, 2);
});

test('quello che non e un link resta com e', () => {
  assert.strictEqual(P.pulisciUrl('non un link').valido, false);
  assert.strictEqual(P.pulisciUrl('mailto:a@b.it').valido, false);
  assert.strictEqual(P.pulisciTesto('nessun link qui').testo, 'nessun link qui');
  assert.strictEqual(pulito('https://esempio.it/pagina?id=1'), 'https://esempio.it/pagina?id=1');
});
