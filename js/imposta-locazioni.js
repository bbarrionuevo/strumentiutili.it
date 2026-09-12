// js/imposta-locazioni.js — Simulatore Imposta di Registro vs Cedolare Secca (JSON Decoupled)
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
        alert("Impossibile caricare i parametri di locazione. Riprova più tardi.");
        return;
    }

    const conf = regole.locazioni;

    // Elementi UI - Input
    const selectTipo = document.getElementById('tipo-locazione');
    const boxSingolo = document.getElementById('box-singolo');
    const inputCanoneSingolo = document.getElementById('canone-singolo');
    const boxMultiplo = document.getElementById('box-multiplo');
    const btnAddImmobile = document.getElementById('add-immobile');
    const btnRemImmobile = document.getElementById('rem-immobile');
    const immobiliContainer = document.getElementById('immobili-container');
    const alertPartitaIva = document.getElementById('alert-partita-iva');
    const btnCalcola = document.getElementById('btn-calcola');

    // Elementi UI - Risultati
    const resOrdBase = document.getElementById('res-ord-base');
    const resOrdImposta = document.getElementById('res-ord-imposta');
    const boxResCedolare = document.getElementById('box-res-cedolare');
    const resCedAliquota = document.getElementById('res-ced-aliquota');
    const resCedImposta = document.getElementById('res-ced-imposta');

    let numeroImmobiliMultipli = 1;

    function fmt(val) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    // Gestione Interfaccia
    function toggleUI() {
        const isBreve = selectTipo.value === 'breve_turistico';
        
        if (isBreve) {
            boxSingolo.classList.add('hidden');
            boxMultiplo.classList.remove('hidden');
        } else {
            boxSingolo.classList.remove('hidden');
            boxMultiplo.classList.add('hidden');
            alertPartitaIva.classList.add('hidden');
            boxResCedolare.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    // Aggiunta dinamica campi immobile
    btnAddImmobile.addEventListener('click', () => {
        numeroImmobiliMultipli++;
        
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 immobile-row';
        row.innerHTML = `
            <span class="text-sm font-bold text-gray-500 w-6">#${numeroImmobiliMultipli}</span>
            <input type="number" min="0" step="100" class="immobile-val w-full border border-gray-300 px-4 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-sm" placeholder="Incasso Immobile ${numeroImmobiliMultipli} (€)" />
        `;
        immobiliContainer.appendChild(row);

        if (numeroImmobiliMultipli > 1) btnRemImmobile.classList.remove('hidden');

        // Controllo Partita IVA (oltre 4 immobili)
        if (numeroImmobiliMultipli > 4) {
            alertPartitaIva.classList.remove('hidden');
            boxResCedolare.classList.add('opacity-50', 'pointer-events-none');
            resCedAliquota.textContent = "N/A";
            resCedImposta.textContent = "Obbligo P.IVA";
        }
    });

    btnRemImmobile.addEventListener('click', () => {
        if (numeroImmobiliMultipli > 1) {
            immobiliContainer.removeChild(immobiliContainer.lastChild);
            numeroImmobiliMultipli--;
        }
        if (numeroImmobiliMultipli <= 1) btnRemImmobile.classList.add('hidden');

        // Ripristina se si scende sotto i 5 immobili
        if (numeroImmobiliMultipli <= 4) {
            alertPartitaIva.classList.add('hidden');
            boxResCedolare.classList.remove('opacity-50', 'pointer-events-none');
        }
    });

    function calcola() {
        const tipo = selectTipo.value;
        let canoneTotaleLordo = 0;
        let impostaOrdinaria = 0;
        let impostaCedolare = 0;
        let aliquotaCedolareMostrata = "";

        // ESTREMIAMO I DATI DA INPUT
        if (tipo !== 'breve_turistico') {
            canoneTotaleLordo = Math.max(0, parseFloat(inputCanoneSingolo.value) || 0);
        } else {
            const inputs = document.querySelectorAll('.immobile-val');
            inputs.forEach(input => {
                canoneTotaleLordo += Math.max(0, parseFloat(input.value) || 0);
            });
        }

        if (canoneTotaleLordo <= 0) return;

        // CALCOLO REGIME ORDINARIO (Imposta di Registro)
        let baseImponibileRegistro = canoneTotaleLordo;
        if (tipo === 'lunga_concordata') {
            baseImponibileRegistro = canoneTotaleLordo * conf.regimeOrdinario.abbattimentoAgevolatoConcordato;
        }

        // Calcolo 2% con minimo di legge
        const tassaRegistroBase = baseImponibileRegistro * conf.regimeOrdinario.tassoImpostaRegistroBase;
        // Salvo per Affitti Brevi (spesso esenti da registrazione o con regole diverse se non in forma d'impresa, ma la tassa piatta di registro non si applica ai portali, si assume 0 se < 30gg)
        if (tipo === 'breve_turistico') {
            impostaOrdinaria = 0; // Negli affitti brevi gestiti dai portali si fa solo IRPEF. Lo poniamo 0 per il riquadro Registro.
        } else {
            impostaOrdinaria = Math.max(tassaRegistroBase, conf.regimeOrdinario.sogliaMinimaImpostaEuro);
        }

        // CALCOLO CEDOLARE SECCA
        if (tipo === 'lunga_libera') {
            impostaCedolare = canoneTotaleLordo * conf.regimeCedolareSecca.locazioneLungaLibera;
            aliquotaCedolareMostrata = "21%";
        } else if (tipo === 'lunga_concordata') {
            impostaCedolare = canoneTotaleLordo * conf.regimeCedolareSecca.locazioneLungaConcordata;
            aliquotaCedolareMostrata = "10%";
        } else if (tipo === 'breve_turistico') {
            if (numeroImmobiliMultipli > 4) {
                // Obbligo P.IVA, non calcola Cedolare
                resOrdBase.textContent = fmt(canoneTotaleLordo);
                resOrdImposta.textContent = "Solo IRPEF (+ INPS)";
                return;
            }

            // Estraiamo i valori singoli degli immobili
            let redditiImmobili = [];
            const inputs = document.querySelectorAll('.immobile-val');
            inputs.forEach(input => {
                const val = Math.max(0, parseFloat(input.value) || 0);
                if (val > 0) redditiImmobili.push(val);
            });

            // Heuristica di ottimizzazione: ordiniamo i redditi in modo decrescente
            redditiImmobili.sort((a, b) => b - a);

            const scaglioni = conf.regimeCedolareSecca.locazioniBreviTuristico;
            
            for (let i = 0; i < redditiImmobili.length; i++) {
                const reddito = redditiImmobili[i];
                // L'immobile più ricco (i=0) prende l'aliquota del 1° immobile, e così via
                const tassoTarget = i < scaglioni.length ? scaglioni[i].tasso : scaglioni[scaglioni.length - 1].tasso;
                impostaCedolare += (reddito * tassoTarget);
            }

            // Calcolo aliquota ponderata da mostrare
            const aliquotaPonderata = (impostaCedolare / canoneTotaleLordo) * 100;
            aliquotaCedolareMostrata = aliquotaPonderata.toFixed(1) + "% (Media)";
        }

        // Aggiornamento DOM
        resOrdBase.textContent = fmt(baseImponibileRegistro);
        if (tipo === 'breve_turistico') {
            resOrdImposta.textContent = "Esente Registro";
        } else {
            resOrdImposta.textContent = fmt(impostaOrdinaria);
        }

        resCedAliquota.textContent = aliquotaCedolareMostrata;
        resCedImposta.textContent = fmt(impostaCedolare);
    }

    // Event Listeners
    selectTipo.addEventListener('change', () => { toggleUI(); calcola(); });
    btnCalcola.addEventListener('click', calcola);

    // Ricalcolo real-time sugli input
    inputCanoneSingolo.addEventListener('input', calcola);
    immobiliContainer.addEventListener('input', calcola);

    // Inizializzazione
    toggleUI();
});