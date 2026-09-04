document.addEventListener('DOMContentLoaded', () => {
    // Soglie e Importi 2026 dal documento ufficiale
    const ISEE_MIN = 17476.85;
    const ISEE_MAX = 45000.00;
    
    const BASE_MINORE_MAX = 203.80;
    const BASE_MINORE_MIN = 58.30;
    
    const BASE_MAGG_MAX = 98.70;
    const BASE_MAGG_MIN = 28.00; // Valore indicativo di soglia
    
    const MAGG_LAV_MAX = 34.15;
    const MAGG_LAV_MIN = 0;
    
    const MAGG_3_FIGLI_MAX = 99.10;
    const MAGG_3_FIGLI_MIN = 18.00;
    
    const BONUS_4_FIGLI_FLAT = 150.00; // Flat mensile totale, non per figlio
    
    // UI Elements
    const chkNoIsee = document.getElementById('no-isee');
    const iseeContainer = document.getElementById('isee-container');
    const inputIsee = document.getElementById('valore-isee');
    
    const inputMinori = document.getElementById('figli-minori');
    const inputMagg = document.getElementById('figli-magg');
    const inputInfanzia = document.getElementById('figli-infanzia');
    
    const chkLavorano = document.getElementById('entrambi-lavorano');
    const chkDisabili = document.getElementById('figli-disabili');
    
    const btnCalcola = document.getElementById('calcola-auu');

    // Result Elements
    const resQuotaMinori = document.getElementById('res-quota-minori');
    const resQuotaMagg = document.getElementById('res-quota-magg');
    const resMaggiorazioni = document.getElementById('res-maggiorazioni');
    const resTotale = document.getElementById('res-totale');
    const resAnnuo = document.getElementById('res-annuo');

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    chkNoIsee.addEventListener('change', (e) => {
        if(e.target.checked) {
            iseeContainer.classList.add('opacity-50', 'pointer-events-none');
            inputIsee.value = '';
        } else {
            iseeContainer.classList.remove('opacity-50', 'pointer-events-none');
        }
    });

    // Calcolo del valore interpolato tra Max e Min in base all'ISEE
    function calcolaQuota(valIsee, maxVal, minVal) {
        if (valIsee <= ISEE_MIN) return maxVal;
        if (valIsee >= ISEE_MAX) return minVal;
        
        const riduzione = (valIsee - ISEE_MIN) / (ISEE_MAX - ISEE_MIN);
        return maxVal - (riduzione * (maxVal - minVal));
    }

    btnCalcola.addEventListener('click', () => {
        const isee = chkNoIsee.checked ? ISEE_MAX : (parseFloat(inputIsee.value) || 0);
        
        const minori = parseInt(inputMinori.value) || 0;
        const magg = parseInt(inputMagg.value) || 0;
        let infanzia = parseInt(inputInfanzia.value) || 0;
        
        const totaleFigli = minori + magg;
        if (totaleFigli === 0) {
            alert('Inserisci almeno un figlio a carico.');
            return;
        }

        // Controllo validità logica (non puoi avere più neonati che minori totali)
        if (infanzia > minori) infanzia = minori;

        // 1. Quota Base Figli
        const quotaBaseMinore = calcolaQuota(isee, BASE_MINORE_MAX, BASE_MINORE_MIN);
        const quotaBaseMagg = calcolaQuota(isee, BASE_MAGG_MAX, BASE_MAGG_MIN);

        let totaleQuotaMinori = quotaBaseMinore * minori;
        let totaleQuotaMagg = quotaBaseMagg * magg;

        // 2. Maggiorazioni
        let totaleMaggiorazioni = 0;

        // Genitori Lavoratori
        if (chkLavorano.checked) {
            const maggLav = calcolaQuota(isee, MAGG_LAV_MAX, MAGG_LAV_MIN);
            totaleMaggiorazioni += (maggLav * totaleFigli);
        }

        // Dal 3° figlio in poi
        if (totaleFigli >= 3) {
            const numFigliExtra = totaleFigli - 2;
            const magg3figli = calcolaQuota(isee, MAGG_3_FIGLI_MAX, MAGG_3_FIGLI_MIN);
            totaleMaggiorazioni += (magg3figli * numFigliExtra);
        }

        // Bonus Flat 4+ figli
        if (totaleFigli >= 4) {
            totaleMaggiorazioni += BONUS_4_FIGLI_FLAT;
        }

        // Maggiorazione Infanzia (+50% della quota base per neonati)
        // Regola: Sotto 1 anno, oppure sotto 3 anni se il nucleo ha 3+ figli
        if (infanzia > 0) {
            totaleMaggiorazioni += ((quotaBaseMinore * 0.50) * infanzia);
        }

        // Maggiorazione Disabilità (Semplificata forfettaria per uso client-side)
        if (chkDisabili.checked) {
            // Un importo forfettario indicativo di circa 119,60€ mensili extra a figlio
            totaleMaggiorazioni += (119.60 * totaleFigli); 
        }

        // Totali
        const totaleMensile = totaleQuotaMinori + totaleQuotaMagg + totaleMaggiorazioni;
        const totaleAnnuo = totaleMensile * 12;

        // UI Update
        resQuotaMinori.textContent = fmt(totaleQuotaMinori);
        resQuotaMagg.textContent = fmt(totaleQuotaMagg);
        resMaggiorazioni.textContent = '+ ' + fmt(totaleMaggiorazioni);
        resTotale.textContent = fmt(totaleMensile);
        resAnnuo.textContent = fmt(totaleAnnuo);
    });
});