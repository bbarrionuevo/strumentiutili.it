#!/usr/bin/env node
// scripts/genera-santi.js — Santi del giorno e onomastici da Wikidata.
//
// Wikidata e' l'unica fonte completa con una licenza libera (CC0): per ogni
// santo e beato ha la festa (P841), il nome in italiano, lo stato di
// canonizzazione (P411) e la voce di Wikipedia. Da qui si ricava
// data/santi.json, un file statico: il sito non interroga nessun servizio.
//
// Per ogni giorno si tengono fino a 6 santi, ordinati per notorieta':
// canonizzati prima dei beati, con voce su it.wikipedia prima degli altri,
// poi per numero di Wikipedia che ne parlano. Gli onomastici prendono il
// santo piu' noto che porta il nome; per i nomi in cui la tradizione
// italiana sceglie un altro giorno valgono le ECCEZIONI qui sotto, ognuna
// con il suo perche'.
//
//   node scripts/genera-santi.js                       scarica da Wikidata e scrive
//   node scripts/genera-santi.js --da-file risposta.json
//        usa una risposta salvata da query.wikidata.org (la QUERY qui sotto,
//        scaricata come "JSON"): utile se da questo computer il servizio non
//        risponde
//   node scripts/genera-santi.js --check               controlla la pagina contro
//                                                      data/santi.json, senza rete
//
// Scrive data/santi.json e la pagina utilita-web/santo-del-giorno/index.html
// (la crea se manca, poi aggiorna solo le parti fra i marcatori su:santi:*).
// Dopo: npm run build && python3 scripts/genera-indice-strumenti.py

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const S = require('../js/santi.js');

const RADICE = path.join(__dirname, '..');
const DATI = path.join(RADICE, 'data', 'santi.json');
const PAGINA = path.join(RADICE, 'utilita-web', 'santo-del-giorno', 'index.html');
const ENDPOINT = 'https://query.wikidata.org/sparql';
const PER_GIORNO = 6;

const QUERY = `SELECT ?santo ?nome ?giorno ?sitelinks ?pagina ?stato ?genere WHERE {
  ?santo wdt:P841 ?festa ;
         wdt:P31 wd:Q5 ;
         wikibase:sitelinks ?sitelinks ;
         rdfs:label ?nome .
  FILTER(LANG(?nome) = "it")
  ?festa rdfs:label ?giorno .
  FILTER(LANG(?giorno) = "en")
  OPTIONAL { ?santo wdt:P411 ?stato . }
  OPTIONAL { ?santo wdt:P21 ?genere . }
  OPTIONAL { ?articolo schema:about ?santo ; schema:isPartOf <https://it.wikipedia.org/> ; schema:name ?pagina . }
}`;

const Q_SANTO = 'Q43115';
const Q_BEATO = 'Q51626';
const Q_DONNA = 'Q6581072';
// Maria e Gesu' hanno feste liturgiche, non un "santo del giorno".
const ESCLUSI = new Set(['Q345', 'Q302']);

