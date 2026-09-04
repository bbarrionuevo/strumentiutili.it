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
        return Math.max(0, parseFloat(el.value) || 0);
    }

    btnCalcola.addEventListener('click', () => {
        const componenti = parseInt(inputComponenti.value) || 1;
        const figli = parseInt(inputFigli.value) || 0;
        const disabili = parseInt(inputDisabili.value) || 0;
        const genitoriLavorano = chkGenitoriLavoratori.checked;
        const monoparentale = chkMonoparentale.checked;

        // 1. Calcolo Scala di Equivalenza (SE)
        let se = 1.00;
        if (componenti === 2) se = 1.57;
        else if (componenti === 3) se = 2.04;
        else if (componenti === 4) se = 2.46;
        else if (componenti >= 5) se = 2.85 + (0.35 * (componenti - 5));

        // Maggiorazioni
        if (figli >= 3) se += 0.2; // Maggiorazione per 3 figli
        if (figli >= 4) se += 0.35; // Maggiorazione per 4 figli
        if (figli >= 5) se += 0.5; // Maggiorazione per 5+ figli
        if (genitoriLavorano && figli > 0) se += 0.2;
        if (monoparentale && figli > 0) se += 0.3;
        se += (disabili * 0.5);

        // 2. Calcolo Indicatore Situazione Reddituale (ISR)
        const reddito = safeVal(inputReddito);
        let affitto = safeVal(inputAffitto);
        // L'affitto deducibile ha un massimo di 7000€ incrementato di 500€ per figlio dal 3° in poi
        const maxAffitto = 7000 + (Math.max(0, figli - 2) * 500);
        affitto = Math.min(affitto, maxAffitto);
        const isr = Math.max(0, reddito - affitto);

        // 3. Calcolo Patrimonio Mobiliare e Immobiliare
        const mobiliare = safeVal(inputMobiliare);
        let franchigiaMobiliare = 6000;
        if (componenti === 2) franchigiaMobiliare = 8000;
        else if (componenti >= 3) franchigiaMobiliare = 10000;
        franchigiaMobiliare += (Math.max(0, figli - 2) * 1000);
        
        const pmRilevante = Math.max(0, mobiliare - franchigiaMobiliare);

        const valoreCasa = safeVal(inputValoreCasa);
        const mutuoCasa = safeVal(inputMutuoCasa);
        const altriImmobili = safeVal(inputAltriImmobili);

        const franchigiaCasa = 52500 + (Math.max(0, figli - 2) * 2500);
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
        resSe.textContent = se.toFixed(2);
        resIsr.textContent = fmt(isr);
        resPm.textContent = fmt(pmRilevante);
        resPi.textContent = fmt(piRilevante);
        resIsp.textContent = fmt(isp);
        resIse.textContent = fmt(ise);
        resIsee.textContent = fmt(isee);
    });
});
