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
      const jsonData = await window.StrumentiData.getRegoleFiscali();
      if (!jsonData) throw new Error('Regole fiscali non disponibili.');
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

    
    // 2.5 VALIDAZIONE IN TEMPO REALE CODICE FISCALE
    function checkCFVisualFeedback(inputElement) {
      const val = inputElement.value.trim().toUpperCase();
      
      // Reset stili base se vuoto o non ancora di 16 caratteri
      if (val.length < 16) {
        inputElement.classList.remove('border-green-500', 'ring-green-500', 'border-red-500', 'ring-red-500');
        inputElement.classList.add('border-gray-300', 'focus:ring-indigo-500');
        return;
      }

      // Se API CodiceFiscale caricata, esegui validazione (inclusa Omocodia)
      if (window.validateCodiceFiscale) {
        const check = window.validateCodiceFiscale(val);
        inputElement.classList.remove('border-gray-300', 'focus:ring-indigo-500');
        
        if (check.valid) {
          inputElement.classList.remove('border-red-500', 'ring-red-500');
          inputElement.classList.add('border-green-500', 'ring-green-500', 'focus:ring-green-500');
        } else {
          inputElement.classList.remove('border-green-500', 'ring-green-500');
          inputElement.classList.add('border-red-500', 'ring-red-500', 'focus:ring-red-500');
        }
      }
    }

    // Aggiungi listeners ai campi
    inputCfLocatore.addEventListener('input', () => checkCFVisualFeedback(inputCfLocatore));
    inputCfConduttore.addEventListener('input', () => checkCFVisualFeedback(inputCfConduttore));
    
    // Esegui controllo iniziale (utile per il ripristino dati da storage-helper)
    setTimeout(() => {
      checkCFVisualFeedback(inputCfLocatore);
      checkCFVisualFeedback(inputCfConduttore);
    }, 500);


    // --- GESTIONE NUOVI QUADRI C ed E ---
    const inputCasiParticolari = document.getElementById("rli-casi-particolari");
    const quadroESection = document.getElementById("quadro-e-section");
    const btnAddImmobile = document.getElementById("btn-add-immobile");
    const immobiliContainer = document.getElementById("immobili-container");

    // Validazione Quadro A / Quadro E
    inputCasiParticolari.addEventListener("change", () => {
      if (inputCasiParticolari.value === "1" || inputCasiParticolari.value === "3") {
        quadroESection.classList.remove("hidden");
        // Rendi obbligatori i campi del quadro E
        quadroESection.querySelectorAll("input").forEach(i => i.required = true);
      } else {
        quadroESection.classList.add("hidden");
         // Rimuovi obbligatorietà
        quadroESection.querySelectorAll("input").forEach(i => i.required = false);
      }
    });

    // Validazione Quadro C (Ordinamento Catastale)
    function validateImmobili() {
      const items = document.querySelectorAll(".immobile-item");
      let hasPrincipale = false;
      let formIsValid = true;

      items.forEach(item => {
        const tipo = item.querySelector(".immobile-tipo").value;
        const errorMsg = item.querySelector(".error-catastale");
        
        if (tipo === "1") {
          hasPrincipale = true;
          errorMsg.classList.add("hidden");
          item.classList.remove("border-red-500", "bg-red-50");
        } else if ((tipo === "2" || tipo === "3") && !hasPrincipale) {
          // Errore: pertinenza inserita prima del principale
          errorMsg.classList.remove("hidden");
          item.classList.add("border-red-500", "bg-red-50");
          formIsValid = false;
        } else {
          errorMsg.classList.add("hidden");
          item.classList.remove("border-red-500", "bg-red-50");
        }
      });
      return formIsValid;
    }

    // Aggiunta dinamica immobili
    btnAddImmobile.addEventListener("click", () => {
      const template = `
        <div class="immobile-item grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg relative mt-4">
          <button type="button" class="btn-remove-immobile absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold px-2 py-1 bg-white border border-red-100 rounded text-xs">&times; Rimuovi</button>
          <div class="md:col-span-2 mt-4">
            <label class="block text-xs font-bold text-gray-700 mb-1">Tipologia *</label>
            <select class="immobile-tipo w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500" required>
              <option value="1">1 - Immobile Principale</option>
              <option value="2" selected>2 - Pertinenza locata congiuntamente</option>
              <option value="3">3 - Pertinenza locata separatamente</option>
            </select>
          </div>
          <div class="md:col-span-2 mt-4">
             <label class="block text-xs font-bold text-gray-700 mb-1">Categoria Catastale</label>
             <input type="text" class="w-full px-3 py-1.5 border border-gray-300 rounded text-sm uppercase" placeholder="Es. C/2" />
          </div>
          <p class="error-catastale hidden md:col-span-4 text-xs text-red-600 font-bold mt-1">⚠️ Errore Catastale: Impossibile inserire una pertinenza senza prima inserire l'immobile principale.</p>
        </div>`;
      immobiliContainer.insertAdjacentHTML('beforeend', template);
      
      // Bind validazione ai nuovi elementi
      const newItems = document.querySelectorAll(".immobile-tipo");
      newItems.forEach(select => select.addEventListener("change", validateImmobili));
      
      const removeBtns = document.querySelectorAll(".btn-remove-immobile");
      removeBtns.forEach(btn => btn.addEventListener("click", function() {
          this.closest('.immobile-item').remove();
          validateImmobili();
      }));
      
      validateImmobili();
    });
    
    // Bind validazione all'elemento base iniziale
    document.querySelector(".immobile-tipo").addEventListener("change", validateImmobili);


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

      const diffTime = Math.abs(dataOggi - dataStipula);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const giorniRitardo = Math.max(0, diffDays - regole.rli.giorniScadenzaRegistrazione);

      if (!isCedolare) {
        
        let calcoloRegistro = 0;
        
        // Logica per Fondi Rustici e Terreni (T2 / T3)
        if(tipoContratto === "T2" || tipoContratto === "T3") {
            // L'aliquota agevolata è dello 0,5%
             calcoloRegistro = canone * 0.005;
        } else {
             const parametriContratto = regole.rli.codiciContratto[tipoContratto];
             if(parametriContratto) {
                const baseImponibile = canone * parametriContratto.moltiplicatoreImponibile;
                calcoloRegistro = baseImponibile * parametriContratto.aliquota;
             }
        }
        
        impostaRegistro = Math.max(regole.rli.impostaRegistroMinima, calcoloRegistro);

        const pagine = parseInt(inputPagine.value) || 4;
        const copie = parseInt(inputCopie.value) || 2;
        const fogli = Math.ceil(pagine / 4);
        impostaBollo = fogli * regole.rli.impostaBolloFoglio * copie;

        if (giorniRitardo > 0) {
          const sanzioneBase = impostaRegistro * regole.ravvedimento.sanzioneBase;
          let riduzione = 1;
          
          if (giorniRitardo <= 14) riduzione = 0.1;
          else if (giorniRitardo <= 30) riduzione = 1/10;
          else if (giorniRitardo <= 90) riduzione = 1/9;
          else if (giorniRitardo <= 365) riduzione = 1/8;
          else riduzione = 1/7;

          sanzioni = sanzioneBase * riduzione;
        }

      } else {
        impostaRegistro = 0;
        impostaBollo = 0;

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

    // 4. GENERAZIONE PROSPETTO PDF (PDF/A-1b) E GARBAGE COLLECTION
    const SRGB_ICC_B64 = 'AAAByGxjbXMCEAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5knZEAPUCAsD1AdCyBnqUijgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJZGVzYwAAAPAAAABfY3BydAAAAQwAAAAMd3RwdAAAARgAAAAUclhZWgAAASwAAAAUZ1hZWgAAAUAAAAAUYlhZWgAAAVQAAAAUclRSQwAAAWgAAABgZ1RSQwAAAWgAAABgYlRSQwAAAWgAAABgZGVzYwAAAAAAAAAFdVJHQgAAAAAAAAAAAAAAAHRleHQAAAAAQ0MwAFhZWiAAAAAAAADzVAABAAAAARbJWFlaIAAAAAAAAG+gAAA48gAAA49YWVogAAAAAAAAYpYAALeJAAAY2lhZWiAAAAAAAAAkoAAAD4UAALbEY3VydgAAAAAAAAAqAAAAfAD4AZwCdQODBMkGTggSChgMYg70Ec8U9hhqHC4gQySsKWoufjPrObM/1kZXTTZUdlwXZB1shnVWfo2ILJI2nKunjLLbvpnKx9dl5Hfx+f//';

    function base64InByte(b64) {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }

    function escapeXml(unsafe) {
      return unsafe.replace(/[<>&'"]/g, c => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\'': return '&apos;';
          case '"': return '&quot;';
        }
      });
    }

    btnGenerate.addEventListener("click", async () => {
      
      if (!regole) return;
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      
      // Controllo bloccante Ordinamento Catastale
      if (!validateImmobili()) {
         alert("Errore Quadro C: Impossibile registrare una pertinenza senza l'immobile principale antecedente.");
         return;
      }

      if (typeof PDFLib === 'undefined' || typeof window.fontkit === 'undefined') {
        alert("Libreria PDF-lib o fontkit non caricate. Riprova tra un istante.");
        return;
      }

      btnGenerate.disabled = true;
      btnGenerate.innerHTML = '⏳ Generazione in corso...';

      try {
        const pdfDoc = await PDFLib.PDFDocument.create();
        pdfDoc.registerFontkit(window.fontkit);
        
        const urlFontRegular = '/vendor/roboto@0.2.7/Roboto-Regular.ttf';
        const urlFontBold = '/vendor/roboto@0.2.7/Roboto-Medium.ttf';

        const [fontBytesReg, fontBytesBold] = await Promise.all([
          fetch(urlFontRegular).then(res => res.arrayBuffer()),
          fetch(urlFontBold).then(res => res.arrayBuffer())
        ]);

        const fontNormal = await pdfDoc.embedFont(fontBytesReg);
        const fontBold = await pdfDoc.embedFont(fontBytesBold);

        const page = pdfDoc.addPage([595.28, 841.89]);
        const { height } = page.getSize();
        
        let y = height - 50;
        let documentTitle = `Prospetto Liquidazione RLI 2026 - ${inputCfLocatore.value.toUpperCase()}`;
        
        page.drawText(`PROSPETTO LIQUIDAZIONE RLI 2026`, { x: 50, y, size: 16, font: fontBold });
        y -= 30;
        page.drawText(`Generato localmente da StrumentiUtili.it - Conforme ISO 19005 (PDF/A)`, { x: 50, y, size: 10, font: fontNormal });
        
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

        // METADATI XMP E PROFILO ICC PER PDF/A-1b
        const xmpXml = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>1</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(documentTitle)}</rdf:li></rdf:Alt></dc:title>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>StrumentiUtili.it PDF/A Engine ISO 19005</pdf:Producer>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

        const xmpBytes = new TextEncoder().encode(xmpXml);
        const metadataStream = pdfDoc.context.stream(xmpBytes, { Type: 'Metadata', Subtype: 'XML' });
        pdfDoc.catalog.set(PDFLib.PDFName.of('Metadata'), pdfDoc.context.register(metadataStream));

        pdfDoc.setTitle(documentTitle);
        pdfDoc.setProducer('StrumentiUtili.it PDF/A Engine ISO 19005');
        pdfDoc.setCreationDate(new Date());

        const icc = pdfDoc.context.stream(base64InByte(SRGB_ICC_B64), { N: 3 });
        const intento = pdfDoc.context.obj({
          Type: 'OutputIntent',
          S: 'GTS_PDFA1',
          OutputConditionIdentifier: PDFLib.PDFString.of('sRGB IEC61966-2.1'),
          Info: PDFLib.PDFString.of('sRGB IEC61966-2.1'),
          DestOutputProfile: pdfDoc.context.register(icc)
        });
        pdfDoc.catalog.set(PDFLib.PDFName.of('OutputIntents'), pdfDoc.context.obj([pdfDoc.context.register(intento)]));

        // SALVATAGGIO PDF/A
        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Prospetto_RLI_${inputCfLocatore.value.toUpperCase()}.pdf`;
        link.click();
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);

      // GARBAGE COLLECTION E PRIVACY PROFONDA
        try {
          const pageKey = location.pathname.replace(/[\/\.]/g, '_') || 'home';
          const globalKey = `form_data_${pageKey}`;

          if (window.AppStorage && typeof window.AppStorage.remove === 'function') {
            window.AppStorage.remove('rli_state'); 
            window.AppStorage.remove(globalKey);   
          } else {
            localStorage.removeItem('su_rli_state');
            localStorage.removeItem(`su_${globalKey}`);
          }
        } catch(e) { 
          console.warn("Storage warning ignorato", e); 
        }

        const activeForm = document.getElementById("rli-form") || document.querySelector("form");
        if (activeForm) {
          activeForm.reset();
          activeForm.querySelectorAll('input, select, textarea').forEach(el => {
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
        }
        
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        inputDataStipula.value = `${yyyy}-${mm}-${dd}`;
        inputDataStipula.dispatchEvent(new Event('input', { bubbles: true }));

        toggleCedolareVisibilty();
        calculateTaxes();
        
        alert("Prospetto PDF/A generato con successo.\n\nPer garantire la tua privacy, i Codici Fiscali e gli importi sono stati cancellati dalla memoria locale.");
        
      } catch (err) {
        console.error(err);
        alert("Errore nella generazione del documento PDF/A.");
      } finally {
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = '<span>📄</span> Scarica il prospetto delle imposte';
      }
    });

  });
})();