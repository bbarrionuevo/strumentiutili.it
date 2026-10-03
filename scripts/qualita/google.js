#!/usr/bin/env node
// scripts/qualita/google.js — Come vede il sito Google.
//
// Due controlli, aggiunti alle misure settimanali (misure.json):
// 1. Googlebot: ogni pagina del sitemap si scarica come la scarica Google
//    (stesso User-Agent, senza seguire i reindirizzamenti) e si controlla cio'
//    che decide l'indicizzazione: codice di risposta, intestazione
//    X-Robots-Tag, meta robots, canonical. Non serve nessuna chiave.
// 2. Search Console (con il segreto GSC_CREDENZIALI, la chiave JSON di un
//    account di servizio aggiunto come utente della proprieta'): per ogni
//    pagina lo stato nell'indice di Google e il motivo se e' fuori (API
//    URL Inspection), e clic e impressioni degli ultimi 28 giorni (API Search
//    Analytics). Sono API gratuite; la chiave non viene mai stampata.
// 3. Vecchi indirizzi: ogni redirect di vercel.json si segue passo per passo
//    sul sito vero. Deve arrivare a una pagina (200) in al massimo 3 passi:
//    se no Google li conta come «Non trovato (404)» o «Errore di
//    reindirizzamento» e la pagina perde cio' che aveva guadagnato.
//
//   node scripts/qualita/google.js --sito https://strumentiutili.it --misure misure.json
//   node scripts/qualita/google.js --sito https://strumentiutili.it --solo-registro
//
// Con --solo-registro non scrive file: stampa il riepilogo nel registro (serve
// per un controllo veloce, senza le misure con il browser).
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

const UA_GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_BROWSER = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN = 'https://oauth2.googleapis.com/token';
const API = 'https://searchconsole.googleapis.com';

// --- parte pura ---------------------------------------------------------------

function attributo(tag, nome) {
  const m = tag.match(new RegExp('\\b' + nome + '\\s*=\\s*(["\'])(.*?)\\1', 'i'));
  return m ? m[2] : null;
}

