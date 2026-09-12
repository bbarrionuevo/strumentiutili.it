// js/aliquote-irpef.js — Simulatore Aliquote IRPEF 2026 (JSON Decoupled)
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
        alert("Impossibile caricare gli scaglioni IRPEF. Riprova più tardi.");
        return;
    }

    const conf = regole.irpef;

    // Elementi UI - Input
    const inputReddito = document.getElementById('input-reddito');
    const inputDetrazioni = document.getElementById('input-detrazioni');
    const btnCalcola = document.getElementById('btn-calcola');
    const alertSterilizzazione = document.getElementById('alert-sterilizzazione');

    // Elementi UI - Risultati
    const resScaglione1 = document.getElementById('res-scaglione-1');
    const resScaglione2 = document.getElementById('res-scaglione-2');
    const resScaglione3 = document.getElementById('res-scaglione-3');
    
    const resIrpefLorda = document.getElementById('res-irpef-lorda');
    const resDetrazioniApplicate = document.getElementById('res-detrazioni-applicate');
    const resIrpefNetta = document.getElementById('res-irpef-netta');
    const resAliquotaMedia = document.getElementById('res-aliquota-media');

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    function safeVal(el) {
        return Math.max(0, parseFloat(el.value) || 0);
    }

    function calcola() {
        const reddito = safeVal(inputReddito);
        let detrazioni = safeVal(inputDetrazioni);

        if (reddito <= 0) return;

        let irpefLorda = 0;
        let quota1 = 0;
        let quota2 = 0;
        let quota3 = 0;

        const scaglioni = conf.scaglioni;

        // Scaglione 1: Fino a 28.000 € (23%)
        let limite1 = scaglioni[0].limite; 
        if (reddito > 0) {
            let imponibileQuota = Math.min(reddito, limite1);
            quota1 = imponibileQuota * scaglioni[0].aliquota;
            irpefLorda += quota1;
        }

        // Scaglione 2: 28.000 - 50.000 € (33%)
        let limite2 = scaglioni[1].limite;
        if (reddito > limite1) {
            let imponibileQuota = Math.min(reddito, limite2) - limite1;
            quota2 = imponibileQuota * scaglioni[1].aliquota;
            irpefLorda += quota2;
        }

        // Scaglione 3: Oltre 50.000 € (43%)
        if (reddito > limite2) {
            let imponibileQuota = reddito - limite2;
            quota3 = imponibileQuota * scaglioni[2].aliquota;
            irpefLorda += quota3;
        }

        // Sterilizzazione Benefici (Reddito > 200.000 €)
        if (reddito > conf.meccanismoEsterilizzazione.sogliaAttivazioneReddito) {
            alertSterilizzazione.classList.remove('hidden');
            // Decurtazione delle detrazioni
            detrazioni = Math.max(0, detrazioni - conf.meccanismoEsterilizzazione.penalizzazioneDetrazioniEuro);
        } else {
            alertSterilizzazione.classList.add('hidden');
        }

        // Calcolo Netto e Aliquota Media
        // L'IRPEF Netta non può mai essere inferiore a 0
        const irpefNetta = Math.max(0, irpefLorda - detrazioni);
        
        const aliquotaMedia = (irpefNetta / reddito) * 100;

        // Aggiornamento DOM
        resScaglione1.textContent = fmt(quota1);
        resScaglione2.textContent = fmt(quota2);
        resScaglione3.textContent = fmt(quota3);
        
        resIrpefLorda.textContent = fmt(irpefLorda);
        resDetrazioniApplicate.textContent = `- ${fmt(detrazioni)}`;
        resIrpefNetta.textContent = fmt(irpefNetta);
        resAliquotaMedia.textContent = `${aliquotaMedia.toFixed(2)}%`;
    }

    // Event Listeners
    btnCalcola.addEventListener('click', calcola);
    inputReddito.addEventListener('input', calcola);
    inputDetrazioni.addEventListener('input', calcola);

    // Esegui un primo calcolo a vuoto se ci sono valori di default
    if (inputReddito.value) calcola();
});