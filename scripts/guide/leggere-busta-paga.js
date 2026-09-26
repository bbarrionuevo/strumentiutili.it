// Guida: come leggere la busta paga voce per voce.
// Cifre da js/stipendio-netto.js (StipendioNetto.calculateSalary) con irpef
// e tfr di data/regole-fiscali-2026.json.
'use strict';

module.exports = function (ctx) {
  const { h, euro, pct } = ctx;
  const IR = ctx.regole.irpef;
  const T = ctx.regole.tfr;
  const D = IR.deduzioniLavoroDipendente;
  const netto = (ral) => ctx.motori.stipendio.calculateSalary(ral, 13, ctx.regole, {});
  const casi = [18000, 28000, 38000].map(netto);
  const c = casi[1];
  const sc = IR.scaglioni;
  const inpsAliquota = c.inps / c.ral;
  const quotaTfr = c.ral / T.divisoreFisso;

  const riga = (nome, chiave, segno) => [nome].concat(casi.map((r) => (segno || '') + euro(r[chiave])));

  const corpo = [
    h.h2('struttura', 'Come &egrave; fatta una busta paga'),
    h.p('Il datore di lavoro deve consegnare ogni mese il prospetto paga, il cedolino: lo prevede la legge dal 1953. I modelli cambiano da un&rsquo;azienda all&rsquo;altra, ma le parti sono sempre le stesse, quasi sempre in quest&rsquo;ordine:'),
    h.ol([
      '<strong>Intestazione:</strong> dati dell&rsquo;azienda e tuoi (codice fiscale, matricola, data di assunzione), contratto collettivo applicato, livello, qualifica, tipo di orario, mese di riferimento.',
      '<strong>Elementi della retribuzione:</strong> le voci fisse che compongono la tua paga mensile.',
      '<strong>Competenze del mese:</strong> quanto ti spetta per il mese, cio&egrave; ore lavorate, straordinari, festivit&agrave;, ferie godute, malattia.',
      '<strong>Trattenute previdenziali:</strong> i contributi INPS a tuo carico.',
      '<strong>Trattenute fiscali:</strong> IRPEF, detrazioni, addizionali regionale e comunale.',
      '<strong>Netto in busta:</strong> quello che arriva sul conto.',
      '<strong>Ratei e TFR:</strong> in fondo, di solito in piccolo, le ferie e i permessi maturati e goduti e il TFR accantonato.'
    ]),

    h.h2('elementi', 'Gli elementi della retribuzione'),
    h.ul([
      '<strong>Paga base o minimo tabellare:</strong> la cifra fissata dal contratto collettivo per il tuo livello.',
      '<strong>Contingenza ed EDR:</strong> voci storiche, rimaste da vecchi meccanismi di adeguamento all&rsquo;inflazione; in molti contratti sono ancora righe separate.',
      '<strong>Scatti di anzianit&agrave;:</strong> aumenti che maturano ogni due o tre anni di servizio, secondo il contratto.',
      '<strong>Superminimo:</strong> una somma in pi&ugrave; decisa dall&rsquo;azienda, individuale o collettiva. Pu&ograve; essere &laquo;assorbibile&raquo;: in quel caso diminuisce quando aumenta il minimo del contratto.',
      '<strong>Indennit&agrave;:</strong> di funzione, di turno, di cassa, di trasferta, a seconda del lavoro.'
    ]),
    h.p('La somma degli elementi fissi &egrave; la retribuzione mensile lorda. Moltiplicata per le mensilit&agrave; (tredici, o quattordici se il contratto prevede la quattordicesima, come nel commercio e nel turismo) d&agrave; la <strong>RAL</strong>, la retribuzione annua lorda: il numero di cui si parla ai colloqui di lavoro.'),

    h.h2('competenze', 'Le competenze del mese'),
    h.p('Qui c&rsquo;&egrave; quello che hai maturato nel mese: le ore ordinarie, gli straordinari con le loro maggiorazioni, il lavoro notturno o festivo, le festivit&agrave; retribuite, le ferie e i permessi goduti. Se sei stato in malattia, di solito l&rsquo;indennit&agrave; a carico dell&rsquo;INPS la anticipa il datore di lavoro, con righe separate dalla parte integrativa pagata dall&rsquo;azienda secondo il contratto. Nei mesi di dicembre (e di giugno o luglio, dove c&rsquo;&egrave; la quattordicesima) compare anche la mensilit&agrave; aggiuntiva.'),
    h.p('La somma delle competenze &egrave; il <strong>totale lordo</strong> del mese: da qui partono le trattenute.'),

    h.h2('trattenute', 'Contributi e tasse: da dove viene il netto'),
    h.p('<strong>Contributi INPS.</strong> Per la maggior parte dei dipendenti del settore privato la quota a tuo carico &egrave; il ' + pct(inpsAliquota, 2) + ' della retribuzione lorda; sulla parte di stipendio annuo che supera una soglia fissata ogni anno dall&rsquo;INPS si aggiunge un punto. La parte a carico dell&rsquo;azienda, molto pi&ugrave; grande, non compare nel netto. I contributi si tolgono prima di calcolare le tasse.'),
    h.p('<strong>IRPEF.</strong> Si calcola sull&rsquo;imponibile, cio&egrave; il lordo meno i contributi, a scaglioni: il ' + pct(sc[0].aliquota) + ' fino a ' + euro(sc[0].limite, 0) + ', il ' + pct(sc[1].aliquota) + ' da ' + euro(sc[0].limite, 0) + ' a ' + euro(sc[1].limite, 0) + ', il ' + pct(sc[2].aliquota) + ' oltre. Ogni mese il datore di lavoro trattiene l&rsquo;imposta calcolata come se quello stipendio durasse tutto l&rsquo;anno; a fine anno rif&agrave; il conto sul totale e fa il conguaglio.'),
    h.p('<strong>Detrazioni.</strong> Dall&rsquo;IRPEF lorda si tolgono le detrazioni: quella per lavoro dipendente e quelle per il coniuge e i familiari a carico, se le hai chieste al datore di lavoro. La detrazione per lavoro dipendente &egrave; di ' + euro(D.baseFino15k, 0) + ' l&rsquo;anno fino a ' + euro(15000, 0) + ' di reddito; appena sopra sale a circa ' + euro(D.baseFino28k + D.incrementoFino28k, 0) + ' e poi scende: ' + euro(D.baseFino28k, 0) + ' a ' + euro(28000, 0) + ', zero a ' + euro(50000, 0) + '. Fra ' + euro(25000, 0) + ' e ' + euro(35000, 0) + ' si aggiungono ' + euro(D.correzioneAggiuntiva25k35k, 0) + '.'),
    h.p('<strong>Taglio del cuneo fiscale.</strong> Dal 2025 &egrave; strutturale e ha due forme. Fino a ' + euro(IR.cuneoFiscale.bonusEsente[2].soglia, 0) + ' di reddito &egrave; una somma in pi&ugrave;, esente da tasse, pari a una percentuale del reddito (dal ' + pct(IR.cuneoFiscale.bonusEsente[0].aliquota, 1) + ' al ' + pct(IR.cuneoFiscale.bonusEsente[2].aliquota, 1) + '). Fra ' + euro(IR.cuneoFiscale.bonusEsente[2].soglia, 0) + ' e ' + euro(IR.cuneoFiscale.detrazioneUlteriore.sogliaPiena, 0) + ' &egrave; un&rsquo;ulteriore detrazione di ' + euro(IR.cuneoFiscale.detrazioneUlteriore.importoMax, 0) + ' l&rsquo;anno, che scende fino a zero a ' + euro(IR.cuneoFiscale.detrazioneUlteriore.sogliaLimite, 0) + '. In busta paga compare con diciture diverse: &laquo;taglio cuneo&raquo;, &laquo;somma L. 207/2024&raquo;, &laquo;ulteriore detrazione&raquo;.'),
    h.p('<strong>Addizionali regionale e comunale.</strong> Si calcolano sullo stesso imponibile dell&rsquo;IRPEF, con le aliquote della tua Regione e del tuo Comune, e si trattengono a rate: quella regionale nell&rsquo;anno successivo, quella comunale in parte come acconto nell&rsquo;anno stesso e il resto nell&rsquo;anno dopo. Per questo a gennaio il netto pu&ograve; cambiare anche senza aumenti.'),

    h.h2('esempi', 'Dal lordo al netto: tre esempi'),
    h.p('La tabella mostra il conto per tre stipendi annui lordi, su tredici mensilit&agrave;, per un dipendente senza familiari a carico, con le aliquote medie delle addizionali usate dal calcolatore del sito (' + pct(IR.aliquoteMedieLocali.regionale, 2) + ' regionale, ' + pct(IR.aliquoteMedieLocali.comunale, 1) + ' comunale).'),
    h.tabella('Dallo stipendio lordo al netto, anno 2026', ['Voce', 'RAL ' + euro(18000, 0), 'RAL ' + euro(28000, 0), 'RAL ' + euro(38000, 0)], [
      riga('Contributi INPS', 'inps', '&minus; '),
      riga('Imponibile IRPEF', 'imponibileIrpef'),
      riga('IRPEF lorda', 'irpefLorda'),
      riga('Detrazione lavoro dipendente', 'detrazioneLavoro'),
      riga('Ulteriore detrazione (cuneo)', 'detrazioneCuneo'),
      riga('IRPEF netta', 'irpefNetta', '&minus; '),
      riga('Addizionali (medie)', 'addizionali', '&minus; '),
      riga('Somma esente (cuneo)', 'bonusCuneo', '+ '),
      riga('Netto annuo', 'nettoAnnuo'),
      riga('Netto mensile (su 13)', 'nettoMensile')
    ]),
    h.esempio('RAL di ' + euro(c.ral, 0) + ' su tredici mensilit&agrave;', [
      'Contributi INPS: ' + euro(c.ral, 0) + ' &times; ' + pct(inpsAliquota, 2) + ' = ' + euro(c.inps) + '. Imponibile: ' + euro(c.imponibileIrpef) + '.',
      c.imponibileIrpef <= sc[0].limite
        ? 'IRPEF lorda: tutto l&rsquo;imponibile sta nel primo scaglione, ' + euro(c.imponibileIrpef) + ' &times; ' + pct(sc[0].aliquota) + ' = ' + euro(c.irpefLorda) + '.'
        : 'IRPEF lorda: ' + pct(sc[0].aliquota) + ' fino a ' + euro(sc[0].limite, 0) + ', ' + pct(sc[1].aliquota) + ' sul resto = ' + euro(c.irpefLorda) + '.',
      'Meno la detrazione per lavoro dipendente (' + euro(c.detrazioneLavoro) + ') e l&rsquo;ulteriore detrazione del cuneo (' + euro(c.detrazioneCuneo) + '): IRPEF netta ' + euro(c.irpefNetta) + '.',
      'Addizionali medie: ' + euro(c.addizionali) + '.'
    ], 'Netto annuo ' + euro(c.nettoAnnuo) + ', circa ' + euro(c.nettoMensile) + ' al mese per tredici mensilit&agrave;.'),
    h.p('Sono stime: il netto reale dipende dalle aliquote delle addizionali del tuo Comune e della tua Regione, dai familiari a carico, dai giorni lavorati nell&rsquo;anno, dai premi e dai benefit. Il netto del mese, poi, pu&ograve; scostarsi dalla media per straordinari, conguagli e rate delle addizionali.'),

    h.h2('ratei', 'Ferie, permessi, tredicesima e TFR'),
    h.ul([
      '<strong>Ratei:</strong> ogni mese maturano una parte di ferie, di permessi (ROL, ex festivit&agrave;) e delle mensilit&agrave; aggiuntive. La busta riporta quanto hai maturato, goduto e il saldo: &egrave; il posto giusto per controllare quanti giorni di ferie ti restano.',
      '<strong>Tredicesima:</strong> si paga a dicembre ed &egrave; tassata come lo stipendio; per questo spesso il netto &egrave; pi&ugrave; basso di una mensilit&agrave; normale.',
      '<strong>TFR:</strong> ogni anno si accantona una quota pari alla retribuzione annua divisa per ' + String(T.divisoreFisso).replace('.', ',') + ', meno lo ' + pct(T.rivalsaInps, 1) + ' destinato al Fondo di garanzia. Su una RAL di ' + euro(c.ral, 0) + ' sono circa ' + euro(quotaTfr, 0) + ' lordi l&rsquo;anno. Resta in azienda (o va al fondo pensione, se lo hai scelto) e si rivaluta ogni anno.'
    ]),
    h.p('A fine anno, o quando il rapporto finisce, il datore di lavoro fa il <strong>conguaglio</strong>: ricalcola l&rsquo;IRPEF sull&rsquo;intero anno e restituisce o trattiene la differenza. Se presenti il 730, i rimborsi o i debiti che ne risultano arrivano in busta paga, di solito da luglio.')
  ].join('\n');

  return {
    slug: 'leggere-busta-paga',
    tema: 'lavoro',
    titolo: 'Come leggere la busta paga voce per voce',
    titoloBreve: 'Come leggere la busta paga voce per voce',
    descrizione: 'Guida al cedolino: elementi della retribuzione, competenze, contributi INPS, IRPEF, detrazioni, taglio del cuneo fiscale 2026, addizionali, ratei e TFR, con tre esempi dal lordo al netto.',
    pubblicata: '2026-09-26',
    aggiornata: '2026-09-26',
    introduzione: 'La busta paga &egrave; piena di sigle e di righe che sembrano fatte apposta per non essere capite. In realt&agrave; segue sempre lo stesso schema: quanto ti spetta, quanto se ne va in contributi e tasse, quanto resta. Questa guida spiega ogni parte e mostra con i numeri come si passa dallo stipendio lordo al netto nel 2026.',
    riassunto: [
      'Dal lordo si tolgono i contributi INPS (per lo pi&ugrave; il ' + pct(inpsAliquota, 2) + '), poi IRPEF e addizionali; si aggiungono le misure del taglio del cuneo fiscale.',
      'IRPEF 2026: ' + pct(sc[0].aliquota) + ' fino a ' + euro(sc[0].limite, 0) + ', ' + pct(sc[1].aliquota) + ' fino a ' + euro(sc[1].limite, 0) + ', ' + pct(sc[2].aliquota) + ' oltre.',
      'Con una RAL di ' + euro(c.ral, 0) + ' il netto &egrave; di circa ' + euro(c.nettoMensile, 0) + ' al mese su tredici mensilit&agrave;.'
    ],
    strumenti: [
      { href: '/lavoro-contratti/stipendio-netto/', testo: 'Calcola il netto dal lordo' },
      { href: '/lavoro-contratti/analizzatore-busta-paga/', testo: 'Analizza la tua busta paga' }
    ],
    corpo,
    errori: [
      'Confrontare il netto di dicembre con quello degli altri mesi: tredicesima, conguagli e addizionali lo rendono diverso.',
      'Scambiare il superminimo assorbibile per un aumento garantito: pu&ograve; ridursi quando aumenta il minimo del contratto.',
      'Non controllare il livello e il contratto nell&rsquo;intestazione: un livello sbagliato vuol dire una paga base sbagliata.',
      'Ignorare il saldo delle ferie: in busta c&rsquo;&egrave; il conto dei giorni maturati e goduti, e le ferie non godute hanno regole precise.',
      'Pensare che le detrazioni per i familiari arrivino da sole: vanno chieste al datore di lavoro con una dichiarazione.'
    ],
    faq: [
      { d: 'Che differenza c&rsquo;&egrave; fra RAL e netto?', r: 'La RAL &egrave; lo stipendio annuo lordo, prima di contributi e tasse. Il netto &egrave; quello che resta dopo i contributi INPS, l&rsquo;IRPEF e le addizionali, pi&ugrave; le somme del taglio del cuneo fiscale.' },
      { d: 'Perch&eacute; a gennaio il netto &egrave; cambiato?', r: 'Spesso per le addizionali: quella regionale e il saldo di quella comunale dell&rsquo;anno prima si trattengono a rate dall&rsquo;inizio dell&rsquo;anno. Possono pesare anche nuove aliquote o scatti di anzianit&agrave;.' },
      { d: 'Dove trovo quanti giorni di ferie mi restano?', r: 'Nella parte dei ratei, di solito in fondo al cedolino: ferie maturate, godute e residue, e lo stesso per i permessi.' },
      { d: 'Il taglio del cuneo fiscale aumenta i contributi per la pensione?', r: 'No: dal 2025 &egrave; una misura fiscale, cio&egrave; una somma esente o una detrazione dall&rsquo;IRPEF. I contributi versati per la pensione non cambiano.' },
      { d: 'Il TFR lo vedo in busta paga?', r: 'Vedi la quota accantonata e il totale maturato, ma non lo ricevi ogni mese: lo incassi quando il rapporto finisce, oppure va al fondo pensione se lo hai scelto.' }
    ],
    fonti: [
      'Legge 5 gennaio 1953, n. 4: obbligo e contenuto del prospetto paga.',
      'D.P.R. 22 dicembre 1986, n. 917, art. 11: scaglioni IRPEF.',
      'D.P.R. 22 dicembre 1986, n. 917, art. 13: detrazioni per lavoro dipendente.',
      'Legge 30 dicembre 2024, n. 207: misure strutturali di riduzione del cuneo fiscale.',
      'Legge 30 dicembre 2025, n. 199: secondo scaglione IRPEF al 33% dal 2026.',
      'Codice civile, art. 2120: trattamento di fine rapporto.'
    ]
  };
};
