// js/multa-termini.js — I termini di un verbale del Codice della Strada.
//
// Che cosa fa: prende le date e gli importi di una multa e restituisce un
// CALENDARIO. Quando scadono i cinque giorni dello sconto, i sessanta del
// pagamento, i trenta e i sessanta dei due ricorsi, e se la notifica e' arrivata
// entro il termine di legge.
//
// Che cosa NON fa, di proposito: non dice se il ricorso si vince. Non esiste in
// questo file un campo che possa contenere quel giudizio, e non deve esistere.
// Il superamento del termine di notifica e' UNO dei motivi che si possono far
// valere; a decidere sono il Prefetto o il Giudice di Pace.
//
// Tre regole di dominio che rendono il conto diverso da una somma di giorni:
//
//   1. Il termine decorre dal giorno DOPO (dies a quo non computatur). Novanta
//      giorni dall'accertamento del 1 gennaio scadono il 1 aprile, non il 31
//      marzo. E' l'errore piu' facile da fare qui, e sposta la risposta.
//   2. Lo sconto del 30% NON si applica sempre: e' escluso se c'e' confisca del
//      veicolo o sospensione della patente (art. 202 c.1). Se non si sa, la
//      risposta e' "indeterminata", mai "si applica". Mostrare un importo
//      ridotto quando non spetta fa pagare meno del dovuto: la multa resta
//      aperta e cresce.
//   3. Le spese di notifica non si riducono mai. Si sommano dopo lo sconto.
//
// Il motore non legge l'orologio: `oggi` si passa da fuori. Senza questo i test
// non sono deterministici.
//
// Funziona nel browser (window.MultaTermini) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MultaTermini = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var MS_GIORNO = 1000 * 60 * 60 * 24;

  // Le date si costruiscono sempre in ora locale. new Date('2026-01-01') le
  // interpreta come UTC: a ovest di Greenwich diventano il 31 dicembre 2025 e
  // ogni conteggio slitta di un giorno.
  function data(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v !== 'string') return null;
    var m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var anno = Number(m[1]), mese = Number(m[2]), giorno = Number(m[3]);
    var d = new Date(anno, mese - 1, giorno);
    // 31/02 ha la forma giusta ma non esiste: senza questo controllo diventerebbe
    // il 3 marzo, in silenzio.
    if (d.getFullYear() !== anno || d.getMonth() !== mese - 1 || d.getDate() !== giorno) return null;
    return d;
  }

  // Sempre da componenti locali. toISOString() rimetterebbe dentro lo scarto UTC
  // in uscita, che e' la forma subdola dello stesso errore.
  function testo(d) {
    if (!(d instanceof Date)) return null;
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  // Math.round e non Math.floor: con l'ora legale un giorno dura 23 o 25 ore due
  // volte l'anno, e floor perderebbe un giorno.
  function giorniFra(a, b) {
    return Math.round((b - a) / MS_GIORNO);
  }

  function aggiungiGiorni(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  // Number(null) e Number('') valgono 0, non NaN. Senza questo controllo un
  // importo mancante diventerebbe zero euro e lo strumento mostrerebbe
  // tranquillamente "importo ridotto: 0,00": un numero sbagliato e sicuro di se.
  function numero(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  // Un campo e' utilizzabile solo se c'e' E se l'utente l'ha confermato. Il
  // testo estratto da un PDF o da una foto non e' un dato confermato: un 3 letto
  // come 8 ribalta la risposta e nulla, dentro il programma, puo' accorgersene.
  function confermato(dati, campo) {
    var c = dati.confermato;
    return !!(c && c[campo] === true);
  }

  function scadenza(base, giorni, oggi) {
    var fine = aggiungiGiorni(base, giorni);
    var residui = oggi ? giorniFra(oggi, fine) : null;
    return {
      scadenza: testo(fine),
      giorniResidui: residui,
      stato: residui === null ? 'indeterminato' : (residui < 0 ? 'scaduto' : 'aperto')
    };
  }

  function termineIndeterminato(id, etichetta, riferimento, perche) {
    return {
      id: id,
      etichetta: etichetta,
      scadenza: null,
      giorniResidui: null,
      stato: 'indeterminato',
      base: null,
      riferimento: riferimento,
      perche: perche
    };
  }

  // --------------------------------------------------------- sconto del 30%

  function riduzione30(dati, regole, baseTesto) {
    var sconto = (regole && regole.sconto_30) || {};
    var acc = dati.sanzioniAccessorie || {};
    var rif = sconto.riferimento || 'art. 202 comma 1 CdS';
    var perc = Number.isFinite(sconto.percentuale) ? sconto.percentuale : 0.30;

    function esito(applicabile, motivo, importi) {
      return {
        applicabile: applicabile,
        importoSanzioneRidotta: importi ? importi.sanzione : null,
        spese: importi ? importi.spese : null,
        importoTotale: importi ? importi.totale : null,
        percentuale: perc,
        motivo: motivo,
        riferimento: rif
      };
    }

    if (acc.sospensionePatente === true) {
      return esito(false, 'La riduzione non si applica alle violazioni che comportano la sospensione della patente.', null);
    }
    if (acc.confiscaVeicolo === true) {
      return esito(false, 'La riduzione non si applica alle violazioni che comportano la confisca del veicolo.', null);
    }
    if (acc.esclusa3bis === true) {
      return esito(false, 'La violazione rientra fra quelle escluse dall’art. 202 comma 3-bis.', null);
    }

    // Indeterminato non e' "no": e' una risposta a se', e deve restare tale fino
    // in fondo. Se collassasse in "si applica", lo strumento mostrerebbe un
    // importo ridotto a chi non ne ha diritto.
    //
    // Ma questo vale solo per le due domande a cui si puo' rispondere leggendo
    // il verbale. L'elenco dell'art. 202 comma 3-bis qui non e' riprodotto:
    // chiedere all'utente se la sua violazione ci rientra, e bloccare il calcolo
    // finche' non risponde, non e' prudenza — e' una domanda senza risposta
    // possibile, che renderebbe lo strumento inutile. Quel punto diventa
    // un'avvertenza dichiarata accanto all'importo, non un muro.
    var ignote = [];
    if (acc.sospensionePatente !== false) ignote.push('la sospensione della patente');
    if (acc.confiscaVeicolo !== false) ignote.push('la confisca del veicolo');
    if (ignote.length) {
      return esito('indeterminata',
        'Non risulta se la violazione comporti ' + ignote.join(' o ') +
        '. Finché non è chiarito, l’importo ridotto non viene calcolato.',
        null);
    }

    var sanzione = numero(dati.importoSanzione);
    if (sanzione === null) {
      return esito('indeterminata', 'Manca l’importo della sanzione.', null);
    }
    if (!baseTesto) {
      return esito('indeterminata', 'Manca la data da cui decorrono i cinque giorni.', null);
    }

    var spese = numero(dati.spese) || 0;
    var ridotta = round2(sanzione * (1 - perc));
    return esito(true, null, {
      sanzione: ridotta,
      spese: spese,
      // Le spese di notifica non si riducono: si aggiungono dopo.
      totale: round2(ridotta + spese)
    });
  }

  // ------------------------------------------------------ termine di notifica

  function controlloNotifica(dati, regole) {
    var n = (regole && regole.notifica) || {};
    var limite = dati.residenzaEstero === true
      ? (n.giorni_residenti_estero || 360)
      : (n.giorni || 90);
    var rif = n.riferimento || 'art. 201 comma 1 CdS';

    if (dati.contestazioneImmediata === true) {
      return {
        verificabile: false,
        esito: 'non_applicabile',
        limite: limite,
        giorniTrascorsi: null,
        riferimento: rif,
        perche: 'Con la contestazione immediata il verbale è consegnato sul posto: il termine per la notifica non si applica.'
      };
    }

    var acc = confermato(dati, 'dataAccertamento') ? data(dati.dataAccertamento) : null;
    var not = confermato(dati, 'dataNotifica') ? data(dati.dataNotifica) : null;
    if (!acc || !not) {
      return {
        verificabile: false,
        esito: 'non_verificabile',
        limite: limite,
        giorniTrascorsi: null,
        riferimento: rif,
        perche: 'Servono la data dell’accertamento e quella della notifica, confermate.'
      };
    }

    var trascorsi = giorniFra(acc, not);
    if (trascorsi < 0) {
      return {
        verificabile: false,
        esito: 'date_incoerenti',
        limite: limite,
        giorniTrascorsi: trascorsi,
        riferimento: rif,
        perche: 'La notifica risulta precedente all’accertamento: una delle due date è sbagliata.'
      };
    }

    return {
      verificabile: true,
      // Il termine decorre dal giorno successivo, quindi novanta giorni esatti
      // sono ancora dentro il termine.
      esito: trascorsi <= limite ? 'nei_termini' : 'oltre_il_termine',
      limite: limite,
      giorniTrascorsi: trascorsi,
      riferimento: rif,
      perche: null
    };
  }

  // ------------------------------------------------------------------ analisi

  function analizza(dati, regole) {
    var d = dati || {};
    var r = regole || {};
    var oggi = data(d.oggi);
    var daChiarire = [];

    // Da quale data decorrono pagamento e ricorsi: la contestazione se il
    // verbale e' stato consegnato sul posto, altrimenti la notificazione.
    var campoBase = d.contestazioneImmediata === true ? 'dataContestazione' : 'dataNotifica';
    var valoreBase = d.contestazioneImmediata === true
      ? (d.dataContestazione || d.dataAccertamento)
      : d.dataNotifica;
    var baseOk = confermato(d, campoBase) ||
                 (d.contestazioneImmediata === true && confermato(d, 'dataAccertamento'));
    var base = baseOk ? data(valoreBase) : null;

    if (!base) {
      daChiarire.push({
        campo: campoBase,
        perche: 'Senza questa data non si può calcolare nessuna scadenza.',
        doveTrovarlo: d.contestazioneImmediata === true
          ? 'La data è quella scritta sul verbale che ti è stato consegnato.'
          : 'La data di notifica di solito NON è sul verbale: sta sulla busta, sulla cartolina verde dell’avviso di ricevimento o nel tracking della raccomandata.'
      });
    }

    var baseTesto = base ? testo(base) : null;
    var termini = [];

    var sconto = (r.sconto_30 && r.sconto_30.giorni) || 5;
    var pagamento = (r.pagamento && r.pagamento.giorni_misura_ridotta) || 60;

    if (base) {
      var s = scadenza(base, sconto, oggi);
      termini.push({
        id: 'sconto30', etichetta: 'Pagamento ridotto del 30%',
        scadenza: s.scadenza, giorniResidui: s.giorniResidui, stato: s.stato,
        base: baseTesto,
        riferimento: (r.sconto_30 && r.sconto_30.riferimento) || 'art. 202 comma 1 CdS'
      });

      var p = scadenza(base, pagamento, oggi);
      termini.push({
        id: 'pagamento', etichetta: 'Pagamento in misura ridotta',
        scadenza: p.scadenza, giorniResidui: p.giorniResidui, stato: p.stato,
        base: baseTesto,
        riferimento: (r.pagamento && r.pagamento.riferimento) || 'art. 202 comma 1 CdS'
      });

      (r.ricorsi || []).forEach(function (ric) {
        var q = scadenza(base, ric.giorni, oggi);
        termini.push({
          id: 'ricorso_' + String(ric.organo || '').toLowerCase().replace(/[^a-z]+/g, '_'),
          etichetta: 'Ricorso al ' + ric.organo,
          scadenza: q.scadenza, giorniResidui: q.giorniResidui, stato: q.stato,
          base: baseTesto, riferimento: ric.riferimento, nota: ric.nota
        });
      });
    } else {
      termini.push(termineIndeterminato('sconto30', 'Pagamento ridotto del 30%',
        (r.sconto_30 && r.sconto_30.riferimento) || 'art. 202 comma 1 CdS', 'Manca la data di decorrenza.'));
      termini.push(termineIndeterminato('pagamento', 'Pagamento in misura ridotta',
        (r.pagamento && r.pagamento.riferimento) || 'art. 202 comma 1 CdS', 'Manca la data di decorrenza.'));
      (r.ricorsi || []).forEach(function (ric) {
        termini.push(termineIndeterminato(
          'ricorso_' + String(ric.organo || '').toLowerCase().replace(/[^a-z]+/g, '_'),
          'Ricorso al ' + ric.organo, ric.riferimento, 'Manca la data di decorrenza.'));
      });
    }

    if (oggi === null) {
      daChiarire.push({
        campo: 'oggi',
        perche: 'Senza la data odierna si calcolano le scadenze ma non i giorni che restano.',
        doveTrovarlo: null
      });
    }

    var notifica = controlloNotifica(d, r);
    if (notifica.esito === 'non_verificabile' && d.contestazioneImmediata !== true) {
      daChiarire.push({
        campo: 'dataAccertamento',
        perche: 'Senza la data dell’accertamento non si può controllare se la notifica è arrivata nei termini.',
        doveTrovarlo: 'Sul verbale, di solito indicata come "data della violazione" o "data dell’accertamento", spesso con l’ora.'
      });
    }

    var avvertenze = [];
    var riduzione = riduzione30(d, r, baseTesto);
    if (riduzione.applicabile === 'indeterminata') {
      daChiarire.push({
        campo: 'sanzioniAccessorie',
        perche: riduzione.motivo,
        doveTrovarlo: 'Sul verbale, nella parte che elenca le sanzioni accessorie.'
      });
    }

    // L'assunzione su cui poggia l'importo ridotto va detta, non nascosta.
    var acc3 = (d.sanzioniAccessorie || {}).esclusa3bis;
    if (riduzione.applicabile === true && acc3 !== false) {
      var tris = ((r.sconto_30 && r.sconto_30.esclusioni) || [])
        .filter(function (e) { return /3-bis/.test(e.riferimento || ''); })[0];
      avvertenze.push({
        testo: 'L’importo ridotto presuppone che la violazione non rientri nell’elenco ' +
               'dell’art. 202 comma 3-bis, che qui non è riprodotto perché è stato ' +
               'modificato più volte. Verificalo sul verbale o sul testo dell’articolo.',
        riferimento: (tris && tris.riferimento) || 'art. 202 comma 3-bis CdS',
        certezza: 'da_verificare'
      });
    }

    var prescrizione = null;
    var annip = (r.prescrizione && r.prescrizione.anni) || null;
    var accP = confermato(d, 'dataAccertamento') ? data(d.dataAccertamento) : null;
    if (annip && accP) {
      var fine = new Date(accP.getFullYear() + annip, accP.getMonth(), accP.getDate());
      prescrizione = {
        anni: annip,
        scadenza: testo(fine),
        giorniResidui: oggi ? giorniFra(oggi, fine) : null,
        riferimento: r.prescrizione.riferimento
      };
    }

    return {
      termini: termini,
      riduzione30: riduzione,
      notifica: notifica,
      prescrizione: prescrizione,
      // Fatti di legge che l'interfaccia deve mostrare sempre, non opinioni.
      acquiescenza: r.acquiescenza || null,
      inerzia: r.inerzia || null,
      daChiarire: daChiarire,
      avvertenze: avvertenze
    };
  }

  return {
    analizza: analizza,
    // esposte per i test
    data: data,
    testo: testo,
    giorniFra: giorniFra,
    aggiungiGiorni: aggiungiGiorni,
    round2: round2,
    riduzione30: riduzione30,
    controlloNotifica: controlloNotifica
  };
});
