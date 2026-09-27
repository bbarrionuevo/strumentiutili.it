// js/esenzione-bollo.js — Chi rientra nell'esenzione del bollo auto 2027.
//
// La norma e' l'articolo 2 del decreto-legge 17 settembre 2026, n. 162 (GU n.
// 216 del 17 settembre 2026), in vigore dal 18 settembre 2026. Un decreto-legge
// vale subito, ma il Parlamento deve convertirlo in legge entro 60 giorni e
// puo' cambiarlo: per questo lo stato della norma si mostra sempre.
// Le regole stanno in data/regole-fiscali-2026.json sotto "esenzione_bollo_2027":
//   - persone fisiche, un solo veicolo regolarmente assicurato (comma 1);
//   - autovetture a benzina o gasolio, anche in combinazione con altra fonte,
//     fino a 80 kW; fra piu' auto quella di potenza minore, a parita' quella con
//     il bollo piu' basso (comma 2);
//   - motocicli e ciclomotori a benzina, anche in combinazione, solo per chi non
//     paga il bollo di alcuna autovettura fino a 80 kW; fra piu' motocicli quello
//     di potenza minore, fra piu' ciclomotori quello immatricolato da piu' tempo
//     (comma 3).
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
    return v === null || v === undefined || v === '' || !Number.isFinite(n) ? fallback : n;
  }

  function limiteAuto(regole) {
    return numero(regole.auto && regole.auto.potenza_massima_kw, 80);
  }

  // Un'autovettura fino a 80 kW, di qualsiasi alimentazione: basta averne una
  // perche' le moto restino fuori (comma 3).
  function haAutoFinoAlLimite(veicoli, regole) {
    var max = limiteAuto(regole);
    return veicoli.some(function (v) {
      var kw = numero(v.kw, NaN);
      return v.tipo === 'auto' && Number.isFinite(kw) && kw > 0 && kw <= max;
    });
  }

  /**
   * Il singolo veicolo rientra nei requisiti? `tutti` serve alla regola delle moto.
   * @param {{tipo:'auto'|'moto'|'ciclomotore', kw:number, benzina:boolean, immatricolazione:number}} veicolo
   */
  function agevolabile(veicolo, regole, tutti) {
    var benzina = veicolo.benzina !== false;
    var kw = numero(veicolo.kw, NaN);

    if (veicolo.tipo === 'auto') {
      if (!Number.isFinite(kw) || kw <= 0) return { si: false, perche: 'Potenza non indicata.' };
      var max = limiteAuto(regole);
      if (kw > max) return { si: false, perche: 'Auto da ' + kw + ' kW: oltre il limite di ' + max + ' kW.' };
      if (!benzina) return { si: false, perche: 'L’esenzione riguarda le auto a benzina o gasolio, anche ibride o bifuel.' };
      return { si: true, perche: 'Auto a benzina o gasolio entro il limite di ' + max + ' kW.' };
    }

    // motocicli e ciclomotori
    var nome = veicolo.tipo === 'ciclomotore' ? 'Ciclomotore' : 'Motociclo';
    if (!regole.moto || !regole.moto.incluse) return { si: false, perche: 'I motocicli non rientrano nella misura.' };
    if (veicolo.tipo === 'moto' && (!Number.isFinite(kw) || kw <= 0)) return { si: false, perche: 'Potenza non indicata.' };
    if (!benzina) return { si: false, perche: nome + ' non a benzina: l’esenzione riguarda le moto a benzina, anche ibride.' };
    if (haAutoFinoAlLimite(tutti || [], regole)) {
      return { si: false, perche: 'Hai un’auto fino a ' + limiteAuto(regole) + ' kW: moto e ciclomotori rientrano solo per chi non ne ha.' };
    }
    return { si: true, perche: nome + ' a benzina: rientra perché non hai auto fino a ' + limiteAuto(regole) + ' kW.' };
  }

  // Fra piu' veicoli agevolabili l'esenzione va a uno solo.
  //   auto: potenza minore; a parita', quella con il bollo piu' basso;
  //   motocicli: potenza minore; a parita', quello con il bollo piu' basso;
  //   ciclomotori: immatricolazione piu' remota.
  // Il bollo non si calcola qui: a parita' di potenza si segnala la regola.
  function scegliVeicolo(candidati) {
    if (!candidati.length) return { scelto: null, parita: false, misto: false };
    var auto = candidati.filter(function (c) { return c.veicolo.tipo === 'auto'; });
    var moto = candidati.filter(function (c) { return c.veicolo.tipo === 'moto'; });
    var cicli = candidati.filter(function (c) { return c.veicolo.tipo === 'ciclomotore'; });
    var gruppo = auto.length ? auto : (moto.length ? moto : cicli);
    var misto = !auto.length && moto.length > 0 && cicli.length > 0;

    if (gruppo === cicli) {
      var perAnno = cicli.slice().sort(function (a, b) {
        return numero(a.veicolo.immatricolazione, Infinity) - numero(b.veicolo.immatricolazione, Infinity);
      });
      return { scelto: perAnno[0], parita: false, misto: misto };
    }
    var minimo = Math.min.apply(null, gruppo.map(function (c) { return numero(c.veicolo.kw, Infinity); }));
    var migliori = gruppo.filter(function (c) { return numero(c.veicolo.kw, Infinity) === minimo; });
    return { scelto: migliori[0], parita: migliori.length > 1, misto: misto };
  }

  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  // "2026-09-18" -> "18 settembre 2026"
  function dataItaliana(iso) {
    var p = String(iso).split('-').map(Number);
    return p.length === 3 && p[1] >= 1 && p[1] <= 12 ? p[2] + ' ' + MESI[p[1] - 1] + ' ' + p[0] : String(iso);
  }

  function avvertenze(regole, veicoli, scelta) {
    var elenco = [];
    if (regole.stato === 'decreto_legge') {
      elenco.push({
        tipo: 'norma',
        testo: 'L’esenzione è in vigore dal ' + dataItaliana(regole.in_vigore_dal || '2026-09-18') + ' con il ' +
               (regole.norma || 'decreto-legge 17 settembre 2026, n. 162') +
               ': il Parlamento deve convertirlo in legge entro 60 giorni e può ancora modificarlo.'
      });
    } else if (!regole.in_vigore) {
      elenco.push({ tipo: 'norma', testo: 'La misura non è ancora in vigore: il risultato è una simulazione.' });
    }
    if (regole.requisito_assicurazione && regole.requisito_assicurazione.richiesto) {
      elenco.push({ tipo: 'assicurazione', testo: 'Il veicolo esente deve essere regolarmente assicurato.' });
    }
    if (scelta && scelta.parita) {
      elenco.push({
        tipo: 'parita',
        testo: 'Hai più veicoli idonei con la stessa potenza: in questo caso l’esenzione va a quello per cui il bollo sarebbe più basso.'
      });
    }
    if (scelta && scelta.misto) {
      elenco.push({
        tipo: 'misto',
        testo: 'Il decreto non dice come scegliere fra un motociclo e un ciclomotore: qui si applica la regola dei motocicli (potenza minore), ma il risultato va confermato con la Regione.'
      });
    }
    if (regole.statuto_speciale) elenco.push({ tipo: 'regioni', testo: regole.statuto_speciale });
    return elenco;
  }

  var NOMI = { auto: 'l’auto', moto: 'il motociclo', ciclomotore: 'il ciclomotore' };

  // `veicoli`: [{ tipo: 'auto' | 'moto' | 'ciclomotore', kw, benzina, immatricolazione }]
  function valuta(veicoli, regole) {
    if (!regole) throw new Error('[EsenzioneBollo] Regole non caricate.');
    var elenco = Array.isArray(veicoli) ? veicoli : [];

    var esiti = elenco.map(function (v, i) {
      return { indice: i, veicolo: v, esito: agevolabile(v, regole, elenco) };
    });
    var candidati = esiti.filter(function (e) { return e.esito.si; });
    var scelta = scegliVeicolo(candidati);
    var scelto = scelta.scelto;

    return {
      applicabile: !!scelto,
      indiceScelto: scelto ? scelto.indice : null,
      veicoloScelto: scelto ? scelto.veicolo : null,
      candidati: candidati.length,
      esiti: esiti,
      periodo: regole.periodo || null,
      avvertenze: avvertenze(regole, elenco, scelta),
      motivo: scelto
        ? (candidati.length > 1
            ? 'Fra i ' + candidati.length + ' veicoli idonei l’esenzione spetta a uno solo: ' + NOMI[scelto.veicolo.tipo] +
              (scelto.veicolo.tipo === 'ciclomotore' ? ' immatricolato da più tempo.' : ' di potenza minore.')
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
    avvertenze: avvertenze,
    dataItaliana: dataItaliana
  };
});
