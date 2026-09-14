// js/ravvedimento_2.js — Motor de Cálculo Ravvedimento Operoso (JSON Decoupled)
document.addEventListener('DOMContentLoaded', async () => {
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

    // 1. CARICAMENTO REGOLE FISCALI DAL JSON
    let regole = null;
    try {
        if (window.StrumentiData && window.StrumentiData.getRegoleFiscali) {
            regole = await window.StrumentiData.getRegoleFiscali();
        } else {
            console.warn("DataLoader non trovato, fallback su fetch nativo...");
            const res = await fetch('/data/regole-fiscali-2026.json');
            regole = await res.json();
        }
    } catch (e) {
        console.error("Errore nel caricamento delle regole fiscali:", e);
        alert("Impossibile caricare le aliquote aggiornate. Riprova più tardi.");
        return;
    }

    const configRavv = regole.ravvedimento;

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    // 2. Calcolo Sanzioni Ridotte (D.Lgs. 87/2024 via JSON)
    function calcolaSanzioneRidotta(giorniRitardo) {
        let aliquota = 0;
        let etichetta = '';

        // Itera sull'array JSON delle frazioni temporali
        for (const fascia of configRavv.frazioniTemporaliSanzione) {
            if (fascia.giorniMax === null || giorniRitardo <= fascia.giorniMax) {
                // Se la logica è incrementale (es. Sprint 1/15 al giorno)
                if (fascia.logicaIncrementaleGiornaliera) {
                    aliquota = giorniRitardo * fascia.tassoApplicato;
                } else {
                    aliquota = fascia.tassoApplicato;
                }
                
                const maxLabel = fascia.giorniMax ? `Entro ${fascia.giorniMax} gg` : 'Oltre 2 anni';
                const tipoCap = fascia.tipo.charAt(0).toUpperCase() + fascia.tipo.slice(1);
                etichetta = `(${tipoCap} - ${maxLabel})`;
                break;
            }
        }

        return { aliquota, etichetta };
    }

    // 3. Calcolo Interessi Storici Giorno per Giorno (via JSON)
    function calcolaInteressiStorici(importo, dataInizio, dataFine) {
        let totaleInteressi = 0;
        let curr = new Date(dataInizio);
        curr.setDate(curr.getDate() + 1); // Gli interessi decorrono dal giorno successivo alla scadenza

        const tassiStorici = configRavv.tassiStoriciLegali;
        const tassoDefault = configRavv.tassoInteresseLegaleVigente;

        while (curr <= dataFine) {
            const anno = curr.getFullYear().toString();
            const tasso = tassiStorici[anno] !== undefined ? tassiStorici[anno] : tassoDefault;
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

            // 2. Calcolo Sanzioni 
            const sanzioneData = calcolaSanzioneRidotta(giorni);
            const sanzione = Math.round((importo * sanzioneData.aliquota) * 100) / 100;

            const totale = importo + interessi + sanzione;
            
            // Lettura codici tributo dal JSON
            const codiciTributo = configRavv.codiciTributo;
            const codici = codiciTributo[tributoKey] || codiciTributo['IRPEF'];

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