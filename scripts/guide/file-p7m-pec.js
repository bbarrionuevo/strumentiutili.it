// Guida: file P7M, messaggi PEC, postacert.eml e daticert.xml.
// Dalle regole tecniche della PEC (D.M. 2 novembre 2005, AgID), dal D.P.R.
// 68/2005 (artt. 6 e 11) e dal CAD (artt. 45 e 48), letti su Normattiva; le
// false PEC dall'avviso della Polizia Postale. Il riconoscimento dei file con
// js/tipo-file.js, lo stesso motore di «Che file è?».
'use strict';

module.exports = function (ctx) {
  const { h } = ctx;
  const T = ctx.motori.tipoFile;
  const byte = (testo) => new Uint8Array(Buffer.from(testo, 'latin1'));
  const esame = (nome, testo) => T.riconosci(byte(testo), { nome });

  // tre allegati come arrivano da una webmail che non riconosce la PEC
  const allegato = esame('allegato', 'Received: from mx.pec.example\r\nFrom: "Per conto di: mario@pec.example" <posta-certificata@pec.example>\r\nSubject: POSTA CERTIFICATA: contratto\r\nMIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\nciao\r\n');
  const dati = esame('daticert.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<postacert tipo="posta-certificata" errore="nessuno"><intestazione></intestazione></postacert>');
  const pdfFinto = esame('fattura_cortesia.pdf', 'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff');

  const corpo = [
    h.h2('p7m', 'Che cos&rsquo;&egrave; un file P7M'),
    h.p('Un file che finisce in <strong>.p7m</strong> &egrave; un documento con <strong>firma digitale</strong> nel formato CAdES: una &laquo;busta&raquo; che contiene il documento originale (di solito un PDF, a volte un XML o un file Word), la firma e il certificato di chi ha firmato. Il nome dice che cosa c&rsquo;&egrave; dentro: <em>contratto.pdf.p7m</em> &egrave; un PDF firmato, <em>IT01234567890_00001.xml.p7m</em> una fattura elettronica firmata.'),
    h.p('Il computer e il telefono non lo aprono perch&eacute; guardano solo l&rsquo;ultima estensione, .p7m, e non sanno a quale programma darlo. Il documento dentro per&ograve; &egrave; intatto: basta tirarlo fuori dalla busta. Rinominare il file da .p7m a .pdf non serve: la busta resta, e il lettore PDF non la riconosce.'),
    h.h3('Come si apre'),
    h.ul([
      '<strong>Con lo strumento &laquo;Aprire un file P7M&raquo;</strong> del sito: estrae il documento nel browser, senza caricarlo su un server, e mostra chi ha firmato, quando e con quale certificato, come &egrave; scritto nel file.',
      '<strong>Con un programma di firma digitale</strong>, come quelli che i prestatori di firma (le aziende che rilasciano i dispositivi, sotto la vigilanza di AgID) mettono a disposizione: aprono il documento e verificano la firma.',
      '<strong>Un file .p7m.p7m</strong> &egrave; stato firmato due volte, una busta dentro l&rsquo;altra: succede quando firmano due persone una dopo l&rsquo;altra. Si aprono tutte le buste in fila, e le firme sono due.'
    ]),
    h.h3('Aprire non &egrave; verificare'),
    h.p('Estrarre il documento serve a leggerlo. <strong>Verificare</strong> la firma &egrave; un&rsquo;altra cosa: vuol dire controllare, con la crittografia, che il documento non sia stato modificato dopo la firma e che il certificato del firmatario fosse valido, non scaduto n&eacute; revocato, nel momento in cui ha firmato. Lo fanno i programmi di verifica, non un semplice lettore. E il valore legale sta nella busta: conserva il file .p7m, non solo il PDF estratto, che &egrave; una copia senza firma.'),
    h.p('Esiste anche la firma digitale <strong>PAdES</strong>, messa dentro il PDF: il file resta .pdf, si apre normalmente e il lettore mostra il pannello delle firme. Ha lo stesso valore della CAdES; cambia solo la confezione.'),

    h.h2('pec', 'Che cosa c&rsquo;&egrave; dentro un messaggio PEC'),
    h.p('La PEC, posta elettronica certificata, &egrave; una email con ricevute: il gestore del mittente e quello del destinatario rilasciano ricevute firmate che provano l&rsquo;invio e la consegna, con data e ora. Per il Codice dell&rsquo;amministrazione digitale la trasmissione con PEC <strong>equivale alla notificazione per mezzo della posta</strong>, salvo che la legge disponga diversamente, e data e ora di invio e ricezione sono opponibili ai terzi.'),
    h.p('Il messaggio che arriva al destinatario non &egrave; l&rsquo;email originale ma una <strong>busta di trasporto</strong>, creata e firmata dal gestore del mittente. Dentro ci sono file con nomi fissati dalle regole tecniche:'),
    h.tabella('I file di un messaggio PEC', ['File', 'Che cos&rsquo;&egrave;', 'Che cosa farne'], [
      ['postacert.eml', 'Il messaggio originale, immodificato, con testo e allegati', 'Aprilo con il programma di posta: gli allegati veri sono qui dentro'],
      ['daticert.xml', 'I dati di certificazione: mittente, destinatari, oggetto, data e ora, identificativo del messaggio', 'Non serve aprirlo; se vuoi, si legge con il browser'],
      ['smime.p7s', 'La firma del gestore sulla busta, che garantisce che niente &egrave; stato cambiato', 'Non si apre: serve al programma di posta per controllare la busta']
    ]),
    h.p('Quando la webmail o il programma di posta non gestiscono bene la PEC, questi file compaiono come allegati separati, a volte senza estensione. &laquo;Che file &egrave;?&raquo; li riconosce dal contenuto:'),
    h.tabella('Tre allegati di una PEC riconosciuti dal contenuto', ['Nome ricevuto', 'Che cos&rsquo;&egrave;', 'Nome giusto'], [
      ['allegato (senza estensione)', allegato.tipo.nome, allegato.nomeSuggerito],
      ['daticert.xml', dati.tipo.nome, dati.nomeSuggerito],
      ['fattura_cortesia.pdf', pdfFinto.tipo.nome, '<strong>non aprirlo</strong>']
    ]),
    h.p('L&rsquo;ultima riga &egrave; il motivo per cui conviene guardare dentro i file prima di aprirli: per lo strumento quel &laquo;PDF&raquo; &egrave; un programma, e l&rsquo;avviso &egrave; esplicito: &laquo;' + pdfFinto.avvisi[0] + '&raquo;'),

    h.h2('ricevute', 'Le ricevute: che cosa provano e quali conservare'),
    h.ul([
      '<strong>Ricevuta di accettazione:</strong> la rilascia il tuo gestore quando il messaggio parte. Contiene i dati di certificazione ed &egrave; la prova della spedizione.',
      '<strong>Ricevuta di avvenuta consegna:</strong> la rilascia il gestore del destinatario quando il messaggio entra nella sua casella, <em>indipendentemente dal fatto che lo legga</em>. &Egrave; la prova della consegna, con il momento esatto.',
      '<strong>Avviso di mancata consegna:</strong> il messaggio non &egrave; arrivato, per esempio perch&eacute; la casella &egrave; piena o l&rsquo;indirizzo non esiste. Se entro dodici ore il gestore del destinatario non ha risposto, il tuo gestore ti avvisa che la consegna potrebbe non riuscire.'
    ]),
    h.p('La ricevuta di consegna pu&ograve; essere <strong>completa</strong> (allega anche il messaggio originale con i suoi allegati), <strong>breve</strong> (allega un estratto) o <strong>sintetica</strong> (solo i dati di certificazione). La completa &egrave; la pi&ugrave; utile come prova, perch&eacute; mostra anche che cosa hai mandato; si sceglie nelle impostazioni della casella.'),
    h.p('Conserva il messaggio inviato e le ricevute come <strong>file</strong> (.eml), non solo stampati: la prova sta nella firma del gestore, che la stampa perde. Se le ricevute vanno perse, il gestore conserva per trenta mesi il registro dei messaggi, e quelle informazioni valgono verso i terzi.'),
    h.p('Mandare una PEC a un indirizzo email normale si pu&ograve;, ma la ricevuta di consegna non arriva: il gestore di una casella ordinaria non la rilascia. Per avere la prova della consegna servono due indirizzi PEC.'),

    h.h2('false-pec', 'PEC vere e PEC false'),
    h.p('La PEC certifica chi ha spedito il messaggio e quando, non che sia onesto. La Polizia Postale ha segnalato campagne di PEC spedite da aziende &laquo;fantasma&raquo;, con oggetto come &laquo;Emissione fattura&raquo; e un testo che imita quello delle fatture elettroniche vere (&laquo;vi trasmettiamo copia PDF di cortesia della fattura&raquo;). Aprire il finto PDF allegato pu&ograve; installare un virus o un ransomware, che rende inutilizzabili i file del computer.'),
    h.ul([
      'Se il mittente &egrave; sconosciuto, <strong>non aprire l&rsquo;allegato</strong>. Se &egrave; un&rsquo;azienda o una persona che conosci ma il file non te lo aspettavi, chiedi conferma per un&rsquo;altra via, per esempio al telefono.',
      'Controlla che cosa &egrave; davvero l&rsquo;allegato: &laquo;Che file &egrave;?&raquo; lo legge nel browser senza aprirlo n&eacute; eseguirlo.',
      'Proteggi la casella: una password lunga e diversa da quella degli altri account, e l&rsquo;accesso in due passaggi con un codice sul telefono, dove il gestore lo offre.',
      'Fai copie di sicurezza dei file e tieni aggiornato il sistema operativo: sono i consigli della Polizia Postale contro i ransomware.'
    ])
  ].join('\n');

  return {
    slug: 'file-p7m-pec-daticert',
    tema: 'documenti',
    titolo: 'File P7M, PEC e daticert.xml: che cosa sono e come si aprono',
    titoloBreve: 'File P7M, PEC e daticert: che cosa sono e come aprirli',
    descrizione: 'Che cosa c’è dentro un file .p7m e come si apre, che cosa sono postacert.eml, daticert.xml e smime.p7s nei messaggi PEC, quali ricevute conservare come prova e come riconoscere le false PEC.',
    pubblicata: '2026-09-27',
    aggiornata: '2026-09-27',
    introduzione: 'Un documento firmato che il computer non apre, una PEC piena di allegati dai nomi strani, una &laquo;fattura di cortesia&raquo; da un&rsquo;azienda sconosciuta. Questa guida spiega che cosa sono i file .p7m e i file della PEC, come si aprono, che cosa provano le ricevute e come non cadere nelle false PEC.',
    riassunto: [
      'Un file .p7m &egrave; un documento con firma digitale: dentro c&rsquo;&egrave; il file vero, che si estrae; il valore legale resta nella busta .p7m.',
      'In una PEC il messaggio originale &egrave; postacert.eml, i dati di invio e consegna sono in daticert.xml e smime.p7s &egrave; la firma del gestore.',
      'La PEC si considera consegnata quando entra nella casella del destinatario, anche se non la legge; ma una PEC pu&ograve; portare allegati truffa come una email qualsiasi.'
    ],
    strumenti: [
      { href: '/pdf/apri-file-p7m/', testo: 'Apri un file P7M' },
      { href: '/utilita-web/che-file-e/', testo: 'Che file &egrave;?' }
    ],
    corpo,
    errori: [
      'Conservare solo il PDF estratto e cancellare il file .p7m, che &egrave; quello con la firma.',
      'Pensare che aprire un .p7m voglia dire averne verificato la firma.',
      'Rinominare il file da .p7m a .pdf sperando che si apra.',
      'Stampare le ricevute PEC invece di salvarle come file.',
      'Aprire l&rsquo;allegato di una PEC solo perch&eacute; &egrave; una PEC.'
    ],
    faq: [
      { d: 'Il PDF estratto da un .p7m ha valore legale?', r: '&Egrave; una copia del documento senza la firma: va bene per leggerlo, stamparlo o inoltrarlo. Il valore legale &egrave; nel file .p7m, che va conservato.' },
      { d: 'Che differenza c&rsquo;&egrave; fra .p7m e .p7s?', r: 'Il .p7m contiene documento e firma insieme. Il .p7s contiene solo la firma: il documento firmato &egrave; un altro file, spedito insieme. Nella PEC, smime.p7s &egrave; la firma del gestore sulla busta.' },
      { d: 'Una PEC vale anche se il destinatario non la apre?', r: 'S&igrave;. Si considera consegnata quando &egrave; disponibile nella casella del destinatario, e la ricevuta di avvenuta consegna viene rilasciata in quel momento, indipendentemente dalla lettura.' },
      { d: 'Posso mandare una PEC a un indirizzo email normale?', r: 'Il messaggio parte e ricevi la ricevuta di accettazione, ma non quella di avvenuta consegna: per la prova della consegna servono due indirizzi PEC.' },
      { d: 'Ho perso le ricevute di una PEC: c&rsquo;&egrave; rimedio?', r: 'Il gestore conserva il registro dei messaggi per trenta mesi, e le informazioni del registro valgono verso i terzi. Chiedile al tuo gestore.' }
    ],
    fonti: [
      'D.Lgs. 7 marzo 2005, n. 82, art. 45: quando un documento trasmesso si considera spedito e consegnato.',
      'D.Lgs. 7 marzo 2005, n. 82, art. 48: la PEC equivale alla notificazione per posta.',
      'D.P.R. 11 febbraio 2005, n. 68, art. 6: ricevute di accettazione e di avvenuta consegna.',
      'D.P.R. 11 febbraio 2005, n. 68, art. 11: registro dei messaggi conservato per trenta mesi.',
      { href: 'https://www.agid.gov.it/sites/default/files/repository_files/leggi_decreti_direttive/pec_regole_tecniche_dm_2-nov-2005.pdf', testo: 'Regole tecniche della posta elettronica certificata (D.M. 2 novembre 2005)', dopo: ', AgID: busta di trasporto, postacert.eml, daticert.xml e tipi di ricevuta.' },
      { href: 'https://www.agid.gov.it/it/piattaforme/firma-elettronica-qualificata/ottenere-firma-elettronica', testo: 'AgID, &laquo;Ottenere la firma elettronica&raquo;', dopo: ': prestatori di firma e firma locale o remota.' },
      { href: 'https://www.commissariatodips.it/notizie/articolo/nuovo-fenomeno-di-spammingattenzione-agli-allegati-ricevuti-da-false-pec/index.html', testo: 'Polizia Postale, &laquo;Attenzione agli allegati ricevuti da false PEC&raquo;', dopo: '.' }
    ]
  };
};
