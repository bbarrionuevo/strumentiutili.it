// js/usura.js — I conti della pagina "Tassi soglia usura".
//
// I tassi arrivano da data/vivi/usura/soglie.json, che il workflow usura.yml
// aggiorna da solo a ogni decreto trimestrale del MEF. Qui ci sono solo
// funzioni pure: trovare il trimestre che vale per una data (conta il momento
// in cui gli interessi sono pattuiti: D.L. 394/2000, art. 1), la classe
// d'importo, la soglia (legge 108/1996, art. 2, comma 4) e, per chi conosce
// solo la rata, il tasso annuo che la rata implica.
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.Usura = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** TEGM aumentato di un quarto piu' 4 punti, al massimo TEGM + 8 punti. */
  function soglia(tegm) {
    if (!Number.isFinite(tegm)) return null;
    return Math.round(Math.min(tegm * 1.25 + 4, tegm + 8) * 10000) / 10000;
  }

  const isoValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

  /** Il trimestre in cui cade la data (ISO), o null. */
  function trimestreDi(trimestri, data) {
    if (!isoValida(data)) return null;
    return (trimestri || []).find((t) => t.dal <= data && data <= t.al) || null;
  }

  /** Il trimestre in vigore oggi e, se c'e' gia', quello che viene dopo. */
  function vigenti(trimestri, oggi) {
    const ora = trimestreDi(trimestri, oggi);
    const prossimo = (trimestri || []).filter((t) => t.dal > oggi).sort((a, b) => (a.dal < b.dal ? -1 : 1))[0] || null;
    return { ora, prossimo };
  }

  /**
   * La classe d'importo di una categoria: "fino a" comprende il valore,
   * "oltre" no. Senza classi d'importo c'e' una sola classe.
   */
  function classe(categoria, importo) {
    const classi = (categoria && categoria.classi) || [];
    if (classi.length <= 1) return classi[0] || null;
    const conImporto = classi.filter((c) => c.min !== undefined || c.max !== undefined);
    if (!conImporto.length) return null; // tasso fisso o variabile: sceglie l'utente
    if (!Number.isFinite(importo) || importo <= 0) return null;
    return conImporto.find((c) => c.max !== undefined && importo <= c.max && (c.min === undefined || importo > c.min))
      || conImporto.find((c) => c.max === undefined && importo > c.min) || null;
  }

  /**
   * Confronta un tasso annuo (in %) con la soglia del trimestre della data.
   * { trimestre, classe, tegm, soglia, differenza, esito: 'oltre'|'vicino'|'sotto' }
   * 'vicino' vuol dire a meno di un punto dalla soglia.
   */
  function verifica(dati, opzioni) {
    const o = opzioni || {};
    const t = trimestreDi(dati.trimestri, o.data);
    if (!t) return { errore: 'data' };
    const cat = (dati.categorie || []).find((c) => c.id === o.categoria);
    if (!cat) return { errore: 'categoria' };
    const cl = o.classe ? cat.classi.find((c) => c.id === o.classe) : classe(cat, o.importo);
    if (!cl) return { errore: 'classe' };
    const riga = t.tassi[`${cat.id}:${cl.id}`];
    if (!riga) return { errore: 'tasso' };
    const [tegm, s] = riga;
    const out = { trimestre: t, categoria: cat, classe: cl, tegm, soglia: s };
    if (Number.isFinite(o.tasso)) {
      out.differenza = Math.round((o.tasso - s) * 10000) / 10000;
      out.esito = o.tasso > s ? 'oltre' : s - o.tasso < 1 ? 'vicino' : 'sotto';
    }
    return out;
  }

  /**
   * Tasso annuo effettivo (in %) di un finanziamento: importo ricevuto meno
   * le spese iniziali, restituito con n rate costanti posticipate, 'perAnno'
   * rate l'anno. Si trova il tasso che eguaglia i flussi (bisezione).
   */
  function tassoDaRata(importo, rata, n, spese, perAnno) {
    const netto = importo - (spese || 0);
    const k = perAnno || 12;
    if (![importo, rata, n].every(Number.isFinite) || netto <= 0 || rata <= 0 || n < 1) return null;
    if (rata * n <= netto) return rata * n === netto ? 0 : null; // restituisce meno di quanto riceve
    const valore = (r) => (r === 0 ? rata * n : rata * (1 - Math.pow(1 + r, -n)) / r);
    let basso = 0, alto = 1;
    while (valore(alto) > netto && alto < 1e6) alto *= 2;
    for (let i = 0; i < 200; i++) {
      const medio = (basso + alto) / 2;
      if (valore(medio) > netto) basso = medio; else alto = medio;
    }
    const periodico = (basso + alto) / 2;
    return Math.round((Math.pow(1 + periodico, k) - 1) * 1000000) / 10000;
  }

  /** Dalla tabella del trimestre, le righe da mostrare. */
  function righe(dati, trimestre) {
    const fuori = [];
    for (const c of dati.categorie || []) {
      for (const cl of c.classi) {
        const x = trimestre && trimestre.tassi[`${c.id}:${cl.id}`];
        if (x) fuori.push({ categoria: c.nome, idCategoria: c.id, classe: cl.etichetta, idClasse: cl.id, tegm: x[0], soglia: x[1] });
      }
    }
    return fuori;
  }

  return { soglia, trimestreDi, vigenti, classe, verifica, tassoDaRata, righe };
});
