// js/isee_2.js — Simulatore ISEE (JSON Decoupled)
document.addEventListener('DOMContentLoaded', () => {
    const btnCalcola = document.getElementById('calcola-isee');

    // UI Elements
    const inputComponenti = document.getElementById('componenti');
    const inputFigli = document.getElementById('figli');
    const chkGenitoriLavoratori = document.getElementById('genitori-lavoratori');
    const chkMonoparentale = document.getElementById('nucleo-monoparentale');
    const inputDisabili = document.getElementById('disabili');

    const inputReddito = document.getElementById('reddito');
    const inputAffitto = document.getElementById('affitto');
    
    const inputMobiliare = document.getElementById('mobiliare');
    const inputValoreCasa = document.getElementById('valore-casa');
    const inputMutuoCasa = document.getElementById('mutuo-casa');
    const inputAltriImmobili = document.getElementById('altri-immobili');

    // Result Elements
    const resSe = document.getElementById('res-se');
    const resIsr = document.getElementById('res-isr');
    const resPm = document.getElementById('res-pm');
    const resPi = document.getElementById('res-pi');
    const resIsp = document.getElementById('res-isp');
    const resIse = document.getElementById('res-ise');
    const resIsee = document.getElementById('res-isee');

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    function safeVal(el) {
        return Math.max(0, parseFloat(el?.value) || 0);
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
                alert("Impossibile caricare i parametri ISEE. Riprova più tardi.");
                return;
            }

            const conf = regole.isee;

            const componenti = parseInt(inputComponenti.value) || 1;
            const figli = parseInt(inputFigli.value) || 0;
            const disabili = parseInt(inputDisabili.value) || 0;
            const genitoriLavorano = chkGenitoriLavoratori.checked;
            const monoparentale = chkMonoparentale.checked;

            // 1. Calcolo Scala di Equivalenza (SE)
            let se = 1.00;
            const baseArray = conf.scalaEquivalenza.componentiBase;
            if (componenti <= baseArray.length) {
                se = baseArray[componenti - 1];
            } else {
                se = baseArray[baseArray.length - 1] + (conf.scalaEquivalenza.incrementoOltre5 * (componenti - baseArray.length));
            }

            // Maggiorazioni
            if (figli === 3) se += conf.maggiorazioni.figli3;
            else if (figli === 4) se += conf.maggiorazioni.figli4;
            else if (figli >= 5) se += conf.maggiorazioni.figli5Plus;

            if (genitoriLavorano && figli > 0) se += conf.maggiorazioni.genitoriLavoratori;
            if (monoparentale && figli > 0) se += conf.maggiorazioni.monoparentale;
            se += (disabili * conf.maggiorazioni.disabilePerCapite);

            // 2. Calcolo Indicatore Situazione Reddituale (ISR)
            const reddito = safeVal(inputReddito);
            let affitto = safeVal(inputAffitto);
            
            // L'affitto deducibile ha un massimo incrementato per figlio dal 3° in poi
            const maxAffitto = conf.franchigie.affittoBase + (Math.max(0, figli - 2) * conf.franchigie.affittoExtraPerFiglioDalTerzo);
            affitto = Math.min(affitto, maxAffitto);
            const isr = Math.max(0, reddito - affitto);

            // 3. Calcolo Patrimonio Mobiliare e Immobiliare
            const mobiliare = safeVal(inputMobiliare);
            let franchigiaMobiliare = conf.franchigie.mobiliareBase[0];
            if (componenti === 2) franchigiaMobiliare = conf.franchigie.mobiliareBase[1];
            else if (componenti >= 3) franchigiaMobiliare = conf.franchigie.mobiliareBase[2];
            
            franchigiaMobiliare += (Math.max(0, figli - 2) * conf.franchigie.mobiliareExtraPerFiglioDalTerzo);
            const pmRilevante = Math.max(0, mobiliare - franchigiaMobiliare);

            const valoreCasa = safeVal(inputValoreCasa);
            const mutuoCasa = safeVal(inputMutuoCasa);
            const altriImmobili = safeVal(inputAltriImmobili);

            const franchigiaCasa = conf.franchigie.casaStandard + (Math.max(0, figli - 2) * conf.franchigie.casaDeduzionePerFiglio);
            const valoreNettoCasa = Math.max(0, valoreCasa - mutuoCasa);
            
            // DPCM 159/2013: si considerano i 2/3 della sola parte eccedente la franchigia
            const eccedenzaCasa = Math.max(0, valoreNettoCasa - franchigiaCasa);
            const casaRilevante = Math.max(0, eccedenzaCasa * (2/3));
            
            // Per gli altri immobili assumiamo siano già al netto dei mutui
            const piRilevante = casaRilevante + altriImmobili;

            // 4. Calcolo ISP (Indicatore Situazione Patrimoniale)
            const isp = pmRilevante + piRilevante;

            // 5. Calcolo ISE e ISEE
            const ise = isr + (isp * 0.20);
            const isee = ise / se;

            // Aggiornamento UI
            if (resSe) resSe.textContent = se.toFixed(2);
            if (resIsr) resIsr.textContent = fmt(isr);
            if (resPm) resPm.textContent = fmt(pmRilevante);
            if (resPi) resPi.textContent = fmt(piRilevante);
            if (resIsp) resIsp.textContent = fmt(isp);
            if (resIse) resIse.textContent = fmt(ise);
            if (resIsee) resIsee.textContent = fmt(isee);
        });
    }
});