// Onomastici fissati dalla tradizione italiana, dove il santo piu' "noto" su
// Wikipedia non e' quello che si festeggia. Solo date liturgiche certe.
const ECCEZIONI = {
  giuseppe: ['Giuseppe', '03-19', 'San Giuseppe', 'sposo di Maria; festa del papa\''],
  maria: ['Maria', '09-12', 'Santissimo Nome di Maria', 'la data piu\' diffusa; molti festeggiano il 15 agosto'],
  giovanni: ['Giovanni', '06-24', 'San Giovanni Battista', 'nativita\' del Battista'],
  pietro: ['Pietro', '06-29', 'Santi Pietro e Paolo', 'solennita\' degli apostoli'],
  paolo: ['Paolo', '06-29', 'Santi Pietro e Paolo', 'solennita\' degli apostoli'],
  francesco: ['Francesco', '10-04', 'San Francesco d’Assisi', 'patrono d\'Italia'],
  antonio: ['Antonio', '06-13', 'Sant’Antonio di Padova', 'il 17 gennaio e\' Sant\'Antonio abate'],
  nicola: ['Nicola', '12-06', 'San Nicola', 'non il 9 maggio (traslazione a Bari)'],
  luca: ['Luca', '10-18', 'San Luca evangelista', 'evangelista'],
  marco: ['Marco', '04-25', 'San Marco evangelista', 'evangelista'],
  matteo: ['Matteo', '09-21', 'San Matteo apostolo', 'apostolo ed evangelista'],
  andrea: ['Andrea', '11-30', 'Sant’Andrea apostolo', 'apostolo'],
  giacomo: ['Giacomo', '07-25', 'San Giacomo apostolo', 'Giacomo il Maggiore'],
  stefano: ['Stefano', '12-26', 'Santo Stefano', 'protomartire'],
  lucia: ['Lucia', '12-13', 'Santa Lucia', 'vergine e martire di Siracusa'],
  anna: ['Anna', '07-26', 'Sant’Anna', 'madre di Maria'],
  chiara: ['Chiara', '08-11', 'Santa Chiara d’Assisi', 'fondatrice delle clarisse'],
  rita: ['Rita', '05-22', 'Santa Rita da Cascia', 'la santa degli impossibili'],
  lorenzo: ['Lorenzo', '08-10', 'San Lorenzo', 'la notte delle stelle cadenti'],
  michele: ['Michele', '09-29', 'Santi Michele, Gabriele e Raffaele', 'arcangeli'],
  gabriele: ['Gabriele', '09-29', 'Santi Michele, Gabriele e Raffaele', 'arcangeli'],
  raffaele: ['Raffaele', '09-29', 'Santi Michele, Gabriele e Raffaele', 'arcangeli'],
  caterina: ['Caterina', '04-29', 'Santa Caterina da Siena', 'patrona d\'Italia'],
  teresa: ['Teresa', '10-15', 'Santa Teresa d’Avila', 'la data piu\' diffusa; Teresa di Lisieux e\' il 1 ottobre'],
  benedetto: ['Benedetto', '07-11', 'San Benedetto da Norcia', 'patrono d\'Europa'],
  valentino: ['Valentino', '02-14', 'San Valentino', 'patrono degli innamorati'],
  martino: ['Martino', '11-11', 'San Martino di Tours', 'l\'estate di San Martino'],
  carlo: ['Carlo', '11-04', 'San Carlo Borromeo', 'arcivescovo di Milano']
};

const MESI = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

// "October 4" o "4 October" -> "10-04"; qualsiasi altra cosa (feste mobili) -> null
function giornoDaEtichetta(etichetta) {
  const t = String(etichetta).trim().toLowerCase();
  let m = /^([a-z]+) (\d{1,2})$/.exec(t), mese, giorno;
  if (m) { mese = MESI[m[1]]; giorno = Number(m[2]); } else {
    m = /^(\d{1,2}) ([a-z]+)$/.exec(t);
    if (m) { mese = MESI[m[2]]; giorno = Number(m[1]); }
  }
  if (!mese || !giorno || giorno > new Date(Date.UTC(2000, mese, 0)).getUTCDate()) return null;
  return String(mese).padStart(2, '0') + '-' + String(giorno).padStart(2, '0');
}

