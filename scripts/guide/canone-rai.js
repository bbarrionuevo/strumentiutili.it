// Guida: canone Rai, chi non lo paga, disdetta, esenzione over 75 e rimborso.
// Importo e rate da canone_tv di data/regole-fiscali-2026.json (scheda "Come si
// paga" dell'Agenzia); le date degli esempi le calcola js/canone-tv.js con le
// regole delle istruzioni ufficiali.
'use strict';

module.exports = function (ctx) {
  const { h, euro, data } = ctx;
  const T = ctx.regole.canone_tv;
  const O = T.esenzione_over_75;
  const C = ctx.motori.canone;
  const rata = T.importo_annuo / T.rate_in_bolletta;
  const periodo = (r) => r.periodo === 'intero' ? 'tutto il ' + r.anno : 'solo luglio-dicembre ' + r.anno;
  const invii = ['2026-09-15', '2027-01-20', '2027-03-15', '2027-07-10'].map((d) => [data(d), periodo(C.effettoNonDetenzione(d))]);
  const nascite = [
    { nato: '1952-01-20', anno: 2027 },
    { nato: '1952-05-05', anno: 2027 },
    { nato: '1952-09-10', anno: 2027 }
  ].map((x) => ({ ...x, r: C.esenzioneOver75(x.nato, x.anno) }));
  const esitoOver = (x) => x.r.periodo === 'intero' ? 'tutto il ' + x.anno
    : x.r.periodo === 'secondo' ? 'luglio-dicembre ' + x.anno : 'niente nel ' + x.anno + ', tutto il ' + (x.anno + 1);
  const AE = 'https://www.agenziaentrate.gov.it/portale/';
  const a = (href, testo) => `<a href="${href}" class="text-indigo-700 underline" target="_blank" rel="noopener">${testo}</a>`;

  const corpo = [
    h.h2('cos-e', 'Che cos&rsquo;&egrave; il canone e quanto costa'),
    h.p('Il canone Rai, per la legge &laquo;canone di abbonamento alla televisione per uso privato&raquo;, lo deve chi ha un televisore. Si paga una volta sola all&rsquo;anno e una volta sola per famiglia, se i familiari hanno la residenza nella stessa casa. L&rsquo;importo &egrave; di <strong>' + euro(T.importo_annuo, 0) + ' l&rsquo;anno</strong> (solo per il 2024 era stato ridotto a 70 euro).'),
    h.p('Dal 2016 la legge presume che chi ha un contratto della luce nella casa di residenza abbia anche il televisore. Per questo il canone arriva direttamente nella <strong>bolletta elettrica</strong>, in ' + T.rate_in_bolletta + ' rate mensili ' + T.mesi_rate + ': ' + euro(rata) + ' a rata. Chi in famiglia non ha un contratto elettrico domestico residenziale, ma ha un televisore, paga invece con il modello F24 entro il 31 gennaio.'),
    h.p('Per famiglia si intende la <strong>famiglia anagrafica</strong>: le persone legate da matrimonio, unione civile, parentela, affinit&agrave;, adozione, tutela o da vincoli affettivi, che vivono insieme e hanno la dimora abituale nello stesso Comune. &Egrave; quella che risulta allo stato di famiglia.'),

    h.h2('chi-non-paga', 'Chi pu&ograve; non pagarlo'),
    h.p('La presunzione si supera con una dichiarazione. Le situazioni pi&ugrave; comuni sono tre, ognuna con il suo modulo:'),
    h.tabella('Le situazioni in cui il canone non &egrave; dovuto', ['Situazione', 'Che cosa si presenta', 'Quanto dura'], [
      ['In casa non c&rsquo;&egrave; nessun televisore', 'Dichiarazione sostitutiva, quadro A', 'Un anno: va ripresentata ogni anno'],
      ['Il canone lo paga gi&agrave; un altro componente della famiglia', 'Dichiarazione sostitutiva, quadro B', 'Finch&eacute; la situazione resta'],
      ['75 anni compiuti e reddito fino a ' + euro(O.soglia_reddito, 0), 'Dichiarazione per l&rsquo;esenzione over 75', 'Finch&eacute; i requisiti restano']
    ]),
    h.p('Contano come televisori gli apparecchi che ricevono il digitale terrestre o il satellite, anche con un decoder esterno. <strong>Computer, smartphone e tablet</strong> senza sintonizzatore TV non contano, e le radio in un&rsquo;abitazione privata non pagano il canone. Chi ha solo questi apparecchi pu&ograve; presentare il quadro A.'),

    h.h2('disdetta', 'La disdetta: il quadro A e le sue date'),
    h.p('Il quadro A della dichiarazione sostitutiva &egrave; quello che tutti chiamano disdetta: dichiari che in nessuna delle case in cui hai un contratto della luce c&rsquo;&egrave; un televisore, n&eacute; tuo n&eacute; dei tuoi familiari. Vale per un anno, e quale anno dipende da quando la presenti.'),
    h.tabella('Per quale periodo vale il quadro A, secondo la data di presentazione', ['Presentato il', 'Vale per'], invii),
    h.p('La regola &egrave; semplice: dal 1&deg; luglio al 31 dicembre vale per tutto l&rsquo;anno successivo; entro il 31 gennaio vale per tutto l&rsquo;anno in corso; dal 1&deg; febbraio al 30 giugno vale solo per il secondo semestre. Quando il 31 gennaio cade di sabato o di domenica il termine passa al primo giorno lavorativo, come per tutti gli adempimenti fiscali (D.L. 70/2011, art. 7, comma 2, lettera h): per il 2026 l&rsquo;Agenzia ha indicato come ultimo giorno il 2 febbraio, e per il 2027, con il 31 gennaio di domenica, l&rsquo;ultimo giorno &egrave; luned&igrave; 1&deg; febbraio.'),
    h.p('Chi attiva un nuovo contratto della luce, senza averne altri quell&rsquo;anno, ha tempo fino alla fine del mese successivo all&rsquo;attivazione per non pagare nulla da subito. La disdetta per suggellamento dell&rsquo;apparecchio, che si faceva un tempo, non &egrave; pi&ugrave; prevista.'),
    h.esempio('rate gi&agrave; pagate prima della disdetta', [
      'Il canone annuo di ' + euro(T.importo_annuo, 0) + ' &egrave; diviso in ' + T.rate_in_bolletta + ' rate da ' + euro(rata) + '.',
      'Una famiglia senza televisore presenta il quadro A il 15 marzo: vale solo per luglio-dicembre.',
      'Il canone del primo semestre resta dovuto, perch&eacute; la dichiarazione &egrave; arrivata dopo il termine di gennaio.'
    ], 'Per non pagare nulla l&rsquo;anno dopo, la dichiarazione va ripresentata dal 1&deg; luglio al 31 gennaio.'),

    h.h2('familiare', 'Due contratti della luce nella stessa famiglia: il quadro B'),
    h.p('Se in famiglia ci sono due contratti della luce &ndash; per esempio marito e moglie con due utenze intestate separatamente &ndash; il canone resta uno. Con il quadro B dichiari che non va addebitato sulle tue utenze perch&eacute; lo paga gi&agrave; il familiare, indicando il suo codice fiscale e la data da cui fate parte della stessa famiglia anagrafica.'),
    h.p('Il quadro B si presenta in qualsiasi momento e non va ripetuto. Se la situazione esiste dal 1&deg; gennaio ha effetto dal primo semestre; se nasce dal 2 gennaio al 1&deg; luglio, dal secondo semestre; se nasce dopo il 1&deg; luglio, dall&rsquo;anno successivo. Lo pu&ograve; usare anche l&rsquo;erede, per le utenze di una persona deceduta, indicando come data inizio quella del decesso.'),

    h.h2('over-75', 'L&rsquo;esenzione per chi ha 75 anni'),
    h.p('Chi ha compiuto ' + O.eta + ' anni non paga il canone se ha tutti questi requisiti: il reddito suo e del coniuge, nell&rsquo;anno precedente, non supera <strong>' + euro(O.soglia_reddito, 0) + '</strong>; in casa non vivono altre persone con reddito proprio, a parte colf, badanti e collaboratori domestici; il televisore sta solo nella casa di residenza. Per gli anni fino al 2017 la soglia era di ' + euro(O.soglia_reddito_fino_al_2017) + '.'),
    h.p('L&rsquo;esenzione vale per tutto l&rsquo;anno se i 75 anni si compiono entro il 31 gennaio, per il secondo semestre se si compiono dal 1&deg; febbraio al 31 luglio. Una volta presentata, la dichiarazione vale anche per gli anni successivi finch&eacute; i requisiti restano.'),
    h.tabella('Da quando spetta l&rsquo;esenzione, secondo la data di nascita', ['Nato il', '75 anni il', 'Esenzione'],
      nascite.map((x) => [data(x.nato), data(x.r.compleanno75), esitoOver(x)])),
    h.p('Nel reddito si conta l&rsquo;imponibile della dichiarazione o della Certificazione Unica, pi&ugrave; i redditi a imposta sostitutiva come gli interessi di conti e titoli di Stato e i redditi esteri non tassati in Italia. Non si contano i redditi esenti IRPEF, come le pensioni di guerra, le rendite INAIL e le pensioni di invalidit&agrave; civile, n&eacute; il TFR, la casa di abitazione e i redditi a tassazione separata.'),

    h.h2('come', 'Come si presentano le dichiarazioni'),
    h.ul([
      '<strong>Online</strong>: la dichiarazione sostitutiva si invia dal servizio web dell&rsquo;area riservata del sito dell&rsquo;Agenzia delle Entrate, con SPID, CIE o CNS, oppure tramite un intermediario abilitato (CAF, commercialista).',
      '<strong>Raccomandata senza busta</strong> all&rsquo;Agenzia delle Entrate, Direzione Provinciale 1 di Torino, Ufficio Canone TV, Casella postale 22, 10121 Torino, con la copia di un documento d&rsquo;identit&agrave;. Fa fede il timbro postale.',
      '<strong>PEC</strong> a cp22.canonetv@postacertificata.rai.it: la dichiarazione sostitutiva firmata digitalmente o firmata a penna e scansionata con il documento; la dichiarazione per gli over 75 firmata digitalmente.',
      '<strong>Sportello</strong>: la dichiarazione per gli over 75 si pu&ograve; anche consegnare a un ufficio territoriale dell&rsquo;Agenzia.'
    ]),
    h.p('Una volta ricevuta, la dichiarazione ferma l&rsquo;addebito dalla prima rata utile. Per gli over 75 l&rsquo;Agenzia indica che, se la richiesta arriva entro il 15 del mese, l&rsquo;addebito si ferma di norma dalla rata del mese dopo; se arriva nella seconda met&agrave; del mese, dalla rata del secondo mese successivo. Nel frattempo si pu&ograve; pagare la bolletta in modo parziale, togliendo le rate non dovute.'),

    h.h2('rimborso', 'Il rimborso di quanto pagato senza doverlo'),
    h.p('Se in bolletta sono arrivate rate che non dovevi, le chiedi indietro con la richiesta di rimborso del canone addebitato nelle fatture elettriche. Si indicano l&rsquo;anno, le bollette (codice POD, numero della fattura e quota del canone) e il totale, che deve essere la somma delle righe. Il motivo si sceglie fra sei codici: esenzione over 75, convenzioni internazionali, canone pagato anche in un altro modo, canone addebitato anche a un familiare, dichiarazione di non detenzione presentata, altri motivi.'),
    h.esempio('canone addebitato due volte nella stessa famiglia', [
      'Moglie e marito hanno due contratti della luce: il canone arriva su entrambe le bollette.',
      'Sulla bolletta del marito sono state addebitate 4 rate da ' + euro(rata) + '.',
      'Il marito chiede il rimborso con il motivo 4, indicando il codice fiscale della moglie e la data da cui fanno parte della stessa famiglia.'
    ], 'Rimborso richiesto: ' + euro(rata * 4) + '. Lasciando vuota la data fine, la richiesta vale anche come dichiarazione per gli anni successivi.'),
    h.p('Chi aveva diritto all&rsquo;esenzione over 75 e ha pagato pu&ograve; usare anche il modello di rimborso specifico, che contiene la dichiarazione dei requisiti per l&rsquo;anno del rimborso. Tutti questi moduli si compilano nel browser negli strumenti collegati a questa guida, e il PDF che si scarica &egrave; quello ufficiale dell&rsquo;Agenzia.')
  ].join('\n');

  return {
    slug: 'canone-rai',
    tema: 'casa',
    titolo: 'Canone Rai 2027: chi non lo paga, disdetta, esenzione e rimborso',
    titoloBreve: 'Canone Rai: disdetta, esenzione over 75 e rimborso',
    descrizione: 'Quanto costa il canone TV e come smettere di pagarlo quando non è dovuto: la disdetta per chi non ha il televisore, il canone pagato da un familiare, l’esenzione per chi ha 75 anni, il rimborso delle rate in bolletta. Con le date e gli esempi.',
    pubblicata: '2026-09-27',
    aggiornata: '2026-10-06',
    introduzione: 'Il canone Rai arriva nella bolletta della luce anche a chi il televisore non ce l&rsquo;ha, a chi lo paga gi&agrave; attraverso un familiare o a chi, compiuti 75 anni, ne sarebbe esente. In tutti questi casi si pu&ograve; smettere di pagarlo, ma bisogna presentare il modulo giusto nei tempi giusti. Questa guida spiega quale, entro quando e come riavere le rate pagate senza doverle.',
    riassunto: [
      'Il canone costa ' + euro(T.importo_annuo, 0) + ' l&rsquo;anno, in ' + T.rate_in_bolletta + ' rate ' + T.mesi_rate + ' nella bolletta della luce.',
      'Senza televisore si presenta il quadro A: dal 1&deg; luglio al 31 gennaio vale per tutto l&rsquo;anno, dopo solo per luglio-dicembre, e va ripetuto ogni anno.',
      'Chi ha 75 anni e un reddito, con il coniuge, fino a ' + euro(O.soglia_reddito, 0) + ' pu&ograve; chiedere l&rsquo;esenzione; le rate gi&agrave; pagate si chiedono indietro con il rimborso.'
    ],
    strumenti: [
      { href: '/cittadino-tasse/disdetta-canone-rai/', testo: 'Compila la disdetta' },
      { href: '/cittadino-tasse/esenzione-canone-rai-over-75/', testo: 'Esenzione over 75' },
      { href: '/cittadino-tasse/rimborso-canone-rai/', testo: 'Chiedi il rimborso' }
    ],
    corpo,
    errori: [
      'Presentare la disdetta dopo il termine di gennaio (nel 2027, dopo luned&igrave; 1&deg; febbraio) pensando che valga per tutto l&rsquo;anno: copre solo luglio-dicembre.',
      'Non ripetere il quadro A l&rsquo;anno dopo: la dichiarazione di non detenzione vale un anno solo.',
      'Usare il quadro A quando il televisore c&rsquo;&egrave; ma il canone lo paga un familiare: il quadro giusto &egrave; il B.',
      'Dimenticare la copia del documento d&rsquo;identit&agrave; nella raccomandata.',
      'Chiedere il rimborso con i motivi 1 o 5 senza aver presentato la dichiarazione su cui si basano: senza dichiarazione anche le rate future continuano ad arrivare.',
      'Nel rimborso, indicare il totale della bolletta invece della sola quota del canone.'
    ],
    faq: [
      { d: 'Il canone Rai si paga anche se guardo solo lo smartphone?', r: 'No, se in casa non c&rsquo;&egrave; un apparecchio con sintonizzatore per il digitale terrestre o il satellite. Computer, smartphone e tablet senza sintonizzatore non sono televisori: si pu&ograve; presentare il quadro A.' },
      { d: 'Entro quando si presenta la disdetta per il 2027?', r: 'Dal 1&deg; luglio 2026 a luned&igrave; 1&deg; febbraio 2027 per non pagare nulla del 2027: il 31 gennaio &egrave; domenica e il termine passa al primo giorno lavorativo. Dal 2 febbraio al 30 giugno 2027 vale solo per il secondo semestre.' },
      { d: 'Ho due case: pago due canoni?', r: 'No. Il canone si paga una volta sola per famiglia anagrafica, anche con pi&ugrave; contratti della luce. Se l&rsquo;addebito arriva su due utenze della stessa famiglia si presenta il quadro B.' },
      { d: 'L&rsquo;esenzione over 75 va rinnovata ogni anno?', r: 'No. Se i requisiti restano, la dichiarazione vale anche per gli anni successivi. Se vengono meno si presenta la sezione II dello stesso modello.' },
      { d: 'Quanto tempo ho per chiedere il rimborso?', r: 'Le istruzioni del modello non indicano un termine: per ogni anno si presenta una richiesta, a partire dal 2016, primo anno del canone in bolletta.' }
    ],
    fonti: [
      'Legge 28 dicembre 2015, n. 208, art. 1, commi 152-159: canone in bolletta e presunzione di detenzione, fino al 31 dicembre 2026; dal 2027 le stesse regole sono nel testo unico dei tributi erariali minori, ' + a('https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2024-11-05;174:1~art51', 'D.Lgs. 174/2024, allegato, artt. 51-55 e 54-ter') + '.',
      'D.L. 13 maggio 2011, n. 70, art. 7: le scadenze fiscali che cadono di sabato o in un giorno festivo passano al primo giorno lavorativo.',
      'Legge 24 dicembre 2007, n. 244, art. 1, comma 132: esenzione per chi ha 75 anni; Legge 27 dicembre 2019, n. 160, art. 1, comma 355: soglia di 8.000 euro.',
      'Agenzia delle Entrate: ' + a(AE + 'schede/agevolazioni/canone-tv/come-si-paga-canone-tv', 'Canone TV, come si paga') + ' e ' + a(AE + 'schede/agevolazioni/canone-tv/dichiarazione-sostitutiva-canone-tv', 'dichiarazione sostitutiva') + '.',
      'Agenzia delle Entrate: ' + a(AE + 'aree-tematiche/canone-tv/casi-di-esonero/ultrasettantacinquenni', 'ultrasettantacinquenni con reddito basso') + ' e ' + a(AE + 'schede/agevolazioni/canone-tv/modelli-e-istruzioni-canone-tv', 'modelli e istruzioni') + '.'
    ]
  };
};
