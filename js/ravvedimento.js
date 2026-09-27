// La data di oggi in Italia, AAAA-MM-GG. toISOString() da' la data UTC:
// fra mezzanotte e l'una (le due d'estate) risultava ancora ieri.
function oggiInItalia() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
}

// js/ravvedimento.js — Calcolo del ravvedimento operoso (regole lette dal JSON)
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

    if (btnCalcola) {
        btnCalcola.addEventListener('click', () => {
            const tributoKey = selectTributo ? selectTributo.value : 'IRPEF';
            const importo = parseFloat(inputImporto.value);

            if (!importo || importo <= 0) return alert('Inserisci un importo valido.');
            if (!inputScadenza.value || !inputRegolarizzazione.value) return alert('Inserisci le date richieste.');

            // Il conto e' in js/ravvedimento-calcolo.js, lo stesso della guida e dei test
            const r = window.RavvedimentoCalcolo.calcola({
                importo: importo,
                scadenza: inputScadenza.value,
                pagamento: inputRegolarizzazione.value,
                tributo: tributoKey
            }, configRavv);
            if (!r) {
                alert('La data di regolarizzazione non può essere precedente alla scadenza.');
                return;
            }
            const giorni = r.giorni;
            const interessi = r.interessi;
            const sanzione = r.sanzione;
            const totale = r.totale;
            const codici = r.codici;

            // Update UI
            if (resGiorni) resGiorni.textContent = giorni;
            if (resImposta) resImposta.textContent = fmt(importo);
            if (resInteressi) resInteressi.textContent = `${fmt(interessi)} (Cod. F24: ${codici.interessi})`;
            if (resSanzione) resSanzione.textContent = `${fmt(sanzione)} (Cod. F24: ${codici.sanzione})`;
            if (labelSanzione) labelSanzione.textContent = `${r.etichetta} — ${codici.desc}`;
            if (resTotale) resTotale.textContent = fmt(totale);
        });
    }
});