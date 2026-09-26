// La data di oggi in Italia, AAAA-MM-GG. toISOString() da' la data UTC:
// fra mezzanotte e l'una (le due d'estate) risultava ancora ieri.
function oggiInItalia() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
}

// js/ravvedimento_2.js — Motor de Cálculo Ravvedimento Operoso (JSON Decoupled)
document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const selectTributo = document.getElementById('tipo_tributo');
    const inputImporto = document.getElementById('importo_omesso');
    const inputScadenza = document.getElementById('data_scadenza');
    const inputRegolarizzazione = document.getElementById('data_regolarizzazione');
    const btnCalcola = document.getElementById('calcola-ravvedimento');

    // Pre-popola la data di regolarizzazione ad oggi (in Italia)
    if (inputRegolarizzazione && !inputRegolarizzazione.value) {
        inputRegolarizzazione.value = oggiInItalia();
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
            regole = await window.StrumentiData.getRegoleFiscali();
            if (!regole) throw new Error('Regole fiscali non disponibili.');
        }
    } catch (e) {
        console.error("Errore nel caricamento delle regole fiscali:", e);
        alert("Impossibile caricare le aliquote aggiornate. Riprova più tardi.");
        return;
    }

    const configRavv = regole && regole.ravvedimento;
    if (!configRavv || !Array.isArray(configRavv.frazioniTemporaliSanzione)) {
        alert("Le regole del ravvedimento non sono disponibili. Riprova più tardi.");
        return;
    }

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    // 2. Calcolo Sanzioni Ridotte (D.Lgs. 87/2024 via JSON)
    // Le misure dipendono da quando e' stata commessa la violazione: dal 1°
    // settembre 2024 (D.Lgs. 87/2024) la sanzione e' del 25% (12,5% entro 90
    // giorni) e l'ultima riduzione e' 1/7 oltre un anno; prima era del 30%
    // (15%) con 1/7 fino a due anni e 1/6 oltre. Tabelle dell'Agenzia delle Entrate.
    function calcolaSanzioneRidotta(giorniRitardo, scadenzaIso) {
        let aliquota = 0;
        let etichetta = '';
        // la violazione e' il giorno dopo la scadenza
        const p = String(scadenzaIso || '').split('-').map(Number);
        const giornoDopo = p.length === 3 ? new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)).toISOString().slice(0, 10) : '9999-12-31';
        const nuove = giornoDopo >= (configRavv.dataNuoveSanzioni || '2024-09-01');
        const fasce = nuove || !configRavv.frazioniTemporaliSanzionePrecedenti
            ? configRavv.frazioniTemporaliSanzione : configRavv.frazioniTemporaliSanzionePrecedenti;

        let precedente = 0;
        for (const fascia of fasce) {
            if (fascia.giorniMax === null || giorniRitardo <= fascia.giorniMax) {
                // Se la logica è incrementale (es. Sprint 1/15 al giorno)
                if (fascia.logicaIncrementaleGiornaliera) {
                    aliquota = giorniRitardo * fascia.tassoApplicato;
                } else {
                    aliquota = fascia.tassoApplicato;
                }
                const oltre = precedente === 365 ? '1 anno' : precedente === 730 ? '2 anni' : precedente + ' gg';
                const maxLabel = fascia.giorniMax ? `Entro ${fascia.giorniMax} gg` : 'Oltre ' + oltre;
                const tipoCap = fascia.tipo.charAt(0).toUpperCase() + fascia.tipo.slice(1);
                etichetta = `(${tipoCap} - ${maxLabel}${nuove ? '' : ', regole prima del 1° settembre 2024'})`;
                break;
            }
            precedente = fascia.giorniMax;
        }

        return { aliquota, etichetta };
    }

    // 3. Calcolo Interessi Storici Giorno per Giorno (via JSON)
    function calcolaInteressiStorici(importo, dataInizio, dataFine) {
        let totaleInteressi = 0;
        // Date in UTC: con l'ora locale il passaggio dall'ora legale a quella solare escludeva l'ultimo giorno
        const curr = new Date(Date.UTC(dataInizio.getFullYear(), dataInizio.getMonth(), dataInizio.getDate()));
        const fine = Date.UTC(dataFine.getFullYear(), dataFine.getMonth(), dataFine.getDate());
        curr.setUTCDate(curr.getUTCDate() + 1); // Gli interessi decorrono dal giorno successivo alla scadenza

        const tassiStorici = configRavv.tassiStoriciLegali;
        const tassoDefault = configRavv.tassoInteresseLegaleVigente;

        while (curr.getTime() <= fine) {
            const anno = curr.getUTCFullYear().toString();
            const tasso = tassiStorici[anno] !== undefined ? tassiStorici[anno] : tassoDefault;
            const giorniNellAnno = (anno % 4 === 0 && (anno % 100 !== 0 || anno % 400 === 0)) ? 366 : 365;

            totaleInteressi += (importo * tasso) / giorniNellAnno;
            curr.setUTCDate(curr.getUTCDate() + 1);
        }

        return Math.round(totaleInteressi * 100) / 100;
    }

    if (btnCalcola) {
        btnCalcola.addEventListener('click', () => {
            const tributoKey = selectTributo ? selectTributo.value : 'IRPEF';
            const importo = parseFloat(inputImporto.value);

            if (!importo || importo <= 0) return alert('Inserisci un importo valido.');
            if (!inputScadenza.value || !inputRegolarizzazione.value) return alert('Inserisci le date richieste.');

            // "AAAA-MM-GG" in ora locale: new Date('2026-03-16') sarebbe la
            // mezzanotte UTC, cioe' il giorno prima nei fusi a ovest di Greenwich
            const locale = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
            const dataScad = locale(inputScadenza.value);
            const dataReg = locale(inputRegolarizzazione.value);

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
            const sanzioneData = calcolaSanzioneRidotta(giorni, inputScadenza.value);
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