// js/prezzo-unitario.js — Prezzo al kg, al litro e al pezzo con confronto fra confezioni
// Tutto il calcolo avviene nel browser: nessun prezzo, nome prodotto o fotografia lascia il dispositivo.
(function () {
  'use strict';

  const RIGHE = [1, 2, 3, 4];

  // Fattori di conversione verso l'unità di riferimento di ciascuna grandezza
  const UNITA = {
    g: { gruppo: 'massa', fattore: 0.001, riferimento: 'kg' },
    kg: { gruppo: 'massa', fattore: 1, riferimento: 'kg' },
    ml: { gruppo: 'volume', fattore: 0.001, riferimento: 'L' },
    cl: { gruppo: 'volume', fattore: 0.01, riferimento: 'L' },
    l: { gruppo: 'volume', fattore: 1, riferimento: 'L' },
    pz: { gruppo: 'pezzi', fattore: 1, riferimento: 'pezzo' }
  };

  const GRUPPI = {
    massa: { etichetta: 'al chilogrammo', unita: '€/kg', quantita: (q) => `${window.SuNumeri.numero(q, 3)} kg` },
    volume: { etichetta: 'al litro', unita: '€/L', quantita: (q) => `${window.SuNumeri.numero(q, 3)} L` },
    pezzi: { etichetta: 'al pezzo', unita: '€/pz', quantita: (q) => `${window.SuNumeri.numero(q, q % 1 === 0 ? 0 : 2)} ${q === 1 ? 'pezzo' : 'pezzi'}` }
  };

  // "5,00 €/kg": il valore non porta il simbolo di valuta, che fa parte dell'unità di misura
  const prezzoUnitario = (valore, gruppo) => `${window.SuNumeri.numeroPreciso(valore)} ${GRUPPI[gruppo].unita}`;

  const $ = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', () => {
    const verdettoTesto = $('verdetto-testo');
    if (!verdettoTesto) return;

    const dettaglio = $('verdetto-dettaglio');
    const formula = $('verdetto-formula');
    const usaSgocciolato = $('usa-sgocciolato');
    const aggiungi = $('aggiungi-prodotto');

    // ---- Lettura dei dati di una riga ---------------------------------------
    function leggiRiga(n) {
      const articolo = document.querySelector(`[data-riga="${n}"]`);
      if (!articolo || articolo.hidden) return null;

      const prezzoGrezzo = $(`prezzo-${n}`).value.trim();
      const quantitaGrezza = $(`quantita-${n}`).value.trim();
      const sgocciolatoGrezzo = $(`sgocciolato-${n}`).value.trim();
      const unita = $(`unita-${n}`).value;
      const nome = $(`nome-${n}`).value.trim() || `Prodotto ${n}`;

      if (!prezzoGrezzo && !quantitaGrezza) return { n, nome, vuota: true };

      const prezzo = window.SuNumeri.parseValido(prezzoGrezzo, { positivo: true, max: 1000000 });
      if (prezzo === null) {
        return { n, nome, errore: prezzoGrezzo ? 'Inserisci un prezzo valido, maggiore di zero.' : 'Inserisci il prezzo.' };
      }

      const quantita = window.SuNumeri.parseValido(quantitaGrezza, { positivo: true, max: 1000000 });
      if (quantita === null) {
        return { n, nome, errore: quantitaGrezza ? 'Inserisci una quantità maggiore di zero.' : 'Inserisci la quantità.' };
      }

      // Il peso sgocciolato sostituisce la quantità totale solo se attivato e coerente
      let quantitaUsata = quantita;
      let notaSgocciolato = '';
      if (usaSgocciolato && usaSgocciolato.checked && sgocciolatoGrezzo) {
        const sgocciolato = window.SuNumeri.parseValido(sgocciolatoGrezzo, { positivo: true, max: 1000000 });
        if (sgocciolato === null) {
          return { n, nome, errore: 'Il peso sgocciolato deve essere un numero maggiore di zero.' };
        }
        if (sgocciolato > quantita) {
          return { n, nome, errore: 'Il peso sgocciolato non può superare la quantità totale della confezione.' };
        }
        quantitaUsata = sgocciolato;
        notaSgocciolato = 'peso sgocciolato';
      }

      const info = UNITA[unita];
      const quantitaRiferimento = quantitaUsata * info.fattore;
      if (!(quantitaRiferimento > 0)) return { n, nome, errore: 'Quantità non valida.' };

      return {
        n,
        nome,
        prezzo,
        quantitaUsata,
        unita,
        gruppo: info.gruppo,
        riferimento: info.riferimento,
        quantitaRiferimento,
        unitario: prezzo / quantitaRiferimento,
        notaSgocciolato
      };
    }

    // ---- Calcolo e rendering ------------------------------------------------
    function ricalcola() {
      const righe = RIGHE.map(leggiRiga).filter(Boolean);
      const valide = [];

      righe.forEach((riga) => {
        const errore = $(`errore-${riga.n}`);
        const unitario = $(`unitario-${riga.n}`);
        const confronto = $(`confronto-${riga.n}`);
        confronto.textContent = '';

        if (riga.vuota) {
          errore.textContent = '';
          unitario.textContent = '—';
          return;
        }
        if (riga.errore) {
          errore.textContent = riga.errore;
          unitario.textContent = '—';
          return;
        }
        errore.textContent = '';
        unitario.textContent = prezzoUnitario(riga.unitario, riga.gruppo);
        valide.push(riga);
      });

      if (valide.length === 0) {
        verdettoTesto.textContent = 'Inserisci prezzo e quantità di almeno due prodotti per vedere quale conviene.';
        dettaglio.innerHTML = '';
        formula.textContent = '';
        return;
      }

      // Confronto separato per grandezza: euro al chilo ed euro al litro non sono paragonabili
      const perGruppo = {};
      valide.forEach((r) => { (perGruppo[r.gruppo] = perGruppo[r.gruppo] || []).push(r); });
      const gruppiPresenti = Object.keys(perGruppo);

      const blocchi = [];
      let titolo = '';

      gruppiPresenti.forEach((gruppo) => {
        const elenco = perGruppo[gruppo].slice().sort((a, b) => a.unitario - b.unitario);
        const migliore = elenco[0];

        elenco.forEach((r) => {
          const confronto = $(`confronto-${r.n}`);
          if (r === migliore) {
            confronto.innerHTML = elenco.length > 1
              ? '<span class="text-emerald-700">✓ il più conveniente</span>'
              : '';
          } else {
            const differenza = (r.unitario - migliore.unitario) / migliore.unitario * 100;
            confronto.innerHTML = `<span class="text-rose-600">+${window.SuNumeri.percentuale(differenza)} rispetto a ${escapeHtml(migliore.nome)}</span>`;
          }
        });

        if (elenco.length > 1) {
          const peggiore = elenco[elenco.length - 1];
          const differenza = (peggiore.unitario - migliore.unitario) / migliore.unitario * 100;
          const righeHtml = elenco.map((r, i) => {
            const nota = r.notaSgocciolato ? ` <span class="text-gray-400">(${r.notaSgocciolato})</span>` : '';
            return `<li class="flex justify-between gap-3 ${i === 0 ? 'font-bold text-emerald-700' : ''}"><span>${escapeHtml(r.nome)}${nota}</span><span>${prezzoUnitario(r.unitario, gruppo)}</span></li>`;
          }).join('');

          blocchi.push(`<div><p class="font-bold text-gray-900 mb-1">Prezzo ${GRUPPI[gruppo].etichetta}</p><ul class="space-y-1">${righeHtml}</ul><p class="text-xs text-gray-500 mt-1">Fra il più conveniente e il più caro ci sono ${window.SuNumeri.percentuale(differenza)} di differenza.</p></div>`);

          if (!titolo) {
            titolo = `Conviene ${migliore.nome}: ${prezzoUnitario(migliore.unitario, gruppo)}.`;
          }

          // Risparmio concreto: quanto costerebbe la quantità del prodotto più caro al prezzo migliore
          const risparmio = (peggiore.unitario - migliore.unitario) * peggiore.quantitaRiferimento;
          if (risparmio > 0.005) {
            blocchi.push(`<p class="text-xs text-gray-600">A parità di quantità (${GRUPPI[gruppo].quantita(peggiore.quantitaRiferimento)}), scegliere ${escapeHtml(migliore.nome)} al posto di ${escapeHtml(peggiore.nome)} fa risparmiare ${window.SuNumeri.euro(risparmio)}.</p>`);
          }
        } else {
          blocchi.push(`<p class="text-xs text-gray-600">Per il confronto ${GRUPPI[gruppo].etichetta} serve almeno un secondo prodotto con la stessa grandezza.</p>`);
        }
      });

      if (gruppiPresenti.length > 1) {
        blocchi.push('<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">I prodotti inseriti usano grandezze diverse (peso, volume o pezzi). Il confronto è mostrato separatamente per ciascuna: un prezzo al chilo e uno al litro non sono paragonabili fra loro.</p>');
      }

      verdettoTesto.textContent = titolo || 'Inserisci un secondo prodotto con la stessa unità di misura per ottenere il confronto.';
      dettaglio.innerHTML = blocchi.join('');

      const esempio = valide[0];
      formula.textContent = `${window.SuNumeri.numero(esempio.prezzo, 2)} € ÷ ${GRUPPI[esempio.gruppo].quantita(esempio.quantitaRiferimento)} = ${prezzoUnitario(esempio.unitario, esempio.gruppo)}`;
    }

    function escapeHtml(testo) {
      return String(testo).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ---- Eventi -------------------------------------------------------------
    RIGHE.forEach((n) => {
      ['prezzo', 'quantita', 'sgocciolato', 'nome'].forEach((campo) => {
        const el = $(`${campo}-${n}`);
        if (el) el.addEventListener('input', ricalcola);
      });
      $(`unita-${n}`).addEventListener('change', ricalcola);

      const rimuovi = $(`rimuovi-${n}`);
      if (rimuovi) {
        rimuovi.addEventListener('click', () => {
          const articolo = document.querySelector(`[data-riga="${n}"]`);
          articolo.hidden = true;
          ['prezzo', 'quantita', 'sgocciolato', 'nome'].forEach((campo) => { $(`${campo}-${n}`).value = ''; });
          $(`stato-${n}`).textContent = '';
          $(`errore-${n}`).textContent = '';
          aggiungi.hidden = false;
          ricalcola();
        });
      }
    });

    if (usaSgocciolato) {
      usaSgocciolato.addEventListener('change', () => {
        document.querySelectorAll('.sgocciolato-box').forEach((box) => {
          box.classList.toggle('hidden', !usaSgocciolato.checked);
        });
        ricalcola();
      });
    }

    if (aggiungi) {
      aggiungi.addEventListener('click', () => {
        const nascosta = RIGHE.map((n) => document.querySelector(`[data-riga="${n}"]`)).find((el) => el && el.hidden);
        if (!nascosta) return;
        nascosta.hidden = false;
        if (usaSgocciolato && usaSgocciolato.checked) {
          nascosta.querySelectorAll('.sgocciolato-box').forEach((box) => box.classList.remove('hidden'));
        }
        nascosta.querySelector('input[type="text"]').focus();
        const restano = RIGHE.some((n) => {
          const el = document.querySelector(`[data-riga="${n}"]`);
          return el && el.hidden;
        });
        aggiungi.hidden = !restano;
      });
    }

    const pulisci = $('pulisci');
    if (pulisci) {
      pulisci.addEventListener('click', () => {
        RIGHE.forEach((n) => {
          ['prezzo', 'quantita', 'sgocciolato', 'nome'].forEach((campo) => { $(`${campo}-${n}`).value = ''; });
          $(`stato-${n}`).textContent = '';
          $(`errore-${n}`).textContent = '';
          const articolo = document.querySelector(`[data-riga="${n}"]`);
          if (articolo && n > 2) articolo.hidden = true;
        });
        aggiungi.hidden = false;
        ricalcola();
      });
    }

    // ---- Scansione del cartellino (facoltativa) -----------------------------
    const PAROLE_OCR = ['prezzo', 'euro', 'offerta', 'sconto', 'kg', 'litro', 'confezione', 'peso', 'netto', 'sgocciolato'];

    RIGHE.forEach((n) => {
      const bottone = $(`scan-${n}`);
      const input = $(`foto-${n}`);
      if (!bottone || !input) return;

      bottone.addEventListener('click', () => input.click());

      // Trascinamento della foto sulla scheda del prodotto: si riusa l'assegnazione file
      // della utility condivisa, senza intercettare i clic sui campi della scheda.
      const scheda = document.querySelector(`[data-riga="${n}"]`);
      if (scheda && window.StrumentiDropzone) {
        ['dragenter', 'dragover'].forEach((evento) => scheda.addEventListener(evento, (e) => {
          e.preventDefault();
          scheda.classList.add('ring-2', 'ring-indigo-300');
        }));
        ['dragleave', 'dragend'].forEach((evento) => scheda.addEventListener(evento, () => {
          scheda.classList.remove('ring-2', 'ring-indigo-300');
        }));
        scheda.addEventListener('drop', (e) => {
          e.preventDefault();
          scheda.classList.remove('ring-2', 'ring-indigo-300');
          const file = e.dataTransfer && e.dataTransfer.files;
          if (file && file.length) window.StrumentiDropzone.setFilesOnInput(input, file);
        });
      }

      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;

        const stato = $(`stato-${n}`);
        const errore = $(`errore-${n}`);
        errore.textContent = '';
        bottone.disabled = true;
        stato.textContent = 'Avvio della lettura...';

        try {
          const esito = await window.SuOcr.leggi(file, {
            parole: PAROLE_OCR,
            onProgresso: (messaggio) => { stato.textContent = messaggio; }
          });

          const testo = `${esito.testo}\n${esito.testoNumerico}`;
          const prezzi = window.SuOcr.trovaPrezzo(testo);
          const quantita = window.SuOcr.trovaQuantita(testo);

          const trovati = [];
          if (prezzi && prezzi.length) {
            // Con più importi sul cartellino si propone il minore: di norma è il prezzo di vendita,
            // non il prezzo al chilo già stampato né il prezzo barrato promozionale
            const prezzo = prezzi.slice().sort((a, b) => a - b)[0];
            $(`prezzo-${n}`).value = window.SuNumeri.numero(prezzo, 2);
            trovati.push(`prezzo ${window.SuNumeri.euro(prezzo)}`);
          }
          if (quantita && quantita.length) {
            const q = quantita[0];
            $(`quantita-${n}`).value = window.SuNumeri.numero(q.valore, q.valore % 1 === 0 ? 0 : 2);
            $(`unita-${n}`).value = q.unita;
            trovati.push(`quantità ${window.SuNumeri.numero(q.valore, q.valore % 1 === 0 ? 0 : 2)} ${q.unita}`);
          }

          if (!trovati.length) {
            stato.textContent = '';
            errore.textContent = 'Non è stato possibile leggere prezzo e quantità: inseriscili a mano.';
          } else if (esito.confidenza < 70) {
            stato.textContent = `Rilevato ${trovati.join(' e ')}. Lettura incerta: controlla i dati prima di continuare.`;
          } else {
            stato.textContent = `Rilevato ${trovati.join(' e ')}. Controlla i valori e correggili se necessario.`;
          }

          ricalcola();
        } catch (err) {
          stato.textContent = '';
          errore.textContent = window.StrumentiErrors
            ? window.StrumentiErrors.friendlyErrorMessage(err, 'Lettura non riuscita: inserisci i dati a mano.')
            : (err.message || 'Lettura non riuscita: inserisci i dati a mano.');
        } finally {
          bottone.disabled = false;
        }
      });
    });

    ricalcola();
  });
})();
