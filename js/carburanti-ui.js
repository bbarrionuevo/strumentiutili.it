// js/carburanti-ui.js — Pagina "Prezzi carburanti oggi".
//
// Legge i dati che il workflow carburanti.yml pubblica ogni giorno in
// data/vivi/carburanti/ (open data del MIMIT) e li mostra: medie nazionali,
// distributori piu' economici della provincia o vicino all'utente, medie per
// regione, andamento, risparmio sul pieno e costo di un viaggio. I conti sono
// in js/carburanti.js. La posizione, se l'utente la concede, serve solo a
// misurare le distanze qui nel browser: non si invia e non si salva.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DATI = '/data/vivi/carburanti/';
  const CHIAVE = 'su_carburanti_scelte';
  const PASSO = 20; // distributori mostrati per volta
  const MARGINE_PROVINCE = 50; // km oltre il raggio entro cui cercare i centri delle province vicine

  document.addEventListener('DOMContentLoaded', () => {
    const C = window.Carburanti;
    const N = window.SuNumeri;
    if (!C || !N || !$('cb-cerca')) return;

    const campi = {
      provincia: $('cb-provincia'), carburante: $('cb-carburante'), modo: $('cb-modo'),
      raggio: $('cb-raggio'), ordine: $('cb-ordine'), autostrade: $('cb-autostrade'),
      litri: $('cb-litri'), km: $('cb-km'), consumo: $('cb-consumo'), prezzo: $('cb-prezzo'), ar: $('cb-ar')
    };
    const cache = new Map(); // sigla -> Promise<{impianti, prezzi}>
    let riepilogo = null, storico = null, origine = null, mostrati = PASSO, grafico = null;
    let prezzoToccato = false, ultimoRiferimento = null;

    // ------------------------------------------------------------ formati

    const euroLitro = (v, carb) => Number.isFinite(v) ? N.numero(v, 3) + ' €/' + (C.UNITA[carb] === 'kg' ? 'kg' : 'l') : '—';
    const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    function dataEstesa(iso) {
      const [a, m, g] = String(iso).split('-').map(Number);
      return a && m && g ? `${g} ${MESI[m - 1]} ${a}` : String(iso);
    }
    const minuscolo = (carb) => (carb === 'gpl' ? 'GPL' : C.NOMI[carb].toLowerCase());
    // l'anagrafica del Ministero e' quasi tutta in maiuscolo: "VIA ROMA 1" -> "Via Roma 1"
    const leggibile = (t) => (t && t === t.toUpperCase() && /[A-Z]{3}/.test(t)
      ? t.toLowerCase().replace(/(^|[\s'(\/-])(\p{L})/gu, (m, a, l) => a + l.toUpperCase()).replace(/\b(Ss|Sp|Sr)\b/g, (m) => m.toUpperCase())
      : (t || ''));
    // molti nomi sono solo un codice ("8051") o cominciano con un codice ("2480 SESTO")
    const nomeImpianto = (x) => leggibile(String(x.nome || '').replace(/^\s*\d+\s*[-.]?\s*/, '').trim());
    const nomeModo = (m) => ({ self: 'self service', servito: 'servito', migliore: 'self o servito' }[m] || m);
    function giorniFa(iso) {
      const oggi = new Date();
      const utcOggi = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
      return Math.round((utcOggi - Date.parse(iso + 'T00:00:00Z')) / 86400000);
    }
    function el(tag, classe, testo) {
      const e = document.createElement(tag);
      if (classe) e.className = classe;
      if (testo !== undefined) e.textContent = testo;
      return e;
    }
    function stato(testo, errore) {
      const s = $('cb-stato');
      s.textContent = testo || '';
      s.classList.toggle('text-rose-700', !!errore);
      s.classList.toggle('text-gray-600', !errore);
    }

    // ------------------------------------------------------------ memoria

    function ricorda() {
      try {
        localStorage.setItem(CHIAVE, JSON.stringify({
          provincia: campi.provincia.value, carburante: campi.carburante.value, modo: campi.modo.value,
          raggio: campi.raggio.value, autostrade: campi.autostrade.checked,
          litri: campi.litri.value, consumo: campi.consumo.value
        }));
      } catch (e) { /* memoria non disponibile: si riparte dai valori predefiniti */ }
    }
    function ricordato() {
      try { return JSON.parse(localStorage.getItem(CHIAVE) || 'null') || {}; } catch (e) { return {}; }
    }

    // ------------------------------------------------------------ dati

    async function leggiJson(file) {
      const r = await fetch(DATI + file);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }
    function provincia(sigla) {
      if (!cache.has(sigla)) {
        const p = Promise.all([leggiJson('impianti/' + sigla + '.json'), leggiJson('prezzi/' + sigla + '.json')])
          .then(([impianti, prezzi]) => ({ impianti, prezzi: prezzi.p || {} }));
        p.catch(() => cache.delete(sigla)); // al prossimo tentativo si riprova
        cache.set(sigla, p);
      }
      return cache.get(sigla);
    }

    // ------------------------------------------------------------ medie nazionali

    function disegnaMedie() {
      const box = $('cb-medie');
      box.textContent = '';
      for (const carb of C.CARBURANTI) {
        const modo = C.MODO_TIPICO[carb];
        const dato = riepilogo.italia[carb] && riepilogo.italia[carb][modo];
        const tile = el('div', 'rounded-lg bg-gray-50 border border-gray-100 p-4');
        tile.appendChild(el('p', 'text-xs text-gray-500 font-bold uppercase', `${C.NOMI[carb]} ${modo === 'self' ? 'self' : 'servito'}`));
        const valore = el('p', 'mt-1 text-gray-900');
        valore.appendChild(el('span', 'text-2xl font-extrabold tabular-nums', dato ? N.numero(dato.media, 3) : '—'));
        if (dato) valore.appendChild(el('span', 'text-xs font-bold text-gray-500 ml-1 whitespace-nowrap', '€/' + (C.UNITA[carb] === 'kg' ? 'kg' : 'l')));
        tile.appendChild(valore);
        const v = storico && C.variazione(storico.serie, carb, 7);
        const nota = el('p', 'text-[11px] leading-4 text-gray-500 mt-1 min-h-8'); // due righe sempre: altezza fissa
        if (v) {
          const segno = v.differenza > 0 ? '▲ +' : v.differenza < 0 ? '▼ −' : '= ';
          nota.textContent = `${segno}${N.numero(Math.abs(v.differenza), 3)} € rispetto al ${dataEstesa(v.da)}`;
        } else if (dato) {
          nota.textContent = `media di ${N.numero(dato.n, 0)} distributori`;
        }
        tile.appendChild(nota);
        box.appendChild(tile);
      }
      const vecchi = giorniFa(riepilogo.estrazione);
      $('cb-aggiornato').textContent = `Prezzi comunicati dai gestori al Ministero, estrazione del ${dataEstesa(riepilogo.estrazione)}` +
        (vecchi >= 3 ? ` (${vecchi} giorni fa: i dati di oggi non sono ancora arrivati)` : '') + '.';
    }

    // ------------------------------------------------------------ medie per regione

    function disegnaRegioni() {
      const carb = campi.carburante.value;
      const modo = campi.modo.value === 'servito' ? 'servito' : campi.modo.value === 'self' ? 'self' : C.MODO_TIPICO[carb];
      const righe = Object.entries(riepilogo.regioni || {})
        .map(([nome, r]) => ({ nome, d: r[carb] && r[carb][modo] }))
        .filter((x) => x.d && x.d.n >= 5)
        .sort((a, b) => a.d.media - b.d.media);
      $('cb-regioni-titolo').textContent = `${C.NOMI[carb]} ${nomeModo(modo)}: media per regione`;
      const corpo = $('cb-regioni');
      corpo.textContent = '';
      for (const x of righe) {
        const tr = el('tr', 'border-t border-gray-100');
        tr.appendChild(el('th', 'py-1.5 pr-3 text-left font-medium text-gray-800', x.nome));
        tr.appendChild(el('td', 'py-1.5 pr-3 text-right font-bold text-gray-900 tabular-nums', euroLitro(x.d.media, carb)));
        tr.appendChild(el('td', 'py-1.5 text-right text-gray-500 tabular-nums', N.numero(x.d.n, 0)));
        corpo.appendChild(tr);
      }
    }

    // ------------------------------------------------------------ andamento

    function disegnaGrafico() {
      const carb = campi.carburante.value;
      const modo = C.MODO_TIPICO[carb];
      const serie = (storico && storico.serie || []).filter((p) => Number.isFinite(p[carb]));
      $('cb-grafico-titolo').textContent = `${C.NOMI[carb]} ${modo === 'self' ? 'self' : 'servito'}: media nazionale giorno per giorno`;
      const tabella = $('cb-grafico-tabella');
      tabella.textContent = '';
      for (const p of serie.slice(-30).reverse()) {
        const tr = el('tr', 'border-t border-gray-100');
        tr.appendChild(el('th', 'py-1 pr-3 text-left font-medium text-gray-700', dataEstesa(p.d)));
        tr.appendChild(el('td', 'py-1 text-right tabular-nums text-gray-900', euroLitro(p[carb], carb)));
        tabella.appendChild(tr);
      }
      const nota = $('cb-grafico-nota');
      const tela = $('cb-grafico');
      const box = $('cb-grafico-box');
      if (serie.length < 7 || typeof window.Chart === 'undefined') {
        box.hidden = true;
        nota.hidden = false;
        nota.textContent = serie.length < 7
          ? `La serie è iniziata il ${dataEstesa(serie.length ? serie[0].d : riepilogo.estrazione)}: il grafico compare quando ci sono almeno sette giorni di dati. Intanto i valori sono nella tabella qui sotto.`
          : 'Il grafico non si è caricato: i valori sono nella tabella qui sotto.';
        return;
      }
      box.hidden = false;
      nota.hidden = true;
      tela.setAttribute('aria-label', `Andamento della media nazionale: ${C.NOMI[carb]} ${nomeModo(modo)}, dal ${dataEstesa(serie[0].d)} al ${dataEstesa(serie[serie.length - 1].d)}. I valori sono nella tabella.`);
      const etichette = serie.map((p) => p.d);
      const valori = serie.map((p) => p[carb]);
      const riduci = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (grafico) {
        grafico.data.labels = etichette;
        grafico.data.datasets[0].data = valori;
        grafico.data.datasets[0].label = C.NOMI[carb];
        grafico.update();
        return;
      }
      grafico = new window.Chart(tela, {
        type: 'line',
        data: { labels: etichette, datasets: [{ label: C.NOMI[carb], data: valori, borderColor: '#4f46e5', backgroundColor: '#4f46e5', borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 12, tension: 0 }] },
        options: {
          maintainAspectRatio: false,
          animation: { duration: riduci ? 0 : 400 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (v) => dataEstesa(v[0].label),
                label: (ctx) => ' ' + euroLitro(ctx.parsed.y, campi.carburante.value)
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#6b7280', maxTicksLimit: 6, callback: function (v) { const [, m, g] = this.getLabelForValue(v).split('-'); return `${Number(g)}/${Number(m)}`; } } },
            y: { grid: { color: '#f3f4f6' }, border: { display: false }, ticks: { color: '#6b7280', callback: (v) => N.numero(v, 3) } }
          }
        }
      });
    }

    // ------------------------------------------------------------ distributori

    function riferimento(carb, modo, trovati, sigla) {
      // la media locale: dei distributori trovati se c'e' una posizione,
      // altrimenti quella della provincia (senza autostrade) dal riepilogo
      if (origine || campi.autostrade.checked) {
        if (!trovati.length) return null;
        return { media: trovati.reduce((s, x) => s + x.prezzo, 0) / trovati.length, n: trovati.length };
      }
      const p = riepilogo.province[sigla];
      const m = modo === 'migliore' ? 'self' : modo;
      const d = p && p.carburanti && p.carburanti[carb] && (p.carburanti[carb][m] || p.carburanti[carb].servito);
      return d ? { media: d.media, n: d.n } : null;
    }

    function rigaDistributore(x, carb, media) {
      const li = el('li', 'rounded-lg border border-gray-100 bg-white p-4 flex flex-wrap items-start justify-between gap-3');
      const sinistra = el('div', 'min-w-0 flex-1');
      const titolo = el('p', 'font-bold text-gray-900 break-words');
      const nome = nomeImpianto(x);
      const marchio = x.bandiera && x.bandiera !== 'Pompe Bianche' ? x.bandiera : '';
      titolo.textContent = [marchio, nome].filter(Boolean).join(' · ') || 'Distributore';
      sinistra.appendChild(titolo);
      sinistra.appendChild(el('p', 'text-sm text-gray-600 break-words', [leggibile(x.indirizzo), leggibile(x.comune)].filter(Boolean).join(', ')));
      const extra = [];
      if (x.km !== null) extra.push(N.numero(x.km, 1) + ' km in linea d\'aria');
      if (x.autostrada) extra.push('in autostrada');
      if (x.bandiera === 'Pompe Bianche') extra.push('pompa bianca (senza marchio)');
      if (extra.length) sinistra.appendChild(el('p', 'text-xs text-gray-500 mt-1', extra.join(' · ')));
      const link = C.indicazioni(x.lat, x.lon);
      if (link) {
        const a = el('a', 'inline-flex items-center gap-1 mt-2 text-xs font-bold text-indigo-700 hover:underline', 'Indicazioni stradali ↗');
        a.href = link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', 'Indicazioni stradali per ' + titolo.textContent + ' (si apre in una nuova scheda)');
        sinistra.appendChild(a);
      }
      const destra = el('div', 'text-right shrink-0');
      destra.appendChild(el('p', 'text-xl font-extrabold text-gray-900 tabular-nums', euroLitro(x.prezzo, carb)));
      if (media && Number.isFinite(media.media)) {
        const diff = x.prezzo - media.media;
        const p = el('p', 'text-xs font-bold tabular-nums ' + (diff < -0.0005 ? 'text-emerald-700' : diff > 0.0005 ? 'text-rose-700' : 'text-gray-500'));
        p.textContent = Math.abs(diff) < 0.0005 ? 'nella media' : `${diff < 0 ? '−' : '+'}${N.numero(Math.abs(diff), 3)} sulla media`;
        destra.appendChild(p);
      }
      li.appendChild(sinistra);
      li.appendChild(destra);
      return li;
    }

    let giro = 0; // scarta le risposte di ricerche superate da una piu' recente
    async function cerca() {
      const mio = ++giro;
      const carb = campi.carburante.value;
      const modo = campi.modo.value;
      const sigla = campi.provincia.value;
      const raggio = Number(campi.raggio.value) || 10;
      campi.raggio.disabled = !origine;
      campi.ordine.disabled = !origine;
      $('cb-raggio-nota').hidden = !!origine;
      if (!origine && !sigla) {
        stato('Scegli una provincia o usa la tua posizione.');
        $('cb-sintesi').textContent = '';
        $('cb-elenco').textContent = '';
        $('cb-altri').hidden = true;
        calcolaRisparmio(null, null);
        return;
      }
      const sigle = origine
        ? C.provinceVicine(riepilogo.province, origine.lat, origine.lon, raggio + MARGINE_PROVINCE, 4)
        : [sigla];
      stato('Carico i prezzi…');
      let dati;
      try {
        dati = await Promise.all(sigle.map(provincia));
      } catch (e) {
        if (mio === giro) stato('Non riesco a scaricare i prezzi di questa zona: controlla la connessione e riprova.', true);
        return;
      }
      if (mio !== giro) return;
      const impianti = dati.flatMap((d) => d.impianti);
      const prezzi = Object.assign({}, ...dati.map((d) => d.prezzi));
      const opzioni = { carb, modo, origine, raggioKm: origine ? raggio : null, ordine: origine ? campi.ordine.value : 'prezzo', autostrade: campi.autostrade.checked, limite: 0 };
      const tutti = C.elenca(impianti, prezzi, opzioni);
      const media = riferimento(carb, modo, tutti, sigla);
      const piuEconomico = tutti.reduce((m, x) => (!m || x.prezzo < m.prezzo ? x : m), null);

      const zona = origine ? `entro ${raggio} km dalla tua posizione` : `in provincia di ${riepilogo.province[sigla].nome}`;
      const elenco = $('cb-elenco');
      elenco.textContent = '';
      if (!tutti.length) {
        stato('');
        $('cb-sintesi').textContent = `Nessun distributore ${zona} ha comunicato un prezzo ${nomeModo(modo)} per ${minuscolo(carb)} negli ultimi ${riepilogo.giorni_validita} giorni.` +
          (origine ? ' Prova ad allargare il raggio.' : ' Prova con "self o servito".');
        $('cb-altri').hidden = true;
        calcolaRisparmio(null, null);
        return;
      }
      ultimoRiferimento = media ? media.media : null;
      calcolaViaggio();
      stato(`${N.numero(tutti.length, 0)} distributori ${zona} con un prezzo ${nomeModo(modo)} per ${minuscolo(carb)}.`);
      const sintesi = [`Il più economico ${zona} è a ${euroLitro(piuEconomico.prezzo, carb)} (${leggibile(piuEconomico.comune)}).`];
      if (media) sintesi.push(`La media ${origine || campi.autostrade.checked ? 'dei distributori trovati' : 'della provincia, autostrade escluse,'} è ${euroLitro(media.media, carb)}.`);
      $('cb-sintesi').textContent = sintesi.join(' ');
      for (const x of tutti.slice(0, mostrati)) elenco.appendChild(rigaDistributore(x, carb, media));
      const altri = $('cb-altri');
      altri.hidden = tutti.length <= mostrati;
      altri.textContent = `Mostra altri ${Math.min(PASSO, tutti.length - mostrati)} distributori`;
      calcolaRisparmio(piuEconomico, media);
    }

    // ------------------------------------------------------------ calcolatori

    function calcolaRisparmio(piuEconomico, media) {
      const out = $('cb-risparmio');
      const carb = campi.carburante.value;
      const litri = N.parseValido(campi.litri.value, { positivo: true, max: 1000 });
      $('cb-litri-unita').textContent = C.UNITA[carb] === 'kg' ? 'Quantità del pieno (kg)' : 'Quantità del pieno (litri)';
      if (!piuEconomico || !media || !litri) {
        out.textContent = piuEconomico ? 'Inserisci quanti litri metti di solito.' : 'Cerca prima i distributori di una zona.';
        return;
      }
      const r = C.risparmio(litri, piuEconomico.prezzo, media.media);
      out.textContent = r > 0
        ? `Con ${N.numero(litri, 0)} ${C.UNITA[carb] === 'kg' ? 'kg' : 'litri'} al distributore più economico spendi ${N.euro(litri * piuEconomico.prezzo)}: ${N.euro(r)} in meno che al prezzo medio.`
        : 'Qui i prezzi sono allineati alla media: il risparmio sul pieno è minimo.';
    }

    function prezzoDiRiferimento() {
      const carb = campi.carburante.value;
      const d = riepilogo && riepilogo.italia[carb] && riepilogo.italia[carb][C.MODO_TIPICO[carb]];
      return d ? d.media : null;
    }

    function calcolaViaggio() {
      const carb = campi.carburante.value;
      const unita = C.UNITA[carb] === 'kg' ? 'kg' : 'litro';
      $('cb-consumo-etichetta').textContent = `Consumo (km con un ${unita})`;
      $('cb-prezzo-etichetta').textContent = `Prezzo (€/${unita === 'kg' ? 'kg' : 'l'})`;
      if (!prezzoToccato) {
        const rif = ultimoRiferimento !== null ? ultimoRiferimento : prezzoDiRiferimento();
        campi.prezzo.value = Number.isFinite(rif) ? N.numero(rif, 3) : '';
      }
      const km = N.parseValido(campi.km.value, { positivo: true, max: 100000 });
      const consumo = N.parseValido(campi.consumo.value, { positivo: true, max: 200 });
      const prezzo = N.parseValido(campi.prezzo.value, { positivo: true, max: 20 });
      const r = C.costoViaggio(km, consumo, prezzo, campi.ar.checked);
      const out = $('cb-viaggio');
      if (!r) { out.textContent = 'Inserisci chilometri, consumo e prezzo.'; return; }
      out.textContent = `${N.numero(r.km, 0)} km: servono circa ${N.numero(r.quantita, 1)} ${unita === 'kg' ? 'kg' : 'litri'}, per una spesa di ${N.euro(r.costo)}.`;
    }

    // ------------------------------------------------------------ eventi

    function cambiaCarburante() {
      campi.modo.value = C.MODO_TIPICO[campi.carburante.value];
      ultimoRiferimento = null;
      aggiornaTutto();
    }
    function aggiornaTutto() {
      mostrati = PASSO;
      ricorda();
      disegnaRegioni();
      disegnaGrafico();
      calcolaViaggio();
      cerca();
    }

    campi.provincia.addEventListener('change', () => { origine = null; $('cb-vicino-stato').textContent = ''; aggiornaTutto(); });
    campi.carburante.addEventListener('change', cambiaCarburante);
    [campi.modo, campi.raggio, campi.ordine, campi.autostrade].forEach((c) => c.addEventListener('change', aggiornaTutto));
    $('cb-altri').addEventListener('click', () => { mostrati += PASSO; cerca(); });
    $('cb-cerca').addEventListener('submit', (e) => { e.preventDefault(); aggiornaTutto(); });
    campi.litri.addEventListener('input', () => { ricorda(); cerca(); });
    [campi.km, campi.consumo].forEach((c) => c.addEventListener('input', () => { ricorda(); calcolaViaggio(); }));
    campi.ar.addEventListener('change', calcolaViaggio);
    campi.prezzo.addEventListener('input', () => { prezzoToccato = campi.prezzo.value.trim() !== ''; calcolaViaggio(); });

    $('cb-vicino').addEventListener('click', () => {
      const s = $('cb-vicino-stato');
      if (!navigator.geolocation) { s.textContent = 'Il browser non permette di usare la posizione: scegli la provincia.'; return; }
      s.textContent = 'Cerco la tua posizione…';
      navigator.geolocation.getCurrentPosition((p) => {
        // tre decimali (circa cento metri) bastano per le distanze; non si salva
        origine = { lat: Math.round(p.coords.latitude * 1000) / 1000, lon: Math.round(p.coords.longitude * 1000) / 1000 };
        const vicina = C.provinceVicine(riepilogo.province, origine.lat, origine.lon, 0, 1)[0];
        if (vicina) campi.provincia.value = vicina;
        s.textContent = 'Uso la tua posizione, solo in questa pagina.';
        campi.ordine.value = 'prezzo';
        aggiornaTutto();
      }, () => {
        s.textContent = 'Posizione non disponibile o negata: scegli la provincia dall\'elenco.';
      }, { maximumAge: 600000, timeout: 15000, enableHighAccuracy: false });
    });

    // ------------------------------------------------------------ avvio

    function riempiProvince() {
      const elenco = Object.entries(riepilogo.province).sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'it'));
      for (const [sigla, p] of elenco) {
        const o = document.createElement('option');
        o.value = sigla;
        o.textContent = `${p.nome} (${sigla})`;
        campi.provincia.appendChild(o);
      }
    }

    (async function avvio() {
      stato('Carico i prezzi di oggi…');
      try {
        [riepilogo, storico] = await Promise.all([leggiJson('riepilogo.json'), leggiJson('storico.json').catch(() => null)]);
      } catch (e) {
        stato('Non riesco a scaricare i prezzi: controlla la connessione e ricarica la pagina.', true);
        return;
      }
      riempiProvince();
      const m = ricordato();
      if (m.provincia && riepilogo.province[m.provincia]) campi.provincia.value = m.provincia;
      if (C.CARBURANTI.includes(m.carburante)) campi.carburante.value = m.carburante;
      campi.modo.value = ['self', 'servito', 'migliore'].includes(m.modo) ? m.modo : C.MODO_TIPICO[campi.carburante.value];
      if (m.raggio && [...campi.raggio.options].some((o) => o.value === m.raggio)) campi.raggio.value = m.raggio;
      campi.autostrade.checked = !!m.autostrade;
      if (m.litri) campi.litri.value = m.litri;
      if (m.consumo) campi.consumo.value = m.consumo;
      disegnaMedie();
      aggiornaTutto();
    })();
  });
})();
