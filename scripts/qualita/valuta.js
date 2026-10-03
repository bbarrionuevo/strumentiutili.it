// scripts/qualita/valuta.js — Le misure settimanali del sito: soglie, confronto
// con la settimana prima e testo del rapporto.
//
// Funzioni pure, senza rete: le usano scripts/qualita/rapporto-issue.js (che
// scrive le issue su GitHub) e il laboratorio settimanale
// (.claude/skills/laboratorio/SKILL.md), che da qui sceglie cosa migliorare.
// I dati arrivano da scripts/qualita/misura.js (Playwright sul sito vero, in
// laboratorio) e, se c'e' una chiave, dal Chrome UX Report (utenti reali).
'use strict';

// Soglie di laboratorio: telefono a 390 px, CPU rallentata 4 volte, rete
// mobile. Sono piu' severe di quelle "buone" di Google per i dati reali
// (LCP 2,5 s, CLS 0,1, INP 200 ms) perche' qui il telefono e' lento apposta.
const SOGLIE = {
  cls: 0.1,          // salti della pagina: oltre e' un problema anche per gli annunci
  lcp: 4000,         // ms, contenuto principale visibile
  tbt: 600,          // ms di blocco del thread principale (long task oltre 50 ms)
  kb: 1500,          // peso scaricato all'apertura
  erroriJs: 0        // errori JavaScript non gestiti
};

// Un peggioramento conta solo se e' netto: le misure di laboratorio oscillano.
const PEGGIORAMENTO = { cls: 0.05, lcp: 800, tbt: 200, kb: 150 };

/** I problemi di una pagina rispetto alle soglie. */
function problemi(m) {
  const fuori = [];
  if (m.errore) return [{ tipo: 'errore', testo: `non si apre: ${m.errore}` }];
  if (m.stato && m.stato !== 200) fuori.push({ tipo: 'stato', testo: `risponde ${m.stato}` });
  if (m.cls > SOGLIE.cls) fuori.push({ tipo: 'cls', testo: `CLS ${m.cls}` });
  if (m.lcp > SOGLIE.lcp) fuori.push({ tipo: 'lcp', testo: `LCP ${m.lcp} ms` });
  if (m.tbt > SOGLIE.tbt) fuori.push({ tipo: 'tbt', testo: `blocco ${m.tbt} ms` });
  if (m.kb > SOGLIE.kb) fuori.push({ tipo: 'kb', testo: `${m.kb} KB` });
  if ((m.erroriJs || []).length > SOGLIE.erroriJs) fuori.push({ tipo: 'js', testo: `errori JS: ${m.erroriJs.slice(0, 2).join(' | ')}` });
  if ((m.rotti || []).length) fuori.push({ tipo: 'rotti', testo: `risorse mancanti: ${m.rotti.slice(0, 3).join(', ')}` });
  // cio' che toglie la pagina da Google (scripts/qualita/google.js)
  for (const p of (m.googlebot && m.googlebot.problemi) || []) if (p.tipo === 'indice') fuori.push({ tipo: 'indice', testo: p.testo });
  if (m.google && m.google.indice && m.google.indice.causa) fuori.push({ tipo: 'indice', testo: 'Google: ' + m.google.indice.causa });
  return fuori;
}

/** Le pagine peggiorate rispetto alla misura precedente (stessa pagina). */
function peggioramenti(ora, prima) {
  const vecchie = new Map((prima || []).map((m) => [m.pagina, m]));
  const fuori = [];
  for (const m of ora || []) {
    const p = vecchie.get(m.pagina);
    if (!p || m.errore || p.errore) continue;
    for (const k of Object.keys(PEGGIORAMENTO)) {
      if (Number.isFinite(m[k]) && Number.isFinite(p[k]) && m[k] - p[k] > PEGGIORAMENTO[k]) {
        fuori.push({ pagina: m.pagina, metrica: k, prima: p[k], ora: m[k] });
      }
    }
  }
  return fuori;
}

/**
 * Chrome UX Report (utenti reali, telefono): la risposta di records:queryRecord
 * ridotta a { lcp, cls, inp } al 75° percentile. null se Google non ha dati
 * per quell'indirizzo (troppo poco traffico): e' anche un segnale di uso.
 */
function daCrux(risposta) {
  const metriche = risposta && risposta.record && risposta.record.metrics;
  if (!metriche) return null;
  const p75 = (nome) => {
    const v = metriche[nome] && metriche[nome].percentiles && metriche[nome].percentiles.p75;
    return v === undefined ? null : Number(v);
  };
  return {
    lcp: p75('largest_contentful_paint'),
    cls: p75('cumulative_layout_shift'),
    inp: p75('interaction_to_next_paint')
  };
}

