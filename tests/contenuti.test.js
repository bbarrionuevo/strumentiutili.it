// tests/contenuti.test.js — La qualita' dei testi che legge chi visita il sito.
//
// Le pagine piu' vecchie avevano in fondo lunghi "trattati" scritti per i
// motori di ricerca: gergo tecnico (Zero-Backend, albero DOM, Garbage
// Collection), sigle come YMYL ed E-E-A-T, una firma anonima di "ingegneri
// software indipendenti", commenti in spagnolo nel codice. A chi legge non
// servono, e per la revisione di Google AdSense sembrano testo generato. Qui
// si controlla che non tornino.
const test = require('node:test');
const assert = require('node:assert');
const C = require('./helpers/contenuti.js');

const PAGINE = C.pagineIndicizzabili();

// Pagine con il vecchio trattato ancora da riscrivere in italiano semplice.
// La lista puo' solo accorciarsi: quando una pagina e' riscritta, va tolta.
const DA_RISCRIVERE = new Set([
  'cittadino-tasse/aliquote-irpef/index.html',
  'cittadino-tasse/analizzatore-bolletta/index.html',
  'cittadino-tasse/assegno-unico/index.html',
  'cittadino-tasse/calcolo-bollo-auto/index.html',
  'cittadino-tasse/calcolo-imu/index.html',
  'cittadino-tasse/f24-editabile/f23-editabile/index.html',
  'cittadino-tasse/f24-editabile/f24-accise/index.html',
  'cittadino-tasse/f24-editabile/f24-elide/index.html',
  'cittadino-tasse/f24-editabile/f24-ordinario/index.html',
  'cittadino-tasse/f24-editabile/index.html',
  'cittadino-tasse/imposta-registro-locazioni/index.html',
  'cittadino-tasse/imposte-acquisto-casa/index.html',
  'cittadino-tasse/modello-rli/index.html',
  'cittadino-tasse/passaggio-di-proprieta/index.html',
  'cittadino-tasse/simulatore-isee/index.html',
  'cittadino-tasse/simulatore-pensione/index.html',
  'fisco-professioni/calcolo-iva/index.html',
  'fisco-professioni/calcolo-rata-mutuo/index.html',
  'fisco-professioni/contributo-unificato/index.html',
  'fisco-professioni/fattura-elettronica/index.html',
  'fisco-professioni/generatore-xml-fatturapa/index.html',
  'fisco-professioni/interessi-moratori/index.html',
  'fisco-professioni/modelli-partita-iva/index.html',
  'fisco-professioni/parcella-avvocato/index.html',
  'fisco-professioni/partita-iva/index.html',
  'fisco-professioni/ravvedimento-operoso/index.html',
  'fisco-professioni/rivalutazione-istat/index.html',
  'fisco-professioni/usufrutto/index.html',
  'ia/assistente-documenti/index.html',
  'ia/ocr-immagini/index.html',
  'ia/riassunto-testo/index.html',
  'ia/traduttore/index.html',
  'ia/trascrizione-audio/index.html',
  'identita-burocrazia/autocertificazione/index.html',
  'identita-burocrazia/calcolo-quote-ereditarie/index.html',
  'identita-burocrazia/codice-fiscale/index.html',
  'identita-burocrazia/fototessera/index.html',
  'identita-burocrazia/generatore-cv-ats/index.html',
  'identita-burocrazia/generatore-password/index.html',
  'identita-burocrazia/validatore-iban/index.html',
  'lavoro-contratti/analizzatore-busta-paga/index.html',
  'lavoro-contratti/calcolo-naspi/index.html',
  'lavoro-contratti/calcolo-tfr/index.html',
  'lavoro-contratti/giorni-lavorativi/index.html',
  'lavoro-contratti/lettera-dimissioni-preavviso/index.html',
  'lavoro-contratti/ricevuta-prestazione-occasionale/index.html',
  'lavoro-contratti/ritenuta-acconto/index.html',
  'lavoro-contratti/stipendio-netto/index.html',
  'pdf/anonimizza/index.html',
  'pdf/convertitore-pdfa/index.html',
  'pdf/firma/index.html',
  'pdf/scanner-documenti/index.html',
  'utilita-web/budget-planner/index.html',
  'utilita-web/calcolo-bmr/index.html',
  'utilita-web/calcolo-percentuale/index.html',
  'utilita-web/contaparole/index.html',
  'utilita-web/convertitore-immagini/index.html',
  'utilita-web/generatore-qr/index.html',
  'utilita-web/interessi-composti/index.html',
  'utilita-web/media-universitaria/index.html'
]);

test('niente gergo da trattato nelle pagine gia riscritte', () => {
  const sbagliate = PAGINE
    .filter((p) => !DA_RISCRIVERE.has(p.percorso))
    .map((p) => [p.percorso, (C.testoVisibile(p.html).match(C.LESSICO) || [])[0]])
    .filter((x) => x[1]);
  assert.deepStrictEqual(sbagliate, []);
});

test('la lista delle pagine da riscrivere contiene solo pagine che lo sono ancora', () => {
  const esistenti = new Set(PAGINE.map((p) => p.percorso));
  for (const f of DA_RISCRIVERE) {
    assert.ok(esistenti.has(f), f + ' non esiste piu: toglila dalla lista');
    const p = PAGINE.find((x) => x.percorso === f);
    assert.ok(C.LESSICO.test(C.testoVisibile(p.html)), f + ' e gia pulita: toglila dalla lista DA_RISCRIVERE');
  }
});

test('niente commenti in spagnolo o sul SEO nel codice delle pagine', () => {
  const trovati = [];
  for (const p of C.tutteLePagine()) {
    for (const m of p.html.matchAll(/<!--([\s\S]*?)-->/g)) {
      const t = m[1].trim();
      if (!/^\/?su:|^SILO/.test(t) && C.COMMENTO_VECCHIO.test(t)) trovati.push(p.percorso + ': ' + t.slice(0, 60));
    }
  }
  assert.deepStrictEqual(trovati, []);
});

test('ogni domanda dei dati strutturati FAQPage si legge nella pagina', () => {
  const mancanti = [];
  for (const p of PAGINE) {
    const testo = C.normalizza(C.testoVisibile(p.html));
    for (const d of C.domandeFaq(p.html)) if (!testo.includes(C.normalizza(d))) mancanti.push(p.percorso + ': ' + d);
  }
  assert.deepStrictEqual(mancanti, []);
});

test('ogni pagina ha titolo, descrizione e anteprima per la condivisione', () => {
  const mancano = [];
  for (const p of PAGINE) {
    for (const t of ['og:title', 'og:description', 'og:url', 'og:type', 'og:image', 'og:locale', 'twitter:card']) {
      if (!new RegExp('(property|name)="' + t + '" content="[^"]+"').test(p.html)) mancano.push(p.percorso + ': ' + t);
    }
    const canon = /<link rel="canonical" href="([^"]+)"/.exec(p.html);
    const og = /property="og:url" content="([^"]+)"/.exec(p.html);
    if (canon && og && canon[1] !== og[1]) mancano.push(p.percorso + ': og:url diverso dal canonical');
    if (canon && /\.html$/.test(canon[1])) mancano.push(p.percorso + ': canonical verso un indirizzo che fa redirect');
  }
  assert.deepStrictEqual(mancano, []);
});

test('in home il bollino Nuovo resta solo sulle ultime novita', () => {
  const home = PAGINE.find((p) => p.percorso === 'index.html');
  const n = (C.testoVisibile(home.html).match(/Nuovo\b/g) || []).length;
  assert.ok(n > 0 && n <= 6, n + ' bollini');
});
