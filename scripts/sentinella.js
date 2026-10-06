#!/usr/bin/env node
// scripts/sentinella.js — Le fonti ufficiali del sito sono cambiate?
//
// Il sito prende modelli, norme e cifre da siti ufficiali che cambiano senza
// avvisare: l'Agenzia pubblica un modello nuovo, una legge modifica un
// articolo, una serie di tassi arriva alla fine. Ogni lunedi'
// .github/workflows/sentinella.yml lancia questo script, che:
//
//   - riscarica i modelli di scripts/scarica-modelli-ufficiali.py e li
//     confronta con i PDF in assets/pdf/; rilegge l'elenco dei documenti
//     nelle loro pagine "modelli e istruzioni";
//   - rilegge ogni articolo di Normattiva collegato dalle pagine o citato in
//     data/regole-fiscali-2026.json;
//   - rilegge le schede di data/fonti-monitorate.json e controlla che ci siano
//     ancora le cifre attese;
//   - apre gli altri collegamenti esterni (una pagina sparita e' un errore);
//   - calcola le scadenze dei dati (tassi, indici, anni nei titoli).
//
// Il confronto e' con la copia in fonti/archivio/. Il risultato va in un
// rapporto JSON; scripts/sentinella-issue.js ne fa le segnalazioni su GitHub.
//
//   node scripts/sentinella.js                        controlla e scrive il rapporto
//   node scripts/sentinella.js --aggiorna             riscrive fonti/archivio/
//   node scripts/sentinella.js --aggiorna --solo a,b  solo le fonti con a o b nell'id
//   node scripts/sentinella.js --senza-rete           solo le scadenze (per provare)
//   opzioni: --oggi AAAA-MM-GG  --rapporto file.json
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const C = require('./sentinella/controlli.js');
const { collegamenti } = require('./controlla-collegamenti.js');

const RADICE = path.join(__dirname, '..');
const ARCHIVIO = path.join(RADICE, 'fonti', 'archivio');
const AGENTE = 'Mozilla/5.0 (StrumentiUtili.it sentinella delle fonti; +https://strumentiutili.it/metodo/)';
const SALTA = /^https:\/\/(github\.com|vercel\.com|www\.wikidata\.org|it\.wikipedia\.org|www\.treccani\.it)\b/;

