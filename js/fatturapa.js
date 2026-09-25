(() => {
  'use strict';

  document.addEventListener("DOMContentLoaded", async () => {
    
    // Nodi DOM principali
    const form = document.getElementById("fattura-form");
    const linesContainer = document.getElementById("lines-container");
    const btnAddLine = document.getElementById("btn-add-line");
    const btnGenerate = document.getElementById("btn-generate-xml");
    
    // Nodi Anagrafiche e Documento
    const selectDocTipo = document.getElementById("doc-tipo");
    const selectRegime = document.getElementById("emittente-regime");
    const inputEmiPiva = document.getElementById("emittente-piva");
    const inputCliId = document.getElementById("cliente-id");
    
    // Nodi Ritenuta d'Acconto (Condizionali)
    const sectionRitenuta = document.getElementById("section-ritenuta");
    const applicaRitenuta = document.getElementById("applica-ritenuta");
    const ritenutaFields = document.getElementById("ritenuta-fields");
    const msgForfettario = document.getElementById("msg-forfettario");
    
    // Nodi Output
    const outImponibile = document.getElementById("out-imponibile");
    const outImposta = document.getElementById("out-imposta");
    const outTotale = document.getElementById("out-totale");

    let lineCounter = 0;
    let regoleFattura = null;

    // 1. CARICAMENTO ASINCRONO JSON
    try {
      const jsonData = await window.StrumentiData.getRegoleFiscali();
      if (!jsonData) throw new Error('Regole fiscali non disponibili.');
      regoleFattura = jsonData.fattura_elettronica;

      // Popola <select> Tipo Documento
      selectDocTipo.innerHTML = "";
      for (const [key, value] of Object.entries(regoleFattura.tipi_documento)) {
        selectDocTipo.innerHTML += `<option value="${key}">${value} (${key})</option>`;
      }

      // Popola <select> Regime Fiscale
      selectRegime.innerHTML = "";
      for (const [key, value] of Object.entries(regoleFattura.regimi_fiscali)) {
        selectRegime.innerHTML += `<option value="${key}">${value} (${key})</option>`;
      }

    } catch (error) {
      console.error("Impossibile caricare regole fiscali per FatturaPA:", error);
      alert("Errore di connessione al database fiscale. Ricarica la pagina.");
      return;
    }

    // 2. GESTIONE RITENUTA D'ACCONTO E REGIME FORFETTARIO
    function toggleRitenuta() {
      if (!applicaRitenuta) return;
      if (selectRegime.value === "RF19") { // Se Forfettario
        applicaRitenuta.checked = false;
        applicaRitenuta.disabled = true;
        if (ritenutaFields) ritenutaFields.classList.add("hidden");
        if (msgForfettario) msgForfettario.classList.remove("hidden");
        if (sectionRitenuta) sectionRitenuta.classList.add("opacity-60");
      } else {
        applicaRitenuta.disabled = false;
        if (msgForfettario) msgForfettario.classList.add("hidden");
        if (sectionRitenuta) sectionRitenuta.classList.remove("opacity-60");
        if (applicaRitenuta.checked) {
          if (ritenutaFields) ritenutaFields.classList.remove("hidden");
        } else {
          if (ritenutaFields) ritenutaFields.classList.add("hidden");
        }
      }
    }
    selectRegime.addEventListener("change", toggleRitenuta);
    if (applicaRitenuta) applicaRitenuta.addEventListener("change", toggleRitenuta);
    setTimeout(toggleRitenuta, 300);

    // 3. VALIDAZIONI VISUALI IN TEMPO REALE (LUHN & API CODICE FISCALE)
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

    function checkFiscaleFeedback(inputElement, isStrictPiva = false) {
      const val = inputElement.value.trim().toUpperCase();
      
      // Reset se lunghezza non rilevante
      if (val.length === 0 || (!isStrictPiva && val.length !== 11 && val.length !== 16) || (isStrictPiva && val.length !== 11)) {
        inputElement.classList.remove('border-green-500', 'ring-green-500', 'border-red-500', 'ring-red-500', 'focus:ring-green-500', 'focus:ring-red-500');
        inputElement.classList.add('border-gray-300', 'focus:ring-indigo-500');
        return;
      }

      let isValid = false;
      if (val.length === 11) {
        isValid = validateLuhn(val);
      } else if (val.length === 16 && !isStrictPiva && window.validateCodiceFiscale) {
        isValid = window.validateCodiceFiscale(val).valid;
      }

      inputElement.classList.remove('border-gray-300', 'focus:ring-indigo-500');
      if (isValid) {
        inputElement.classList.remove('border-red-500', 'ring-red-500', 'focus:ring-red-500');
        inputElement.classList.add('border-green-500', 'ring-green-500', 'focus:ring-green-500');
      } else {
        inputElement.classList.remove('border-green-500', 'ring-green-500', 'focus:ring-green-500');
        inputElement.classList.add('border-red-500', 'ring-red-500', 'focus:ring-red-500');
      }
    }

    inputEmiPiva.addEventListener('input', () => checkFiscaleFeedback(inputEmiPiva, true)); // Solo 11 cifre
    inputCliId.addEventListener('input', () => checkFiscaleFeedback(inputCliId, false)); // 11 cifre o 16 caratteri
    setTimeout(() => { checkFiscaleFeedback(inputEmiPiva, true); checkFiscaleFeedback(inputCliId, false); }, 500);

    // 4. GESTIONE DINAMICA LINEE FATTURA
    function createLineHTML(id) {
      let naturaOptions = `<option value="">- Seleziona -</option>`;
      if (regoleFattura) {
        for (const [key, value] of Object.entries(regoleFattura.codici_natura_iva)) {
          naturaOptions += `<option value="${key}">${key} - ${value}</option>`;
        }
      }

      return `
        <div class="line-item bg-gray-50 border border-gray-200 rounded-lg p-4 relative" data-id="${id}">
          <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div class="md:col-span-3">
              <label class="block text-xs font-bold text-gray-700 mb-1">Descrizione *</label>
              <input type="text" class="line-desc w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500" required placeholder="Consulenza..." />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-700 mb-1">Q.tà *</label>
              <input type="number" step="0.01" min="0" value="1" class="line-qty w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 text-right" required />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-700 mb-1">Prezzo Un. (€) *</label>
              <input type="number" step="0.01" min="0" value="0.00" class="line-price w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 text-right" required />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-700 mb-1">IVA %</label>
              <select class="line-iva w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500">
                <option value="22.00">22%</option>
                <option value="10.00">10%</option>
                <option value="5.00">5%</option>
                <option value="4.00">4%</option>
                <option value="0.00">0%</option>
              </select>
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-700 mb-1">Natura (se IVA 0%)</label>
              <select class="line-natura w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 bg-gray-100" disabled>
                ${naturaOptions}
              </select>
            </div>
            <div class="md:col-span-1 flex justify-end">
              <button type="button" class="btn-remove-line text-red-500 hover:text-red-700 font-bold px-2 py-1.5 bg-white border border-red-100 rounded text-xs w-full shadow-sm" title="Rimuovi riga">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }

    function addLine() {
      lineCounter++;
      linesContainer.insertAdjacentHTML('beforeend', createLineHTML(lineCounter));
      bindLineEvents();
      calculateTotals();
    }

    btnAddLine.addEventListener('click', addLine);

    function bindLineEvents() {
      const currentLines = linesContainer.querySelectorAll('.line-item');
      currentLines.forEach(line => {
        if (line.dataset.bound === "true") return;
        line.dataset.bound = "true";

        const btnRemove = line.querySelector('.btn-remove-line');
        const ivaSelect = line.querySelector('.line-iva');
        const naturaSelect = line.querySelector('.line-natura');
        const inputs = line.querySelectorAll('input, select');

        btnRemove.addEventListener('click', () => { line.remove(); calculateTotals(); });

        ivaSelect.addEventListener('change', (e) => {
          if (e.target.value === "0.00") {
            naturaSelect.disabled = false;
            naturaSelect.classList.remove('bg-gray-100');
            naturaSelect.required = true;
          } else {
            naturaSelect.disabled = true;
            naturaSelect.classList.add('bg-gray-100');
            naturaSelect.value = "";
            naturaSelect.required = false;
          }
        });

        inputs.forEach(inp => inp.addEventListener('input', calculateTotals));
      });
    }

    function calculateTotals() {
      const lines = Array.from(linesContainer.querySelectorAll('.line-item'));
      let totalImponibile = 0;
      let totalImposta = 0;

      lines.forEach(line => {
        const qty = parseFloat(line.querySelector('.line-qty').value) || 0;
        const price = parseFloat(line.querySelector('.line-price').value) || 0;
        const iva = parseFloat(line.querySelector('.line-iva').value) || 0;
        const imponibileRiga = qty * price;
        totalImponibile += imponibileRiga;
        totalImposta += (imponibileRiga * iva) / 100;
      });

      outImponibile.textContent = `€ ${totalImponibile.toFixed(2)}`;
      outImposta.textContent = `€ ${totalImposta.toFixed(2)}`;
      outTotale.textContent = `€ ${(totalImponibile + totalImposta).toFixed(2)}`;
    }

    function escapeXml(unsafe) {
      return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
          case '<': return '&lt;'; case '>': return '&gt;'; case '&': return '&amp;';
          case '\'': return '&apos;'; case '"': return '&quot;';
        }
      });
    }

    document.getElementById("doc-data").valueAsDate = new Date();
    addLine();

    // 5. GENERAZIONE XML ZERO-BACKEND CON PREVENZIONE SCARTO 00404
    btnGenerate.addEventListener('click', () => {
      
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const emiPiva = inputEmiPiva.value.trim();
      const cliSdi = document.getElementById('cliente-sdi').value.trim();
      const numeroFatturaInput = document.getElementById('doc-numero').value.trim();
      const dataFatturaInput = document.getElementById('doc-data').value;
      
      // PREVENZIONE SCARTO 00404 (Fattura Duplicata)
      const currentYear = new Date(dataFatturaInput).getFullYear();
      const invoiceKey = `fattura_${emiPiva}_${currentYear}_${numeroFatturaInput.toUpperCase()}`;
      let invoiceHistory = [];
      try { invoiceHistory = JSON.parse(localStorage.getItem('su_fatture_history')) || []; } catch(e) {}
      
      if (invoiceHistory.includes(invoiceKey)) {
        alert(`Errore 00404 Evitato: Hai già generato una fattura con il numero "${numeroFatturaInput}" per l'anno ${currentYear}. Modifica il progressivo per evitare lo scarto del SdI.`);
        return;
      }
      
      if (!validateLuhn(emiPiva)) {
        alert("La Partita IVA dell'emittente non è matematicamente valida (Fallito Algoritmo di Luhn). Correggila per evitare lo scarto 00305.");
        return;
      }

      if (cliSdi.length !== 7 && cliSdi.length !== 6) {
        alert("Il Codice Destinatario deve essere lungo esattamente 7 caratteri (o 6 per P.A.). Usa 0000000 se non lo possiedi.");
        return;
      }

      const lines = Array.from(linesContainer.querySelectorAll('.line-item'));
      if (lines.length === 0) {
        alert("Aggiungi almeno un prodotto o servizio.");
        return;
      }

      const riepilogoMap = {};
      let xmlDettaglioLinee = "";
      
      lines.forEach((line, index) => {
        const numRiga = index + 1;
        const desc = escapeXml(line.querySelector('.line-desc').value.trim());
        const qty = parseFloat(line.querySelector('.line-qty').value) || 0;
        const price = parseFloat(line.querySelector('.line-price').value) || 0;
        const ivaStr = line.querySelector('.line-iva').value; 
        const natura = line.querySelector('.line-natura').value;
        const prezzoTot = (qty * price).toFixed(2);

        xmlDettaglioLinee += `
        <DettaglioLinee>
          <NumeroLinea>${numRiga}</NumeroLinea>
          <Descrizione>${desc}</Descrizione>
          <Quantita>${qty.toFixed(2)}</Quantita>
          <PrezzoUnitario>${price.toFixed(2)}</PrezzoUnitario>
          <PrezzoTotale>${prezzoTot}</PrezzoTotale>
          <AliquotaIVA>${ivaStr}</AliquotaIVA>`;
        
        if (ivaStr === "0.00" && natura) {
          xmlDettaglioLinee += `\n          <Natura>${natura}</Natura>`;
        }
        xmlDettaglioLinee += `\n        </DettaglioLinee>`;

        const key = `${ivaStr}_${natura || 'none'}`;
        if (!riepilogoMap[key]) {
          riepilogoMap[key] = { imponibile: 0, imposta: 0, iva: ivaStr, natura: natura };
        }
        riepilogoMap[key].imponibile += parseFloat(prezzoTot);
        riepilogoMap[key].imposta += (parseFloat(prezzoTot) * parseFloat(ivaStr)) / 100;
      });

      let totalImponibileDoc = 0;
      let totalImpostaDoc = 0;
      let xmlDatiRiepilogo = "";
      for (const key in riepilogoMap) {
        const item = riepilogoMap[key];
        totalImponibileDoc += item.imponibile;
        totalImpostaDoc += item.imposta;
        xmlDatiRiepilogo += `
        <DatiRiepilogo>
          <AliquotaIVA>${item.iva}</AliquotaIVA>`;
        if (item.iva === "0.00" && item.natura) {
          xmlDatiRiepilogo += `\n          <Natura>${item.natura}</Natura>`;
        }
        xmlDatiRiepilogo += `
          <ImponibileImporto>${item.imponibile.toFixed(2)}</ImponibileImporto>
          <Imposta>${item.imposta.toFixed(2)}</Imposta>
        </DatiRiepilogo>`;
      }

      // COSTRUZIONE NODO RITENUTA
      let xmlDatiRitenuta = "";
      if (applicaRitenuta && applicaRitenuta.checked && selectRegime.value !== "RF19") {
        const aliquotaRit = parseFloat(document.getElementById("ritenuta-aliquota").value) || 20;
        const importoRit = (totalImponibileDoc * aliquotaRit) / 100;
        const causale = document.getElementById("ritenuta-causale").value;
        
        xmlDatiRitenuta = `
        <DatiRitenuta>
          <TipoRitenuta>RT01</TipoRitenuta>
          <ImportoRitenuta>${importoRit.toFixed(2)}</ImportoRitenuta>
          <AliquotaRitenuta>${aliquotaRit.toFixed(2)}</AliquotaRitenuta>
          <CausalePagamento>${causale}</CausalePagamento>
        </DatiRitenuta>`;
      }

      // Bollo virtuale da 2 euro: fatture senza IVA dei forfettari e dei minimi sopra 77,47 euro
      const xmlDatiBollo = (selectRegime.value === "RF19" || selectRegime.value === "RF02") && totalImpostaDoc === 0 && totalImponibileDoc > 77.47
        ? `
        <DatiBollo>
          <BolloVirtuale>SI</BolloVirtuale>
          <ImportoBollo>2.00</ImportoBollo>
        </DatiBollo>`
        : "";

      // Sede di cedente e cliente, dai campi del modulo
      const sede = (prefisso) => {
        const v = (campo) => document.getElementById(`${prefisso}-${campo}`).value.trim();
        const provincia = v('provincia').toUpperCase();
        return `<Sede>
        <Indirizzo>${escapeXml(v('indirizzo'))}</Indirizzo>
        <CAP>${escapeXml(v('cap'))}</CAP>
        <Comune>${escapeXml(v('comune'))}</Comune>${provincia ? `
        <Provincia>${escapeXml(provincia)}</Provincia>` : ''}
        <Nazione>IT</Nazione>
      </Sede>`;
      };

      // Cliente privato (codice fiscale di 16 caratteri): va nel nodo CodiceFiscale, non in IdFiscaleIVA (scarto SdI)
      const cliId = inputCliId.value.trim().toUpperCase();
      const cliIdXml = cliId.length === 16
        ? `<CodiceFiscale>${escapeXml(cliId)}</CodiceFiscale>`
        : `<IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${escapeXml(cliId)}</IdCodice>
        </IdFiscaleIVA>`;

      const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${emiPiva}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${Date.now().toString().slice(-5)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${cliSdi}</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${emiPiva}</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>${escapeXml(document.getElementById('emittente-nome').value)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${selectRegime.value}</RegimeFiscale>
      </DatiAnagrafici>
      ${sede('emittente')}
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        ${cliIdXml}
        <Anagrafica>
          <Denominazione>${escapeXml(document.getElementById('cliente-nome').value)}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      ${sede('cliente')}
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${document.getElementById('doc-tipo').value}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${dataFatturaInput}</Data>
        <Numero>${escapeXml(numeroFatturaInput)}</Numero>${xmlDatiRitenuta}${xmlDatiBollo}
        <ImportoTotaleDocumento>${outTotale.textContent.replace('€ ', '')}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>${xmlDettaglioLinee}${xmlDatiRiepilogo}
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

      const blob = new Blob([xmlString], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `IT${emiPiva}_${Date.now().toString().slice(-5)}.xml`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      // Salva storico per prevenire duplicati (00404)
      invoiceHistory.push(invoiceKey);
      localStorage.setItem('su_fatture_history', JSON.stringify(invoiceHistory));
      
    });
  });
})();