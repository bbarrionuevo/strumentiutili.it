// js/parcella-avvocato.js — Calcolatore Parcella Legale (JSON Decoupled)
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
        alert("Impossibile caricare i parametri fiscali. Riprova più tardi.");
        return;
    }

    const conf = regole.parcellaAvvocato;
    const bolloSoglia = regole.generale.marcaDaBollo.sogliaEsenzione; // 77.47
    const bolloImporto = regole.generale.marcaDaBollo.importo; // 2.00

    // Elementi UI
    const calcMode = document.getElementById('calc-mode');
    const inputAmount = document.getElementById('input-amount');
    const inputAnticipazioni = document.getElementById('input-anticipazioni');
    const regimeFiscale = document.getElementById('regime-fiscale');
    const tipoCliente = document.getElementById('tipo-cliente');
    const clienteBox = document.getElementById('cliente-box');
    const labelAmount = document.getElementById('label-amount');
    const btnCalcola = document.getElementById('calcola-parcella');

    // UI Risultati
    const resOnorario = document.getElementById('res-onorario');
    const resSpeseGenerali = document.getElementById('res-spese-generali');
    const resImponibile = document.getElementById('res-imponibile');
    const resCpa = document.getElementById('res-cpa');
    const resImponibileIva = document.getElementById('res-imponibile-iva');
    const resIva = document.getElementById('res-iva');
    const resAnticipazioni = document.getElementById('res-anticipazioni');
    const resBollo = document.getElementById('res-bollo');
    const resRitenuta = document.getElementById('res-ritenuta');
    const resTotaleLordo = document.getElementById('res-totale-lordo');
    const resNetto = document.getElementById('res-netto');

    // Nodi Riga (Per Nasconderli/Mostrarli)
    const rowIva = document.getElementById('row-iva');
    const rowBollo = document.getElementById('row-bollo');
    const rowRitenuta = document.getElementById('row-ritenuta');

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    function round2(value) {
        return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
    }

    function toggleUI() {
        const isForfettario = regimeFiscale.value === 'forfettario';
        
        // Se Forfettario, la ritenuta e l'IVA non si applicano. Il tipo cliente è ininfluente per le tasse.
        if (isForfettario) {
            clienteBox.classList.add('opacity-50', 'pointer-events-none');
            rowIva.classList.add('hidden');
            rowRitenuta.classList.add('hidden');
        } else {
            clienteBox.classList.remove('opacity-50', 'pointer-events-none');
            rowIva.classList.remove('hidden');
            
            // La ritenuta d'acconto si applica solo ai Sostituti d'Imposta
            if (tipoCliente.value === 'sostituto') {
                rowRitenuta.classList.remove('hidden');
            } else {
                rowRitenuta.classList.add('hidden');
            }
        }

        // Cambio etichetta in base al modo (Diretto vs Scorporo)
        if (calcMode.value === 'diretto') {
            labelAmount.textContent = 'Onorario Base (€)';
        } else {
            labelAmount.textContent = 'Totale Netto Concordato (€)';
        }
    }

    function calcola() {
        const mode = calcMode.value;
        const isForfettario = regimeFiscale.value === 'forfettario';
        const isSostituto = tipoCliente.value === 'sostituto';
        
        const rawAmount = Math.max(0, parseFloat(inputAmount.value) || 0);
        const anticipazioni = Math.max(0, parseFloat(inputAnticipazioni.value) || 0);

        let onorario = 0;

        if (mode === 'diretto') {
            onorario = rawAmount;
        } else {
            // Modalità Scorporo (Da Netto a Onorario)
            let nettoDaScorporare = Math.max(0, rawAmount - anticipazioni);
            let imponibileAggregato = 0;

            if (isForfettario) {
                // Forfettario: TN = Imp + CPA(4%) + Bollo.  (CPA = Imp * 0.04) => TN = Imp * 1.04 + Bollo
                // Selezioniamo prima se applicare il bollo.
                // Se (Netto - Anticipazioni) > 77.47 + 2.00 + CPA(che è una frazione di 77) -> assumiamo bollo applicato.
                // Facciamo una prova togliendo il bollo.
                let nettoSenzaBollo = nettoDaScorporare;
                if (nettoDaScorporare > bolloSoglia) {
                    nettoSenzaBollo = Math.max(0, nettoDaScorporare - bolloImporto);
                }
                imponibileAggregato = nettoSenzaBollo / (1 + conf.cassaForenseTasso);
            } else {
                // Ordinario: TN = Imp + CPA + IVA - Ritenuta
                let coeff = isSostituto ? conf.coeffScorporoSostituto : conf.coeffScorporoPrivato;
                imponibileAggregato = nettoDaScorporare / coeff;
            }

            // L'imponibile aggregato è Onorario + Spese Generali (15%). Imp = Onorario * 1.15
            onorario = imponibileAggregato / (1 + conf.speseGeneraliTasso);
        }

        // Calcolo a cascata (Forward)
        const speseGenerali = round2(onorario * conf.speseGeneraliTasso);
        const imponibile = round2(onorario + speseGenerali);
        const cpa = round2(imponibile * conf.cassaForenseTasso);
        const imponibileIva = round2(imponibile + cpa);
        
        let iva = 0;
        let ritenuta = 0;
        let bollo = 0;

        if (isForfettario) {
            if (imponibile > bolloSoglia) {
                bollo = bolloImporto;
                rowBollo.classList.remove('hidden');
            } else {
                rowBollo.classList.add('hidden');
            }
        } else {
            iva = round2(imponibileIva * conf.ivaOrdinariaTasso);
            rowBollo.classList.add('hidden');
            if (isSostituto) {
                ritenuta = round2(imponibile * conf.ritenutaAccontoTasso);
            }
        }

        const totaleLordo = round2(imponibileIva + iva + bollo + anticipazioni);
        const totaleNetto = round2(totaleLordo - ritenuta);

        // Aggiornamento DOM
        resOnorario.textContent = fmt(onorario);
        resSpeseGenerali.textContent = fmt(speseGenerali);
        resImponibile.textContent = fmt(imponibile);
        resCpa.textContent = fmt(cpa);
        resImponibileIva.textContent = fmt(imponibileIva);
        resIva.textContent = fmt(iva);
        resAnticipazioni.textContent = fmt(anticipazioni);
        resBollo.textContent = fmt(bollo);
        resRitenuta.textContent = `- ${fmt(ritenuta)}`;
        resTotaleLordo.textContent = fmt(totaleLordo);
        resNetto.textContent = fmt(totaleNetto);
    }

    // Event Listeners
    calcMode.addEventListener('change', () => { toggleUI(); calcola(); });
    regimeFiscale.addEventListener('change', () => { toggleUI(); calcola(); });
    tipoCliente.addEventListener('change', () => { toggleUI(); calcola(); });
    inputAmount.addEventListener('input', calcola);
    inputAnticipazioni.addEventListener('input', calcola);
    btnCalcola.addEventListener('click', calcola);

    // Inizializzazione
    toggleUI();
});