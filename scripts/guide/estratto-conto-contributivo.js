// Guida: estratto conto contributivo INPS, come scaricarlo, leggerlo e
// trovare i buchi. Cifre da js/estratto-contributivo.js con pensioni di
// data/regole-fiscali-2026.json.
'use strict';

module.exports = function (ctx) {
  const { h, euro, num } = ctx;
  const PE = ctx.regole.pensioni;
  const E = ctx.motori.estratto;
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const giorno = (d) => (d.getDate() === 1 ? '1&deg;' : d.getDate()) + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear();

  const periodi = [
    { dal: '2008-09-01', al: '2012-06-30', gestione: 'Lavoro dipendente', tipo: 'obbligatoria' },
    { dal: '2013-01-14', al: '2015-12-31', gestione: 'Lavoro dipendente', tipo: 'obbligatoria' },
    { dal: '2014-03-01', al: '2014-12-31', gestione: 'Gestione separata', tipo: 'obbligatoria' },
    { dal: '2016-06-01', al: '2025-12-31', gestione: 'Lavoro dipendente', tipo: 'obbligatoria' }
  ];
  const a = E.analizza(periodi, { pensioni: PE, sesso: 'M' });
  const anno2014 = a.perAnno.find((x) => x.anno === 2014);
  const vecchiaia = a.requisiti.find((r) => /vecchiaia/.test(r.nome));
  const anticipata = a.requisiti.find((r) => /anticipata/.test(r.nome));
  const V = PE.requisiti_vecchiaia;
  const AN = PE.requisiti_anticipata;

  const corpo = [
    h.h2('cosa', 'Che cos&rsquo;&egrave; l&rsquo;estratto conto contributivo'),
    h.p('L&rsquo;estratto conto contributivo &egrave; l&rsquo;elenco, anno per anno, dei contributi che l&rsquo;INPS ha registrato a tuo nome: i periodi di lavoro dipendente, quelli da autonomo o in gestione separata, i contributi <strong>figurativi</strong> (accreditati senza versamenti, per esempio durante la disoccupazione, la maternit&agrave; o il servizio militare), quelli <strong>volontari</strong> e i <strong>riscatti</strong>, come la laurea.'),
    h.p('&Egrave; il documento da cui dipendono quando e con quanto andrai in pensione. Contiene errori pi&ugrave; spesso di quanto si pensi: un datore di lavoro che non ha versato, un periodo registrato nella gestione sbagliata, un anno mai arrivato. Controllarlo ogni tanto, e non a sessant&rsquo;anni, &egrave; il modo pi&ugrave; semplice per non avere sorprese.'),

    h.h2('scaricare', 'Come scaricarlo'),
    h.ol([
      'Entra nell&rsquo;area riservata <strong>MyINPS</strong> sul sito dell&rsquo;INPS con SPID, CIE o CNS.',
      'Cerca il <strong>fascicolo previdenziale del cittadino</strong> e, al suo interno, l&rsquo;estratto conto contributivo.',
      'Scaricalo in PDF: &egrave; il formato che si legge meglio e che serve anche per il controllo automatico.'
    ]),
    h.p('Se non hai un&rsquo;identit&agrave; digitale puoi chiederlo gratis a un patronato. Esiste anche una versione <strong>certificativa</strong>, da chiedere all&rsquo;INPS, che ha valore di certificazione: serve per esempio per una ricongiunzione o un riscatto. Per un controllo personale basta quella normale.'),

    h.h2('leggere', 'Come si legge'),
    h.p('Ogni riga &egrave; un periodo, con queste informazioni:'),
    h.ul([
      '<strong>dal / al:</strong> l&rsquo;inizio e la fine del periodo;',
      '<strong>tipo di contribuzione:</strong> obbligatoria, figurativa, volontaria, da riscatto;',
      '<strong>contributi utili:</strong> quasi sempre in settimane (per gli autonomi a volte in mesi), distinti fra utili <em>al diritto</em>, cio&egrave; a raggiungere i requisiti, e utili <em>alla misura</em>, cio&egrave; a calcolare l&rsquo;importo;',
      '<strong>retribuzione o reddito:</strong> la base su cui sono stati calcolati i contributi;',
      '<strong>gestione o fondo:</strong> dove sono stati versati, per esempio il fondo dei lavoratori dipendenti, la gestione separata, artigiani o commercianti.'
    ]),
    h.p('Due regole spiegano quasi tutti i conti che non tornano. La prima: ai fini della pensione un anno vale al massimo <strong>' + E.SETTIMANE_ANNO + ' settimane</strong>, anche se nello stesso anno hai versato in due gestioni diverse; la somma delle righe pu&ograve; quindi superare il totale che conta. La seconda: con stipendi molto bassi, per esempio in un part-time ridotto, le settimane accreditate possono essere meno di quelle lavorate, perch&eacute; ogni settimana richiede una retribuzione minima.'),

    h.h2('buchi', 'Trovare i buchi'),
    h.p('Un buco &egrave; un periodo senza contributi fra un lavoro e l&rsquo;altro. Non &egrave; per forza un errore: pu&ograve; essere un periodo di studio, di lavoro all&rsquo;estero, di disoccupazione senza indennit&agrave;. Diventa un problema quando in quel periodo lavoravi e i contributi non ci sono.'),
    h.esempio('un estratto con quattro periodi', [
      'Lavoro dipendente dal 1&deg; settembre 2008 al 30 giugno 2012, poi dal 14 gennaio 2013 al 31 dicembre 2015, e dal 1&deg; giugno 2016 al 31 dicembre 2025.',
      'Nel 2014, oltre al lavoro dipendente, una collaborazione in gestione separata da marzo a dicembre: le settimane dell&rsquo;anno sommate sono ' + anno2014.settimaneGrezze + ', ma ne contano ' + anno2014.settimane + '.',
      'Buchi trovati: ' + a.buchi.map((b) => 'dal ' + giorno(b.dal) + ' al ' + giorno(b.al) + ' (circa ' + b.settimaneMancate + ' settimane)').join('; ') + '.',
      'Totale utile alla pensione: ' + num(a.settimaneTotali) + ' settimane, cio&egrave; ' + a.anzianita.anni + ' anni e ' + a.anzianita.settimane + ' settimane; ' + a.settimaneEccedenti + ' settimane sovrapposte non si contano due volte.'
    ], 'Per la pensione di vecchiaia (' + V.contributi_anni + ' anni di contributi) mancano ' + vecchiaia.settimaneMancanti + ' settimane; per l&rsquo;anticipata ne mancano ' + num(anticipata.settimaneMancanti) + '.'),
    h.p('Nell&rsquo;esempio il primo buco, da luglio 2012 a gennaio 2013, &egrave; plausibile: un cambio di lavoro. Se in quei mesi avessi lavorato, per esempio con un contratto a termine, sarebbe il primo punto da verificare con le buste paga o la Certificazione Unica di quell&rsquo;anno.'),

    h.h2('errori', 'Se trovi un errore'),
    h.ol([
      '<strong>Raccogli le prove:</strong> buste paga, Certificazione Unica, contratto, lettera di assunzione o di licenziamento del periodo.',
      '<strong>Chiedi la correzione</strong> all&rsquo;INPS con la richiesta di variazione della posizione assicurativa (RVPA), online in MyINPS allegando i documenti, oppure tramite un patronato.',
      '<strong>Se il datore di lavoro non ha versato</strong>, segnalalo: l&rsquo;INPS pu&ograve; chiedergli i contributi. Fai presto, perch&eacute; i contributi si prescrivono in cinque anni: dopo, l&rsquo;INPS non li pu&ograve; pi&ugrave; pretendere e recuperarli &egrave; molto pi&ugrave; complicato (resta la costituzione di una rendita vitalizia, a pagamento).'
    ]),
    h.p('Alcuni periodi scoperti si possono coprire a pagamento: la laurea con il riscatto, i periodi di lavoro all&rsquo;estero con le convenzioni internazionali o la totalizzazione, i vuoti fra un lavoro e l&rsquo;altro in certi casi con i versamenti volontari. Conviene farsi fare i conti da un patronato prima di pagare.'),

    h.h2('requisiti', 'Quanto manca alla pensione'),
    h.tabella('Requisiti di contribuzione nel 2026', ['Pensione', 'Contributi', 'In settimane', 'Et&agrave;'], [
      ['Vecchiaia', V.contributi_anni + ' anni', num(vecchiaia.settimaneNecessarie), V.eta_anni + ' anni'],
      ['Anticipata, uomini', AN.uomini.anni + ' anni e ' + AN.uomini.mesi + ' mesi', num(E.requisiti(0, PE, 'M').find((r) => /anticipata/.test(r.nome)).settimaneNecessarie), 'nessun requisito'],
      ['Anticipata, donne', AN.donne.anni + ' anni e ' + AN.donne.mesi + ' mesi', num(E.requisiti(0, PE, 'F').find((r) => /anticipata/.test(r.nome)).settimaneNecessarie), 'nessun requisito']
    ]),
    h.p('Per la pensione anticipata, dopo aver raggiunto i contributi si aspetta una finestra di ' + AN.finestra_mobile_mesi + ' mesi prima del primo pagamento. Per quella di vecchiaia, oltre ai ' + V.eta_anni + ' anni e ai ' + V.contributi_anni + ' anni di contributi, chi ha iniziato a lavorare dopo il 1995 deve avere una pensione di almeno ' + euro(V.importo_minimo_mensile) + ' al mese; altrimenti si aspetta fino a ' + V.deroga_importo_insufficiente.eta_anni + ' anni, con almeno ' + V.deroga_importo_insufficiente.contributi_anni + ' anni di contributi.'),
    h.p('L&rsquo;estratto dice quanti contributi hai, non quanto prenderai: l&rsquo;importo dipende dagli stipendi, dal metodo di calcolo e dall&rsquo;et&agrave; in cui smetti. Per una stima c&rsquo;&egrave; il <a href="/cittadino-tasse/simulatore-pensione/" class="text-indigo-700 underline">simulatore della pensione</a>.')
  ].join('\n');

  return {
    slug: 'estratto-conto-contributivo',
    tema: 'lavoro',
    titolo: 'Estratto conto contributivo INPS: come scaricarlo, leggerlo e trovare i buchi',
    titoloBreve: 'Estratto conto contributivo INPS: come leggerlo e trovare i buchi',
    descrizione: 'Come scaricare l’estratto conto contributivo dall’INPS, come si leggono settimane e gestioni, perché un anno vale al massimo 52 settimane, come trovare i buchi e correggerli.',
    pubblicata: '2026-09-26',
    aggiornata: '2026-09-26',
    introduzione: 'Quando e con quanto andrai in pensione dipende da un documento che quasi nessuno legge: l&rsquo;estratto conto contributivo dell&rsquo;INPS. Questa guida spiega come scaricarlo, come si leggono le sue colonne, come trovare i periodi scoperti e che cosa fare se un contributo manca.',
    riassunto: [
      'Si scarica gratis da MyINPS con SPID, CIE o CNS, nel fascicolo previdenziale, oppure tramite un patronato.',
      'Un anno vale al massimo ' + E.SETTIMANE_ANNO + ' settimane, anche con due lavori contemporanei.',
      'Se manca un periodo lavorato si chiede la correzione con la RVPA; i contributi non versati si prescrivono in cinque anni.'
    ],
    strumenti: [
      { href: '/lavoro-contratti/estratto-conto-contributivo/', testo: 'Analizza il tuo estratto conto' },
      { href: '/cittadino-tasse/simulatore-pensione/', testo: 'Simulatore pensione' }
    ],
    corpo,
    errori: [
      'Sommare le settimane di tutte le righe: nei periodi sovrapposti si contano una volta sola, al massimo ' + E.SETTIMANE_ANNO + ' per anno.',
      'Leggere le settimane della gestione separata come quelle del lavoro dipendente: le gestioni hanno regole diverse e non sempre si sommano.',
      'Aspettare la pensione per controllare: dopo cinque anni i contributi non versati non si possono pi&ugrave; chiedere al datore di lavoro.',
      'Considerare errore ogni buco: studio, estero e disoccupazione senza indennit&agrave; sono vuoti normali.',
      'Chiedere una correzione senza documenti: servono buste paga, Certificazione Unica o contratto del periodo.'
    ],
    faq: [
      { d: 'L&rsquo;estratto conto contributivo &egrave; gratuito?', r: 'S&igrave;: si scarica gratis da MyINPS con SPID, CIE o CNS, e anche i patronati lo stampano senza costi.' },
      { d: 'Perch&eacute; un anno in cui ho lavorato tutto l&rsquo;anno ha meno di 52 settimane?', r: 'Di solito perch&eacute; lo stipendio settimanale era sotto il minimo richiesto per accreditare una settimana intera, come succede con part-time molto ridotti. Pu&ograve; anche essere un versamento mancante: in quel caso servono le buste paga per chiedere la correzione.' },
      { d: 'Come si corregge un errore nell&rsquo;estratto?', r: 'Con la richiesta di variazione della posizione assicurativa (RVPA), online in MyINPS o tramite un patronato, allegando i documenti del periodo.' },
      { d: 'I contributi della gestione separata valgono per la pensione?', r: 'S&igrave;, ma si sommano a quelli del lavoro dipendente con regole precise, per esempio con il cumulo o la totalizzazione; nei periodi sovrapposti un anno resta comunque di ' + E.SETTIMANE_ANNO + ' settimane al massimo.' },
      { d: 'Quanti contributi servono per la pensione di vecchiaia?', r: 'Almeno ' + V.contributi_anni + ' anni, pari a ' + num(vecchiaia.settimaneNecessarie) + ' settimane, e ' + V.eta_anni + ' anni di et&agrave;.' }
    ],
    fonti: [
      'Legge 8 agosto 1995, n. 335: sistema contributivo e prescrizione dei contributi.',
      'D.L. 6 dicembre 2011, n. 201, art. 24: requisiti per la pensione di vecchiaia e anticipata.',
      'Legge 12 agosto 1962, n. 1338, art. 13: rendita vitalizia per i contributi prescritti.',
      'Legge 30 dicembre 2025, n. 199: Legge di Bilancio 2026.'
    ]
  };
};
