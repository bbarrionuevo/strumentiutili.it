// js/canone-tv-ui.js — I riquadri "per quale periodo vale" delle pagine sul
// canone TV. I conti li fa js/canone-tv.js; qui si leggono i campi e si
// scrive la risposta in italiano.
(() => {
  'use strict';

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
    'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  // Le date arrivano gia' controllate da CanoneTv (AAAA-MM-GG): qui si
  // trasformano solo in parole.
  function leggibile(iso) {
    const [a, m, g] = iso.split('-').map(Number);
    return `${g === 1 ? '1°' : g} ${MESI[m - 1]} ${a}`;
  }

  function oggi() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Scrive frasi con qualche parola in grassetto, senza passare da innerHTML.
  function scrivi(nodo, pezzi) {
    nodo.textContent = '';
    pezzi.forEach((p) => {
      if (typeof p === 'string') { nodo.appendChild(document.createTextNode(p)); return; }
      const b = document.createElement('strong');
      b.textContent = p.forte;
      nodo.appendChild(b);
    });
  }

  function nonDetenzione(box) {
    const campo = box.querySelector('#canone-data-invio');
    const esito = box.querySelector('[data-canone-esito]');
    if (!campo || !esito) return;
    if (!campo.value) campo.value = oggi();

    const aggiorna = () => {
      const r = window.CanoneTv.effettoNonDetenzione(campo.value);
      if (!r) { esito.textContent = ''; return; }
      const quando = leggibile(campo.value);
      if (r.periodo === 'secondo') {
        scrivi(esito, [
          `Presentata il ${quando}, vale solo per il `, { forte: `secondo semestre ${r.anno}` },
          ' (luglio-dicembre): le rate da gennaio a giugno restano dovute. Per non pagare nulla del ',
          `${r.anno + 1}, ripresentala dal 1 luglio ${r.anno}.`,
        ]);
        return;
      }
      const pezzi = [`Presentata il ${quando}, vale per `, { forte: `tutto il ${r.anno}` }, '. '];
      const legale = `${r.anno}-01-31`;
      if (r.termine === legale) {
        pezzi.push(`Per coprire l'intero anno l'ultimo giorno utile è il ${leggibile(legale)}.`);
      } else {
        pezzi.push(`Il termine per l'intero anno è il 31 gennaio ${r.anno}, che cade nel fine settimana: `,
          `come per il 2026, dovrebbe slittare al ${leggibile(r.termine)}. Meglio non aspettare l'ultimo giorno.`);
      }
      scrivi(esito, pezzi);
    };
    campo.addEventListener('input', aggiorna);
    aggiorna();
  }

  function over75(box) {
    const nascita = box.querySelector('#canone-nascita');
    const anno = box.querySelector('#canone-anno');
    const esito = box.querySelector('[data-canone-esito]');
    if (!nascita || !anno || !esito) return;
    if (!anno.value) anno.value = String(new Date().getFullYear());

    const aggiorna = () => {
      const a = Number(anno.value);
      const r = window.CanoneTv.esenzioneOver75(nascita.value, a);
      if (!r || a < 2016 || a > 2100) {
        esito.textContent = nascita.value ? '' : 'Inserisci la data di nascita per vedere da quando spetta.';
        return;
      }
      const compleanno = `Compi 75 anni il ${leggibile(r.compleanno75)}: `;
      if (r.periodo === 'intero') {
        scrivi(esito, [compleanno, `per il ${a} l'esenzione vale per `, { forte: "tutto l'anno" },
          ', se hai anche gli altri requisiti.']);
      } else if (r.periodo === 'secondo') {
        scrivi(esito, [compleanno, `per il ${a} l'esenzione vale solo per il `, { forte: 'secondo semestre' },
          ` (luglio-dicembre). Dal ${a + 1} vale per tutto l'anno.`]);
      } else if (Number(r.compleanno75.slice(0, 4)) > a) {
        scrivi(esito, [compleanno, `per il ${a} l'esenzione `, { forte: 'non spetta ancora' }, '.']);
      } else {
        scrivi(esito, [compleanno, `per il ${a} l'esenzione non spetta (i 75 anni arrivano dopo il 31 luglio); `,
          'vale per ', { forte: `tutto il ${a + 1}` }, '.']);
      }
    };
    nascita.addEventListener('input', aggiorna);
    anno.addEventListener('input', aggiorna);
    aggiorna();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.CanoneTv) return;
    document.querySelectorAll('[data-canone="non-detenzione"]').forEach(nonDetenzione);
    document.querySelectorAll('[data-canone="over75"]').forEach(over75);
  });
})();