function argomento(nome) {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function oggiIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// --- Elenchi delle fonti ------------------------------------------------------

/** I modelli come li scarica scripts/scarica-modelli-ufficiali.py: nome -> [pdf, pagina]. */
function modelli() {
  const codice = [
    'import importlib.util, json, sys',
    's = importlib.util.spec_from_file_location("m", sys.argv[1])',
    'm = importlib.util.module_from_spec(s); s.loader.exec_module(m)',
    'print(json.dumps({k: [m.indirizzo(a), m.indirizzo(b)] for k, (a, b) in m.MODELLI.items()}))'
  ].join('\n');
  const r = spawnSync('python3', ['-B', '-c', codice, path.join(RADICE, 'scripts', 'scarica-modelli-ufficiali.py')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('elenco dei modelli illeggibile: ' + r.stderr);
  return JSON.parse(r.stdout);
}

/** Tutti gli indirizzi https scritti in un oggetto (le fonti di regole-fiscali). */
function indirizziIn(o, fuori = new Set()) {
  if (typeof o === 'string' && /^https:\/\//.test(o)) fuori.add(o);
  else if (o && typeof o === 'object') Object.values(o).forEach((v) => indirizziIn(v, fuori));
  return fuori;
}

/** Titolo di ogni pagina pubblicata, per le scadenze sugli anni. */
function titoliPagine() {
  const fuori = {};
  (function giro(dir) {
    for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'vendor', '.git', 'tests', 'scripts', 'fonti'].includes(v.name) || v.name.startsWith('.')) continue;
      const p = path.join(dir, v.name);
      if (v.isDirectory()) giro(p);
      else if (v.name === 'index.html') {
        const t = fs.readFileSync(p, 'utf8').match(/<title>([^<]*)<\/title>/);
        if (t) fuori[path.relative(RADICE, path.dirname(p)).split(path.sep).join('/') + '/'] = t[1].trim();
      }
    }
  })(RADICE);
  return fuori;
}

function fileNormattiva(url) {
  const urn = url.split('?')[1] || url;
  return urn.replace(/^urn:nir:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.txt';
}

function filePagina(url) {
  const u = new URL(url);
  return u.pathname.split('/').filter(Boolean).slice(-2).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.txt';
}

// --- Rete -------------------------------------------------------------------

const code = new Map();
const cache = new Map();
const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un documento alla volta per sito, uno al secondo: i siti pubblici non si martellano. */
function inCoda(url, fn) {
  const host = new URL(url).host;
  const prima = code.get(host) || Promise.resolve();
  const p = prima.then(fn);
  code.set(host, p.catch(() => {}).then(() => attesa(1000)));
  return p;
}

async function unaVolta(url) {
  const ctrl = new AbortController();
  const tempo = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': AGENTE } });
    const corpo = Buffer.from(await r.arrayBuffer());
    return { stato: r.status, finale: r.url, corpo };
  } catch (e) {
    return { stato: 0, errore: e.name === 'AbortError' ? 'tempo scaduto' : e.message, corpo: Buffer.alloc(0) };
  } finally {
    clearTimeout(tempo);
  }
}

function scarica(url) {
  if (!cache.has(url)) {
    cache.set(url, inCoda(url, async () => {
      let r = await unaVolta(url);
      // un secondo tentativo per i guasti passeggeri, non per le risposte chiare
      if (r.stato === 0 || r.stato >= 500) { await attesa(5000); r = await unaVolta(url); }
      return r;
    }));
  }
  return cache.get(url);
}

/**
 * La pagina di un articolo e poi un suo blocco di commi, nella stessa
 * sessione: Normattiva da' i blocchi (/atto/caricaArticolo) solo a chi ha
 * aperto l'articolo, e il cookie arriva anche nei rinvii, che quindi si
 * seguono a mano. `prossimo(html)` ricava dalla pagina l'indirizzo del blocco.
 */
function conSessione(url, prossimo) {
  return inCoda(url, async () => {
    const cookie = new Map();
    const vai = async (u) => {
      let indirizzo = u;
      for (let i = 0; i < 6; i++) {
        const ctrl = new AbortController();
        const tempo = setTimeout(() => ctrl.abort(), 90000);
        try {
          const intestazioni = { 'User-Agent': AGENTE };
          if (cookie.size) intestazioni.Cookie = [...cookie].map(([k, v]) => k + '=' + v).join('; ');
          const r = await fetch(indirizzo, { redirect: 'manual', signal: ctrl.signal, headers: intestazioni });
          for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) {
            const coppia = c.split(';')[0];
            const j = coppia.indexOf('=');
            if (j > 0) cookie.set(coppia.slice(0, j).trim(), coppia.slice(j + 1).trim());
          }
          const dove = r.headers.get('location');
          if (r.status >= 300 && r.status < 400 && dove) { indirizzo = new URL(dove, indirizzo).href; continue; }
          return { stato: r.status, finale: indirizzo, corpo: Buffer.from(await r.arrayBuffer()) };
        } catch (e) {
          return { stato: 0, errore: e.name === 'AbortError' ? 'tempo scaduto' : e.message, corpo: Buffer.alloc(0) };
        } finally {
          clearTimeout(tempo);
        }
      }
      return { stato: 0, errore: 'troppi rinvii', corpo: Buffer.alloc(0) };
    };
    const articolo = await vai(url);
    if (articolo.stato !== 200) return { articolo, blocco: null, indirizzo: null };
    const indirizzo = prossimo(articolo.corpo.toString('utf8'));
    if (!indirizzo) return { articolo, blocco: null, indirizzo: null };
    await attesa(1000);
    return { articolo, blocco: await vai(indirizzo), indirizzo };
  });
}

const sparita = (r) => r.stato === 404 || r.stato === 410;
const guasta = (r) => !sparita(r) && (r.stato < 200 || r.stato >= 300);

// --- Controlli --------------------------------------------------------------

function leggiArchivio(rel) {
  const p = path.join(ARCHIVIO, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\n$/, '').split('\n') : null;
}

