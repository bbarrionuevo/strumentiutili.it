// Guida: fattura elettronica scartata dal Sistema di Interscambio, i codici
// di errore piu' comuni e come rimandarla.
// Regole e tolleranze dall'«Elenco dei controlli» SdI versione 2.0 (31 gennaio
// 2025) e dalle Specifiche tecniche SdI 1.8.4; il reinvio dalla circolare 13/E
// del 2 luglio 2018, paragrafo 1.6. I conti degli esempi si fanno qui, con le
// stesse regole di arrotondamento del documento ufficiale.
'use strict';

module.exports = function (ctx) {
  const { h, euro, num } = ctx;
  // arrotondamento al centesimo come nelle specifiche: per eccesso da 5 in su
  const cent = (x) => Math.round(x * 100 + 1e-9) / 100;
  const n2 = (x) => num(x, 2);

  // 00423: 100 euro divisi in 3 ore
  const unitario = Math.floor(100 / 3 * 100) / 100;
  const totaleRighe = cent(unitario * 3);
  const unitario8 = Math.floor(100 / 3 * 1e8) / 1e8;

  // 00421: sette righe da 10,15 euro al 22%
  const riga = 10.15;
  const ivaRiga = cent(riga * 0.22);
  const sommaIvaRighe = cent(ivaRiga * 7);
  const imponibile7 = cent(riga * 7);
  const ivaRiepilogo = cent(imponibile7 * 22 / 100);

  // 00422: compenso e contributo integrativo alla cassa
  const compenso = 1000;
  const cassa = cent(compenso * 0.04);
  const imponibileCassa = compenso + cassa;
  const ivaCassa = cent(imponibileCassa * 22 / 100);

  const corpo = [
    h.h2('esiti', 'Che cosa succede dopo l&rsquo;invio'),
    h.p('La fattura elettronica &egrave; un file XML che passa dal Sistema di Interscambio (SdI) dell&rsquo;Agenzia delle Entrate prima di arrivare al cliente. Lo SdI controlla il file e risponde con una ricevuta. Gli esiti possibili sono tre:'),
    h.ul([
      '<strong>Ricevuta di consegna:</strong> la fattura &egrave; arrivata al cliente, al suo codice destinatario o alla sua PEC. &Egrave; emessa.',
      '<strong>Ricevuta di impossibilit&agrave; di recapito:</strong> i controlli sono passati, ma la fattura non si &egrave; potuta consegnare, per esempio perch&eacute; la casella PEC del cliente &egrave; piena. La fattura &egrave; emessa lo stesso e il cliente la trova nella sua area riservata del sito dell&rsquo;Agenzia; conviene avvisarlo e mandargli una copia.',
      '<strong>Ricevuta di scarto:</strong> il file non ha superato un controllo. La fattura <em>non &egrave; emessa</em>: per il fisco &egrave; come se non esistesse.'
    ]),
    h.p('La ricevuta di scarto arriva entro cinque giorni, sullo stesso canale da cui hai mandato il file (il portale Fatture e Corrispettivi, la PEC o il tuo intermediario). Per ogni errore contiene un <strong>codice di cinque cifre</strong> e una descrizione. Il codice &egrave; la parte utile: tutti i controlli sono elencati, con le regole esatte, nel documento ufficiale &laquo;Elenco dei controlli effettuati sul file fattura&raquo;, oggi alla versione 2.0.'),

    h.h2('rimandare', 'Come si rimanda una fattura scartata'),
    h.p('Secondo la circolare 13/E del 2018 dell&rsquo;Agenzia delle Entrate, la fattura scartata va rimandata <strong>entro cinque giorni dalla notifica di scarto</strong>, preferibilmente <strong>con lo stesso numero e la stessa data</strong> di quella originale. Cos&igrave; la data della fattura resta quella giusta rispetto all&rsquo;operazione.'),
    h.ol([
      'Leggi il codice nella ricevuta e correggi il dato nel programma che usi, o rigenera il file.',
      'Lascia lo stesso numero e la stessa data. Il controllo dei duplicati confronta la fattura solo con quelle <em>non</em> scartate: il numero della fattura scartata &egrave; di nuovo libero.',
      'Cambia il <strong>nome del file</strong>. Lo SdI rifiuta un file con un nome gi&agrave; ricevuto (codice 00002), anche se quel file era stato scartato. Basta cambiare il progressivo finale: da IT01234567890_00001.xml a IT01234567890_00002.xml.',
      'Rimanda il file e controlla la nuova ricevuta.'
    ]),
    h.p('Se non riesci a rispettare i cinque giorni, o il tuo programma non ti lascia riusare numero e data, la circolare ammette due alternative: una fattura con numero e data nuovi, collegata a quella scartata, oppure una numerazione che faccia capire che si tratta di una rettifica, come &laquo;1/R&raquo;, in un registro sezionale. La fattura scartata <strong>non si annulla con una nota di credito</strong>: non essendo mai stata emessa, basta una variazione nella tua contabilit&agrave; interna, senza mandare niente allo SdI.'),

    h.h2('conti', 'Gli scarti sui conti: 00423, 00421 e 00422'),
    h.p('Sono i pi&ugrave; insidiosi, perch&eacute; a occhio la fattura sembra giusta. Lo SdI rif&agrave; i conti con regole precise e tollera differenze molto piccole: se il tuo programma arrotonda in un altro modo, il file viene scartato.'),
    h.tabella('Le tolleranze dei controlli sui conti', ['Codice', 'Che cosa ricalcola lo SdI', 'Differenza ammessa'], [
      ['00423', 'Il prezzo totale di ogni riga: prezzo unitario, con sconti e maggiorazioni, per la quantit&agrave;', 'meno di 1 centesimo'],
      ['00421', 'L&rsquo;imposta di ogni aliquota nel riepilogo: imponibile &times; aliquota / 100, arrotondata al centesimo', 'meno di 1 centesimo'],
      ['00422', 'L&rsquo;imponibile di ogni aliquota nel riepilogo: somma dei prezzi totali delle righe, pi&ugrave; l&rsquo;eventuale contributo cassa e arrotondamento', 'meno di 1 euro']
    ]),
    h.esempio('tre ore di consulenza per ' + euro(100, 0) + ' in tutto (errore 00423)', [
      'Il prezzo unitario viene scritto con due decimali: 100 / 3 = ' + euro(unitario) + '.',
      'Lo SdI calcola ' + n2(unitario) + ' &times; 3 = ' + euro(totaleRighe) + ', ma nel prezzo totale della riga c&rsquo;&egrave; ' + euro(100) + '.',
      'La differenza &egrave; ' + euro(cent(100 - totaleRighe)) + ': non &egrave; inferiore a un centesimo, quindi il file viene scartato.'
    ], 'Soluzioni: scrivere il prezzo unitario con pi&ugrave; decimali (il campo ne ammette fino a otto: ' + num(unitario8, 8) + ' &times; 3 d&agrave; una differenza di pochi miliardesimi), oppure indicare quantit&agrave; 1 e prezzo ' + euro(100) + '.'),
    h.p('Lo stesso errore capita con gli sconti. Nell&rsquo;XML lo sconto di riga espresso in euro ammette solo due decimali, mentre il prezzo unitario ne ammette otto: se il gestionale calcola lo sconto con pi&ugrave; decimali e poi lo arrotonda, il totale della riga non torna. L&rsquo;Agenzia suggerisce, in questi casi, di indicare lo sconto come una riga a parte, con il prezzo negativo scritto con tutti i decimali necessari. Gli sconti in percentuale, invece, si applicano &laquo;a cascata&raquo;: il secondo sconto si calcola sul prezzo gi&agrave; scontato dal primo.'),
    h.esempio('sette righe da ' + euro(riga) + ' con IVA al 22% (errore 00421)', [
      'Il programma calcola l&rsquo;IVA riga per riga: ' + n2(riga) + ' &times; 22% = ' + num(riga * 0.22, 3) + ', arrotondata a ' + euro(ivaRiga) + '.',
      'Poi somma le IVA arrotondate: ' + n2(ivaRiga) + ' &times; 7 = ' + euro(sommaIvaRighe) + ', e scrive questo importo nel riepilogo.',
      'Lo SdI invece calcola l&rsquo;imposta sul totale: ' + euro(imponibile7) + ' &times; 22% = ' + euro(ivaRiepilogo) + '.'
    ], 'La differenza &egrave; ' + euro(cent(ivaRiepilogo - sommaIvaRighe)) + ' e il file viene scartato. L&rsquo;IVA va calcolata una sola volta per ogni aliquota, sul totale imponibile del riepilogo.'),
    h.p('Quando il conto d&agrave; pi&ugrave; di due decimali si arrotonda al centesimo: per difetto se la terza cifra &egrave; minore di 5, per eccesso se &egrave; 5 o pi&ugrave;. Gli esempi del documento ufficiale: 1.500,2448 diventa 1.500,24 e 1.500,2458 diventa 1.500,25.'),
    h.esempio('avvocato con contributo alla cassa (errore 00422)', [
      'Compenso ' + euro(compenso) + ' pi&ugrave; il 4% di contributo integrativo alla cassa forense: ' + euro(cassa) + ', soggetto a IVA.',
      'Nel riepilogo al 22% l&rsquo;imponibile deve essere ' + euro(compenso) + ' + ' + euro(cassa) + ' = ' + euro(imponibileCassa) + ', e l&rsquo;imposta ' + euro(ivaCassa) + '.',
      'Se il riepilogo riporta solo ' + euro(compenso) + ', la differenza &egrave; di ' + euro(cassa) + ', ben oltre l&rsquo;euro di tolleranza.'
    ], 'Il contributo cassa indicato nei dati della cassa previdenziale fa parte dell&rsquo;imponibile della sua aliquota: se manca nel riepilogo, il file viene scartato con 00422.'),

    h.h2('iva', 'Aliquota e natura IVA: 00400, 00401, 00424, 00445'),
    h.p('Ogni riga ha un&rsquo;aliquota IVA. Quando l&rsquo;aliquota &egrave; zero serve anche la <strong>natura</strong>, cio&egrave; il codice che spiega perch&eacute; l&rsquo;IVA non c&rsquo;&egrave;.'),
    h.ul([
      '<strong>00400</strong>: una riga ha aliquota zero ma manca la natura. Chi &egrave; nel regime forfettario usa N2.2 (operazioni non soggette, altri casi).',
      '<strong>00401</strong>: il contrario, una riga con l&rsquo;IVA ha anche la natura.',
      '<strong>00424</strong>: l&rsquo;aliquota va scritta come percentuale, 22.00, non come 0.22.',
      '<strong>00445</strong>: dal 1&deg; gennaio 2021 non si possono pi&ugrave; usare i codici generici N2, N3 e N6: servono quelli di dettaglio (N2.1, N2.2, N3.1&hellip;, N6.1&hellip;).',
      '<strong>00419, 00443 e 00444</strong>: righe e riepilogo non corrispondono. Nel riepilogo ci deve essere un blocco per ogni aliquota (e per ogni natura) usata nelle righe, n&eacute; uno di pi&ugrave; n&eacute; uno di meno.'
    ]),

    h.h2('duplicati', 'Numero gi&agrave; usato: 00404'),
    h.p('Lo SdI scarta una fattura quando ne ha gi&agrave; ricevuta un&rsquo;altra, non scartata, con la stessa partita IVA del fornitore, lo stesso numero e la stessa data nell&rsquo;anno. Conta solo l&rsquo;anno della data: la numerazione pu&ograve; ripartire da 1 ogni anno. Per le note di credito (tipo documento TD04) il controllo guarda anche il tipo: una fattura e una nota di credito possono avere lo stesso numero nello stesso anno, due note di credito no.'),
    h.esempio('tre documenti con il numero 15 nello stesso anno', [
      'Fattura n. 15 del 10 marzo: consegnata.',
      'Nota di credito (TD04) n. 15 del 20 aprile: accettata, perch&eacute; &egrave; di un altro tipo e una delle due &egrave; una nota di credito.',
      'Fattura n. 15 del 3 maggio: scartata con 00404, perch&eacute; esiste gi&agrave; una fattura n. 15 dello stesso anno.'
    ], 'Se la prima fattura n. 15 fosse stata scartata, il numero sarebbe stato di nuovo libero: &egrave; per questo che la fattura corretta si pu&ograve; rimandare con lo stesso numero.'),
    h.p('Lo stesso controllo, dentro un unico file con pi&ugrave; fatture (un &laquo;lotto&raquo;), d&agrave; l&rsquo;errore 00409: due fatture con lo stesso numero nello stesso invio. In un lotto basta un errore perch&eacute; venga scartato tutto il file.'),

    h.h2('anagrafica', 'I dati del cliente e i tuoi: 00305, 00306, 00324, 00311'),
    h.p('Lo SdI controlla partite IVA e codici fiscali nell&rsquo;anagrafe tributaria. Non basta che siano scritti bene: devono esistere.'),
    h.ul([
      '<strong>00305</strong>: la partita IVA del cliente non risulta nell&rsquo;anagrafe tributaria. Quasi sempre &egrave; un errore di battitura; si controlla con il servizio &laquo;Verifica partita IVA&raquo; dell&rsquo;Agenzia.',
      '<strong>00306</strong>: il codice fiscale del cliente non &egrave; valido. Per un privato consumatore si indica solo il codice fiscale.',
      '<strong>00324</strong>: partita IVA e codice fiscale del cliente ci sono tutti e due ma non appartengono allo stesso soggetto, per esempio la partita IVA di una societ&agrave; con il codice fiscale personale del suo amministratore.',
      '<strong>00311 e 00312</strong>: il codice destinatario non esiste o non &egrave; attivo. Se il cliente non te ne ha dato uno, si usa 0000000 (sette zeri), con la sua PEC se la conosci; per i clienti esteri si usa XXXXXXX.',
      '<strong>La tua partita IVA</strong>: se alla data della fattura risulta cessata, lo SdI scarta il file. Capita a chi ha chiuso una partita IVA, ne ha aperta un&rsquo;altra e usa per sbaglio quella vecchia.'
    ]),

    h.h2('file', 'Nome del file, formato e data: 00001, 00002, 00200, 00403'),
    h.p('Il nome del file segue una regola fissa: <strong>IT</strong>, il codice fiscale o la partita IVA di chi trasmette il file, un trattino basso e un progressivo di al massimo cinque lettere o cifre. Per esempio IT01234567890_00001.xml, oppure IT01234567890_00001.xml.p7m se il file &egrave; firmato con la firma CAdES. Un nome che non rispetta la regola d&agrave; 00001; un nome gi&agrave; usato d&agrave; 00002.'),
    h.ul([
      '<strong>00200</strong>: il file non rispetta il formato. Un campo obbligatorio vuoto, una data scritta male, un importo con la virgola: nell&rsquo;XML i decimali si scrivono con il punto (1500.25) e le date come 2026-03-10. La descrizione nella ricevuta indica il campo esatto; oltre 50 errori di formato il codice diventa 00201.',
      '<strong>00403</strong>: la data della fattura &egrave; successiva al giorno in cui lo SdI la riceve. Non si possono mandare fatture datate nel futuro.',
      '<strong>00425</strong>: il numero della fattura deve contenere almeno una cifra: &laquo;A&raquo; non va bene, &laquo;A1&raquo; s&igrave;.',
      '<strong>00102</strong>: il file firmato &egrave; stato modificato dopo la firma, oppure la firma non &egrave; valida. Va rigenerato e firmato di nuovo.'
    ]),
    h.p('Il generatore XML del sito controlla prima dell&rsquo;invio gli errori pi&ugrave; frequenti: l&rsquo;ultima cifra della partita IVA, il formato dell&rsquo;aliquota, la natura sulle righe senza IVA, il riepilogo per aliquota e i numeri gi&agrave; usati con la stessa partita IVA nel tuo browser. Non pu&ograve; sapere se una partita IVA esiste o &egrave; cessata: quello lo verifica solo lo SdI.')
  ].join('\n');

  return {
    slug: 'fattura-elettronica-scartata',
    tema: 'partita-iva',
    titolo: 'Fattura elettronica scartata: i codici di errore SdI pi&ugrave; comuni e come correggerli',
    titoloBreve: 'Fattura elettronica scartata: codici di errore SdI',
    descrizione: 'Cosa vuol dire la ricevuta di scarto del Sistema di Interscambio, come si leggono i codici di errore (00404, 00423, 00421, 00400, 00305…) e come correggere e rimandare la fattura entro cinque giorni con lo stesso numero.',
    pubblicata: '2026-09-27',
    aggiornata: '2026-09-27',
    introduzione: 'Quando il Sistema di Interscambio scarta una fattura elettronica, nella ricevuta c&rsquo;&egrave; un codice di cinque cifre che dice che cosa non va. Questa guida spiega i codici che capitano pi&ugrave; spesso, con esempi di calcolo fatti con le regole ufficiali, e come rimandare la fattura senza perdere la data.',
    riassunto: [
      'Una fattura scartata non &egrave; emessa: va corretta e rimandata entro cinque giorni dalla notifica di scarto, preferibilmente con lo stesso numero e la stessa data.',
      'Gli scarti pi&ugrave; frequenti riguardano i conti (00421, 00422, 00423), la natura IVA (00400, 00445), il numero gi&agrave; usato (00404) e i dati del cliente (00305, 00311).',
      'Sui conti lo SdI tollera meno di un centesimo di differenza per riga e per imposta: ' + n2(unitario) + ' &times; 3 fa ' + euro(totaleRighe) + ', non ' + euro(100, 0) + '.'
    ],
    strumenti: [
      { href: '/fisco-professioni/generatore-xml-fatturapa/', testo: 'Generatore XML FatturaPA' },
      { href: '/fisco-professioni/fattura-elettronica/', testo: 'Fattura elettronica in PDF' }
    ],
    corpo,
    errori: [
      'Rimandare il file corretto con lo stesso nome: viene rifiutato con 00002.',
      'Fare una nota di credito per &laquo;annullare&raquo; una fattura scartata: non serve, perch&eacute; non &egrave; mai stata emessa.',
      'Arrotondare il prezzo unitario a due decimali quando il totale della riga &egrave; una cifra tonda.',
      'Calcolare l&rsquo;IVA riga per riga e scrivere nel riepilogo la somma arrotondata.',
      'Usare N2 invece di N2.2 sulle fatture del regime forfettario.',
      'Lasciar passare pi&ugrave; di cinque giorni dallo scarto senza rimandare la fattura.'
    ],
    faq: [
      { d: 'Una fattura scartata vale come emessa?', r: 'No. Il file scartato si considera non emesso. Va corretto e rimandato entro cinque giorni dalla notifica di scarto, preferibilmente con lo stesso numero e la stessa data.' },
      { d: 'Posso rimandarla con lo stesso numero?', r: 'S&igrave;, ed &egrave; la soluzione preferita dall&rsquo;Agenzia. Il controllo dei duplicati (00404) ignora le fatture scartate, quindi il numero risulta libero. Cambia per&ograve; il nome del file.' },
      { d: 'Sono passati pi&ugrave; di cinque giorni: cosa faccio?', r: 'Emetti una fattura con numero e data nuovi, collegata a quella scartata, oppure con una numerazione di rettifica come &laquo;1/R&raquo; in un registro sezionale, come indicato dalla circolare 13/E del 2018.' },
      { d: 'La fattura &egrave; stata consegnata ma contiene un errore: posso rimandarla?', r: 'No: una fattura consegnata &egrave; emessa. Si corregge con una nota di credito e, se serve, con una nuova fattura.' },
      { d: 'Cosa vuol dire &laquo;impossibilit&agrave; di recapito&raquo;?', r: 'Che i controlli sono passati ma la fattura non si &egrave; potuta consegnare. &Egrave; comunque emessa: il cliente la trova nella sua area riservata del sito dell&rsquo;Agenzia delle Entrate. Conviene avvisarlo.' }
    ],
    fonti: [
      { href: 'https://www.fatturapa.gov.it/export/documenti/fatturapa/v1.4/Elenco-Controlli-versione-2.0.pdf', testo: 'Elenco dei controlli effettuati sul file fattura del Sistema di Interscambio, versione 2.0', dopo: ' (31 gennaio 2025): codici di errore, regole e tolleranze.' },
      { href: 'https://www.fatturapa.gov.it/export/documenti/Specifiche-tecniche-relative-al-Sistema-di-Interscambio-versione-1.8.4.pdf', testo: 'Specifiche tecniche relative al Sistema di Interscambio, versione 1.8.4', dopo: ': nome del file, ricevute e notifiche.' },
      { href: 'https://www.agenziaentrate.gov.it/portale/documents/20143/297470/Circolare+n+13+del+02+luglio+2018_Circolare_13_02072018.pdf/da0b0db7-64eb-ac7b-c925-4fdbc776279d', testo: 'Agenzia delle Entrate, circolare n. 13/E del 2 luglio 2018', dopo: ', paragrafo 1.6: come rimandare una fattura scartata.' },
      { href: 'https://www.agenziaentrate.gov.it/portale/controlli-sdi-motivi-di-errore', testo: 'Agenzia delle Entrate, FAQ &laquo;Controlli SdI / Motivi di errore&raquo;', dopo: ': sconti e partita IVA cessata.' },
      'D.P.R. 26 ottobre 1972, n. 633, art. 21: contenuto e numerazione della fattura.',
      'D.Lgs. 5 agosto 2015, n. 127, art. 1: obbligo della fattura elettronica.'
    ]
  };
};
