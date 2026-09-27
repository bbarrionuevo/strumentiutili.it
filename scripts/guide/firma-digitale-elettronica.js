// Guida: firma digitale, elettronica avanzata, semplice e disegnata; quando
// vale che cosa.
// Dal CAD (artt. 20, 21, 22 e 65, letti su Normattiva), dal regolamento eIDAS
// e dall'analisi comparativa di AgID «Firme e sigilli elettronici» (2019).
'use strict';

module.exports = function (ctx) {
  const { h } = ctx;

  const corpo = [
    h.h2('tipi', 'Le firme elettroniche previste dalla legge'),
    h.p('&laquo;Firma elettronica&raquo; non &egrave; una cosa sola. Il regolamento europeo eIDAS e il Codice dell&rsquo;amministrazione digitale (CAD) ne distinguono diversi tipi, che si differenziano per quanto &egrave; difficile negarli: pi&ugrave; la firma &egrave; sicura, pi&ugrave; &egrave; difficile, per chi l&rsquo;ha apposta, sostenere di non averlo fatto.'),
    h.tabella('I tipi di firma elettronica e il loro valore', ['Tipo', 'Esempi', 'Che valore ha'], [
      ['Firma elettronica &laquo;semplice&raquo;', 'il nome in fondo a una email, l&rsquo;immagine della firma incollata su un PDF, la casella &laquo;accetto&raquo;', 'forma scritta e valore di prova <strong>valutati dal giudice</strong> caso per caso, secondo sicurezza, integrit&agrave; e immodificabilit&agrave;'],
      ['Firma elettronica avanzata (FEA)', 'la firma su tablet allo sportello di banca, posta o ospedale (firma grafometrica)', 'forma scritta ed efficacia della scrittura privata (art. 2702 del codice civile), ma solo nei rapporti con chi mette a disposizione la soluzione'],
      ['Firma elettronica qualificata o firma digitale', 'smart card, chiavetta USB, firma remota con codice OTP', 'equivale alla firma autografa; si presume del titolare, che per negarla deve provare il contrario'],
      ['Firma con identificazione informatica (art. 20 CAD)', 'un documento firmato dopo l&rsquo;accesso con un&rsquo;identit&agrave; digitale, con un processo che rispetta i requisiti di AgID', 'forma scritta ed efficacia della scrittura privata']
    ]),
    h.p('In Italia &laquo;firma elettronica qualificata&raquo; e &laquo;firma digitale&raquo; sono praticamente sinonimi: la firma digitale &egrave; la forma di firma qualificata basata su una coppia di chiavi crittografiche, una privata per firmare e una pubblica per verificare. Si ottiene da un <strong>prestatore di servizi fiduciari qualificato</strong>, cio&egrave; una delle aziende o degli enti che rilasciano i certificati sotto la vigilanza di AgID.'),

    h.h2('valore', 'Che cosa cambia in pratica: la prova'),
    h.p('La differenza fra i tipi di firma si vede quando qualcuno contesta. Con la <strong>firma digitale</strong> la legge presume che l&rsquo;abbia usata il titolare: chi vuole negarla deve dimostrare, per esempio, che gli hanno rubato il dispositivo e i codici. Con la <strong>firma avanzata</strong> tocca invece a chi vuole usare il documento dimostrare che la soluzione rispettava le regole tecniche. Con la <strong>firma semplice</strong> decide il giudice, guardando quanto il documento &egrave; sicuro e non modificabile.'),
    h.esempio('lo stesso accordo firmato in tre modi', [
      'Firmato con firma digitale in formato PAdES: se una parte nega di averlo firmato, deve essere lei a provarlo.',
      'Firmato a mano, scansionato e mandato in PDF: &egrave; una copia per immagine di un documento di carta. Se &egrave; fatta secondo le linee guida AgID ha lo stesso valore di prova dell&rsquo;originale finch&eacute; nessuno ne contesta espressamente la conformit&agrave;; conviene quindi conservare l&rsquo;originale di carta.',
      'Con l&rsquo;immagine della firma incollata sul PDF: &egrave; una firma elettronica semplice, e in caso di lite il giudice la valuta liberamente.'
    ], 'Per un accordo fra persone che si fidano bastano spesso tutti e tre; se il rischio di contestazione &egrave; alto, conviene la firma digitale. &Egrave; lo stesso criterio che suggerisce AgID: partire dal rischio di disconoscimento.'),

    h.h2('quando-serve', 'Quando la firma digitale &egrave; obbligatoria'),
    h.p('Per molti contratti la legge non chiede una forma particolare, e le parti possono firmare come credono. Ci sono per&ograve; atti per cui la forma &egrave; obbligatoria, e se sono fatti con un documento informatico la firma sbagliata li rende <strong>nulli</strong>:'),
    h.ul([
      '<strong>Gli atti dei numeri da 1 a 12 dell&rsquo;articolo 1350 del codice civile</strong>, fra cui i contratti che trasferiscono la propriet&agrave; di un immobile o costituiscono diritti reali su immobili: se sono scritture private informatiche vanno firmati con firma qualificata o digitale, salvo che la firma sia autenticata.',
      '<strong>Gli altri atti che per legge richiedono la forma scritta</strong> (numero 13 dello stesso articolo): basta anche la firma avanzata, o la firma con identificazione informatica prevista dall&rsquo;art. 20 del CAD.',
      '<strong>Gli atti pubblici informatici</strong>, come quelli notarili: il pubblico ufficiale firma con firma qualificata o digitale.'
    ]),
    h.p('Poi ci sono i casi in cui a chiedere la firma digitale &egrave; la procedura: i depositi del processo telematico, molte gare e alcuni bandi pubblici. Le regole le trovi nel bando o nelle istruzioni della procedura.'),

    h.h2('pa', 'Istanze alla pubblica amministrazione'),
    h.p('Per le domande e le dichiarazioni mandate online a un ufficio pubblico il CAD &egrave; pi&ugrave; largo. Sono valide se:'),
    h.ol([
      'sono firmate con una delle firme dell&rsquo;art. 20: digitale, qualificata, avanzata o con identificazione informatica;',
      'oppure chi le presenta si &egrave; identificato con SPID, carta d&rsquo;identit&agrave; elettronica o carta nazionale dei servizi, per esempio compilando il modulo sul portale dell&rsquo;ente;',
      'oppure sono <strong>firmate a mano e mandate con la copia del documento d&rsquo;identit&agrave;</strong>;',
      'oppure sono mandate dal proprio domicilio digitale o dal proprio indirizzo PEC.'
    ]),
    h.p('Il terzo caso &egrave; quello in cui basta la firma disegnata o scansionata: il documento d&rsquo;identit&agrave; allegato completa l&rsquo;identificazione. Restano salve le regole speciali del fisco, dove si usano i canali telematici dell&rsquo;Agenzia delle Entrate.'),

    h.h2('disegnata', 'La firma disegnata sul PDF'),
    h.p('Lo strumento &laquo;Firma PDF&raquo; del sito sovrappone al documento l&rsquo;immagine della firma che disegni con il dito o con il mouse, nel browser e senza caricare il file. &Egrave; una <strong>firma elettronica semplice</strong>: senza certificati n&eacute; crittografia. Va bene per moduli, liberatorie, deleghe, iscrizioni e accordi privati, cio&egrave; dove chi riceve il documento la accetta; non sostituisce la firma digitale dove &egrave; richiesta.'),
    h.ul([
      '<strong>PDF gi&agrave; firmati digitalmente:</strong> aggiungere un&rsquo;immagine modifica il file e rende non valida la firma digitale esistente. Se servono tutte e due, prima la firma disegnata, per ultima quella digitale.',
      '<strong>Sigla su ogni pagina e firma per esteso sull&rsquo;ultima:</strong> si fa in due passaggi, la sigla su tutte le pagine e poi la firma solo sull&rsquo;ultima.',
      '<strong>Conserva l&rsquo;originale:</strong> lo strumento scarica una copia con il suffisso &laquo;-firmato&raquo; e lascia intatto il file di partenza.'
    ]),

    h.h2('ottenere', 'Come si ottiene e come si verifica una firma digitale'),
    h.p('La firma digitale si chiede a un prestatore di servizi fiduciari qualificato; AgID pubblica l&rsquo;elenco di quelli attivi in Italia. Si pu&ograve; usare in due modi: <strong>in locale</strong>, con una smart card o una chiavetta USB che tieni tu, oppure <strong>da remoto</strong>, con nome utente, password e un codice OTP sul telefono, mentre la chiave resta custodita dal prestatore in un dispositivo sicuro. Il valore &egrave; lo stesso.'),
    h.p('Il file firmato esce in due formati: <strong>CAdES</strong>, un file .p7m che contiene documento e firma, oppure <strong>PAdES</strong>, un PDF normale con la firma dentro. Per verificare una firma servono i programmi di verifica dei prestatori o i servizi di validazione: controllano che il documento non sia cambiato dopo la firma e che il certificato fosse valido in quel momento. Per leggere il contenuto di un .p7m basta invece estrarlo, anche con lo strumento del sito.')
  ].join('\n');

  return {
    slug: 'firma-digitale-elettronica-differenze',
    tema: 'documenti',
    titolo: 'Firma digitale, elettronica o disegnata: le differenze e quando vale',
    titoloBreve: 'Firma digitale, elettronica o disegnata: le differenze',
    descrizione: 'Che differenza c’è fra firma digitale, firma elettronica avanzata, firma semplice e firma disegnata su un PDF, quanto vale ciascuna come prova, quando la firma digitale è obbligatoria e come si firma una domanda alla pubblica amministrazione.',
    pubblicata: '2026-09-27',
    aggiornata: '2026-09-27',
    introduzione: 'Una firma disegnata su un PDF, una firma su tablet allo sportello e una firma digitale con la chiavetta non hanno lo stesso valore. Questa guida spiega i tipi di firma elettronica previsti dalla legge, che cosa cambia se qualcuno contesta, quando la firma digitale &egrave; obbligatoria e quando basta firmare a mano e allegare un documento.',
    riassunto: [
      'La firma digitale equivale a quella autografa e si presume del titolare; la firma disegnata su un PDF &egrave; una firma semplice, che il giudice valuta caso per caso.',
      'I contratti sugli immobili fatti con documento informatico vanno firmati con firma qualificata o digitale, altrimenti sono nulli.',
      'Per le domande alla pubblica amministrazione basta anche la firma a mano con la copia del documento d&rsquo;identit&agrave;, oppure l&rsquo;accesso con SPID o CIE.'
    ],
    strumenti: [
      { href: '/pdf/firma/', testo: 'Firma un PDF' },
      { href: '/pdf/apri-file-p7m/', testo: 'Apri un file P7M' }
    ],
    corpo,
    errori: [
      'Aggiungere una firma disegnata a un PDF gi&agrave; firmato digitalmente: la firma digitale non &egrave; pi&ugrave; valida.',
      'Usare la firma disegnata per un atto che richiede la firma digitale, come un contratto immobiliare informatico.',
      'Buttare l&rsquo;originale di carta dopo averlo scansionato: se la copia viene contestata, serve l&rsquo;originale.',
      'Confondere l&rsquo;apertura di un file .p7m con la verifica della firma.',
      'Mandare a un ufficio pubblico una domanda firmata a mano senza la copia del documento d&rsquo;identit&agrave;.'
    ],
    faq: [
      { d: 'La firma disegnata su un PDF ha valore legale?', r: '&Egrave; una firma elettronica semplice: ha valore, ma se viene contestata il giudice la valuta liberamente, guardando sicurezza, integrit&agrave; e immodificabilit&agrave; del documento. Non vale dove la legge chiede la firma digitale.' },
      { d: 'Firma digitale e firma elettronica qualificata sono la stessa cosa?', r: 'In pratica s&igrave;: la firma digitale &egrave; il tipo di firma qualificata basato su chiavi crittografiche, e in Italia i due termini si usano come sinonimi.' },
      { d: 'Posso firmare a mano, scansionare e mandare?', r: 'S&igrave;: la scansione &egrave; una copia per immagine del documento di carta e, se fatta secondo le linee guida AgID, ha lo stesso valore di prova dell&rsquo;originale finch&eacute; nessuno ne contesta la conformit&agrave;. Tieni l&rsquo;originale; per le domande alla pubblica amministrazione allega la copia del documento d&rsquo;identit&agrave;.' },
      { d: 'Che differenza c&rsquo;&egrave; fra CAdES e PAdES?', r: '&Egrave; solo il formato del file: CAdES produce un .p7m che contiene documento e firma, PAdES un PDF con la firma dentro. Il valore legale &egrave; lo stesso.' },
      { d: 'La firma su tablet in banca &egrave; una firma digitale?', r: 'No: di solito &egrave; una firma elettronica avanzata (grafometrica). Ha l&rsquo;efficacia della scrittura privata, ma vale solo nei rapporti fra te e chi ti ha fatto firmare.' }
    ],
    fonti: [
      'Regolamento UE n. 910/2014 (eIDAS), articoli 3, 25 e 26: definizioni ed effetti giuridici delle firme elettroniche.',
      'D.Lgs. 7 marzo 2005, n. 82, art. 20: forma scritta ed efficacia di prova dei documenti informatici.',
      'D.Lgs. 7 marzo 2005, n. 82, art. 21: atti che richiedono la firma qualificata o digitale a pena di nullit&agrave;.',
      'D.Lgs. 7 marzo 2005, n. 82, art. 22: copie per immagine di documenti di carta.',
      'D.Lgs. 7 marzo 2005, n. 82, art. 65: istanze e dichiarazioni alla pubblica amministrazione.',
      'Codice civile, art. 1350: atti che devono farsi per iscritto.',
      'Codice civile, art. 2702: efficacia della scrittura privata.',
      { href: 'https://www.agid.gov.it/sites/default/files/repository_files/tipologie_di_firme_e_sigilli_elettronici_v1_dicembre_2019.pdf', testo: 'AgID, &laquo;Firme e sigilli elettronici: analisi comparativa&raquo;', dopo: ' (dicembre 2019).' },
      { href: 'https://www.agid.gov.it/it/piattaforme/firma-elettronica-qualificata/ottenere-firma-elettronica', testo: 'AgID, &laquo;Ottenere la firma elettronica&raquo;', dopo: '.' }
    ]
  };
};
