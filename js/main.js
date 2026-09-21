// Ricerca in tempo reale sulla pagina principale
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Ricerca sull'indice completo: i menu mostrano gli strumenti originali, ma qui si
// trovano anche le pagine dedicate a una singola regione, professione o contratto,
// che sono varianti dello stesso strumento.
document.addEventListener('DOMContentLoaded', () => {
  const campo = document.getElementById('search');
  if (!campo) return;

  const sezioni = Array.from(document.querySelectorAll('main section[id]'))
    .filter((s) => s.id !== 'seo-block');

  const risultati = document.createElement('section');
  risultati.id = 'risultati-ricerca';
  risultati.hidden = true;
  risultati.className = 'mb-10';
  risultati.setAttribute('aria-live', 'polite');
  const primo = sezioni[0];
  if (primo && primo.parentNode) primo.parentNode.insertBefore(risultati, primo);

  let indice = null;
  let caricamento = null;

  function caricaIndice() {
    if (indice) return Promise.resolve(indice);
    if (!caricamento) {
      caricamento = fetch('/data/strumenti.json')
        .then((r) => (r.ok ? r.json() : { strumenti: [] }))
        .then((d) => { indice = d.strumenti || []; return indice; })
        .catch(() => { indice = []; return indice; });
    }
    return caricamento;
  }

  const senzaAccenti = (t) => String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  function punteggio(voce, parole) {
    const titolo = senzaAccenti(voce.titolo);
    const testo = titolo + ' ' + senzaAccenti(voce.descrizione) + ' ' + senzaAccenti(voce.percorso);
    let p = 0;
    for (const parola of parole) {
      if (!testo.includes(parola)) return -1;         // tutte le parole devono comparire
      if (titolo.startsWith(parola)) p += 3;
      else if (titolo.includes(parola)) p += 2;
      else p += 1;
    }
    if (voce.variante) p -= 1;                        // prima l'originale, poi le sue varianti
    return p;
  }

  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function scheda(voce) {
    const etichetta = voce.variante
      ? `<span class="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">${esc(voce.variante.genere)}: ${esc(voce.variante.etichetta)}</span>`
      : `<span class="text-[10px] font-bold uppercase tracking-wide text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">${esc(voce.nomeCategoria)}</span>`;
    return `<article class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition">
      <div>${etichetta}
        <h3 class="font-bold text-gray-900 text-base mt-2">${esc(voce.titolo)}</h3>
        <p class="text-sm text-gray-600 mt-1 leading-relaxed">${esc(voce.descrizione).slice(0, 130)}</p>
      </div>
      <div class="mt-3"><a href="${esc(voce.percorso)}" class="text-indigo-600 font-semibold hover:underline text-sm">Apri strumento &rarr;</a></div>
    </article>`;
  }

  function mostraTutto() {
    risultati.hidden = true;
    risultati.innerHTML = '';
    sezioni.forEach((s) => { s.hidden = false; });
  }

  async function cerca(testo) {
    const parole = senzaAccenti(testo).split(/\s+/).filter(Boolean);
    if (!parole.length) { mostraTutto(); return; }

    const voci = await caricaIndice();
    const trovati = voci
      .map((v) => ({ v, p: punteggio(v, parole) }))
      .filter((x) => x.p >= 0)
      .sort((a, b) => b.p - a.p || a.v.titolo.localeCompare(b.v.titolo))
      .map((x) => x.v);

    sezioni.forEach((s) => { s.hidden = true; });
    risultati.hidden = false;
    risultati.innerHTML = trovati.length
      ? `<h2 class="text-xl font-bold text-gray-900 mb-1">${trovati.length} ${trovati.length === 1 ? 'strumento trovato' : 'strumenti trovati'}</h2>
         <p class="text-sm text-gray-500 mb-5">Svuota il campo di ricerca per tornare all'elenco per categoria.</p>
         <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">${trovati.map(scheda).join('')}</div>`
      : `<div class="bg-white p-8 rounded-xl border border-gray-100 text-center">
           <p class="font-bold text-gray-900">Nessuno strumento corrisponde a &laquo;${esc(testo)}&raquo;</p>
           <p class="text-sm text-gray-600 mt-2">Prova con una parola sola, per esempio &laquo;bollo&raquo;, &laquo;IVA&raquo;, &laquo;dimissioni&raquo; o &laquo;fototessera&raquo;.</p>
         </div>`;
  }

  let attesa = null;
  campo.addEventListener('input', (evento) => {
    const testo = evento.target.value.trim();
    clearTimeout(attesa);
    attesa = setTimeout(() => cerca(testo), 120);
  });
});
