// tests/helpers/albero-xml.js — Un DOMParser minimo, solo per i test.
//
// Node non ha DOMParser, quindi finora la lettura dell'XML dell'estratto conto
// non era collaudata: si verificava solo che, senza parser, il modulo lo dicesse
// invece di fallire in silenzio. Con il tracciato vero in mano quella zona va
// coperta.
//
// ATTENZIONE, e il limite di questo file: qui si copre il sottoinsieme di XML
// che l'INPS usa davvero — elementi annidati, testo semplice, attributi fra
// apici doppi — non l'XML completo. Niente CDATA, niente namespace veri, niente
// entita oltre le cinque predefinite. Serve a fissare il RICONOSCIMENTO dei
// periodi; la prova che il percorso reale funziona resta quella nel browser,
// dove il DOMParser e quello del motore.
'use strict';

function chiaveTag(nome) {
  return String(nome || '').toLowerCase();
}

function creaNodo(nome) {
  const nodo = {
    nodeName: nome,
    attributes: [],
    children: [],
    parentNode: null,
    testoProprio: ''
  };
  // textContent e la concatenazione del testo di tutti i discendenti, come nel
  // DOM vero. Qui non si preserva l'ordine fra testo e figli: il tracciato non
  // ha contenuto misto.
  Object.defineProperty(nodo, 'textContent', {
    get() {
      return nodo.testoProprio + nodo.children.map((f) => f.textContent).join('');
    }
  });
  return nodo;
}

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodifica(testo) {
  return String(testo).replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (tutto, nome) => {
    if (nome.charAt(0) === '#') return String.fromCharCode(Number(nome.slice(1)));
    return ENTITA[nome];
  });
}

function leggiAttributi(testo) {
  const fuori = [];
  const RE = /([A-Za-z_][A-Za-z0-9_:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = RE.exec(testo)) !== null) fuori.push({ name: m[1], value: decodifica(m[2]) });
  return fuori;
}

function tutti(nodo, dentro) {
  for (const figlio of nodo.children) {
    dentro.push(figlio);
    tutti(figlio, dentro);
  }
  return dentro;
}

function creaDocumento(radice, errore) {
  return {
    documentElement: radice,
    getElementsByTagName(tag) {
      if (errore) return chiaveTag(tag) === 'parsererror' ? [{ nodeName: 'parsererror' }] : [];
      if (chiaveTag(tag) === 'parsererror') return [];
      const elenco = radice ? [radice].concat(tutti(radice, [])) : [];
      if (tag === '*') return elenco;
      return elenco.filter((n) => chiaveTag(n.nodeName) === chiaveTag(tag));
    }
  };
}

const TAG = /<(\/?)([A-Za-z_][A-Za-z0-9_:.-]*)((?:\s+[A-Za-z_][A-Za-z0-9_:.-]*\s*=\s*"[^"]*")*)\s*(\/?)\s*>/g;

function parseFromString(xml) {
  const pulito = String(xml)
    .replace(/<\?[\s\S]*?\?>/g, '')       // dichiarazione
    .replace(/<!--[\s\S]*?-->/g, '')      // commenti
    .replace(/<!DOCTYPE[^>]*>/gi, '');

  let radice = null;
  const pila = [];
  let fine = 0;
  let errore = false;
  let m;

  TAG.lastIndex = 0;
  while ((m = TAG.exec(pulito)) !== null) {
    const testo = pulito.slice(fine, m.index);
    if (pila.length && testo.trim()) pila[pila.length - 1].testoProprio += decodifica(testo);
    fine = TAG.lastIndex;

    const chiusura = m[1] === '/';
    const nome = m[2];
    const autochiusa = m[4] === '/';

    if (chiusura) {
      const aperto = pila.pop();
      if (!aperto || chiaveTag(aperto.nodeName) !== chiaveTag(nome)) { errore = true; break; }
      continue;
    }

    const nodo = creaNodo(nome);
    nodo.attributes = leggiAttributi(m[3]);

    if (pila.length) {
      nodo.parentNode = pila[pila.length - 1];
      pila[pila.length - 1].children.push(nodo);
    } else if (radice) {
      errore = true; break;               // due radici: non e XML valido
    } else {
      radice = nodo;
    }

    if (!autochiusa) pila.push(nodo);
  }

  // Tag rimasti aperti, o nessun elemento: il DOMParser vero darebbe parsererror.
  if (pila.length || !radice) errore = true;

  return creaDocumento(errore ? null : radice, errore);
}

// Ha la forma di un DOMParser: si passa a leggiXml come secondo argomento.
class ParserFinto {
  parseFromString(xml) {
    return parseFromString(xml);
  }
}

module.exports = { ParserFinto, parseFromString };
