// scripts/usura/elabora.js — Dal decreto trimestrale del MEF ai tassi soglia del sito.
//
// Ogni trimestre il Ministero dell'Economia e delle Finanze pubblica un decreto
// con la tabella dei tassi effettivi globali medi (TEGM) e dei tassi soglia
// (allegato A), che vale per il trimestre seguente (legge 108/1996, art. 2).
// Il testo arriva da `pdftotext -layout`: l'impaginazione cambia da un decreto
// all'altro (i nomi delle categorie vanno a capo in punti diversi), quindi la
// tabella si legge per posizione: 24 righe con due numeri in fondo, nell'ordine
// delle categorie del decreto di classificazione. Ogni riga si controlla da
// sola: la classe d'importo deve essere quella attesa e la soglia deve essere
// il TEGM aumentato di un quarto piu' 4 punti, con al massimo 8 punti di
// differenza (art. 2, comma 4). Se qualcosa non torna non si pubblica niente.
//
// Funzioni pure: le prova tests/usura.test.js, le usa scripts/usura/aggiorna.js.
'use strict';

// Categorie e classi del decreto di classificazione del 23 settembre 2025,
// nell'ordine della tabella. 'riga' e' quello che deve comparire sulla riga
// dei numeri (la classe d'importo o il tipo di tasso); min/max in euro.
const CATEGORIE = [
  { id: 'aperture-conto', nome: 'Aperture di credito in conto corrente', parole: 'APERTURE DI CREDITO IN CONTO CORRENTE',
    classi: [{ id: 'fino-5000', etichetta: 'fino a 5.000 euro', riga: 'fino a 5.000', max: 5000 }, { id: 'oltre-5000', etichetta: 'oltre 5.000 euro', riga: 'oltre 5.000', min: 5000 }] },
  { id: 'scoperti', nome: 'Scoperti senza affidamento', parole: 'SCOPERTI SENZA AFFIDAMENTO',
    classi: [{ id: 'fino-1500', etichetta: 'fino a 1.500 euro', riga: 'fino a 1.500', max: 1500 }, { id: 'oltre-1500', etichetta: 'oltre 1.500 euro', riga: 'oltre 1.500', min: 1500 }] },
  { id: 'anticipi', nome: 'Anticipi su crediti e documenti, sconto di portafoglio commerciale, finanziamenti all\'importazione e anticipo fornitori', parole: 'FINANZIAMENTI PER ANTICIPI SU CREDITI',
    classi: [{ id: 'fino-50000', etichetta: 'fino a 50.000 euro', riga: 'fino a 50.000', max: 50000 }, { id: '50000-200000', etichetta: 'da 50.000 a 200.000 euro', riga: 'da 50.000 a 200.000', min: 50000, max: 200000 }, { id: 'oltre-200000', etichetta: 'oltre 200.000 euro', riga: 'oltre 200.000', min: 200000 }] },
  { id: 'credito-personale', nome: 'Credito personale', parole: 'CREDITO PERSONALE', classi: [{ id: 'unica', etichetta: '', riga: '' }] },
  { id: 'credito-finalizzato', nome: 'Credito finalizzato', parole: 'CREDITO FINALIZZATO', classi: [{ id: 'unica', etichetta: '', riga: '' }] },
  { id: 'factoring', nome: 'Factoring', parole: 'FACTORING',
    classi: [{ id: 'fino-50000', etichetta: 'fino a 50.000 euro', riga: 'fino a 50.000', max: 50000 }, { id: 'oltre-50000', etichetta: 'oltre 50.000 euro', riga: 'oltre 50.000', min: 50000 }] },
  { id: 'leasing-immobiliare', nome: 'Leasing immobiliare', parole: 'LEASING IMMOBILIARE',
    classi: [{ id: 'fisso', etichetta: 'a tasso fisso', riga: '- A TASSO FISSO' }, { id: 'variabile', etichetta: 'a tasso variabile', riga: '- A TASSO VARIABILE' }] },
  { id: 'leasing-auto', nome: 'Leasing aeronavale e su autoveicoli', parole: 'LEASING AERONAVALE E SU AUTOVEICOLI',
    classi: [{ id: 'fino-25000', etichetta: 'fino a 25.000 euro', riga: 'fino a 25.000', max: 25000 }, { id: 'oltre-25000', etichetta: 'oltre 25.000 euro', riga: 'oltre 25.000', min: 25000 }] },
  { id: 'leasing-strumentale', nome: 'Leasing strumentale', parole: 'LEASING STRUMENTALE',
    classi: [{ id: 'fino-25000', etichetta: 'fino a 25.000 euro', riga: 'fino a 25.000', max: 25000 }, { id: 'oltre-25000', etichetta: 'oltre 25.000 euro', riga: 'oltre 25.000', min: 25000 }] },
  { id: 'mutui', nome: 'Mutui con garanzia ipotecaria', parole: 'MUTUI CON GARANZIA IPOTECARIA',
    classi: [{ id: 'fisso', etichetta: 'a tasso fisso', riga: '- A TASSO FISSO' }, { id: 'variabile', etichetta: 'a tasso variabile', riga: '- A TASSO VARIABILE' }] },
  { id: 'cessione-quinto', nome: 'Prestiti contro cessione del quinto dello stipendio e della pensione', parole: 'PRESTITI CONTRO CESSIONE DEL QUINTO',
    classi: [{ id: 'fino-15000', etichetta: 'fino a 15.000 euro', riga: 'fino a 15.000', max: 15000 }, { id: 'oltre-15000', etichetta: 'oltre 15.000 euro', riga: 'oltre 15.000', min: 15000 }] },
  { id: 'revolving', nome: 'Credito revolving', parole: 'CREDITO REVOLVING', classi: [{ id: 'unica', etichetta: '', riga: '' }] },
  { id: 'carte', nome: 'Finanziamenti con utilizzo di carte di credito', parole: 'FINANZIAMENTI CON UTILIZZO DI CARTE DI', classi: [{ id: 'unica', etichetta: '', riga: '' }] },
  { id: 'altri', nome: 'Altri finanziamenti', parole: 'ALTRI FINANZIAMENTI', classi: [{ id: 'unica', etichetta: '', riga: '' }] }
];
const RIGHE_ATTESE = CATEGORIE.reduce((n, c) => n + c.classi.length, 0); // 24

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const due = (n) => String(n).padStart(2, '0');