/** Dalla <head> di una pagina: meta robots (anche «googlebot»), canonical, titolo. */
function leggiTesta(html) {
  const testa = String(html || '').split(/<\/head>/i)[0];
  const meta = [...testa.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const robots = meta.filter((t) => /^(robots|googlebot)$/i.test(attributo(t, 'name') || '')).map((t) => attributo(t, 'content') || '');
  const canonical = [...testa.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
    .filter((t) => /(^|\s)canonical(\s|$)/i.test(attributo(t, 'rel') || ''))
    .map((t) => attributo(t, 'href'));
  const titolo = (testa.match(/<title[^>]*>([^<]*)/i) || [])[1];
  return { robots: robots.length ? robots.join(', ') : null, canonical: canonical[0] || null, canonicali: canonical.length, titolo: titolo ? titolo.trim() : null };
}

const blocca = (v) => /\b(noindex|none)\b/i.test(v || '');

/**
 * Cosa trova Googlebot su una pagina. r = { stato, location, xRobots, html,
 * statoBrowser }. I problemi «indice» tolgono la pagina da Google: sono avvisi.
 * Se solo il finto Googlebot (da GitHub) viene respinto e il browser no, e'
 * probabilmente la protezione dai bot falsi del server: da guardare in Search
 * Console, non un errore sicuro.
 */
function vistaGooglebot(url, r) {
  const testa = leggiTesta(r.html);
  const fuori = { stato: r.stato, xRobots: r.xRobots || null, robots: testa.robots, canonical: testa.canonical, problemi: [] };
  const p = (tipo, testo) => fuori.problemi.push({ tipo, testo });
  if (r.stato >= 300 && r.stato < 400) p('indice', `a Googlebot reindirizza a ${r.location || '?'}`);
  else if (r.stato !== 200) {
    if (r.statoBrowser === 200) p('googlebot', `risponde ${r.stato} a un Googlebot simulato (al browser 200): verificare con «Controllo URL» di Search Console`);
    else p('indice', `a Googlebot risponde ${r.stato}`);
  }
  if (r.stato !== 200) return fuori;
  if (blocca(r.xRobots)) p('indice', `intestazione X-Robots-Tag: ${r.xRobots}`);
  if (blocca(testa.robots)) p('indice', `meta robots: ${testa.robots}`);
  if (!testa.canonical) p('indice', 'manca il canonical');
  else if (testa.canonical !== url) p('indice', `il canonical punta a ${testa.canonical}`);
  if (testa.canonicali > 1) p('indice', `${testa.canonicali} canonical nella stessa pagina`);
  return fuori;
}

/** La proprieta' di Search Console da usare: prima quella di dominio, poi l'indirizzo esatto. */
function sceltaProprieta(elenco, sito) {
  const host = new URL(sito).host.replace(/^www\./, '');
  const voci = ((elenco && elenco.siteEntry) || []).filter((v) => v.permissionLevel && v.permissionLevel !== 'siteUnverifiedUser');
  for (const voluta of ['sc-domain:' + host, `https://${host}/`, `https://www.${host}/`]) {
    if (voci.some((v) => v.siteUrl === voluta)) return voluta;
  }
  return null;
}

const senzaBarra = (u) => String(u || '').replace(/#.*$/, '');

/** Stato di una pagina nell'indice, dalla risposta di urlInspection/index:inspect. */
function statoIndice(risposta, url) {
  const r = risposta && risposta.inspectionResult && risposta.inspectionResult.indexStatusResult;
  if (!r) return null;
  const s = {
    indicizzata: r.verdict === 'PASS',
    stato: r.coverageState || null,
    indicizzazione: r.indexingState || null,
    recupero: r.pageFetchState || null,
    robotsTxt: r.robotsTxtState || null,
    canonicaGoogle: r.googleCanonical || null,
    ultimaScansione: r.lastCrawlTime ? String(r.lastCrawlTime).slice(0, 10) : null
  };
  s.causa = causaTecnica(s, url);
  return s;
}

/** Il motivo tecnico per cui Google non la tiene, se c'e'. Senza motivo tecnico e' una scelta di qualita' di Google. */
function causaTecnica(s, url) {
  if (s.robotsTxt === 'DISALLOWED') return 'bloccata da robots.txt';
  if (s.indicizzazione === 'BLOCKED_BY_META_TAG') return 'noindex nel codice della pagina';
  if (s.indicizzazione === 'BLOCKED_BY_HTTP_HEADER') return 'noindex nelle intestazioni (X-Robots-Tag)';
  if (s.indicizzazione === 'BLOCKED_BY_ROBOTS_TXT') return 'bloccata da robots.txt';
  if (s.recupero && !/^(SUCCESSFUL|PAGE_FETCH_STATE_UNSPECIFIED)$/.test(s.recupero)) return `Google non riesce a scaricarla (${s.recupero})`;
  if (s.canonicaGoogle && senzaBarra(s.canonicaGoogle) !== senzaBarra(url)) return `per Google la pagina principale e' un'altra: ${s.canonicaGoogle}`;
  return null;
}

/** Clic e impressioni per pagina dalla risposta di searchAnalytics/query (le ancore #… si sommano alla pagina). */
function daAnalytics(risposta, sito) {
  const origine = new URL(sito).origin;
  const fuori = {};
  for (const r of (risposta && risposta.rows) || []) {
    const u = senzaBarra(r.keys && r.keys[0]);
    if (!u.startsWith(origine)) continue;
    const p = u.slice(origine.length) || '/';
    const x = fuori[p] || (fuori[p] = { clic: 0, impressioni: 0, somma: 0 });
    x.clic += r.clicks || 0;
    x.impressioni += r.impressions || 0;
    x.somma += (r.position || 0) * (r.impressions || 0);
  }
  for (const x of Object.values(fuori)) {
    x.posizione = x.impressioni ? Math.round((x.somma / x.impressioni) * 10) / 10 : null;
    delete x.somma;
  }
  return fuori;
}

function base64url(dato) {
  return Buffer.from(dato).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** L'asserzione JWT firmata con cui l'account di servizio chiede il token (RFC 7523). */
function asserzione(credenziali, adesso) {
  const testa = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = base64url(JSON.stringify({ iss: credenziali.client_email, scope: SCOPE, aud: TOKEN, iat: adesso, exp: adesso + 3600 }));
  const firma = crypto.createSign('RSA-SHA256').update(testa + '.' + corpo).sign(credenziali.private_key);
  return testa + '.' + corpo + '.' + base64url(firma);
}

/** Aggiunge le viste di Google alle misure: m.googlebot e m.google per pagina, r.google per il sito. */
function unisci(r, googlebot, google) {
  for (const m of r.misure) {
    if (googlebot[m.pagina]) m.googlebot = googlebot[m.pagina];
    if (google && google.pagine && google.pagine[m.pagina]) m.google = google.pagine[m.pagina];
  }
  if (google) r.google = { attivo: google.attivo, proprieta: google.proprieta || null, errore: google.errore || null, dal: google.dal || null, al: google.al || null, totale: google.totale || null };
  return r;
}

// --- rete ---------------------------------------------------------------------

async function scarica(url, ua) {
  try {
    const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': ua, 'Accept-Language': 'it-IT,it;q=0.9' } });
    const html = r.status === 200 ? await r.text() : '';
    return { stato: r.status, location: r.headers.get('location'), xRobots: r.headers.get('x-robots-tag'), html };
  } catch (e) {
    return { stato: 0, html: '', errore: String(e.message).slice(0, 120) };
  }
}

async function controllaGooglebot(sito, pagine) {
  const fuori = {};
  for (const pagina of pagine) {
    const url = sito + pagina;
    const r = await scarica(url, UA_GOOGLEBOT);
    if (r.stato !== 200) r.statoBrowser = (await scarica(url, UA_BROWSER)).stato;
    fuori[pagina] = vistaGooglebot(url, r);
    await new Promise((ok) => setTimeout(ok, 150));
  }
  return fuori;
}

async function controllaReindirizzamenti(sito, sorgenti) {
  const rotti = [];
  for (const sorgente of sorgenti) {
    let url = sito + sorgente, passi = 0, stato = 0;
    const visti = new Set([url]);
    for (;;) {
      const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': UA_GOOGLEBOT } }).catch(() => null);
      stato = r ? r.status : 0;
      if (r && r.body) await r.body.cancel().catch(() => {});
      const dove = r && r.headers.get('location');
      if (!(stato >= 300 && stato < 400 && dove)) break;
      url = new URL(dove, url).href;
      passi++;
      if (visti.has(url) || passi > 10) { stato = 'ciclo'; break; }
      visti.add(url);
    }
    if (stato !== 200 || passi > 3) rotti.push({ da: sorgente, a: url.startsWith(sito) ? url.slice(sito.length) : url, stato, passi });
    await new Promise((ok) => setTimeout(ok, 100));
  }
  return { controllati: sorgenti.length, rotti };
}

async function chiama(token, metodo, url, corpo) {
  const r = await fetch(url, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const dati = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${(dati.error && dati.error.message) || ''}`.trim().slice(0, 200));
  return dati;
}

async function searchConsole(sito, pagine, oggi) {
  let credenziali;
  try { credenziali = JSON.parse(process.env.GSC_CREDENZIALI); } catch (e) { return { attivo: true, errore: 'il segreto GSC_CREDENZIALI non e\' una chiave JSON valida' }; }
  let token;
  try {
    const r = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: asserzione(credenziali, Math.floor(Date.now() / 1000)) })
    });
    const dati = await r.json();
    if (!dati.access_token) return { attivo: true, errore: 'accesso negato: ' + String(dati.error_description || dati.error || r.status).slice(0, 120) };
    token = dati.access_token;
  } catch (e) { return { attivo: true, errore: 'accesso non riuscito: ' + String(e.message).slice(0, 120) }; }

  let elenco;
  try { elenco = await chiama(token, 'GET', API + '/webmasters/v3/sites'); } catch (e) {
    return { attivo: true, errore: 'elenco delle proprieta\' non letto (l\'API «Google Search Console API» e\' attiva nel progetto?): ' + e.message };
  }
  const proprieta = sceltaProprieta(elenco, sito);
  if (!proprieta) return { attivo: true, errore: `l'account di servizio ${credenziali.client_email} non e' tra gli utenti della proprieta' in Search Console` };

  const fine = new Date(oggi.getTime() - 3 * 86400000); // i dati degli ultimi 2-3 giorni non sono completi
  const inizio = new Date(fine.getTime() - 27 * 86400000);
  const giorno = (d) => d.toISOString().slice(0, 10);
  const fuori = { attivo: true, proprieta, dal: giorno(inizio), al: giorno(fine), pagine: {} };
  try {
    const righe = await chiama(token, 'POST', `${API}/webmasters/v3/sites/${encodeURIComponent(proprieta)}/searchAnalytics/query`,
      { startDate: fuori.dal, endDate: fuori.al, dimensions: ['page'], rowLimit: 1000 });
    const perPagina = daAnalytics(righe, sito);
    fuori.totale = Object.values(perPagina).reduce((t, x) => ({ clic: t.clic + x.clic, impressioni: t.impressioni + x.impressioni }), { clic: 0, impressioni: 0 });
    for (const p of pagine) fuori.pagine[p] = { clic: 0, impressioni: 0, posizione: null, ...(perPagina[p] || {}) };
  } catch (e) { fuori.errore = 'clic e impressioni non letti: ' + e.message; }

  for (const p of pagine) {
    try {
      const risposta = await chiama(token, 'POST', API + '/v1/urlInspection/index:inspect', { inspectionUrl: sito + p, siteUrl: proprieta, languageCode: 'it-IT' });
      fuori.pagine[p] = { ...(fuori.pagine[p] || {}), indice: statoIndice(risposta, sito + p) };
    } catch (e) {
      fuori.errore = 'stato nell\'indice non letto: ' + e.message;
      break; // quota finita o permesso mancante: inutile insistere
    }
    await new Promise((ok) => setTimeout(ok, 200));
  }
  return fuori;
}

function riepilogo(r) {
  const righe = [];
  if (r.reindirizzamenti) {
    righe.push(`Vecchi indirizzi: ${r.reindirizzamenti.controllati} controllati, ${r.reindirizzamenti.rotti.length} non arrivano a una pagina.`);
    for (const x of r.reindirizzamenti.rotti) righe.push(`  ${x.da} -> ${x.a} (${x.stato}, ${x.passi} passi)`);
  }
  const conProblemi = r.misure.filter((m) => m.googlebot && m.googlebot.problemi.length);
  righe.push(`Googlebot: ${r.misure.length} pagine, ${conProblemi.length} con problemi.`);
  for (const m of conProblemi) righe.push(`  ${m.pagina}: ${m.googlebot.problemi.map((p) => p.testo).join('; ')}`);
  if (!r.google || !r.google.attivo) righe.push('Search Console: non collegata (manca GSC_CREDENZIALI).');
  else {
    if (r.google.errore) righe.push('Search Console: ' + r.google.errore);
    const lette = r.misure.filter((m) => m.google && m.google.indice);
    righe.push(`Search Console (${r.google.proprieta || '?'}): ${lette.filter((m) => m.google.indice.indicizzata).length} pagine nell'indice su ${lette.length} controllate.`);
    if (r.google.totale) righe.push(`  ${r.google.dal} - ${r.google.al}: ${r.google.totale.clic} clic, ${r.google.totale.impressioni} impressioni.`);
    for (const m of lette.filter((x) => !x.google.indice.indicizzata)) {
      righe.push(`  ${m.pagina}: ${m.google.indice.stato || '?'}${m.google.indice.causa ? ' — ' + m.google.indice.causa : ''}`);
    }
  }
  return righe.join('\n');
}

function argomento(nome, predefinito) {
  const i = process.argv.indexOf('--' + nome);
  return i >= 0 ? process.argv[i + 1] : predefinito;
}

async function main() {
  const sito = argomento('sito', 'https://strumentiutili.it').replace(/\/$/, '');
  const soloRegistro = process.argv.includes('--solo-registro');
  const file = argomento('misure', 'misure.json');
  const r = !soloRegistro && fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { data: new Date().toISOString().slice(0, 10), sito, misure: require('./misura.js').pagineDalSitemap().map((pagina) => ({ pagina })) };
  const pagine = r.misure.map((m) => m.pagina);
  const googlebot = await controllaGooglebot(sito, pagine);
  const vercel = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  r.reindirizzamenti = await controllaReindirizzamenti(sito, [...new Set((vercel.redirects || []).map((x) => x.source))]);
  const google = process.env.GSC_CREDENZIALI ? await searchConsole(sito, pagine, new Date()) : { attivo: false };
  unisci(r, googlebot, google);
  console.log(riepilogo(r));
  if (!soloRegistro) fs.writeFileSync(file, JSON.stringify(r, null, 1));
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { UA_GOOGLEBOT, leggiTesta, vistaGooglebot, sceltaProprieta, statoIndice, causaTecnica, daAnalytics, asserzione, unisci, riepilogo };
