// js/contratto-locazione.js — I contratti di locazione dei tipi ministeriali.
//
// I tre modelli (allegati A, B e C del D.M. 16 gennaio 2017) stanno in
// data/contratti-tipo-dm-2017.json, parola per parola come nella Gazzetta
// Ufficiale, con {{nome}} al posto dei puntini da riempire. Qui ci sono solo
// funzioni pure: calcolare fine del contratto, rate e deposito, controllare
// durata e cauzione con le regole lette nelle norme, comporre il testo con i
// dati dell'utente. Nessun dato esce dal browser.
(function (radice, fabbrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabbrica();
  else radice.ContrattoLocazione = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PUNTINI = '……………………';
  const FONTI = {
    dm: 'D.M. 16 gennaio 2017',
    l431: 'legge 9 dicembre 1998, n. 431',
    l392: 'legge 27 luglio 1978, n. 392'
  };

  // Limiti scritti nelle note dei modelli e negli articoli del decreto
  const LIMITI = {
    A: { durataMinimaAnni: 3, mensilitaDeposito: 3 },
    B: { durataMassimaMesi: 18, sogliaGiorni: 30, mensilitaDeposito: 3 },
    C: { durataMinimaMesi: 6, durataMassimaMesi: 36, mensilitaDeposito: 3 },
    aggiornamentoIstatMassimo: 75
  };

  // ------------------------------------------------------------ utilita'

  const pieno = (v) => v !== undefined && v !== null && v !== false && String(v).trim() !== '';
  const numero = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (!s) return null;
    const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? n : null;
  };

  function isoValida(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
    const [a, m, g] = s.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1, g));
    return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g;
  }
  function dataItaliana(iso) {
    if (!isoValida(iso)) return '';
    const [a, m, g] = iso.split('-');
    return `${g}/${m}/${a}`;
  }
  const isoDa = (d) => d.toISOString().slice(0, 10);

  /** Ultimo giorno del contratto: dal + durata, meno un giorno. */
  function fineContratto(dal, quanto, unita) {
    const n = numero(quanto);
    if (!isoValida(dal) || !n || n <= 0) return '';
    const [a, m, g] = dal.split('-').map(Number);
    let d;
    if (unita === 'giorni') d = new Date(Date.UTC(a, m - 1, g + Math.round(n)));
    else {
      const mesi = unita === 'anni' ? Math.round(n * 12) : Math.round(n);
      // stesso giorno del mese dopo "mesi" mesi; se non esiste (31 -> 30) si va al primo del mese seguente
      d = new Date(Date.UTC(a, m - 1 + mesi, g));
      if (d.getUTCDate() !== g) d = new Date(Date.UTC(a, m - 1 + mesi + 1, 1));
    }
    d.setUTCDate(d.getUTCDate() - 1);
    return isoDa(d);
  }

  function euro(n) {
    if (!Number.isFinite(n)) return '';
    const [intera, dec] = Math.abs(n).toFixed(2).split('.');
    return (n < 0 ? '-' : '') + intera.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  }

  // ------------------------------------------------------------ calcoli

  /** Durata espressa in mesi (per i controlli), o null. */
  function durataMesi(tipo, dati) {
    const n = numero(dati.durata);
    if (!n) return null;
    if (tipo === 'A') return n * 12;
    if (tipo === 'B' && dati.unitaDurata === 'giorni') return n / 30;
    return n;
  }

  function breve(tipo, dati) {
    return tipo === 'B' && dati.unitaDurata === 'giorni' && (numero(dati.durata) || 0) > 0 && numero(dati.durata) <= LIMITI.B.sogliaGiorni;
  }

  /**
   * I numeri del contratto: fine, canone da scrivere, rate, deposito e i dati
   * utili per la registrazione (modello RLI).
   */
  function calcola(tipo, dati) {
    const d = dati || {};
    const unita = tipo === 'A' ? 'anni' : tipo === 'C' ? 'mesi' : (d.unitaDurata === 'giorni' ? 'giorni' : 'mesi');
    const al = fineContratto(d.dal, d.durata, unita);
    const mensile = numero(d.canoneMensile);
    const mesi = durataMesi(tipo, d);
    let canone = null; // l'importo scritto nell'articolo del canone
    if (tipo === 'B') {
      if (unita === 'giorni') canone = numero(d.canoneTotale);
      else if (mensile && mesi) canone = Math.round(mensile * mesi * 100) / 100;
    } else if (mensile) canone = Math.round(mensile * 12 * 100) / 100; // A e C: canone annuo
    const rateDefault = tipo === 'B' ? (unita === 'giorni' ? 1 : Math.max(1, Math.round(mesi || 1))) : 12;
    const numeroRate = Math.max(1, Math.round(numero(d.numeroRate) || rateDefault));
    const importoRata = canone ? Math.round((canone / numeroRate) * 100) / 100 : null;
    const mensilita = numero(d.depositoMensilita);
    const deposito = mensile && mensilita !== null ? Math.round(mensile * mensilita * 100) / 100 : null;
    // RLI: il canone annuo o, per i contratti di durata inferiore a un anno, l'importo dell'intera durata
    let canoneRli = null;
    if (mesi !== null && mesi < 12) canoneRli = tipo === 'B' ? canone : (mensile && mesi ? Math.round(mensile * mesi * 100) / 100 : null);
    else if (mensile) canoneRli = Math.round(mensile * 12 * 100) / 100;
    return { al, unita, mesi, canone, numeroRate, importoRata, deposito, canoneRli };
  }

  // ------------------------------------------------------------ controlli

  /**
   * Avvisi sul contratto: 'errore' quando il modello o la legge non lo
   * consentono, 'avviso' quando manca qualcosa o serve un passaggio in piu'.
   */
  function controlla(tipo, dati) {
    const d = dati || {};
    const fuori = [];
    const e = (testo, fonte) => fuori.push({ livello: 'errore', testo, fonte });
    const a = (testo, fonte) => fuori.push({ livello: 'avviso', testo, fonte });
    const n = numero(d.durata);
    const mensilita = numero(d.depositoMensilita);

    if (tipo === 'A') {
      if (n !== null && n < LIMITI.A.durataMinimaAnni) e('Il contratto a canone concordato dura almeno tre anni.', `nota 6 del modello; art. 2, comma 5, ${FONTI.l431}`);
      const istat = numero(d.aggiornamentoIstat);
      if (istat !== null && istat > LIMITI.aggiornamentoIstatMassimo) e('L\'aggiornamento annuale del canone non può superare il 75% della variazione Istat.', `art. 1, comma 9, ${FONTI.dm}`);
      if (istat && d.cedolare) a('Con la cedolare secca l\'aggiornamento Istat del canone è sospeso per tutta la durata dell\'opzione.', `nota 8 del modello; art. 1, comma 9, ${FONTI.dm}`);
    }
    if (tipo === 'B') {
      const mesi = durataMesi('B', d);
      if (mesi !== null && mesi > LIMITI.B.durataMassimaMesi) e('Il contratto transitorio dura al massimo diciotto mesi. Se le regole di stipula non sono rispettate, il contratto è ricondotto alla durata di quattro anni più quattro.', `art. 2, commi 1 e 6, ${FONTI.dm}; nota 6 del modello`);
      if (!pieno(d.esigenza)) e('Il contratto transitorio deve indicare l\'esigenza del locatore o del conduttore che giustifica la transitorietà, fra quelle previste dall\'accordo territoriale.', `art. 2, comma 4, ${FONTI.dm}`);
      if (!breve('B', d) && !d.assistita && !pieno(d.documentazione)) a('Per i contratti di durata superiore a trenta giorni l\'esigenza va provata con documentazione da allegare al contratto.', `art. 2, comma 4, ${FONTI.dm}`);
    }
    if (tipo === 'C') {
      if (n !== null && (n < LIMITI.C.durataMinimaMesi || n > LIMITI.C.durataMassimaMesi)) e('Il contratto per studenti universitari dura da sei mesi a tre anni.', `art. 3, comma 1, ${FONTI.dm}; nota 7 del modello`);
      if (!pieno(d.corso)) e('Va indicato il corso di laurea o di formazione post laurea frequentato dallo studente.', `art. 3, comma 1, ${FONTI.dm}; nota 8 del modello`);
      const res = String(d.residenzaStudente || '').trim().toLowerCase();
      if (res && res === String(d.comune || '').trim().toLowerCase()) e('Il contratto per studenti è possibile solo se lo studente è iscritto in un comune diverso da quello di residenza.', `art. 3, comma 1, ${FONTI.dm}`);
    }
    if (mensilita !== null && mensilita > LIMITI[tipo].mensilitaDeposito) e('Il deposito cauzionale non può superare tre mensilità del canone.', `art. 11, ${FONTI.l392}; note del modello`);
    if (!breve(tipo, d)) {
      if (d.senzaAccordo) a('Senza accordo territoriale nel comune valgono i valori del decreto previsto dall\'art. 4, comma 3, della legge 431/1998: il modello usa la formula del canone che lo richiama.', `art. 1, comma 12, ${FONTI.dm}`);
      else if (tipo !== 'B' || d.comuneGrande || !pieno(d.accordoTra)) {
        if (!pieno(d.accordoComune) || !pieno(d.accordoDepositato)) a('Indica l\'accordo territoriale del comune (chi l\'ha firmato e quando è stato depositato): il canone va fissato fra i valori minimi e massimi che prevede.', `art. 1, commi 1-4, ${FONTI.dm}`);
      }
      if (!pieno(d.assistenteLocatore) && !pieno(d.assistenteConduttore)) {
        const comma = { A: 'art. 1, comma 8', B: 'art. 2, comma 8', C: 'art. 3, comma 5' }[tipo];
        a('Se nessuna delle parti è assistita da un\'organizzazione della proprietà o degli inquilini, l\'accordo territoriale prevede l\'attestazione di un\'organizzazione firmataria che il contratto rispetta l\'accordo, anche per le agevolazioni fiscali.', `${comma}, ${FONTI.dm}`);
      }
    }
    return fuori;
  }

  // ------------------------------------------------------------ testo

  /** Condizione come "breve|!comuneGrande" o "!breve&comuneGrande". */
  function vale(cond, flag) {
    if (!cond) return true;
    if (cond === '*') return true;
    if (cond === 'mai') return false;
    return cond.split('|').some((alt) => alt.split('&').every((t) => {
      const neg = t.startsWith('!');
      const v = Boolean(flag[neg ? t.slice(1) : t]);
      return neg ? !v : v;
    }));
  }

  /** I valori da scrivere al posto dei puntini, gia' formattati. */
  function valori(tipo, dati) {
    const d = dati || {};
    const c = calcola(tipo, d);
    const v = {};
    for (const [k, x] of Object.entries(d)) if (typeof x === 'string' || typeof x === 'number') v[k] = String(x).trim();
    v.dal = dataItaliana(d.dal);
    v.al = dataItaliana(d.al || c.al);
    v.dataFirma = dataItaliana(d.dataFirma);
    v.accordoDepositato = isoValida(d.accordoDepositato) ? dataItaliana(d.accordoDepositato) : (d.accordoDepositato || '');
    v.integrativoData = isoValida(d.integrativoData) ? dataItaliana(d.integrativoData) : (d.integrativoData || '');
    v.canone = c.canone ? euro(c.canone) : '';
    v.numeroRate = c.canone ? String(c.numeroRate) : (d.numeroRate ? String(d.numeroRate) : '');
    v.importoRata = c.importoRata ? euro(c.importoRata) : '';
    const mensilita = numero(d.depositoMensilita);
    v.depositoMensilita = mensilita !== null ? String(mensilita).replace('.', ',') : '';
    v.depositoEuro = c.deposito !== null ? euro(c.deposito) : '';
    const istat = numero(d.aggiornamentoIstat);
    v.aggiornamentoIstat = istat ? `${String(istat).replace('.', ',')}% della variazione Istat` : '';
    const quota = numero(d.quotaOneri);
    v.quotaOneri = quota ? euro(quota) + (pieno(d.periodicitaOneri) ? ` con cadenza ${String(d.periodicitaOneri).trim()}` : '') : '';
    v._firma = '';
    return { v, c };
  }

  function bandiere(tipo, dati, v) {
    const d = dati || {};
    const f = { breve: breve(tipo, d) };
    for (const k of ['porzione', 'senzaAccordo', 'assistita', 'comuneGrande', 'cedolare']) f[k] = Boolean(d[k]);
    for (const [k, x] of Object.entries(v)) f[k] = pieno(x);
    return f;
  }

  function sostituisci(testo, cerca, con) {
    const i = testo.indexOf(cerca);
    return i < 0 ? testo : testo.slice(0, i) + con + testo.slice(i + cerca.length);
  }

  /** Riempie i {{campi}}: con il valore, o con i puntini se manca. */
  function riempi(t, v, mancanti) {
    return t.replace(/\{\{(\w+)\}\}/g, (m, nome, pos, tutto) => {
      const x = v[nome];
      if (nome === '_firma') return PUNTINI + PUNTINI;
      if (!pieno(x)) { mancanti.add(nome); return PUNTINI; }
      const prima = tutto[pos - 1], dopo = tutto[pos + m.length];
      return (prima && !/[\s(«“'’/]/.test(prima) ? ' ' : '') + x + (dopo && /[\p{L}\p{N}]/u.test(dopo) ? ' ' : '');
    });
  }

  function ripulisci(t) {
    return t
      .replace(/\s\(\d{1,2}\)/g, '') // richiami alle note del modello
      .replace(/\(\d{1,2}\)/g, '')
      .replace(/^[A-C][.)] /, '') // lettere delle alternative A./B./C.
      .replace(/[ \t]+,/g, ',').replace(/\([ \t]+/g, '(').replace(/[ \t]+\)/g, ')')
      .replace(/\.\.(?!\.)/g, '.').replace(/,\./g, '.').replace(/,,/g, ',')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();
  }

  /**
   * Il contratto compilato: un elenco di blocchi { k, testo } dove k e'
   * 'titolo', 'sottotitolo', 'articolo', 'paragrafo' o 'firme'.
   * 'mancanti' elenca i campi rimasti con i puntini.
   */
  function componi(modello, tipo, dati) {
    const { v } = valori(tipo, dati);
    const flag = bandiere(tipo, dati, v);
    const scelte = dati || {};
    const blocchi = [];
    const mancanti = new Set();
    for (const b of modello.blocchi) {
      if (b.k === 'istr' && !vale(b.se, flag)) continue;
      if (b.k !== 'istr' && !vale(b.se, flag)) continue;
      let t = b.t;
      for (const x of b.togli || []) if (vale(x.se, flag)) t = sostituisci(t, x.testo, x.con);
      for (const s of b.scelte || []) {
        const scelta = scelte[s.campo];
        if (scelta && Object.prototype.hasOwnProperty.call(s.opzioni, scelta)) t = sostituisci(t, s.testo, s.opzioni[scelta]);
      }
      for (const a of b.accapo || []) t = sostituisci(t, a, '\n' + a.trimStart());
      // "via {{via}}" quando l'indirizzo comincia gia' con via, piazza, corso...
      if (/^(via|viale|vicolo|piazza|piazzale|piazzetta|corso|largo|strada|stradone|contrada|località|borgo|salita|lungomare|lungotevere)\b/i.test(v.via || '')) t = t.split('via {{via}}').join('{{via}}');
      if (b.k === 'art') {
        const m = ripulisci(t).replace(/^Articolo ?(\d+)/, 'Articolo $1').match(/^(Articolo \d+) (\(.*\))$/);
        blocchi.push({ k: 'articolo', testo: m ? m[1] + '\n' + m[2] : ripulisci(t) });
        continue;
      }
      t = ripulisci(riempi(t, v, mancanti));
      if (b.chiudi && !/[.;:!?)]$/.test(t)) t += '.';
      if (b.id === 'intestazione') {
        const [titolo, sotto] = t.split('\n');
        blocchi.push({ k: 'titolo', testo: titolo });
        if (sotto) blocchi.push({ k: 'sottotitolo', testo: sotto });
      } else blocchi.push({ k: b.id === 'firme' || b.id === 'clausole' ? 'firme' : b.k === 'istr' ? 'nota' : 'paragrafo', testo: t });
    }
    return { blocchi, mancanti: [...mancanti] };
  }

  /** Il testo del modello com'e' nella Gazzetta: serve ai test. */
  function letterale(modello) {
    return modello.blocchi.map((b) => b.t.replace(/\{\{\w+\}\}/g, '…'));
  }

  /** Il contratto come testo semplice (anteprima, copia, PDF, Word). */
  function comeTesto(blocchi) {
    return blocchi.map((b) => b.testo).join('\n\n');
  }

  return { LIMITI, PUNTINI, isoValida, dataItaliana, fineContratto, euro, numero, durataMesi, breve, calcola, controlla, vale, valori, componi, letterale, comeTesto };
});