const PREFISSO = /^(San|Santa|Santo|Santi|Sante|Beato|Beata|Beati|Beate)\s+|^Sant['’]/;
const VOCALE = /^[AEIOUÀÈÉÌÒÙaeiou]/;

// Il nome come si dice in italiano: "Francesco d'Assisi" -> "San Francesco d'Assisi",
// "Stefano" -> "Santo Stefano", "Agata" -> "Sant'Agata".
function nomeConTitolo(etichetta, donna, beato) {
  const pulito = String(etichetta).replace(/\s*\([^)]*\)\s*$/, '').replace(/'/g, '’').trim();
  if (PREFISSO.test(pulito)) return pulito;
  if (beato) return (donna ? 'Beata ' : 'Beato ') + pulito;
  if (VOCALE.test(pulito)) return 'Sant’' + pulito;
  if (donna) return 'Santa ' + pulito;
  if (/^S[^aeiouAEIOU]/.test(pulito)) return 'Santo ' + pulito;
  return 'San ' + pulito;
}

// Il nome di battesimo: la prima parola dopo il titolo, se sembra un nome.
function nomeProprio(nome) {
  const senza = nome.replace(PREFISSO, '').trim();
  const primo = senza.split(/[\s,]/)[0];
  return /^[A-ZÀÈÉÌÒÙ][a-zàèéìòù]{2,}$/.test(primo) ? primo : null;
}

/**
 * Dalla risposta di Wikidata ai dati del sito.
 * @param {object[]} righe results.bindings della QUERY
 */
function trasforma(righe, oggi) {
  const persone = new Map();
  for (const r of righe) {
    const qid = String(r.santo && r.santo.value).split('/').pop();
    if (!/^Q\d+$/.test(qid) || ESCLUSI.has(qid)) continue;
    const giorno = giornoDaEtichetta(r.giorno && r.giorno.value);
    if (!giorno) continue;
    let p = persone.get(qid);
    if (!p) {
      p = { qid, etichetta: r.nome.value, sitelinks: Number(r.sitelinks && r.sitelinks.value) || 0, pagina: '', stati: new Set(), donna: false, giorni: new Set() };
      persone.set(qid, p);
    }
    p.giorni.add(giorno);
    if (r.pagina) p.pagina = r.pagina.value;
    if (r.stato) p.stati.add(String(r.stato.value).split('/').pop());
    if (r.genere && String(r.genere.value).endsWith('/' + Q_DONNA)) p.donna = true;
  }

  const santi = [];
  for (const p of persone.values()) {
    const santo = p.stati.has(Q_SANTO) || (!p.stati.has(Q_BEATO) && /^(San|Santa|Santo|Sant)\b/.test(p.etichetta));
    const beato = !santo && (p.stati.has(Q_BEATO) || /^(Beato|Beata)\b/.test(p.etichetta));
    if (!santo && !beato) continue;
    santi.push({ ...p, santo, nome: nomeConTitolo(p.etichetta, p.donna, beato) });
  }
  const punteggio = (a, b) => (b.santo - a.santo) || (!!b.pagina - !!a.pagina) || (b.sitelinks - a.sitelinks) || a.nome.localeCompare(b.nome, 'it');
  santi.sort(punteggio);

  const giorni = {};
  for (const g of S.giorniDellAnno()) giorni[g] = [];
  for (const s of santi) {
    for (const g of s.giorni) if (giorni[g].length < PER_GIORNO) giorni[g].push([s.nome, s.qid, s.pagina]);
  }

  // Onomastici: il santo canonizzato piu' noto con quel nome, nel giorno in
  // cui e' il primo della lista (se c'e'), altrimenti nel suo primo giorno.
  const onomastici = {};
  for (const s of santi) {
    if (!s.santo) continue;
    const nome = nomeProprio(s.nome);
    if (!nome) continue;
    const chiave = S.normalizza(nome);
    if (onomastici[chiave]) continue;
    const date = [...s.giorni].sort();
    const principale = date.find((g) => giorni[g][0] && giorni[g][0][1] === s.qid);
    onomastici[chiave] = [nome, principale || date[0]];
  }
  const eccezioni = [];
  for (const [chiave, e] of Object.entries(ECCEZIONI)) {
    const prima = onomastici[chiave] ? onomastici[chiave][1] : null;
    onomastici[chiave] = [e[0], e[1], e[2]];
    if (prima !== e[1]) eccezioni.push(e[0] + ': ' + (prima || 'assente') + ' -> ' + e[1] + ' (' + e[3] + ')');
  }

  const ordinati = {};
  for (const k of Object.keys(onomastici).sort()) ordinati[k] = onomastici[k];
  return {
    dati: {
      fonte: 'Wikidata (https://www.wikidata.org)',
      licenza: 'CC0 1.0',
      generato: oggi || new Date().toISOString().slice(0, 10),
      giorni,
      onomastici: ordinati
    },
    eccezioni,
    persone: santi.length
  };
}

// Un giorno per riga: i cambi di un rigenerazione si leggono nel diff.
function serializza(dati) {
  const righe = ['{'];
  righe.push('  "fonte": ' + JSON.stringify(dati.fonte) + ',');
  righe.push('  "licenza": ' + JSON.stringify(dati.licenza) + ',');
  righe.push('  "generato": ' + JSON.stringify(dati.generato) + ',');
  righe.push('  "giorni": {');
  const g = Object.keys(dati.giorni);
  g.forEach((k, i) => righe.push('    ' + JSON.stringify(k) + ': ' + JSON.stringify(dati.giorni[k]) + (i < g.length - 1 ? ',' : '')));
  righe.push('  },');
  righe.push('  "onomastici": {');
  const o = Object.keys(dati.onomastici);
  o.forEach((k, i) => righe.push('    ' + JSON.stringify(k) + ': ' + JSON.stringify(dati.onomastici[k]) + (i < o.length - 1 ? ',' : '')));
  righe.push('  }');
  righe.push('}');
  return righe.join('\n') + '\n';
}

async function scarica() {
  let ultimoErrore;
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const risposta = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/sparql-results+json',
          'User-Agent': 'StrumentiUtili/1.0 (https://strumentiutili.it; generatore dei santi del giorno)'
        },
        body: 'query=' + encodeURIComponent(QUERY)
      });
      if (!risposta.ok) throw new Error('Wikidata ha risposto ' + risposta.status);
      return (await risposta.json()).results.bindings;
    } catch (e) {
      ultimoErrore = e;
      await new Promise((r) => setTimeout(r, 2000 * tentativo));
    }
  }
  throw ultimoErrore;
}

