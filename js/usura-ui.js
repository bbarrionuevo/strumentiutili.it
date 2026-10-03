// js/usura-ui.js — Pagina "Tassi soglia usura".
//
// Legge data/vivi/usura/soglie.json (aggiornato da solo dal workflow
// usura.yml a ogni decreto trimestrale del MEF), mostra la tabella del
// trimestre scelto e confronta il tasso di un contratto con la soglia del
// trimestre in cui e' stato firmato. I conti sono in js/usura.js; nessun dato
// esce dal browser.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  document.addEventListener('DOMContentLoaded', () => {
    const U = window.Usura;
    const N = window.SuNumeri;
    if (!U || !N || !$('us-app')) return;
    let dati = null;

    const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const data = (iso) => { const [a, m, g] = String(iso).split('-').map(Number); return a ? `${g}${g === 1 ? '°' : ''} ${MESI[m - 1]} ${a}` : ''; };
    const pct = (x, dec) => N.numero(x, dec === undefined ? 2 : dec) + '%';
    // le soglie hanno fino a 4 decimali (17,2125%): si mostrano tutti solo se servono
    const soglia = (x) => N.numero(x, Math.round(x * 10000) % 100 ? 4 : 2) + '%';
    const nomePeriodo = (t) => `dal ${data(t.dal)} al ${data(t.al)}`;
    function el(tag, classe, testo) { const e = document.createElement(tag); if (classe) e.className = classe; if (testo !== undefined) e.textContent = testo; return e; }

    // ------------------------------------------------------------ tabella

    function disegnaTabella() {
      const t = dati.trimestri.find((x) => x.dal === $('us-trimestre').value) || dati.trimestri[0];
      const v = U.vigenti(dati.trimestri, oggi());
      $('us-periodo').textContent = `Tassi soglia ${nomePeriodo(t)}` + (v.ora && v.ora.dal === t.dal ? ' (in vigore oggi)' : t.dal > oggi() ? ' (dal prossimo trimestre)' : '') + '.';
      const a = $('us-decreto');
      a.href = t.decreto.url;
      a.textContent = `decreto del ${data(t.decreto.data)} (prot. ${t.decreto.protocollo})`;
      $('us-rilevazione').textContent = `TEGM rilevati ${nomePeriodo(t.rilevazione)}.`;
      const corpo = $('us-tabella');
      corpo.textContent = '';
      let ultima = '';
      for (const r of U.righe(dati, t)) {
        const tr = el('tr', 'border-t border-gray-100 align-top');
        const nuova = r.categoria !== ultima;
        const th = el('th', 'py-2 pr-3 text-left font-medium text-gray-800', nuova ? r.categoria : '');
        th.scope = 'row';
        if (!nuova) th.appendChild(el('span', 'sr-only', r.categoria));
        tr.appendChild(th);
        tr.appendChild(el('td', 'py-2 pr-3 text-gray-600', r.classe || '—'));
        tr.appendChild(el('td', 'py-2 pr-3 text-right tabular-nums text-gray-700', pct(r.tegm)));
        tr.appendChild(el('td', 'py-2 text-right tabular-nums font-bold text-gray-900', soglia(r.soglia)));
        corpo.appendChild(tr);
        ultima = r.categoria;
      }
      const m = t.mora;
      $('us-mora').textContent = m
        ? `Nell'ultima rilevazione statistica citata dal decreto, gli interessi di mora pattuiti superavano i tassi corrispettivi in media di ${N.numero(m.mutui, 1)} punti per i mutui ipotecari oltre cinque anni, ${N.numero(m.leasing, 1)} punti per il leasing e ${N.numero(m.altri, 1)} punti per gli altri prestiti. È un dato statistico, non una soglia.`
        : '';
    }

    // ------------------------------------------------------------ verifica

    function categoriaScelta() { return dati.categorie.find((c) => c.id === $('us-categoria').value); }

    function aggiornaCampi() {
      const c = categoriaScelta();
      const conImporto = c && c.classi.some((x) => x.min !== undefined || x.max !== undefined);
      const conTipo = c && c.classi.length > 1 && !conImporto;
      $('us-importo-box').hidden = !conImporto;
      $('us-tipo-box').hidden = !conTipo;
      if (conTipo) {
        const sel = $('us-tipo');
        const attuale = sel.value;
        sel.textContent = '';
        for (const cl of c.classi) { const o = document.createElement('option'); o.value = cl.id; o.textContent = cl.etichetta; sel.appendChild(o); }
        if (c.classi.some((x) => x.id === attuale)) sel.value = attuale;
      }
    }

    function verifica() {
      if (!dati) return;
      aggiornaCampi();
      const c = categoriaScelta();
      const out = $('us-esito');
      const box = $('us-esito-box');
      const tasso = N.parseValido($('us-tasso').value, { min: 0, max: 200 });
      const importo = N.parseValido($('us-importo').value, { positivo: true });
      const quando = $('us-data').value || oggi();
      const opz = { categoria: c && c.id, data: quando, tasso: tasso === null ? undefined : tasso, importo };
      if (!$('us-tipo-box').hidden) opz.classe = $('us-tipo').value;
      const r = U.verifica(dati, opz);
      box.className = 'rounded-lg border p-4 mt-4';
      out.textContent = '';
      if (r.errore === 'data') {
        const piuVecchio = dati.trimestri[dati.trimestri.length - 1];
        box.classList.add('border-gray-200', 'bg-gray-50');
        out.textContent = quando < piuVecchio.dal
          ? `Qui ci sono i tassi dal ${data(piuVecchio.dal)}. Per un contratto firmato prima, la soglia è nel decreto di quel trimestre sul sito del Ministero dell'Economia.`
          : 'Per questa data il decreto non è ancora stato pubblicato.';
        return;
      }
      if (r.errore === 'classe') { box.classList.add('border-gray-200', 'bg-gray-50'); out.textContent = 'Indica l\'importo del finanziamento per trovare la classe giusta.'; return; }
      if (r.errore) { box.classList.add('border-gray-200', 'bg-gray-50'); out.textContent = 'Scegli il tipo di finanziamento.'; return; }
      const titolo = el('p', 'font-bold text-base');
      const dettaglio = el('p', 'text-sm mt-1');
      dettaglio.textContent = `${r.categoria.nome}${r.classe.etichetta ? ', ' + r.classe.etichetta : ''}: nel trimestre ${nomePeriodo(r.trimestre)} il tasso medio (TEGM) era ${pct(r.tegm)} e la soglia ${soglia(r.soglia)}.`;
      if (r.esito === undefined) {
        box.classList.add('border-indigo-100', 'bg-indigo-50');
        titolo.textContent = `Soglia: ${soglia(r.soglia)}`;
      } else if (r.esito === 'oltre') {
        box.classList.add('border-rose-200', 'bg-rose-50', 'text-rose-900');
        titolo.textContent = `Il tasso indicato supera la soglia di ${N.numero(r.differenza, 2)} punti.`;
      } else if (r.esito === 'vicino') {
        box.classList.add('border-amber-200', 'bg-amber-50', 'text-amber-900');
        titolo.textContent = `Il tasso indicato è sotto la soglia, ma di meno di un punto (${N.numero(-r.differenza, 2)} punti).`;
      } else {
        box.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-900');
        titolo.textContent = `Il tasso indicato è ${N.numero(-r.differenza, 2)} punti sotto la soglia.`;
      }
      out.appendChild(titolo);
      out.appendChild(dettaglio);
      if (r.esito === 'oltre' || r.esito === 'vicino') {
        out.appendChild(el('p', 'text-xs mt-2', 'Il confronto va fatto con il tasso calcolato secondo le istruzioni della Banca d\'Italia, che comprende commissioni e spese legate al credito: prima di muoverti fai verificare il calcolo da un professionista o da un\'associazione dei consumatori.'));
      }
      disegnaStorico(r.categoria, r.classe);
    }

    function disegnaStorico(cat, cl) {
      const corpo = $('us-storico');
      corpo.textContent = '';
      $('us-storico-titolo').textContent = `${cat.nome}${cl.etichetta ? ', ' + cl.etichetta : ''}: soglie trimestre per trimestre`;
      for (const t of dati.trimestri) {
        const x = t.tassi[`${cat.id}:${cl.id}`];
        if (!x) continue;
        const tr = el('tr', 'border-t border-gray-100');
        const th = el('th', 'py-1.5 pr-3 text-left font-medium text-gray-700', `${data(t.dal)} – ${data(t.al)}`);
        th.scope = 'row';
        tr.appendChild(th);
        tr.appendChild(el('td', 'py-1.5 pr-3 text-right tabular-nums text-gray-700', pct(x[0])));
        tr.appendChild(el('td', 'py-1.5 text-right tabular-nums font-bold text-gray-900', soglia(x[1])));
        corpo.appendChild(tr);
      }
    }

    function calcolaDaRata() {
      const importo = N.parseValido($('us-finanziato').value, { positivo: true });
      const rata = N.parseValido($('us-rata').value, { positivo: true });
      const n = N.parseValido($('us-numero-rate').value, { positivo: true });
      const spese = N.parseValido($('us-spese').value, { min: 0 }) || 0;
      const perAnno = Number($('us-frequenza').value) || 12;
      const out = $('us-rata-esito');
      const t = importo && rata && n ? U.tassoDaRata(importo, rata, Math.round(n), spese, perAnno) : null;
      if (t === null) { out.textContent = 'Inserisci importo, rata e numero di rate: il totale delle rate deve superare l\'importo ricevuto.'; return; }
      out.textContent = `Tasso annuo effettivo: circa ${pct(t)}. L'ho riportato qui sopra per il confronto con la soglia.`;
      $('us-tasso').value = N.numero(t, 2);
      verifica();
    }

    // ------------------------------------------------------------ avvio

    function riempi() {
      const sel = $('us-trimestre');
      const v = U.vigenti(dati.trimestri, oggi());
      for (const t of dati.trimestri) {
        const o = document.createElement('option');
        o.value = t.dal;
        o.textContent = nomePeriodo(t) + (v.ora && v.ora.dal === t.dal ? ' (in vigore)' : t.dal > oggi() ? ' (prossimo)' : '');
        sel.appendChild(o);
      }
      sel.value = (v.ora || dati.trimestri[0]).dal;
      const cat = $('us-categoria');
      for (const c of dati.categorie) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.nome; cat.appendChild(o); }
      if (!$('us-data').value) $('us-data').value = oggi();
    }

    $('us-trimestre').addEventListener('change', disegnaTabella);
    ['us-categoria', 'us-tipo', 'us-importo', 'us-data', 'us-tasso'].forEach((id) => { $(id).addEventListener('input', verifica); $(id).addEventListener('change', verifica); });
    $('us-calcola').addEventListener('click', calcolaDaRata);

    fetch('/data/vivi/usura/soglie.json')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => {
        dati = d;
        const memoria = $('us-categoria').value;
        riempi();
        if (memoria && d.categorie.some((c) => c.id === memoria)) $('us-categoria').value = memoria;
        disegnaTabella();
        verifica();
      })
      .catch(() => { $('us-periodo').textContent = 'Non riesco a caricare i tassi: controlla la connessione e ricarica la pagina.'; });
  });
})();