/** Legge 108/1996, art. 2, comma 4: TEGM + un quarto + 4 punti, al massimo TEGM + 8. */
function sogliaDaTegm(tegm) {
  return Math.round(Math.min(tegm * 1.25 + 4, tegm + 8) * 10000) / 10000;
}

const numero = (s) => Number(String(s).replace(',', '.'));
const pulito = (s) => String(s || '').replace(/[’’]/g, "'").replace(/\s+/g, ' ').trim().toUpperCase();

/** "1° LUGLIO FINO AL 30 SETTEMBRE 2026" -> date ISO */
function dataDa(giorno, mese, anno) {
  const m = MESI.indexOf(String(mese).toLowerCase());
  if (m < 0) return null;
  return `${anno}-${due(m + 1)}-${due(giorno)}`;
}

function periodo(testo) {
  const t = pulito(testo);
  const app = t.match(/APPLICAZIONE DAL 1° ([A-Z]+)(?: (\d{4}))? FINO AL (\d{1,2}) ([A-Z]+) (\d{4})/);
  const ril = t.match(/PERIODO DI RIFERIMENTO DELLA RILEVAZIONE: 1° ([A-Z]+)(?: (\d{4}))? - (\d{1,2}) ([A-Z]+) (\d{4})/);
  if (!app || !ril) return null;
  return {
    dal: dataDa(1, app[1], app[2] || app[5]), al: dataDa(app[3], app[4], app[5]),
    rilevazione: { dal: dataDa(1, ril[1], ril[2] || ril[5]), al: dataDa(ril[3], ril[4], ril[5]) }
  };
}

function decreto(testo) {
  const m = String(testo).match(/Prot\.?\s*Num:\s*0*(\d+)\/(\d{4}) del (\d{2})\/(\d{2})\/(\d{4})/);
  return m ? { protocollo: `${Number(m[1])}/${m[2]}`, data: `${m[5]}-${m[4]}-${m[3]}` } : null;
}

// il decreto annuale di classificazione delle operazioni a cui il decreto rinvia
function classificazione(testo) {
  const m = pulito(testo).match(/VISTO IL PROPRIO DECRETO DEL (\d{1,2}) ([A-Z]+) (\d{4}), RECANTE LA .{0,3}CLASSIFICAZIONE/);
  return m ? dataDa(m[1], m[2], m[3]) : null;
}

// art. 3, comma 5: maggiorazione media degli interessi di mora (dato statistico)
function mora(testo) {
  const t = pulito(testo).toLowerCase();
  const m = t.match(/maggiorazione media pari a (\d+,\d+) punti percentuali per i mutui ipotecari di durata ultraquinquennale, a (\d+,\d+) punti percentuali per le operazioni di leasing e a (\d+,\d+) punti percentuali per il complesso degli altri prestiti/);
  return m ? { mutui: numero(m[1]), leasing: numero(m[2]), altri: numero(m[3]) } : null;
}

/**
 * La tabella: le righe con due numeri in fondo (TEGM e soglia), in ordine.
 * Restituisce { tassi: { 'categoria:classe': [tegm, soglia] }, errori: [...] }.
 */