function blocco(righe) {
  // il testo viene da siti esterni: niente che chiuda il blocco di codice
  return '```diff\n' + righe.join('\n').replace(/```/g, '``​`') + '\n```';
}

function elencoPagine(pagine) {
  return pagine && pagine.length ? '\n\n**Pagine del sito che la usano:** ' + pagine.map((p) => '`' + p + '`').join(', ') : '';
}

function elencoDati(dati) {
  return dati && dati.length ? '\n\n**Dati collegati** (`data/regole-fiscali-2026.json`): ' + dati.map((d) => '`' + d + '`').join(', ') : '';
}

async function main() {
  const aggiorna = process.argv.includes('--aggiorna');
  const senzaRete = process.argv.includes('--senza-rete');
  const solo = (argomento('--solo') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const oggi = argomento('--oggi') || oggiIso();
  const fileRapporto = argomento('--rapporto') || 'rapporto-sentinella.json';
  if (!C.isoValida(oggi)) throw new Error('--oggi deve essere AAAA-MM-GG');

  const registro = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'fonti-monitorate.json'), 'utf8'));
  const regole = JSON.parse(fs.readFileSync(path.join(RADICE, 'data', 'regole-fiscali-2026.json'), 'utf8'));
  const dove = collegamenti();
  const pagineDi = (url) => [...(dove.get(url) || [])].map((f) => f.replace(/index\.html$/, '')).sort();
  const scelta = (...chiavi) => !solo.length || solo.some((s) => chiavi.some((k) => k.includes(s)));

  const esiti = [];
  const stato = {};
  const conta = (cat, chiave) => { stato[cat] = stato[cat] || { controllate: 0, cambiate: 0, errori: 0, senza_copia: 0 }; stato[cat][chiave]++; };
  const errori = [];
  const senzaCopia = [];
  // le copie delle fonti ancora seguite, anche se oggi non rispondono: le
  // altre si tolgono dall'archivio
  const seguite = new Set();
  let tentativi = 0, falliti = 0;

  const esito = (e) => { e.priorita = C.classifica(e); esiti.push(e); };
  const salva = (rel, righe) => {
    const p = path.join(ARCHIVIO, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, righe.join('\n') + '\n');
  };
  const prendi = async (url, cat) => {
    const r = await scarica(url);
    tentativi++;
    if (guasta(r)) { falliti++; conta(cat, 'errori'); errori.push(`${cat}: ${r.stato || r.errore} ${url}`); }
    return r;
  };
  /** Confronto con l'archivio: restituisce le righe diverse, o null se uguale o senza copia. */
  const confronta = (cat, rel, righe, id) => {
    conta(cat, 'controllate');
    if (aggiorna) { if (scelta(id, rel)) salva(rel, righe); return null; }
    const prima = leggiArchivio(rel);
    if (!prima) { conta(cat, 'senza_copia'); senzaCopia.push(rel); return null; }
    const diff = C.diffRighe(prima, righe);
    if (!diff.length) return null;
    conta(cat, 'cambiate');
    return diff;
  };

  const lavori = [];

  if (!senzaRete) {
    // 1. Modelli ufficiali: il PDF online e' ancora quello in assets/pdf/?
    const M = modelli();
    const pagineModelli = new Map();
    for (const [nome, [url, pagina]] of Object.entries(M)) {
      if (!pagineModelli.has(pagina)) pagineModelli.set(pagina, []);
      pagineModelli.get(pagina).push({ nome, url });
      if (aggiorna) continue; // i PDF li aggiorna .github/workflows/scarica-modelli.yml
      lavori.push((async () => {
        const r = await prendi(url, 'modelli');
        conta('modelli', 'controllate');
        const id = 'modello:' + nome;
        if (sparita(r)) {
          conta('modelli', 'cambiate');
          return esito({ id, tipo: 'modello-sparito', titolo: `Modello non piu' scaricabile: ${nome}`, url, impronta: String(r.stato),
            corpo: `L'indirizzo del modello \`${nome}\` risponde ${r.stato}.\n\nPagina ufficiale da cui ripartire: ${pagina}` });
        }
        if (guasta(r)) return;
        if (!r.corpo.subarray(0, 5).toString('latin1').startsWith('%PDF')) { conta('modelli', 'errori'); errori.push(`modelli: non e' un PDF ${url}`); return; }
        const locale = path.join(RADICE, 'assets', 'pdf', nome);
        const hLocale = fs.existsSync(locale) ? sha256(fs.readFileSync(locale)) : null;
        const hOnline = sha256(r.corpo);
        if (hLocale === hOnline) return;
        conta('modelli', 'cambiate');
        const compilabile = nome.replace(/-ufficiale\.pdf$/, '-compilabile.pdf');
        esito({ id, tipo: 'modello-cambiato', titolo: `Modello cambiato: ${nome}`, url, impronta: hOnline.slice(0, 16),
          corpo: `Il PDF pubblicato non e' piu' uguale a \`assets/pdf/${nome}\`` +
            (hLocale ? ` (${fs.statSync(locale).size} byte in archivio, ${r.corpo.length} online).` : ' (il file non e\' nel repository).') +
            `\n\nPagina ufficiale: ${pagina}` +
            (compilabile !== nome && fs.existsSync(path.join(RADICE, 'assets', 'pdf', compilabile))
              ? `\n\nNe deriva \`assets/pdf/${compilabile}\`: se cambia la grafica, vanno rimisurati i campi (scripts/prepara-*.py) e riprovato il compilatore.` : '') });
      })());
    }

    // 2. Pagine "modelli e istruzioni": l'elenco dei documenti e' cambiato?
    for (const extra of registro.pagine_modelli || []) if (!pagineModelli.has(extra.url)) pagineModelli.set(extra.url, (extra.file || []).map((f) => ({ nome: path.basename(f) })));
    for (const [pagina, nostri] of pagineModelli) {
      lavori.push((async () => {
        const rel = 'modelli/' + filePagina(pagina);
        seguite.add(rel);
        const r = await prendi(pagina, 'pagine-modelli');
        const id = 'elenco-modelli:' + rel;
        if (sparita(r)) {
          conta('pagine-modelli', 'controllate');
          return esito({ id: 'rotto:' + pagina, tipo: 'collegamento-rotto', titolo: 'Pagina dei modelli sparita: ' + filePagina(pagina).replace(/\.txt$/, ''), url: pagina, impronta: String(r.stato),
            corpo: `La pagina ufficiale dei modelli risponde ${r.stato}. Modelli che ne dipendono: ${nostri.map((n) => '`' + n.nome + '`').join(', ')}` + elencoPagine(pagineDi(pagina)) });
        }
        if (guasta(r)) return;
        const doc = C.collegamentiDocumenti(r.corpo.toString('utf8'), r.finale || pagina);
        if (!doc.length) { conta('pagine-modelli', 'errori'); errori.push(`pagine-modelli: nessun documento trovato ${pagina}`); return; }
        const diff = confronta('pagine-modelli', rel, doc, id);
        if (!diff) return;
        const assenti = nostri.filter((n) => n.url && !doc.some((d) => d.startsWith(new URL(n.url).origin + new URL(n.url).pathname)));
        esito({ id, tipo: 'elenco-modelli-cambiato', titolo: `Documenti cambiati nella pagina dei modelli (${filePagina(pagina).replace(/\.txt$/, '')})`,
          url: pagina, impronta: C.impronta(doc.join('\n')),
          corpo: `Nell'elenco dei documenti della pagina ufficiale:\n\n${blocco(diff)}` +
            (assenti.length ? `\n\nModelli usati dal sito che la pagina non elenca piu' allo stesso indirizzo: ${assenti.map((n) => '`' + n.nome + '`').join(', ')}` : '') +
            `\n\nModelli del sito presi da questa pagina: ${nostri.map((n) => '`' + n.nome + '`').join(', ')}` });
      })());
    }

    // 3. Normattiva: articoli e atti collegati dalle pagine o citati nei dati
    const urn = (u) => /^https:\/\/www\.normattiva\.it\/uri-res\/N2Ls\?urn:/.test(u);
    const norme = new Set([...dove.keys()].filter(urn));
    for (const u of indirizziIn(regole)) if (urn(u)) norme.add(u);
    for (const s of registro.scadenze || []) if (s.fonte && urn(s.fonte)) norme.add(s.fonte);
    // norme da seguire anche se nessuna pagina le collega (per esempio quelle
    // da cui dipende uno strumento nuovo)
    for (const u of registro.norme || []) if (urn(u)) norme.add(u);
    let formaIgnota = 0;
    const articoliLetti = [];
    for (const url of [...norme].sort()) {
      lavori.push((async () => {
        const rel = 'normattiva/' + fileNormattiva(url);
        seguite.add(rel);
        const r = await prendi(url, 'normattiva');
        const html = r.corpo.toString('utf8');
        const pagine = pagineDi(url);
        if (sparita(r) || (r.stato === 200 && C.paginaErrore(html))) {
          conta('normattiva', 'controllate');
          return esito({ id: 'rotto:' + url, tipo: 'collegamento-rotto', titolo: 'Norma non trovata su Normattiva: ' + (url.split('?')[1] || url), url, impronta: String(r.stato),
            corpo: `Normattiva non trova l'atto (risposta ${r.stato}). Controllare l'URN.` + elencoPagine(pagine) });
        }
        if (guasta(r)) return;
        const articolo = url.includes('~art');
        const righe = articolo ? C.articoloNormattiva(html) : C.attoNormattiva(html);
        if (!righe) {
          formaIgnota++;
          conta('normattiva', 'errori');
          errori.push(`normattiva: pagina di forma sconosciuta ${url}` + (formaIgnota <= 3 ? `\n      ${C.indizioForma(html)}` : ''));
          return;
        }
        const chiesto = C.articoloChiesto(url);
        const mostrato = articolo ? C.numeroArticolo(righe) : null;
        if (chiesto && mostrato && chiesto !== mostrato) {
          conta('normattiva', 'controllate');
          if (aggiorna) { errori.push(`normattiva: mostra l'art. ${mostrato} invece dell'art. ${chiesto} ${url}`); return; }
          return esito({ id: 'sbagliato:' + url, tipo: 'articolo-sbagliato', titolo: `Collegamento all'articolo sbagliato: ${url.split('?')[1] || url}`,
            url, impronta: mostrato, pagine,
            corpo: `Il collegamento chiede l'art. ${chiesto}, ma Normattiva mostra l'art. ${mostrato}. Succede con i testi unici allegati a un decreto: l'URN giusto indica l'allegato (per esempio \`;346:1~art17\` invece di \`;346~art17\`). Verificare l'indirizzo con leggi-fonti in modo stato e correggerlo nelle pagine.` + elencoPagine(pagine) });
        }
        const id = 'norma:' + rel;
        if (articolo) articoliLetti.push({ url, righe, pagine });
        const diff = confronta('normattiva', rel, righe, id);
        if (!diff) return;
        esito({ id, tipo: articolo ? 'articolo-cambiato' : 'atto-aggiornato',
          titolo: (articolo ? 'Articolo di legge cambiato: ' : 'Atto aggiornato: ') + (url.split('?')[1] || url),
          url, impronta: C.impronta(righe.join('\n')), pagine,
          corpo: (articolo ? 'Il testo vigente dell\'articolo su Normattiva e\' cambiato:' : 'Normattiva segnala un aggiornamento dell\'atto (gli articoli citati dal sito si controllano a parte):') +
            `\n\n${blocco(diff)}` + elencoPagine(pagine) });
      })());
    }

    // 3b. Commi oltre il centesimo degli articoli divisi in blocchi (l'art. 1
    // delle leggi di bilancio): la pagina dell'articolo mostra solo i primi
    // cento, gli altri si leggono nel blocco, nella stessa sessione
    for (const b of registro.blocchi_normattiva || []) {
      lavori.push((async () => {
        const rel = 'normattiva/' + fileNormattiva(b.articolo).replace(/\.txt$/, `-commi-${b.da}-${b.a}.txt`);
        seguite.add(rel);
        const pagine = b.pagine || pagineDi(b.articolo);
        const { articolo, blocco: pagina, indirizzo } = await conSessione(b.articolo, (html) => C.indirizzoBlocco(html, b.da));
        tentativi++;
        const letta = pagina || articolo;
        if (!pagina || guasta(pagina)) {
          falliti++;
          conta('normattiva-blocchi', 'errori');
          errori.push(`normattiva-blocchi: ${pagina ? (pagina.stato || pagina.errore) : (articolo.stato === 200 ? 'nessun pulsante dei blocchi' : (articolo.stato || articolo.errore))} ${b.id}`);
          return;
        }
        const righe = C.commiDelBlocco(C.articoloNormattiva(letta.corpo.toString('utf8')), b.da, b.a);
        if (!righe) {
          conta('normattiva-blocchi', 'errori');
          errori.push(`normattiva-blocchi: commi ${b.da}-${b.a} non trovati ${indirizzo}\n      ${C.indizioForma(letta.corpo.toString('utf8'))}`);
          return;
        }
        const id = 'norma:' + rel;
        const diff = confronta('normattiva-blocchi', rel, righe, id);
        if (!diff) return;
        esito({ id, tipo: 'articolo-cambiato', titolo: `Commi ${b.da}-${b.a} cambiati: ${b.articolo.split('?')[1] || b.articolo}`,
          url: b.articolo, impronta: C.impronta(righe.join('\n')), dati: b.dati, pagine,
          corpo: `Il testo dei commi ${b.da}-${b.a} su Normattiva e' cambiato (letto nel blocco ${indirizzo}):\n\n${blocco(diff)}` +
            '\n\nPer rileggerli: leggi-fonti con la pagina dell\'articolo e poi l\'indirizzo del blocco nella stessa esecuzione, con «cerca».' +
            elencoDati(b.dati) + elencoPagine(pagine) });
      })());
    }

    // 4. Schede e documenti di data/fonti-monitorate.json
    for (const s of registro.schede || []) {
      lavori.push((async () => {
        const rel = 'schede/' + s.id + '.txt';
        if (s.tipo !== 'stato') seguite.add(rel);
        const r = await prendi(s.url, 'schede');
        const pagine = s.pagine || pagineDi(s.url);
        if (sparita(r)) {
          conta('schede', 'controllate');
          return esito({ id: 'rotto:' + s.url, tipo: 'collegamento-rotto', titolo: `Fonte sparita: ${s.id}`, url: s.url, impronta: String(r.stato), pagine, dati: s.dati,
            corpo: `La fonte \`${s.id}\` risponde ${r.stato}.` + elencoDati(s.dati) + elencoPagine(pagine) });
        }
        if (guasta(r) || s.tipo === 'stato') { if (s.tipo === 'stato' && !guasta(r)) conta('schede', 'controllate'); return; }
        const id = 'scheda:' + s.id;
        if (s.tipo === 'pdf') {
          const righe = [`sha256 ${sha256(r.corpo)}`, `byte ${r.corpo.length}`];
          const diff = confronta('schede', rel, righe, id);
          if (diff) esito({ id, tipo: 'pdf-cambiato', titolo: `Documento cambiato: ${s.id}`, url: s.url, impronta: righe[0].slice(7, 23), dati: s.dati, pagine,
            corpo: `Il PDF ufficiale non e' piu' quello letto quando sono stati scritti i dati.\n\n${blocco(diff)}\n\nRileggerlo (workflow leggi-fonti) e confrontare le cifre.` + elencoDati(s.dati) + elencoPagine(pagine) });
          return;
        }
        const tutte = C.testoDaHtml(r.corpo.toString('utf8'));
        const mancanti = C.espressioniMancanti(tutte, s.deve_contenere);
        if (mancanti.length && !aggiorna) {
          esito({ id: 'cifra:' + s.id, tipo: 'cifra-sparita', titolo: `Cifra non piu' presente nella fonte: ${s.id}`, url: s.url, impronta: C.impronta(mancanti.join('|')), dati: s.dati, pagine,
            corpo: `Nella pagina ufficiale non compaiono piu' queste espressioni, da cui dipendono i dati del sito:\n\n${mancanti.map((m) => '- «' + m + '»').join('\n')}\n\nPuo' essere cambiata la cifra o solo il modo di scriverla: rileggere la pagina.` +
              elencoDati(s.dati) + elencoPagine(pagine) + (s.motori ? '\n\n**Motori di calcolo:** ' + s.motori.map((m) => '`' + m + '`').join(', ') : '') });
        }
        const righe = C.righeConCifre(tutte);
        const diff = confronta('schede', rel, righe, id);
        if (diff) esito({ id, tipo: 'pagina-cambiata', titolo: `Scheda cambiata: ${s.id}`, url: s.url, impronta: C.impronta(righe.join('\n')), dati: s.dati, pagine,
          corpo: `Righe con cifre o date cambiate nella pagina ufficiale:\n\n${blocco(diff)}` + elencoDati(s.dati) + elencoPagine(pagine) });
      })());
    }

    // 5. Tutti gli altri collegamenti esterni: esistono ancora?
    if (!aggiorna) {
      const giaVisti = new Set([...norme, ...(registro.schede || []).map((s) => s.url), ...pagineModelli.keys()]);
      for (const [url] of dove) {
        if (giaVisti.has(url) || SALTA.test(url)) continue;
        lavori.push((async () => {
          const r = await prendi(url, 'collegamenti');
          conta('collegamenti', 'controllate');
          if (sparita(r)) {
            conta('collegamenti', 'cambiate');
            esito({ id: 'rotto:' + url, tipo: 'collegamento-rotto', titolo: 'Collegamento a una pagina sparita: ' + url.replace(/^https:\/\//, '').slice(0, 120), url, impronta: String(r.stato), pagine: pagineDi(url),
              corpo: `La pagina risponde ${r.stato}.` + elencoPagine(pagineDi(url)) });
          }
        })());
      }
    }

    await Promise.all(lavori);

    // Articoli citati che cambiano in una data futura o sono gia' abrogati
    if (!aggiorna) {
      const V = C.vigenzeDaSegnalare(articoliLetti, oggi);
      const riga = (a) => `- [${a.url.split('?')[1]}](${a.url}) — ${a.righe.slice(1, 3).join(' · ').slice(0, 240)}` +
        (a.pagine.length ? `\n  pagine: ${a.pagine.map((p) => '`' + p + '`').join(', ')}` : '');
      for (const g of V.futuri) {
        const leggi = [...new Set(g.articoli.map((a) => a.da).filter(Boolean))];
        esito({ id: 'futura:' + g.dal, tipo: 'versione-futura', titolo: `Dal ${g.dal} cambiano ${g.articoli.length} articoli citati dal sito`,
          url: '', impronta: C.impronta(g.articoli.map((a) => a.url + '\n' + a.righe.join('\n')).join('\n')),
          corpo: `Normattiva ha gia' pubblicato il testo che questi articoli avranno dal ${g.dal}` +
            (leggi.length ? ` (abrogazioni disposte da: ${leggi.join('; ')})` : '') +
            '. Prima di quella data vanno controllate le pagine che li citano: riferimenti da spostare al nuovo testo, regole che cambiano.\n\n' +
            g.articoli.map(riga).join('\n') });
      }
      for (const g of V.abrogati) {
        esito({ id: 'abrogata:' + g.da, tipo: 'norma-abrogata', titolo: `Articoli citati abrogati dal ${g.da}`,
          url: '', impronta: C.impronta(g.articoli.map((a) => a.url).join('\n')),
          corpo: `Il sito cita articoli che non sono piu' in vigore (abrogati dal ${g.da}). Vanno sostituiti con le norme che li hanno rimpiazzati:\n\n` +
            g.articoli.map(riga).join('\n') });
      }
    }

    if (formaIgnota >= 5 && !aggiorna) {
      esito({ id: 'forma:normattiva', tipo: 'forma-cambiata', titolo: 'Normattiva ha cambiato la forma delle pagine', url: 'https://www.normattiva.it/', impronta: 'normattiva',
        corpo: `${formaIgnota} pagine di Normattiva non hanno piu' la forma attesa ("Testo in vigore dal:" ... "articolo precedente"). Va adattato \`articoloNormattiva\` in scripts/sentinella/controlli.js.` });
    }
  }

  // Un archivio per le fonti che non si seguono piu' e' solo rumore
  if (aggiorna && !solo.length && !senzaRete) {
    (function pota(dir) {
      if (!fs.existsSync(dir)) return;
      for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, v.name);
        if (v.isDirectory()) pota(p);
        else if (!seguite.has(path.relative(ARCHIVIO, p).split(path.sep).join('/'))) fs.unlinkSync(p);
      }
    })(ARCHIVIO);
  }

  // Se non risponde quasi niente, il problema e' la sentinella (rete, blocchi), non le fonti
  const cieca = tentativi > 0 && falliti / tentativi > 0.3;
  const finali = cieca ? [] : esiti;
  if (cieca) {
    finali.push({ id: 'cieca:' + oggi, tipo: 'cieca', priorita: 'alta', titolo: 'La sentinella non riesce a leggere le fonti', url: '', impronta: oggi,
      corpo: `${falliti} documenti su ${tentativi} non si sono potuti scaricare: nessun confronto e' stato fatto. Primi errori:\n\n` + errori.slice(0, 30).map((e) => '- ' + e).join('\n') });
  }
  if (senzaCopia.length && !aggiorna && !cieca) {
    finali.push({ id: 'senza-copia', tipo: 'senza-copia', priorita: 'bassa', titolo: `Fonti senza copia in archivio (${senzaCopia.length})`, url: '',
      impronta: C.impronta(senzaCopia.sort().join('\n')),
      corpo: 'Queste fonti non hanno ancora una copia in fonti/archivio/, quindi non si possono confrontare. Lanciare il workflow sentinella in modo aggiorna, con --solo per queste:\n\n' + senzaCopia.map((s) => '- `' + s + '`').join('\n') });
  }

  // Le scadenze non hanno bisogno della rete: si calcolano sempre
  if (!aggiorna) {
    const leggiJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(RADICE, f), 'utf8')); } catch { return null; } };
    for (const v of C.datiVecchi(registro.dati_vivi, leggiJson, oggi)) {
      finali.push({ id: `vecchio:${v.id}:${v.quando || 'assente'}`, tipo: 'dato-vecchio', priorita: 'alta',
        titolo: `Dati non aggiornati: ${v.id}`, url: v.fonte || '', impronta: v.quando || 'assente',
        corpo: (v.quando ? `L'ultimo aggiornamento di \`${v.file}\` e' del ${v.quando} (${v.giorni} giorni fa, il massimo previsto e' ${v.max_giorni}).`
          : `\`${v.file}\` manca o non ha la data in \`${v.campo}\`.`) +
          (v.workflow ? ` Controllare le ultime esecuzioni di \`.github/workflows/${v.workflow}\`: probabilmente la fonte ha cambiato indirizzo o formato.` : '') });
    }
    for (const s of C.scadenzeDovute(registro, regole, oggi, titoliPagine())) {
      finali.push({ id: s.id, tipo: 'scadenza', priorita: 'alta', titolo: 'Da aggiornare: ' + s.titolo, url: s.fonte || '', impronta: s.dal, dati: s.dati,
        corpo: s.cosa + (s.fonte ? `\n\nFonte da rileggere: ${s.fonte}` : '') + elencoDati(s.dati) });
    }
  }

  const rapporto = { data: oggi, modo: aggiorna ? 'aggiorna' : 'controlla', cieca, tentativi, falliti, stato, errori, esiti: finali };
  fs.writeFileSync(fileRapporto, JSON.stringify(rapporto, null, 2) + '\n');
  console.log(`Sentinella ${rapporto.modo} ${oggi}: ${tentativi} documenti, ${falliti} non letti, ${finali.length} esiti.`);
  for (const [cat, v] of Object.entries(stato)) console.log(`  ${cat}: ${JSON.stringify(v)}`);
  for (const e of finali) console.log(`  [${e.priorita}] ${e.titolo}`);
  if (errori.length) console.log('\nNon letti:\n  ' + errori.join('\n  '));
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { main, fileNormattiva, filePagina, indirizziIn, modelli, titoliPagine };
