#!/usr/bin/env node
// scripts/genera-calendario.js — Scrive le parti della pagina del calendario
// che dipendono dall'anno: titolo, i dodici mesi, festività, ponti, date
// utili e domande frequenti.
//
// Il contenuto viene dagli stessi moduli che la pagina usa nel browser
// (js/festivita.js e js/calendario-vista.js): chi arriva da Google legge nel
// codice HTML quello che poi vede calcolato, senza JavaScript.
//
// L'anno della pagina e' scritto in <main data-anno-calendario="2027">.
//
//   node scripts/genera-calendario.js              riscrive per lo stesso anno
//   node scripts/genera-calendario.js --anno 2028  passa al 2028
//   node scripts/genera-calendario.js --check      esce con 1 se cambierebbe
//
// Una volta l'anno, a settembre, quando si comincia a cercare il calendario
// dell'anno dopo:
//   node scripts/genera-calendario.js --anno 2028 && npm run build
//   python3 scripts/genera-indice-strumenti.py

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const F = require('../js/festivita.js');
const V = require('../js/calendario-vista.js');

const RADICE = path.join(__dirname, '..');
const PAGINA = path.join(RADICE, 'utilita-web', 'calendario-da-stampare', 'index.html');
const URL_PAGINA = 'https://strumentiutili.it/utilita-web/calendario-da-stampare/';

function esc(t) { return V.esc(t); }

// Le domande frequenti: le stesse nel JSON-LD e nella pagina.
function domande(anno) {
  const r = V.riepilogo(F, anno);
  const feste = F.festivita(anno).filter((f) => f.nome !== 'Pasqua');
  const ottobre = F.festivita(anno).find((f) => f.data === anno + '-10-04');
  const ricorrenze = F.ricorrenze(anno);
  const legale = ricorrenze.find((x) => x.nome.startsWith('Ora legale')).data;
  const solare = ricorrenze.find((x) => x.nome.startsWith('Ora solare')).data;
  const elenco = feste.map((f) => V.giornoMese(F, f.data) + ' (' + f.nome + ')').join(', ');
  return [
    {
      d: 'Quali sono le festività nazionali del ' + anno + '?',
      r: 'Sono ' + r.festivita + ', oltre alla Pasqua: ' + elenco + '. Nel ' + anno + ' ' +
        r.infrasettimanali + ' cadono in un giorno feriale e ' + r.nelWeekend + ' di sabato o di domenica. A queste si aggiunge il santo patrono del tuo comune.'
    },
    {
      d: 'Il 4 ottobre è festa?',
      r: 'Sì, dal 2026. La legge 151 del 2025 ha fatto tornare festa nazionale il 4 ottobre, giorno di San Francesco d’Assisi, patrono d’Italia' +
        (ottobre ? ': nel ' + anno + ' cade di ' + V.dataLunga(F, ottobre.data).split(' ')[0] : '') +
        '. Molti calendari stampati prima della legge non lo segnano: questo sì.'
    },
    {
      d: 'Quando è Pasqua nel ' + anno + '?',
      r: 'Domenica ' + V.giornoMese(F, r.pasqua) + ', e Pasquetta è lunedì ' + V.giornoMese(F, F.aggiungi(r.pasqua, 1)) +
        '. La data cambia ogni anno: Pasqua è la prima domenica dopo il primo plenilunio di primavera, e il calendario la calcola da sé.'
    },
    {
      d: 'Quanti giorni lavorativi ci sono nel ' + anno + '?',
      r: r.lavorativi + ' dal lunedì al venerdì, tolte le festività nazionali che cadono in settimana. Il santo patrono ne toglie uno in più se cade in un giorno feriale. Per un periodo preciso usa il calcolatore dei giorni lavorativi.'
    },
    {
      d: 'Quando cambia l’ora nel ' + anno + '?',
      r: 'Si passa all’ora legale ' + V.dataLunga(F, legale) + ' (alle 2 le lancette vanno avanti alle 3) e si torna all’ora solare ' +
        V.dataLunga(F, solare) + ' (alle 3 si torna alle 2). È la regola europea: ultima domenica di marzo e ultima di ottobre.'
    },
    {
      d: 'Come si stampa bene?',
      r: 'Apri il PDF e stampa su carta A4 con la scala al 100% (o «dimensioni effettive»). Il calendario mensile è orizzontale: se la stampante non ruota da sola il foglio, scegli l’orientamento orizzontale nelle opzioni di stampa.'
    },
    {
      d: 'Posso mettere le festività nel calendario del telefono?',
      r: 'Sì: il pulsante «Aggiungi le feste al calendario» scarica un file .ics con tutte le festività dell’anno scelto, patrono compreso. Si apre con Google Calendar, il Calendario di iPhone e Outlook.'
    },
    {
      d: 'Le fasi lunari sono precise?',
      r: 'Sono calcolate con le formule astronomiche di Jean Meeus, con un errore di pochi minuti, e riportate all’ora italiana: il giorno segnato è quello in cui la fase cade in Italia.'
    },
    {
      d: 'Il calendario viene creato su un server?',
      r: 'No. Il PDF e il file .ics si creano nel browser, sul tuo dispositivo: nessun dato viene inviato, e dopo la prima visita funziona anche senza connessione.'
    }
  ];
}

