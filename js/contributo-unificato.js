// js/contributo-unificato.js — Calcolatore Contributo Unificato (JSON Decoupled)
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
        alert("Impossibile caricare i parametri di giustizia. Riprova più tardi.");
        return;
    }

    const conf = regole.contributoUnificato;

    // Elementi UI - Input
    const inputValore = document.getElementById('input-valore');
    const chkIndeterminabile = document.getElementById('chk-indeterminabile');
    const selectGrado = document.getElementById('select-grado');
    const chkAnticipazione = document.getElementById('chk-anticipazione');
    const btnCalcola = document.getElementById('btn-calcola');

    // Elementi UI - Risultati
    const resScaglione = document.getElementById('res-scaglione');
    const resTassaBase = document.getElementById('res-tassa-base');
    const resMoltiplicatore = document.getElementById('res-moltiplicatore');
    const resCu = document.getElementById('res-cu');
    const resAnticipazione = document.getElementById('res-anticipazione');
    const resTotale = document.getElementById('res-totale');

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    function toggleUI() {
        if (chkIndeterminabile.checked) {
            inputValore.disabled = true;
            inputValore.classList.add('bg-gray-100', 'text-gray-400');
        } else {
            inputValore.disabled = false;
            inputValore.classList.remove('bg-gray-100', 'text-gray-400');
        }
    }

    function calcola() {
        const isIndeterminabile = chkIndeterminabile.checked;
        const valoreCausa = Math.max(0, parseFloat(inputValore.value) || 0);
        const grado = selectGrado.value;
        const applicaAnticipazione = chkAnticipazione.checked;

        let tassaBase = 0;
        let etichettaScaglione = "";

        if (isIndeterminabile) {
            tassaBase = conf.valoreIndeterminabileBase;
            etichettaScaglione = "Valore Indeterminabile";
        } else {
            // Ricerca scaglione nello schema ordinario
            let prevLimite = 0;
            for (let i = 0; i < conf.scaglioniOrdinari.length; i++) {
                const scaglione = conf.scaglioniOrdinari[i];
                if (scaglione.valoreMax === null || valoreCausa <= scaglione.valoreMax) {
                    tassaBase = scaglione.tassaBase;
                    if (scaglione.valoreMax === null) {
                        etichettaScaglione = `Oltre ${fmt(prevLimite)}`;
                    } else {
                        etichettaScaglione = `Da ${fmt(prevLimite)} a ${fmt(scaglione.valoreMax)}`;
                    }
                    break;
                }
                prevLimite = scaglione.valoreMax;
            }
        }

        // Estrazione moltiplicatore in base al procedimento
        const moltiplicatore = conf.modificatoriProcedura[grado] || 1.0;
        
        // Calcolo imposte
        const contributoUnificato = tassaBase * moltiplicatore;
        const anticipazione = applicaAnticipazione ? conf.anticipazioneForfettariaArt30 : 0;
        const totaleDaVersare = contributoUnificato + anticipazione;

        // Formattazione etichetta grado
        let etichettaMoltiplicatore = `${moltiplicatore}x`;

        // Aggiornamento DOM
        resScaglione.textContent = etichettaScaglione;
        resTassaBase.textContent = fmt(tassaBase);
        resMoltiplicatore.textContent = etichettaMoltiplicatore;
        resCu.textContent = fmt(contributoUnificato);
        resAnticipazione.textContent = fmt(anticipazione);
        resTotale.textContent = fmt(totaleDaVersare);
    }

    // Event Listeners
    chkIndeterminabile.addEventListener('change', () => { toggleUI(); calcola(); });
    selectGrado.addEventListener('change', calcola);
    chkAnticipazione.addEventListener('change', calcola);
    inputValore.addEventListener('input', calcola);
    btnCalcola.addEventListener('click', calcola);

    // Inizializzazione
    toggleUI();
});