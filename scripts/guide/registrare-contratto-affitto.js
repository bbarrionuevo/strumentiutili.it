// Guida: registrare un contratto d'affitto (modello RLI), costi e sanzioni.
// Cifre da js/rli-imposte.js e js/rli-sanzioni.js con rli_parametri,
// locazioni e ravvedimento di data/regole-fiscali-2026.json.
'use strict';

module.exports = function (ctx) {
  const { h, euro, pct } = ctx;
  const P = ctx.regole.rli_parametri;
  const S = P.sanzioniRegistrazione;
  const C = ctx.regole.locazioni.regimeCedolareSecca;
  const RV = ctx.regole.ravvedimento;
  const imposte = (canone, tipo, extra) => ctx.motori.rli.calcola(Object.assign({ canone, tipo, pagine: 4, copie: 2 }, extra || {}), P);
  const ritardo = (imposta, pagamento, cedolare) => ctx.motori.rliSanzioni.calcola({
    imposta, cedolare: !!cedolare, stipula: '2026-03-02', pagamento,
    regole: S, tassi: RV.tassiStoriciLegali, tassoVigente: RV.tassoInteresseLegaleVigente
  });

  const canone = 9600;
  const l1 = imposte(canone, 'L1');
  const l2 = imposte(canone, 'L2');
  const basso = imposte(3000, 'L1');
  const venti = ritardo(l1.registro, '2026-04-21');
  const cento = ritardo(l1.registro, '2026-07-10');
  const ced = ritardo(0, '2026-04-21', true);
  const fr = (x) => '1/' + Math.round(1 / x);

  const corpo = [
    h.h2('chi', 'Chi deve registrare e entro quando'),
    h.p('Ogni contratto d&rsquo;affitto di un immobile va registrato all&rsquo;Agenzia delle Entrate, a meno che non duri in tutto 30 giorni o meno nell&rsquo;anno con lo stesso inquilino. L&rsquo;obbligo &egrave; di entrambe le parti: di solito se ne occupa il proprietario, ma se non lo fa ne risponde anche l&rsquo;inquilino, che pu&ograve; registrare il contratto da solo.'),
    h.p('Il termine &egrave; di <strong>' + P.giorniScadenzaRegistrazione + ' giorni</strong> dalla data di stipula o dalla data in cui il contratto comincia, se &egrave; precedente. Un contratto firmato il 2 marzo 2026 con decorrenza dal 1&deg; aprile va registrato entro il ' + ctx.data(venti.scadenza) + '. Per la legge un contratto d&rsquo;affitto che andava registrato e non lo &egrave; stato &egrave; nullo: registrarlo in ritardo, pagando le sanzioni ridotte, lo rimette in regola.'),
    h.p('Si registra con il <strong>modello RLI</strong>, online con i servizi dell&rsquo;Agenzia (con SPID, CIE o CNS) oppure in un ufficio dell&rsquo;Agenzia. Lo stesso modello serve anche dopo: per comunicare proroghe, cessioni, subentri e la fine anticipata del contratto. La ricevuta riporta il <strong>codice identificativo del contratto</strong>, 17 caratteri da conservare: serve per tutti i pagamenti degli anni successivi.'),

    h.h2('costi', 'Quanto costa: imposta di registro e bollo'),
    h.p('Senza cedolare secca si pagano due imposte:'),
    h.ul([
      '<strong>Imposta di registro:</strong> il ' + pct(P.codiciContratto.L1.aliquota) + ' del canone annuo, con un minimo di ' + euro(P.impostaRegistroMinima, 0) + ' per la prima annualit&agrave;. Per i contratti a canone concordato (codice L2 nel modello) si calcola sul ' + pct(P.codiciContratto.L2.moltiplicatoreImponibile) + ' del canone. Di norma la spesa si divide a met&agrave; fra proprietario e inquilino.',
      '<strong>Imposta di bollo:</strong> ' + euro(P.impostaBolloFoglio, 0) + ' ogni quattro facciate del contratto (o cento righe), per ogni copia. Un contratto di quattro pagine in due copie paga ' + euro(l1.bollo, 0) + '.'
    ]),
    h.tabella('Registrazione di un affitto da ' + euro(canone, 0) + ' l&rsquo;anno (4 pagine, 2 copie)', ['Tipo di contratto', 'Base', 'Registro', 'Bollo', 'Totale'], [
      ['Canone libero (L1)', euro(l1.base, 0), euro(l1.registro), euro(l1.bollo), euro(l1.registro + l1.bollo)],
      ['Canone concordato (L2)', euro(l2.base, 0), euro(l2.registro), euro(l2.bollo), euro(l2.registro + l2.bollo)],
      ['Con cedolare secca', '&ndash;', euro(0), euro(0), euro(0)]
    ]),
    h.esempio('un bilocale a ' + euro(canone / 12, 0) + ' al mese', [
      'Canone annuo: ' + euro(canone, 0) + '.',
      'Registro: ' + euro(canone, 0) + ' &times; ' + pct(P.codiciContratto.L1.aliquota) + ' = ' + euro(l1.registro) + ' (sopra il minimo di ' + euro(P.impostaRegistroMinima, 0) + ').',
      'Bollo: 1 foglio da quattro facciate &times; ' + euro(P.impostaBolloFoglio, 0) + ' &times; 2 copie = ' + euro(l1.bollo) + '.',
      'Se l&rsquo;affitto fosse di ' + euro(3000, 0) + ' l&rsquo;anno, il 2% sarebbe ' + euro(60, 0) + ': si paga comunque il minimo, ' + euro(basso.registro) + '.'
    ], 'Da pagare alla registrazione: ' + euro(l1.registro + l1.bollo) + ', di cui di solito met&agrave; a carico dell&rsquo;inquilino.'),
    h.p('Negli anni successivi si paga solo il registro sull&rsquo;annualit&agrave;, entro 30 giorni dalla ricorrenza, con il modello F24 ELIDE e il codice identificativo del contratto. Si pu&ograve; anche pagare l&rsquo;imposta per tutta la durata in una volta, con un piccolo sconto.'),
    h.tabella('I codici tributo per le locazioni (F24 ELIDE)', ['Codice', 'Quando si usa'], [
      ['1500', 'Prima registrazione'],
      ['1501', 'Annualit&agrave; successive'],
      ['1502', 'Cessione del contratto'],
      ['1503', 'Risoluzione anticipata (' + euro(P.impostaRegistroMinima, 0) + ' fissi)'],
      ['1504', 'Proroga'],
      ['1507 e 1509', 'Sanzione e interessi del ravvedimento']
    ]),

    h.h2('cedolare', 'La cedolare secca'),
    h.p('Il proprietario persona fisica che affitta un&rsquo;abitazione fuori da un&rsquo;attivit&agrave; d&rsquo;impresa pu&ograve; scegliere la cedolare secca: un&rsquo;imposta fissa sul canone che prende il posto dell&rsquo;IRPEF e delle addizionali su quel reddito, e che cancella registro e bollo sul contratto. L&rsquo;aliquota &egrave; il ' + pct(C.locazioneLungaLibera) + ' per il canone libero e il ' + pct(C.locazioneLungaConcordata) + ' per il canone concordato.'),
    h.esempio('lo stesso bilocale con la cedolare secca', [
      'Canone libero: ' + euro(canone, 0) + ' &times; ' + pct(C.locazioneLungaLibera) + ' = ' + euro(canone * C.locazioneLungaLibera) + ' di imposta all&rsquo;anno.',
      'Canone concordato: ' + euro(canone, 0) + ' &times; ' + pct(C.locazioneLungaConcordata) + ' = ' + euro(canone * C.locazioneLungaConcordata) + '.',
      'Niente registro e niente bollo: l&rsquo;inquilino non paga la sua met&agrave; delle imposte sul contratto.'
    ], 'Conviene quasi sempre a chi ha un reddito medio o alto; per capirlo sul tuo caso confronta le due strade con il calcolatore.'),
    h.p('La scelta si fa nel modello RLI, alla registrazione o all&rsquo;inizio di un&rsquo;annualit&agrave; successiva. Chi sceglie la cedolare rinuncia, per il periodo in cui la applica, agli aumenti del canone legati all&rsquo;inflazione (l&rsquo;aggiornamento ISTAT), e deve comunicarlo all&rsquo;inquilino con una raccomandata.'),

    h.h2('ritardo', 'Se registri in ritardo'),
    h.p('Dal 1&deg; settembre 2024 la sanzione per la registrazione tardiva &egrave; il ' + pct(S.entro30giorni.percentuale) + ' dell&rsquo;imposta dovuta, con un minimo di ' + euro(S.entro30giorni.minimo, 0) + ', se il ritardo non supera i 30 giorni; oltre, il ' + pct(S.oltre30giorni.percentuale) + ', con un minimo di ' + euro(S.oltre30giorni.minimo, 0) + '. Con il ravvedimento operoso, cio&egrave; mettendosi in regola da soli prima di un controllo, la sanzione si riduce: a ' + fr(S.ravvedimento[0].frazione) + ' entro 30 giorni dalla scadenza, a ' + fr(S.ravvedimento[1].frazione) + ' entro 90, a ' + fr(S.ravvedimento[2].frazione) + ' entro un anno, a ' + fr(S.ravvedimento[3].frazione) + ' oltre. Si aggiungono gli interessi al tasso legale sull&rsquo;imposta.'),
    h.tabella('Ritardo nella registrazione del bilocale (registro ' + euro(l1.registro) + ')', ['Situazione', 'Sanzione piena', 'Con ravvedimento', 'Interessi'], [
      [venti.giorniRitardo + ' giorni di ritardo', euro(venti.sanzionePiena), euro(venti.sanzione) + ' (' + fr(venti.frazione) + ')', euro(venti.interessi)],
      [cento.giorniRitardo + ' giorni di ritardo', euro(cento.sanzionePiena), euro(cento.sanzione) + ' (' + fr(cento.frazione) + ')', euro(cento.interessi)],
      [ced.giorniRitardo + ' giorni, con cedolare secca', euro(ced.sanzionePiena), euro(ced.sanzione) + ' (' + fr(ced.frazione) + ')', euro(0)]
    ]),
    h.p('Nel caso dei ' + venti.giorniRitardo + ' giorni la sanzione piena sarebbe ' + euro(l1.registro * S.entro30giorni.percentuale) + ' (il ' + pct(S.entro30giorni.percentuale) + ' di ' + euro(l1.registro) + '), ma scatta il minimo di ' + euro(S.entro30giorni.minimo, 0) + '; il ravvedimento la porta a ' + euro(venti.sanzione) + '. Con la cedolare secca l&rsquo;imposta di registro non c&rsquo;&egrave;, ma i minimi della sanzione restano: registrare tardi costa comunque.'),
    h.nota('Per le scadenze precedenti al 1&deg; settembre 2024 valgono le sanzioni della disciplina precedente. Il calcolatore del modello RLI lo segnala e non fa il conto: in quel caso verifica con i servizi dell&rsquo;Agenzia.'),

    h.h2('dopo', 'Proroga, disdetta e fine anticipata'),
    h.ul([
      '<strong>Proroga:</strong> si comunica con il modello RLI e, senza cedolare, si paga il registro sul periodo prorogato (codice 1504).',
      '<strong>Fine anticipata:</strong> entro 30 giorni si comunica la risoluzione con il modello RLI e, senza cedolare, si pagano ' + euro(P.impostaRegistroMinima, 0) + ' fissi (codice 1503). Con la cedolare basta la comunicazione.',
      '<strong>Cessione o subentro:</strong> se l&rsquo;inquilino cede il contratto a un&rsquo;altra persona, o un familiare subentra, va comunicato con il modello RLI.',
      '<strong>Canone concordato:</strong> oltre allo sconto sul registro dà diritto a una riduzione dell&rsquo;IMU sull&rsquo;immobile affittato, pagata al 75%. Lo spiega la <a href="/guide/imu-2026/" class="text-indigo-700 underline">guida all&rsquo;IMU</a>.'
    ])
  ].join('\n');

  return {
    slug: 'registrare-contratto-affitto',
    tema: 'casa',
    titolo: 'Registrare un contratto d&rsquo;affitto: modello RLI, costi, cedolare secca e sanzioni',
    titoloBreve: 'Registrare un contratto d’affitto: RLI, costi e sanzioni',
    descrizione: 'Come e entro quando registrare un contratto d’affitto con il modello RLI: imposta di registro, bollo, cedolare secca, codici tributo e sanzioni per il ritardo, con esempi.',
    pubblicata: '2026-09-26',
    aggiornata: '2026-09-26',
    introduzione: 'Un contratto d&rsquo;affitto non registrato espone proprietario e inquilino a sanzioni e lascia il contratto senza valore. Questa guida spiega chi deve registrarlo, entro quando, quanto costa con e senza cedolare secca e quanto si paga se ci si accorge tardi di non averlo fatto.',
    riassunto: [
      'Si registra entro ' + P.giorniScadenzaRegistrazione + ' giorni dalla stipula (o dalla decorrenza, se prima) con il modello RLI.',
      'Senza cedolare: registro al ' + pct(P.codiciContratto.L1.aliquota) + ' del canone annuo (minimo ' + euro(P.impostaRegistroMinima, 0) + ') e bollo; per ' + euro(canone, 0) + ' l&rsquo;anno sono ' + euro(l1.registro + l1.bollo) + '.',
      'In ritardo: sanzione del ' + pct(S.entro30giorni.percentuale) + ' o del ' + pct(S.oltre30giorni.percentuale) + ' con minimi di ' + euro(S.entro30giorni.minimo, 0) + ' e ' + euro(S.oltre30giorni.minimo, 0) + ', ridotta molto dal ravvedimento.'
    ],
    strumenti: [
      { href: '/cittadino-tasse/contratto-affitto-canone-concordato/', testo: 'Prepara il contratto sul modello ministeriale' },
      { href: '/cittadino-tasse/modello-rli/', testo: 'Compila il modello RLI' },
      { href: '/cittadino-tasse/imposta-registro-locazioni/', testo: 'Cedolare secca o registro?' }
    ],
    corpo,
    errori: [
      'Contare i 30 giorni dalla consegna delle chiavi: si contano dalla firma, o dall&rsquo;inizio del contratto se &egrave; precedente.',
      'Dimenticare le annualit&agrave; successive: senza cedolare il registro si paga ogni anno, entro 30 giorni dalla ricorrenza.',
      'Pagare l&rsquo;F24 ELIDE senza il codice identificativo del contratto: il pagamento non viene abbinato e risulta non fatto.',
      'Credere che con la cedolare secca non ci siano sanzioni per il ritardo: restano i minimi di ' + euro(S.entro30giorni.minimo, 0) + ' e ' + euro(S.oltre30giorni.minimo, 0) + '.',
      'Chiudere il contratto prima della scadenza senza comunicarlo: la risoluzione va comunicata con il modello RLI entro 30 giorni.'
    ],
    faq: [
      { d: 'Chi paga l&rsquo;imposta di registro, il proprietario o l&rsquo;inquilino?', r: 'Per legge ne rispondono entrambi; salvo patti diversi la spesa si divide a met&agrave;. Di solito paga il proprietario e chiede all&rsquo;inquilino la sua parte.' },
      { d: 'Posso registrare il contratto da solo online?', r: 'S&igrave;: con SPID, CIE o CNS si compila il modello RLI sul sito dell&rsquo;Agenzia delle Entrate e si paga con addebito sul conto. In alternativa ci si rivolge a un ufficio dell&rsquo;Agenzia o a un intermediario.' },
      { d: 'Con la cedolare secca devo pagare qualcosa alla registrazione?', r: 'No: niente imposta di registro e niente bollo. La cedolare si paga poi con le imposte sui redditi, in acconto e saldo.' },
      { d: 'Quanto costa chiudere il contratto prima della scadenza?', r: 'Senza cedolare ' + P.impostaRegistroMinima + ' euro fissi di registro, con il codice 1503, pi&ugrave; la comunicazione con il modello RLI entro 30 giorni. Con la cedolare basta la comunicazione.' },
      { d: 'Ho registrato in ritardo: devo pagare la sanzione anche se l&rsquo;inquilino &egrave; d&rsquo;accordo?', r: 'S&igrave;: la sanzione &egrave; dovuta all&rsquo;Agenzia, non all&rsquo;altra parte. Con il ravvedimento operoso si riduce, tanto di pi&ugrave; quanto prima si rimedia.' }
    ],
    fonti: [
      'D.P.R. 26 aprile 1986, n. 131: testo unico dell&rsquo;imposta di registro.',
      'D.Lgs. 14 marzo 2011, n. 23, art. 3: cedolare secca.',
      'Legge 9 dicembre 1998, n. 431: contratti di locazione abitativa e canone concordato.',
      'Legge 27 luglio 1978, n. 392, art. 8: spese di registrazione divise fra le parti.',
      'Legge 30 dicembre 2004, n. 311, art. 1, comma 346: nullit&agrave; dei contratti non registrati.',
      'D.Lgs. 14 giugno 2024, n. 87: nuove sanzioni dal 1&deg; settembre 2024.',
      'D.Lgs. 18 dicembre 1997, n. 472, art. 13: ravvedimento operoso.',
      'Dal 1&deg; gennaio 2027 il ravvedimento &egrave; regolato dal testo unico delle sanzioni tributarie, <a href="https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2024-11-05;173:1~art14" class="text-indigo-700 underline" target="_blank" rel="noopener">D.Lgs. 5 novembre 2024, n. 173, allegato, art. 14</a>, con le stesse riduzioni.',
      'Modello RLI e istruzioni, Agenzia delle Entrate.'
    ]
  };
};