function testa(anno) {
  const titolo = 'Calendario ' + anno + ' da stampare in PDF, con festività e ponti';
  const descrizione = 'Calendario ' + anno + ' da stampare gratis in PDF: annuale su un foglio o mensile con lo spazio per scrivere. ' +
    'Festività nazionali (anche il 4 ottobre), santo patrono, ponti e fasi lunari.';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': URL_PAGINA + '#app',
        name: 'Calendario ' + anno + ' da stampare',
        url: URL_PAGINA,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Richiede JavaScript. Funziona senza inviare dati a server.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        description: descrizione,
        featureList: [
          'Calendario annuale su un foglio A4',
          'Calendario mensile, un foglio A4 orizzontale per mese',
          'Festività nazionali, 4 ottobre compreso, e santo patrono',
          'Numeri delle settimane e fasi lunari',
          'Festività da aggiungere al calendario del telefono (.ics)'
        ],
        author: { '@type': 'Person', name: 'Brian Barrionuevo', url: 'https://strumentiutili.it/contatti/' },
        publisher: { '@type': 'Organization', name: 'StrumentiUtili.it', url: 'https://strumentiutili.it/' }
      },
      {
        '@type': 'FAQPage',
        '@id': URL_PAGINA + '#faq',
        mainEntity: domande(anno).map((f) => ({ '@type': 'Question', name: f.d, acceptedAnswer: { '@type': 'Answer', text: f.r } }))
      }
    ]
  };
  const json = JSON.stringify(ld, null, 2).split('\n').map((l) => '  ' + l).join('\n');
  return [
    '  <title>' + esc(titolo) + ' — StrumentiUtili.it</title>',
    '  <meta name="description" content="' + esc(descrizione) + '" />',
    '  <meta property="og:title" content="' + esc('Calendario ' + anno + ' da stampare, con festività e ponti') + '" />',
    '  <meta property="og:description" content="' + esc(descrizione) + '" />',
    '  <script type="application/ld+json">',
    json,
    '  </script>'
  ].join('\n');
}

function titolo(anno) {
  return [
    '      <h1 class="text-3xl font-bold text-gray-900 tracking-tight">Calendario ' + anno + ' da stampare</h1>',
    '      <p class="mt-3 text-gray-700 leading-relaxed">',
    '        Scegli il formato, aggiungi il santo patrono del tuo comune e scarica il PDF pronto da stampare su un foglio A4.',
    '        Sotto trovi il calendario dell&rsquo;anno, le festivit&agrave; del ' + anno + ' con il 4 ottobre, i ponti e le altre date da segnare.',
    '      </p>'
  ].join('\n');
}

function opzioniAnno(anno) {
  return '            <option value="' + anno + '" selected>' + anno + '</option>';
}

function faq(anno) {
  return domande(anno).map((f) => [
    '          <details class="group border-b border-gray-100 py-3">',
    '            <summary class="cursor-pointer font-semibold text-gray-900 list-none flex justify-between items-center gap-3">' + esc(f.d) +
      '<span class="text-indigo-600 transition-transform group-open:rotate-45 text-lg leading-none" aria-hidden="true">+</span></summary>',
    '            <p class="mt-2 text-sm text-gray-700 leading-relaxed">' + esc(f.r) + '</p>',
    '          </details>'
  ].join('\n')).join('\n');
}

// Le regioni: <!-- su:cal:NOME --> ... <!-- /su:cal:NOME -->
function regioni(anno) {
  return {
    testa: testa(anno),
    titolo: titolo(anno),
    'opzioni-anno': opzioniAnno(anno),
    'anno-mesi': String(anno),
    mesi: '        ' + V.anno(F, anno),
    'anno-festivita': String(anno),
    festivita: '        ' + V.festivita(F, anno),
    'anno-ponti': String(anno),
    ponti: '        ' + V.ponti(F, anno),
    'anno-ricorrenze': String(anno),
    ricorrenze: '        ' + V.ricorrenze(F, anno),
    faq: faq(anno)
  };
}

function annoDellaPagina(html) {
  const m = html.match(/data-anno-calendario="(\d{4})"/);
  if (!m) throw new Error('Nella pagina manca data-anno-calendario');
  return Number(m[1]);
}

function rigenera(html, anno) {
  let fuori = html.replace(/data-anno-calendario="\d{4}"/, 'data-anno-calendario="' + anno + '"');
  for (const [nome, contenuto] of Object.entries(regioni(anno))) {
    const apri = '<!-- su:cal:' + nome + ' -->';
    const chiudi = '<!-- /su:cal:' + nome + ' -->';
    const i = fuori.indexOf(apri);
    const j = fuori.indexOf(chiudi);
    if (i < 0 || j < i) throw new Error('Regione mancante nella pagina: ' + nome);
    // Le regioni in linea (un numero dentro un titolo) restano in linea.
    const inLinea = !contenuto.includes('\n') && !contenuto.startsWith(' ');
    const dentro = inLinea ? contenuto : '\n' + contenuto + '\n' + fuori.slice(fuori.lastIndexOf('\n', i) + 1, i).replace(/\S.*$/, '');
    fuori = fuori.slice(0, i + apri.length) + dentro + fuori.slice(j);
  }
  return fuori;
}

function main() {
  const argomenti = process.argv.slice(2);
  const html = fs.readFileSync(PAGINA, 'utf8');
  const k = argomenti.indexOf('--anno');
  const anno = k >= 0 ? Number(argomenti[k + 1]) : annoDellaPagina(html);
  if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) {
    console.error('Anno non valido: ' + argomenti[k + 1]);
    process.exit(2);
  }
  const nuovo = rigenera(html, anno);
  if (argomenti.includes('--check')) {
    if (nuovo !== html) {
      console.error('La pagina del calendario non e’ aggiornata: esegui node scripts/genera-calendario.js');
      process.exit(1);
    }
    console.log('Calendario ' + anno + ': pagina aggiornata.');
    return;
  }
  if (nuovo !== html) fs.writeFileSync(PAGINA, nuovo);
  console.log('Calendario ' + anno + (nuovo !== html ? ': pagina riscritta.' : ': niente da cambiare.'));
}

if (require.main === module) main();

module.exports = { rigenera, annoDellaPagina, domande, PAGINA };
