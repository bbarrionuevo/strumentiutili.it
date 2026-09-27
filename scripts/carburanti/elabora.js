// scripts/carburanti/elabora.js — Dai due file del MIMIT ai dati del sito.
//
// Il Ministero delle Imprese e del Made in Italy pubblica ogni giorno, come
// open data (licenza IODL 2.0), l'anagrafica dei distributori e i prezzi
// comunicati dai gestori (obbligo dell'art. 51 della legge 99/2009). I file
// sono testo con il separatore "|" e una prima riga "Estrazione del AAAA-MM-GG"
// (scheda dei metadati del 10 febbraio 2026).
//
// Qui ci sono solo funzioni pure: dal testo dei due file ai JSON compatti che
// la pagina /utilita-web/prezzi-carburanti-oggi/ legge nel browser. Le prova
// tests/carburanti.test.js; le usa scripts/carburanti/aggiorna.js.
'use strict';

// I quattro carburanti standard; i "speciali" (Blue Diesel, HVO, V-Power...)
// hanno nomi di marca e non si confrontano fra loro.
const CARBURANTI = { benzina: 'Benzina', gasolio: 'Gasolio', gpl: 'GPL', metano: 'Metano' };
const ORDINE = ['benzina', 'gasolio', 'gpl', 'metano'];

// Un prezzo comunicato da piu' di tanti giorni prima dell'estrazione e'
// probabilmente abbandonato: non entra ne' nelle medie ne' nelle classifiche.
const GIORNI_VALIDITA = 8;

// Limiti larghi per scartare gli errori di battitura (0,00 o 19,99 euro): non
// sono prezzi "attesi", solo confini oltre i quali il dato e' certamente sbagliato.
const LIMITI = { benzina: [0.5, 5], gasolio: [0.5, 5], gpl: [0.2, 3], metano: [0.3, 5] };

// Italia, isole comprese: coordinate fuori da qui sono sbagliate (0,0 o invertite).
const ITALIA = { lat: [35.2, 47.2], lon: [6.5, 18.6] };

function righe(testo) {
  const tutte = String(testo || '').replace(/^﻿/, '').split(/\r?\n/);
  const m = (tutte[0] || '').match(/Estrazione del (\d{4}-\d{2}-\d{2})/);
  if (!m) throw new Error('manca la riga "Estrazione del AAAA-MM-GG"');
  return { estrazione: m[1], intestazione: (tutte[1] || '').split('|').map((s) => s.trim()), righe: tutte.slice(2).filter((r) => r.trim()) };
}

const pulisci = (s) => String(s || '').replace(/[\t\s]+/g, ' ').trim();

