// Guida: il bollo auto 2026, Regione per Regione.
// Le cifre vengono da js/bollo-calcolo.js con le tariffe di
// data/regole-fiscali-2026.json (bollo_auto_2026).
'use strict';

module.exports = function (ctx) {
  const { h, euro, num } = ctx;
  const R = ctx.regole.bollo_auto_2026;
  const conto = (kw, regione, classe, anni) => ctx.motori.bollo.calcola({ kw, classe: classe || 'euro_4_5_6', regione, anni: anni || 0 }, R);

  const NOMI = { nazionale: 'Tariffa nazionale', abruzzo: 'Abruzzo', campania: 'Campania', emilia_romagna: 'Emilia-Romagna', lazio: 'Lazio', toscana: 'Toscana', bolzano: 'Provincia di Bolzano' };
  const regioni = Object.keys(NOMI);
  const potenze = [55, 85, 110, 150];
  const naz = R.regioni.nazionale.classi_euro;
  const nonCaricate = R.regioni_con_tariffa_propria.filter((r) => !R.regioni[r])
    .map((r) => (R.regioniSEO.find((x) => x.slug === r) || { nome: r }).nome);

  const e85 = conto(85, 'nazionale');
  const e140t = conto(140, 'toscana');
  const e140n = conto(140, 'nazionale');
  const s220 = conto(220, 'nazionale', 'euro_4_5_6', 6);
  const s220nuova = conto(220, 'nazionale', 'euro_4_5_6', 2);
  const e3 = conto(85, 'nazionale', 'euro_3');
  const maxRincaro = Math.max.apply(null, regioni.map((r) => conto(85, r).bollo / e85.bollo - 1));
  const piuCaro = regioni.map((r) => ({ r, v: conto(110, r).bollo })).sort((a, b) => b.v - a.v);

  const corpo = [
    h.h2('come-si-calcola', 'Come si calcola il bollo'),
    h.p('Il bollo auto (la tassa automobilistica) si paga ogni anno sul possesso del veicolo, non sul suo uso: &egrave; dovuto anche se l&rsquo;auto resta ferma. Contano tre cose sole: la <strong>potenza in kilowatt</strong> scritta alla voce P.2 del libretto, la <strong>classe ambientale Euro</strong> e la <strong>Regione di residenza</strong> del proprietario. Cilindrata, cavalli fiscali, valore dell&rsquo;auto e chilometri non c&rsquo;entrano.'),
    h.p('Il conto ha due gradini. Per i primi 100 kW si paga una tariffa per ogni kW; per ogni kW oltre i 100 si paga una tariffa pi&ugrave; alta. Con la tariffa nazionale, per un&rsquo;auto Euro 4, 5 o 6, sono ' + euro(naz.euro_4_5_6.tariffa_base) + ' per kW fino a 100 e ' + euro(naz.euro_4_5_6.tariffa_eccedente) + ' per ogni kW in pi&ugrave;. Le classi pi&ugrave; vecchie pagano di pi&ugrave;: un&rsquo;Euro 3 paga ' + euro(naz.euro_3.tariffa_base) + ' per kW, un&rsquo;Euro 0 ' + euro(naz.euro_0.tariffa_base) + '. Se il libretto riporta i decimali (per esempio 85,9 kW), si conta la parte intera.'),
    h.esempio('utilitaria Euro 6 da 85 kW, tariffa nazionale', [
      '85 kW sono sotto i 100: si usa solo la prima tariffa.',
      '85 &times; ' + euro(naz.euro_4_5_6.tariffa_base) + ' = ' + euro(e85.bollo) + '.',
      'La stessa auto in classe Euro 3 pagherebbe 85 &times; ' + euro(naz.euro_3.tariffa_base) + ' = ' + euro(e3.bollo) + ', cio&egrave; ' + euro(e3.bollo - e85.bollo) + ' in pi&ugrave; all&rsquo;anno.'
    ], 'Bollo annuo: ' + euro(e85.bollo) + '.'),
    h.p('La differenza fra le classi Euro, sul bollo, &egrave; piccola. Pesano molto di pi&ugrave; la Regione, per chi abita dove le tariffe sono state aumentate, e il superbollo, per le auto potenti.'),

    h.h2('regioni', 'Quanto si paga Regione per Regione'),
    h.p('La legge permette alle Regioni di aumentare la tariffa nazionale, e molte lo hanno fatto. La tabella mette a confronto il bollo annuo di un&rsquo;auto Euro 4, 5 o 6 con le tariffe 2026 che abbiamo verificato sui tariffari regionali pubblicati dall&rsquo;ACI. Le Regioni che non compaiono applicano la tariffa nazionale, salvo quelle indicate subito sotto la tabella.'),
    h.tabella('Bollo annuo 2026, auto Euro 4, 5 e 6 (euro)', ['Regione'].concat(potenze.map((k) => k + ' kW')),
      regioni.map((r) => [NOMI[r]].concat(potenze.map((k) => euro(conto(k, r).bollo))))),
    h.p('A parit&agrave; di auto, da 110 kW, la differenza fra la tariffa pi&ugrave; alta della tabella (' + NOMI[piuCaro[0].r] + ', ' + euro(piuCaro[0].v) + ') e la pi&ugrave; bassa (' + NOMI[piuCaro[piuCaro.length - 1].r] + ', ' + euro(piuCaro[piuCaro.length - 1].v) + ') &egrave; di ' + euro(piuCaro[0].v - piuCaro[piuCaro.length - 1].v) + ' all&rsquo;anno.'),
    h.nota('Anche ' + nonCaricate.join(', ') + ' hanno tariffe proprie, ma per il 2026 non abbiamo ancora un tariffario ufficiale completo da cui prenderle. Per chi abita l&igrave; il calcolatore usa la tariffa nazionale e lo segnala: l&rsquo;importo esatto &egrave; quello del calcolo dell&rsquo;ACI o della Regione.'),
    h.esempio('SUV Euro 6 da 140 kW in Toscana', [
      'Primi 100 kW: 100 &times; ' + euro(R.regioni.toscana.classi_euro.euro_4_5_6.tariffa_base) + ' = ' + euro(100 * R.regioni.toscana.classi_euro.euro_4_5_6.tariffa_base) + '.',
      'I 40 kW in pi&ugrave;: 40 &times; ' + euro(R.regioni.toscana.classi_euro.euro_4_5_6.tariffa_eccedente) + ' = ' + euro(40 * R.regioni.toscana.classi_euro.euro_4_5_6.tariffa_eccedente) + '.',
      'Con la tariffa nazionale la stessa auto pagherebbe ' + euro(e140n.bollo) + '.'
    ], 'Bollo annuo in Toscana: ' + euro(e140t.bollo) + '. Niente superbollo, perch&eacute; resta sotto i 185 kW.'),
    h.p('La Regione che conta &egrave; quella di residenza del proprietario risultante al Pubblico Registro Automobilistico, non quella in cui l&rsquo;auto &egrave; stata comprata o immatricolata. Per le societ&agrave; conta la sede legale; per il noleggio a lungo termine paga chi usa l&rsquo;auto, nella Regione in cui risiede.'),

    h.h2('superbollo', 'Il superbollo sopra i 185 kW'),
    h.p('Sulle auto con pi&ugrave; di ' + R.superbollo.franchigia_kw + ' kW si paga anche il superbollo, un&rsquo;addizionale che va allo Stato e non alla Regione. Si calcola solo sui kW oltre la soglia: ' + euro(R.superbollo.importo_base_kw, 0) + ' per ogni kW nei primi cinque anni dalla costruzione, poi la tariffa scende a scalini e dopo vent&rsquo;anni non &egrave; pi&ugrave; dovuto.'),
    h.tabella('Superbollo per un&rsquo;auto da 220 kW (35 kW oltre la soglia)', ['Anni dalla costruzione', 'Euro per kW', 'Superbollo annuo'],
      R.superbollo.scaglioni_riduzione.map((f) => [
        f.anni_max >= 999 ? f.anni_min + ' e oltre' : f.anni_min + '&ndash;' + f.anni_max,
        euro(f.tariffa_kw, 0),
        euro(conto(220, 'nazionale', 'euro_4_5_6', f.anni_min).superbollo)
      ])),
    h.esempio('berlina Euro 6 da 220 kW con sei anni, tariffa nazionale', [
      'Bollo regionale: 100 &times; ' + euro(naz.euro_4_5_6.tariffa_base) + ' + 120 &times; ' + euro(naz.euro_4_5_6.tariffa_eccedente) + ' = ' + euro(s220.bollo) + '.',
      'Superbollo: 35 kW oltre i 185 &times; ' + euro(s220.tariffaSuperbollo, 0) + ' (auto con pi&ugrave; di cinque anni) = ' + euro(s220.superbollo) + '.',
      'Con meno di cinque anni il superbollo sarebbe stato di ' + euro(s220nuova.superbollo) + '.'
    ], 'Totale annuo: ' + euro(s220.totale) + '.'),
    h.p('Il calo &egrave; a scalini: il giorno in cui l&rsquo;auto compie cinque anni si passa di colpo alla tariffa pi&ugrave; bassa. Per questo, se si compra un&rsquo;auto potente usata, conviene guardare la data di costruzione: pu&ograve; anticipare di un anno l&rsquo;immatricolazione, soprattutto per le auto rimaste a lungo in concessionaria.'),

    h.h2('quando', 'Quando si paga e dove'),
    h.ul([
      '<strong>Auto nuova:</strong> il primo bollo si paga entro la fine del mese di immatricolazione; se l&rsquo;auto &egrave; immatricolata negli ultimi dieci giorni del mese, entro la fine del mese successivo.',
      '<strong>Gli anni seguenti:</strong> entro la fine del mese successivo a quello in cui scade il bollo precedente. Alcune Regioni hanno scadenze proprie o permettono di pagare in anticipo con uno sconto: controlla il sito della tua Regione.',
      '<strong>Dove:</strong> il pagamento passa da pagoPA. Si paga sul sito della Regione o dell&rsquo;ACI, dall&rsquo;app della banca, alle Poste, in tabaccheria e nelle agenzie di pratiche auto. Tieni la ricevuta: &egrave; la prova del pagamento se la Regione ti chiede il bollo di un anno gi&agrave; pagato.'
    ]),
    h.p('Se paghi in ritardo, alla tassa si aggiungono una sanzione e gli interessi, che il ravvedimento operoso riduce di molto se ti metti in regola da solo e presto. Per il conto preciso c&rsquo;&egrave; il <a href="/fisco-professioni/ravvedimento-operoso/" class="text-indigo-700 underline">calcolatore del ravvedimento</a>.'),

    h.h2('esenzioni', 'Chi non paga o paga meno'),
    h.ul([
      '<strong>Auto elettriche:</strong> esenti per i primi cinque anni dall&rsquo;immatricolazione; dopo, in molte Regioni pagano un quarto della tariffa, e alcune Regioni sono pi&ugrave; generose.',
      '<strong>Persone con disabilit&agrave;:</strong> esenzione per un veicolo, entro i limiti di cilindrata previsti, intestato alla persona con disabilit&agrave; o al familiare che la ha fiscalmente a carico. L&rsquo;esenzione va chiesta alla Regione o all&rsquo;ACI con la documentazione sanitaria.',
      '<strong>Auto con pi&ugrave; di trent&rsquo;anni:</strong> esenti dal bollo; se circolano pagano una tassa di circolazione forfettaria.',
      '<strong>Auto ibride e a gas:</strong> diverse Regioni prevedono riduzioni o esenzioni temporanee; le regole cambiano da Regione a Regione.'
    ]),
    h.p('Per il 2027 il decreto-legge 17 settembre 2026, n. 162 (art. 2) esenta dal bollo un solo veicolo a persona: un&rsquo;auto a benzina o gasolio, anche ibrida, fino a 80 kW oppure, per chi non ha auto fino a 80 kW, una moto o un ciclomotore a benzina. Il decreto &egrave; in vigore dal 18 settembre 2026 ma deve essere convertito in legge e pu&ograve; ancora cambiare; il bollo del 2026 si paga come sempre. Per sapere su quale dei tuoi veicoli si applica c&rsquo;&egrave; la <a href="/cittadino-tasse/esenzione-bollo-auto-2027/" class="text-indigo-700 underline">verifica dell&rsquo;esenzione 2027</a>.'),

    h.h2('fine', 'Quando il bollo non &egrave; pi&ugrave; dovuto'),
    h.p('Il bollo smette di essere dovuto quando l&rsquo;auto esce dal Pubblico Registro Automobilistico: demolizione o esportazione con radiazione. In caso di furto, conta l&rsquo;annotazione della perdita di possesso al PRA. Vendere l&rsquo;auto senza fare il passaggio di propriet&agrave; non basta: per la Regione il proprietario resta chi risulta al PRA. Chi vende deve quindi assicurarsi che il <a href="/cittadino-tasse/passaggio-di-proprieta/" class="text-indigo-700 underline">passaggio di propriet&agrave;</a> sia stato registrato.'),
    h.p('Il diritto della Regione a chiedere un bollo non pagato si prescrive alla fine del terzo anno successivo a quello in cui andava pagato: per un bollo scaduto nel 2022, il 31 dicembre 2025. Un avviso di accertamento o una cartella notificati prima di quella data interrompono la prescrizione e il conto riparte.')
  ].join('\n');

  return {
    slug: 'bollo-auto-2026',
    tema: 'casa',
    titolo: 'Bollo auto 2026: quanto si paga, Regione per Regione',
    titoloBreve: 'Bollo auto 2026: quanto si paga Regione per Regione',
    descrizione: 'Come si calcola il bollo auto 2026: tariffe per kW e classe Euro, differenze fra Regioni, superbollo sopra i 185 kW, scadenze, esenzioni ed esempi con i numeri.',
    pubblicata: '2026-09-26',
    aggiornata: '2026-09-27',
    introduzione: 'Due auto uguali possono pagare un bollo diverso solo perch&eacute; i proprietari abitano in Regioni diverse. Questa guida spiega come si fa il conto, quanto cambia da una Regione all&rsquo;altra con le tariffe 2026, quando scatta il superbollo e chi pu&ograve; non pagarlo.',
    riassunto: [
      'Il bollo dipende da kW (voce P.2 del libretto), classe Euro e Regione di residenza del proprietario al PRA.',
      'Con la tariffa nazionale un&rsquo;auto Euro 6 da 85 kW paga ' + euro(e85.bollo) + '; nelle Regioni con tariffe proprie si paga fino al ' + ctx.pct(maxRincaro) + ' in pi&ugrave;.',
      'Oltre i 185 kW si aggiunge il superbollo: ' + euro(R.superbollo.importo_base_kw, 0) + ' per kW, che scende dopo 5, 10 e 15 anni e sparisce dopo 20.'
    ],
    strumenti: [
      { href: '/cittadino-tasse/calcolo-bollo-auto/', testo: 'Calcolatore bollo auto e superbollo' }
    ],
    corpo,
    errori: [
      'Usare i cavalli al posto dei kW: il bollo si calcola solo sui kW della voce P.2. Se hai solo i CV, dividi per 1,36, ma verifica sul libretto.',
      'Guardare la Regione in cui si &egrave; comprata l&rsquo;auto: conta la residenza del proprietario al PRA.',
      'Non pagare perch&eacute; l&rsquo;auto &egrave; ferma o senza assicurazione: il bollo &egrave; dovuto comunque, finch&eacute; l&rsquo;auto non &egrave; radiata.',
      'Vendere l&rsquo;auto senza controllare che il passaggio di propriet&agrave; sia registrato: i bolli successivi continuano a essere chiesti al vecchio proprietario.',
      'Buttare le ricevute: la Regione pu&ograve; chiedere un anno gi&agrave; pagato, e la ricevuta &egrave; la prova pi&ugrave; semplice.'
    ],
    faq: [
      { d: 'Il bollo si paga anche se l&rsquo;auto non circola?', r: 'S&igrave;. &Egrave; una tassa sul possesso: si paga finch&eacute; l&rsquo;auto risulta al PRA, anche se &egrave; ferma in garage o senza assicurazione.' },
      { d: 'Dove trovo i kW della mia auto?', r: 'Sulla carta di circolazione, alla voce P.2. Se sono indicati con i decimali si considera la parte intera.' },
      { d: 'Mi sono trasferito in un&rsquo;altra Regione: quale tariffa pago?', r: 'Quella della Regione di residenza risultante al PRA alla scadenza del bollo. Dopo il cambio di residenza conviene controllare che il PRA sia stato aggiornato.' },
      { d: 'Il superbollo si paga anche sulle auto usate?', r: 'S&igrave;, sulle auto oltre i 185 kW, ma cala con gli anni dalla costruzione: dopo cinque anni si paga il 60%, dopo dieci il 30%, dopo quindici il 15%, e dopo venti non &egrave; pi&ugrave; dovuto.' },
      { d: 'Perch&eacute; per la mia Regione il calcolatore dice che l&rsquo;importo &egrave; indicativo?', r: 'Perch&eacute; la tua Regione ha tariffe proprie che non abbiamo ancora potuto verificare su un documento ufficiale completo. In quel caso usiamo la tariffa nazionale e lo segnaliamo: l&rsquo;importo esatto &egrave; quello del calcolo dell&rsquo;ACI.' }
    ],
    fonti: [
      'D.P.R. 5 febbraio 1953, n. 39: testo unico delle tasse automobilistiche.',
      'Legge 27 dicembre 1997, n. 449, art. 17: tariffe per kW e poteri delle Regioni.',
      'D.L. 6 dicembre 2011, n. 201, art. 16: superbollo.',
      'Legge 21 novembre 2000, n. 342, art. 63: veicoli con pi&ugrave; di trent&rsquo;anni.',
      'D.L. 30 dicembre 1982, n. 953, art. 5: prescrizione delle tasse automobilistiche.',
      'D.L. 17 settembre 2026, n. 162, art. 2: esenzione dal bollo per il 2027.',
      { href: 'https://online.aci.it/acinet/calcolobollo/', testo: 'ACI: calcolo del bollo online' },
      { href: 'https://aci.gov.it/servizi/bollo-auto/', testo: 'ACI: servizi per il bollo auto' }
    ]
  };
};
