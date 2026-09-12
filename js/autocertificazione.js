// js/autocertificazione.js — Generatore di Dichiarazione Sostitutiva di Certificazione
// (Art. 46 D.P.R. 445/2000), 100% client-side con pdf-lib. Nessun dato lascia il browser.
(function () {
  const form = document.getElementById('autocert-form');
  const previewEl = document.getElementById('ac-preview');
  const generateBtn = document.getElementById('ac-genera');
  const msgEl = document.getElementById('ac-msg');

  const fields = {
    nome: document.getElementById('ac-nome'),
    cognome: document.getElementById('ac-cognome'),
    luogoNascita: document.getElementById('ac-luogo-nascita'),
    dataNascita: document.getElementById('ac-data-nascita'),
    codiceFiscale: document.getElementById('ac-cf'),
    residenza: document.getElementById('ac-residenza'),
    destinatario: document.getElementById('ac-destinatario'),
    testo: document.getElementById('ac-testo'),
    luogoCompilazione: document.getElementById('ac-luogo-compilazione'),
    dataCompilazione: document.getElementById('ac-data-compilazione'),
    allegaCf: document.getElementById('ac-allega-cf')
  };

  function safeText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function formatDateIt(isoDate) {
    if (!isoDate) return '________________';
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return safeText(isoDate);
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }

  function todayIso() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function buildDeclarationText() {
    const nome = safeText(fields.nome && fields.nome.value);
    const cognome = safeText(fields.cognome && fields.cognome.value);
    const luogoNascita = safeText(fields.luogoNascita && fields.luogoNascita.value) || '________________';
    const dataNascita = formatDateIt(fields.dataNascita && fields.dataNascita.value);
    const cf = safeText(fields.codiceFiscale && fields.codiceFiscale.value).toUpperCase();
    const residenza = safeText(fields.residenza && fields.residenza.value) || '________________';
    const destinatario = safeText(fields.destinatario && fields.destinatario.value);
    const testoDichiarazione = safeText(fields.testo && fields.testo.value) || '________________________________________________';
    const luogoCompilazione = safeText(fields.luogoCompilazione && fields.luogoCompilazione.value) || '________________';
    const dataCompilazione = formatDateIt((fields.dataCompilazione && fields.dataCompilazione.value) || todayIso());
    const allegaCf = !!(fields.allegaCf && fields.allegaCf.checked);

    const nomeCompleto = safeText(`${nome} ${cognome}`) || '________________';
    const cfLine = cf ? `\nCodice Fiscale: ${cf}` : '';
    const destinatarioLine = destinatario ? `Spett.le ${destinatario}\n\n` : '';

    const lines = [];
    lines.push(destinatarioLine + 'DICHIARAZIONE SOSTITUTIVA DI CERTIFICAZIONE');
    lines.push('(Art. 46 D.P.R. 28 dicembre 2000, n. 445)');
    lines.push('');
    lines.push(
      `Il/La sottoscritto/a ${nomeCompleto}, nato/a a ${luogoNascita} il ${dataNascita}, `
      + `residente in ${residenza}${cfLine ? ',' : ''}${cfLine}`
    );
    lines.push('');
    lines.push(
      'consapevole delle sanzioni penali previste dall\'art. 76 del D.P.R. 445/2000 nel caso di dichiarazioni non veritiere, '
      + 'di formazione o uso di atti falsi, e della decadenza dai benefici eventualmente conseguenti al provvedimento emanato '
      + 'sulla base di una dichiarazione non veritiera, ai sensi dell\'art. 75 del medesimo decreto,'
    );
    lines.push('');
    lines.push('DICHIARA');
    lines.push('');
    lines.push(testoDichiarazione);
    lines.push('');
    lines.push(
      'Il/La sottoscritto/a dichiara inoltre di essere informato/a, ai sensi del Regolamento UE 2016/679 (GDPR), che i dati '
      + 'personali raccolti saranno trattati, anche con strumenti informatici, esclusivamente nell\'ambito del procedimento per '
      + 'il quale la presente dichiarazione viene resa.'
    );

    if (allegaCf) {
      lines.push('');
      lines.push(
        'Ai sensi dell\'art. 38 del D.P.R. 445/2000, si allega copia fotostatica non autenticata di un documento di identità in corso di validità.'
      );
    }

    lines.push('');
    lines.push(`${luogoCompilazione}, ${dataCompilazione}`);
    lines.push('');
    lines.push('Il/La Dichiarante');
    lines.push('_____________________________');

    return lines.join('\n');
  }

  function updatePreview() {
    if (!previewEl) return;
    previewEl.textContent = buildDeclarationText();
  }

  function showMessage(text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.classList.remove('hidden');
    msgEl.className = isError
      ? 'mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800'
      : 'mt-3 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800';
  }

  // Suddivide il testo in righe che rispettano la larghezza massima disponibile nella pagina PDF.
  function wrapTextToLines(text, font, size, maxWidth) {
    const paragraphs = String(text || '').split('\n');
    const lines = [];

    paragraphs.forEach((paragraph) => {
      if (!paragraph) {
        lines.push('');
        return;
      }
      const words = paragraph.split(' ');
      let current = '';
      words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        const width = font.widthOfTextAtSize(candidate, size);
        if (width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });
      lines.push(current);
    });

    return lines;
  }

  async function generatePdf() {
    if (!window.PDFLib) {
      throw new Error('Libreria pdf-lib non disponibile: verifica la connessione al primo utilizzo.');
    }

    const nome = safeText(fields.nome && fields.nome.value);
    const cognome = safeText(fields.cognome && fields.cognome.value);
    const luogoNascita = safeText(fields.luogoNascita && fields.luogoNascita.value);
    const dataNascita = safeText(fields.dataNascita && fields.dataNascita.value);
    const residenza = safeText(fields.residenza && fields.residenza.value);
    const testoDichiarazione = safeText(fields.testo && fields.testo.value);

    if (!nome || !cognome || !luogoNascita || !dataNascita || !residenza || !testoDichiarazione) {
      throw new Error('Compila tutti i campi obbligatori (contrassegnati con *) prima di generare il PDF.');
    }

    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 56;
    const maxWidth = pageWidth - margin * 2;
    const bodySize = 11;
    const lineHeight = 16;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    function ensureSpace(neededHeight) {
      if (y - neededHeight < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    }

    function drawParagraph(text, options) {
      const opts = options || {};
      const useFont = opts.bold ? fontBold : font;
      const size = opts.size || bodySize;
      const gapAfter = opts.gapAfter != null ? opts.gapAfter : lineHeight * 0.6;
      const align = opts.align || 'left';

      const lines = wrapTextToLines(text, useFont, size, maxWidth);
      lines.forEach((line) => {
        ensureSpace(lineHeight);
        let x = margin;
        if (align === 'center') {
          const width = useFont.widthOfTextAtSize(line, size);
          x = margin + Math.max(0, (maxWidth - width) / 2);
        }
        page.drawText(line, { x, y, size, font: useFont, color: rgb(0.1, 0.1, 0.1) });
        y -= lineHeight;
      });
      y -= gapAfter;
    }

    const declarationText = buildDeclarationText();
    const blocks = declarationText.split('\n\n');

    blocks.forEach((block, index) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      const isTitle = index === 0;
      const isHeadingLine = /^\(Art\. 46/.test(trimmed);
      const isDichiaraHeading = trimmed === 'DICHIARA';

      if (isTitle) {
        drawParagraph(trimmed, { bold: true, size: 14, align: 'center', gapAfter: 4 });
      } else if (isHeadingLine) {
        drawParagraph(trimmed, { size: 10, align: 'center', gapAfter: 16 });
      } else if (isDichiaraHeading) {
        drawParagraph(trimmed, { bold: true, size: 12, align: 'center', gapAfter: 10 });
      } else {
        drawParagraph(trimmed, {});
      }
    });

    const bytes = await pdfDoc.save();
    return bytes;
  }

  function triggerDownload(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (form) {
    Object.values(fields).forEach((field) => {
      if (!field) return;
      const evt = field.type === 'checkbox' ? 'change' : 'input';
      field.addEventListener(evt, updatePreview);
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      generateBtn.disabled = true;
      const originalLabel = generateBtn.textContent;
      generateBtn.textContent = 'Generazione PDF in corso...';
      try {
        const bytes = await generatePdf();
        const cognome = safeText(fields.cognome && fields.cognome.value).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const filename = `autocertificazione${cognome ? '-' + cognome : ''}.pdf`;
        triggerDownload(bytes, filename);
        showMessage('PDF generato e scaricato correttamente. Ricorda di stampare, firmare e allegare un documento d\'identità se richiesto.', false);
      } catch (err) {
        console.error('Autocertificazione PDF error:', err);
        const message = window.StrumentiErrors
          ? window.StrumentiErrors.friendlyErrorMessage(err, 'Impossibile generare il PDF.')
          : (err && err.message ? err.message : 'Impossibile generare il PDF.');
        showMessage(message, true);
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = originalLabel;
      }
    });
  }

  updatePreview();
})();
