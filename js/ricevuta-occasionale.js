(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', initCalculators);

  function initCalculators() {
    const calcMode = document.getElementById('calc-mode');
    const labelAmount = document.getElementById('label-amount');
    const inputAmount = document.getElementById('input-amount');
    const inputRimborsi = document.getElementById('input-rimborsi');

    const outLordo = document.getElementById('out-lordo');
    const outRitenuta = document.getElementById('out-ritenuta');
    const outRimborsi = document.getElementById('out-rimborsi');
    const outNetto = document.getElementById('out-netto');
    const boxBolloNotice = document.getElementById('box-bollo-notice');

    const inputPrestatoreCF = document.getElementById('prestatore-cf');
    const badgePrestatoreCF = document.getElementById('badge-prestatore-cf');

    const inputPrestatoreIBAN = document.getElementById('prestatore-iban');
    const badgePrestatoreIBAN = document.getElementById('badge-prestatore-iban');

    const inputClientPIVA = document.getElementById('client-piva');
    const badgeClientPIVA = document.getElementById('badge-client-piva');

    const btnGeneratePdf = document.getElementById('btn-generate-pdf');
    const docDate = document.getElementById('doc-date');

    if (!inputAmount || !btnGeneratePdf) return;

    if (docDate && !docDate.value) {
      docDate.value = new Date().toISOString().split('T')[0];
    }

    let currentCalculations = {
      lordo: 0,
      ritenuta: 0,
      rimborsi: 0,
      netto: 0,
      bolloDovuto: false
    };

    function calculate() {
      const mode = calcMode.value;
      const rawVal = parseFloat(inputAmount.value) || 0;
      const rimborsi = parseFloat(inputRimborsi.value) || 0;

      let lordo = 0;
      let ritenuta = 0;
      let netto = 0;

      if (mode === 'lordo_to_netto') {
        labelAmount.textContent = 'Compenso Lordo (€)';
        lordo = rawVal;
        ritenuta = lordo * 0.20;
        netto = (lordo - ritenuta) + rimborsi;
      } else {
        labelAmount.textContent = 'Netto Desiderato (€)';
        const nettoSenzaRimborsi = Math.max(0, rawVal - rimborsi);
        lordo = nettoSenzaRimborsi * 1.25;
        ritenuta = lordo * 0.20;
        netto = rawVal;
      }

      const bolloDovuto = lordo > 77.47;

      currentCalculations = { lordo, ritenuta, rimborsi, netto, bolloDovuto };

      outLordo.textContent = formatEuro(lordo);
      outRitenuta.textContent = `- ${formatEuro(ritenuta)}`;
      outRimborsi.textContent = formatEuro(rimborsi);
      outNetto.textContent = formatEuro(netto);

      if (bolloDovuto) {
        boxBolloNotice.classList.remove('hidden');
      } else {
        boxBolloNotice.classList.add('hidden');
      }
    }

    function formatEuro(val) {
      return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    }

    // ==========================================================
    // VALIDATORI IN TEMPO REALE (CF & IBAN)
    // ==========================================================
    function setBadgeStatus(badgeEl, inputEl, isValid, validText = '✓ Valido', invalidText = '⚠️ Non valido') {
      if (!badgeEl || !inputEl) return;
      
      const val = inputEl.value.trim();
      if (!val) {
        badgeEl.classList.add('hidden');
        inputEl.classList.remove('border-emerald-500', 'border-rose-500');
        return;
      }

      badgeEl.classList.remove('hidden');
      if (isValid) {
        badgeEl.textContent = validText;
        badgeEl.className = 'text-[11px] font-semibold text-emerald-600';
        inputEl.classList.remove('border-rose-500');
        inputEl.classList.add('border-emerald-500');
      } else {
        badgeEl.textContent = invalidText;
        badgeEl.className = 'text-[11px] font-semibold text-rose-600';
        inputEl.classList.remove('border-emerald-500');
        inputEl.classList.add('border-rose-500');
      }
    }

    // Validazione Codice Fiscale Prestatore (16 Caratteri)
    if (inputPrestatoreCF) {
      inputPrestatoreCF.addEventListener('input', () => {
        const val = inputPrestatoreCF.value.trim().toUpperCase();
        if (val.length === 16 && window.CodiceFiscale) {
          const res = window.CodiceFiscale.validateCodiceFiscale(val);
          setBadgeStatus(badgePrestatoreCF, inputPrestatoreCF, res.valid);
        } else if (val.length > 0) {
          setBadgeStatus(badgePrestatoreCF, inputPrestatoreCF, false, '✓ Valido', '⚠️ Formato 16 car.');
        } else {
          setBadgeStatus(badgePrestatoreCF, inputPrestatoreCF, false);
        }
      });
    }

    // Validazione CF / P.IVA Committente (16 Caratteri o 11 Cifre)
    if (inputClientPIVA) {
      inputClientPIVA.addEventListener('input', () => {
        const val = inputClientPIVA.value.trim().toUpperCase();
        if (!val) {
          setBadgeStatus(badgeClientPIVA, inputClientPIVA, false);
          return;
        }

        if (/^\d{11}$/.test(val)) {
          // Partita IVA 11 cifre
          setBadgeStatus(badgeClientPIVA, inputClientPIVA, true, '✓ P.IVA Valida');
        } else if (val.length === 16 && window.CodiceFiscale) {
          // Codice Fiscale 16 caratteri
          const res = window.CodiceFiscale.validateCodiceFiscale(val);
          setBadgeStatus(badgeClientPIVA, inputClientPIVA, res.valid, '✓ CF Valido');
        } else {
          setBadgeStatus(badgeClientPIVA, inputClientPIVA, false, '', '⚠️ CF (16) o P.IVA (11)');
        }
      });
    }

    // Validazione IBAN Prestatore (MOD 97)
    if (inputPrestatoreIBAN) {
      inputPrestatoreIBAN.addEventListener('input', () => {
        const raw = inputPrestatoreIBAN.value.trim();
        if (!raw) {
          setBadgeStatus(badgePrestatoreIBAN, inputPrestatoreIBAN, false);
          return;
        }

        if (window.IbanValidator) {
          const normalized = window.IbanValidator.normalizeIban(raw);
          const isValid = window.IbanValidator.ibanMod97Check(normalized);
          setBadgeStatus(badgePrestatoreIBAN, inputPrestatoreIBAN, isValid, '✓ IBAN Valido', '⚠️ IBAN Errato');
        }
      });
    }

    // Event Listeners
    calcMode.addEventListener('change', calculate);
    inputAmount.addEventListener('input', calculate);
    inputRimborsi.addEventListener('input', calculate);

    calculate();

    // ==========================================================
    // GENERATORE PDF CON PDF-LIB
    // ==========================================================
    btnGeneratePdf.addEventListener('click', async () => {
      if (typeof PDFLib === 'undefined') {
        alert('Libreria PDF-Lib non pronta. Riprova tra un secondo.');
        return;
      }

      btnGeneratePdf.disabled = true;
      btnGeneratePdf.textContent = '⏳ Generazione PDF...';

      try {
        const pdfDoc = await PDFLib.PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]);
        const { width, height } = page.getSize();

        const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

        const margin = 40;
        let y = height - margin;

        const clean = str => (str || '').replace(/[^\x00-\xFF]/g, '');

        const pNome = clean(document.getElementById('prestatore-nome').value) || '[Nome Prestatore]';
        const pCF = clean(document.getElementById('prestatore-cf').value).toUpperCase() || '[Codice Fiscale]';
        const pIndirizzo = clean(document.getElementById('prestatore-indirizzo').value) || '[Indirizzo Prestatore]';
        const pIBAN = clean(document.getElementById('prestatore-iban').value).toUpperCase();

        const cNome = clean(document.getElementById('client-nome').value) || '[Nome Committente]';
        const cPiva = clean(document.getElementById('client-piva').value).toUpperCase() || '[P.IVA / CF Committente]';
        const cIndirizzo = clean(document.getElementById('client-indirizzo').value) || '[Indirizzo Committente]';

        const docNum = clean(document.getElementById('doc-num').value) || '1/2026';
        const rawDate = document.getElementById('doc-date').value;
        const formattedDate = rawDate ? new Date(rawDate).toLocaleDateString('it-IT') : new Date().toLocaleDateString('it-IT');
        const docOggetto = clean(document.getElementById('doc-oggetto').value) || 'Prestazione d\'opera occasionale';
        const bolloID = clean(document.getElementById('bollo-id').value);

        // --- INTESTAZIONE ---
        page.drawText('RICEVUTA PER PRESTAZIONE OCCASIONALE', {
          x: margin, y, size: 14, font: fontBold, color: PDFLib.rgb(0.18, 0.18, 0.55)
        });
        
        page.drawText(`Ricevuta N°: ${docNum}`, { x: width - margin - 150, y, size: 10, font: fontBold });
        y -= 15;
        page.drawText(`Data: ${formattedDate}`, { x: width - margin - 150, y, size: 10, font: fontRegular });

        y -= 30;

        // --- BLOCCO EMITENTE E CLIENTE ---
        const colWidth = (width - (margin * 2) - 20) / 2;

        page.drawRectangle({
          x: margin, y: y - 70, width: colWidth, height: 75,
          color: PDFLib.rgb(0.97, 0.98, 1), borderColor: PDFLib.rgb(0.8, 0.85, 0.95), borderWidth: 1
        });
        page.drawText('PRESTATORE (Lavoratore):', { x: margin + 10, y: y - 12, size: 9, font: fontBold, color: PDFLib.rgb(0.2, 0.2, 0.6) });
        page.drawText(pNome, { x: margin + 10, y: y - 26, size: 10, font: fontBold });
        page.drawText(`C.F.: ${pCF}`, { x: margin + 10, y: y - 40, size: 9, font: fontRegular });
        page.drawText(pIndirizzo, { x: margin + 10, y: y - 54, size: 8, font: fontRegular });

        page.drawRectangle({
          x: margin + colWidth + 20, y: y - 70, width: colWidth, height: 75,
          color: PDFLib.rgb(0.98, 0.98, 0.98), borderColor: PDFLib.rgb(0.9, 0.9, 0.9), borderWidth: 1
        });
        page.drawText('COMMITTENTE (Cliente):', { x: margin + colWidth + 30, y: y - 12, size: 9, font: fontBold, color: PDFLib.rgb(0.3, 0.3, 0.3) });
        page.drawText(cNome, { x: margin + colWidth + 30, y: y - 26, size: 10, font: fontBold });
        page.drawText(`P.IVA/CF: ${cPiva}`, { x: margin + colWidth + 30, y: y - 40, size: 9, font: fontRegular });
        page.drawText(cIndirizzo, { x: margin + colWidth + 30, y: y - 54, size: 8, font: fontRegular });

        y -= 95;

        // --- OGGETTO PRESTAZIONE ---
        page.drawText('DESCRIZIONE DELLA PRESTAZIONE:', { x: margin, y, size: 9, font: fontBold });
        y -= 15;
        page.drawText(docOggetto, { x: margin, y, size: 9, font: fontRegular, maxWidth: width - (margin * 2) });

        y -= 35;

        // --- TABELLA CALCOLI FISCALI ---
        const tableY = y;
        page.drawRectangle({
          x: margin, y: tableY - 110, width: width - (margin * 2), height: 110,
          borderColor: PDFLib.rgb(0.85, 0.85, 0.85), borderWidth: 1
        });

        const drawRow = (label, valStr, currentY, isBold = false, isHighlight = false) => {
          if (isHighlight) {
            page.drawRectangle({
              x: margin + 1, y: currentY - 4, width: width - (margin * 2) - 2, height: 20,
              color: PDFLib.rgb(0.92, 0.97, 0.92)
            });
          }
          page.drawText(label, { x: margin + 15, y: currentY, size: 9, font: isBold ? fontBold : fontRegular });
          page.drawText(valStr, { x: width - margin - 120, y: currentY, size: 9, font: isBold ? fontBold : fontRegular });
        };

        let currY = tableY - 20;
        drawRow('Compenso Lordo pattuito', formatEuro(currentCalculations.lordo), currY);
        currY -= 22;
        drawRow('Ritenuta d\'Acconto 20% (A carico del Committente)', `- ${formatEuro(currentCalculations.ritenuta)}`, currY);
        currY -= 22;
        drawRow('Rimborsi Spese Documentati (Esenti Ritenuta)', formatEuro(currentCalculations.rimborsi), currY);
        currY -= 26;
        drawRow('NETTO A PAGARE', formatEuro(currentCalculations.netto), currY, true, true);

        y = tableY - 135;

        if (pIBAN) {
          page.drawText(`Modalita di pagamento: Bonifico Bancario su IBAN: ${pIBAN}`, {
            x: margin, y, size: 9, font: fontBold, color: PDFLib.rgb(0.2, 0.2, 0.2)
          });
          y -= 25;
        }

        if (currentCalculations.bolloDovuto) {
          page.drawRectangle({
            x: margin, y: y - 45, width: width - (margin * 2), height: 45,
            borderColor: PDFLib.rgb(0.9, 0.7, 0.2), borderWidth: 1, color: PDFLib.rgb(0.99, 0.98, 0.92)
          });

          const bolloText = bolloID 
            ? `Imposta di bollo di 2,00 Euro assolta sull'originale (ID Marca: ${bolloID}).`
            : "Imposta di bollo di 2,00 Euro assolta sull'originale con identificativo da applicare.";

          page.drawText('MARCA DA BOLLO (D.P.R. 642/1972):', { x: margin + 10, y: y - 15, size: 8, font: fontBold, color: PDFLib.rgb(0.6, 0.4, 0) });
          page.drawText(bolloText, { x: margin + 10, y: y - 32, size: 8, font: fontRegular });

          y -= 60;
        }

        y -= 10;
        const legalNotice = "Dichiaro che la presente prestazione ha carattere del tutto occasionale e non abituale, senza vincolo di subordinazione e senza organizzazione di mezzi, ai sensi dell'art. 67, comma 1, lett. l) del D.P.R. 917/1986 (T.U.I.R.). Operazione fuori campo IVA ai sensi dell'art. 5 del D.P.R. 633/1972.";
        
        page.drawText('DICHIARAZIONE FISCALE E LEGALE:', { x: margin, y, size: 8, font: fontBold, color: PDFLib.rgb(0.4, 0.4, 0.4) });
        y -= 12;
        page.drawText(legalNotice, { x: margin, y, size: 7.5, font: fontRegular, color: PDFLib.rgb(0.4, 0.4, 0.4), maxWidth: width - (margin * 2) });

        y -= 60;
        page.drawText('Firma del Prestatore', { x: width - margin - 180, y, size: 9, font: fontBold });
        page.drawLine({
          start: { x: width - margin - 180, y: y - 25 },
          end: { x: width - margin, y: y - 25 },
          thickness: 1, color: PDFLib.rgb(0.7, 0.7, 0.7)
        });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Ricevuta_Prestazione_Occasionale_${docNum.replace(/[\/\\]/g, '-')}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

      } catch (err) {
        console.error('PDF Generation Error:', err);
        alert('Errore nella generazione del PDF.');
      } finally {
        btnGeneratePdf.disabled = false;
        btnGeneratePdf.textContent = '📄 Scarica Ricevuta PDF';
      }
    });

  }
})();