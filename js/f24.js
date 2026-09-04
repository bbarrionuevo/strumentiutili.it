(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', initF24App);

  function initF24App() {
    // ==========================================
    // 1. INIZIALIZZAZIONE DOM & CONTESTO
    // ==========================================
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const badgeActiveModel = document.getElementById('active-model-badge');
    const sezioneAnagraficaF24 = document.getElementById('sezione-anagrafica-f24');

    const outTotDebiti = document.getElementById('tot-debiti');
    const outTotCrediti = document.getElementById('tot-crediti');
    const outTotSaldo = document.getElementById('tot-saldo');
    const saldoWarning = document.getElementById('saldo-warning');
    const btnGeneratePdf = document.getElementById('btn-generate-pdf');

    // Detectamos si estamos en una página individual (leyendo el body) o por defecto ordinario
    const bodyModel = document.body.getAttribute('data-f24-model');
    let activeModel = bodyModel || 'ordinario'; 

    // Gestione Tabs (Se mantiene por si usas la versión con pestañas en algún otro lado)
    if (tabBtns.length > 0) {
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => {
            b.classList.remove('active', 'text-indigo-700', 'border-indigo-600', 'font-bold');
            b.classList.add('text-gray-500', 'border-transparent', 'font-semibold');
          });
          tabContents.forEach(c => c.classList.add('hidden'));

          btn.classList.add('active', 'text-indigo-700', 'border-indigo-600', 'font-bold');
          btn.classList.remove('text-gray-500', 'border-transparent');
          
          const targetId = btn.getAttribute('data-target');
          document.getElementById(targetId).classList.remove('hidden');

          activeModel = targetId.replace('tab-', '');
          if (badgeActiveModel) badgeActiveModel.textContent = activeModel.toUpperCase();

          if (sezioneAnagraficaF24) {
            if (activeModel === 'f23') {
              sezioneAnagraficaF24.classList.add('hidden');
            } else {
              sezioneAnagraficaF24.classList.remove('hidden');
            }
          }

          recalculateTotals();
        });
      });
    }

    // ==========================================
    // 2. VALIDAZIONE CODICE FISCALE (Reutilizable)
    // ==========================================
    function setupCfValidation(inputId, badgeId) {
      const inputCF = document.getElementById(inputId);
      const badgeCF = document.getElementById(badgeId);
      
      if (inputCF && badgeCF) {
        inputCF.addEventListener('input', () => {
          const val = inputCF.value.trim().toUpperCase();
          if (!val) {
            badgeCF.classList.add('hidden');
            inputCF.classList.remove('border-emerald-500', 'border-rose-500');
            return;
          }

          badgeCF.classList.remove('hidden');
          if (/^\d{11}$/.test(val)) {
            badgeCF.textContent = '✓ P.IVA Valida';
            badgeCF.className = 'text-[11px] font-semibold text-emerald-600';
            inputCF.classList.remove('border-rose-500');
            inputCF.classList.add('border-emerald-500');
          } else if (val.length === 16 && window.CodiceFiscale) {
            const res = window.CodiceFiscale.validateCodiceFiscale(val);
            if (res.valid) {
              badgeCF.textContent = '✓ CF Valido';
              badgeCF.className = 'text-[11px] font-semibold text-emerald-600';
              inputCF.classList.remove('border-rose-500');
              inputCF.classList.add('border-emerald-500');
            } else {
              badgeCF.textContent = '⚠️ CF Non Valido';
              badgeCF.className = 'text-[11px] font-semibold text-rose-600';
              inputCF.classList.remove('border-emerald-500');
              inputCF.classList.add('border-rose-500');
            }
          } else {
            badgeCF.textContent = '⚠️ Errore Formato';
            badgeCF.className = 'text-[11px] font-semibold text-rose-600';
            inputCF.classList.remove('border-emerald-500');
            inputCF.classList.add('border-rose-500');
          }
        });
      }
    }

    // Inicializamos ambos por si acaso (F24 general y F23 específico)
    setupCfValidation('f24-cf', 'badge-f24-cf');
    setupCfValidation('f23-cf-1', 'badge-f23-cf-1');

    // ==========================================
    // 3. GENERAZIONE DINAMICA DELLE RIGHE
    // ==========================================
    const rowTemplates = {
      'container-ord-erario': `
        <input type="text" placeholder="Cod. Trib" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="text" placeholder="Anno (AAAA)" class="col-span-2 px-2 py-1.5 border rounded text-xs font-mono" maxlength="4" />
        <input type="number" step="0.01" min="0" placeholder="Debito (€)" class="col-span-3 px-2 py-1.5 border rounded text-xs font-mono text-rose-700 f24-calc-input f24-deb" />
        <input type="number" step="0.01" min="0" placeholder="Credito (€)" class="col-span-4 px-2 py-1.5 border rounded text-xs font-mono text-emerald-700 f24-calc-input f24-cred" />
      `,
      'container-ord-inps': `
        <input type="text" placeholder="Sede" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="text" placeholder="Causale" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="text" placeholder="Matricola INPS" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono hidden sm:block" />
        <input type="number" step="0.01" min="0" placeholder="Debito" class="col-span-3 sm:col-span-2 px-2 py-1.5 border rounded text-xs font-mono text-rose-700 f24-calc-input f24-deb" />
        <input type="number" step="0.01" min="0" placeholder="Credito" class="col-span-2 sm:col-span-3 px-2 py-1.5 border rounded text-xs font-mono text-emerald-700 f24-calc-input f24-cred" />
      `,
      'container-ord-imu': `
        <input type="text" placeholder="Cod. Ente" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="text" placeholder="Cod. Trib" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="number" step="0.01" min="0" placeholder="Debito" class="col-span-3 px-2 py-1.5 border rounded text-xs font-mono text-rose-700 f24-calc-input f24-deb is-imu" />
        <input type="number" step="0.01" min="0" placeholder="Credito" class="col-span-4 px-2 py-1.5 border rounded text-xs font-mono text-emerald-700 f24-calc-input f24-cred is-imu" />
      `,
      'container-semplificato-righe': `
        <select class="col-span-2 px-2 py-1.5 border rounded text-xs font-mono bg-white">
          <option value="ER">ER (Erario)</option>
          <option value="RG">RG (Regioni)</option>
          <option value="EL">EL (Enti Locali)</option>
        </select>
        <input type="text" placeholder="Cod. Trib" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="text" placeholder="Cod. Ente" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="number" step="0.01" min="0" placeholder="Debito" class="col-span-2 px-2 py-1.5 border rounded text-xs font-mono text-rose-700 f24-calc-input f24-deb" />
        <input type="number" step="0.01" min="0" placeholder="Credito" class="col-span-3 px-2 py-1.5 border rounded text-xs font-mono text-emerald-700 f24-calc-input f24-cred" />
      `,
      'container-elide-righe': `
        <input type="text" placeholder="Codice Trib" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="text" placeholder="Elementi Identificativi (17 car.)" maxlength="17" class="col-span-4 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="number" step="0.01" min="0" placeholder="Debito" class="col-span-5 px-2 py-1.5 border rounded text-xs font-mono text-rose-700 f24-calc-input f24-deb" />
      `,
      'container-accise-righe': `
        <input type="text" placeholder="Ente" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="text" placeholder="Provincia" maxlength="2" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="text" placeholder="Cod. Trib" class="col-span-2 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="number" step="0.01" min="0" placeholder="Debito" class="col-span-2 px-2 py-1.5 border rounded text-xs font-mono text-rose-700 f24-calc-input f24-deb" />
        <input type="number" step="0.01" min="0" placeholder="Credito" class="col-span-3 px-2 py-1.5 border rounded text-xs font-mono text-emerald-700 f24-calc-input f24-cred" />
      `,
      'container-f23-righe': `
        <input type="text" placeholder="Cod. Tributo" class="col-span-3 px-2 py-1.5 border rounded text-xs uppercase font-mono" />
        <input type="text" placeholder="Descrizione" class="col-span-5 px-2 py-1.5 border rounded text-xs uppercase" />
        <input type="number" step="0.01" min="0" placeholder="Importo (€)" class="col-span-3 px-2 py-1.5 border rounded text-xs font-mono text-rose-700 f24-calc-input f24-deb" />
      `
    };

    document.querySelectorAll('.btn-add-riga').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetId = e.target.getAttribute('data-target');
        const container = document.getElementById(targetId);
        if (!container) return;

        if (targetId === 'container-f23-righe' && container.children.length >= 4) {
          alert('Il modello F23 ammette un massimo di 4 righe tributo.');
          return;
        }

        const row = document.createElement('div');
        row.className = 'grid grid-cols-12 gap-2 bg-gray-50 p-2 rounded border border-gray-200 items-center f24-row';
        
        const htmlContent = rowTemplates[targetId] || rowTemplates['container-ord-erario'];
        
        row.innerHTML = `
          ${htmlContent}
          <div class="col-span-1 text-center">
            <button type="button" class="text-rose-500 hover:text-rose-700 font-bold btn-del-row px-1">✕</button>
          </div>
        `;
        
        row.querySelector('.btn-del-row').addEventListener('click', () => { 
          row.remove(); 
          recalculateTotals(); 
        });
        
        container.appendChild(row);
      });
    });

    document.addEventListener('input', e => {
      if (e.target.classList.contains('f24-calc-input')) {
        recalculateTotals();
      }
    });

    // ==========================================
    // 4. MOTORE MATEMATICO E REGOLE DI BUSINESS
    // ==========================================
    function recalculateTotals() {
      if (!outTotDebiti) return;

      let totDebiti = 0;
      let totCrediti = 0;

      // Buscamos el contenedor activo
      const activeContainer = document.querySelector('.tab-content:not(.hidden)') || document.body;

      activeContainer.querySelectorAll('.f24-calc-input').forEach(input => {
        let val = parseFloat(input.value) || 0;

        if (input.classList.contains('is-imu')) {
          val = Math.round(val);
        }

        if (input.classList.contains('f24-deb')) {
          totDebiti += val;
        } else if (input.classList.contains('f24-cred')) {
          totCrediti += val;
        }
      });

      const saldo = Math.max(0, totDebiti - totCrediti);

      outTotDebiti.textContent = formatEuro(totDebiti);
      if (outTotCrediti) outTotCrediti.textContent = formatEuro(totCrediti);
      if (outTotSaldo) outTotSaldo.textContent = formatEuro(saldo);

      if (saldoWarning) {
        saldoWarning.classList.add('hidden');
        
        if (totCrediti > totDebiti) {
          saldoWarning.innerHTML = '⚠️ <strong>Attenzione:</strong> Il saldo negativo non è ammesso. L\'eccedenza di credito va conservata per F24 futuri.';
          saldoWarning.classList.remove('hidden', 'text-amber-500');
          saldoWarning.classList.add('text-rose-500');
        } 
        else if (saldo === 0 && totDebiti > 0 && activeModel !== 'f23') {
          saldoWarning.innerHTML = '⚡ <strong>Obbligo Telematico:</strong> I Modelli F24 a Saldo Zero devono essere presentati esclusivamente tramite Fisconline/Entratel.';
          saldoWarning.classList.remove('hidden', 'text-rose-500');
          saldoWarning.classList.add('text-amber-500');
        }
        else if (saldo > 1000 && activeModel !== 'f23') {
          saldoWarning.innerHTML = '⚡ <strong>Obbligo Telematico:</strong> I saldi superiori a 1.000€ non possono essere pagati in forma cartacea allo sportello.';
          saldoWarning.classList.remove('hidden', 'text-rose-500');
          saldoWarning.classList.add('text-amber-500');
        }
      }
    }

    function formatEuro(val) {
      return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
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

    // ==========================================
    // 5. MOTORE PDF CON INIEZIONE ISO PDF/A-1b
    // ==========================================
    if (btnGeneratePdf) {
      btnGeneratePdf.addEventListener('click', async () => {
        if (typeof PDFLib === 'undefined') return;

        btnGeneratePdf.disabled = true;
        btnGeneratePdf.textContent = '⏳ Generazione PDF/A...';

        try {
          const pdfDoc = await PDFLib.PDFDocument.create();
          const page = pdfDoc.addPage([595.28, 841.89]); // A4
          const { width, height } = page.getSize();

          const fontCourier = await pdfDoc.embedFont(PDFLib.StandardFonts.Courier);
          const fontCourierBold = await pdfDoc.embedFont(PDFLib.StandardFonts.CourierBold);
          const fontHelveticaBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

          const margin = 35;
          let y = height - margin;
          const clean = str => (str || '').replace(/[^\x00-\xFF]/g, '').toUpperCase();

          // 5.1 HEADER
          page.drawText('Generato da software StrumentiUtili.it - Conforme ISO 19005', {
            x: 15, y: margin, size: 6, font: fontCourier, rotate: PDFLib.degrees(90), color: PDFLib.rgb(0.5, 0.5, 0.5)
          });

          page.drawRectangle({
            x: margin, y: y - 25, width: width - (margin * 2), height: 25,
            color: PDFLib.rgb(0.1, 0.4, 0.3)
          });
          page.drawText(`MODELLO DI PAGAMENTO: ${activeModel === 'f23' ? 'F23' : 'F24 ' + activeModel.toUpperCase()}`, {
            x: margin + 10, y: y - 17, size: 10, font: fontHelveticaBold, color: PDFLib.rgb(1, 1, 1)
          });
          y -= 50;

          // 5.2 ANAGRAFICA 
          let documentTitle = `Modello ${activeModel === 'f23' ? 'F23' : 'F24 ' + activeModel}`;
          
          if (activeModel !== 'f23') {
            const cf = clean(document.getElementById('f24-cf')?.value);
            const cognome = clean(document.getElementById('f24-cognome')?.value);
            const nome = clean(document.getElementById('f24-nome')?.value);
            const cfCoob = clean(document.getElementById('f24-cf-coobbligato')?.value);
            
            if (cf) documentTitle += ` - ${cf}`;

            page.drawText('DATI ANAGRAFICI DEL CONTRIBUENTE', { x: margin, y, size: 8, font: fontHelveticaBold });
            y -= 15;
            page.drawText(`CODICE FISCALE: ${cf}`, { x: margin, y, size: 10, font: fontCourierBold });
            y -= 15;
            page.drawText(`NOME E COGNOME / DENOMINAZIONE: ${cognome} ${nome}`, { x: margin, y, size: 10, font: fontCourier });
            
            if (cfCoob) {
              y -= 15;
              page.drawText(`COOBBLIGATO/EREDE (CF): ${cfCoob}`, { x: margin, y, size: 10, font: fontCourier });
            }
            y -= 30;
          } else {
            const cf1 = clean(document.getElementById('f23-cf-1')?.value);
            const nome1 = clean(document.getElementById('f23-nome-1')?.value);
            if (cf1) documentTitle += ` - ${cf1}`;

            page.drawText('DATI ANAGRAFICI (PARTE 1)', { x: margin, y, size: 8, font: fontHelveticaBold });
            y -= 15;
            page.drawText(`CF: ${cf1} - NOME/COGNOME: ${nome1}`, { x: margin, y, size: 10, font: fontCourierBold });
            y -= 30;
          }

          // 5.3 DATI ECONOMICI
          const activeContainer = document.querySelector('.tab-content:not(.hidden)') || document.body;
          const rows = activeContainer.querySelectorAll('.f24-row');

          page.drawText('DETTAGLIO TRIBUTI E COMPENSAZIONI', { x: margin, y, size: 8, font: fontHelveticaBold });
          y -= 15;

          rows.forEach(r => {
            const inputs = r.querySelectorAll('input, select');
            let rigaText = "";
            
            inputs.forEach(inp => {
              const val = inp.value.trim();
              if (val) {
                if (inp.classList.contains('f24-calc-input')) {
                  rigaText += ` ${formatEuro(parseFloat(val))} `;
                } else {
                  rigaText += ` [${clean(val)}] `;
                }
              }
            });

            page.drawText(rigaText, { x: margin, y, size: 9, font: fontCourier });
            y -= 15;
          });

          // 5.4 FOOTER E SALDI
          y -= 30;
          page.drawRectangle({
            x: margin, y: y - 30, width: width - (margin * 2), height: 30,
            color: PDFLib.rgb(0.95, 0.95, 0.95), borderColor: PDFLib.rgb(0.5, 0.5, 0.5), borderWidth: 1
          });

          page.drawText(`DEBITI: ${outTotDebiti ? outTotDebiti.textContent : '0,00 €'}`, { x: margin + 10, y: y - 12, size: 9, font: fontCourierBold });
          if (activeModel !== 'f23') {
            page.drawText(`CREDITI: ${outTotCrediti ? outTotCrediti.textContent : '0,00 €'}`, { x: margin + 150, y: y - 12, size: 9, font: fontCourierBold });
          }
          page.drawText(`SALDO FINALE: ${outTotSaldo ? outTotSaldo.textContent : '0,00 €'}`, { x: margin + 320, y: y - 12, size: 11, font: fontCourierBold, color: PDFLib.rgb(0.8, 0.1, 0.1) });

          // 5.5 INIEZIONE METADATI ISO PDF/A
          const xmpXml = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>1</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:format>application/pdf</dc:format>
   <dc:title>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${escapeXml(documentTitle)}</rdf:li>
    </rdf:Alt>
   </dc:title>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>StrumentiUtili.it PDF/A Engine ISO 19005</pdf:Producer>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

          const xmpBytes = new TextEncoder().encode(xmpXml);
          const metadataStream = pdfDoc.context.stream(xmpBytes, {
            Type: 'Metadata',
            Subtype: 'XML',
          });
          const metadataStreamRef = pdfDoc.context.register(metadataStream);
          pdfDoc.catalog.set(PDFLib.PDFName.of('Metadata'), metadataStreamRef);

          pdfDoc.setTitle(documentTitle);
          pdfDoc.setProducer('StrumentiUtili.it PDF/A Engine ISO 19005');
          pdfDoc.setCreationDate(new Date());

          const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${documentTitle.replace(/\s+/g, '_')}.pdf`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);

        } catch (err) {
          console.error(err);
          alert('Errore durante la creazione del PDF. Assicurati che i campi siano compilati correttamente.');
        } finally {
          btnGeneratePdf.disabled = false;
          btnGeneratePdf.textContent = '📄 Genera PDF Conforme';
        }
      });
    }
  }
})();