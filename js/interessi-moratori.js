// js/interessi-moratori.js — Calcolatore Interessi Moratori D.Lgs. 231/2002 (JSON Decoupled)
document.addEventListener('DOMContentLoaded', async () => {

    // 1. CARICAMENTO REGOLE FISCALI DAL JSON
    let regole = null;
    try {
        if (window.StrumentiData && window.StrumentiData.getRegoleFiscali) {
            regole = await window.StrumentiData.getRegoleFiscali();
        } else {
            const res = await fetch('/data/regole-fiscali-2026.json');
            regole = await res.json();
        }
    } catch (e) {
        console.error("Errore nel caricamento delle regole fiscali:", e);
        alert("Impossibile caricare lo storico dei tassi BCE. Riprova più tardi.");
        return;
    }

    const conf = regole.interessiMoratori;

    // Elementi UI - Input
    const inputImporto = document.getElementById('input-importo');
    const inputScadenza = document.getElementById('input-scadenza');
    const inputPagamento = document.getElementById('input-pagamento');
    const selectMaggiorazione = document.getElementById('select-maggiorazione');
    const chkForfettario = document.getElementById('chk-forfettario');
    const btnCalcola = document.getElementById('btn-calcola');

    // Elementi UI - Risultati
    const resCapitale = document.getElementById('res-capitale');
    const resGiorni = document.getElementById('res-giorni');
    const resInteressi = document.getElementById('res-interessi');
    const resForfettario = document.getElementById('res-forfettario');
    const resTotale = document.getElementById('res-totale');

    // Pre-popola la data di pagamento ad oggi
    const today = new Date();
    if (inputPagamento && !inputPagamento.value) {
        inputPagamento.value = today.toISOString().split('T')[0];
    }

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    function calcola() {
        const importo = parseFloat(inputImporto.value);
        
        if (!importo || importo <= 0) {
            alert('Inserisci un importo valido.');
            return;
        }
        if (!inputScadenza.value || !inputPagamento.value) {
            alert('Inserisci la data di scadenza e di pagamento.');
            return;
        }

        // Parse date usando l'ora UTC per evitare scostamenti (Timezone Drift)
        const dScad = inputScadenza.value.split('-');
        const dPag = inputPagamento.value.split('-');
        
        const dataScadenza = new Date(Date.UTC(dScad[0], dScad[1] - 1, dScad[2]));
        const dataPagamento = new Date(Date.UTC(dPag[0], dPag[1] - 1, dPag[2]));

        if (dataPagamento <= dataScadenza) {
            alert('La data di pagamento non può essere uguale o antecedente alla data di scadenza.');
            return;
        }

        const tipoMaggiorazione = selectMaggiorazione.value;
        const tassoMaggiorazione = tipoMaggiorazione === 'agroalimentare' 
            ? conf.maggiorazioneAgroalimentare 
            : conf.maggiorazioneOrdinaria;

        // Itera giorno per giorno dalla data successiva alla scadenza fino alla data di pagamento
        let currentDate = new Date(dataScadenza);
        currentDate.setUTCDate(currentDate.getUTCDate() + 1); // La mora scatta il giorno dopo

        let totaleInteressi = 0;
        let giorniDiRitardo = 0;

        while (currentDate <= dataPagamento) {
            giorniDiRitardo++;
            
            const year = currentDate.getUTCFullYear();
            // Verifica anno bisestile per divisore bancario
            const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
            const giorniNellAnno = isLeap ? 366 : 365;

            // Formatta data in YYYY-MM-DD per ricerca nel JSON
            const mm = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(currentDate.getUTCDate()).padStart(2, '0');
            const dateStr = `${year}-${mm}-${dd}`;

            // Trova tasso BCE nel JSON
            let tassoBceVal = 0; // Fallback
            for (let i = 0; i < conf.storicoTassiBce.length; i++) {
                const fascia = conf.storicoTassiBce[i];
                if (dateStr >= fascia.inizio && dateStr <= fascia.fine) {
                    tassoBceVal = fascia.tasso;
                    break;
                }
            }

            // Somma tasso BCE e Maggiorazione
            const tassoGiornaliero = tassoBceVal + tassoMaggiorazione;
            
            // Formula Pro-rata: (C * T / GiorniAnno)
            const interesseDelGiorno = (importo * tassoGiornaliero) / giorniNellAnno;
            totaleInteressi += interesseDelGiorno;

            // Avanza di un giorno
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        // Arrotondamento finale a due decimali
        const interessiFinali = Math.round((totaleInteressi + Number.EPSILON) * 100) / 100;
        
        // Recupero Forfettario
        const spesaForfettaria = chkForfettario.checked ? conf.recuperoForfettario : 0;

        const totaleDaPagare = importo + interessiFinali + spesaForfettaria;

        // Aggiornamento DOM
        resCapitale.textContent = fmt(importo);
        resGiorni.textContent = giorniDiRitardo;
        resInteressi.textContent = fmt(interessiFinali);
        resForfettario.textContent = fmt(spesaForfettaria);
        resTotale.textContent = fmt(totaleDaPagare);
    }

    // Event Listeners
    btnCalcola.addEventListener('click', calcola);
    selectMaggiorazione.addEventListener('change', calcola);
    chkForfettario.addEventListener('change', calcola);
});