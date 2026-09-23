// js/esenzione-bollo.js — Chi rientra nell'esenzione del bollo auto 2027.
//
// ATTENZIONE alla natura della norma: al 23 settembre 2026 si tratta di una
// misura ANNUNCIATA dal Consiglio dei Ministri del 16 settembre, non ancora
// approvata. Le regole stanno in data/regole-fiscali-2026.json sotto
// "esenzione_bollo_2027", ciascuna con il proprio grado di certezza: quelle
// marcate "controversa" non sono confermate da fonti concordanti e vanno
// mostrate all'utente come tali, non spacciate per legge.
//
// Funziona nel browser (window.EsenzioneBollo) e in Node (module.exports).
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EsenzioneBollo = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function numero(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  // Un veicolo e' agevolabile se rientra nei limiti del suo tipo.
  function agevolabile(veicolo, regole) {
    var kw = numero(veicolo.kw, NaN);
    if (!Number.isFinite(kw) || kw <= 0) {
      return { si: false, perche: 'Potenza non indicata.' };
    }

    if (veicolo.tipo === 'moto') {
      if (!regole.moto || !regole.moto.incluse) {
        return { si: false, perche: 'I motocicli non rientrano nella misura.' };
      }
      var limite = regole.moto.limite_potenza_kw;
      if (limite !== null && limite !== undefined && kw > limite) {
        return { si: false, perche: 'Motociclo oltre i ' + limite + ' kW.' };
      }
      return { si: true, perche: 'Motociclo incluso nella misura.' };
    }

    var max = numero(regole.auto && regole.auto.potenza_massima_kw, 80);
    if (kw > max) {
      return { si: false, perche: 'Auto da ' + kw + ' kW: oltre il limite di ' + max + ' kW.' };
    }
    return { si: true, perche: 'Auto entro il limite di ' + max + ' kW.' };
  }

  // Fra piu' veicoli agevolabili l'esenzione va a uno solo. Il criterio
  // annunciato e' la potenza minore.
  function scegliVeicolo(candidati, regole) {
    if (!candidati.length) return null;
    if (regole.criterio_scelta !== 'potenza_minore') return candidati[0];
    return candidati.reduce(function (scelto, c) {
      return numero(c.veicolo.kw, Infinity) < numero(scelto.veicolo.kw, Infinity) ? c : scelto;
    });
  }

  // Le voci marcate "controversa" nel JSON diventano avvertenze da mostrare.
  function avvertenze(regole, veicoli) {
    var elenco = [];

    if (regole.stato !== 'in_vigore') {
      elenco.push({
        tipo: 'norma',
        testo: 'La misura e stata annunciata il ' + (regole.data_annuncio || '16 settembre 2026') +
               ' e non e ancora legge: il risultato e una simulazione, non una certezza.'
      });
    }

    var haMoto = veicoli.some(function (v) { return v.tipo === 'moto'; });
    if (haMoto && regole.moto && regole.moto.certezza === 'controversa') {
      elenco.push({ tipo: 'moto', testo: regole.moto.nota });
    }

    if (regole.requisito_assicurazione && regole.requisito_assicurazione.certezza === 'controversa') {
      elenco.push({
        tipo: 'assicurazione',
        testo: 'Alcune fonti indicano che il veicolo debba essere regolarmente assicurato: il punto non e confermato.'
      });
    }

    return elenco;
  }

  // `veicoli`: [{ tipo: 'auto' | 'moto', kw: number }]
  function valuta(veicoli, regole) {
    if (!regole) throw new Error('[EsenzioneBollo] Regole non caricate.');
    var elenco = Array.isArray(veicoli) ? veicoli : [];

    var esiti = elenco.map(function (v, i) {
      return { indice: i, veicolo: v, esito: agevolabile(v, regole) };
    });

    var candidati = esiti.filter(function (e) { return e.esito.si; });
    var scelto = scegliVeicolo(candidati, regole);

    return {
      applicabile: !!scelto,
      indiceScelto: scelto ? scelto.indice : null,
      veicoloScelto: scelto ? scelto.veicolo : null,
      candidati: candidati.length,
      esiti: esiti,
      periodo: regole.periodo || null,
      superbolloResta: !regole.superbollo_incluso,
      avvertenze: avvertenze(regole, elenco),
      motivo: scelto
        ? (candidati.length > 1
            ? 'Fra i ' + candidati.length + ' veicoli agevolabili l esenzione spetta a uno solo: quello di potenza minore.'
            : scelto.esito.perche)
        : (elenco.length
            ? 'Nessuno dei veicoli indicati rientra nella misura.'
            : 'Nessun veicolo indicato.')
    };
  }

  return {
    valuta: valuta,
    agevolabile: agevolabile,
    scegliVeicolo: scegliVeicolo,
    avvertenze: avvertenze
  };
});
