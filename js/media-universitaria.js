(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {

    // Riferimenti DOM
    const formEsame = document.getElementById('form-esame');
    const inputNome = document.getElementById('input-nome');
    const inputVoto = document.getElementById('input-voto');
    const inputCfu = document.getElementById('input-cfu');
    const configLode = document.getElementById('config-lode');

    const listaEsamiContainer = document.getElementById('lista-esami');
    const emptyState = document.getElementById('empty-state');
    const btnClearAll = document.getElementById('btn-clear-all');

    const resMediaPond = document.getElementById('res-media-pond');
    const resVotoLaurea = document.getElementById('res-voto-laurea');
    const resCfuTot = document.getElementById('res-cfu-tot');
    const resMediaArit = document.getElementById('res-media-arit');

    // Caricamento dati da LocalStorage
    let esami = JSON.parse(localStorage.getItem('su_libretto_uni')) || [];
    let lodeValue = parseInt(localStorage.getItem('su_lode_val') || '30', 10);
    configLode.value = lodeValue;

    // Funzione principale di calcolo
    function calcolaMedie() {
      let totVotiPonderati = 0;
      let totVotiAritmetici = 0;
      let totCfu = 0;
      let countEsami = esami.length;

      esami.forEach(esame => {
        let valoreVoto = 0;
        if (esame.voto === '30L') {
          valoreVoto = lodeValue;
        } else {
          valoreVoto = parseInt(esame.voto, 10);
        }

        const cfu = parseInt(esame.cfu, 10);

        totVotiPonderati += (valoreVoto * cfu);
        totVotiAritmetici += valoreVoto;
        totCfu += cfu;
      });

      if (countEsami > 0 && totCfu > 0) {
        const mediaAritmetica = totVotiAritmetici / countEsami;
        const mediaPonderata = totVotiPonderati / totCfu;
        const votoLaurea = (mediaPonderata * 11) / 3;

        resMediaArit.textContent = mediaAritmetica.toFixed(2);
        resMediaPond.textContent = mediaPonderata.toFixed(2);
        resVotoLaurea.textContent = votoLaurea.toFixed(2);
        resCfuTot.textContent = totCfu;
      } else {
        resMediaArit.textContent = "0.00";
        resMediaPond.textContent = "0.00";
        resVotoLaurea.textContent = "0";
        resCfuTot.textContent = "0";
      }
    }

    // Funzione di rendering della tabella
    function renderTabella() {
      listaEsamiContainer.innerHTML = '';
      
      if (esami.length === 0) {
        emptyState.classList.remove('hidden');
        btnClearAll.classList.add('hidden');
      } else {
        emptyState.classList.add('hidden');
        btnClearAll.classList.remove('hidden');

        esami.forEach(esame => {
          const tr = document.createElement('tr');
          tr.className = "hover:bg-gray-50 transition-colors";
          
          let displayNome = esame.nome.trim() !== '' ? esame.nome : '<em>Esame senza nome</em>';
          let displayVoto = esame.voto === '30L' ? '<span class="text-indigo-600 font-bold">30L</span>' : esame.voto;

          tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-800">${displayNome}</td>
            <td class="px-4 py-3 text-center font-bold text-gray-900">${displayVoto}</td>
            <td class="px-4 py-3 text-center">${esame.cfu}</td>
            <td class="px-4 py-3 text-right">
              <button data-id="${esame.id}" class="btn-delete text-red-400 hover:text-red-600 font-bold text-lg leading-none" title="Elimina">×</button>
            </td>
          `;
          listaEsamiContainer.appendChild(tr);
        });

        // Event listener per i bottoni elimina
        document.querySelectorAll('.btn-delete').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const idToRemove = e.target.getAttribute('data-id');
            esami = esami.filter(ex => ex.id !== idToRemove);
            salvaDati();
          });
        });
      }

      calcolaMedie();
    }

    // Salvataggio su LocalStorage
    function salvaDati() {
      localStorage.setItem('su_libretto_uni', JSON.stringify(esami));
      renderTabella();
    }

    // Aggiunta Esame
    formEsame.addEventListener('submit', (e) => {
      e.preventDefault();
      
      if(!inputVoto.value || !inputCfu.value) return;

      const nuovoEsame = {
        id: 'esame_' + Date.now().toString(),
        nome: inputNome.value,
        voto: inputVoto.value,
        cfu: inputCfu.value
      };

      esami.push(nuovoEsame);
      salvaDati();

      // Reset form parziale (mantieni il cursore su nome)
      inputNome.value = '';
      inputVoto.value = '';
      inputCfu.value = '';
      inputNome.focus();
    });

    // Cambio impostazione 30 e Lode
    configLode.addEventListener('change', (e) => {
      lodeValue = parseInt(e.target.value, 10);
      localStorage.setItem('su_lode_val', lodeValue.toString());
      calcolaMedie(); // Ricalcola al volo
    });

    // Reset Totale
    btnClearAll.addEventListener('click', () => {
      if(confirm("Sei sicuro di voler eliminare tutto il libretto? L'azione è irreversibile.")) {
        esami = [];
        salvaDati();
      }
    });

    // Inizializzazione al caricamento
    renderTabella();
  });
})();