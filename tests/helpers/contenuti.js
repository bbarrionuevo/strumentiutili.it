// tests/helpers/contenuti.js — Il testo che un lettore vede davvero in una
// pagina, per controllare la qualita' dei contenuti (tests/contenuti.test.js).
const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..', '..');

// Le parole dei vecchi "trattati" scritti per i motori di ricerca: gergo
// tecnico e sigle che a chi legge non dicono niente.
const LESSICO = /Trattato|Tecnico-Normativ|Dossier Analitico|Casuistica|E-E-A-T|YMYL|Zero-Backend|Garbage Collection|ingegneri software indipendenti|atomicamente|albero DOM|Manuale Tecnico|Compendio Tecnico|Manuale Giuslavoristico/;

// Commenti HTML lasciati dalle vecchie versioni: in spagnolo o sul "SEO".
const COMMENTO_VECCHIO = /SEO|E-E-A-T|[áíóúñÁÍÓÚÑ]|\b(BLOQUE|Bloque|ESTO|ESTE|CONTENEDOR|ACORDE\w*|desplegable|debajo|Ordenada|Ordenata|Marcado|NUEVO|Nuevo)\b/;

const ESCLUSE = ['node_modules', 'vendor', '.git', 'tests', 'scripts'];

function tutteLePagine() {
  const fuori = [];
  (function giro(dir) {
    for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ESCLUSE.includes(voce.name)) continue;
      const pieno = path.join(dir, voce.name);
      if (voce.isDirectory()) giro(pieno);
      else if (voce.name.endsWith('.html') && !voce.name.endsWith('test.html')) fuori.push(pieno);
    }
  })(RADICE);
  return fuori.sort().map((f) => ({ file: f, percorso: path.relative(RADICE, f).split(path.sep).join('/'), html: fs.readFileSync(f, 'utf8') }));
}

function indicizzabile(html) {
  return !/<meta[^>]+name="robots"[^>]+noindex/i.test(html);
}

function pagineIndicizzabili() {
  return tutteLePagine().filter((p) => indicizzabile(p.html));
}

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', egrave: 'è', eacute: 'é', agrave: 'à', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Egrave: 'È', ndash: '–', mdash: '—', hellip: '…', euro: '€', rarr: '→' };

function entita(t) {
  return t.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITA[e] !== undefined ? ENTITA[e] : m;
  });
}

function testoVisibile(html) {
  return entita(html
    .replace(/<head\b[\s\S]*?<\/head>/i, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ');
}

function normalizza(t) {
  return entita(String(t)).toLowerCase().replace(/[’‘]/g, "'").replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim();
}

// Le domande dei blocchi FAQPage nei dati strutturati della pagina.
function domandeFaq(html) {
  const fuori = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let dati;
    try { dati = JSON.parse(m[1]); } catch (e) { continue; }
    (function cerca(x) {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(cerca); return; }
      if (x['@type'] === 'FAQPage') (x.mainEntity || []).forEach((q) => { if (q && q.name) fuori.push(q.name); });
      Object.values(x).forEach(cerca);
    })(dati);
  }
  return fuori;
}

module.exports = { RADICE, LESSICO, COMMENTO_VECCHIO, tutteLePagine, pagineIndicizzabili, testoVisibile, normalizza, domandeFaq };
