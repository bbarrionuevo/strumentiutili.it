document.addEventListener('DOMContentLoaded', () => {
    // Tassi di interesse legale storici per anno (MEF)
    const TASSI_STORICI = {
        2020: 0.0005, // 0.05%
        2021: 0.0001, // 0.01%
        2022: 0.0125, // 1.25%
        2023: 0.0500, // 5.00%
        2024: 0.0250, // 2.50%
        2025: 0.0250, // 2.50%
        2026: 0.0160  // 1.60%
    };

    // Mappa Codici Tributo F24
    const CODICI_TRIBUTO = {
        'IRPEF': { sanzione: '8901', interessi: '1989', desc: 'IRPEF / IRES' },
        'IVA':   { sanzione: '8904', interessi: '1991', desc: 'IVA' },
        'IMU':   { sanzione: '3924', interessi: '3923', desc: 'IMU (Immobili)' },
        'ALTRO': { sanzione: '8911', interessi: '1993', desc: 'Altri Tributi' }
    };
    
    // UI Elements
    const selectTributo = document.getElementById('tipo_tributo');
    const inputImporto = document.getElementById('importo_omesso');
    const inputScadenza = document.getElementById('data_scadenza');
    const inputRegolarizzazione = document.getElementById('data_regolarizzazione');
    const btnCalcola = document.getElementById('calcola-ravvedimento');

    // Pre-popola la data di regolarizzazione ad oggi
    const today = new Date();
    if (inputRegolarizzazione && !inputRegolarizzazione.value) {
        inputRegolarizzazione.value = today.toISOString().split('T')[0];
    }

    // Results
    const resGiorni = document.getElementById('res-giorni');
    const resImposta = document.getElementById('res-imposta');
    const resInteressi = document.getElementById('res-interessi');
    const resSanzione = document.getElementById('res-sanzione');
    const labelSanzione = document.getElementById('label-sanzione');
    const resTotale = document.getElementById('res-totale');

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    // Calcolo Sanzioni Ridotte (D.Lgs. 87/2024)
    function calcolaSanzioneRidotta(giorniRitardo) {
        let aliquota = 0;
        let etichetta = '';

        if (giorniRitardo <= 14) {
            aliquota = giorniRitardo * (1 / 15) * 0.125; // Sprint (0.83%/gg)
            etichetta = '(Sprint - Entro 14 gg)';
        } else if (giorniRitardo <= 30) {
            aliquota = 0.0125; // Breve (1.25%)
            etichetta = '(Breve - Entro 30 gg)';
        } else if (giorniRitardo <= 90) {
            aliquota = 0.0139; // Medio (1.39%)
            etichetta = '(Medio - Entro 90 gg)';
        } else if (giorniRitardo <= 365) {
            aliquota = 0.03125; // Lungo (3.125%)
            etichetta = '(Lungo - Entro 1 anno)';
        } else if (giorniRitardo <= 730) {
            aliquota = 0.03572; // Biennale (3.57%)
            etichetta = '(Biennale - Entro 2 anni)';
        } else {
            aliquota = 0.0417; // Ultra (4.17%)
            etichetta = '(Ultra - Oltre 2 anni)';
        }
        return { aliquota, etichetta };
    }

    // Calcolo Interessi Storici Giorno per Giorno
    function calcolaInteressiStorici(importo, dataInizio, dataFine) {
        let totaleInteressi = 0;
        let curr = new Date(dataInizio);
        curr.setDate(curr.getDate() + 1); // Gli interessi decorrono dal giorno successivo alla scadenza

        while (curr <= dataFine) {
            const anno = curr.getFullYear();
            const tasso = TASSI_STORICI[anno] || 0.0160; // Tasso di default 2026
            const giorniNellAnno = (anno % 4 === 0 && (anno % 100 !== 0 || anno % 400 === 0)) ? 366 : 365;
            
            totaleInteressi += (importo * tasso) / giorniNellAnno;
            curr.setDate(curr.getDate() + 1);
        }

        return Math.round(totaleInteressi * 100) / 100;
    }

    if (btnCalcola) {
        btnCalcola.addEventListener('click', () => {
            const tributoKey = selectTributo ? selectTributo.value : 'IRPEF';
            const importo = parseFloat(inputImporto.value);

            if (!importo || importo <= 0) return alert('Inserisci un importo valido.');
            if (!inputScadenza.value || !inputRegolarizzazione.value) return alert('Inserisci le date richieste.');

            const dataScad = new Date(inputScadenza.value);
            const dataReg = new Date(inputRegolarizzazione.value);

            const utcScad = Date.UTC(dataScad.getFullYear(), dataScad.getMonth(), dataScad.getDate());
            const utcReg = Date.UTC(dataReg.getFullYear(), dataReg.getMonth(), dataReg.getDate());
            
            let giorni = Math.floor((utcReg - utcScad) / (1000 * 60 * 60 * 24));
            if (giorni < 0) {
                alert('La data di regolarizzazione non può essere precedente alla scadenza.');
                return;
            }

            // 1. Calcolo Interessi Legali Storici
            const interessi = calcolaInteressiStorici(importo, dataScad, dataReg);

            // 2. Calcolo Sanzioni (D.Lgs. 87/2024)
            const sanzioneData = calcolaSanzioneRidotta(giorni);
            const sanzione = Math.round((importo * sanzioneData.aliquota) * 100) / 100;

            const totale = importo + interessi + sanzione;
            const codici = CODICI_TRIBUTO[tributoKey] || CODICI_TRIBUTO['IRPEF'];

            // Update UI
            if (resGiorni) resGiorni.textContent = giorni;
            if (resImposta) resImposta.textContent = fmt(importo);
            if (resInteressi) resInteressi.textContent = `${fmt(interessi)} (Cod. F24: ${codici.interessi})`;
            if (resSanzione) resSanzione.textContent = `${fmt(sanzione)} (Cod. F24: ${codici.sanzione})`;
            if (labelSanzione) labelSanzione.textContent = `${sanzioneData.etichetta} — ${codici.desc}`;
            if (resTotale) resTotale.textContent = fmt(totale);
        });
    }
});