async function main() {
  const argomenti = process.argv.slice(2);
  const P = require('./pagina-santi.js');
  if (argomenti.includes('--check')) {
    const dati = JSON.parse(fs.readFileSync(DATI, 'utf8'));
    const errori = S.problemi(dati);
    if (errori.length) { console.error(errori.slice(0, 20).join('\n')); process.exit(1); }
    const html = fs.readFileSync(PAGINA, 'utf8');
    if (P.aggiorna(html, dati) !== html) {
      console.error('La pagina dei santi non e’ aggiornata: esegui node scripts/genera-santi.js --da-dati');
      process.exit(1);
    }
    console.log('Santi: dati e pagina coerenti.');
    return;
  }
  let dati;
  if (argomenti.includes('--da-dati')) {
    dati = JSON.parse(fs.readFileSync(DATI, 'utf8'));
  } else {
    const k = argomenti.indexOf('--da-file');
    const righe = k >= 0
      ? JSON.parse(fs.readFileSync(argomenti[k + 1], 'utf8')).results.bindings
      : await scarica();
    const r = trasforma(righe);
    const errori = S.problemi(r.dati);
    if (errori.length) {
      console.error('Dati incompleti, niente di scritto:\n' + errori.slice(0, 30).join('\n'));
      process.exit(1);
    }
    dati = r.dati;
    fs.writeFileSync(DATI, serializza(dati));
    console.log('data/santi.json: ' + r.persone + ' santi e beati, ' + Object.keys(dati.onomastici).length + ' nomi.');
    if (r.eccezioni.length) console.log('Onomastici corretti a mano:\n  ' + r.eccezioni.join('\n  '));
  }
  const html = fs.existsSync(PAGINA) ? fs.readFileSync(PAGINA, 'utf8') : P.pagina();
  fs.mkdirSync(path.dirname(PAGINA), { recursive: true });
  fs.writeFileSync(PAGINA, P.aggiorna(html, dati));
  console.log('Pagina aggiornata: ' + path.relative(RADICE, PAGINA));
}

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });

module.exports = { QUERY, ECCEZIONI, trasforma, serializza, giornoDaEtichetta, nomeConTitolo, nomeProprio };
