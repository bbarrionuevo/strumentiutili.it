// Guida: dimissioni, preavviso, procedura online, TFR e NASpI.
// Cifre da js/tfr.js (TFRCalculator), js/naspi-calcolo.js e dai preavvisi
// di ccnl_dimissioni in data/regole-fiscali-2026.json.
'use strict';

module.exports = function (ctx) {
  const { h, euro, pct } = ctx;
  const CC = ctx.regole.ccnl_dimissioni;
  const T = ctx.regole.tfr;
  const NP = ctx.regole.naspi_parametri_2026;

  const durata = (x) => {
    const parti = [];
    if (x.m) parti.push(x.m + (x.m === 1 ? ' mese' : ' mesi'));
    if (x.d) parti.push(x.d + ' giorni');
    return parti.join(' e ') || '&ndash;';
  };
  const righe = [];
  for (const [chiave, nome] of [['commercio', 'Commercio'], ['metalmeccanici', 'Metalmeccanici industria'], ['turismo', 'Turismo']]) {
    const c = CC[chiave];
    for (const liv of c.livelli) {
      const p = c.preavviso[liv.id];
      righe.push([nome + ', ' + liv.label.replace(/^Livell[oi] /, 'liv. ').replace(/^Categori[ae] /, 'cat. '), durata(p['0-5']), durata(p['5-10']), durata(p['>10'])]);
    }
  }

  const tfr = ctx.motori.tfr.calculateTFR(30000, 30000, 8, ctx.regole);
  const naspi = ctx.motori.naspi.calcola({ eta: 45, retribuzione: 112000, settimane: 208 }, NP);
  const primoTaglio = naspi.piano[naspi.mesePartenzaDecalage - 1];
  const ultimo = naspi.piano[naspi.piano.length - 1];
  const com = CC.commercio.preavviso['4_5'];

  const corpo = [
    h.h2('procedura', 'Come si danno le dimissioni: la procedura online'),
    h.p('Dal 2016 le dimissioni di un lavoratore dipendente del settore privato valgono solo se presentate con la <strong>procedura telematica</strong> del Ministero del Lavoro. La lettera consegnata a mano o spedita con raccomandata, da sola, non basta: serve a comunicare la decisione e la data, ma il rapporto si chiude con il modulo online.'),
    h.ol([
      '<strong>Decidi la data</strong> dell&rsquo;ultimo giorno di lavoro, tenendo conto del preavviso previsto dal tuo contratto collettivo.',
      '<strong>Compila il modulo</strong> sul sito del Ministero del Lavoro, accedendo con SPID o CIE, oppure fatti aiutare gratuitamente da un patronato o da un sindacato (o da un consulente del lavoro). Servono i dati tuoi e dell&rsquo;azienda e la data di inizio del rapporto.',
      '<strong>Il modulo parte da solo</strong> verso la PEC del datore di lavoro e verso l&rsquo;Ispettorato del lavoro: la data di invio vale come data delle dimissioni.',
      '<strong>Hai sette giorni per ripensarci:</strong> nello stesso servizio puoi revocare le dimissioni entro sette giorni dall&rsquo;invio.'
    ]),
    h.p('La procedura online non serve nel lavoro domestico, per le dimissioni firmate in una sede protetta (per esempio davanti a una commissione di conciliazione) e durante il periodo di prova. Le lavoratrici in gravidanza e i genitori nei primi tre anni di vita del bambino devono invece far convalidare le dimissioni dall&rsquo;Ispettorato del lavoro.'),
    h.nota('Dal 2025 un&rsquo;assenza ingiustificata che dura oltre il termine del contratto collettivo o, se il contratto non dice nulla, oltre 15 giorni, pu&ograve; essere trattata come dimissioni: il datore di lavoro lo comunica all&rsquo;Ispettorato e il rapporto si chiude per volont&agrave; del lavoratore, senza diritto alla NASpI. Smettere di andare al lavoro non &egrave; quindi un modo per farsi licenziare.'),

    h.h2('preavviso', 'Il preavviso'),
    h.p('Chi si dimette deve lavorare ancora per il periodo di preavviso stabilito dal contratto collettivo, che dipende dal livello e dagli anni di servizio. Se non lo rispetti, il datore di lavoro pu&ograve; trattenere dall&rsquo;ultima busta paga l&rsquo;indennit&agrave; sostitutiva, cio&egrave; la retribuzione dei giorni di preavviso mancanti. Le parti possono sempre accordarsi per un preavviso pi&ugrave; breve, meglio per iscritto.'),
    h.tabella('Preavviso di dimissioni in alcuni contratti collettivi, per anni di servizio', ['Contratto e livello', 'Fino a 5 anni', 'Da 5 a 10 anni', 'Oltre 10 anni'], righe),
    h.p('Conta anche da quando decorre il preavviso. Nel commercio i termini partono dalla met&agrave; o dalla fine del mese: chi si dimette il 3 del mese comincia a contare dal 16. Nel contratto dei metalmeccanici si parte dal giorno dopo le dimissioni, nel turismo dal giorno in cui l&rsquo;azienda le riceve. Per un impiegato del commercio di IV o V livello con meno di cinque anni il preavviso &egrave; di ' + durata(com['0-5']) + ', che diventano ' + durata(com['>10']) + ' dopo dieci anni.'),
    h.p('Non c&rsquo;&egrave; preavviso se ti dimetti per <strong>giusta causa</strong>, cio&egrave; per un fatto cos&igrave; grave da non permettere di continuare il rapporto neppure per poco: stipendi non pagati, molestie, demansionamento, trasferimento senza ragioni. In quel caso anzi l&rsquo;indennit&agrave; di preavviso spetta a te, e si ha diritto alla NASpI. La giusta causa va indicata nel modulo online e, se contestata, dimostrata.'),

    h.h2('ultima-busta', 'Che cosa ti spetta con l&rsquo;ultima busta paga'),
    h.ul([
      'lo stipendio fino all&rsquo;ultimo giorno;',
      'i ratei di tredicesima (e di quattordicesima, se c&rsquo;&egrave;) maturati nell&rsquo;anno;',
      'le ferie e i permessi maturati e non goduti, pagati come indennit&agrave;;',
      'il TFR, di solito con l&rsquo;ultima busta o poco dopo, nei tempi del contratto collettivo;',
      'meno l&rsquo;eventuale indennit&agrave; per il preavviso non lavorato.'
    ]),

    h.h2('tfr', 'Il TFR: quanto si matura e come &egrave; tassato'),
    h.p('Il trattamento di fine rapporto si accantona ogni anno: la retribuzione annua divisa per ' + String(T.divisoreFisso).replace('.', ',') + ', meno lo ' + pct(T.rivalsaInps, 1) + ' della retribuzione che va al Fondo di garanzia dell&rsquo;INPS. Ogni 31 dicembre quanto accantonato negli anni prima si rivaluta dell&rsquo;' + pct(T.rivalutazioneIstatBase, 1) + ' pi&ugrave; il ' + pct(T.rivalutazioneIstatProporzionale) + ' dell&rsquo;aumento dei prezzi misurato dall&rsquo;ISTAT; sulla rivalutazione si paga un&rsquo;imposta del ' + pct(T.impostaSostitutivaRivalutazione) + '.'),
    h.p('Alla fine del rapporto il TFR ha una <strong>tassazione separata</strong>, pi&ugrave; leggera di quella dello stipendio: si calcola un reddito di riferimento (il TFR diviso per gli anni di lavoro, moltiplicato per 12) e si applica l&rsquo;aliquota media IRPEF che corrisponde a quel reddito, mai sotto il ' + pct(ctx.regole.irpef.scaglioni[0].aliquota) + '. La ritenuta dell&rsquo;azienda &egrave; provvisoria: pi&ugrave; avanti l&rsquo;Agenzia delle Entrate ricalcola l&rsquo;imposta con l&rsquo;aliquota media dei tuoi ultimi anni e pu&ograve; chiedere una differenza o rimborsarla.'),
    h.esempio('otto anni con una RAL di ' + euro(30000, 0), [
      'Quota annua: ' + euro(30000, 0) + ' / ' + String(T.divisoreFisso).replace('.', ',') + ' = ' + euro(30000 / T.divisoreFisso) + ', meno ' + euro(tfr.fondoGaranzia) + ' per il Fondo di garanzia = ' + euro(tfr.quotaAnnua) + '.',
      'In otto anni, senza contare la rivalutazione: ' + euro(tfr.tfrLordo) + ' lordi.',
      'Tassazione separata all&rsquo;aliquota del ' + String(tfr.aliquotaApplicata).replace('.', ',') + '%: ' + euro(tfr.tassazione) + '.'
    ], 'TFR netto stimato: ' + euro(tfr.tfrNetto) + '. La rivalutazione annua lo fa crescere un po&rsquo; di pi&ugrave;.'),
    h.p('Se hai scelto di versare il TFR a un fondo pensione, in azienda non c&rsquo;&egrave; nulla da liquidare: le regole per riscattarlo sono quelle del fondo.'),

    h.h2('naspi', 'La NASpI: quando spetta dopo le dimissioni'),
    h.p('La NASpI &egrave; l&rsquo;indennit&agrave; di disoccupazione per chi perde il lavoro <strong>senza volerlo</strong>. Chi si dimette volontariamente non ne ha diritto. Fanno eccezione:'),
    h.ul([
      'le dimissioni per giusta causa;',
      'le dimissioni durante il periodo tutelato di maternit&agrave; e paternit&agrave;;',
      'la risoluzione consensuale firmata nella procedura di conciliazione davanti all&rsquo;Ispettorato del lavoro.'
    ]),
    h.p('Serve inoltre avere almeno ' + NP.requisiti.settimane_minime_richieste + ' settimane di contributi nei quattro anni prima della disoccupazione. Dal 2025 c&rsquo;&egrave; una regola in pi&ugrave;: se nei dodici mesi prima ti eri dimesso da un lavoro a tempo indeterminato e poi perdi senza volerlo il nuovo lavoro, le 13 settimane devono essere state maturate dopo quelle dimissioni.'),
    h.p('La domanda si presenta all&rsquo;INPS online entro 68 giorni dalla fine del rapporto. L&rsquo;indennit&agrave; &egrave; il ' + pct(NP.aliquota_base) + ' della retribuzione media mensile degli ultimi quattro anni fino a ' + euro(NP.soglia_retribuzione_inps) + ', pi&ugrave; il ' + pct(NP.aliquota_eccedenza) + ' della parte che supera questa soglia, con un massimo di ' + euro(NP.massimale_mensile_inps) + ' al mese nel 2026. Dura la met&agrave; delle settimane di contributi degli ultimi quattro anni, al massimo due anni, e dal ' + NP.decalage.mese_partenza_standard + '&deg; mese cala del 3% al mese (dall&rsquo;' + NP.decalage.mese_partenza_over55 + '&deg; per chi ha almeno ' + NP.decalage.soglia_eta_anni + ' anni).'),
    h.esempio('licenziamento dopo quattro anni con ' + euro(112000, 0) + ' di retribuzione imponibile', [
      'Retribuzione media mensile: ' + euro(112000, 0) + ' / 208 settimane &times; ' + String(NP.coefficiente_mensilizzazione).replace('.', ',') + ' = ' + euro(naspi.rmm) + '.',
      'Importo: 75% di ' + euro(NP.soglia_retribuzione_inps) + ' pi&ugrave; 25% di ' + euro(naspi.rmm - NP.soglia_retribuzione_inps) + ' = ' + euro(naspi.importoBase) + ' lordi al mese.',
      'Durata: 208 / 2 = ' + naspi.settimaneSpettanti + ' settimane, cio&egrave; ' + naspi.mesi + ' mesi.',
      'Dal ' + naspi.mesePartenzaDecalage + '&deg; mese: ' + euro(primoTaglio.lordo) + '; all&rsquo;ultimo mese: ' + euro(ultimo.lordo) + '.'
    ], 'In tutto circa ' + euro(naspi.totale, 0) + ' lordi in ' + naspi.mesi + ' mesi. La NASpI &egrave; tassata come uno stipendio.'),
    h.p('Durante la NASpI si pu&ograve; lavorare, entro certi limiti di reddito e comunicandolo all&rsquo;INPS, e si pu&ograve; chiedere l&rsquo;anticipo in un&rsquo;unica soluzione per aprire un&rsquo;attivit&agrave;. Sono regole che hanno condizioni precise: prima di agire conviene chiedere a un patronato.')
  ].join('\n');

  return {
    slug: 'dimissioni-tfr-naspi',
    tema: 'lavoro',
    titolo: 'Dimissioni: procedura online, preavviso, TFR e NASpI',
    titoloBreve: 'Dimissioni: procedura online, preavviso, TFR e NASpI',
    descrizione: 'Come dare le dimissioni con la procedura telematica, quanto preavviso serve nei principali contratti, cosa spetta con l’ultima busta paga, come è tassato il TFR e quando si ha la NASpI.',
    pubblicata: '2026-09-26',
    aggiornata: '2026-09-26',
    introduzione: 'Dimettersi sembra semplice, ma una data sbagliata o un modulo mancante costano soldi: il preavviso non lavorato si paga, e chi si dimette volontariamente perde la disoccupazione. Questa guida spiega la procedura online, il preavviso nei contratti pi&ugrave; diffusi, che cosa arriva con l&rsquo;ultima busta paga e quando spetta la NASpI.',
    riassunto: [
      'Le dimissioni valgono solo con il modulo telematico del Ministero del Lavoro; si possono revocare entro sette giorni.',
      'Il preavviso dipende da contratto, livello e anni di servizio; se non lo lavori, il datore pu&ograve; trattenerlo dall&rsquo;ultima busta.',
      'Chi si dimette volontariamente non ha la NASpI, salvo giusta causa e pochi altri casi; il TFR spetta sempre.'
    ],
    strumenti: [
      { href: '/lavoro-contratti/lettera-dimissioni-preavviso/', testo: 'Lettera di dimissioni e preavviso' },
      { href: '/lavoro-contratti/calcolo-tfr/', testo: 'Calcola il TFR' },
      { href: '/lavoro-contratti/calcolo-naspi/', testo: 'Calcola la NASpI' }
    ],
    corpo,
    errori: [
      'Mandare solo la lettera o la raccomandata: senza il modulo telematico le dimissioni non sono valide.',
      'Contare il preavviso dal giorno sbagliato: in alcuni contratti decorre dalla met&agrave; o dalla fine del mese.',
      'Smettere di presentarsi al lavoro sperando nel licenziamento: dal 2025 l&rsquo;assenza prolungata pu&ograve; valere come dimissioni, senza NASpI.',
      'Dimettersi pensando di avere comunque la disoccupazione: con le dimissioni volontarie la NASpI non spetta.',
      'Presentare la domanda di NASpI oltre i 68 giorni: la domanda tardiva non viene accolta.'
    ],
    faq: [
      { d: 'Posso ritirare le dimissioni?', r: 'S&igrave;, entro sette giorni dall&rsquo;invio del modulo, con lo stesso servizio online del Ministero del Lavoro o tramite chi ti ha aiutato a inviarle.' },
      { d: 'Devo lavorare il preavviso se ho gi&agrave; un nuovo lavoro?', r: 'Se non lo lavori, il datore di lavoro pu&ograve; trattenere l&rsquo;indennit&agrave; per i giorni mancanti. Puoi per&ograve; chiedere di ridurlo o di rinunciarvi: se l&rsquo;azienda accetta, mettetelo per iscritto.' },
      { d: 'Se mi dimetto ho diritto al TFR?', r: 'S&igrave;: il TFR spetta sempre alla fine del rapporto, qualunque sia il motivo, salvo che tu lo abbia destinato a un fondo pensione.' },
      { d: 'Chi si dimette per giusta causa prende la NASpI?', r: 'S&igrave;: le dimissioni per giusta causa sono considerate perdita involontaria del lavoro. La causa va indicata nel modulo telematico e, se l&rsquo;INPS o l&rsquo;azienda la contestano, dimostrata.' },
      { d: 'Entro quando si chiede la NASpI?', r: 'Entro 68 giorni dalla fine del rapporto, online sul sito dell&rsquo;INPS, con il contact center o tramite un patronato.' }
    ],
    fonti: [
      'D.Lgs. 14 settembre 2015, n. 151, art. 26: dimissioni telematiche.',
      'Legge 13 dicembre 2024, n. 203, art. 19: dimissioni per assenza ingiustificata.',
      'Codice civile, art. 2118: recesso con preavviso.',
      'Codice civile, art. 2119: recesso per giusta causa.',
      'Codice civile, art. 2120: trattamento di fine rapporto.',
      'D.P.R. 22 dicembre 1986, n. 917, art. 19: tassazione del TFR.',
      'D.Lgs. 4 marzo 2015, n. 22: disciplina della NASpI.',
      'Legge 30 dicembre 2024, n. 207, art. 1: requisito delle 13 settimane dopo le dimissioni.'
    ]
  };
};
