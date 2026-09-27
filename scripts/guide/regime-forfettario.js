// Guida: regime forfettario 2026, requisiti, tasse, contributi ed esempi.
// Cifre da js/partita-iva.js (PartitaIvaForfettaria) con partitaIvaForfettario
// di data/regole-fiscali-2026.json.
'use strict';

module.exports = function (ctx) {
  const { h, euro, pct } = ctx;
  const P = ctx.regole.partitaIvaForfettario;
  const conto = (ricavi, regime, attivita) => ctx.motori.forfettario.calculatePartitaIva(ricavi, regime, attivita, P);
  const K = P.coefficientiAteco;
  const I = P.inps;

  const prof = conto(40000, 'standard', 'professionisti');
  const nuovo = conto(40000, 'new', 'professionisti');
  const comm = conto(60000, 'standard', 'commercianti');
  const art = conto(30000, 'standard', 'artigiani');
  const pc = (x) => pct(x, 2).replace(/,00%$/, '%');

  const corpo = [
    h.h2('cos-e', 'Che cos&rsquo;&egrave; il regime forfettario'),
    h.p('Il regime forfettario &egrave; il regime fiscale agevolato per chi ha una partita IVA come persona fisica e incassa poco. Invece di dedurre le spese una per una, il reddito si calcola applicando ai ricavi un <strong>coefficiente di redditivit&agrave;</strong> fisso, diverso per tipo di attivit&agrave;; su quel reddito, tolti i contributi, si paga un&rsquo;unica <strong>imposta sostitutiva</strong> al posto di IRPEF e addizionali. Niente IVA in fattura, niente ritenuta d&rsquo;acconto subita, contabilit&agrave; ridotta al minimo.'),

    h.h2('requisiti', 'Chi pu&ograve; entrare e chi no'),
    h.ul([
      'ricavi o compensi dell&rsquo;anno precedente non oltre <strong>' + euro(P.limitiFatturato.ordinarioAnnuo, 0) + '</strong>;',
      'redditi da lavoro dipendente o pensione dell&rsquo;anno precedente non oltre 35.000 &euro;, a meno che il rapporto sia finito;',
      'non lavorare in prevalenza per il datore di lavoro attuale o per quelli dei due anni precedenti;',
      'non avere quote di controllo in societ&agrave; a responsabilit&agrave; limitata che svolgono attivit&agrave; simili, n&eacute; partecipazioni in societ&agrave; di persone.'
    ]),
    h.p('Il limite dei ricavi si guarda ogni anno, con il principio di cassa: contano le somme incassate fra il 1&deg; gennaio e il 31 dicembre, non le fatture emesse. Se nell&rsquo;anno incassi fra ' + euro(P.limitiFatturato.ordinarioAnnuo, 0) + ' e ' + euro(P.limitiFatturato.uscitaImmediata, 0) + ' resti forfettario fino a fine anno ed esci dal 1&deg; gennaio successivo; se superi ' + euro(P.limitiFatturato.uscitaImmediata, 0) + ' esci subito, e l&rsquo;IVA si applica gi&agrave; dalla fattura che fa superare il limite.'),

    h.h2('tasse', 'Come si calcolano le tasse'),
    h.ol([
      '<strong>Reddito:</strong> ricavi incassati &times; coefficiente dell&rsquo;attivit&agrave;.',
      '<strong>Contributi:</strong> calcolati sul reddito, con le regole della tua gestione previdenziale; quelli versati nell&rsquo;anno si deducono.',
      '<strong>Imposta sostitutiva:</strong> il ' + pct(P.aliquoteImposta.standard) + ' del reddito meno i contributi; il ' + pct(P.aliquoteImposta.startup) + ' per i primi cinque anni di una nuova attivit&agrave;.'
    ]),
    h.tabella('I coefficienti di redditivit&agrave; pi&ugrave; comuni', ['Attivit&agrave;', 'Coefficiente', 'Su 10.000 &euro; incassati'], [
      ['Professioni, attivit&agrave; scientifiche e tecniche', pct(K.PROFESSIONALS_SCIENTIFIC_TECHNICAL), euro(10000 * K.PROFESSIONALS_SCIENTIFIC_TECHNICAL, 0) + ' di reddito'],
      ['Commercio all&rsquo;ingrosso e al dettaglio', pct(K.COMMERCE_WHOLESALE_RETAIL), euro(10000 * K.COMMERCE_WHOLESALE_RETAIL, 0) + ' di reddito'],
      ['Costruzioni e attivit&agrave; immobiliari', pct(K.CONSTRUCTION_REAL_ESTATE), euro(10000 * K.CONSTRUCTION_REAL_ESTATE, 0) + ' di reddito'],
      ['Altre attivit&agrave; economiche', pct(K.OTHER_ACTIVITIES), euro(10000 * K.OTHER_ACTIVITIES, 0) + ' di reddito']
    ]),
    h.p('Il coefficiente dipende dal codice ATECO dell&rsquo;attivit&agrave;, scelto all&rsquo;apertura della partita IVA. Il ' + pct(P.aliquoteImposta.startup) + ' spetta per l&rsquo;anno di inizio e i quattro successivi se nei tre anni precedenti non hai svolto attivit&agrave; d&rsquo;impresa o di lavoro autonomo, e se la nuova attivit&agrave; non &egrave; la semplice prosecuzione di un lavoro dipendente fatto prima con le stesse mansioni.'),

    h.h2('contributi', 'I contributi INPS'),
    h.ul([
      '<strong>Professionisti senza cassa</strong> (consulenti, formatori, informatici&hellip;): gestione separata, ' + pc(I.gestioneSeparataAliquota) + ' del reddito, solo su quello che guadagni.',
      '<strong>Artigiani e commercianti:</strong> una quota fissa da pagare comunque (circa ' + euro(I.artigiani.quotaFissaMaternita, 0) + ' per gli artigiani e ' + euro(I.commercianti.quotaFissaMaternita, 0) + ' per i commercianti nel 2026), che copre il reddito fino al minimale di ' + euro(I.minimale2026, 0) + ', pi&ugrave; circa il ' + pct(I.artigiani.aliquotaFascia1) + ' sulla parte di reddito che lo supera. Chi &egrave; forfettario pu&ograve; chiedere all&rsquo;INPS la riduzione del 35%, che per&ograve; riduce anche la pensione futura.',
      '<strong>Professionisti con una cassa</strong> (avvocati, ingegneri, medici&hellip;): contributi alla propria cassa, con le sue regole.'
    ]),

    h.h2('esempi', 'Esempi con i numeri'),
    h.esempio('consulente con ' + euro(40000, 0) + ' di compensi, aliquota del 15%', [
      'Reddito: ' + euro(40000, 0) + ' &times; ' + pct(prof.coefficiente) + ' = ' + euro(prof.baseImponibile) + '.',
      'Contributi alla gestione separata: ' + euro(prof.baseImponibile) + ' &times; ' + pc(I.gestioneSeparataAliquota) + ' = ' + euro(prof.inps) + '.',
      'Imposta: (' + euro(prof.baseImponibile) + ' &minus; ' + euro(prof.inps) + ') &times; 15% = ' + euro(prof.impostaSostitutiva) + '.'
    ], 'Restano ' + euro(prof.nettoAnno) + ' l&rsquo;anno, circa ' + euro(prof.nettoMese, 0) + ' al mese. Con il 5% da nuova attivit&agrave; l&rsquo;imposta scende a ' + euro(nuovo.impostaSostitutiva) + ' e restano ' + euro(nuovo.nettoAnno) + '.'),
    h.esempio('negozio con ' + euro(60000, 0) + ' di incassi', [
      'Reddito: ' + euro(60000, 0) + ' &times; ' + pct(comm.coefficiente) + ' = ' + euro(comm.baseImponibile) + '.',
      'Contributi: quota fissa ' + euro(comm.dettaglioInps.quotaFissa) + ' pi&ugrave; ' + pc(I.commercianti.aliquotaFascia1) + ' su ' + euro(comm.baseImponibile - I.minimale2026) + ' sopra il minimale = ' + euro(comm.inps) + '.',
      'Imposta: ' + euro(comm.imponibileImposta) + ' &times; 15% = ' + euro(comm.impostaSostitutiva) + '.'
    ], 'Restano ' + euro(comm.nettoAnno) + ', ma da qui vanno tolti gli acquisti di merce e le spese del negozio: nel forfettario non si deducono, perch&eacute; sono gi&agrave; comprese nel coefficiente.'),
    h.tabella('Tasse e contributi su tre attivit&agrave;, aliquota del 15%', ['', 'Consulente, ' + euro(40000, 0), 'Artigiano, ' + euro(30000, 0), 'Negozio, ' + euro(60000, 0)], [
      ['Reddito', euro(prof.baseImponibile), euro(art.baseImponibile), euro(comm.baseImponibile)],
      ['Contributi', euro(prof.inps), euro(art.inps), euro(comm.inps)],
      ['Imposta sostitutiva', euro(prof.impostaSostitutiva), euro(art.impostaSostitutiva), euro(comm.impostaSostitutiva)],
      ['Resta dei ricavi', euro(prof.nettoAnno), euro(art.nettoAnno), euro(comm.nettoAnno)]
    ]),
    h.p('L&rsquo;artigiano con ' + euro(30000, 0) + ' di ricavi ha un reddito di ' + euro(art.baseImponibile) + ', sotto il minimale: paga solo la quota fissa, che pesa molto su redditi cos&igrave; bassi. &Egrave; il caso in cui conviene valutare la riduzione del 35%.'),

    h.h2('aprire', 'Come si apre e come si chiude'),
    h.p('La partita IVA si apre con il modello AA9/12 dell&rsquo;Agenzia delle Entrate, entro 30 giorni dall&rsquo;inizio dell&rsquo;attivit&agrave;: online con SPID o CIE, in un ufficio dell&rsquo;Agenzia o tramite un intermediario. Nel modello si indica il codice ATECO, da cui dipende il coefficiente, e si dichiara di voler applicare il regime forfettario. Artigiani e commercianti devono anche iscriversi alla Camera di commercio e all&rsquo;INPS, di solito con un&rsquo;unica pratica telematica; i professionisti senza cassa si iscrivono alla gestione separata.'),
    h.p('Per chiudere si usa lo stesso modello, entro 30 giorni dalla fine dell&rsquo;attivit&agrave;, dopo aver incassato le fatture ancora aperte: i compensi incassati dopo la chiusura vanno comunque dichiarati. Nel forfettario non c&rsquo;&egrave; un conto IVA da regolare, ma restano da pagare il saldo dell&rsquo;imposta e dei contributi dell&rsquo;ultimo anno.'),
    h.p('Il regime si applica anno per anno: se un anno perdi un requisito, dall&rsquo;anno dopo passi al regime ordinario, con IVA, ritenute e contabilit&agrave; semplificata. Se poi i requisiti tornano, puoi rientrare nel forfettario.'),

    h.h2('fatture', 'Fatture, bollo e pagamenti'),
    h.ul([
      '<strong>Niente IVA:</strong> in fattura si scrive che l&rsquo;operazione &egrave; fatta nel regime forfettario, senza applicazione dell&rsquo;IVA. Di conseguenza l&rsquo;IVA sugli acquisti non si detrae.',
      '<strong>Fattura elettronica:</strong> obbligatoria per tutti i forfettari dal 2024, attraverso il Sistema di Interscambio.',
      '<strong>Marca da bollo:</strong> 2 &euro; sulle fatture sopra 77,47 &euro;, che si possono addebitare al cliente (e non contano nei ricavi del limite).',
      '<strong>Niente ritenuta d&rsquo;acconto:</strong> i clienti non devono trattenere il 20%.',
      '<strong>Rivalsa INPS del 4%:</strong> i professionisti in gestione separata possono addebitarla in fattura; fa parte dei compensi.'
    ]),
    h.p('L&rsquo;imposta sostitutiva si paga con l&rsquo;F24, insieme alla dichiarazione dei redditi: saldo e primo acconto entro il 30 giugno, secondo acconto entro il 30 novembre, con i codici tributo 1790 e 1791 (acconti) e 1792 (saldo). Nel primo anno non ci sono acconti, quindi il primo pagamento, l&rsquo;anno dopo, &egrave; pi&ugrave; pesante: conviene mettere da parte ogni mese una quota degli incassi.')
  ].join('\n');

  return {
    slug: 'regime-forfettario',
    tema: 'partita-iva',
    titolo: 'Regime forfettario 2026: requisiti, tasse, contributi ed esempi',
    titoloBreve: 'Regime forfettario 2026: requisiti, tasse ed esempi',
    descrizione: 'Chi può usare il regime forfettario nel 2026, come si calcolano reddito, imposta sostitutiva al 15% o al 5% e contributi INPS, cosa cambia in fattura, con esempi per consulenti, artigiani e commercianti.',
    pubblicata: '2026-09-27',
    aggiornata: '2026-09-27',
    introduzione: 'Il regime forfettario &egrave; il modo pi&ugrave; semplice ed economico per avere una partita IVA, ma ha regole precise su chi pu&ograve; entrare, su come si calcola il reddito e su quando se ne esce. Questa guida spiega requisiti, tasse e contributi con esempi per tre attivit&agrave; diverse, e cosa cambia in fattura.',
    riassunto: [
      'Si entra con ricavi fino a ' + euro(P.limitiFatturato.ordinarioAnnuo, 0) + ' e redditi da lavoro dipendente fino a 35.000 &euro;; oltre ' + euro(P.limitiFatturato.uscitaImmediata, 0) + ' si esce subito.',
      'Reddito = ricavi &times; coefficiente; tolti i contributi si paga il ' + pct(P.aliquoteImposta.standard) + ', o il ' + pct(P.aliquoteImposta.startup) + ' per cinque anni per le nuove attivit&agrave;.',
      'Un consulente con ' + euro(40000, 0) + ' di compensi paga ' + euro(prof.inps + prof.impostaSostitutiva, 0) + ' fra contributi e imposta e tiene ' + euro(prof.nettoAnno, 0) + '.'
    ],
    strumenti: [
      { href: '/fisco-professioni/partita-iva/', testo: 'Simulatore regime forfettario' },
      { href: '/fisco-professioni/modelli-partita-iva/', testo: 'Apri la partita IVA (AA9)' }
    ],
    corpo,
    errori: [
      'Contare le fatture emesse invece degli incassi: per i limiti e per le tasse conta quando incassi.',
      'Dedurre le spese: nel forfettario sono gi&agrave; comprese nel coefficiente, e non si scaricano.',
      'Dimenticare gli acconti dell&rsquo;anno dopo: il primo pagamento comprende saldo e acconto insieme.',
      'Applicare il 5% a un&rsquo;attivit&agrave; che prosegue un lavoro dipendente con le stesse mansioni.',
      'Ignorare il limite di 35.000 &euro; di redditi da lavoro dipendente dell&rsquo;anno prima.'
    ],
    faq: [
      { d: 'Posso essere dipendente e avere la partita IVA forfettaria?', r: 'S&igrave;, se nell&rsquo;anno precedente i redditi da lavoro dipendente o pensione non hanno superato 35.000 &euro; e se non lavori in prevalenza per il tuo datore di lavoro attuale o per quelli dei due anni precedenti.' },
      { d: 'Cosa succede se supero 85.000 euro?', r: 'Se resti sotto i 100.000 &euro; finisci l&rsquo;anno nel forfettario ed esci dal 1&deg; gennaio successivo. Oltre i 100.000 &euro; esci subito e applichi l&rsquo;IVA dalla fattura che supera il limite.' },
      { d: 'Il cliente mi deve fare la ritenuta d&rsquo;acconto?', r: 'No: chi &egrave; nel regime forfettario non subisce la ritenuta. In fattura si indica che l&rsquo;operazione rientra nel regime forfettario.' },
      { d: 'Quanto dura l&rsquo;aliquota del 5%?', r: 'Per l&rsquo;anno di inizio e i quattro successivi, se ci sono i requisiti di nuova attivit&agrave;. Poi si passa al 15%.' },
      { d: 'Devo emettere la fattura elettronica?', r: 'S&igrave;: dal 2024 la fattura elettronica &egrave; obbligatoria anche per tutti i forfettari.' }
    ],
    fonti: [
      'Legge 23 dicembre 2014, n. 190, art. 1, commi 54-89: regime forfettario.',
      'Legge 29 dicembre 2022, n. 197: soglia di 85.000 &euro; e uscita immediata oltre 100.000 &euro;.',
      'Legge 30 dicembre 2024, n. 207: limite di 35.000 &euro; per i redditi da lavoro dipendente.',
      'D.P.R. 26 ottobre 1972, n. 642: imposta di bollo sulle fatture.',
      'Modelli AA9/12 e AA7/10 e relative istruzioni, Agenzia delle Entrate.'
    ]
  };
};
