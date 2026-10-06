// Guida: IMU 2026, chi paga, come si calcola, acconto, saldo e codici F24.
// Cifre da js/imu.js (IMUCalculator.calcolaIMU) con imu di
// data/regole-fiscali-2026.json.
'use strict';

module.exports = function (ctx) {
  const { h, euro, num } = ctx;
  const I = ctx.regole.imu;
  const imu = (dati) => ctx.motori.imu.calcola(Object.assign({ quota: 100, mesi: 12 }, dati), I);

  const seconda = imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6 });
  const comodato = imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6, isComodato: true });
  const concordato = imu({ rendita: 700, categoria: 'A/3', aliquota: 10.6, isConcordato: true });
  const eredita = imu({ rendita: 900, categoria: 'A/2', aliquota: 10.6, quota: 50, mesi: 6 });
  const capannone = imu({ rendita: 4000, categoria: 'D/7', aliquota: 10.6 });
  const box = imu({ rendita: 120, categoria: 'C/6', aliquota: 10.6 });
  const M = I.moltiplicatori;

  const corpo = [
    h.h2('chi-paga', 'Chi paga l&rsquo;IMU e chi no'),
    h.p('L&rsquo;IMU &egrave; l&rsquo;imposta comunale sugli immobili. La paga chi ne &egrave; proprietario o ha su di essi un diritto reale: usufrutto, uso, abitazione, superficie. Se una casa &egrave; in usufrutto paga l&rsquo;usufruttuario, non il nudo proprietario. Non la paga l&rsquo;inquilino, e nemmeno chi ha la casa in comodato: paga sempre il proprietario, anche quando non la usa.'),
    h.p('Non si paga sull&rsquo;<strong>abitazione principale</strong>, cio&egrave; la casa in cui si ha la residenza e si vive abitualmente, n&eacute; sulle sue pertinenze, al massimo una per ciascuna categoria C/2 (cantina o soffitta), C/6 (box o posto auto) e C/7 (tettoia). Fanno eccezione le abitazioni di lusso, nelle categorie A/1, A/8 e A/9, che pagano con un&rsquo;aliquota ridotta e una detrazione di 200 &euro; l&rsquo;anno. La casa familiare assegnata dal giudice al genitore affidatario dei figli &egrave; trattata come abitazione principale di chi la riceve.'),
    h.p('Pagano quindi soprattutto le seconde case, le case ereditate o sfitte, quelle date in affitto o in comodato, i negozi, gli uffici, i capannoni, i box che non sono pertinenza della prima casa, i terreni e le aree edificabili.'),

    h.h2('calcolo', 'Come si calcola'),
    h.p('Il calcolo parte dalla rendita catastale, che si legge nella visura catastale, e segue sempre gli stessi passaggi:'),
    h.ol([
      'rendita catastale &times; 1,05 (la rivalutazione del 5%);',
      'il risultato &times; il <strong>coefficiente</strong> della categoria catastale: &egrave; la <strong>base imponibile</strong>;',
      'base imponibile &times; l&rsquo;<strong>aliquota</strong> decisa dal Comune &times; la tua quota di possesso &times; i mesi di possesso diviso 12;',
      'si tolgono le eventuali riduzioni e si arrotonda all&rsquo;euro.'
    ]),
    h.tabella('I coefficienti per categoria catastale', ['Categoria', 'Coefficiente'], [
      ['Abitazioni (gruppo A, tranne A/10) e pertinenze C/2, C/6, C/7', num(M.A)],
      ['Gruppo B e categorie C/3, C/4, C/5', num(M.B)],
      ['Uffici A/10 e D/5 (banche, assicurazioni)', num(M['A/10'])],
      ['Gruppo D, tranne D/5 (capannoni, alberghi, centri commerciali)', num(M.D)],
      ['Negozi C/1', num(M['C/1'])],
      ['Terreni agricoli (sul reddito dominicale rivalutato del 25%)', num(M.TERRENO)]
    ]),
    h.p('L&rsquo;aliquota la decide ogni Comune entro i limiti della legge: per gli immobili diversi dall&rsquo;abitazione principale la base &egrave; lo 0,86% (8,6 per mille), che il Comune pu&ograve; alzare fino all&rsquo;1,06% o abbassare; per le abitazioni principali di lusso la base &egrave; lo 0,5%. Le aliquote di ogni Comune sono pubblicate nel prospetto delle aliquote del Dipartimento delle Finanze: &egrave; il documento che fa fede, pi&ugrave; della delibera letta sul giornale locale.'),
    h.esempio('seconda casa A/2 con rendita di 900 &euro;, aliquota del 10,6 per mille', [
      'Rendita rivalutata: 900 &times; 1,05 = ' + euro(seconda.renditaRivalutata) + '.',
      'Base imponibile: ' + euro(seconda.renditaRivalutata) + ' &times; ' + M.A + ' = ' + euro(seconda.baseImponibile) + '.',
      'Imposta: ' + euro(seconda.baseImponibile) + ' &times; 10,6&permil; = ' + euro(seconda.impostaLorda) + ', arrotondata a ' + euro(seconda.impostaAnnua, 0) + '.'
    ], 'IMU annua ' + euro(seconda.impostaAnnua, 0) + ': acconto di ' + euro(seconda.acconto, 0) + ' a giugno e saldo di ' + euro(seconda.saldo, 0) + ' a dicembre, codice tributo ' + seconda.codiceTributo + '.'),

    h.h2('riduzioni', 'Le riduzioni: comodato, canone concordato, immobili inagibili'),
    h.ul([
      '<strong>Casa in comodato a un figlio o a un genitore</strong> che ci abita: base imponibile ridotta del 50%. Servono un contratto di comodato registrato e che il proprietario possieda in Italia una sola abitazione, oppure quella e la propria abitazione principale nello stesso Comune, dove deve anche risiedere e vivere (comma 747). La riduzione non vale per le abitazioni di lusso.',
      '<strong>Casa affittata a canone concordato</strong>: l&rsquo;imposta calcolata con l&rsquo;aliquota del Comune si paga al 75%.',
      '<strong>Immobili storici o dichiarati inagibili</strong>: base imponibile ridotta del 50%.'
    ]),
    h.tabella('La stessa aliquota del 10,6 per mille su casi diversi', ['Caso', 'Imposta annua', 'Acconto', 'Saldo'], [
      ['Seconda casa A/2, rendita 900 &euro;', euro(seconda.impostaAnnua, 0), euro(seconda.acconto, 0), euro(seconda.saldo, 0)],
      ['La stessa, in comodato al figlio', euro(comodato.impostaAnnua, 0), euro(comodato.acconto, 0), euro(comodato.saldo, 0)],
      ['A/3 a canone concordato, rendita 700 &euro;', euro(concordato.impostaAnnua, 0), euro(concordato.acconto, 0), euro(concordato.saldo, 0)],
      ['Box C/6 non pertinenziale, rendita 120 &euro;', euro(box.impostaAnnua, 0), euro(box.acconto, 0), euro(box.saldo, 0)]
    ]),
    h.p('Il comodato dimezza l&rsquo;imposta solo se tutte le condizioni sono rispettate e il contratto &egrave; registrato: il <a href="/cittadino-tasse/modello-rap/" class="text-indigo-700 underline">modello RAP</a> serve proprio a questo. Senza registrazione la riduzione non spetta, e il Comune la pu&ograve; togliere in un controllo con sanzioni e interessi.'),
    h.p('La dichiarazione IMU va presentata entro il 30 giugno dell&rsquo;anno dopo quello in cui il possesso &egrave; cominciato o sono cambiati dati che contano per l&rsquo;imposta: lo prevede il comma 768-bis, scritto dal D.Lgs. 147/2026 al posto dei commi 769 e 770. Per un immobile inagibile, la perizia si allega alla dichiarazione.'),

    h.h2('mesi', 'Quote, mesi e case ereditate'),
    h.p('Se l&rsquo;immobile &egrave; di pi&ugrave; persone, ciascuno paga sulla propria quota. Se l&rsquo;hai posseduto solo per una parte dell&rsquo;anno contano i mesi: un mese vale intero se lo hai posseduto per pi&ugrave; della met&agrave; dei giorni, e il giorno del rogito &egrave; attribuito a chi compra. Per le case ereditate il possesso comincia dalla data della morte, non da quella della dichiarazione di successione.'),
    h.esempio('met&agrave; di una casa ereditata il 10 luglio', [
      'Luglio: posseduto per 22 giorni su 31, pi&ugrave; della met&agrave;, quindi conta. Da luglio a dicembre sono 6 mesi.',
      'Imposta intera: ' + euro(seconda.impostaLorda) + ' &times; 50% &times; 6/12 = ' + euro(eredita.impostaLorda) + '.'
    ], 'Ogni erede paga ' + euro(eredita.impostaAnnua, 0) + ' per il primo anno, tutti con il saldo di dicembre: l&rsquo;acconto di giugno &egrave; l&rsquo;imposta del primo semestre, quando la casa non era ancora sua (comma 762).'),

    h.h2('capannoni', 'Capannoni e altri immobili del gruppo D'),
    h.p('Per gli immobili del gruppo D l&rsquo;imposta si divide fra Stato e Comune: lo 0,76% va sempre allo Stato, con il codice tributo 3925; la parte che supera lo 0,76%, fino all&rsquo;aliquota del Comune, va al Comune con il codice 3930.'),
    h.esempio('capannone D/7 con rendita di 4.000 &euro;, aliquota del 10,6 per mille', [
      'Base imponibile: 4.000 &times; 1,05 &times; ' + M.D + ' = ' + euro(capannone.baseImponibile) + '.',
      'Imposta: ' + euro(capannone.baseImponibile) + ' &times; 10,6&permil; = ' + euro(capannone.impostaLorda) + ', arrotondata a ' + euro(capannone.impostaAnnua, 0) + '.',
      capannone.ripartizione.map((r) => r.ente + ': ' + euro(r.importo, 0) + ' con il codice ' + r.codice).join('; ') + '.'
    ], 'Due righe nell&rsquo;F24, una per lo Stato e una per il Comune, sia in acconto sia a saldo.'),

    h.h2('pagare', 'Scadenze e come si paga'),
    h.ul([
      '<strong>Acconto entro il 16 giugno:</strong> l&rsquo;imposta del primo semestre, calcolata con l&rsquo;aliquota e la detrazione dell&rsquo;anno precedente: la met&agrave; dell&rsquo;imposta, se possiedi l&rsquo;immobile tutto l&rsquo;anno (comma 762).',
      '<strong>Saldo entro il 16 dicembre:</strong> il conguaglio, con le aliquote dell&rsquo;anno pubblicate dal Comune sul sito del Dipartimento delle Finanze entro il 28 ottobre; se non le ha pubblicate, valgono quelle dell&rsquo;anno prima (comma 767).',
      '<strong>In un&rsquo;unica rata:</strong> si pu&ograve; pagare tutto entro il 16 giugno.',
      'Se una scadenza cade di sabato o in un giorno festivo, slitta al primo giorno lavorativo successivo, come per tutti i versamenti fiscali (D.L. 70/2011, art. 7).'
    ]),
    h.p('Si paga con il modello F24, anche semplificato, nella sezione dei tributi locali: codice tributo, codice catastale del Comune (quattro caratteri, per esempio H501 per Roma), anno di riferimento, numero di immobili e importo arrotondato all&rsquo;euro, come tutti i tributi locali (L. 296/2006, art. 1, comma 166). Se hai immobili in pi&ugrave; Comuni serve una riga per ogni Comune. Sotto un importo minimo fissato da ogni Comune il versamento non &egrave; dovuto (comma 168 della stessa legge): lo trovi nel regolamento IMU del Comune.'),
    h.tabella('I codici tributo IMU per l&rsquo;F24', ['Codice', 'Per che cosa'], [
      ['3912', 'Abitazione principale di lusso (A/1, A/8, A/9) e pertinenze'],
      [I.codiciTributo.TERRENO, 'Terreni'],
      ['3916', 'Aree fabbricabili'],
      [I.codiciTributo.ALTRI_FABBRICATI, 'Altri fabbricati: seconde case, negozi, uffici, box'],
      [I.codiciTributo.FABBRICATO_D, 'Immobili del gruppo D, quota dello Stato'],
      [I.codiciTributo.FABBRICATO_D_COMUNE, 'Immobili del gruppo D, quota in pi&ugrave; del Comune']
    ]),
    h.p('Se hai saltato una rata o hai pagato meno del dovuto, puoi rimediare con il ravvedimento operoso: si versano l&rsquo;imposta, una sanzione ridotta e gli interessi, con i codici tributo dell&rsquo;IMU e barrando la casella del ravvedimento. Il conto lo fa il <a href="/fisco-professioni/ravvedimento-operoso/" class="text-indigo-700 underline">calcolatore del ravvedimento</a>.')
  ].join('\n');

  return {
    slug: 'imu-2026',
    tema: 'casa',
    titolo: 'IMU 2026: chi paga, come si calcola, acconto, saldo e codici F24',
    titoloBreve: 'IMU 2026: calcolo, acconto, saldo e codici F24',
    descrizione: 'Guida all’IMU 2026: chi la paga, come si calcola dalla rendita catastale, aliquote, riduzioni per comodato e canone concordato, case ereditate, gruppo D, scadenze e codici tributo.',
    pubblicata: '2026-09-26',
    aggiornata: '2026-10-06',
    introduzione: 'L&rsquo;IMU non si paga sulla prima casa, ma quasi tutti gli altri immobili la pagano: seconde case, case ereditate, case date in affitto o in comodato, box, negozi e capannoni. Questa guida spiega chi deve pagarla, come si fa il conto partendo dalla rendita catastale, quali riduzioni esistono e come si compila l&rsquo;F24.',
    riassunto: [
      'Paga il proprietario (o l&rsquo;usufruttuario), non l&rsquo;inquilino; la prima casa &egrave; esente, tranne le abitazioni di lusso.',
      'Rendita &times; 1,05 &times; coefficiente della categoria, per l&rsquo;aliquota del Comune: una seconda casa con rendita 900 &euro; al 10,6 per mille paga ' + euro(seconda.impostaAnnua, 0) + '.',
      'Si paga in due rate, 16 giugno e 16 dicembre, con l&rsquo;F24: codice 3918 per le seconde case, 3925 e 3930 per il gruppo D.'
    ],
    strumenti: [
      { href: '/cittadino-tasse/calcolo-imu/', testo: 'Calcolatore IMU' },
      { href: '/cittadino-tasse/f24-editabile/f24-semplificato/', testo: 'F24 semplificato' }
    ],
    corpo,
    errori: [
      'Dimenticare la rivalutazione del 5%: la rendita della visura va sempre moltiplicata per 1,05 prima del coefficiente.',
      'Usare l&rsquo;aliquota base invece di quella del Comune: conta il prospetto delle aliquote pubblicato dal Dipartimento delle Finanze.',
      'Applicare la riduzione del comodato senza contratto registrato: la riduzione non spetta.',
      'Pagare un box come seconda casa quando &egrave; pertinenza dell&rsquo;abitazione principale: una pertinenza per categoria &egrave; esente.',
      'Mettere il codice del Comune sbagliato: con pi&ugrave; immobili in Comuni diversi serve una riga per ciascun Comune.'
    ],
    faq: [
      { d: 'Chi paga l&rsquo;IMU su una casa in affitto?', r: 'Il proprietario, non l&rsquo;inquilino. Se la casa &egrave; affittata a canone concordato, l&rsquo;imposta si paga al 75%.' },
      { d: 'Sulla casa ereditata l&rsquo;IMU si paga dalla successione?', r: 'No, dalla data della morte. Ogni erede paga sulla propria quota, contando il mese della morte se l&rsquo;immobile &egrave; posseduto per pi&ugrave; della met&agrave; dei giorni.' },
      { d: 'Dove trovo l&rsquo;aliquota del mio Comune?', r: 'Nel prospetto delle aliquote pubblicato sul portale del Dipartimento delle Finanze del Ministero dell&rsquo;Economia, cercando il Comune e l&rsquo;anno.' },
      { d: 'Posso pagare l&rsquo;IMU in un&rsquo;unica volta?', r: 'S&igrave;: entro il 16 giugno si pu&ograve; versare tutta l&rsquo;imposta dell&rsquo;anno invece di dividerla in acconto e saldo.' },
      { d: 'Il nudo proprietario paga l&rsquo;IMU?', r: 'No: se sull&rsquo;immobile c&rsquo;&egrave; un usufrutto, l&rsquo;IMU la paga l&rsquo;usufruttuario per intero.' }
    ],
    fonti: [
      'Legge 27 dicembre 2019, n. 160, art. 1, commi 738-783: disciplina dell&rsquo;IMU.',
      'Legge 27 dicembre 2006, n. 296, art. 1, commi 166 e 168: arrotondamento all&rsquo;euro e importo minimo dei versamenti.',
      'D.Lgs. 7 agosto 2026, n. 147, art. 26: dichiarazione IMU (comma 768-bis della L. 160/2019).',
      'D.L. 13 maggio 2011, n. 70, art. 7: scadenze di sabato e nei giorni festivi.',
      'Legge 9 dicembre 1998, n. 431: contratti a canone concordato.',
      'Dipartimento delle Finanze: delibere comunali e prospetto delle aliquote.',
      'Agenzia delle Entrate: modello F24 semplificato e istruzioni.'
    ]
  };
};
