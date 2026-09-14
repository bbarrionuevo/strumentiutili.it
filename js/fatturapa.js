(() => {
  'use strict';

  document.addEventListener("DOMContentLoaded", async () => {
    
    // Nodi DOM
    const form = document.getElementById("fattura-form");
    const linesContainer = document.getElementById("lines-container");
    const btnAddLine = document.getElementById("btn-add-line");
    const btnGenerate = document.getElementById("btn-generate-xml");
    
    // Selects da popolare dinamicamente
    const selectDocTipo = document.getElementById("doc-tipo");
    const selectRegime = document.getElementById("emittente-regime");
    
    // Nodi Output
    const outImponibile = document.getElementById("out-imponibile");
    const outImposta = document.getElementById("out-imposta");
    const outTotale = document.getElementById("out-totale");

    let lineCounter = 0;
    let regoleFattura = null;

    // 1. CARICAMENTO ASINCRONO JSON
    try {
      const response = await fetch('/regole-fiscali-2026_3.json'); // Assicurati che il nome file sia corretto
      if (!response.ok) throw new Error("Errore rete");
      const jsonData = await response.json();
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

    // 2. GESTIONE DINAMICA LINEE FATTURA
    function createLineHTML(id) {
      // Costruisce le opzioni Natura IVA dinamicamente
      let naturaOptions = `<option value="">- Seleziona -</option>`;
      if (regoleFattura) {
        for (const [key, value] of Object.entries(regoleFattura.codici_natura_iva)) {
          naturaOptions += `<option value="${key}">${key} - ${value}</option>`;
        }
      }

      return `
        <div class="line-item bg-gray-50 border border-gray-200 rounded-lg p-4 relative" data-id="${id}">
          <button type="button" class="btn-remove-line absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold px-2 py-1 bg-white border border-red-100 rounded text-xs">&times; Rimuovi</button>
          <div class="grid grid-cols-1 md:grid-cols-12 gap-4 mt-2">
            <div class="md:col-span-5">
              <label class="block text-xs font-bold text-gray-700 mb-1">Descrizione *</label>
              <input type="text" class="line-desc w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500" required placeholder="Consulenza..." />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-700 mb-1">Quantità *</label>
              <input type="number" step="0.01" min="0" value="1" class="line-qty w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 text-right" required />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-bold text-gray-700 mb-1">Prezzo Un. (€) *</label>
              <input type="number" step="0.01" min="0" value="0.00" class="line-price w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 text-right" required />
            </div>
            <div class="md:col-span-1">
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

        btnRemove.addEventListener('click', () => {
          line.remove();
          calculateTotals();
        });

        // Abilita campo Natura solo se IVA è 0% (Prevenzione Scarto 00400)
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

    // 3. CALCOLO E AGGREGAZIONE DATI RIEPILOGO
    function calculateTotals() {
      const lines = Array.from(linesContainer.querySelectorAll('.line-item'));
      let totalImponibile = 0;
      let totalImposta = 0;

      lines.forEach(line => {
        const qty = parseFloat(line.querySelector('.line-qty').value) || 0;
        const price = parseFloat(line.querySelector('.line-price').value) || 0;
        const iva = parseFloat(line.querySelector('.line-iva').value) || 0;

        const imponibileRiga = qty * price;
        const impostaRiga = (imponibileRiga * iva) / 100;

        totalImponibile += imponibileRiga;
        totalImposta += impostaRiga;
      });

      outImponibile.textContent = `€ ${totalImponibile.toFixed(2)}`;
      outImposta.textContent = `€ ${totalImposta.toFixed(2)}`;
      outTotale.textContent = `€ ${(totalImponibile + totalImposta).toFixed(2)}`;
    }

    // 4. VALIDAZIONI FORMALI (LUHN & LUNGHEZZA)
    function validateLuhn(piva) {
      if (!/^[0-9]{11}$/.test(piva)) return false;
      let s = 0;
      for (let i = 0; i <= 9; i += 2) s += parseInt(piva.charAt(i));
      for (let i = 1; i <= 9; i += 2) {
        let c = 2 * parseInt(piva.charAt(i));
        if (c > 9) c = c - 9;
        s += c;
      }
      let expectedCheckDigit = (10 - (s % 10)) % 10;
      return expectedCheckDigit === parseInt(piva.charAt(10));
    }

    function escapeXml(unsafe) {
      return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\'': return '&apos;';
          case '"': return '&quot;';
        }
      });
    }

    document.getElementById("doc-data").valueAsDate = new Date();
    addLine();

    // 5. GENERAZIONE XML ZERO-BACKEND
    btnGenerate.addEventListener('click', () => {
      
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const emiPiva = document.getElementById('emittente-piva').value.trim();
      const cliSdi = document.getElementById('cliente-sdi').value.trim();
      
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

      let xmlDatiRiepilogo = "";
      for (const key in riepilogoMap) {
        const item = riepilogoMap[key];
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
        <RegimeFiscale>${document.getElementById('emittente-regime').value}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>Indirizzo da configurare</Indirizzo>
        <CAP>00100</CAP>
        <Comune>Roma</Comune>
        <Nazione>IT</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${escapeXml(document.getElementById('cliente-id').value)}</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>${escapeXml(document.getElementById('cliente-nome').value)}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>Indirizzo da configurare</Indirizzo>
        <CAP>00100</CAP>
        <Comune>Roma</Comune>
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${document.getElementById('doc-tipo').value}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${document.getElementById('doc-data').value}</Data>
        <Numero>${escapeXml(document.getElementById('doc-numero').value)}</Numero>
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
      
    });
  });
})();