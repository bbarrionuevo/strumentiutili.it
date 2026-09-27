// tests/sentinella.test.js — La sentinella delle fonti, senza rete.
//
// Le pagine di esempio riproducono la forma delle pagine vere di Normattiva e
// dell'Agenzia delle Entrate (lette con il workflow leggi-fonti a settembre
// 2026): quel che conta e' che lo stesso contenuto dia sempre lo stesso testo,
// anche quando cambiano i codici di sessione, e che un cambiamento vero si veda.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const C = require('../scripts/sentinella/controlli.js');
const I = require('../scripts/sentinella-issue.js');
const S = require('../scripts/sentinella.js');

const RADICE = path.resolve(__dirname, '..');

function articolo({ token = 'a1', vigore = '7-3-2001', comma2 = "2. L'imposta di bollo non &egrave; dovuta quando l'atto sostituito e&#39; esente.", aggiornato = false } = {}) {
  return `<html><head><title>DECRETO DEL PRESIDENTE DELLA REPUBBLICA 28 dicembre 2000, n. 445 - Normattiva</title>
<script>window.GA4_CONFIG = { 'www.normattiva.it': { enabled: true } };</script></head><body>
<form action="/ricerca/veloce/0" method="POST"><input type="hidden" name="_csrf" value="${token}"></form>
<div class="note">(Ultimo aggiornamento all&#39;atto pubblicato il 11/08/2026)</div>
<div> Testo in vigore dal: <span id="artInizio"
\tclass="rosso">&nbsp;${vigore}</span>
\t<!--
\t flagTipoArticolo: 0
\t version: 1
\t tipoArticolo: DEFAULT
\t -->
${aggiornato ? `<a href="#" data-href="/do/atto/vediAggiornamentiAllArticolo?qId=${token}" id="aggiornamenti_articolo_button">aggiornamenti all'articolo </a>` : ''}
<h2 class="article-num-akn"> Art. 37 </h2>
<div class="art-just-text-akn"> (L) <br> Esenzioni fiscali<br>
 1. Le dichiarazioni sostitutive di cui agli articoli 46 e 47 sono esenti dall&#39;imposta di bollo. <br>
 ${comma2}</div>
\t<a href="javascript:"
\tonclick="showArticle('/atto/caricaArticolo?art.versione=4&art.idGruppo=8&qId=${token}')"
\tclass="btn">
\t articolo precedente </a>
\t<a href="javascript:" onclick="showArticle('/atto/caricaArticolo?qId=${token}')" class="btn"> articolo successivo </a>
</body></html>`;
}

test('Normattiva: il testo dell\'articolo, senza menu ne\' codici di sessione', () => {
  const righe = C.articoloNormattiva(articolo());
  assert.deepStrictEqual(righe, [
    'Testo in vigore dal: 7-3-2001',
    'Art. 37',
    '(L)',
    'Esenzioni fiscali',
    "1. Le dichiarazioni sostitutive di cui agli articoli 46 e 47 sono esenti dall'imposta di bollo.",
    "2. L'imposta di bollo non è dovuta quando l'atto sostituito e' esente."
  ]);
  // stessa pagina, altri codici di sessione: stesso testo
  assert.deepStrictEqual(C.articoloNormattiva(articolo({ token: 'zz99' })), righe);
  // il pulsante "aggiornamenti all'articolo" non fa parte del testo
  assert.deepStrictEqual(C.articoloNormattiva(articolo({ aggiornato: true })), righe);
});

test('Normattiva: un comma modificato e una nuova data di vigore si vedono nel confronto', () => {
  const prima = C.articoloNormattiva(articolo());
  const dopo = C.articoloNormattiva(articolo({ vigore: '1-1-2027', comma2: "2. L'imposta di bollo e' dovuta in misura fissa." }));
  assert.deepStrictEqual(C.diffRighe(prima, dopo), [
    '- Testo in vigore dal: 7-3-2001',
    '+ Testo in vigore dal: 1-1-2027',
    "- 2. L'imposta di bollo non è dovuta quando l'atto sostituito e' esente.",
    "+ 2. L'imposta di bollo e' dovuta in misura fissa."
  ]);
  assert.notStrictEqual(C.impronta(prima.join('\n')), C.impronta(dopo.join('\n')));
});

test('Normattiva: pagine di altra forma e atti non trovati', () => {
  assert.strictEqual(C.articoloNormattiva('<html><body>Manutenzione in corso</body></html>'), null);
  assert.strictEqual(C.articoloNormattiva(''), null);
  assert.ok(C.paginaErrore('<p>Atto non trovato</p>'));
  assert.ok(!C.paginaErrore(articolo()));
  assert.deepStrictEqual(C.attoNormattiva(articolo()), [
    'DECRETO DEL PRESIDENTE DELLA REPUBBLICA 28 dicembre 2000, n. 445',
    "Ultimo aggiornamento all'atto: 11/08/2026"
  ]);
  assert.strictEqual(C.attoNormattiva('<html></html>'), null);
});

const SCHEDA = (token, importo = '90') => `<html><head><title>Schede - Canone TV - Come si paga - Agenzia delle Entrate</title>
<script>var authToken = '${token}'; return 'https\\x3a\\x2f\\x2fwww';</script></head><body>
<nav><ul><li><a href="/portale/">Home</a></li><li>Cittadini</li><li>Imprese</li></ul></nav>
<main><h1>Come si paga</h1>
<p>L&rsquo;importo del canone TV &egrave; di ${importo} euro l'anno e si paga in 10 rate mensili.</p>
<p>Le rate sono addebitate nelle fatture da gennaio a ottobre.</p>
<p>Agenzia delle Entrate - via Giorgione n. 106 - 00147 Roma</p></main>
<footer>Partita IVA 06363391001</footer></body></html>`;

test('schede: si tengono le righe con cifre, uguali anche se cambia il codice della pagina', () => {
  const righe = C.righeConCifre(C.testoDaHtml(SCHEDA('x1')));
  assert.deepStrictEqual(righe, [
    "L'importo del canone TV è di 90 euro l'anno e si paga in 10 rate mensili.",
    'Agenzia delle Entrate - via Giorgione n. 106 - 00147 Roma'
  ]);
  assert.deepStrictEqual(C.righeConCifre(C.testoDaHtml(SCHEDA('y2'))), righe);
  // l'espressione attesa si trova anche con l'apostrofo tipografico della pagina
  assert.deepStrictEqual(C.espressioniMancanti(C.testoDaHtml(SCHEDA('x1')), ["90 euro l'anno", '10 rate']), []);
  assert.deepStrictEqual(C.espressioniMancanti(C.testoDaHtml(SCHEDA('x1', '95')), ["90 euro l'anno", '10 rate']), ["90 euro l'anno"]);
});

test('pagine dei modelli: elenco dei documenti senza parametri che cambiano', () => {
  const html = `<ul>
<li><a href="/portale/documents/20143/2302621/TV_esenzione_75_mod.pdf/b8298e2b-55df?t=1742281105241">Modello di esenzione canone per gli over 75</a></li>
<li><a href="/portale/documents/20143/2302621/TV_esenzione_75_mod.pdf/b8298e2b-55df?t=999">Modello di esenzione canone per gli over 75</a></li>
<li><a href="https://www.agenziaentrate.gov.it/portale/documents/20143/2302621/TV_rimborso_75_istr.pdf/11b4926b">Istruzioni &ndash; rimborso</a></li>
<li><a href="/portale/schede/altro">Altra pagina</a></li></ul>`;
  assert.deepStrictEqual(C.collegamentiDocumenti(html, 'https://www.agenziaentrate.gov.it/portale/schede/x'), [
    'https://www.agenziaentrate.gov.it/portale/documents/20143/2302621/TV_esenzione_75_mod.pdf/b8298e2b-55df  «Modello di esenzione canone per gli over 75»',
    'https://www.agenziaentrate.gov.it/portale/documents/20143/2302621/TV_rimborso_75_istr.pdf/11b4926b  «Istruzioni – rimborso»'
  ]);
});

test('confronto: testi enormi e troppe differenze', () => {
  assert.deepStrictEqual(C.diffRighe(['a', 'b'], ['a', 'b']), []);
  const lungo = Array.from({ length: 3000 }, (_, i) => 'comma ' + i);
  const cambiato = lungo.slice();
  cambiato[10] = 'comma 10 modificato';
  cambiato[2990] = 'comma 2990 modificato';
  assert.deepStrictEqual(C.diffRighe(lungo, cambiato), ['- comma 10', '- comma 2990', '+ comma 10 modificato', '+ comma 2990 modificato']);
  const d = C.diffRighe([], Array.from({ length: 100 }, (_, i) => 'r' + i), 60);
  assert.strictEqual(d.length, 61);
  assert.strictEqual(d[60], '… e altre 40 righe');
});

test('promemoria: date, ripetizioni e fine mese', () => {
  assert.strictEqual(C.occorrenza('2026-10-01', undefined, '2026-09-30'), null);
  assert.strictEqual(C.occorrenza('2026-10-01', undefined, '2026-10-01'), '2026-10-01');
  assert.strictEqual(C.occorrenza('2026-10-01', 'anno', '2028-03-01'), '2027-10-01');
  assert.strictEqual(C.occorrenza('2026-10-01', 'trimestre', '2027-03-31'), '2027-01-01');
  assert.strictEqual(C.occorrenza('2026-01-31', 'mese', '2026-03-01'), '2026-02-28');
  assert.strictEqual(C.occorrenza('2026-10-01', 'settimana', '2027-01-01'), null);
  assert.strictEqual(C.occorrenza('2026-02-30', undefined, '2027-01-01'), null);
});

test('scadenze ricavate dai dati: tassi BCE, interesse legale, ISTAT, anni nei titoli', () => {
  const regole = {
    interessiMoratori: { storicoTassiBce: [{ inizio: '2026-07-01', fine: '2026-12-31', tasso: 0.024 }, { inizio: '2026-01-01', fine: '2026-06-30', tasso: 0.0215 }] },
    rivalutazione_interessi_2026: {
      interessi_legali: [{ dal: '2026-01-01', al: '2026-12-31', tasso: 0.016 }],
      serie_istat_foi: { 2026: { '07': 103.1, '08': 103.7 } }
    }
  };
  const titoli = { 'a/': 'Calcolo IRPEF 2026', 'b/': 'Calendario 2027', 'c/': 'Interessi moratori (D.Lgs. 231/2002)', 'd/': 'Concordato 2026-2027' };
  const ids = (oggi) => C.scadenzeDovute({ scadenze: [] }, regole, oggi, titoli).map((s) => s.id);
  assert.deepStrictEqual(ids('2026-09-27'), []);
  assert.deepStrictEqual(ids('2026-10-16'), ['serie:istat-foi:2026-09']);
  assert.deepStrictEqual(ids('2027-01-02'), ['serie:tasso-bce:2027-01-01', 'serie:interessi-legali:2027', 'serie:istat-foi:2026-09', 'anno:titoli:2027']);
  const anno = C.scadenzeDovute({ scadenze: [] }, regole, '2027-01-02', titoli).pop();
  assert.match(anno.cosa, /- a\//);
  assert.doesNotMatch(anno.cosa, /- [bcd]\//);
});

test('scadenze scritte nel registro: una volta per periodo', () => {
  const registro = { scadenze: [{ id: 'arera', dal: '2026-10-01', ripeti: 'trimestre', titolo: 'ARERA', cosa: 'Aggiornare', dati: ['x'] }] };
  assert.deepStrictEqual(C.scadenzeDovute(registro, {}, '2026-09-30'), []);
  assert.strictEqual(C.scadenzeDovute(registro, {}, '2026-11-15')[0].id, 'scadenza:arera:2026-10-01');
  assert.strictEqual(C.scadenzeDovute(registro, {}, '2027-01-01')[0].id, 'scadenza:arera:2027-01-01');
});

test('priorita\': alta quando cambia quel che il sito mostra o calcola', () => {
  for (const t of ['modello-cambiato', 'articolo-cambiato', 'cifra-sparita', 'collegamento-rotto', 'scadenza', 'pdf-cambiato', 'elenco-modelli-cambiato']) {
    assert.strictEqual(C.classifica({ tipo: t }), 'alta', t);
  }
  for (const t of ['pagina-cambiata', 'atto-aggiornato', 'senza-copia']) assert.strictEqual(C.classifica({ tipo: t }), 'bassa', t);
});

test('segnalazioni: una sola volta, anche dopo la chiusura; un commento se cambia ancora', () => {
  const e = (id, impronta, priorita = 'alta') => ({ id, impronta, priorita, titolo: id, corpo: 'x' });
  const esistenti = [
    { number: 1, state: 'OPEN', body: 'testo\n' + I.segno('norma:a.txt', 'h1') },
    { number: 2, state: 'CLOSED', body: I.segno('modello:m.pdf', 'h2') },
    { number: 3, state: 'CLOSED', body: I.segno('norma:vecchia.txt', 'h3') },
    { number: 4, state: 'OPEN', body: I.segno('pagina:p', 'h4') + '\n' + I.segno('pagina:q', 'h5') }
  ];
  const p = I.piano([
    e('norma:a.txt', 'h1'), // gia' segnalata cosi'
    e('norma:a.txt', 'h1b'), // cambiata ancora, issue aperta
    e('modello:m.pdf', 'h2'), // chiusa con la stessa impronta: non si riapre
    e('norma:vecchia.txt', 'h9'), // chiusa, ma e' cambiata di nuovo
    e('nuova', 'n1'),
    e('pagina:q', 'h5', 'bassa'),
    e('pagina:r', 'h6', 'bassa')
  ], esistenti);
  assert.deepStrictEqual(p.commenta.map((c) => [c.numero, c.esito.impronta]), [[1, 'h1b']]);
  assert.deepStrictEqual(p.crea.map((c) => c.id), ['norma:vecchia.txt', 'nuova']);
  assert.deepStrictEqual(p.minori.map((c) => c.id), ['pagina:r']);
  assert.deepStrictEqual([...I.segni(esistenti[3].body)], [['pagina:p', 'h4'], ['pagina:q', 'h5']]);
});

test('il testo delle segnalazioni: menzione del proprietario, fonte e segno invisibile', () => {
  const corpo = I.corpoIssue({ id: 'cifra:x', impronta: 'abc', url: 'https://esempio.it/', corpo: 'Manca «90 euro»' }, 'bbarrionuevo');
  assert.match(corpo, /^@bbarrionuevo /);
  assert.match(corpo, /\*\*Fonte:\*\* https:\/\/esempio\.it\//);
  assert.match(corpo, /<!-- sentinella:cifra:x impronta:abc -->$/);
  const stato = I.corpoStato({ data: '2026-10-05', tentativi: 10, falliti: 1, cieca: false, stato: { normattiva: { controllate: 5, cambiate: 1, errori: 0, senza_copia: 0 } }, errori: ['x'], esiti: [] });
  assert.match(stato, /\| normattiva \| 5 \| 1 \| 0 \| 0 \|/);
});

test('i modelli seguiti sono quelli di scarica-modelli, e sono tutti in assets/pdf', () => {
  const M = S.modelli();
  const testo = fs.readFileSync(path.join(RADICE, 'scripts', 'scarica-modelli-ufficiali.py'), 'utf8');
  assert.strictEqual(Object.keys(M).length, (testo.match(/^\s+"[^"]+\.pdf": \(/gm) || []).length);
  for (const [nome, [pdf, pagina]] of Object.entries(M)) {
    assert.ok(fs.existsSync(path.join(RADICE, 'assets', 'pdf', nome)), nome + ' manca in assets/pdf: il confronto non avrebbe senso');
    assert.match(pdf, /^https:\/\//);
    assert.match(pagina, /^https:\/\//);
  }
});

test('nomi dei file in archivio: stabili e diversi per ogni norma', () => {
  assert.strictEqual(S.fileNormattiva('https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262:2~art1284'),
    'stato-regio-decreto-1942-03-16-262-2-art1284.txt');
  const { collegamenti } = require('../scripts/controlla-collegamenti.js');
  const norme = [...collegamenti().keys()].filter((u) => u.includes('normattiva.it'));
  assert.strictEqual(new Set(norme.map(S.fileNormattiva)).size, norme.length);
});

test('senza rete la sentinella calcola comunque le scadenze', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sent-')), 'r.json');
  const r = spawnSync(process.execPath, [path.join(RADICE, 'scripts', 'sentinella.js'), '--senza-rete', '--oggi', '2027-01-05', '--rapporto', file], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const rapporto = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = rapporto.esiti.map((e) => e.id);
  for (const atteso of ['scadenza:conversione-dl-162-2026:2026-11-17', 'serie:tasso-bce:2027-01-01', 'anno:titoli:2027']) {
    assert.ok(ids.includes(atteso), atteso + ' non segnalata');
  }
  assert.ok(rapporto.esiti.every((e) => e.priorita === 'alta' && e.titolo && e.corpo));
});
