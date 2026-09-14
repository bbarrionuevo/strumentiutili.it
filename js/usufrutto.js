// js/usufrutto.js — Calcolatore Usufrutto e Nuda Proprietà (JSON Decoupled)
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
        alert("Impossibile caricare i parametri di valutazione. Riprova più tardi.");
        return;
    }

    const conf = regole.usufruttoENudaProprieta;

    // Elementi UI - Input
    const inputValore = document.getElementById('input-valore');
    const inputEta = document.getElementById('input-eta');
    const btnCalcola = document.getElementById('btn-calcola');

    // Elementi UI - Risultati
    const resEtaApplicata = document.getElementById('res-eta-applicata');
    const resTasso = document.getElementById('res-tasso');
    const resCoefficiente = document.getElementById('res-coefficiente');
    
    const resPercUsufrutto = document.getElementById('res-perc-usufrutto');
    const resValoreUsufrutto = document.getElementById('res-valore-usufrutto');
    
    const resPercNuda = document.getElementById('res-perc-nuda');
    const resValoreNuda = document.getElementById('res-valore-nuda');

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    // Inizializza visualizzazione tasso minimo
    if (resTasso) {
        resTasso.textContent = (conf.tassoFiscaleMinimoTur * 100).toFixed(2) + " %";
    }

    function calcola() {
        const valorePP = parseFloat(inputValore.value);
        const etaInput = inputEta.value.trim();

        if (!valorePP || valorePP <= 0) {
            alert('Inserisci un valore immobiliare valido.');
            return;
        }

        if (!etaInput) {
            alert("Inserisci l'età dell'usufruttuario.");
            return;
        }

        // Parsing delle età (supporta usufrutto congiunto, es: "65, 72, 80")
        const etaArray = etaInput.split(',')
            .map(e => parseInt(e.trim(), 10))
            .filter(e => !isNaN(e) && e >= 0);

        if (etaArray.length === 0) {
            alert("Inserisci un'età valida.");
            return;
        }

        // Se usufrutto congiunto, la legge impone di usare l'età del più giovane (maggior aspettativa di vita)
        const etaRiferimento = Math.min(...etaArray);

        // Ricerca del coefficiente nel JSON
        let coefficiente = 0;
        for (let i = 0; i < conf.matriceDemografica.length; i++) {
            const tramo = conf.matriceDemografica[i];
            if (tramo.etaMax === null || etaRiferimento <= tramo.etaMax) {
                coefficiente = tramo.coeff;
                break;
            }
        }

        // Calcolo Percentuali
        // L'usufrutto in percentuale è dato da (Coefficiente * Tasso Legale). Tasso 2.5% = 0.025
        const quotaUsufruttoDecimale = coefficiente * conf.tassoFiscaleMinimoTur;
        let percUsufrutto = quotaUsufruttoDecimale * 100;
        
        // Limite logico: l'usufrutto non può mai superare il 100% della piena proprietà
        if (percUsufrutto > 100) percUsufrutto = 100;
        
        const percNuda = 100 - percUsufrutto;

        // Calcolo Valori Monetari
        const valoreUsufrutto = valorePP * (percUsufrutto / 100);
        const valoreNudaProprieta = valorePP - valoreUsufrutto; // Sottrazione diretta per evitare discordanze di decimali

        // Aggiornamento DOM
        resEtaApplicata.textContent = `${etaRiferimento} anni`;
        resCoefficiente.textContent = coefficiente.toFixed(2);
        
        resPercUsufrutto.textContent = `${percUsufrutto.toFixed(2)}%`;
        resValoreUsufrutto.textContent = fmt(valoreUsufrutto);
        
        resPercNuda.textContent = `${percNuda.toFixed(2)}%`;
        resValoreNuda.textContent = fmt(valoreNudaProprieta);
    }

    // Event Listeners
    btnCalcola.addEventListener('click', calcola);
    
    // Calcolo al premere "Invio" sull'input età
    inputEta.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            calcola();
        }
    });
});