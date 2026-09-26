// js/fototessera.js — Fototessera ICAO, con il riconoscimento del viso in un Web Worker
(() => {
  'use strict';

  // Il modulo Comlink si scarica dalla rete: fino a quel momento la pagina è già a video
  // e la persona può aver scelto una foto. Il campo viene quindi ascoltato subito e il file
  // messo da parte, per non perdere la selezione su connessioni lente.
  let fileInAttesa = null;
  let appPronta = false;
  document.addEventListener('DOMContentLoaded', () => {
    const campo = document.getElementById('photo-input');
    if (campo) {
      campo.addEventListener('change', e => {
        if (!appPronta && e.target.files.length) fileInAttesa = e.target.files[0];
      });
    }
    initFototesseraApp();
  });

  async function initFototesseraApp() {
    const Comlink = await import('/vendor/comlink@4.4.2/comlink.mjs');
    const worker = new Worker('/js/workers/face-worker.js');
    const faceWorker = Comlink.wrap(worker);

    const photoInput = document.getElementById('photo-input');
    const editorContainer = document.getElementById('editor-container');
    const canvas = document.getElementById('photo-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    const zoomSlider = document.getElementById('zoom-slider');
    const rotateSlider = document.getElementById('rotate-slider');
    const zoomValText = document.getElementById('zoom-val');
    const rotateValText = document.getElementById('rotate-val');
    const btnRotate = document.getElementById('btn-rotate');

    const aiSpinner = document.getElementById('ai-spinner');
    const aiStatusText = document.getElementById('ai-status-text');

    const btnDownloadSingle = document.getElementById('btn-download-single');
    const btnDownloadPdfGrid = document.getElementById('btn-download-pdf-grid');
    const pdfLayoutSelect = document.getElementById('pdf-layout-select');

    if (!canvas || !btnDownloadSingle) return;

    let originalImage = null;
    let currentRotation = 0;

    // --- Geometria della fototessera ------------------------------------------
    // Tela 413x531 px = 35x45 mm a 300 DPI (11,8 px/mm).
    //
    // Requisiti (Polizia di Stato, "Qualità delle fotografie": il viso deve occupare
    // il 70-80% della foto; ICAO 9303: linea degli occhi fra il 50% e il 69%
    // dell'altezza misurata dal bordo inferiore).
    //
    //   testa dal mento alla sommità  33 mm  = 389 px  (73% di 45 mm)
    //   sommità della testa           3,2 mm =  38 px dal bordo superiore
    //   linea degli occhi            20,7 mm = 244 px dal bordo superiore
    //                                        = 54% dell'altezza dal bordo inferiore
    //   mento                        36,2 mm = 427 px
    //
    // Perché 33 mm e non il centro esatto della forbice: l'unica misura che i punti del
    // volto forniscono davvero è la distanza occhi-mento, mentre la norma misura fino alla
    // SOMMITÀ del capo, capelli compresi — che nessun rilevatore vede. Il rapporto fra le
    // due grandezze cambia con l'acconciatura, e sbagliare per eccesso taglia la sommità
    // della testa, che è un motivo di scarto; sbagliare per difetto lascia solo un volto un
    // po' più piccolo, comunque dentro la forbice. Il valore 0,48 colloca correttamente la
    // maggioranza dei soggetti e lascia margine a chi ha i capelli voluminosi.
    const PX_PER_MM = 531 / 45;
    const TARGET_HEAD_HEIGHT_PX = Math.round(33 * PX_PER_MM);   // 389
    const TARGET_EYE_Y_PX = Math.round(20.7 * PX_PER_MM);       // 244
    const TARGET_EYE_X_PX = 413 / 2;
    const RAPPORTO_OCCHI_MENTO = 0.48;   // quota dell'altezza della testa sotto la linea degli occhi
    const TARGET_EYE_CHIN_PX = TARGET_HEAD_HEIGHT_PX * RAPPORTO_OCCHI_MENTO;

    // Il fotogramma viene disegnato ancorando un punto dell'immagine (gli occhi, quando
    // il volto è stato rilevato) a un punto fisso della tela. Zoom e rotazione avvengono
    // quindi attorno a quel punto e non spostano più l'inquadratura.
    let imgState = {
      ancoraX: 0,          // punto di ancoraggio in coordinate dell'immagine originale
      ancoraY: 0,
      scale: 1,
      panX: 0,             // spostamento manuale, in pixel di tela
      panY: 0,
      isDragging: false,
      startX: 0,
      startY: 0
    };
    let voltoRilevato = false;

    // Converte uno spostamento del puntatore (pixel CSS) in pixel di tela: la tela è
    // 413x531 ma viene mostrata più piccola, quindi senza questa conversione il
    // trascinamento risulterebbe più lento del dito.
    function fattoreTela() {
      const r = canvas.getBoundingClientRect();
      return r.width ? canvas.width / r.width : 1;
    }

    // Sfondo: le norme richiedono uno sfondo chiaro e a tinta unita, quindi si offrono solo
    // tonalità neutre chiare. «originale» lascia la foto com'è.
    const sfondoSelect = document.getElementById('sfondo-select');
    const sfondoStato = document.getElementById('sfondo-stato');
    let sfondoColore = null;          // null = sfondo originale
    let personaTela = null;           // ritaglio della persona con sfondo trasparente
    let mascheraInCorso = null;       // elaborazione in corso, per non avviarla due volte
    let ultimoVolto = null;           // punto del volto usato per isolare la persona giusta
    let volteMultipli = false;        // più persone nello scatto: il ritaglio non può essere pulito

    photoInput.addEventListener('change', e => {
      if (e.target.files.length) {
        handleFile(e.target.files[0]);
        e.target.value = '';
      }
    });

    // Da qui in poi il campo è gestito normalmente. Se nel frattempo era già stata scelta
    // una foto la si elabora adesso: può essere finita nella variabile d'attesa oppure
    // essere rimasta nel campo, se la scelta è avvenuta prima ancora che l'ascoltatore
    // provvisorio fosse in ascolto.
    appPronta = true;
    const giaScelto = fileInAttesa
      || (photoInput.files && photoInput.files.length ? photoInput.files[0] : null);
    if (giaScelto) {
      fileInAttesa = null;
      photoInput.value = '';
      handleFile(giaScelto);
    }

    function setAiStatus(loading, text) {
      if (aiSpinner) aiSpinner.classList.toggle('hidden', !loading);
      if (aiStatusText) aiStatusText.textContent = text;
    }

    function handleFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        alert('Seleziona un file immagine valido (JPG, PNG, WebP).');
        return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = async () => {
          if (originalImage) {
            originalImage.src = '';
            originalImage = null;
          }

          originalImage = img;
          if (rotateSlider) rotateSlider.value = 0;
          currentRotation = 0;

          // nuova foto: la persona ritagliata e il volto memorizzato non valgono più
          personaTela = null;
          ultimoVolto = null;
          volteMultipli = false;
          sfondoColore = null;
          if (sfondoSelect) sfondoSelect.value = 'originale';
          statoSfondo('');

          editorContainer.classList.remove('hidden');
          btnDownloadSingle.disabled = false;
          btnDownloadPdfGrid.disabled = false;

          await autoCropFace(img);
          reader.onload = null;
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    // Ripiego quando il volto non viene rilevato: si ancora il centro dell'immagine al
    // centro della tela e si sceglie la scala che la riempie.
    function resetImageTransform() {
      if (!originalImage) return;

      const isRotated = currentRotation === 90 || currentRotation === 270;
      const calcWidth = isRotated ? originalImage.height : originalImage.width;
      const calcHeight = isRotated ? originalImage.width : originalImage.height;

      voltoRilevato = false;
      imgState.ancoraX = originalImage.width / 2;
      imgState.ancoraY = originalImage.height / 2;
      imgState.scale = Math.max(canvas.width / calcWidth, canvas.height / calcHeight);
      imgState.panX = canvas.width / 2 - TARGET_EYE_X_PX;
      imgState.panY = canvas.height / 2 - TARGET_EYE_Y_PX;

      azzeraZoom();
    }

    function azzeraZoom() {
      if (!zoomSlider) return;
      zoomSlider.value = 1;
      if (zoomValText) zoomValText.textContent = '1.0x';
    }

    function imageToImageData(img) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.naturalWidth || img.width;
      tempCanvas.height = img.naturalHeight || img.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(img, 0, 0);
      return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    }

    // Rilevamento nel thread principale: serve su Safari, dove il Worker non dispone di
    // OffscreenCanvas. face-api è già caricata dalla pagina, quindi non si scarica altro.
    async function rilevaVoltoNelThreadPrincipale(img) {
      if (typeof faceapi === 'undefined') return null;
      const modelli = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
      if (!faceapi.nets.tinyFaceDetector.isLoaded) await faceapi.nets.tinyFaceDetector.loadFromUri(modelli);
      if (!faceapi.nets.faceLandmark68Net.isLoaded) await faceapi.nets.faceLandmark68Net.loadFromUri(modelli);

      const tela = document.createElement('canvas');
      tela.width = img.naturalWidth || img.width;
      tela.height = img.naturalHeight || img.height;
      tela.getContext('2d').drawImage(img, 0, 0);

      const tutti = await faceapi
        .detectAllFaces(tela, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }))
        .withFaceLandmarks();
      if (!tutti || !tutti.length) return null;

      const scelto = tutti.reduce((piuGrande, corrente) => {
        const a = corrente.detection.box.width * corrente.detection.box.height;
        const b = piuGrande.detection.box.width * piuGrande.detection.box.height;
        return a > b ? corrente : piuGrande;
      }, tutti[0]);

      const media = (punti, asse) => punti.reduce((somma, p) => somma + p[asse], 0) / punti.length;
      const occhioSinistro = scelto.landmarks.getLeftEye();
      const occhioDestro = scelto.landmarks.getRightEye();
      const mento = scelto.landmarks.getJawOutline()[8];
      const avgEyeX = (media(occhioSinistro, 'x') + media(occhioDestro, 'x')) / 2;
      const avgEyeY = (media(occhioSinistro, 'y') + media(occhioDestro, 'y')) / 2;

      return {
        avgEyeX,
        avgEyeY,
        eyeToChinDistance: Math.hypot(mento.x - avgEyeX, mento.y - avgEyeY),
        inclinazioneGradi: Math.atan2(
          media(occhioDestro, 'y') - media(occhioSinistro, 'y'),
          media(occhioDestro, 'x') - media(occhioSinistro, 'x')
        ) * 180 / Math.PI,
        numeroVolti: tutti.length
      };
    }

    // Il Worker può non rispondere (browser senza OffscreenCanvas, memoria esaurita): oltre il
    // tempo massimo si passa al rilevamento nel thread principale invece di restare in attesa.
    function conScadenza(promessa, millisecondi) {
      return Promise.race([
        promessa,
        new Promise((_, rifiuta) => setTimeout(() => rifiuta(new Error('Rilevamento troppo lento nel Worker.')), millisecondi))
      ]);
    }

    async function autoCropFace(img) {
      try {
        setAiStatus(true, 'Rilevamento ed elaborazione biometrica nel Worker...');

        const imageData = imageToImageData(img);

        let detection;
        try {
          // TRANSFERIR LA IMAGEN AL WORKER SIN CLONAR MEMORIA
          detection = await conScadenza(faceWorker.detectFace(
            Comlink.transfer(imageData, [imageData.data.buffer])
          ), 25000);
        } catch (erroreWorker) {
          console.warn('Rilevamento nel Worker non riuscito, si prova nel thread principale:', erroreWorker);
          setAiStatus(true, 'Rilevamento del volto in corso...');
          detection = await rilevaVoltoNelThreadPrincipale(img);
        }

        if (detection) {
          const { avgEyeX, avgEyeY } = detection;
          // il punto fra gli occhi serve a isolare la persona giusta quando si sostituisce lo sfondo
          ultimoVolto = { x: avgEyeX, y: avgEyeY };

          // Il riferimento misurabile è la distanza occhi-mento: la si porta al valore
          // che, sulla tela, colloca testa e occhi dove li vuole la norma.
          const occhiMento = detection.eyeToChinDistance
            || (detection.estimatedHeadHeight ? detection.estimatedHeadHeight / 2.2 : 0);
          if (!occhiMento) throw new Error('distanza occhi-mento non disponibile');

          voltoRilevato = true;
          imgState.ancoraX = avgEyeX;
          imgState.ancoraY = avgEyeY;
          imgState.scale = TARGET_EYE_CHIN_PX / occhiMento;
          imgState.panX = 0;
          imgState.panY = 0;
          azzeraZoom();

          // Raddrizzamento: si annulla l'inclinazione della linea degli occhi, entro un
          // limite prudente perché oltre i 20° il rilevamento non è più affidabile.
          const inclinazione = detection.inclinazioneGradi || 0;
          currentRotation = Math.abs(inclinazione) <= 20 ? -inclinazione : 0;
          if (rotateSlider) rotateSlider.value = Math.round(currentRotation);
          if (rotateValText) rotateValText.textContent = Math.round(currentRotation) + '°';

          if (detection.numeroVolti > 1) {
            volteMultipli = true;
            setAiStatus(false, `Inquadratura completata sul volto in primo piano, ma nella foto sono presenti ${detection.numeroVolti} volti: la fototessera deve ritrarre una sola persona.`);
          } else {
            volteMultipli = false;
            setAiStatus(false, 'Inquadratura automatica completata.');
          }
        } else {
          setAiStatus(false, 'Volto non rilevato. Utilizza i controlli manuali.');
          resetImageTransform();
        }
      } catch (e) {
        console.warn('Fallback manuale attivato:', e);
        setAiStatus(false, 'Modalità regolazione manuale attiva.');
        resetImageTransform();
      }
      renderCanvas();
    }

    function renderCanvas() {
      if (!originalImage || !ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Con uno sfondo scelto si riempie la tela di quel colore e si disegna solo la persona
      ctx.fillStyle = (sfondoColore && personaTela) ? sfondoColore : '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const livello = (sfondoColore && personaTela) ? personaTela : originalImage;
      const s = imgState.scale * (zoomSlider ? parseFloat(zoomSlider.value) : 1);

      // Il punto di ancoraggio dell'immagine viene portato sul suo bersaglio nella tela;
      // rotazione e zoom avvengono attorno a quel punto, così l'inquadratura del volto
      // resta valida qualunque regolazione si faccia.
      ctx.save();
      ctx.translate(TARGET_EYE_X_PX + imgState.panX, TARGET_EYE_Y_PX + imgState.panY);
      ctx.rotate((currentRotation * Math.PI) / 180);
      ctx.scale(s, s);
      // Le dimensioni sono sempre quelle della foto originale: il ritaglio della persona
      // viene prodotto a risoluzione ridotta e va riportato sullo stesso sistema di
      // coordinate, altrimenti comparirebbe rimpicciolito rispetto al punto di ancoraggio.
      ctx.drawImage(livello, -imgState.ancoraX, -imgState.ancoraY,
        originalImage.width, originalImage.height);
      ctx.restore();

      disegnaGuide();
    }

    // Le guide biometriche vengono disegnate sulla tela a partire dalle stesse costanti
    // usate per l'inquadratura: non possono più andare fuori sincrono con il volto.
    let guideVisibili = true;
    function disegnaGuide() {
      if (!guideVisibili) return;

      const cimaTesta = TARGET_EYE_Y_PX - (TARGET_HEAD_HEIGHT_PX - TARGET_EYE_CHIN_PX);
      const mento = TARGET_EYE_Y_PX + TARGET_EYE_CHIN_PX;
      const larghezzaTesta = TARGET_HEAD_HEIGHT_PX * 0.72;   // ovale del volto, non della tela

      ctx.save();
      ctx.lineWidth = 2;

      // ovale mento-sommità
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
      ctx.beginPath();
      ctx.ellipse(TARGET_EYE_X_PX, (cimaTesta + mento) / 2,
        larghezzaTesta / 2, TARGET_HEAD_HEIGHT_PX / 2, 0, 0, Math.PI * 2);
      ctx.stroke();

      // linea degli occhi
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.9)';
      ctx.beginPath();
      ctx.moveTo(0, TARGET_EYE_Y_PX);
      ctx.lineTo(canvas.width, TARGET_EYE_Y_PX);
      ctx.stroke();

      // etichette
      ctx.setLineDash([]);
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      etichetta('Linea occhi', canvas.width - 8, TARGET_EYE_Y_PX, 'right', 'rgba(99,102,241,0.92)');
      etichetta('Sommità', 8, cimaTesta, 'left', 'rgba(16,185,129,0.92)');
      etichetta('Mento', 8, mento, 'left', 'rgba(16,185,129,0.92)');
      ctx.restore();
    }

    function etichetta(testo, x, y, allineamento, colore) {
      ctx.textAlign = allineamento;
      const larghezza = ctx.measureText(testo).width + 10;
      const sinistra = allineamento === 'right' ? x - larghezza : x;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.68)';
      ctx.fillRect(sinistra, y - 11, larghezza, 22);
      ctx.fillStyle = colore;
      ctx.fillText(testo, allineamento === 'right' ? x - 5 : x + 5, y);
    }

    function statoSfondo(testo, errore) {
      if (!sfondoStato) return;
      sfondoStato.textContent = testo || '';
      sfondoStato.className = 'text-xs mt-2 ' + (errore ? 'text-rose-300 font-bold' : 'text-indigo-300');
    }

    async function assicuraPersona() {
      if (personaTela) return true;
      if (!window.SuSfondo) {
        statoSfondo('Modulo di ritaglio non disponibile: lo sfondo resta quello originale.', true);
        return false;
      }
      if (mascheraInCorso) return mascheraInCorso;

      mascheraInCorso = (async () => {
        statoSfondo('Isolamento della persona dallo sfondo in corso...');
        try {
          const esito = await window.SuSfondo.preparaPersona(originalImage, { puntoVolto: ultimoVolto });
          personaTela = esito.tela;
          // una copertura minima indica che la persona non è stata riconosciuta
          if (esito.coperturaPersona < 0.04) {
            personaTela = null;
            statoSfondo('Non è stato possibile isolare la persona: usa una foto con la persona in primo piano.', true);
            return false;
          }
          statoSfondo(volteMultipli
            ? 'Sfondo sostituito, ma nella foto compare più di una persona: chi tocca il soggetto resta nell\'immagine. Per la fototessera serve uno scatto in cui sei da solo.'
            : 'Sfondo sostituito. Controlla i bordi, soprattutto attorno ai capelli.');
          return true;
        } catch (err) {
          console.warn('Sostituzione sfondo non riuscita:', err);
          personaTela = null;
          statoSfondo(window.StrumentiErrors
            ? window.StrumentiErrors.friendlyErrorMessage(err, 'Sostituzione dello sfondo non riuscita: lo sfondo resta quello originale.')
            : 'Sostituzione dello sfondo non riuscita: lo sfondo resta quello originale.', true);
          return false;
        } finally {
          mascheraInCorso = null;
        }
      })();

      return mascheraInCorso;
    }

    if (sfondoSelect) {
      sfondoSelect.addEventListener('change', async () => {
        const scelta = sfondoSelect.value;
        if (scelta === 'originale') {
          sfondoColore = null;
          statoSfondo('');
          renderCanvas();
          return;
        }
        if (!originalImage) {
          statoSfondo('Carica prima una fotografia.', true);
          sfondoSelect.value = 'originale';
          return;
        }
        sfondoSelect.disabled = true;
        const pronto = await assicuraPersona();
        sfondoSelect.disabled = false;
        if (!pronto) {
          sfondoColore = null;
          sfondoSelect.value = 'originale';
          renderCanvas();
          return;
        }
        sfondoColore = scelta;
        renderCanvas();
      });
    }

    if (rotateSlider) {
      rotateSlider.addEventListener('input', e => {
        currentRotation = parseInt(e.target.value, 10);
        if (rotateValText) rotateValText.textContent = currentRotation + '°';
        renderCanvas();
      });
    }

    if (btnRotate) {
      btnRotate.addEventListener('click', () => {
        // Rotazione di un quarto di giro per le foto scattate di traverso. Il punto di
        // ancoraggio resta il volto, quindi l'inquadratura non va rifatta da capo.
        currentRotation = (currentRotation + 90) % 360;
        if (rotateSlider) rotateSlider.value = currentRotation;
        if (rotateValText) rotateValText.textContent = currentRotation + '°';
        renderCanvas();
      });
    }

    if (zoomSlider) {
      zoomSlider.addEventListener('input', e => {
        if (zoomValText) zoomValText.textContent = parseFloat(e.target.value).toFixed(2) + 'x';
        renderCanvas();
      });
    }

    // Trascinamento con mouse, dito o penna. Lo spostamento del puntatore è in pixel
    // CSS, mentre panX/panY sono in pixel di tela: senza la conversione l'immagine
    // seguirebbe il dito più lentamente.
    function iniziaTrascinamento(clientX, clientY) {
      const k = fattoreTela();
      imgState.isDragging = true;
      imgState.startX = clientX * k - imgState.panX;
      imgState.startY = clientY * k - imgState.panY;
    }

    function muoviTrascinamento(clientX, clientY) {
      if (!imgState.isDragging) return;
      const k = fattoreTela();
      imgState.panX = clientX * k - imgState.startX;
      imgState.panY = clientY * k - imgState.startY;
      renderCanvas();
    }

    canvas.addEventListener('mousedown', e => iniziaTrascinamento(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => muoviTrascinamento(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => { imgState.isDragging = false; });
    window.addEventListener('mouseleave', () => { imgState.isDragging = false; });

    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) iniziaTrascinamento(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener('touchmove', e => {
      if (!imgState.isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      muoviTrascinamento(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener('touchend', () => { imgState.isDragging = false; });

    // Le guide sono disegnate sulla tela: prima di esportare si ridisegna senza,
    // altrimenti finirebbero stampate sulla fototessera.
    function telaPulita() {
      const eranoVisibili = guideVisibili;
      guideVisibili = false;
      renderCanvas();
      const dati = canvas.toDataURL('image/png', 1.0);
      guideVisibili = eranoVisibili;
      renderCanvas();
      return dati;
    }

    btnDownloadSingle.addEventListener('click', () => {
      if (!originalImage) return;
      const link = document.createElement('a');
      link.download = `Fototessera_ICAO_35x45mm_${Date.now()}.png`;
      link.href = telaPulita();
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

    btnDownloadPdfGrid.addEventListener('click', async () => {
      if (!originalImage || typeof window.PDFLib === 'undefined') return;

      btnDownloadPdfGrid.disabled = true;
      btnDownloadPdfGrid.textContent = '⏳ Creazione Foglio PDF...';

      try {
        const pdfDoc = await window.PDFLib.PDFDocument.create();
        const page = pdfDoc.addPage([283.46, 425.20]);
        const { width, height } = page.getSize();

        const pngBytes = await fetch(telaPulita()).then(r => r.arrayBuffer());
        const pdfImage = await pdfDoc.embedPng(pngBytes);

        const numPhotos = pdfLayoutSelect ? parseInt(pdfLayoutSelect.value, 10) : 4;
        const rows = numPhotos === 6 ? 3 : 2;
        const cols = 2;

        const photoW = 35 * 2.83465;
        const photoH = 45 * 2.83465;

        const marginX = (width - photoW * cols) / (cols + 1);
        const marginY = (height - photoH * rows) / (rows + 1);

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const x = marginX + col * (photoW + marginX);
            const y = height - (marginY + (row + 1) * photoH + row * marginY);
            page.drawImage(pdfImage, { x, y, width: photoW, height: photoH });
            page.drawRectangle({ x, y, width: photoW, height: photoH, borderColor: window.PDFLib.rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
          }
        }

        const blob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Foglio_Fototessere_10x15cm_${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

      } catch (err) {
        console.error('PDF Grid Error:', err);
        alert('Errore durante la creazione del PDF.');
      } finally {
        btnDownloadPdfGrid.disabled = false;
        btnDownloadPdfGrid.textContent = '📄 Scarica Foglio Stampa';
      }
    });
  }
})();