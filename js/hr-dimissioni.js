(() => {
  'use strict';

  document.addEventListener("DOMContentLoaded", async () => {
    
    // Nodi DOM - Form Base
    const inputCcnl = document.getElementById("input-ccnl");
    const inputLivello = document.getElementById("input-livello");
    const inputAnzianita = document.getElementById("input-anzianita");
    const inputDataNotifica = document.getElementById("input-data-notifica");
    const outPreavviso = document.getElementById("out-preavviso");
    const outUltimoGiorno = document.getElementById("out-ultimo-giorno");
    const shiftWarning = document.getElementById("shift-warning");
    const btnGenerate = document.getElementById("btn-generate-pdf");

    // Nodi DOM - Indennità e Anagrafiche
    const inputRal = document.getElementById("input-ral");
    const inputDataAnticipata = document.getElementById("input-data-anticipata");
    const checkEsenzione = document.getElementById("input-esenzione");
    const boxPenale = document.getElementById("box-penale");
    const outPenale = document.getElementById("out-penale");
    const outGiorniMancanti = document.getElementById("out-giorni-mancanti");
    const inputCf = document.getElementById("input-cf"); // Nuovo nodo

    let dataMatrix = null;

    // 1. CARICAMENTO ASINCRONO JSON
    try {
      const response = await fetch('/data/regole-fiscali-2026.json');
      if (!response.ok) throw new Error("Errore rete");
      const jsonData = await response.json();
      dataMatrix = jsonData.ccnl_dimissioni;
      
      inputCcnl.innerHTML = "";
      for (const [key, value] of Object.entries(dataMatrix)) {
        // ccnlSEO is pSEO metadata, not a selectable CCNL rule set.
        if (!value || !Array.isArray(value.livelli)) continue;
        const option = document.createElement("option");
        option.value = key;
        option.textContent = value.label;
        inputCcnl.appendChild(option);
      }
      
      loadState();
      calculatePreavviso();

    } catch (error) {
      console.error("Impossibile caricare JSON", error);
      outPreavviso.textContent = "Errore di connessione.";
      return;
    }

    // 2. VALIDAZIONE IN TEMPO REALE CODICE FISCALE
    function checkCFVisualFeedback() {
      if (!inputCf) return;
      const val = inputCf.value.trim().toUpperCase();
      
      if (val.length < 16) {
        inputCf.classList.remove('border-green-500', 'ring-green-500', 'border-red-500', 'ring-red-500', 'focus:ring-green-500', 'focus:ring-red-500');
        inputCf.classList.add('border-gray-300', 'focus:ring-indigo-500');
        return;
      }

      if (window.validateCodiceFiscale) {
        const check = window.validateCodiceFiscale(val);
        inputCf.classList.remove('border-gray-300', 'focus:ring-indigo-500');
        if (check.valid) {
          inputCf.classList.remove('border-red-500', 'ring-red-500', 'focus:ring-red-500');
          inputCf.classList.add('border-green-500', 'ring-green-500', 'focus:ring-green-500');
        } else {
          inputCf.classList.remove('border-green-500', 'ring-green-500', 'focus:ring-green-500');
          inputCf.classList.add('border-red-500', 'ring-red-500', 'focus:ring-red-500');
        }
      }
    }
    if (inputCf) inputCf.addEventListener('input', checkCFVisualFeedback);

    // 3. RIPRISTINO STATE & AUTO-SAVE
    function saveState() {
      if (!window.AppStorage || !dataMatrix) return;
      const state = {
        ccnl: inputCcnl.value,
        livello: inputLivello.value,
        anzianita: inputAnzianita.value,
        dataNotifica: inputDataNotifica.value,
        azienda: document.getElementById("input-azienda").value,
        nome: document.getElementById("input-nome").value,
        cognome: document.getElementById("input-cognome").value,
        cf: inputCf ? inputCf.value : "",
        ral: inputRal ? inputRal.value : "",
        dataAnticipata: inputDataAnticipata ? inputDataAnticipata.value : "",
        esenzione: checkEsenzione ? checkEsenzione.checked : false
      };
      window.AppStorage.save('hr_dimissioni_state', state);
    }

    function loadState() {
      if (!window.AppStorage || !dataMatrix) return;
      const state = window.AppStorage.load('hr_dimissioni_state', null);
      if (state) {
        if (state.ccnl && dataMatrix[state.ccnl]) inputCcnl.value = state.ccnl;
        updateLivelli();
        if (state.livello) inputLivello.value = state.livello;
        if (state.anzianita) inputAnzianita.value = state.anzianita;
        if (state.dataNotifica) inputDataNotifica.value = state.dataNotifica;
        if (state.azienda) document.getElementById("input-azienda").value = state.azienda;
        if (state.nome) document.getElementById("input-nome").value = state.nome;
        if (state.cognome) document.getElementById("input-cognome").value = state.cognome;
        if (state.cf && inputCf) inputCf.value = state.cf;
        if (state.ral && inputRal) inputRal.value = state.ral;
        if (state.dataAnticipata && inputDataAnticipata) inputDataAnticipata.value = state.dataAnticipata;
        if (state.esenzione !== undefined && checkEsenzione) checkEsenzione.checked = state.esenzione;
      } else {
        inputDataNotifica.valueAsDate = new Date();
        updateLivelli();
      }
      if(inputCf) checkCFVisualFeedback();
    }

    document.querySelectorAll('.su-save-state').forEach(el => {
      el.addEventListener('input', saveState);
      el.addEventListener('change', saveState);
    });

    // 4. LOGICA DI AGGIORNAMENTO MATRICI
    function updateLivelli() {
      if (!dataMatrix) return;
      const ccnl = inputCcnl.value;
      const options = dataMatrix[ccnl].livelli;
      inputLivello.innerHTML = "";
      options.forEach(opt => {
        const el = document.createElement("option");
        el.value = opt.id;
        el.textContent = opt.label;
        inputLivello.appendChild(el);
      });
      calculatePreavviso();
    }

    function formatDateIt(dateObj) {
      return dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatPreavviso(rules) {
      let label = "";
      let mInt = Math.floor(rules.m);
      let isHalfMonth = (rules.m % 1 !== 0); 
      if (mInt > 0) label += `${mInt} mes${mInt > 1 ? 'i' : 'e'}`;
      if (isHalfMonth) label += `${mInt > 0 ? ' e ' : ''}mezzo`;
      if (rules.d > 0) label += `${rules.m > 0 ? ' e ' : ''}${rules.d} giorn${rules.d > 1 ? 'i' : 'o'} di calendario`;
      return label;
    }

    // 5. CALCOLO PENALE (Indennità Mancato Preavviso)
    function calculatePenality(dataFineUfficiale) {
      if (!inputRal || !inputDataAnticipata || !checkEsenzione || !boxPenale) return;
      const ral = parseFloat(inputRal.value) || 0;
      const dataAnticipata = inputDataAnticipata.value ? new Date(inputDataAnticipata.value + 'T00:00:00') : null;
      const isEsente = checkEsenzione.checked;
      boxPenale.classList.add("hidden");

      if (ral > 0 && dataAnticipata && !isEsente) {
        const diffTime = dataFineUfficiale.getTime() - dataAnticipata.getTime();
        const giorniMancanti = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (giorniMancanti > 0) {
          const mensilita = 13; 
          const divisoreConvenzionale = 26; 
          const retribuzioneMensile = ral / mensilita;
          const trattenuta = retribuzioneMensile * (giorniMancanti / divisoreConvenzionale);
          outPenale.textContent = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(trattenuta);
          outGiorniMancanti.textContent = `Giorni non lavorati: ${giorniMancanti}`;
          boxPenale.classList.remove("hidden");
        }
      }
    }

    // 6. CALCOLO PREAVVISO E DATA FINE (Shift vs Lineare)
    function calculatePreavviso() {
      if (!dataMatrix || !inputDataNotifica.value) return;

      const ccnl = inputCcnl.value;
      const livello = inputLivello.value;
      const anzianita = inputAnzianita.value;
      const notificaStr = inputDataNotifica.value;

      if(!dataMatrix[ccnl].preavviso[livello]) return;

      const rules = dataMatrix[ccnl].preavviso[livello][anzianita];
      const decorrenzaRule = dataMatrix[ccnl].decorrenza_rule;
      
      outPreavviso.textContent = formatPreavviso(rules);

      const dataNotifica = new Date(notificaStr + 'T00:00:00');
      let dataInizioCalcolo = new Date(dataNotifica);

      // Logica: Commercio (Decorrenza fissa) vs Metalmeccanici (Giorno successivo)
      if (decorrenzaRule === "fissa_bimensile_1_16") {
        const g = dataInizioCalcolo.getDate();
        if (g <= 15) {
          dataInizioCalcolo.setDate(16);
          shiftWarning.innerHTML = `⚠️ <strong>Decorrenza Fissa:</strong> Hai consegnato le dimissioni il ${g} del mese. Il preavviso partirà per legge dal <strong>16 del mese in corso</strong>.`;
        } else {
          dataInizioCalcolo.setMonth(dataInizioCalcolo.getMonth() + 1);
          dataInizioCalcolo.setDate(1);
          shiftWarning.innerHTML = `⚠️ <strong>Decorrenza Fissa:</strong> Hai consegnato le dimissioni dopo il 15 del mese. Il preavviso partirà per legge dal <strong>1° del mese successivo</strong>.`;
        }
        shiftWarning.classList.remove('hidden');
      } 
      else if (decorrenzaRule === "giorno_ricezione") {
        shiftWarning.classList.add('hidden');
      }
      else {
        // Default (es. Metalmeccanici): parte il giorno dopo la notifica
        dataInizioCalcolo.setDate(dataInizioCalcolo.getDate() + 1);
        shiftWarning.classList.add('hidden');
      }

      const dataFine = new Date(dataInizioCalcolo);
      let mInt = Math.floor(rules.m);
      let isHalfMonth = (rules.m % 1 !== 0);

      // Aggiunge mesi e giorni in modo accurato per gestire CCNL Metalmeccanici
      if (mInt > 0) { dataFine.setMonth(dataFine.getMonth() + mInt); }
      if (isHalfMonth) { dataFine.setDate(dataFine.getDate() + 15); }
      if (rules.d > 0) { dataFine.setDate(dataFine.getDate() + rules.d); }
      
      dataFine.setDate(dataFine.getDate() - 1); // L'ultimo giorno lavorativo è il giorno PRIMA della scadenza formale
      outUltimoGiorno.textContent = formatDateIt(dataFine);

      calculatePenality(dataFine);
    }

    // Event Listener
    inputCcnl.addEventListener("change", updateLivelli);
    inputLivello.addEventListener("change", calculatePreavviso);
    inputAnzianita.addEventListener("change", calculatePreavviso);
    inputDataNotifica.addEventListener("input", calculatePreavviso);
    if(inputRal) inputRal.addEventListener("input", calculatePreavviso);
    if(inputDataAnticipata) inputDataAnticipata.addEventListener("input", calculatePreavviso);
    if(checkEsenzione) checkEsenzione.addEventListener("change", calculatePreavviso);

    // 7. MOTORE PDF E GARBAGE COLLECTION
    btnGenerate.addEventListener("click", async () => {
      
      if (!dataMatrix) return;
      const azienda = document.getElementById("input-azienda").value.trim();
      const nome = document.getElementById("input-nome").value.trim();
      const cognome = document.getElementById("input-cognome").value.trim();
      const cf = inputCf ? inputCf.value.trim().toUpperCase() : "";
      // Formateo directo YYYY-MM-DD a DD/MM/YYYY inmune a husos horarios
      const [yearNotifica, monthNotifica, dayNotifica] = inputDataNotifica.value.split('-');
      const dataLettera = `${dayNotifica}/${monthNotifica}/${yearNotifica}`;
      const ultimoGiorno = outUltimoGiorno.textContent;

      if (!azienda || !nome || !cognome || !cf) {
        alert("Compila tutti i campi obbligatori dell'Azienda e del Lavoratore per generare la lettera.");
        return;
      }
      
      if (window.validateCodiceFiscale && !window.validateCodiceFiscale(cf).valid) {
        alert("Il Codice Fiscale del lavoratore non è valido. Correggilo prima di stampare.");
        return;
      }

      if (typeof PDFLib === 'undefined') {
        alert("Libreria PDF non ancora caricata. Attendi qualche secondo.");
        return;
      }

      btnGenerate.disabled = true;
      btnGenerate.innerHTML = '⏳ Generazione in corso...';

      try {
        const pdfDoc = await PDFLib.PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]);
        const { width, height } = page.getSize();
        
        const fontNormal = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica, { subset: true });
        const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold, { subset: true });

        const margin = 50;
        let y = height - margin - 30;

        page.drawText(`Spett.le ${azienda}`, { x: width - 250, y, size: 12, font: fontBold });
        y -= 50;
        page.drawText(`Data: ${dataLettera}`, { x: margin, y, size: 11, font: fontNormal });
        y -= 40;
        page.drawText(`Oggetto: Dimissioni volontarie e preavviso`, { x: margin, y, size: 12, font: fontBold });

        y -= 40;
        const ccnlLabel = dataMatrix[inputCcnl.value].label;
        
        // Testo con Disclaimer Sospensivo obbligatorio integrato
        // 1. Texto de la carta formateado (líneas más cortas para evitar cortes)
        const bodyLines = [
          `Io sottoscritto/a ${nome} ${cognome}`,
          `(C.F. ${cf}), con la presente intendo`,
          `rassegnare formalmente le mie dimissioni volontarie dal rapporto`,
          `di lavoro subordinato intercorrente con codesta azienda.`,
          ``,
          `Nel rispetto dei termini previsti dal vigente Contratto Collettivo Nazionale di Lavoro`,
          `applicato (${ccnlLabel}), comunico che il periodo di preavviso dovuto e' pari`,
          `a ${outPreavviso.textContent}.`,
          ``,
          `Pertanto, il mio ultimo giorno di lavoro effettivo coincidera' con la data del:`,
          ``,
          `${ultimoGiorno}`,
          ``,
          `* Nota Legale: La presente data di cessazione presuppone il regolare e continuativo`,
          `svolgimento della prestazione lavorativa. Si ricorda che eventuali periodi di malattia,`,
          `infortunio o ferie godute avranno effetto sospensivo sul decorso del preavviso.`,
          ``,
          `Colgo l'occasione per ringraziare la direzione e i colleghi per l'opportunita'`,
          `professionale e il percorso condiviso. Rendo noto che provvedero' a convalidare`,
          `telematicamente le dimissioni tramite il portale del Ministero del Lavoro.`
        ];

        bodyLines.forEach(line => {
          const fontToUse = line === ultimoGiorno ? fontBold : fontNormal;
          const sizeToUse = line.startsWith(`* Nota Legale`) || line.startsWith(`svolgimento`) || line.startsWith(`infortunio`) ? 8.5 : 11;
          page.drawText(line, { x: margin, y, size: sizeToUse, font: fontToUse, lineHeight: 16 });
          y -= 16;
        });

        // 2. Despedida
        y -= 30;
        page.drawText(`Cordiali saluti,`, { x: margin, y, size: 11, font: fontNormal });
        
        // 3. Nombre impreso del trabajador
        y -= 25;
        page.drawText(`${nome} ${cognome}`, { x: margin, y, size: 11, font: fontBold });

        // 4. ESPACIO PARA FIRMA MANUSCRITA (35px de respiro) Y LÍNEAS DE FIRMA
        y -= 35; 
        
        // Firma Trabajatore (Izquierda)
        page.drawLine({ start: { x: margin, y }, end: { x: margin + 170, y }, thickness: 1 });
        page.drawText(`(Firma del Lavoratore)`, { x: margin, y: y - 12, size: 9, font: fontNormal });

        // Recepción Empresa (Derecha)
        page.drawLine({ start: { x: width - 220, y }, end: { x: width - 50, y }, thickness: 1 });
        page.drawText(`Per ricevuta e accettazione (L'Azienda)`, { x: width - 220, y: y - 12, size: 9, font: fontNormal });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Lettera_Dimissioni_${cognome.replace(/\s+/g, '_')}.pdf`;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        // 8. PULIZIA PROFONDA (Garbage Collection)
        try {
          const pageKey = location.pathname.replace(/[\/\.]/g, '_') || 'home';
          const globalKey = `form_data_${pageKey}`;

          if (window.AppStorage && typeof window.AppStorage.remove === 'function') {
            window.AppStorage.remove('hr_dimissioni_state'); 
            window.AppStorage.remove(globalKey);             
          } else {
            localStorage.removeItem('su_hr_dimissioni_state');
            localStorage.removeItem(`su_${globalKey}`);
          }
        } catch(e) { 
          console.warn("Storage warning ignorato", e); 
        }

        const activeForm = document.getElementById("dimissioni-form") || document.querySelector("form");
        if (activeForm) {
          activeForm.reset();
          activeForm.querySelectorAll('input, select, textarea').forEach(el => {
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
        }
        
        const today = new Date();
        inputDataNotifica.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        updateLivelli();
        
        // Reset manuale colori del CF
        if(inputCf) {
            inputCf.classList.remove("border-red-500", "ring-red-500", "border-green-500", "ring-green-500", "focus:ring-red-500", "focus:ring-green-500");
            inputCf.classList.add("border-gray-300", "focus:ring-indigo-500");
        }

        alert("Documento scaricato con successo.\n\nPer tutelare la tua Privacy, tutti i dati personali inseriti sono stati distrutti dalla memoria del browser.");

      } catch (err) {
        console.error("Errore PDF:", err);
        alert("Si è verificato un errore nella generazione del documento.");
      } finally {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = '<span>📄</span> Scarica Lettera PDF';
      }
    });

  });
})();