function numero(s) {
  const n = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Anagrafica: idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|
 * Indirizzo|Comune|Provincia|Latitudine|Longitudine. Qualche riga ha un "|"
 * in piu' dentro il nome: i primi quattro campi e gli ultimi cinque hanno una
 * posizione fissa, il nome e' quel che resta in mezzo.
 */
function leggiAnagrafica(testo) {
  const { estrazione, righe: R } = righe(testo);
  const impianti = new Map();
  let scartate = 0;
  for (const r of R) {
    const f = r.split('|');
    if (f.length < 10 || !/^\d+$/.test(f[0].trim())) { scartate++; continue; }
    const n = f.length;
    let lat = numero(f[n - 2]), lon = numero(f[n - 1]);
    if (lat === null || lon === null || lat < ITALIA.lat[0] || lat > ITALIA.lat[1] || lon < ITALIA.lon[0] || lon > ITALIA.lon[1]) { lat = null; lon = null; }
    impianti.set(f[0].trim(), {
      id: f[0].trim(),
      bandiera: pulisci(f[2]),
      autostrada: /autostrad/i.test(f[3]),
      nome: pulisci(f.slice(4, n - 5).join('|')),
      indirizzo: pulisci(f[n - 5]),
      comune: pulisci(f[n - 4]),
      prov: pulisci(f[n - 3]).toUpperCase(),
      lat, lon
    });
  }
  return { estrazione, impianti, scartate };
}

/** "24/09/2026 19:30:07" -> "2026-09-24" */
function dataComunicazione(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function giorniFra(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/**
 * Prezzi: idImpianto|descCarburante|prezzo|isSelf|dtComu. Restano solo i
 * quattro carburanti standard, con prezzi plausibili e comunicati da non piu'
 * di GIORNI_VALIDITA giorni. Per impianto, carburante e modalita' si tiene
 * il prezzo comunicato per ultimo.
 */
function leggiPrezzi(testo) {
  const { estrazione, righe: R } = righe(testo);
  const nomi = Object.fromEntries(Object.entries(CARBURANTI).map(([k, v]) => [v.toLowerCase(), k]));
  const prezzi = new Map(); // id -> { benzina: { self: {p, d}, servito: {p, d} }, ... }
  const conta = { righe: R.length, usate: 0, speciali: 0, vecchie: 0, fuori: 0 };
  for (const r of R) {
    const f = r.split('|');
    if (f.length < 5) continue;
    const carb = nomi[pulisci(f[1]).toLowerCase()];
    if (!carb) { conta.speciali++; continue; }
    const p = numero(f[2]);
    const d = dataComunicazione(f[4]);
    if (p === null || p < LIMITI[carb][0] || p > LIMITI[carb][1]) { conta.fuori++; continue; }
    if (!d || giorniFra(d, estrazione) > GIORNI_VALIDITA || giorniFra(d, estrazione) < -1) { conta.vecchie++; continue; }
    const modo = f[3].trim() === '1' ? 'self' : 'servito';
    const id = f[0].trim();
    if (!prezzi.has(id)) prezzi.set(id, {});
    const x = prezzi.get(id);
    x[carb] = x[carb] || {};
    if (!x[carb][modo] || x[carb][modo].d <= d) x[carb][modo] = { p, d };
    conta.usate++;
  }
  return { estrazione, prezzi, conta };
}

const arrotonda = (n) => Math.round(n * 1000) / 1000;

function statistiche(valori) {
  if (!valori.length) return null;
  const v = valori.slice().sort((a, b) => a - b);
  const meta = v.length >> 1;
  const mediana = v.length % 2 ? v[meta] : (v[meta - 1] + v[meta]) / 2;
  return { media: arrotonda(v.reduce((s, x) => s + x, 0) / v.length), mediana: arrotonda(mediana), min: v[0], max: v[v.length - 1], n: v.length };
}

/**
 * Dati per il sito.
 * - riepilogo: medie nazionali, regionali e provinciali (impianti stradali:
 *   gli autostradali hanno prezzi diversi e si contano a parte nelle liste);
 * - impianti[SIGLA]: [id, nome, bandiera, indirizzo, comune, lat, lon, autostrada];
 * - prezzi[SIGLA]: { id: [benzina self, benzina servito, gasolio self,
 *   gasolio servito, gpl self, gpl servito, metano self, metano servito] }
 *   in millesimi di euro (2309 = 2,309 euro), null se manca.
 * `province` mappa la sigla a { nome, regione } (da data/comuni.json).
 */
function componi(anagrafica, listino, province) {
  const estrazione = listino.estrazione;
  const gruppi = { italia: {}, regioni: {}, province: {} };
  const aggiungi = (dove, chiave, carb, modo, p) => {
    dove[chiave] = dove[chiave] || {};
    dove[chiave][carb] = dove[chiave][carb] || { self: [], servito: [] };
    dove[chiave][carb][modo].push(p);
  };
  const impianti = {}, prezzi = {}, centri = {};
  for (const [id, x] of listino.prezzi) {
    const a = anagrafica.impianti.get(id);
    if (!a || !a.prov) continue;
    const prov = a.prov;
    const regione = (province[prov] && province[prov].regione) || null;
    impianti[prov] = impianti[prov] || [];
    impianti[prov].push([Number(id), a.nome, a.bandiera, a.indirizzo, a.comune, a.lat, a.lon, a.autostrada ? 1 : 0]);
    const riga = [];
    for (const carb of ORDINE) {
      for (const modo of ['self', 'servito']) {
        const v = x[carb] && x[carb][modo];
        riga.push(v ? Math.round(v.p * 1000) : null);
        if (v && !a.autostrada) {
          aggiungi(gruppi.italia, 'IT', carb, modo, v.p);
          if (regione) aggiungi(gruppi.regioni, regione, carb, modo, v.p);
          aggiungi(gruppi.province, prov, carb, modo, v.p);
        }
      }
    }
    prezzi[prov] = prezzi[prov] || {};
    prezzi[prov][id] = riga;
    if (a.lat !== null) {
      centri[prov] = centri[prov] || { lat: 0, lon: 0, n: 0 };
      centri[prov].lat += a.lat; centri[prov].lon += a.lon; centri[prov].n++;
    }
  }
  const riassumi = (g) => Object.fromEntries(Object.entries(g).map(([k, carb]) => [k, Object.fromEntries(
    ORDINE.filter((c) => carb[c]).map((c) => [c, { self: statistiche(carb[c].self), servito: statistiche(carb[c].servito) }]))]));
  const prov = riassumi(gruppi.province);
  for (const [sigla, v] of Object.entries(prov)) {
    const c = centri[sigla];
    prov[sigla] = {
      nome: (province[sigla] && province[sigla].nome) || sigla,
      regione: (province[sigla] && province[sigla].regione) || null,
      centro: c ? [arrotonda(c.lat / c.n), arrotonda(c.lon / c.n)] : null,
      impianti: impianti[sigla].length,
      carburanti: v
    };
  }
  for (const s of Object.keys(impianti)) impianti[s].sort((a, b) => a[0] - b[0]);
  return {
    riepilogo: {
      estrazione,
      fonte: 'Ministero delle Imprese e del Made in Italy, Osservaprezzi carburanti (open data, licenza IODL 2.0)',
      giorni_validita: GIORNI_VALIDITA,
      italia: riassumi(gruppi.italia).IT || {},
      regioni: riassumi(gruppi.regioni),
      province: prov
    },
    impianti,
    prezzi
  };
}

/** Aggiunge alla serie storica le medie nazionali self del giorno (sostituendo lo stesso giorno). */
function aggiornaStorico(storico, riepilogo, giorniDaTenere = 400) {
  const serie = ((storico && storico.serie) || []).filter((x) => x.d !== riepilogo.estrazione);
  const punto = { d: riepilogo.estrazione };
  for (const c of ORDINE) {
    const s = riepilogo.italia[c];
    // GPL e metano si vendono quasi sempre col servito
    const v = s && ((c === 'gpl' || c === 'metano') ? (s.servito || s.self) : (s.self || s.servito));
    if (v) punto[c] = v.media;
  }
  serie.push(punto);
  serie.sort((a, b) => (a.d < b.d ? -1 : 1));
  return { serie: serie.slice(-giorniDaTenere) };
}

/**
 * Controlli prima di pubblicare: se i file del Ministero arrivano vuoti,
 * troncati o vecchi, meglio lasciare online i dati di ieri. Restituisce
 * l'elenco dei problemi (vuoto = si puo' pubblicare).
 */
function problemi(anagrafica, listino, dati, oggi) {
  const fuori = [];
  if (anagrafica.impianti.size < 15000) fuori.push(`anagrafica con soli ${anagrafica.impianti.size} impianti`);
  if (listino.conta.usate < 30000) fuori.push(`solo ${listino.conta.usate} prezzi validi`);
  if (giorniFra(listino.estrazione, oggi) > 4) fuori.push(`estrazione dei prezzi vecchia (${listino.estrazione})`);
  if (Object.keys(dati.riepilogo.province).length < 100) fuori.push(`solo ${Object.keys(dati.riepilogo.province).length} province`);
  for (const c of ['benzina', 'gasolio']) {
    const s = dati.riepilogo.italia[c] && dati.riepilogo.italia[c].self;
    if (!s || s.n < 5000) fuori.push(`media nazionale ${c} self su troppi pochi impianti`);
  }
  return fuori;
}

module.exports = { CARBURANTI, ORDINE, GIORNI_VALIDITA, leggiAnagrafica, leggiPrezzi, dataComunicazione, componi, aggiornaStorico, problemi, statistiche };
