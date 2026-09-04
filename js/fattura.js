document.addEventListener('DOMContentLoaded', () => {
  const renderTarget = document.getElementById('fattura-render');
  const statusTarget = document.getElementById('fattura-status');
  const metaTarget = document.getElementById('fattura-meta');
  const printBtn = document.getElementById('print-fattura');

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

  function extractXmlFromP7m(buffer) {
    return new Promise((resolve) => {
      const fallbackBuffer = buffer.slice(0);
      let settled = false;
      let worker = null;

      function settleWithFallback() {
        if (settled) return;
        settled = true;
        try { worker && worker.terminate(); } catch (e) {}
        resolve(extractXmlFromBinary(fallbackBuffer));
      }

      try {
        worker = new Worker('/js/workers/p7m-worker.js', { type: 'module' });
      } catch (error) {
        settleWithFallback();
        return;
      }

      const timeoutId = setTimeout(settleWithFallback, 15000);

      worker.onmessage = (event) => {
        const msg = event.data || {};
        clearTimeout(timeoutId);
        if (settled) return;
        if (msg.type === 'success' && msg.xml) {
          settled = true;
          try { worker.terminate(); } catch (e) {}
          resolve(msg.xml);
        } else {
          settleWithFallback();
        }
      };

      worker.onerror = () => {
        clearTimeout(timeoutId);
        settleWithFallback();
      };
      worker.postMessage({ buffer });
    });
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

    // Datos Proveedor
    const fDenom = getNodeText(cedente || root, ['Anagrafica > Denominazione']);
    const fNome = getNodeText(cedente || root, ['Anagrafica > Nome']);
    const fCogn = getNodeText(cedente || root, ['Anagrafica > Cognome']);
    const fornitoreRagione = fDenom || (fNome + (fCogn ? ' ' + fCogn : '')).trim();
    const fornitorePiva = getNodeText(cedente || root, ['IdFiscaleIVA > IdCodice', 'PartitaIVA']);
    const fornitoreIndirizzo = getAddress(cedente || root);

    // Datos Cliente
    const cDenom = getNodeText(cessionario || root, ['Anagrafica > Denominazione']);
    const cNome = getNodeText(cessionario || root, ['Anagrafica > Nome']);
    const cCogn = getNodeText(cessionario || root, ['Anagrafica > Cognome']);
    const clienteRagione = cDenom || (cNome + (cCogn ? ' ' + cCogn : '')).trim();
    
    // VARIABLES RESTAURADAS:
    const clienteCf = getNodeText(cessionario || root, ['CodiceFiscale']);
    const clientePiva = getNodeText(cessionario || root, ['IdFiscaleIVA > IdCodice', 'PartitaIVA']);
    const clienteIndirizzo = getAddress(cessionario || root);

    // Documento
    const numeroFattura = getNodeText(datiGenerali || root, ['DatiGeneraliDocumento > Numero']);
    const dataFattura = getNodeText(datiGenerali || root, ['DatiGeneraliDocumento > Data']);
    const totale = getNodeText(datiGenerali || root, ['DatiGeneraliDocumento > ImportoTotaleDocumento']);

    // Líneas
    const righe = Array.from(root.querySelectorAll('DettaglioLinee')).map((line) => ({
      descrizione: getNodeText(line, ['Descrizione']),
      quantita: getNodeText(line, ['Quantita']),
      prezzoUnitario: getNodeText(line, ['PrezzoUnitario']),
      prezzoTotale: getNodeText(line, ['PrezzoTotale']),
      aliquotaIva: getNodeText(line, ['AliquotaIVA'])
    }));

    // Castelletto IVA
    const riepiloghi = Array.from(root.querySelectorAll('DatiRiepilogo')).map((riep) => ({
      aliquota: getNodeText(riep, ['AliquotaIVA']),
      imponibile: getNodeText(riep, ['ImponibileImporto']),
      imposta: getNodeText(riep, ['Imposta']),
      natura: getNodeText(riep, ['Natura'])
    }));

    // Pagos
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
    `).join('') : '<tr><td colspan="5" class="text-center py-4 text-gray-500">Nessuna riga trovata.</td></tr>';

    const riepilogoHtml = invoice.riepiloghi.length ? invoice.riepiloghi.map((r) => `
      <div class="flex justify-between py-1 border-b text-sm">
        <span>IVA ${r.aliquota}% ${r.natura ? '(Nat. '+r.natura+')' : ''}</span>
        <span class="text-gray-600">Imponibile: ${money(r.imponibile)} | Imposta: ${money(r.imposta)}</span>
      </div>
    `).join('') : '<div class="text-sm text-gray-500">Nessun riepilogo IVA.</div>';

    const pagamentiHtml = invoice.pagamenti.length ? invoice.pagamenti.map((p) => `
      <div class="flex justify-between py-1 border-b text-sm">
        <span>Scadenza: <strong>${p.scadenza || 'N/D'}</strong></span>
        <span>Importo: ${money(p.importo)}</span>
      </div>
    `).join('') : '<div class="text-sm text-gray-500">Nessun dato di pagamento.</div>';

    renderTarget.innerHTML = `
      <article class="invoice-sheet p-6 md:p-8 print:shadow-none print:border-0 print:p-0">
        <div class="flex flex-col md:flex-row justify-between gap-4 border-b pb-4">
          <div>
            <div class="invoice-label">Copia di Cortesia - Fattura Elettronica</div>
            <h3 class="text-2xl font-bold mt-2">${invoice.fornitore.ragioneSociale}</h3>
            <div class="text-sm text-gray-600">P.IVA: ${invoice.fornitore.partitaIva}</div>
            <div class="text-sm text-gray-600">${invoice.fornitore.indirizzo}</div>
          </div>
          <div class="text-left md:text-right">
            <div class="invoice-label">Documento</div>
            <div class="text-xl font-semibold">N. ${invoice.documento.numero}</div>
            <div class="text-sm text-gray-600">Data: ${invoice.documento.data}</div>
            <div class="text-xl font-bold text-indigo-700 mt-2">Totale: ${money(invoice.documento.totale)}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div class="bg-gray-50 p-4 rounded">
            <div class="invoice-label">Cliente / Cessionario Committente</div>
            <div class="mt-2 text-sm text-gray-700">
              <div><strong>${invoice.cessionario.ragioneSociale}</strong></div>
              ${invoice.cessionario.codiceFiscale !== 'N/D' ? `<div>CF: ${invoice.cessionario.codiceFiscale}</div>` : ''}
              ${invoice.cessionario.partitaIva !== 'N/D' ? `<div>P.IVA: ${invoice.cessionario.partitaIva}</div>` : ''}
              <div>${invoice.cessionario.indirizzo}</div>
            </div>
          </div>
        </div>

        <div class="mt-6 overflow-x-auto">
          <table class="invoice-table w-full border-collapse bg-white">
            <thead class="bg-gray-100">
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
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          <div>
            <div class="invoice-label mb-2">Riepilogo IVA (Castelletto)</div>
            ${riepilogoHtml}
            
            <div class="invoice-label mb-2 mt-6">Scadenze e Pagamenti</div>
            ${pagamentiHtml}
          </div>
          
          <div class="flex justify-end items-end">
            <div class="border rounded-lg p-4 bg-gray-50 min-w-[220px]">
              <div class="text-sm text-gray-600">Totale Documento</div>
              <div class="text-2xl font-bold text-indigo-700">${money(invoice.documento.totale)}</div>
            </div>
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
      statusTarget.textContent = 'Formato non supportato. Carica un file .xml o .p7m.';
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
      console.error(error); // Ahora mostrará el error real en tu consola (F12)
      if (statusTarget) statusTarget.textContent = 'Errore nella lettura del file.';
      if (renderTarget) renderTarget.innerHTML = '<div class="text-red-600">Impossibile leggere il file XML. Assicurati che sia una FatturaPA valida.</div>';
    }
  }

  window.handleFatturaFile = handleFile;

  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }
});
