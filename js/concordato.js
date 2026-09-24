// js/concordato.js — Conviene aderire al Concordato Preventivo Biennale?
//
// Confronta tre scenari sullo stesso biennio:
//
//   A. Senza concordato        imposte sul reddito che prevedi davvero.
//   B. Con concordato          imposte sul reddito proposto dall'Agenzia,
//                              con IRPEF ordinaria su tutto.
//   C. Con concordato + sostitutiva
//                              IRPEF ordinaria sulla parte fino al reddito
//                              gia' dichiarato l'anno prima, imposta
//                              sostitutiva sull'eccedenza concordata.
//
// Il vantaggio nasce quando il reddito vero supera quello concordato: si paga
// sul minore dei due. Se invece si guadagna meno del concordato, si paga su un
// reddito che non si e' avuto.
//
// Attenzione ai contributi: per l'INPS la base e' il reddito concordato, ma per
// le casse dei professionisti il concordato non vale e si versa sul reddito
// reale. E' l'equivoco piu' costoso di tutto l'istituto.
//
// Non modella acconti, componenti straordinarie, cause di esclusione ne' le
// regole specifiche di societa': e' una stima di convenienza, non una
// dichiarazione.
(function (root, factory) {
  'use strict';
  var api = factory(typeof require === 'function' ? require('./irpef.js') : null);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Concordato = api;
})(typeof self !== 'undefined' ? self : globalThis, function (irpefNode) {
  'use strict';

  function motoreIrpef() {
    if (irpefNode) return irpefNode;
    var g = (typeof window !== 'undefined' && window) || (typeof self !== 'undefined' && self);
    if (g && g.StrumentiIrpef) return g.StrumentiIrpef;
    throw new Error('[Concordato] js/irpef.js non caricato.');
  }

  function num(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function round2(v) {
    return Number((Math.round((Number(v) + Number.EPSILON) * 100) / 100).toFixed(2));
  }

  // L'aliquota della sostitutiva dipende dal punteggio ISA del periodo
  // precedente: piu' si e' affidabili, meno si paga sull'eccedenza.
  function aliquotaSostitutiva(isa, regole) {
    var punteggio = num(isa, 0);
    var scaglioni = regole.imposta_sostitutiva.scaglioni_isa;
    for (var i = 0; i < scaglioni.length; i++) {
      if (punteggio >= scaglioni[i].isa_da && punteggio <= scaglioni[i].isa_a) return scaglioni[i].aliquota;
    }
    // fuori scala: si applica l'aliquota piu' alta, che e' la piu' prudente
    return scaglioni[scaglioni.length - 1].aliquota;
  }

  // L'aliquota agevolata vale fino a un tetto di eccedenza; oltre, si applica
  // l'ultimo scaglione IRPEF.
  function impostaSostitutiva(eccedenza, isa, regole) {
    var ecc = Math.max(0, num(eccedenza, 0));
    if (ecc === 0) return { imposta: 0, aliquota: aliquotaSostitutiva(isa, regole), oltreTetto: 0 };

    var conf = regole.imposta_sostitutiva;
    var aliquota = aliquotaSostitutiva(isa, regole);
    var tetto = num(conf.tetto_agevolato, Infinity);

    var agevolata = Math.min(ecc, tetto);
    var oltre = Math.max(0, ecc - tetto);
    var imposta = agevolata * aliquota + oltre * num(conf.aliquota_oltre_tetto, 0.43);

    return { imposta: round2(imposta), aliquota: aliquota, oltreTetto: round2(oltre) };
  }

  // Un anno, uno scenario.
  function annoSenzaConcordato(reddito, ctx) {
    var irpef = motoreIrpef().computeIRPEF(reddito, ctx.irpef);
    var addizionali = round2(reddito * ctx.aliquotaAddizionali);
    var contributi = round2(reddito * ctx.aliquotaContributi);
    return {
      base: round2(reddito),
      irpef: round2(irpef),
      sostitutiva: 0,
      addizionali: addizionali,
      contributi: contributi,
      totale: round2(irpef + addizionali + contributi)
    };
  }

  function annoConConcordato(concordato, effettivo, ctx, conSostitutiva) {
    var irpef, sostitutiva = 0, dettaglioSost = null;

    if (conSostitutiva) {
      // IRPEF ordinaria fino al reddito gia' dichiarato, sostitutiva sul resto.
      var base = Math.min(concordato, ctx.redditoPrecedente);
      var eccedenza = Math.max(0, concordato - ctx.redditoPrecedente);
      irpef = motoreIrpef().computeIRPEF(base, ctx.irpef);
      dettaglioSost = impostaSostitutiva(eccedenza, ctx.isa, ctx.regole);
      sostitutiva = dettaglioSost.imposta;
    } else {
      irpef = motoreIrpef().computeIRPEF(concordato, ctx.irpef);
    }

    var addizionali = round2(concordato * ctx.aliquotaAddizionali);

    // Qui sta la differenza che costa cara: l'INPS segue il concordato, le
    // casse dei professionisti no.
    var baseContributi = ctx.contributiSulReale ? Math.max(effettivo, concordato) : concordato;
    var contributi = round2(baseContributi * ctx.aliquotaContributi);

    return {
      base: round2(concordato),
      irpef: round2(irpef),
      sostitutiva: sostitutiva,
      dettaglioSostitutiva: dettaglioSost,
      addizionali: addizionali,
      baseContributi: round2(baseContributi),
      contributi: contributi,
      totale: round2(irpef + sostitutiva + addizionali + contributi)
    };
  }

  function sommaAnni(anni) {
    return anni.reduce(function (t, a) { return round2(t + a.totale); }, 0);
  }

  // `dati`:
  //   redditoPrecedente      reddito dichiarato nel periodo precedente
  //   isa                    punteggio ISA di quel periodo
  //   anni: [{ concordato, effettivo }, ...]   uno per ciascun anno del biennio
  //   aliquotaContributi     quota contributiva (es. 0.26 per la gestione separata)
  //   aliquotaAddizionali    regionale + comunale
  //   contributiSulReale     true per le casse private
  function confronta(dati, regole) {
    if (!regole) throw new Error('[Concordato] Regole non caricate.');

    var ctx = {
      irpef: regole.irpef,
      regole: regole.concordato_preventivo,
      redditoPrecedente: Math.max(0, num(dati.redditoPrecedente, 0)),
      isa: num(dati.isa, 0),
      aliquotaContributi: Math.max(0, num(dati.aliquotaContributi, 0)),
      aliquotaAddizionali: Math.max(0, num(dati.aliquotaAddizionali, 0)),
      contributiSulReale: !!dati.contributiSulReale
    };

    var anni = (dati.anni || []).map(function (a) {
      return {
        concordato: Math.max(0, num(a.concordato, 0)),
        effettivo: Math.max(0, num(a.effettivo, 0))
      };
    });

    var senza = anni.map(function (a) { return annoSenzaConcordato(a.effettivo, ctx); });
    var conOrdinaria = anni.map(function (a) { return annoConConcordato(a.concordato, a.effettivo, ctx, false); });
    var conSostitutiva = anni.map(function (a) { return annoConConcordato(a.concordato, a.effettivo, ctx, true); });

    var totali = {
      senza: sommaAnni(senza),
      conOrdinaria: sommaAnni(conOrdinaria),
      conSostitutiva: sommaAnni(conSostitutiva)
    };

    // Lo scenario migliore fra i due che il concordato consente.
    var miglioreConcordato = totali.conSostitutiva <= totali.conOrdinaria ? 'conSostitutiva' : 'conOrdinaria';
    var risparmio = round2(totali.senza - totali[miglioreConcordato]);

    return {
      scenari: { senza: senza, conOrdinaria: conOrdinaria, conSostitutiva: conSostitutiva },
      totali: totali,
      miglioreConcordato: miglioreConcordato,
      conviene: risparmio > 0,
      risparmio: risparmio,
      aliquotaSostitutiva: aliquotaSostitutiva(ctx.isa, ctx.regole),
      contributiSulReale: ctx.contributiSulReale,
      scadenza: ctx.regole.scadenza_adesione,
      nonModellato: ctx.regole.non_modellato || []
    };
  }

  return {
    confronta: confronta,
    impostaSostitutiva: impostaSostitutiva,
    aliquotaSostitutiva: aliquotaSostitutiva
  };
});
