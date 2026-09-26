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
      showStatus('Ricostruzione delle pagine in formato PDF/A...');

      try {
        // Aggiungere solo la dichiarazione XMP «pdfaid» a un PDF qualsiasi produce un file che si dichiara PDF/A
        // ma non lo è (font non incorporati, nessun OutputIntent, nessun ID). Il documento viene quindi ricostruito:
        // ogni pagina diventa un'immagine JPEG con un livello di testo invisibile, in un file con profilo sRGB,
        // metadati XMP coerenti con il dizionario Info e identificativo nel trailer.
        const arrayBuffer = await currentConvertFile.arrayBuffer();
        convertedPdfBytes = await costruisciPdfA(arrayBuffer, pdfaStandard.value === '2b' ? '2' : '1', currentConvertFile.name.replace(/\.pdf$/i, ''));

        hideStatus();
        resultBoxConvert.classList.remove('hidden');
        resultBoxConvert.scrollIntoView({ behavior: 'smooth' });

      } catch (err) {
        console.error('PDF/A Conversion Error:', err);
        alert(err && err.name === 'PasswordException'
          ? 'Il PDF è protetto da password: PDF/A vieta la cifratura. Rimuovi la protezione con il programma che lo ha creato e riprova.'
          : 'Errore durante la conversione del file PDF: ' + (err && err.message ? err.message : 'file non leggibile.'));
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
    const valFontStatus = document.getElementById('val-font-status');
    const valCryptStatus = document.getElementById('val-crypt-status');

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
        // Controllo preliminare sugli oggetti del PDF già decodificati (anche flussi compressi e object stream):
        // non sostituisce un validatore ISO completo come veraPDF, che applica centinaia di regole.
        const L = window.PDFLib;
        const bytes = new Uint8Array(await file.arrayBuffer());
        let doc;
        try {
          doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
        } catch (e) {
          alert('Il file non è un PDF leggibile: struttura danneggiata o non valida.');
          return;
        }
        const esito = analizzaStrutturaPdfA(doc, L);

        valResultBox.classList.remove('hidden');
        const verde = 'font-bold text-emerald-700 mt-1';
        const rosso = 'font-bold text-rose-600 mt-1';
        const giallo = 'font-bold text-amber-600 mt-1';
        const livello = esito.parte ? `PDF/A-${esito.parte}${(esito.conformita || '?').toLowerCase()}` : '';

        valXmpStatus.textContent = esito.parte ? '✓ Dichiarazione pdfaid presente' : (esito.haXmp ? '❌ XMP presente ma senza pdfaid' : '❌ Metadati XMP assenti');
        valXmpStatus.className = esito.parte ? verde : rosso;
        valLevelStatus.textContent = esito.parte ? livello : 'Nessuno';
        valLevelStatus.className = esito.parte ? verde : rosso;
        valJsStatus.textContent = esito.script ? `❌ Trovate ${esito.script} azioni o script` : '✓ Nessuno script o azione automatica';
        valJsStatus.className = esito.script ? rosso : verde;
        valColorStatus.textContent = esito.outputIntent ? '✓ Profilo ICC incorporato' : '⚠️ Assente (obbligatorio se il file usa colori RGB/CMYK del dispositivo)';
        valColorStatus.className = esito.outputIntent ? verde : giallo;
        valFontStatus.textContent = esito.fontNonIncorporati.length ? `❌ Non incorporati: ${esito.fontNonIncorporati.slice(0, 4).join(', ')}` : '✓ Tutti incorporati (o usati solo per testo invisibile)';
        valFontStatus.className = esito.fontNonIncorporati.length ? rosso : verde;
        valCryptStatus.textContent = esito.cifrato ? '❌ File cifrato (vietato in PDF/A)' : '✓ Nessuna cifratura';
        valCryptStatus.className = esito.cifrato ? rosso : verde;

        const violazioni = (esito.script ? 1 : 0) + (esito.cifrato ? 1 : 0) + (esito.fontNonIncorporati.length ? 1 : 0);
        if (!esito.parte) {
          valStatusHeader.className = 'p-4 rounded-xl font-bold text-base border flex items-center gap-2 bg-rose-50 border-rose-200 text-rose-900';
          valStatusHeader.innerHTML = '<span>❌</span> Il file non si dichiara PDF/A: i portali che richiedono PDF/A lo rifiuteranno';
        } else if (violazioni) {
          valStatusHeader.className = 'p-4 rounded-xl font-bold text-base border flex items-center gap-2 bg-rose-50 border-rose-200 text-rose-900';
          valStatusHeader.innerHTML = `<span>❌</span> Si dichiara ${livello} ma viola ${violazioni === 1 ? 'un requisito' : violazioni + ' requisiti'} dello standard`;
        } else if (!esito.outputIntent) {
          valStatusHeader.className = 'p-4 rounded-xl font-bold text-base border flex items-center gap-2 bg-amber-50 border-amber-200 text-amber-900';
          valStatusHeader.innerHTML = `<span>⚠️</span> Dichiarazione ${livello} presente, ma senza profilo colore: verifica con veraPDF`;
        } else {
          valStatusHeader.className = 'p-4 rounded-xl font-bold text-base border flex items-center gap-2 bg-emerald-50 border-emerald-200 text-emerald-900';
          valStatusHeader.innerHTML = `<span>✓</span> Dichiarazione ${livello} presente e nessun problema nei controlli di base`;
        }

        valResultBox.scrollIntoView({ behavior: 'smooth' });

      } catch (err) {
        console.error('Validation Error:', err);
        alert('Errore durante l\'analisi del file PDF.');
      }
    }

    function analizzaStrutturaPdfA(doc, L) {
      const N = (s) => L.PDFName.of(s);
      const dizionarioDi = (obj) => (obj instanceof L.PDFDict ? obj : (obj && obj.dict instanceof L.PDFDict ? obj.dict : null));
      const testoFlusso = (stream) => {
        try {
          const dati = stream instanceof L.PDFRawStream ? L.decodePDFRawStream(stream).decode() : stream.getContents();
          return new TextDecoder('latin1').decode(dati);
        } catch (e) { return ''; }
      };
      const esito = { parte: null, conformita: null, haXmp: false, script: 0, outputIntent: false, fontNonIncorporati: [], cifrato: !!doc.context.trailerInfo.Encrypt };

      // Metadati XMP del catalogo: la dichiarazione può essere in forma di elemento o di attributo
      const metadati = doc.catalog.lookup(N('Metadata'));
      if (metadati) {
        esito.haXmp = true;
        const xmp = testoFlusso(metadati);
        const parte = xmp.match(/pdfaid:part(?:>\s*|\s*=\s*["'])(\d)/);
        const conf = xmp.match(/pdfaid:conformance(?:>\s*|\s*=\s*["'])([ABUabu])/);
        if (parte) { esito.parte = parte[1]; esito.conformita = conf ? conf[1].toUpperCase() : null; }
      }

      const intenti = doc.catalog.lookup(N('OutputIntents'));
      if (intenti instanceof L.PDFArray) {
        for (let i = 0; i < intenti.size(); i++) {
          const intento = intenti.lookup(i);
          if (intento instanceof L.PDFDict && intento.get(N('DestOutputProfile'))) esito.outputIntent = true;
        }
      }

      // Script e azioni (JavaScript, azioni automatiche AA, Launch) e font privi del file incorporato
      const fontEsterni = new Map();
      for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
        const d = dizionarioDi(obj);
        if (!d) continue;
        const tipoAzione = d.get(N('S'));
        if (d.has(N('JS')) || d.has(N('AA')) || tipoAzione === N('JavaScript') || tipoAzione === N('Launch')) esito.script++;
        if (d.get(N('Type')) === N('Font')) {
          const sottotipo = d.get(N('Subtype'));
          if (sottotipo === N('Type3') || sottotipo === N('Type0')) continue;
          const descrittore = d.lookup(N('FontDescriptor'));
          const incorporato = descrittore instanceof L.PDFDict && (descrittore.has(N('FontFile')) || descrittore.has(N('FontFile2')) || descrittore.has(N('FontFile3')));
          if (!incorporato) {
            const nome = d.get(N('BaseFont'));
            fontEsterni.set(ref.toString(), nome ? nome.decodeText() : 'senza nome');
          }
        }
      }
      const nomi = doc.catalog.lookup(N('Names'));
      if (nomi instanceof L.PDFDict && nomi.has(N('JavaScript'))) esito.script++;

      // Un font non incorporato è ammesso solo se usato con modalità di rendering 3 (testo invisibile)
      if (fontEsterni.size) {
        const usoVisibile = new Set();
        const usoInvisibile = new Set();
        const nelleRisorse = new Set();
        for (const pagina of doc.getPages()) {
          const risorse = pagina.node.Resources();
          const fontPagina = risorse && risorse.lookup(N('Font'));
          if (!(fontPagina instanceof L.PDFDict)) continue;
          const perNome = new Map();
          for (const [nome, valore] of fontPagina.entries()) {
            if (valore instanceof L.PDFRef) { perNome.set(nome.asString(), valore.toString()); nelleRisorse.add(valore.toString()); }
          }
          const contenuti = pagina.node.Contents();
          const flussi = contenuti instanceof L.PDFArray ? contenuti.asArray().map(r => doc.context.lookup(r)) : [contenuti];
          const operatori = flussi.filter(Boolean).map(testoFlusso).join('\n');
          let modo = '0';
          let corrente = null;
          const re = /(\/[^\s\/\[\]()<>{}%]+)\s+[-+\d.]+\s+Tf|(\d)\s+Tr\b|(?:Tj|TJ|'|")(?=\s|$)/g;
          let m;
          while ((m = re.exec(operatori))) {
            if (m[1]) corrente = perNome.get(m[1]) || null;
            else if (m[2]) modo = m[2];
            else if (corrente) (modo === '3' ? usoInvisibile : usoVisibile).add(corrente);
          }
        }
        // Un font mai richiamato dalle pagine non rende il file non conforme; se è fra le risorse
        // ma non compare fra le operazioni di disegno analizzate, viene segnalato per prudenza.
        for (const [ref, nome] of fontEsterni) {
          if (!nelleRisorse.has(ref)) continue;
          if (usoVisibile.has(ref) || !usoInvisibile.has(ref)) esito.fontNonIncorporati.push(nome);
        }
      }
      return esito;
    }

    // Profilo ICC sRGB v2 «sRGB-v2-micro» (Compact-ICC-Profiles, licenza CC0): PDF/A-1 richiede profili ICC versione 2
    const SRGB_ICC_B64 = 'AAAByGxjbXMCEAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5knZEAPUCAsD1AdCyBnqUijgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJZGVzYwAAAPAAAABfY3BydAAAAQwAAAAMd3RwdAAAARgAAAAUclhZWgAAASwAAAAUZ1hZWgAAAUAAAAAUYlhZWgAAAVQAAAAUclRSQwAAAWgAAABgZ1RSQwAAAWgAAABgYlRSQwAAAWgAAABgZGVzYwAAAAAAAAAFdVJHQgAAAAAAAAAAAAAAAHRleHQAAAAAQ0MwAFhZWiAAAAAAAADzVAABAAAAARbJWFlaIAAAAAAAAG+gAAA48gAAA49YWVogAAAAAAAAYpYAALeJAAAY2lhZWiAAAAAAAAAkoAAAD4UAALbEY3VydgAAAAAAAAAqAAAAfAD4AZwCdQODBMkGTggSChgMYg70Ec8U9hhqHC4gQySsKWoufjPrObM/1kZXTTZUdlwXZB1shnVWfo2ILJI2nKunjLLbvpnKx9dl5Hfx+f//';

    function caricaPdfJs() {
      if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
      return new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = '/vendor/pdfjs@3.11.174/pdf.min.js';
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs@3.11.174/pdf.worker.min.js';
          ok(window.pdfjsLib);
        };
        s.onerror = () => ko(new Error('Impossibile caricare il motore di rendering PDF: verifica la connessione.'));
        document.head.appendChild(s);
      });
    }

    function base64InByte(b64) {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }

    // Helvetica standard usa WinAnsi: i caratteri non codificabili diventano la lettera base o vengono omessi
    const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
    function testoWinAnsi(s) {
      const ok = (ch) => { const c = ch.charCodeAt(0); return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.indexOf(ch) !== -1; };
      return Array.from(String(s || '')).map(ch => ok(ch) ? ch : (ok(ch.normalize('NFD').charAt(0)) ? ch.normalize('NFD').charAt(0) : '')).join('');
    }

    async function costruisciPdfA(bytesOriginali, parte, titolo) {
      const pdfjs = await caricaPdfJs();
      const L = window.PDFLib;
      const sorgente = await pdfjs.getDocument({ data: new Uint8Array(bytesOriginali), isEvalSupported: false }).promise;
      const out = await L.PDFDocument.create({ updateMetadata: false });
      const RISOLUZIONE = 150 / 72;
      // Il font serve solo al livello di testo invisibile: un documento di sole immagini non deve contenerlo
      let font = null;

      for (let n = 1; n <= sorgente.numPages; n++) {
        showStatus(`Ricostruzione della pagina ${n} di ${sorgente.numPages}...`);
        const pagina = await sorgente.getPage(n);
        const vp1 = pagina.getViewport({ scale: 1 });
        const vp = pagina.getViewport({ scale: RISOLUZIONE });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
        const jpg = await new Promise((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error('Rendering non riuscito'))), 'image/jpeg', 0.85));
        const immagine = await out.embedJpg(await jpg.arrayBuffer());
        canvas.width = 0;

        const nuova = out.addPage([vp1.width, vp1.height]);
        nuova.drawImage(immagine, { x: 0, y: 0, width: vp1.width, height: vp1.height });

        // Livello di testo invisibile (modalità di rendering 3): il PDF resta ricercabile e copiabile.
        // In PDF/A i font usati solo con la modalità 3 non devono essere incorporati.
        if (!pagina.rotate) {
          const contenuto = await pagina.getTextContent();
          const voci = contenuto.items.map(v => ({ testo: testoWinAnsi(v.str), transform: v.transform })).filter(v => v.testo.trim());
          if (!voci.length) continue;
          if (!font) font = await out.embedFont(L.StandardFonts.Helvetica);
          const [x0, y0] = pagina.view;
          const nomeFont = nuova.node.newFontDictionary(font.name, font.ref);
          const operatori = [L.beginText(), L.setTextRenderingMode(L.TextRenderingMode.Invisible)];
          for (const voce of voci) {
            const testo = voce.testo;
            const [a, b, c, d, e, f] = voce.transform;
            const dimensione = Math.hypot(a, b) || 1;
            operatori.push(
              L.setFontAndSize(nomeFont, dimensione),
              L.setTextMatrix(a / dimensione, b / dimensione, c / dimensione, d / dimensione, e - x0, f - y0),
              L.showText(font.encodeText(testo))
            );
          }
          operatori.push(L.endText());
          nuova.pushOperators(...operatori);
        }
      }

      // OutputIntent sRGB: obbligatorio perché le immagini usano lo spazio colore DeviceRGB
      const icc = out.context.stream(base64InByte(SRGB_ICC_B64), { N: 3 });
      const intento = out.context.obj({
        Type: 'OutputIntent',
        S: 'GTS_PDFA1',
        OutputConditionIdentifier: L.PDFString.of('sRGB IEC61966-2.1'),
        Info: L.PDFString.of('sRGB IEC61966-2.1'),
        DestOutputProfile: out.context.register(icc)
      });
      out.catalog.set(L.PDFName.of('OutputIntents'), out.context.obj([out.context.register(intento)]));

      // Metadati: ogni voce del dizionario Info deve avere il corrispondente XMP con lo stesso valore
      const adesso = new Date();
      adesso.setMilliseconds(0);
      const produttore = 'StrumentiUtili.it PDF/A';
      out.setTitle(titolo);
      out.setProducer(produttore);
      out.setCreator(produttore);
      out.setCreationDate(adesso);
      out.setModificationDate(adesso);
      const dataXmp = adesso.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>${parte}</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(titolo)}</rdf:li></rdf:Alt></dc:title>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>${produttore}</xmp:CreatorTool>
   <xmp:CreateDate>${dataXmp}</xmp:CreateDate>
   <xmp:ModifyDate>${dataXmp}</xmp:ModifyDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>${produttore}</pdf:Producer>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
      // Flusso dei metadati non compresso, come richiesto da PDF/A-1
      const metadati = out.context.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' });
      out.catalog.set(L.PDFName.of('Metadata'), out.context.register(metadati));

      // Identificativo del file nel trailer
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x => x.toString(16).padStart(2, '0')).join('');
      out.context.trailerInfo.ID = out.context.obj([L.PDFHexString.of(id), L.PDFHexString.of(id)]);

      showStatus('Salvataggio del file PDF/A...');
      return out.save({ useObjectStreams: false });
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