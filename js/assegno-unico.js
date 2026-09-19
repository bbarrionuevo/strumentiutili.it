// js/assegno-unico_2.js — Simulatore Assegno Unico (JSON Decoupled)
document.addEventListener('DOMContentLoaded', () => {
    
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
    function calcolaQuota(valIsee, maxVal, minVal, iseeMin, iseeMax) {
        if (valIsee <= iseeMin) return maxVal;
        if (valIsee >= iseeMax) return minVal;
        
        const riduzione = (valIsee - iseeMin) / (iseeMax - iseeMin);
        return maxVal - (riduzione * (maxVal - minVal));
    }

    if (btnCalcola) {
        btnCalcola.addEventListener('click', async () => {
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
                alert("Impossibile caricare i parametri. Riprova più tardi.");
                return;
            }

            const conf = regole.assegnoUnico;
            const iseeMin = conf.soglieIsee.minima;
            const iseeMax = conf.soglieIsee.massima;

            const isee = chkNoIsee.checked ? iseeMax : (parseFloat(inputIsee.value) || 0);
            
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
            const quotaBaseMinore = calcolaQuota(isee, conf.quotaBaseMinore.max, conf.quotaBaseMinore.min, iseeMin, iseeMax);
            const quotaBaseMagg = calcolaQuota(isee, conf.quotaBaseMaggiorenne.max, conf.quotaBaseMaggiorenne.min, iseeMin, iseeMax);

            let totaleQuotaMinori = quotaBaseMinore * minori;
            let totaleQuotaMagg = quotaBaseMagg * magg;

            // 2. Maggiorazioni
            let totaleMaggiorazioni = 0;

            // Genitori Lavoratori
            if (chkLavorano.checked) {
                const maggLav = calcolaQuota(isee, conf.maggiorazioneLavoratori.max, conf.maggiorazioneLavoratori.min, iseeMin, iseeMax);
                totaleMaggiorazioni += (maggLav * totaleFigli);
            }

            // Dal 3° figlio in poi
            if (totaleFigli >= 3) {
                const numFigliExtra = totaleFigli - 2;
                const magg3figli = calcolaQuota(isee, conf.maggiorazioneTerzoFiglio.max, conf.maggiorazioneTerzoFiglio.min, iseeMin, iseeMax);
                totaleMaggiorazioni += (magg3figli * numFigliExtra);
            }

            // Bonus Flat 4+ figli
            if (totaleFigli >= 4) {
                totaleMaggiorazioni += conf.bonusFlat4Figli;
            }

            // Maggiorazione Infanzia (+50% della quota base per neonati)
            // Regola: Sotto 1 anno, oppure sotto 3 anni se il nucleo ha 3+ figli
            if (infanzia > 0) {
                totaleMaggiorazioni += ((quotaBaseMinore * 0.50) * infanzia);
            }

            // Maggiorazione Disabilità (Semplificata forfettaria per uso client-side)
            if (chkDisabili.checked) {
                totaleMaggiorazioni += (conf.maggiorazioneDisabilitaForfettaria * totaleFigli); 
            }

            // Totali
            const totaleMensile = totaleQuotaMinori + totaleQuotaMagg + totaleMaggiorazioni;
            const totaleAnnuo = totaleMensile * 12;

            // UI Update
            if (resQuotaMinori) resQuotaMinori.textContent = fmt(totaleQuotaMinori);
            if (resQuotaMagg) resQuotaMagg.textContent = fmt(totaleQuotaMagg);
            if (resMaggiorazioni) resMaggiorazioni.textContent = '+ ' + fmt(totaleMaggiorazioni);
            if (resTotale) resTotale.textContent = fmt(totaleMensile);
            if (resAnnuo) resAnnuo.textContent = fmt(totaleAnnuo);
        });
    }
});