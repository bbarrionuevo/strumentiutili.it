(() => {
  'use strict';

  document.addEventListener("DOMContentLoaded", async () => {
    
    // Nodi DOM
    const form = document.getElementById("rli-form");
    const inputTipo = document.getElementById("rli-tipo-contratto");
    const inputCanone = document.getElementById("rli-canone");
    const inputDataStipula = document.getElementById("rli-data-stipula");
    const checkCedolare = document.getElementById("rli-cedolare-secca");
    
    const inputCfLocatore = document.getElementById("rli-cf-locatore");
    const inputCfConduttore = document.getElementById("rli-cf-conduttore");
    const inputPagine = document.getElementById("rli-pagine");
    const inputCopie = document.getElementById("rli-copie");
    const sezioneBollo = document.getElementById("sezione-bollo");

    const outRegistro = document.getElementById("out-registro");
    const outBollo = document.getElementById("out-bollo");
    const outSanzioni = document.getElementById("out-sanzioni");
    const boxSanzioni = document.getElementById("box-sanzioni");
    const outTotale = document.getElementById("out-totale");
    const btnGenerate = document.getElementById("btn-generate-rli");

    let regole = null;

    // 1. CARICAMENTO ASINCRONO REGOLE FISCALI
    try {
      const response = await fetch('/data/regole-fiscali-2026.json');
      if (!response.ok) throw new Error("Errore rete");
      const jsonData = await response.json();
      regole = {
        rli: jsonData.rli_parametri,
        ravvedimento: jsonData.ravvedimento
      };
      
      loadState();
      calculateTaxes();

    } catch (error) {
      console.error("Impossibile caricare regole-fiscali-2026.json", error);
      outTotale.textContent = "Errore Dati";
      return;
    }

    // 2. RIPRISTINO STATE & AUTO-SAVE
    function saveState() {
      if (!window.AppStorage || !regole) return;
      const state = {
        tipo: inputTipo.value,
        canone: inputCanone.value,
        dataStipula: inputDataStipula.value,
        cedolare: checkCedolare.checked,
        cfLocatore: inputCfLocatore.value,
        cfConduttore: inputCfConduttore.value,
        pagine: inputPagine.value,
        copie: inputCopie.value
      };
      window.AppStorage.save('rli_state', state);
    }

    function loadState() {
      if (!window.AppStorage || !regole) return;
      const state = window.AppStorage.load('rli_state', null);
      if (state) {
        if (state.tipo) inputTipo.value = state.tipo;
        if (state.canone) inputCanone.value = state.canone;
        if (state.dataStipula) inputDataStipula.value = state.dataStipula;
        if (state.cedolare !== undefined) checkCedolare.checked = state.cedolare;
        if (state.cfLocatore) inputCfLocatore.value = state.cfLocatore;
        if (state.cfConduttore) inputCfConduttore.value = state.cfConduttore;
        if (state.pagine) inputPagine.value = state.pagine;
        if (state.copie) inputCopie.value = state.copie;
      } else {
        inputDataStipula.valueAsDate = new Date();
      }
      toggleCedolareVisibilty();
    }

    document.querySelectorAll('.su-save-state').forEach(el => {
      el.addEventListener('input', () => {
        saveState();
        calculateTaxes();
      });
      el.addEventListener('change', () => {
        saveState();
        calculateTaxes();
      });
    });

    function toggleCedolareVisibilty() {
      if (checkCedolare.checked) {
        sezioneBollo.style.opacity = "0.5";
        inputPagine.disabled = true;
        inputCopie.disabled = true;
      } else {
        sezioneBollo.style.opacity = "1";
        inputPagine.disabled = false;
        inputCopie.disabled = false;
      }
    }

    checkCedolare.addEventListener('change', toggleCedolareVisibilty);

    function money(val) {
      return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    // 3. MOTORE DI CALCOLO TRIBUTARIO
    function calculateTaxes() {
      if (!regole) return;

      const canone = parseFloat(inputCanone.value) || 0;
      const isCedolare = checkCedolare.checked;
      const tipoContratto = inputTipo.value;
      const dataStipula = new Date(inputDataStipula.value);
      const dataOggi = new Date();

      let impostaRegistro = 0;
      let impostaBollo = 0;
      let sanzioni = 0;

      // Differenza in giorni per Ravvedimento
      const diffTime = Math.abs(dataOggi - dataStipula);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const giorniRitardo = Math.max(0, diffDays - regole.rli.giorniScadenzaRegistrazione);

      if (!isCedolare) {
        // Calcolo Registro Ordinario
        const parametriContratto = regole.rli.codiciContratto[tipoContratto];
        const baseImponibile = canone * parametriContratto.moltiplicatoreImponibile;
        let calcoloRegistro = baseImponibile * parametriContratto.aliquota;
        
        impostaRegistro = Math.max(regole.rli.impostaRegistroMinima, calcoloRegistro);

        // Calcolo Bollo (16 euro ogni 4 pagine, moltiplicato per copie)
        const pagine = parseInt(inputPagine.value) || 4;
        const copie = parseInt(inputCopie.value) || 2;
        const fogli = Math.ceil(pagine / 4);
        impostaBollo = fogli * regole.rli.impostaBolloFoglio * copie;

        // Ravvedimento su Imposta di Registro
        if (giorniRitardo > 0) {
          const sanzioneBase = impostaRegistro * regole.ravvedimento.sanzioneBase;
          let riduzione = 1;
          
          if (giorniRitardo <= 14) riduzione = 0.1; // 1/10 per giorno non implementato qui per semplicità UI
          else if (giorniRitardo <= 30) riduzione = 1/10;
          else if (giorniRitardo <= 90) riduzione = 1/9;
          else if (giorniRitardo <= 365) riduzione = 1/8;
          else riduzione = 1/7;

          sanzioni = sanzioneBase * riduzione;
        }

      } else {
        // Cedolare Secca (Registro e Bollo azzerati)
        impostaRegistro = 0;
        impostaBollo = 0;

        // Sanzioni Fisse Cedolare Secca
        if (giorniRitardo > 0) {
          let sanzioneBaseFlat = (giorniRitardo <= 30) ? regole.rli.sanzioniCedolareSecca.ritardoFino30gg : regole.rli.sanzioniCedolareSecca.ritardoOltre30gg;
          
          let riduzione = 1;
          if (giorniRitardo <= 30) riduzione = 1/10;
          else if (giorniRitardo <= 90) riduzione = 1/9;
          else if (giorniRitardo <= 365) riduzione = 1/8;
          else riduzione = 1/7;

          sanzioni = sanzioneBaseFlat * riduzione;
        }
      }

      // Aggiornamento Interfaccia
      outRegistro.textContent = money(impostaRegistro);
      outBollo.textContent = money(impostaBollo);
      
      if (sanzioni > 0) {
        boxSanzioni.classList.remove("hidden");
        outSanzioni.textContent = money(sanzioni);
      } else {
        boxSanzioni.classList.add("hidden");
      }

      outTotale.textContent = money(impostaRegistro + impostaBollo + sanzioni);
    }

    // 4. GENERAZIONE PROSPETTO PDF (PDF-LIB) E GARBAGE COLLECTION
    btnGenerate.addEventListener("click", async () => {
      
      if (!regole) return;
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (typeof PDFLib === 'undefined') {
        alert("Libreria PDF non caricata.");
        return;
      }

      btnGenerate.disabled = true;
      btnGenerate.innerHTML = '⏳ Generazione in corso...';

      try {
        const pdfDoc = await PDFLib.PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]);
        const { width, height } = page.getSize();
        
        const fontNormal = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

        let y = height - 50;
        
        page.drawText(`PROSPETTO LIQUIDAZIONE RLI 2026`, { x: 50, y, size: 16, font: fontBold });
        y -= 30;
        page.drawText(`Generato localmente da StrumentiUtili.it`, { x: 50, y, size: 10, font: fontNormal });
        
        y -= 40;
        page.drawText(`DATI SOGGETTI:`, { x: 50, y, size: 12, font: fontBold });
        y -= 20;
        page.drawText(`Codice Fiscale Locatore: ${inputCfLocatore.value.toUpperCase()}`, { x: 50, y, size: 11, font: fontNormal });
        y -= 20;
        page.drawText(`Codice Fiscale Conduttore: ${inputCfConduttore.value.toUpperCase()}`, { x: 50, y, size: 11, font: fontNormal });

        y -= 40;
        page.drawText(`DATI CONTRATTO E IMPOSTE:`, { x: 50, y, size: 12, font: fontBold });
        y -= 20;
        page.drawText(`Tipologia Contratto: ${inputTipo.options[inputTipo.selectedIndex].text}`, { x: 50, y, size: 11, font: fontNormal });
        y -= 20;
        page.drawText(`Data Stipula: ${inputDataStipula.value.split('-').reverse().join('/')}`, { x: 50, y, size: 11, font: fontNormal });
        y -= 20;
        page.drawText(`Canone Annuo: € ${inputCanone.value}`, { x: 50, y, size: 11, font: fontNormal });
        y -= 20;
        page.drawText(`Opzione Cedolare Secca: ${checkCedolare.checked ? 'SI' : 'NO'}`, { x: 50, y, size: 11, font: fontBold });

        y -= 40;
        page.drawText(`RIEPILOGO VERSAMENTO:`, { x: 50, y, size: 12, font: fontBold });
        y -= 20;
        page.drawText(`Imposta di Registro: ${outRegistro.textContent}`, { x: 50, y, size: 11, font: fontNormal });
        y -= 20;
        page.drawText(`Imposta di Bollo: ${outBollo.textContent}`, { x: 50, y, size: 11, font: fontNormal });
        if (!boxSanzioni.classList.contains("hidden")) {
          y -= 20;
          page.drawText(`Sanzioni (Ravvedimento): ${outSanzioni.textContent}`, { x: 50, y, size: 11, font: fontNormal });
        }
        
        y -= 30;
        page.drawText(`TOTALE DA VERSARE: ${outTotale.textContent}`, { x: 50, y, size: 14, font: fontBold });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Prospetto_RLI_${inputCfLocatore.value.toUpperCase()}.pdf`;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        // GARBAGE COLLECTION E PRIVACY
        if (window.AppStorage) window.AppStorage.remove('rli_state');
        form.reset();
        inputDataStipula.valueAsDate = new Date();
        toggleCedolareVisibilty();
        calculateTaxes();
        
        alert("Prospetto PDF generato con successo.\n\nPer garantire la tua privacy, i Codici Fiscali e gli importi sono stati cancellati dalla memoria locale.");

      } catch (err) {
        console.error(err);
        alert("Errore nella generazione del documento.");
      } finally {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = '<span>📄</span> Genera Modello PDF';
      }
    });

  });
})();