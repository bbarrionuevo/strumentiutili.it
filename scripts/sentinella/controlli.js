// scripts/sentinella/controlli.js — Le parti della sentinella che non usano la rete.
//
// La sentinella (scripts/sentinella.js, lanciata ogni lunedi' da
// .github/workflows/sentinella.yml) scarica i documenti ufficiali da cui il
// sito prende modelli, norme e cifre, e li confronta con la copia salvata in
// fonti/archivio/. Qui ci sono le funzioni pure: da una pagina al testo che
// conta, il confronto fra due testi, le scadenze dei dati. Sono provate in
// tests/sentinella.test.js con pagine di esempio, senza scaricare niente.
'use strict';

const crypto = require('node:crypto');

const ENTITA = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  agrave: 'à', aacute: 'á', egrave: 'è', eacute: 'é', igrave: 'ì', iacute: 'í',
  ograve: 'ò', oacute: 'ó', ugrave: 'ù', uacute: 'ú',
  Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
  rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', laquo: '«', raquo: '»',
  deg: '°', ordm: 'º', ordf: 'ª', euro: '€', times: '×', ndash: '–', mdash: '—',
  hellip: '…', middot: '·', sect: '§', bull: '•'
};

function decodificaEntita(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tutto, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tutto;
    }
    return Object.prototype.hasOwnProperty.call(ENTITA, e) ? ENTITA[e] : tutto;
  });
}

/**
 * Da HTML a righe di testo. Via commenti, script, stili e immagini vettoriali;
 * i blocchi (paragrafi, voci di elenco, celle) diventano righe. Apostrofi e
 * virgolette tipografiche si uniformano: una pagina che passa da ’ a ' non e'
 * una pagina cambiata.
 */
