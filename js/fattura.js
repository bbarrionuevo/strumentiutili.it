// js/fattura.js — Visualizzatore Fattura Elettronica (Nativo, senza dipendenze)
document.addEventListener('DOMContentLoaded', () => {
  const renderTarget = document.getElementById('fattura-render');
  const statusTarget = document.getElementById('fattura-status');
  const metaTarget = document.getElementById('fattura-meta');
  const printBtn = document.getElementById('print-fattura');

  // Elementi per il Drag & Drop nativo
  const dropZone = document.getElementById('drop-xml-file');
  const fileInput = document.getElementById('xml-file');
  const filenameDisplay = document.getElementById('xml-filename');

  function money(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(number);
  }

  function normalizeText(value) {
    return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  }

  function getNodeText(documentRoot, selectors) {
    for (const selector of selectors) {
      const node = documentRoot.querySelector(selector);
      if (node && node.textContent) return normalizeText(node.textContent);
    }
    return '';
  }

  function getAddress(parentNode) {
    if (!parentNode) return 'N/D';
    const sede = parentNode.querySelector('Sede');
    if (!sede) return 'N/D';
    const indirizzo = sede.querySelector('Indirizzo')?.textContent || '';
    const cap = sede.querySelector('CAP')?.textContent || '';
    const comune = sede.querySelector('Comune')?.textContent || '';
    const prov = sede.querySelector('Provincia')?.textContent || '';
    const nazione = sede.querySelector('Nazione')?.textContent || '';
    
    let full = `${indirizzo}, ${cap} ${comune}`;
    if (prov) full += ` (${prov})`;
    if (nazione) full += ` - ${nazione}`;
    return normalizeText(full);
  }

  function extractXmlFromBinary(buffer) {
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder('utf-8');
    let text = '';
    try {
      text = decoder.decode(bytes);
    } catch (error) {
      text = Array.from(bytes).map((byte) => String.fromCharCode(byte)).join('');
    }
    const cleaned = text.replace(/\0/g, '');
    const patterns = [
      /<p:FatturaElettronica[\s\S]*?<\/p:FatturaElettronica>/i,
      /<FatturaElettronica[\s\S]*?<\/FatturaElettronica>/i,
      /<p:FatturaElettronica[\s\S]*?<\/p:FatturaElettronica>\s*$/i,
      /<FatturaElettronica[\s\S]*?<\/FatturaElettronica>\s*$/i
    ];
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match && match[0]) return match[0];
    }
    return cleaned;
  }

  async function extractXmlFromP7m(buffer) {
    const fallbackBuffer = buffer.slice(0);
    try {
      const Comlink = await import('https://unpkg.com/comlink/dist/esm/comlink.mjs');
      const worker = new Worker('/js/workers/p7m-worker.js', { type: 'module' });
      const service = Comlink.wrap(worker);

      const xml = await service.extractXml(Comlink.transfer(buffer, [buffer]));
      worker.terminate();
      if (xml) return xml;
      return extractXmlFromBinary(fallbackBuffer);
    } catch (error) {
      console.warn('[Fattura] Errore Worker, eseguo fallback binario:', error);
      return extractXmlFromBinary(fallbackBuffer);
    }
  }

  function parseInvoiceFromXml(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) throw new Error('Il file XML non è valido.');

    const root = xmlDoc.documentElement;
    const cedente = root.querySelector('CedentePrestatore');
    const cessionario = root.querySelector('CessionarioCommittente');
    const datiGenerali = root.querySelector('DatiGenerali');

    const fDenom = getNodeText(cedente || root, ['Anagrafica > Denominazione']);
    const fNome = getNodeText(cedente || root, ['Anagrafica > Nome']);
    const fCogn = getNodeText(cedente || root, ['Anagrafica > Cognome']);
    const fornitoreRagione = fDenom || (fNome + (fCogn ? ' ' + fCogn : '')).trim();
    const fornitorePiva = getNodeText(cedente || root, ['IdFiscaleIVA > IdCodice', 'PartitaIVA']);
    const fornitoreIndirizzo = getAddress(cedente || root);

    const cDenom = getNodeText(cessionario || root, ['Anagrafica > Denominazione']);
    const cNome = getNodeText(cessionario || root, ['Anagrafica > Nome']);
    const cCogn = getNodeText(cessionario || root, ['Anagrafica > Cognome']);
    const clienteRagione = cDenom || (cNome + (cCogn ? ' ' + cCogn : '')).trim();
    
    const clienteCf = getNodeText(cessionario || root, ['CodiceFiscale']);
    const clientePiva = getNodeText(cessionario || root, ['IdFiscaleIVA > IdCodice', 'PartitaIVA']);
    const clienteIndirizzo = getAddress(cessionario || root);

    const numeroFattura = getNodeText(datiGenerali || root, ['DatiGeneraliDocumento > Numero']);
    const dataFattura = getNodeText(datiGenerali || root, ['DatiGeneraliDocumento > Data']);
    const totale = getNodeText(datiGenerali || root, ['DatiGeneraliDocumento > ImportoTotaleDocumento']);

    const righe = Array.from(root.querySelectorAll('DettaglioLinee')).map((line) => ({
      descrizione: getNodeText(line, ['Descrizione']),
      quantita: getNodeText(line, ['Quantita']),
      prezzoUnitario: getNodeText(line, ['PrezzoUnitario']),
      prezzoTotale: getNodeText(line, ['PrezzoTotale']),
      aliquotaIva: getNodeText(line, ['AliquotaIVA'])
    }));

    const riepiloghi = Array.from(root.querySelectorAll('DatiRiepilogo')).map((riep) => ({
      aliquota: getNodeText(riep, ['AliquotaIVA']),
      imponibile: getNodeText(riep, ['ImponibileImporto']),
      imposta: getNodeText(riep, ['Imposta']),
      natura: getNodeText(riep, ['Natura'])
    }));

    const pagamenti = Array.from(root.querySelectorAll('DettaglioPagamento')).map((pag) => ({
      scadenza: getNodeText(pag, ['DataScadenzaPagamento']),
      importo: getNodeText(pag, ['ImportoPagamento']),
      modalita: getNodeText(pag, ['ModalitaPagamento'])
    }));

    return {
      fornitore: {
        ragioneSociale: fornitoreRagione || 'Fornitore non disponibile',
        partitaIva: fornitorePiva || 'N/D',
        indirizzo: fornitoreIndirizzo
      },
      cessionario: {
        ragioneSociale: clienteRagione || 'Cliente non disponibile',
        codiceFiscale: clienteCf || 'N/D',
        partitaIva: clientePiva || 'N/D',
        indirizzo: clienteIndirizzo
      },
      documento: {
        numero: numeroFattura || 'N/D',
        data: dataFattura || 'N/D',
        totale: totale || '0'
      },
      righe,
      riepiloghi,
      pagamenti
    };
  }

  function renderInvoice(invoice) {
    const righeHtml = invoice.righe.length ? invoice.righe.map((row) => `
      <tr>
        <td>${row.descrizione || '—'}</td>
        <td class="text-right">${row.quantita || '—'}</td>
        <td class="text-right">${money(row.prezzoUnitario)}</td>
        <td class="text-right">${money(row.prezzoTotale)}</td>
        <td class="text-right">${row.aliquotaIva ? `${row.aliquotaIva}%` : '—'}</td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="text-center py-4">Nessuna riga trovata.</td></tr>';

    const riepilogoHtml = invoice.riepiloghi.length ? invoice.riepiloghi.map((r) => `
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid #000; padding: 4px 0; font-size: 0.85rem;">
        <span>IVA ${r.aliquota}% ${r.natura ? '(Nat. '+r.natura+')' : ''}</span>
        <span>Imponibile: ${money(r.imponibile)} | Imposta: ${money(r.imposta)}</span>
      </div>
    `).join('') : '<div style="font-size:0.85rem;">Nessun riepilogo IVA.</div>';

    const pagamentiHtml = invoice.pagamenti.length ? invoice.pagamenti.map((p) => `
      <div style="display:flex; justify-content:space-between; border-bottom:1px solid #000; padding: 4px 0; font-size: 0.85rem;">
        <span>Scadenza: <strong>${p.scadenza || 'N/D'}</strong></span>
        <span>Importo: ${money(p.importo)}</span>
      </div>
    `).join('') : '<div style="font-size:0.85rem;">Nessun dato di pagamento.</div>';

    renderTarget.innerHTML = `
      <article class="invoice-sheet">
        <div style="text-align: center; margin-bottom: 2rem;">
            <h2 style="font-size: 1.2rem; font-weight: bold; margin:0;">COPIA DI CORTESIA - FATTURA ELETTRONICA</h2>
            <div style="font-size: 0.8rem; margin-top: 5px;">Generato localmente da StrumentiUtili.it</div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 2rem;">
          <div style="width: 48%;">
            <div class="invoice-label">Cedente Prestatore (Fornitore)</div>
            <div style="font-weight: bold; font-size: 1.1rem;">${invoice.fornitore.ragioneSociale}</div>
            <div>P.IVA: ${invoice.fornitore.partitaIva}</div>
            <div>${invoice.fornitore.indirizzo}</div>
          </div>
          <div style="width: 48%; text-align: right;">
             <div class="invoice-label">Cessionario Committente (Cliente)</div>
            <div style="font-weight: bold; font-size: 1.1rem;">${invoice.cessionario.ragioneSociale}</div>
            ${invoice.cessionario.codiceFiscale !== 'N/D' ? `<div>CF: ${invoice.cessionario.codiceFiscale}</div>` : ''}
            ${invoice.cessionario.partitaIva !== 'N/D' ? `<div>P.IVA: ${invoice.cessionario.partitaIva}</div>` : ''}
            <div>${invoice.cessionario.indirizzo}</div>
          </div>
        </div>

        <div style="border: 2px solid #000; padding: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between;">
            <div>
                <div class="invoice-label">Dati Documento</div>
                <div>Numero: <strong>${invoice.documento.numero}</strong></div>
                <div>Data: <strong>${invoice.documento.data}</strong></div>
            </div>
            <div style="text-align: right;">
                 <div class="invoice-label">Totale Documento</div>
                 <div style="font-size: 1.5rem; font-weight: bold;">${money(invoice.documento.totale)}</div>
            </div>
        </div>

        <div class="invoice-label">Dettaglio Linee (Beni e Servizi)</div>
        <table class="invoice-table">
          <thead>
            <tr>
              <th class="text-left">Descrizione</th>
              <th class="text-right">Q.tà</th>
              <th class="text-right">Prezzo Unit.</th>
              <th class="text-right">Prezzo Tot.</th>
              <th class="text-right">IVA</th>
            </tr>
          </thead>
          <tbody>${righeHtml}</tbody>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 2rem; gap: 2rem;">
          <div style="width: 48%;">
            <div class="invoice-label">Riepilogo IVA (Castelletto)</div>
            ${riepilogoHtml}
          </div>
          <div style="width: 48%;">
            <div class="invoice-label">Scadenze e Pagamenti</div>
            ${pagamentiHtml}
          </div>
        </div>
      </article>
    `;
  }

  async function handleFile(file) {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isP7m = lowerName.endsWith('.p7m');
    const valid = lowerName.endsWith('.xml') || isP7m;
    if (!valid) {
      if(statusTarget) statusTarget.textContent = 'Formato non supportato. Carica un file .xml o .p7m.';
      return;
    }

    if (statusTarget) statusTarget.textContent = isP7m ? 'Estrazione del file firmato...' : 'Lettura in corso...';
    try {
      const arrayBuffer = await file.arrayBuffer();
      const xmlText = isP7m ? await extractXmlFromP7m(arrayBuffer) : extractXmlFromBinary(arrayBuffer);
      const invoice = parseInvoiceFromXml(xmlText);
      if (metaTarget) metaTarget.innerHTML = `<strong>${invoice.fornitore.ragioneSociale}</strong> · N. ${invoice.documento.numero} · Data ${invoice.documento.data}`;
      renderInvoice(invoice);
      if (statusTarget) statusTarget.textContent = 'Fattura generata correttamente.';
    } catch (error) {
      console.error(error);
      if (statusTarget) statusTarget.textContent = 'Errore nella lettura del file.';
      if (renderTarget) renderTarget.innerHTML = '<div class="text-red-600">Impossibile leggere il file XML. Assicurati che sia una FatturaPA valida.</div>';
    }
  }

  // ==========================================
  // EVENT LISTENERS NATIVI (Click e Drag&Drop)
  // ==========================================
  if (dropZone && fileInput) {
    // 1. Click per aprire il selettore file
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    // 2. Quando l'utente seleziona un file
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        if (filenameDisplay) filenameDisplay.textContent = file.name;
        handleFile(file);
      }
    });

    // 3. Drag & Drop (PC)
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#4f46e5'; 
      dropZone.style.backgroundColor = '#eef2ff'; 
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.backgroundColor = '';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.backgroundColor = '';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        fileInput.files = e.dataTransfer.files; 
        if (filenameDisplay) filenameDisplay.textContent = file.name;
        handleFile(file);
      }
    });
  }

  // Stampa PDF
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }
});