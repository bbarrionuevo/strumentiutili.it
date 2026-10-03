// js/heic-ui.js — Pagina "Convertire HEIC in JPG".
//
// Si scelgono (o si trascinano) le foto HEIC dell'iPhone: la pagina riconosce
// i file dall'intestazione (js/heic.js), avvia un Web Worker per processore
// libero (js/workers/heic-worker.js, libheif in WebAssembly) e le converte in
// parallelo. Ogni foto si scarica da sola o tutte insieme in uno ZIP (fflate,
// caricato solo a quel punto). Nessun file lascia il dispositivo.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const FFLATE = '/vendor/fflate@0.8.3/fflate.umd.js';
  const QUALITA = { alta: 0.92, media: 0.85, leggera: 0.75 };

  document.addEventListener('DOMContentLoaded', () => {
    const H = window.Heic;
    const app = $('hc-app');
    if (!H || !app) return;

    const supportato = typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof WebAssembly === 'object';
    if (!supportato) {
      $('hc-supporto').hidden = false;
      $('hc-file').disabled = true;
      return;
    }
    // Safari non sa scrivere WebP da un canvas: l'opzione si toglie dove non funziona
    try {
      const prova = document.createElement('canvas');
      prova.width = prova.height = 1;
      if (!prova.toDataURL('image/webp').startsWith('data:image/webp')) {
        const o = $('hc-formato').querySelector('option[value="webp"]');
        if (o) o.remove();
      }
    } catch (e) { /* niente */ }

    const mb = (byte) => (byte < 1048576
      ? Math.max(1, Math.round(byte / 1024)).toLocaleString('it-IT') + ' KB'
      : (byte / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB');
    let file = [];        // le foto scelte (File)
    let esiti = [];       // per ogni foto: { nome, prima, dopo, blob, url, errore, ms }
    let attivi = [];      // i worker in uso
    let generazione = 0;  // per ignorare risposte di una conversione annullata

    function el(tag, classe, testo) { const e = document.createElement(tag); if (classe) e.className = classe; if (testo !== undefined) e.textContent = testo; return e; }

    function fermaWorker() { attivi.forEach((w) => w.terminate()); attivi = []; }

    function liberaUrl() { esiti.forEach((e) => { if (e && e.url) URL.revokeObjectURL(e.url); }); }

    function riga(i, nome) {
      const li = el('li', 'flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3');
      li.id = 'hc-r-' + i;
      const anteprima = el('div', 'w-14 h-14 shrink-0 rounded-md bg-gray-100 overflow-hidden flex items-center justify-center text-[10px] text-gray-400');
      anteprima.textContent = 'HEIC';
      const testo = el('div', 'min-w-0 flex-1');
      testo.appendChild(el('p', 'text-sm font-bold text-gray-900 truncate', nome));
      testo.appendChild(el('p', 'text-xs text-gray-500 hc-dettaglio', 'In coda…'));
      const azione = el('div', 'shrink-0 hc-azione');
      li.append(anteprima, testo, azione);
      return li;
    }

    function aggiornaRiga(i) {
      const e = esiti[i];
      const li = $('hc-r-' + i);
      if (!li || !e) return;
      const dettaglio = li.querySelector('.hc-dettaglio');
      const azione = li.querySelector('.hc-azione');
      azione.textContent = '';
      if (e.errore) {
        dettaglio.textContent = e.errore;
        dettaglio.className = 'text-xs text-rose-700 hc-dettaglio';
        return;
      }
      const anteprima = li.firstChild;
      anteprima.textContent = '';
      const img = el('img', 'w-14 h-14 object-cover');
      img.src = e.url;
      img.alt = '';
      img.width = 56;
      img.height = 56;
      anteprima.appendChild(img);
      dettaglio.textContent = `${e.larghezza}×${e.altezza} px · ${mb(e.prima)} → ${mb(e.dopo)}` + (e.altre ? ` · nel file c'${e.altre === 1 ? 'era un\'altra immagine' : `erano altre ${e.altre} immagini`}: convertita la prima` : '');
      const a = el('a', 'inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100', 'Scarica');
      a.href = e.url;
      a.download = e.nome;
      azione.appendChild(a);
    }

    function riepiloga(ms) {
      const r = H.riepilogo(esiti.filter(Boolean), ms);
      const parti = [`${r.convertite} ${r.convertite === 1 ? 'foto convertita' : 'foto convertite'} in ${r.secondi.toLocaleString('it-IT')} secondi`];
      if (r.convertite) parti.push(`${mb(r.prima)} → ${mb(r.dopo)}`);
      if (r.errori) parti.push(`${r.errori} non ${r.errori === 1 ? 'riuscita' : 'riuscite'}`);
      $('hc-riepilogo').textContent = parti.join(' · ') + '.';
      $('hc-zip').hidden = r.convertite < 2;
      $('hc-riconverti').hidden = !file.length;
    }

    async function converti() {
      const mia = ++generazione;
      fermaWorker();
      liberaUrl();
      const formato = $('hc-formato').value;
      const qualita = QUALITA[$('hc-qualita').value] || QUALITA.alta;
      const maxLato = Number($('hc-lato').value) || 0;
      const nomi = H.nomiUscita(file.map((f) => f.name), formato);
      esiti = new Array(file.length);
      const elenco = $('hc-elenco');
      elenco.textContent = '';
      file.forEach((f, i) => elenco.appendChild(riga(i, f.name)));
      $('hc-zip').hidden = true;
      $('hc-riepilogo').textContent = '';
      const inizio = performance.now();

      // prima si riconoscono i file dall'intestazione
      const coda = [];
      for (let i = 0; i < file.length; i++) {
        const testa = new Uint8Array(await file[i].slice(0, 64).arrayBuffer());
        if (mia !== generazione) return;
        if (!H.eHeic(testa)) {
          esiti[i] = { errore: 'Non è una foto HEIC/HEIF: per gli altri formati usa il convertitore di immagini.', prima: file[i].size };
          aggiornaRiga(i);
        } else coda.push(i);
      }
      const totali = coda.length;
      let fatte = 0;
      const stato = $('hc-stato');
      stato.textContent = totali ? `Converto ${totali} ${totali === 1 ? 'foto' : 'foto'} sul tuo dispositivo…` : '';
      if (!totali) { riepiloga(performance.now() - inizio); return; }

      const quanti = H.lavoratori(totali, navigator.hardwareConcurrency);
      await new Promise((tutteFatte) => {
        const avanti = (w) => {
          if (mia !== generazione) return;
          const i = coda.shift();
          if (i === undefined) { w.terminate(); attivi = attivi.filter((x) => x !== w); if (!attivi.length) tutteFatte(); return; }
          const li = $('hc-r-' + i);
          if (li) li.querySelector('.hc-dettaglio').textContent = 'Conversione…';
          file[i].arrayBuffer().then((byte) => {
            w.onmessage = (ev) => {
              if (mia !== generazione) return;
              const r = ev.data;
              if (r.errore) esiti[i] = { errore: 'Non riesco a convertirla: ' + r.errore, prima: file[i].size };
              else esiti[i] = { nome: nomi[i], prima: file[i].size, dopo: r.blob.size, blob: r.blob, url: URL.createObjectURL(r.blob), larghezza: r.larghezza, altezza: r.altezza, altre: r.altre, ms: r.ms };
              aggiornaRiga(i);
              fatte++;
              stato.textContent = `Convertite ${fatte} di ${totali}…`;
              avanti(w);
            };
            w.postMessage({ id: i, byte, formato, qualita, maxLato }, [byte]);
          });
        };
        for (let k = 0; k < quanti; k++) {
          const w = new Worker('/js/workers/heic-worker.js');
          w.onerror = () => { if (mia === generazione) stato.textContent = 'Il convertitore non è partito: ricarica la pagina e riprova.'; };
          attivi.push(w);
          avanti(w);
        }
      });
      if (mia !== generazione) return;
      stato.textContent = 'Fatto.';
      riepiloga(performance.now() - inizio);
    }

    function caricaFflate() {
      if (window.fflate) return Promise.resolve(window.fflate);
      return new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = FFLATE;
        s.onload = () => (window.fflate ? ok(window.fflate) : ko(new Error('ZIP non disponibile')));
        s.onerror = () => ko(new Error('ZIP non disponibile'));
        document.head.appendChild(s);
      });
    }

    async function scaricaZip() {
      const bottone = $('hc-zip');
      bottone.disabled = true;
      const testo = bottone.textContent;
      bottone.textContent = 'Preparo lo ZIP…';
      try {
        const fflate = await caricaFflate();
        const contenuto = {};
        for (const e of esiti) {
          if (!e || e.errore) continue;
          // le immagini sono gia' compresse: nello ZIP si mettono senza ricomprimerle
          contenuto[e.nome] = [new Uint8Array(await e.blob.arrayBuffer()), { level: 0 }];
        }
        const zip = fflate.zipSync(contenuto);
        const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'foto-convertite.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) {
        $('hc-stato').textContent = 'Non riesco a preparare lo ZIP: scarica le foto una per una.';
      } finally {
        bottone.disabled = false;
        bottone.textContent = testo;
      }
    }

    function scegli(lista) {
      file = Array.from(lista || []).filter((f) => f && f.size > 0);
      if (file.length) converti();
    }

    $('hc-file').addEventListener('change', (e) => scegli(e.target.files));
    const zona = $('hc-zona');
    ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('ring-2', 'ring-indigo-400'); }));
    ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove('ring-2', 'ring-indigo-400'); }));
    zona.addEventListener('drop', (e) => scegli(e.dataTransfer && e.dataTransfer.files));
    $('hc-zip').addEventListener('click', scaricaZip);
    $('hc-riconverti').addEventListener('click', () => { if (file.length) converti(); });
    window.addEventListener('pagehide', () => { fermaWorker(); liberaUrl(); });
  });
})();