function testoDaHtml(html) {
  const s = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|tr|td|th|table|h[1-6]|section|article|header|footer|nav|main|aside|dt|dd|blockquote|pre|form|option)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  return decodificaEntita(s)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .split('\n')
    .map((r) => r.replace(/ {2,}/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Il testo di un articolo come lo mostra Normattiva: la data da cui vale il
 * testo e l'articolo, senza menu, pulsanti e note della pagina. Restituisce
 * null se la pagina non ha la forma attesa (Normattiva cambiata, o pagina
 * d'errore): chi chiama lo segnala invece di confrontare testo a caso.
 */
function articoloNormattiva(html) {
  const s = String(html || '');
  const inizio = s.search(/Testo in vigore dal:/);
  if (inizio < 0) return null;
  // l'articolo finisce al primo pulsante di navigazione (il primo articolo di
  // un atto non ha "articolo precedente"); si cerca il pulsante, non le parole,
  // che possono stare anche nel testo ("di cui all'articolo precedente")
  const pulsante = /class=["']btn["'][^>]*>(?:\s|<[^>]*>|&nbsp;|&#160;)*articolo (?:precedente|successivo)/g;
  pulsante.lastIndex = inizio;
  const trovato = pulsante.exec(s);
  // se la forma del pulsante cambia, si ripiega sulle parole
  const fineTesto = trovato ? trovato.index
    : Math.min(...['articolo precedente', 'articolo successivo'].map((m) => s.indexOf(m, inizio)).filter((i) => i >= 0), Infinity);
  if (!Number.isFinite(fineTesto)) return null;
  const tag = s.lastIndexOf('<a', fineTesto);
  const pezzo = s.slice(inizio, tag > inizio ? tag : fineTesto);
  const righe = testoDaHtml(pezzo).filter((r) => !/^aggiornamenti all'articolo$/i.test(r));
  // "Testo in vigore dal:" e la data finiscono su due righe: si riuniscono
  if (/^Testo in vigore dal:$/.test(righe[0] || '') && /^\d{1,2}-\d{1,2}-\d{4}$/.test(righe[1] || '')) {
    righe.splice(0, 2, 'Testo in vigore dal: ' + righe[1]);
  }
  if (righe.length < 2 || !/^Testo in vigore dal: \d/.test(righe[0])) return null;
  return righe;
}

/**
 * Su Normattiva gli articoli lunghissimi (l'art. 1 delle leggi di bilancio)
 * sono divisi in blocchi di cento commi e la pagina dell'articolo mostra solo
 * il primo. Gli altri blocchi si chiedono a /atto/caricaArticolo con
 * art.progressivo, nella stessa sessione (cookie) della pagina: l'indirizzo
 * si ricava dal pulsante «articolo successivo» della pagina, cambiando il
 * progressivo con quello del blocco che contiene il comma `da` (1 per i
 * commi 1-100, 8 per i commi 701-800). Null se la pagina non ha il pulsante.
 */
function indirizzoBlocco(html, da) {
  const m = String(html || '').match(/showArticle\('(\/atto\/caricaArticolo\?[^']*?art\.progressivo=)\d+([^']*)'\)/);
  if (!m || !(Number(da) >= 1)) return null;
  const progressivo = Math.floor((Number(da) - 1) / 100) + 1;
  return 'https://www.normattiva.it' + (m[1] + progressivo + m[2]).replace(/ /g, '%20');
}

/**
 * Le righe dei soli commi da..a di un blocco letto con articoloNormattiva,
 * con le loro lettere e i periodi che vanno a capo. Un comma comincia con il
 * suo numero ("745. ", "768-bis. "); si accettano solo numeri del blocco e in
 * ordine crescente, cosi' un comma citato fra virgolette ("« 2. ...") non
 * viene preso per l'inizio di un altro. Null se non c'e' nessuno dei commi.
 */
function commiDelBlocco(righe, da, a) {
  const primo = Math.floor((Number(da) - 1) / 100) * 100 + 1;
  const fuori = [];
  let comma = null;
  for (const r of righe || []) {
    const m = String(r).match(/^(\d+)(?:-[a-z]+)?\.\s/);
    const n = m ? Number(m[1]) : NaN;
    if (n >= primo && n < primo + 100 && (comma === null || n >= comma)) comma = n;
    if (comma !== null && comma >= da && comma <= a) fuori.push(r);
  }
  return fuori.length ? fuori : null;
}

/**
 * Il numero dell'articolo mostrato ("Art. 4-bis" -> "4bis") e quello chiesto
 * nell'indirizzo ("~art4bis" -> "4bis"). Se non coincidono, il collegamento
 * porta all'articolo sbagliato: succede con i testi unici allegati a un
 * decreto, dove "~art17" apre l'art. 1 del decreto che li approva.
 */
function numeroArticolo(righe) {
  // "Art. 4-bis", oppure per un testo unico allegato "(Testo Unico ... - Art. 17)"
  const r = (righe || []).map((x) => x.match(/^(?:\(?.* - )?Art\.\s*(\d+(?:[\s-]*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\b/)).find(Boolean);
  return r ? r[1].replace(/[\s-]/g, '').toLowerCase() : null;
}

function articoloChiesto(url) {
  const m = String(url).match(/~art(\d+[a-z]*)/i);
  return m ? m[1].toLowerCase() : null;
}

/** "Testo in vigore dal: 1-1-2027" -> "2027-01-01" (null se manca). */
function vigoreDal(righe) {
  const m = String((righe || [])[0] || '').match(/^Testo in vigore dal: (\d{1,2})-(\d{1,2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** "((ARTICOLO ABROGATO DAL D.LGS. 19 GENNAIO 2026, N. 10 ))" -> "D.LGS. 19 GENNAIO 2026, N. 10" */
function abrogatoDa(righe) {
  const m = (righe || []).join('\n').match(/\(\((?:ARTICOLO|PROVVEDIMENTO) ABROGATO DA(?:L|LLA|LLO)? ([^)]+?)\s*\)\)/);
  return m ? m[1].trim() : null;
}

/**
 * Normattiva mostra l'ultima versione approvata di un articolo, anche se
 * entra in vigore piu' avanti: "Testo in vigore dal: 1-1-2027". Qui si
 * raggruppano gli articoli citati dal sito che cambiano (o sono abrogati) in
 * una data futura, e quelli gia' abrogati, per legge che li abroga: una
 * segnalazione per gruppo, con tutte le pagine da rivedere.
 */
function vigenzeDaSegnalare(articoli, oggi) {
  const futuri = new Map(), abrogati = new Map();
  for (const a of articoli) {
    const dal = vigoreDal(a.righe);
    const da = abrogatoDa(a.righe);
    if (dal && dal > oggi) {
      if (!futuri.has(dal)) futuri.set(dal, []);
      futuri.get(dal).push({ ...a, dal, da });
    } else if (da) {
      if (!abrogati.has(da)) abrogati.set(da, []);
      abrogati.get(da).push({ ...a, dal, da });
    }
  }
  const ordina = (v) => v.sort((x, y) => x.url.localeCompare(y.url));
  return {
    futuri: [...futuri].sort().map(([dal, v]) => ({ dal, articoli: ordina(v) })),
    abrogati: [...abrogati].sort().map(([da, v]) => ({ da, articoli: ordina(v) }))
  };
}

/**
 * Per un atto intero (un collegamento senza "~art") conta la data
 * dell'ultimo aggiornamento che Normattiva scrive sotto il titolo.
 */
function attoNormattiva(html) {
  const righe = testoDaHtml(html);
  const titolo = (String(html || '').match(/<title[^>]*>([^<]{0,300})/i) || [, ''])[1];
  const nome = decodificaEntita(titolo).replace(/\s+/g, ' ').replace(/\s*-\s*Normattiva\s*$/, '').trim();
  if (!nome) return null;
  const agg = righe.map((r) => r.match(/Ultimo aggiornamento all'atto pubblicato il (\d{2}\/\d{2}\/\d{4})/)).find(Boolean);
  return [nome, agg ? "Ultimo aggiornamento all'atto: " + agg[1] : "Nessun aggiornamento all'atto indicato"];
}

/** Un pezzo della pagina attorno alla fine dell'articolo, per capire perche' non e' stata riconosciuta. */
function indizioForma(html) {
  const s = String(html || '');
  const i = s.indexOf('articolo precedente', Math.max(0, s.search(/Testo in vigore dal:/)));
  const j = i >= 0 ? i : s.indexOf('articolo successivo');
  return j < 0 ? '(nessun pulsante di navigazione)' : s.slice(Math.max(0, j - 160), j + 30).replace(/\s+/g, ' ');
}

/** Normattiva risponde 200 anche per un atto che non esiste: lo si riconosce dal testo. */
function paginaErrore(html) {
  return /atto non (trovato|presente)|nessun (atto|documento) trovato|pagina non trovata|page not found|documento non disponibile/i
    .test(String(html || '').slice(0, 300000));
}

/**
 * Delle schede degli enti si tengono le righe con cifre (importi, date,
 * soglie, percentuali): sono quelle da cui dipendono i calcoli, e cosi' un
 * menu ridisegnato non fa scattare l'allarme. Le righe che sembrano codice
 * restano fuori.
 */
function righeConCifre(righe) {
  return righe.filter((r) => /\d/.test(r)
    && (r.match(/\p{L}{2,}/gu) || []).length >= 3
    && !/[{};=]|\\x|function\b|\bvar\b|\breturn\b|https?:\/\//.test(r));
}

/**
 * I documenti elencati in una pagina "modelli e istruzioni": percorso senza
 * parametri e testo del collegamento. Una riga nuova e' un modello nuovo, una
 * riga sparita un modello ritirato o sostituito.
 */
function collegamentiDocumenti(html, base) {
  const fuori = new Set();
  const re = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const href = decodificaEntita(m[1]);
    if (!/\/documents\/|\.pdf(\?|#|$)/i.test(href)) continue;
    let url;
    try { url = new URL(href, base); } catch { continue; }
    const etichetta = testoDaHtml(m[2]).join(' ').slice(0, 200);
    fuori.add(url.origin + url.pathname + (etichetta ? '  «' + etichetta + '»' : ''));
  }
  return [...fuori].sort();
}

function impronta(testo) {
  return crypto.createHash('sha256').update(String(testo)).digest('hex').slice(0, 16);
}

/**
 * Le righe tolte (-) e aggiunte (+) fra due testi. Si tolgono prima inizio e
 * fine in comune; se quel che resta e' troppo grande per il confronto riga per
 * riga (l'articolo 1 di una legge di bilancio ha migliaia di commi), si
 * elencano le righe che compaiono da una parte sola.
 */
function diffRighe(prima, dopo, massimo = 60) {
  const a = Array.isArray(prima) ? prima : String(prima || '').split('\n');
  const b = Array.isArray(dopo) ? dopo : String(dopo || '').split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let fa = a.length, fb = b.length;
  while (fa > i && fb > i && a[fa - 1] === b[fb - 1]) { fa--; fb--; }
  const x = a.slice(i, fa), y = b.slice(i, fb);
  const fuori = [];
  if (x.length * y.length <= 4e6) {
    // LCS classica sulle sole righe diverse
    const n = x.length, m = y.length;
    const t = new Uint32Array((n + 1) * (m + 1));
    for (let p = n - 1; p >= 0; p--) {
      for (let q = m - 1; q >= 0; q--) {
        t[p * (m + 1) + q] = x[p] === y[q] ? t[(p + 1) * (m + 1) + q + 1] + 1
          : Math.max(t[(p + 1) * (m + 1) + q], t[p * (m + 1) + q + 1]);
      }
    }
    let p = 0, q = 0;
    while (p < n || q < m) {
      // a parita' prima la riga tolta, poi quella aggiunta, come in diff -u
      if (p < n && q < m && x[p] === y[q]) { p++; q++; }
      else if (p < n && (q === m || t[(p + 1) * (m + 1) + q] >= t[p * (m + 1) + q + 1])) fuori.push('- ' + x[p++]);
      else fuori.push('+ ' + y[q++]);
    }
  } else {
    const conta = new Map();
    for (const r of x) conta.set(r, (conta.get(r) || 0) + 1);
    for (const r of y) conta.set(r, (conta.get(r) || 0) - 1);
    for (const r of x) if (conta.get(r) > 0) { fuori.push('- ' + r); conta.set(r, conta.get(r) - 1); }
    for (const r of y) if (conta.get(r) < 0) { fuori.push('+ ' + r); conta.set(r, conta.get(r) + 1); }
  }
  if (fuori.length > massimo) {
    const altre = fuori.length - massimo;
    fuori.length = massimo;
    fuori.push(`… e altre ${altre} righe`);
  }
  return fuori;
}

/** Espressioni che una scheda deve ancora contenere; restituisce quelle sparite. */
function espressioniMancanti(righe, attese) {
  const testo = righe.join('\n').toLowerCase();
  return (attese || []).filter((e) => !testo.includes(String(e).toLowerCase().replace(/[‘’]/g, "'")));
}

// --- Scadenze dei dati ------------------------------------------------------

function isoValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const [a, m, g] = s.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g;
}

function aggiungiMesi(iso, mesi) {
  const [a, m, g] = iso.split('-').map(Number);
  const tot = a * 12 + (m - 1) + mesi;
  const anno = Math.floor(tot / 12), mese = tot % 12;
  const ultimo = new Date(Date.UTC(anno, mese + 1, 0)).getUTCDate();
  return `${anno}-${String(mese + 1).padStart(2, '0')}-${String(Math.min(g, ultimo)).padStart(2, '0')}`;
}

const PASSO = { mese: 1, trimestre: 3, anno: 12 };

/**
 * L'ultima volta che un promemoria e' scattato fino a oggi (compreso), o null
 * se non e' ancora arrivato. Con `ripeti` il promemoria torna ogni mese,
 * trimestre o anno a partire da `dal`.
 */
function occorrenza(dal, ripeti, oggi) {
  if (!isoValida(dal) || !isoValida(oggi) || dal > oggi) return null;
  if (!ripeti) return dal;
  const passo = PASSO[ripeti];
  if (!passo) return null;
  let k = 0;
  while (aggiungiMesi(dal, (k + 1) * passo) <= oggi) k++;
  return aggiungiMesi(dal, k * passo);
}

/** Legge un valore di regole-fiscali da un percorso "a.b.c". */
function valore(regole, chiave) {
  return String(chiave).split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), regole);
}

/**
 * I promemoria dovuti a oggi: quelli scritti in data/fonti-monitorate.json e
 * quelli che si ricavano dai dati stessi (una serie di tassi che finisce, un
 * indice ISTAT che manca, un anno vecchio nei titoli delle pagine).
 * Ogni voce ha un id che comprende il periodo: la stessa scadenza si segnala
 * una volta sola.
 */
function scadenzeDovute(registro, regole, oggi, titoli = {}) {
  const fuori = [];
  for (const s of (registro && registro.scadenze) || []) {
    const quando = occorrenza(s.dal, s.ripeti, oggi);
    if (!quando) continue;
    fuori.push({ id: `scadenza:${s.id}:${quando}`, titolo: s.titolo, cosa: s.cosa, dati: s.dati || [], fonte: s.fonte || null, dal: quando });
  }

  // Tassi BCE per gli interessi moratori: un valore per semestre
  const bce = valore(regole, 'interessiMoratori.storicoTassiBce') || [];
  const fineBce = bce.map((f) => f.fine).filter(isoValida).sort().pop();
  if (fineBce && fineBce < oggi) {
    const da = aggiungiMesi(fineBce.slice(0, 8) + '01', 1);
    fuori.push({
      id: `serie:tasso-bce:${da}`, titolo: `Tasso BCE per gli interessi moratori dal ${da}`,
      cosa: `La serie storicoTassiBce finisce il ${fineBce}. Il tasso del semestre che comincia il ${da} si legge nel comunicato del MEF in Gazzetta Ufficiale.`,
      dati: ['interessiMoratori.storicoTassiBce'], fonte: null, dal: da
    });
  }

  // Tasso di interesse legale: un valore per anno
  const legali = valore(regole, 'rivalutazione_interessi_2026.interessi_legali') || [];
  const fineLegali = legali.map((f) => f.al).filter(isoValida).sort().pop();
  if (fineLegali && fineLegali < oggi) {
    const anno = Number(fineLegali.slice(0, 4)) + 1;
    fuori.push({
      id: `serie:interessi-legali:${anno}`, titolo: `Tasso di interesse legale ${anno}`,
      cosa: `La serie interessi_legali finisce il ${fineLegali}. Il tasso del ${anno} lo fissa il decreto del Ministero dell'economia (di solito a dicembre).`,
      dati: ['rivalutazione_interessi_2026.interessi_legali'], fonte: null, dal: `${anno}-01-01`
    });
  }

  // Indici ISTAT FOI: l'indice del mese M esce verso meta' del mese dopo
  const foi = valore(regole, 'rivalutazione_interessi_2026.serie_istat_foi') || {};
  const mesi = [];
  for (const [a, v] of Object.entries(foi)) for (const m of Object.keys(v || {})) mesi.push(`${a}-${m}`);
  const ultimo = mesi.sort().pop();
  if (ultimo) {
    const prossimo = aggiungiMesi(ultimo + '-01', 1).slice(0, 7);
    const atteso = aggiungiMesi(ultimo + '-16', 2);
    if (atteso <= oggi) {
      fuori.push({
        id: `serie:istat-foi:${prossimo}`, titolo: `Indice ISTAT FOI di ${prossimo}`,
        cosa: `L'ultimo indice FOI nei dati e' quello di ${ultimo}; ISTAT pubblica il successivo verso meta' mese. Va aggiunto con il valore del comunicato ISTAT.`,
        dati: ['rivalutazione_interessi_2026.serie_istat_foi'], fonte: null, dal: atteso
      });
    }
  }

  // Anno vecchio nei titoli delle pagine
  const annoOggi = Number(oggi.slice(0, 4));
  const vecchie = Object.entries(titoli).filter(([, t]) => {
    // "D.Lgs. 231/2002" e' il numero di una legge, non l'anno della pagina
    const anni = [...String(t).matchAll(/(?<![/\d.])\b(20[2-9]\d)\b(?!\/)/g)].map((m) => Number(m[1]));
    return anni.length && Math.max(...anni) < annoOggi;
  }).map(([p]) => p).sort();
  if (vecchie.length) {
    fuori.push({
      id: `anno:titoli:${annoOggi}`, titolo: `Pagine con un anno passato nel titolo (${vecchie.length})`,
      cosa: `Nel ${annoOggi} queste pagine hanno ancora solo anni passati nel titolo. Si aggiornano quando le regole del ${annoOggi} sono verificate, non prima:\n` + vecchie.map((p) => `- ${p}`).join('\n'),
      dati: [], fonte: null, dal: `${annoOggi}-01-01`
    });
  }
  return fuori;
}

/**
 * I dati aggiornati da soli (prezzi, tassi, indici scaricati ogni giorno da un
 * workflow) che hanno smesso di aggiornarsi. Ogni voce dice in quale file e in
 * quale campo sta la data dell'ultimo aggiornamento e quanti giorni puo' avere.
 * `leggi(file)` restituisce il contenuto JSON del file, o null se manca.
 */
function datiVecchi(voci, leggi, oggi) {
  const fuori = [];
  for (const v of voci || []) {
    const dati = leggi(v.file);
    const quando = dati ? String(valore(dati, v.campo) || '').slice(0, 10) : '';
    if (!isoValida(quando)) {
      fuori.push({ ...v, quando: null, giorni: null });
      continue;
    }
    const giorni = Math.round((Date.parse(oggi + 'T00:00:00Z') - Date.parse(quando + 'T00:00:00Z')) / 86400000);
    if (giorni > v.max_giorni) fuori.push({ ...v, quando, giorni });
  }
  return fuori;
}

/**
 * Quanto e' urgente un esito. Alta: cambia cio' che il sito mostra o calcola
 * (un modello, un articolo di legge, una cifra, un collegamento morto, una
 * scadenza). Bassa: una pagina e' cambiata ma le cifre controllate ci sono
 * ancora, o un atto e' stato aggiornato in articoli che il sito non cita.
 */
function classifica(esito) {
  const alta = ['modello-cambiato', 'modello-sparito', 'elenco-modelli-cambiato', 'articolo-cambiato', 'articolo-sbagliato', 'versione-futura', 'norma-abrogata', 'pdf-cambiato',
    'cifra-sparita', 'collegamento-rotto', 'scadenza', 'forma-cambiata', 'cieca', 'dato-vecchio'];
  return alta.includes(esito.tipo) ? 'alta' : 'bassa';
}

module.exports = {
  decodificaEntita, testoDaHtml, articoloNormattiva, indirizzoBlocco, commiDelBlocco, numeroArticolo, articoloChiesto, vigoreDal, abrogatoDa, vigenzeDaSegnalare,
  attoNormattiva, paginaErrore, indizioForma,
  righeConCifre, collegamentiDocumenti, impronta, diffRighe, espressioniMancanti,
  isoValida, aggiungiMesi, occorrenza, valore, scadenzeDovute, datiVecchi, classifica
};
