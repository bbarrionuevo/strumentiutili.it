(() => {
  'use strict';

  document.addEventListener("DOMContentLoaded", async () => {
    
    // NODI DOM
    const form = document.getElementById("piva-form");
    const inputModello = document.getElementById("input-modello");
    const inputOperazione = document.getElementById("input-operazione");
    const inputNatura = document.getElementById("input-natura-giuridica");
    
    const inputIdFiscale = document.getElementById("input-id-fiscale");
    const labelIdFiscale = document.getElementById("label-cf-piva");
    const errorIdFiscale = document.getElementById("error-id-fiscale");
    
    const fieldsAA9 = document.querySelectorAll(".field-aa9");
    const fieldsAA7 = document.querySelectorAll(".field-aa7");
    
    const inputCap = document.getElementById("input-cap");
    const errorCap = document.getElementById("error-cap");
    
    const badgeModello = document.getElementById("badge-modello");
    const outOperazione = document.getElementById("out-operazione");
    const btnGenerate = document.getElementById("btn-generate-pdf");

    let regoleModelli = null;
    let genericCaps = [];

    // 1. CARICAMENTO ASINCRONO JSON
    try {
      const response = await fetch('/data/regole-fiscali-2026.json');
      if (!response.ok) throw new Error("Errore rete");
      const jsonData = await response.json();
      regoleModelli = jsonData.modelli_partita_iva;
      genericCaps = regoleModelli.blacklist_cap_generici;

      // Popola <select> Operazione
      inputOperazione.innerHTML = "";
      for (const [key, value] of Object.entries(regoleModelli.tipo_operazione)) {
        inputOperazione.innerHTML += `<option value="${key}">${key} - ${value}</option>`;
      }

      // Popola <select> Natura Giuridica (Modello AA7)
      inputNatura.innerHTML = `<option value="">- Seleziona -</option>`;
      for (const [key, value] of Object.entries(regoleModelli.natura_giuridica)) {
        inputNatura.innerHTML += `<option value="${key}">${key} - ${value}</option>`;
      }

      loadState();

    } catch (error) {
      console.error("Impossibile caricare regole fiscali per Modelli P.IVA:", error);
      alert("Errore di connessione al database fiscale.");
      return;
    }

    // 2. TOGGLE MODELLI E CAMPI DINAMICI
    function toggleFields() {
      const isAA9 = inputModello.value === "AA9";
      
      if (isAA9) {
        labelIdFiscale.textContent = "Codice Fiscale (16 caratteri) *";
        inputIdFiscale.setAttribute("maxlength", "16");
        fieldsAA9.forEach(el => { el.classList.remove("hidden"); el.querySelector("input").required = true; });
        fieldsAA7.forEach(el => { el.classList.add("hidden"); el.querySelector("input, select").required = false; });
        badgeModello.textContent = "Mod. AA9/12";
      } else {
        labelIdFiscale.textContent = "Codice Fiscale Numerico / P.IVA (11 cifre) *";
        inputIdFiscale.setAttribute("maxlength", "11");
        fieldsAA9.forEach(el => { el.classList.add("hidden"); el.querySelector("input").required = false; });
        fieldsAA7.forEach(el => { el.classList.remove("hidden"); el.querySelector("input, select").required = true; });
        badgeModello.textContent = "Mod. AA7/10";
      }

      if (regoleModelli) {
          const ops = regoleModelli.tipo_operazione;
          outOperazione.textContent = `${inputOperazione.value} - ${ops[inputOperazione.value]}`;
      }
    }

    inputModello.addEventListener("change", toggleFields);
    inputOperazione.addEventListener("change", toggleFields);

    // 3. VALIDAZIONI AVANZATE CLIENT-SIDE (API + LUHN)
    function validateLuhn(piva) {
      if (!/^[0-9]{11}$/.test(piva)) return false;
      let s = 0;
      for (let i = 0; i <= 9; i += 2) s += parseInt(piva.charAt(i));
      for (let i = 1; i <= 9; i += 2) {
        let c = 2 * parseInt(piva.charAt(i));
        if (c > 9) c = c - 9;
        s += c;
      }
      return (10 - (s % 10)) % 10 === parseInt(piva.charAt(10));
    }

    inputIdFiscale.addEventListener("input", (e) => {
      const val = e.target.value.trim().toUpperCase();
      const isAA9 = inputModello.value === "AA9";
      
      // Reset visivo se il campo è vuoto o incompleto
      if (val.length === 0 || (isAA9 && val.length < 16) || (!isAA9 && val.length < 11)) {
        errorIdFiscale.classList.add("hidden");
        inputIdFiscale.classList.remove("border-red-500", "ring-red-500", "border-green-500", "ring-green-500", "focus:ring-red-500", "focus:ring-green-500");
        inputIdFiscale.classList.add("border-gray-300", "focus:ring-indigo-500");
        return;
      }

      let isValid = false;

      if (isAA9) {
        // Valida Codice Fiscale (inclusa Omocodia) usando l'API globale
        if (window.validateCodiceFiscale) {
          isValid = window.validateCodiceFiscale(val).valid;
        }
      } else {
        // Valida Partita IVA con Algoritmo di Luhn
        isValid = validateLuhn(val);
      }

      inputIdFiscale.classList.remove("border-gray-300", "focus:ring-indigo-500");
      if (!isValid) {
        errorIdFiscale.classList.remove("hidden");
        inputIdFiscale.classList.remove("border-green-500", "ring-green-500", "focus:ring-green-500");
        inputIdFiscale.classList.add("border-red-500", "ring-red-500", "focus:ring-red-500");
      } else {
        errorIdFiscale.classList.add("hidden");
        inputIdFiscale.classList.remove("border-red-500", "ring-red-500", "focus:ring-red-500");
        inputIdFiscale.classList.add("border-green-500", "ring-green-500", "focus:ring-green-500");
      }
    });

    // 4. RIPRISTINO STATE & AUTO-SAVE
    function saveState() {
      if (!window.AppStorage || !regoleModelli) return;
      const state = {
        modello: inputModello.value,
        operazione: inputOperazione.value,
        idFiscale: inputIdFiscale.value,
        nome: document.getElementById("input-nome").value,
        cognome: document.getElementById("input-cognome").value,
        ragioneSociale: document.getElementById("input-ragione-sociale").value,
        natura: inputNatura.value,
        ateco: document.getElementById("input-ateco").value,
        comune: document.getElementById("input-comune").value,
        provincia: document.getElementById("input-provincia").value,
        indirizzo: document.getElementById("input-indirizzo").value,
        cap: inputCap.value
      };
      window.AppStorage.save('modelli_piva_state', state);
    }

    function loadState() {
      if (!window.AppStorage || !regoleModelli) return;
      const state = window.AppStorage.load('modelli_piva_state', null);
      if (state) {
        if (state.modello) inputModello.value = state.modello;
        if (state.operazione) inputOperazione.value = state.operazione;
        if (state.idFiscale) inputIdFiscale.value = state.idFiscale;
        if (state.nome) document.getElementById("input-nome").value = state.nome;
        if (state.cognome) document.getElementById("input-cognome").value = state.cognome;
        if (state.ragioneSociale) document.getElementById("input-ragione-sociale").value = state.ragioneSociale;
        if (state.natura) inputNatura.value = state.natura;
        if (state.ateco) document.getElementById("input-ateco").value = state.ateco;
        if (state.comune) document.getElementById("input-comune").value = state.comune;
        if (state.provincia) document.getElementById("input-provincia").value = state.provincia;
        if (state.indirizzo) document.getElementById("input-indirizzo").value = state.indirizzo;
        if (state.cap) inputCap.value = state.cap;
      }
      toggleFields();
    }

    document.querySelectorAll('.su-save-state').forEach(el => {
      el.addEventListener('input', saveState);
      el.addEventListener('change', saveState);
    });

    // 5. MOTORE GENERAZIONE PDF E FLATTENING
    btnGenerate.addEventListener("click", async () => {
      
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (!errorIdFiscale.classList.contains("hidden")) {
        alert("L'identificativo fiscale inserito non è formalmente valido.");
        return;
      }
      if (!errorCap.classList.contains("hidden")) {
        alert("Hai inserito un C.A.P. generico vietato dall'Agenzia delle Entrate.");
        return;
      }

      if (typeof PDFLib === 'undefined') {
        alert("Libreria PDF-lib non caricata.");
        return;
      }

      btnGenerate.disabled = true;
      btnGenerate.innerHTML = '⏳ Elaborazione in corso...';

      try {
        const isAA9 = inputModello.value === "AA9";
        const templateUrl = isAA9 ? '/assets/pdf/modello_AA9_12_editabile.pdf' : '/assets/pdf/modello_AA7_10_editabile.pdf';
        
        let pdfDoc;
        try {
            const templateBytes = await fetch(templateUrl).then(res => res.arrayBuffer());
            pdfDoc = await PDFLib.PDFDocument.load(templateBytes);
        } catch(e) {
            console.warn("Template PDF ufficiale non trovato. Genero PDF grezzo.");
            pdfDoc = await PDFLib.PDFDocument.create();
            pdfDoc.addPage([595.28, 841.89]);
        }
        
        pdfDoc.setTitle(`Dichiarazione ${isAA9 ? 'AA9/12' : 'AA7/10'} - Partita IVA`);
        pdfDoc.setAuthor("StrumentiUtili.it");
        pdfDoc.setCreator("PDF-lib Client-Side Engine");

        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { height } = firstPage.getSize();
        
        const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        const fontNormal = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

        let y = height - 100;
        firstPage.drawText(`MODELLO ${isAA9 ? 'AA9/12 (Persone Fisiche)' : 'AA7/10 (Soggetti Diversi)'}`, { x: 50, y, size: 16, font: fontBold });
        y -= 30;
        firstPage.drawText(`Operazione Richiesta: Op. ${inputOperazione.value}`, { x: 50, y, size: 12, font: fontNormal });
        y -= 30;
        firstPage.drawText(`Identificativo Fiscale: ${inputIdFiscale.value.toUpperCase()}`, { x: 50, y, size: 12, font: fontBold });
        y -= 20;

        if (isAA9) {
          firstPage.drawText(`Nominativo: ${document.getElementById("input-nome").value} ${document.getElementById("input-cognome").value}`, { x: 50, y, size: 12, font: fontNormal });
        } else {
          firstPage.drawText(`Ragione Sociale: ${document.getElementById("input-ragione-sociale").value}`, { x: 50, y, size: 12, font: fontNormal });
          y -= 20;
          firstPage.drawText(`Natura Giuridica: ${inputNatura.value}`, { x: 50, y, size: 12, font: fontNormal });
        }

        y -= 40;
        firstPage.drawText(`Sede e Attività`, { x: 50, y, size: 14, font: fontBold });
        y -= 20;
        firstPage.drawText(`Codice ATECO: ${document.getElementById("input-ateco").value}`, { x: 50, y, size: 12, font: fontNormal });
        y -= 20;
        firstPage.drawText(`Indirizzo: ${document.getElementById("input-indirizzo").value}, ${inputCap.value} ${document.getElementById("input-comune").value} (${document.getElementById("input-provincia").value.toUpperCase()})`, { x: 50, y, size: 12, font: fontNormal });

        const formObj = pdfDoc.getForm();
        if (formObj) {
            try { formObj.flatten(); } catch(e) { console.warn("Nessun AcroForm da appiattire."); }
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Modello_${isAA9 ? 'AA9_12' : 'AA7_10'}_${inputIdFiscale.value.toUpperCase()}.pdf`;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        // GARBAGE COLLECTION E PRIVACY PROFONDA
        try {
          const pageKey = location.pathname.replace(/[\/\.]/g, '_') || 'home';
          const globalKey = `form_data_${pageKey}`;

          if (window.AppStorage && typeof window.AppStorage.remove === 'function') {
            window.AppStorage.remove('modelli_piva_state'); 
            window.AppStorage.remove(globalKey);   
          } else {
            localStorage.removeItem('su_modelli_piva_state');
            localStorage.removeItem(`su_${globalKey}`);
          }
        } catch(e) { 
          console.warn("Storage warning ignorato", e); 
        }

        const activeForm = document.getElementById("piva-form") || document.querySelector("form");
        if (activeForm) {
          activeForm.reset();
          
          // FORZA L'AGGIORNAMENTO IN MEMORIA DI storage-helper.js
          activeForm.querySelectorAll('input, select, textarea').forEach(el => {
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
        }
        
        toggleFields();
        
        // Reset manuale colori del campo Identificativo Fiscale
        inputIdFiscale.classList.remove("border-red-500", "ring-red-500", "border-green-500", "ring-green-500", "focus:ring-red-500", "focus:ring-green-500");
        inputIdFiscale.classList.add("border-gray-300", "focus:ring-indigo-500");

        alert("Modulo generato e sigillato con successo.\n\nPer garantire la tua Privacy, tutti i dati inseriti sono stati distrutti.");
        
      } catch (err) {
        console.error(err);
        alert("Errore critico durante la generazione del documento.");
      } finally {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = '<span>📄</span> Genera e Sigilla PDF';
      }
    });

  });
})();