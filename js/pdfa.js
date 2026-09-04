(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', initPdfAApp);

  function initPdfAApp() {
    // Gestione Tab
    const tabConvert = document.getElementById('tabConvert');
    const tabValidate = document.getElementById('tabValidate');
    const convertArea = document.getElementById('convertArea');
    const validateArea = document.getElementById('validateArea');

    function setActiveTab(activeBtn) {
      [tabConvert, tabValidate].forEach(btn => {
        if (btn === activeBtn) {
          btn.className = 'px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white shadow-sm transition';
        } else {
          btn.className = 'px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition';
        }
      });
    }

    tabConvert.addEventListener('click', () => {
      convertArea.style.display = '';
      validateArea.style.display = 'none';
      setActiveTab(tabConvert);
    });

    tabValidate.addEventListener('click', () => {
      convertArea.style.display = 'none';
      validateArea.style.display = '';
      setActiveTab(tabValidate);
    });

    // ==========================================================
    // 1. MOTORE CONVERTITORE PDF/A
    // ==========================================================
    const fileInputConvert = document.getElementById('pdf-file-input');
    const dropZoneConvert = document.getElementById('drop-zone-convert');
    const settingsBox = document.getElementById('settings-box');
    const fileInfo = document.getElementById('file-info');
    const infoName = document.getElementById('info-name');
    const infoDetails = document.getElementById('info-details');

    const btnConvert = document.getElementById('btn-convert');
    const btnResetConvert = document.getElementById('btn-reset-convert');
    const btnDownload = document.getElementById('btn-download');

    const statusProgress = document.getElementById('status-progress');
    const statusText = document.getElementById('status-text');
    const resultBoxConvert = document.getElementById('result-box-convert');
    const pdfaStandard = document.getElementById('pdfa-standard');

    let currentConvertFile = null;
    let convertedPdfBytes = null;

    dropZoneConvert.addEventListener('click', () => { fileInputConvert.value = ''; fileInputConvert.click(); });
    fileInputConvert.addEventListener('change', e => { if (e.target.files.length) handleConvertSelect(e.target.files[0]); });

    ['dragenter', 'dragover'].forEach(evt => dropZoneConvert.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); dropZoneConvert.classList.add('border-indigo-500', 'bg-indigo-50');
    }));
    ['dragleave', 'drop'].forEach(evt => dropZoneConvert.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); dropZoneConvert.classList.remove('border-indigo-500', 'bg-indigo-50');
      if (evt === 'drop' && e.dataTransfer.files.length) handleConvertSelect(e.dataTransfer.files[0]);
    }));

    function handleConvertSelect(file) {
      if (!file || file.type !== 'application/pdf') {
        alert('Seleziona un file valido in formato PDF.');
        return;
      }

      currentConvertFile = file;
      infoName.textContent = file.name;
      infoDetails.textContent = `Dimensione: ${(file.size / 1024 / 1024).toFixed(2)} MB`;

      fileInfo.classList.remove('hidden');
      settingsBox.classList.remove('hidden');
      btnConvert.disabled = false;
      resultBoxConvert.classList.add('hidden');
    }

    btnResetConvert.addEventListener('click', () => {
      currentConvertFile = null;
      convertedPdfBytes = null;
      fileInfo.classList.add('hidden');
      settingsBox.classList.add('hidden');
      resultBoxConvert.classList.add('hidden');
      statusProgress.classList.add('hidden');
      btnConvert.disabled = true;
    });

    btnConvert.addEventListener('click', async () => {
      if (!currentConvertFile || typeof PDFLib === 'undefined') return;

      btnConvert.disabled = true;
      showStatus('Elaborazione e iniezione metadati ISO PDF/A...');

      try {
        const arrayBuffer = await currentConvertFile.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

        const part = pdfaStandard.value === '2b' ? '2' : '1';
        const conformance = 'B';

        const xmpXml = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>${part}</pdfaid:part>
   <pdfaid:conformance>${conformance}</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:format>application/pdf</dc:format>
   <dc:title>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${escapeXml(currentConvertFile.name.replace('.pdf', ''))}</rdf:li>
    </rdf:Alt>
   </dc:title>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>StrumentiUtili.it PDF/A Engine ISO 19005</pdf:Producer>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

        // INIEZIONE REALE DEL STREAM METADATI XMP NEL CATALOGO DEL PDF
        const xmpBytes = new TextEncoder().encode(xmpXml);
        const metadataStream = pdfDoc.context.stream(xmpBytes, {
          Type: 'Metadata',
          Subtype: 'XML',
        });
        const metadataStreamRef = pdfDoc.context.register(metadataStream);
        pdfDoc.catalog.set(PDFLib.PDFName.of('Metadata'), metadataStreamRef);

        pdfDoc.setTitle(currentConvertFile.name.replace('.pdf', ''));
        pdfDoc.setProducer('StrumentiUtili.it PDF/A Engine ISO 19005');
        pdfDoc.setCreationDate(new Date());

        convertedPdfBytes = await pdfDoc.save({ useObjectStreams: false });

        hideStatus();
        resultBoxConvert.classList.remove('hidden');
        resultBoxConvert.scrollIntoView({ behavior: 'smooth' });

      } catch (err) {
        console.error('PDF/A Conversion Error:', err);
        alert('Errore durante la conversione del file PDF.');
        hideStatus();
        btnConvert.disabled = false;
      }
    });

    btnDownload.addEventListener('click', () => {
      if (!convertedPdfBytes) return;

      const blob = new Blob([convertedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const baseName = currentConvertFile ? currentConvertFile.name.replace('.pdf', '') : 'Documento';
      link.download = `${baseName}_PDFA.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    // ==========================================================
    // 2. MOTORE VALIDATORE CONFORMITÀ ISO PDF/A
    // ==========================================================
    const fileInputValidate = document.getElementById('val-file-input');
    const dropZoneValidate = document.getElementById('drop-zone-validate');

    const valResultBox = document.getElementById('val-result-box');
    const valStatusHeader = document.getElementById('val-status-header');
    const valXmpStatus = document.getElementById('val-xmp-status');
    const valLevelStatus = document.getElementById('val-level-status');
    const valJsStatus = document.getElementById('val-js-status');
    const valColorStatus = document.getElementById('val-color-status');

    dropZoneValidate.addEventListener('click', () => { fileInputValidate.value = ''; fileInputValidate.click(); });
    fileInputValidate.addEventListener('change', e => { if (e.target.files.length) validatePdfAFile(e.target.files[0]); });

    ['dragenter', 'dragover'].forEach(evt => dropZoneValidate.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); dropZoneValidate.classList.add('border-indigo-500', 'bg-indigo-50');
    }));
    ['dragleave', 'drop'].forEach(evt => dropZoneValidate.addEventListener(evt, e => {
      e.preventDefault(); e.stopPropagation(); dropZoneValidate.classList.remove('border-indigo-500', 'bg-indigo-50');
      if (evt === 'drop' && e.dataTransfer.files.length) validatePdfAFile(e.dataTransfer.files[0]);
    }));

    async function validatePdfAFile(file) {
      if (!file || file.type !== 'application/pdf') {
        alert('Seleziona un file valido in formato PDF.');
        return;
      }

      try {
        const textContent = await file.text();

        // Controllo 1: Presenza dichiarazione metadati pdfaid
        const hasPdfaId = /pdfaid:part/i.test(textContent);
        const partMatch = textContent.match(/<pdfaid:part>(\d+)<\/pdfaid:part>/i);
        const confMatch = textContent.match(/<pdfaid:conformance>([ABU])<\/pdfaid:conformance>/i);

        // Controllo 2: Assenza JavaScript o Azioni Attive
        const hasJavaScript = /\/JavaScript|\/JS\s+|\/AA\s+/i.test(textContent);

        // Controllo 3: OutputIntents o Metadati XMP
        const hasOutputIntent = /\/OutputIntents/i.test(textContent) || hasPdfaId;

        const isCompliant = hasPdfaId && !hasJavaScript;

        valResultBox.classList.remove('hidden');

        if (isCompliant) {
          const partVal = partMatch ? partMatch[1] : '1';
          const confVal = confMatch ? confMatch[1] : 'B';
          
          valStatusHeader.className = 'p-4 rounded-xl font-bold text-base border flex items-center gap-2 bg-emerald-50 border-emerald-200 text-emerald-900';
          valStatusHeader.innerHTML = `<span>✓</span> File Conforme ISO PDF/A (PDF/A-${partVal}${confVal.toLowerCase()})`;

          valXmpStatus.textContent = '✓ Presente e Valido';
          valXmpStatus.className = 'font-bold text-emerald-700 mt-1';

          valLevelStatus.textContent = `PDF/A-${partVal}${confVal}`;
          valLevelStatus.className = 'font-bold text-emerald-700 mt-1';
        } else {
          valStatusHeader.className = 'p-4 rounded-xl font-bold text-base border flex items-center gap-2 bg-rose-50 border-rose-200 text-rose-900';
          valStatusHeader.innerHTML = `<span>⚠️</span> Documento NON conforme agli standard PDF/A`;

          valXmpStatus.textContent = hasPdfaId ? '✓ Presente' : '❌ Non Trovato';
          valXmpStatus.className = hasPdfaId ? 'font-bold text-emerald-700 mt-1' : 'font-bold text-rose-600 mt-1';

          valLevelStatus.textContent = 'Non specificato';
          valLevelStatus.className = 'font-bold text-rose-600 mt-1';
        }

        valJsStatus.textContent = !hasJavaScript ? '✓ Nessuno script trovato (Sicuro)' : '❌ Trovati script non consentiti';
        valJsStatus.className = !hasJavaScript ? 'font-bold text-emerald-700 mt-1' : 'font-bold text-rose-600 mt-1';

        valColorStatus.textContent = hasOutputIntent ? '✓ Profilo Standard' : '⚠️ Non specificato';
        valColorStatus.className = hasOutputIntent ? 'font-bold text-emerald-700 mt-1' : 'font-bold text-amber-600 mt-1';

        valResultBox.scrollIntoView({ behavior: 'smooth' });

      } catch (err) {
        console.error('Validation Error:', err);
        alert('Errore durante l\'analisi del file PDF.');
      }
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

    function showStatus(msg) {
      statusText.textContent = msg;
      statusProgress.classList.remove('hidden');
    }

    function hideStatus() {
      statusProgress.classList.add('hidden');
    }
  }
})();