/** Le pagine che la settimana prima erano nell'indice di Google e ora non ci sono piu'. */
function usciteDallIndice(ora, prima) {
  const dentro = new Set((prima || []).filter((m) => m.ind === true).map((m) => m.pagina));
  return (ora || []).filter((m) => dentro.has(m.pagina) && m.google && m.google.indice && m.google.indice.indicizzata === false).map((m) => m.pagina);
}

/** Le pagine da guardare per prime: prima quelle con problemi, poi le piu' pesanti. */
function classifica(misure) {
  return [...(misure || [])]
    .map((m) => ({ ...m, problemi: problemi(m) }))
    .sort((a, b) => b.problemi.length - a.problemi.length || (b.tbt || 0) - (a.tbt || 0));
}

/** I messaggi di terzi piu' frequenti, per capire da dove vengono. */
function terzi(misure) {
  const conta = new Map();
  for (const m of misure || []) for (const e of new Set(m.erroriTerzi || [])) conta.set(e, (conta.get(e) || 0) + 1);
  const primi = [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return primi.length ? ' (' + primi.map(([e, n]) => `${e} ×${n}`).join('; ') + ')' : '';
}

/** Le righe del rapporto su Google: indice, motivi, clic e impressioni. */
function sezioniGoogle(r) {
  const g = r.google;
  const misure = r.misure || [];
  const lette = misure.filter((m) => m.google && m.google.indice);
  const fuori = lette.filter((m) => !m.google.indice.indicizzata);
  const testa = [`- Pagine con un problema che le toglie da Google (noindex, canonical, risposta del server): **${misure.filter((m) => problemi(m).some((p) => p.tipo === 'indice')).length}**`];
  if (!g || !g.attivo) {
    testa.push('- Search Console non collegata (manca il segreto `GSC_CREDENZIALI`): non si sa quali pagine Google tiene nell\'indice');
    return { testa, corpo: [] };
  }
  if (lette.length) {
    testa.push(`- Pagine nell'indice di Google: **${lette.length - fuori.length} su ${lette.length}**` +
      (g.totale ? `; da Google dal ${g.dal} al ${g.al}: **${g.totale.clic}** clic e **${g.totale.impressioni}** impressioni` : ''));
  }
  if (g.errore) testa.push(`- Search Console: ${g.errore}`);
  const corpo = [];
  if (fuori.length) {
    const motivi = new Map();
    for (const m of fuori) motivi.set(m.google.indice.stato || '?', (motivi.get(m.google.indice.stato || '?') || 0) + 1);
    corpo.push('### Fuori dall\'indice di Google', '',
      'Motivi: ' + [...motivi.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ×${n}`).join('; ') + '.', '',
      '| Pagina | Stato in Google | Causa tecnica | Ultima visita di Google |', '|---|---|---|---|');
    for (const m of [...fuori].sort((a, b) => a.pagina.localeCompare(b.pagina)).slice(0, 80)) {
      const x = m.google.indice;
      corpo.push(`| ${m.pagina} | ${x.stato || '—'} | ${x.causa || 'nessuna: scelta di Google'} | ${x.ultimaScansione || 'mai'} |`);
    }
    corpo.push('');
  }
  if (g.totale) {
    const conDati = misure.filter((m) => m.google && Number.isFinite(m.google.impressioni));
    const viste = conDati.filter((m) => m.google.impressioni > 0).sort((a, b) => b.google.impressioni - a.google.impressioni);
    corpo.push(`### Da Google (dal ${g.dal} al ${g.al})`, '', `Pagine mai mostrate nei risultati: **${conDati.length - viste.length}** su ${conDati.length}.`, '');
    if (viste.length) {
      corpo.push('| Pagina | Clic | Impressioni | Posizione media |', '|---|---|---|---|');
      for (const m of viste.slice(0, 25)) corpo.push(`| ${m.pagina} | ${m.google.clic} | ${m.google.impressioni} | ${numero(m.google.posizione, 1)} |`);
      corpo.push('');
    }
  }
  return { testa, corpo };
}

const numero = (x, dec) => (Number.isFinite(x) ? x.toLocaleString('it-IT', { maximumFractionDigits: dec || 0 }) : '—');

/** Il testo della issue fissata con l'ultimo controllo. I dati grezzi stanno in fondo, per il confronto della settimana dopo. */
function corpoRapporto(r, prima) {
  const ordinate = classifica(r.misure);
  const conProblemi = ordinate.filter((m) => m.problemi.length);
  const pegg = peggioramenti(r.misure, prima && prima.misure);
  const reali = r.crux || {};
  const conDatiReali = Object.keys(reali).filter((k) => reali[k]);
  const google = sezioniGoogle(r);
  const uscite = usciteDallIndice(r.misure, prima && prima.misure);
  const righe = [
    `Controllo del ${r.data} su ${r.misure.length} pagine di ${r.sito}: telefono a 390 px, CPU rallentata 4 volte, rete mobile, annunci e consenso veri.`,
    '',
    `- Pagine con problemi: **${conProblemi.length}**`,
    `- Pagine con errori di script di terzi (annunci, consenso: non dipendono da noi): **${(r.misure || []).filter((m) => (m.erroriTerzi || []).length).length}**${terzi(r.misure)}`,
    `- Peggiorate rispetto al controllo precedente: **${pegg.length}**`,
    r.cruxAttivo
      ? `- Pagine con dati di utenti reali (Chrome UX Report): **${conDatiReali.length}** (le altre hanno ancora troppo poco traffico)`
      : '- Dati di utenti reali: non attivi (manca il segreto `PSI_KEY` del repository)',
    ...google.testa,
    ...(uscite.length ? [`- Uscite dall'indice di Google rispetto al controllo precedente: **${uscite.length}** (${uscite.slice(0, 5).join(', ')}${uscite.length > 5 ? ', …' : ''})`] : []),
    ''
  ];
  righe.push(...google.corpo);
  if (pegg.length) {
    righe.push('### Peggiorate', '', '| Pagina | Misura | Prima | Ora |', '|---|---|---|---|');
    for (const p of pegg) righe.push(`| ${p.pagina} | ${p.metrica} | ${numero(p.prima, 3)} | ${numero(p.ora, 3)} |`);
    righe.push('');
  }
  if (conProblemi.length) {
    righe.push('### Da sistemare', '', '| Pagina | Problemi |', '|---|---|');
    for (const m of conProblemi.slice(0, 40)) righe.push(`| ${m.pagina} | ${m.problemi.map((x) => x.testo).join('; ')} |`);
    righe.push('');
  }
  if (conDatiReali.length) {
    righe.push('### Utenti reali (75° percentile, telefono)', '', '| Pagina | LCP | CLS | INP |', '|---|---|---|---|');
    for (const k of conDatiReali.sort()) {
      const c = reali[k];
      righe.push(`| ${k} | ${numero(c.lcp)} ms | ${numero(c.cls, 2)} | ${numero(c.inp)} ms |`);
    }
    righe.push('');
  }
  righe.push('### Tutte le pagine', '', '| Pagina | LCP ms | CLS | Blocco ms | KB |', '|---|---|---|---|---|');
  for (const m of ordinate) righe.push(`| ${m.pagina} | ${numero(m.lcp)} | ${numero(m.cls, 3)} | ${numero(m.tbt)} | ${numero(m.kb)} |`);
  righe.push('', '<details><summary>Dati grezzi (per il confronto della settimana prossima)</summary>', '', '```json',
    JSON.stringify({ data: r.data, misure: r.misure.map(({ pagina, lcp, cls, tbt, kb, errore, google: g }) => ({
      pagina, lcp, cls, tbt, kb, errore,
      ind: g && g.indice ? g.indice.indicizzata : undefined,
      imp: g && Number.isFinite(g.impressioni) ? g.impressioni : undefined
    })) }),
    '```', '', '</details>');
  return righe.join('\n');
}

/** I dati grezzi salvati nel rapporto precedente. */
function datiPrecedenti(corpo) {
  const m = String(corpo || '').match(/```json\n(\{[\s\S]*?\})\n```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

/** Avvisi da aprire come issue: solo i problemi gravi (pagina rotta, salti, errori JS) e i peggioramenti netti. */
function avvisi(r, prima) {
  const fuori = [];
  for (const m of classifica(r.misure)) {
    const gravi = m.problemi.filter((p) => ['errore', 'stato', 'cls', 'js', 'rotti', 'indice'].includes(p.tipo));
    if (gravi.length) fuori.push({ id: `pagina:${m.pagina}`, titolo: `Qualità: problema su ${m.pagina}`, testo: gravi.map((p) => '- ' + p.testo).join('\n') });
  }
  for (const p of peggioramenti(r.misure, prima && prima.misure)) {
    fuori.push({ id: `peggiora:${p.pagina}:${p.metrica}`, titolo: `Qualità: ${p.pagina} peggiorata (${p.metrica})`, testo: `- ${p.metrica}: da ${p.prima} a ${p.ora}` });
  }
  const uscite = usciteDallIndice(r.misure, prima && prima.misure);
  if (uscite.length) {
    fuori.push({ id: `uscite:${r.data}`, titolo: `Google: ${uscite.length} ${uscite.length === 1 ? 'pagina uscita' : 'pagine uscite'} dall'indice`,
      testo: uscite.map((p) => { const m = r.misure.find((x) => x.pagina === p); return `- ${p}: ${m.google.indice.stato || '?'}${m.google.indice.causa ? ' — ' + m.google.indice.causa : ''}`; }).join('\n') });
  }
  return fuori;
}

module.exports = { SOGLIE, PEGGIORAMENTO, problemi, peggioramenti, usciteDallIndice, daCrux, classifica, corpoRapporto, datiPrecedenti, avvisi };
