// Guida: ravvedimento operoso 2026, tabelle ed esempi.
// Cifre da js/ravvedimento-calcolo.js con ravvedimento di
// data/regole-fiscali-2026.json (percentuali della scheda dell'Agenzia).
'use strict';

module.exports = function (ctx) {
  const { h, euro, pct } = ctx;
  const C = ctx.regole.ravvedimento;
  const R = ctx.motori.ravvedimento;
  const conto = (importo, scadenza, pagamento, tributo) => R.calcola({ importo, scadenza, pagamento, tributo: tributo || 'IRPEF' }, C);
  const F = C.frazioniTemporaliSanzione;
  const FP = C.frazioniTemporaliSanzionePrecedenti;
  // percentuali con i decimali delle tabelle ufficiali (0,0833%, 1,3889%, 3,125%)
  const p = (x) => pct(x, 4).replace(/0+%$/, '%').replace(/,%$/, '%');

  const sprint = conto(1000, '2026-06-16', '2026-06-26', 'IMU');
  const breve = conto(1000, '2026-06-16', '2026-07-16', 'IMU');
  const intermedio = conto(2000, '2026-03-16', '2026-05-15', 'IVA');
  const lungo = conto(1000, '2025-06-30', '2026-02-02', 'IRPEF');
  const oltre = conto(1000, '2024-09-16', '2026-01-29', 'IRPEF');
  const anni = Object.keys(C.tassiStoriciLegali).sort().reverse().slice(0, 4);
  // quanto costa aspettare: 1.000 euro scaduti il 16 gennaio 2025
  const attese = [10, 30, 60, 120, 400].map((g) => {
    const d = new Date(Date.UTC(2025, 0, 16 + g)).toISOString().slice(0, 10);
    return { g, r: conto(1000, '2025-01-16', d, 'IRPEF') };
  });

  const corpo = [
    h.h2('cos-e', 'Che cos&rsquo;&egrave; il ravvedimento operoso'),
    h.p('Il ravvedimento operoso permette di rimediare da soli a un pagamento saltato, fatto in ritardo o insufficiente, pagando una sanzione molto ridotta rispetto a quella che si pagherebbe dopo un controllo. Vale per le imposte gestite dall&rsquo;Agenzia delle Entrate (IRPEF, IVA, ritenute, imposta di registro) e per i tributi locali come l&rsquo;IMU.'),
    h.p('Funziona finch&eacute; l&rsquo;errore non ti &egrave; stato contestato: per le imposte dell&rsquo;Agenzia, fino alla notifica di un atto di liquidazione o di accertamento (compresi gli avvisi bonari). Controlli, ispezioni e questionari non lo impediscono. Si pu&ograve; anche ravvedere solo una parte del debito, e il resto pi&ugrave; avanti, con la sanzione della fascia in cui paghi ciascuna parte.'),

    h.h2('tabella', 'Le riduzioni della sanzione'),
    h.p('Per un versamento omesso o tardivo la sanzione piena &egrave; il ' + pct(C.sanzioneBase) + ' dell&rsquo;imposta, dimezzata al ' + pct(C.sanzioneBase / 2, 1) + ' se paghi entro 90 giorni. Il ravvedimento la riduce ancora, tanto pi&ugrave; quanto prima paghi. Le percentuali qui sotto sono gi&agrave; quelle finali, da applicare all&rsquo;imposta non versata: sono le stesse della tabella dell&rsquo;Agenzia delle Entrate.'),
    h.tabella('Sanzione ridotta per violazioni dal 1&deg; settembre 2024', ['Quando paghi', 'Riduzione', 'Sanzione sull&rsquo;imposta'], [
      ['Entro 14 giorni dalla scadenza', '1/15 dell&rsquo;1,25% per ogni giorno', p(F[0].tassoApplicato) + ' al giorno (circa ' + pct(F[0].tassoApplicato * 14, 2) + ' a 14 giorni)'],
      ['Dal 15&deg; al 30&deg; giorno', '1/10 del 12,5%', p(F[1].tassoApplicato)],
      ['Dal 31&deg; al 90&deg; giorno', '1/9 del 12,5%', p(F[2].tassoApplicato)],
      ['Dal 91&deg; giorno a un anno', '1/8 del 25%', p(F[3].tassoApplicato)],
      ['Oltre un anno', '1/7 del 25%', p(F[4].tassoApplicato)]
    ]),
    h.p('Per le violazioni commesse <strong>prima del 1&deg; settembre 2024</strong> restano le misure precedenti, calcolate sulla sanzione del 30%: ' + p(FP[1].tassoApplicato) + ' entro 30 giorni, ' + p(FP[2].tassoApplicato) + ' entro 90, ' + p(FP[3].tassoApplicato) + ' entro un anno, ' + p(FP[4].tassoApplicato) + ' entro due anni e ' + p(FP[5].tassoApplicato) + ' oltre. Conta la data della violazione, cio&egrave; il giorno dopo la scadenza, non quella in cui paghi.'),

    h.h2('interessi', 'Gli interessi'),
    h.p('Oltre alla sanzione si pagano gli interessi al tasso legale, giorno per giorno, dal giorno dopo la scadenza fino a quello del pagamento compreso. Il tasso cambia ogni anno con un decreto del Ministero dell&rsquo;Economia: se il ritardo attraversa pi&ugrave; anni, ogni periodo si calcola con il suo tasso.'),
    h.tabella('Tasso di interesse legale', ['Anno', 'Tasso'], anni.map((a) => [a, pct(C.tassiStoriciLegali[a], 2)])),

    h.h2('esempi', 'Esempi con i numeri'),
    h.esempio('acconto IMU di ' + euro(1000, 0) + ' pagato con 10 giorni di ritardo', [
      'Scadenza 16 giugno 2026, pagamento 26 giugno: ' + sprint.giorni + ' giorni, ravvedimento sprint.',
      'Sanzione: ' + euro(1000, 0) + ' &times; ' + p(F[0].tassoApplicato) + ' &times; ' + sprint.giorni + ' = ' + euro(sprint.sanzione) + '.',
      'Interessi: ' + euro(1000, 0) + ' &times; ' + pct(C.tassiStoriciLegali['2026'], 1) + ' &times; ' + sprint.giorni + '/365 = ' + euro(sprint.interessi) + '.'
    ], 'Totale ' + euro(sprint.totale) + '. Con l&rsquo;IMU sanzione e interessi si sommano all&rsquo;imposta nello stesso codice tributo, barrando la casella del ravvedimento.'),
    h.p('Lo stesso acconto pagato il 16 luglio, dopo ' + breve.giorni + ' giorni, avrebbe una sanzione di ' + euro(breve.sanzione) + ' (' + p(F[1].tassoApplicato) + ') e ' + euro(breve.interessi) + ' di interessi.'),
    h.esempio('IVA di ' + euro(2000, 0) + ' pagata dopo due mesi', [
      'Scadenza 16 marzo 2026, pagamento 15 maggio: ' + intermedio.giorni + ' giorni, fra il 31&deg; e il 90&deg;.',
      'Sanzione: ' + euro(2000, 0) + ' &times; ' + p(F[2].tassoApplicato) + ' = ' + euro(intermedio.sanzione) + ', codice ' + intermedio.codici.sanzione + '.',
      'Interessi: ' + euro(intermedio.interessi) + ', codice ' + intermedio.codici.interessi + '.'
    ], 'Totale ' + euro(intermedio.totale) + ' su tre righe dell&rsquo;F24: imposta, sanzione e interessi.'),
    h.esempio('saldo IRPEF di ' + euro(1000, 0) + ' scaduto il 30 giugno 2025, pagato il 2 febbraio 2026', [
      lungo.giorni + ' giorni di ritardo: fra 91 giorni e un anno, riduzione a 1/8.',
      'Sanzione: ' + euro(1000, 0) + ' &times; ' + p(F[3].tassoApplicato) + ' = ' + euro(lungo.sanzione) + ', codice ' + lungo.codici.sanzione + '.',
      'Interessi: al ' + pct(C.tassiStoriciLegali['2025'], 0) + ' per i giorni del 2025 e all&rsquo;' + pct(C.tassiStoriciLegali['2026'], 1) + ' per quelli del 2026 = ' + euro(lungo.interessi) + ', codice ' + lungo.codici.interessi + '.'
    ], 'Totale ' + euro(lungo.totale) + '.'),
    h.p('Oltre un anno la riduzione &egrave; a 1/7: un&rsquo;imposta di ' + euro(1000, 0) + ' scaduta il 16 settembre 2024 e pagata il 29 gennaio 2026 (' + oltre.giorni + ' giorni) costa ' + euro(oltre.sanzione) + ' di sanzione e ' + euro(oltre.interessi) + ' di interessi, calcolati con tre tassi diversi.'),

    h.h2('conviene', 'Quanto costa aspettare'),
    h.p('La tabella mostra quanto costa rimediare a un&rsquo;imposta di ' + euro(1000, 0) + ' non pagata alla scadenza del 16 gennaio 2025, a seconda di quando si paga. Anche dopo un anno il costo resta basso rispetto alla sanzione piena: il ravvedimento conviene sempre, e prima si fa meno costa.'),
    h.tabella('Ravvedimento su ' + euro(1000, 0) + ' scaduti il 16 gennaio 2025', ['Giorni di ritardo', 'Sanzione', 'Interessi', 'Totale oltre l&rsquo;imposta'],
      attese.map(({ g, r }) => [String(g), euro(r.sanzione) + ' (' + p(r.aliquota) + ')', euro(r.interessi), euro(r.sanzione + r.interessi)])),
    h.p('Se invece si aspetta che l&rsquo;errore venga trovato dall&rsquo;Agenzia con un controllo automatico, arriva una comunicazione (il cosiddetto avviso bonario): pagando entro 30 giorni la sanzione &egrave; ridotta a un terzo, cio&egrave; circa l&rsquo;8,33% dell&rsquo;imposta. &Egrave; comunque molto pi&ugrave; di quanto costa il ravvedimento fatto per tempo.'),

    h.h2('f24', 'Come si paga con l&rsquo;F24'),
    h.ol([
      'Una riga con l&rsquo;<strong>imposta</strong>, con il suo codice tributo e l&rsquo;anno di riferimento dell&rsquo;imposta (non quello in cui paghi).',
      'Una riga con la <strong>sanzione</strong>: per esempio 8901 per l&rsquo;IRPEF, 8904 per l&rsquo;IVA, 8906 per le ritenute.',
      'Una riga con gli <strong>interessi</strong>: 1989 per l&rsquo;IRPEF, 1991 per l&rsquo;IVA; per le ritenute gli interessi si sommano all&rsquo;imposta nello stesso codice.',
      'Per i tributi locali (IMU) imposta, sanzione e interessi vanno in un&rsquo;unica riga con il codice dell&rsquo;imposta e la casella del ravvedimento barrata.'
    ]),
    h.p('Se la violazione riguarda anche la dichiarazione (per esempio un reddito dimenticato) il ravvedimento comprende la presentazione di una dichiarazione integrativa, e le sanzioni sono diverse: in quel caso &egrave; meglio farsi aiutare da un CAF o da un commercialista.'),
    h.p('Per l&rsquo;imposta di registro sugli affitti registrati in ritardo le regole sono quelle della registrazione tardiva, spiegate nella <a href="/guide/registrare-contratto-affitto/" class="text-indigo-700 underline">guida sul contratto d&rsquo;affitto</a>.')
  ].join('\n');

  return {
    slug: 'ravvedimento-operoso',
    tema: 'partita-iva',
    titolo: 'Ravvedimento operoso 2026: tabelle, interessi ed esempi',
    titoloBreve: 'Ravvedimento operoso 2026: tabelle ed esempi',
    descrizione: 'Come rimediare a un pagamento saltato o in ritardo: le riduzioni della sanzione dal 1° settembre 2024, il tasso di interesse legale, i codici tributo dell’F24 ed esempi calcolati per IMU, IVA e IRPEF.',
    pubblicata: '2026-09-27',
    aggiornata: '2026-09-27',
    introduzione: 'Hai dimenticato una scadenza o pagato meno del dovuto? Prima che arrivi un controllo puoi rimediare da solo con il ravvedimento operoso, pagando una sanzione ridotta e gli interessi. Questa guida spiega le percentuali in vigore, come si contano i giorni, come si calcolano gli interessi e come si compila l&rsquo;F24, con esempi calcolati.',
    riassunto: [
      'Dal 1&deg; settembre 2024 la sanzione per il mancato versamento &egrave; il ' + pct(C.sanzioneBase) + ' (' + pct(C.sanzioneBase / 2, 1) + ' entro 90 giorni); con il ravvedimento scende fino allo ' + p(F[0].tassoApplicato) + ' al giorno.',
      'Si aggiungono gli interessi al tasso legale (' + pct(C.tassoInteresseLegaleVigente, 1) + ' nel 2026), giorno per giorno.',
      'Si paga con l&rsquo;F24: imposta, sanzione e interessi su righe separate, tranne per l&rsquo;IMU.'
    ],
    strumenti: [
      { href: '/fisco-professioni/ravvedimento-operoso/', testo: 'Calcola il ravvedimento' },
      { href: '/cittadino-tasse/f24-editabile/f24-ordinario/', testo: 'Compila l&rsquo;F24' }
    ],
    corpo,
    errori: [
      'Usare le percentuali nuove per una scadenza precedente al 1&deg; settembre 2024: conta la data della violazione.',
      'Scrivere nell&rsquo;F24 l&rsquo;anno in cui paghi invece dell&rsquo;anno a cui si riferisce l&rsquo;imposta.',
      'Dimenticare gli interessi, o calcolarli con un solo tasso quando il ritardo attraversa pi&ugrave; anni.',
      'Pagare sanzione e interessi dell&rsquo;IMU con codici separati: vanno sommati all&rsquo;imposta nel codice dell&rsquo;IMU.',
      'Aspettare l&rsquo;avviso: dopo la notifica di un atto il ravvedimento non si pu&ograve; pi&ugrave; fare e la sanzione &egrave; piena.'
    ],
    faq: [
      { d: 'Fino a quando posso fare il ravvedimento?', r: 'Per le imposte dell&rsquo;Agenzia delle Entrate finch&eacute; non ti &egrave; stato notificato un atto di liquidazione o di accertamento, compresi gli avvisi bonari. Oltre un anno dalla scadenza la riduzione &egrave; comunque a 1/7.' },
      { d: 'Posso ravvedere solo una parte del debito?', r: 'S&igrave;: il ravvedimento parziale &egrave; ammesso. Ogni pagamento ha la sanzione e gli interessi della fascia in cui lo fai.' },
      { d: 'Come si calcolano i giorni di ritardo?', r: 'Dal giorno dopo la scadenza al giorno del pagamento compreso. Se la scadenza cade di sabato o in un festivo, slitta al primo giorno lavorativo e i giorni si contano da l&igrave;.' },
      { d: 'Il ravvedimento vale anche per l&rsquo;IMU?', r: 'S&igrave;. Per l&rsquo;IMU imposta, sanzione e interessi si sommano in un&rsquo;unica riga dell&rsquo;F24 con il codice dell&rsquo;imposta e la casella del ravvedimento barrata.' },
      { d: 'Quale tasso di interesse si usa?', r: 'Il tasso legale di ciascun anno: ' + anni.map((a) => pct(C.tassiStoriciLegali[a], 1) + ' nel ' + a).join(', ') + '.' }
    ],
    fonti: [
      'D.Lgs. 18 dicembre 1997, n. 472, art. 13: ravvedimento operoso.',
      'D.Lgs. 18 dicembre 1997, n. 471, art. 13: sanzione per omesso o tardivo versamento.',
      'D.Lgs. 14 giugno 2024, n. 87: nuove misure delle sanzioni dal 1&deg; settembre 2024.',
      'D.Lgs. 18 dicembre 1997, n. 462, art. 2: sanzioni ridotte a un terzo dopo la comunicazione di irregolarit&agrave;.',
      'Codice civile, art. 1284: saggio degli interessi legali.',
      'Agenzia delle Entrate: modello F24 e istruzioni per la compilazione.'
    ]
  };
};