function tabella(testo) {
  const errori = [];
  const inizio = String(testo).search(/CATEGORIE DI OPERAZIONI/);
  const fine = String(testo).search(/AVVERTENZA/);
  if (inizio < 0 || fine < inizio) return { tassi: {}, errori: ['tabella dell\'allegato A non trovata'] };
  const blocco = String(testo).slice(inizio, fine);
  const righe = blocco.split(/\r?\n/).map((r) => r.replace(/\s+$/, ''))
    .map((r) => r.match(/^(.*?)\s+(\d{1,2},\d{2})\s+(\d{1,2},\d{2,4})$/)).filter(Boolean);
  if (righe.length !== RIGHE_ATTESE) errori.push(`${righe.length} righe di tassi invece di ${RIGHE_ATTESE}`);
  // le categorie devono comparire tutte, nell'ordine atteso
  const tutto = pulito(blocco);
  let pos = 0;
  for (const c of CATEGORIE) {
    const i = tutto.indexOf(pulito(c.parole), pos);
    if (i < 0) errori.push(`categoria non trovata o fuori ordine: ${c.nome}`);
    else pos = i + 1;
  }
  const tassi = {};
  let k = 0;
  for (const c of CATEGORIE) {
    for (const cl of c.classi) {
      const r = righe[k++];
      if (!r) break;
      const testa = pulito(r[1]);
      if (cl.riga && !testa.endsWith(pulito(cl.riga))) errori.push(`${c.id}/${cl.id}: attesa "${cl.riga}", trovata "${r[1].trim()}"`);
      if (!cl.riga && /(FINO A|OLTRE|DA \d)/.test(testa)) errori.push(`${c.id}: classe d'importo inattesa "${r[1].trim()}"`);
      const tegm = numero(r[2]), soglia = numero(r[3]);
      if (!(tegm > 0 && tegm < 40)) errori.push(`${c.id}/${cl.id}: TEGM fuori scala ${r[2]}`);
      if (Math.abs(sogliaDaTegm(tegm) - soglia) > 0.00005) errori.push(`${c.id}/${cl.id}: soglia ${r[3]} diversa da quella di legge ${sogliaDaTegm(tegm)} per TEGM ${r[2]}`);
      tassi[`${c.id}:${cl.id}`] = [tegm, soglia];
    }
  }
  return { tassi, errori };
}

/** Dal testo del decreto al trimestre, o errori che ne impediscono la pubblicazione. */
function leggiDecreto(testo, url) {
  const errori = [];
  const p = periodo(testo);
  if (!p || !p.dal || !p.al) errori.push('periodo di applicazione non trovato');
  else {
    const [a, m, g] = p.dal.split('-').map(Number);
    const fine = new Date(Date.UTC(a, m - 1 + 3, 0)).toISOString().slice(0, 10);
    if (g !== 1 || ![1, 4, 7, 10].includes(m) || p.al !== fine) errori.push(`il periodo ${p.dal} - ${p.al} non e' un trimestre`);
  }
  const d = decreto(testo);
  if (!d) errori.push('protocollo e data del decreto non trovati');
  const t = tabella(testo);
  errori.push(...t.errori);
  if (errori.length) return { errori };
  return {
    errori: [],
    trimestre: { dal: p.dal, al: p.al, rilevazione: p.rilevazione, decreto: Object.assign(d, url ? { url } : {}), classificazione: classificazione(testo), mora: mora(testo), tassi: t.tassi }
  };
}

/** Aggiunge (o sostituisce) un trimestre nello storico, dal piu' recente. */
function aggiungi(storico, trimestre) {
  const altri = (storico || []).filter((x) => x.dal !== trimestre.dal);
  return [trimestre, ...altri].sort((a, b) => (a.dal < b.dal ? 1 : -1));
}

/** Collegamenti ai decreti tassi nella pagina del MEF (assoluti). */
function collegamentiDecreti(html, base) {
  const fuori = new Set();
  for (const m of String(html).matchAll(/href=["']([^"']+\.pdf)["']/gi)) {
    const u = m[1];
    if (!/tassi/i.test(u) || /categorie/i.test(u)) continue;
    try { fuori.add(new URL(u, base).href.replace(/^http:/, 'https:')); } catch (e) { /* indirizzo non valido */ }
  }
  return [...fuori];
}

/** I nomi abituali dei file, per cercare i trimestri che la pagina non elenca piu'. */
function nomeProbabile(anno, trimestre) {
  const m = [['gennaio', 'marzo'], ['aprile', 'giugno'], ['luglio', 'settembre'], ['ottobre', 'dicembre']][trimestre - 1];
  return `Decreto-tassi-usura-${m[0]}-${m[1]}-${anno}.pdf`;
}

module.exports = { CATEGORIE, RIGHE_ATTESE, sogliaDaTegm, periodo, decreto, classificazione, mora, tabella, leggiDecreto, aggiungi, collegamentiDecreti, nomeProbabile };
