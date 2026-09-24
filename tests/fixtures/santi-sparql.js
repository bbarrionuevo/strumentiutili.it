// tests/fixtures/santi-sparql.js — Una risposta di Wikidata finta ma con la
// stessa forma di quella vera (results.bindings della QUERY di
// scripts/genera-santi.js): un santo di riempimento per ogni giorno, piu' i
// casi che contano per l'ordine e gli onomastici.
'use strict';

const MESI = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const E = 'http://www.wikidata.org/entity/';

function riga(qid, nome, giorno, o) {
  const opz = o || {};
  const r = {
    santo: { type: 'uri', value: E + qid },
    nome: { type: 'literal', 'xml:lang': 'it', value: nome },
    giorno: { type: 'literal', 'xml:lang': 'en', value: giorno },
    sitelinks: { type: 'literal', value: String(opz.sitelinks || 1) }
  };
  if (opz.stato !== null) r.stato = { type: 'uri', value: E + (opz.stato || 'Q43115') };
  if (opz.donna) r.genere = { type: 'uri', value: E + 'Q6581072' };
  else r.genere = { type: 'uri', value: E + 'Q6581097' };
  if (opz.pagina) r.pagina = { type: 'literal', 'xml:lang': 'it', value: opz.pagina };
  return r;
}

function risposta() {
  const righe = [];
  let q = 900000;
  MESI.forEach((m, i) => {
    const n = new Date(Date.UTC(2000, i + 1, 0)).getUTCDate();
    for (let g = 1; g <= n; g++) righe.push(riga('Q' + (q++), 'Riempitivo ' + m + ' ' + g, m + ' ' + g));
  });
  righe.push(
    // 4 ottobre: il santo con voce italiana prima del beato piu' citato e di quello senza voce
    riga('Q676555', 'Francesco d\'Assisi', 'October 4', { sitelinks: 150, pagina: 'Francesco d\'Assisi' }),
    riga('Q1', 'Beato Famosissimo', 'October 4', { sitelinks: 400, stato: 'Q51626', pagina: 'Beato Famosissimo' }),
    riga('Q2', 'Petronio di Bologna', 'October 4', { sitelinks: 300 }),
    // righe doppie per lo stesso santo (due stati): si fondono
    riga('Q676555', 'Francesco d\'Assisi', 'October 4', { sitelinks: 150, pagina: 'Francesco d\'Assisi', stato: 'Q51626' }),
    // donne, vocali, "Santo" davanti a S+consonante
    riga('Q3', 'Agata di Catania', 'February 5', { sitelinks: 60, donna: true, pagina: 'Sant\'Agata' }),
    riga('Q4', 'Rita da Cascia', 'May 22', { sitelinks: 50, donna: true, pagina: 'Rita da Cascia' }),
    riga('Q5', 'Stefano protomartire', 'December 26', { sitelinks: 70, pagina: 'Santo Stefano' }),
    // due feste per lo stesso santo: l'onomastico lo decide l'eccezione
    riga('Q6', 'Nicola di Bari', 'December 6', { sitelinks: 90, pagina: 'San Nicola' }),
    riga('Q6', 'Nicola di Bari', 'May 9', { sitelinks: 90, pagina: 'San Nicola' }),
    // un nome senza eccezione: vince il santo piu' noto
    riga('Q7', 'Giulia di Corsica', 'May 22', { sitelinks: 20, donna: true, pagina: 'Giulia di Corsica' }),
    riga('Q8', 'Giulia martire minore', 'July 15', { sitelinks: 3, donna: true }),
    // da scartare: Maria, feste mobili, persone senza stato di santo
    riga('Q345', 'Maria', 'August 15', { sitelinks: 900, donna: true, pagina: 'Maria' }),
    riga('Q9', 'Qualcuno', 'Pentecost', { sitelinks: 10 }),
    riga('Q10', 'Mario Rossi', 'March 3', { sitelinks: 500, stato: null, pagina: 'Mario Rossi' }),
    // Giuseppe: eccezione al 19 marzo
    riga('Q11', 'Giuseppe', 'March 19', { sitelinks: 120, pagina: 'San Giuseppe' })
  );
  return { head: { vars: ['santo', 'nome', 'giorno', 'sitelinks', 'pagina', 'stato', 'genere'] }, results: { bindings: righe } };
}

module.exports = { risposta };
