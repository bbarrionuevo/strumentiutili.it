// js/sfondo-persona.js — Isolamento della persona dallo sfondo (segmentazione locale)
//
// Usa il modello di segmentazione "selfie" di MediaPipe eseguito in WebAssembly: il modello viene
// scaricato dalla CDN al primo utilizzo, mentre la fotografia resta nel browser e non viene inviata
// a nessun server. Il risultato è una tela RGBA in cui l'alfa vale 1 sulla persona e 0 sullo sfondo.
//
// Due accorgimenti rendono il ritaglio utilizzabile per una fototessera:
//   1. il contorno viene reso più netto (curva di contrasto) e poi appena sfumato, perché la maschera
//      grezza ha bordi molto morbidi e "a scalini";
//   2. viene tenuta solo la regione collegata al volto rilevato: il modello riconosce come persona
//      anche eventuali altre figure sullo sfondo, che in una fototessera non devono comparire.
(function () {
  'use strict';

  const VERSIONE_TASKS = '0.10.14';
  const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSIONE_TASKS}`;
  const MODELLO = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
  const LATO_MASSIMO = 1024;   // oltre non migliora la maschera e rallenta l'elaborazione

  let segmentatore = null;
  let caricamento = null;

  function caricaSegmentatore() {
    if (segmentatore) return Promise.resolve(segmentatore);
    if (caricamento) return caricamento;

    caricamento = (async () => {
      const vision = await import(/* webpackIgnore: true */ CDN);
      const fileset = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
      segmentatore = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELLO },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true
      });
      return segmentatore;
    })();

    caricamento.catch(() => { caricamento = null; });
    return caricamento;
  }

  // Curva di contrasto attorno alla soglia: avvicina i valori incerti a 0 o a 1
  function irrigidisci(valore) {
    return 1 / (1 + Math.exp(-(valore - 0.45) * 14));
  }

  function sfumatura3x3(maschera, larghezza, altezza) {
    const esito = maschera.slice();
    for (let y = 1; y < altezza - 1; y++) {
      for (let x = 1; x < larghezza - 1; x++) {
        let somma = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) somma += maschera[(y + dy) * larghezza + x + dx];
        }
        esito[y * larghezza + x] = somma / 9;
      }
    }
    return esito;
  }

  // Tiene la sola regione collegata al punto del volto: le altre persone o oggetti riconosciuti
  // come "persona" restano fuori dal ritaglio.
  function soloRegioneDelVolto(maschera, larghezza, altezza, puntoX, puntoY) {
    // Soglia alta per la propagazione: fra due persone affiancate la maschera passa da valori
    // alti a valori intermedi, quindi una soglia bassa unirebbe i due corpi in un'unica regione.
    const SOGLIA_REGIONE = 0.75;
    const dentro = new Uint8Array(maschera.length);
    const partenzaX = Math.max(0, Math.min(larghezza - 1, Math.round(puntoX)));
    const partenzaY = Math.max(0, Math.min(altezza - 1, Math.round(puntoY)));
    const indicePartenza = partenzaY * larghezza + partenzaX;
    if (maschera[indicePartenza] < SOGLIA_REGIONE) return null;   // il volto non è nella maschera: meglio non filtrare

    const coda = new Int32Array(maschera.length);
    let testa = 0, fine = 0;
    coda[fine++] = indicePartenza;
    dentro[indicePartenza] = 1;

    while (testa < fine) {
      const i = coda[testa++];
      const x = i % larghezza;
      const y = (i - x) / larghezza;
      if (x > 0 && !dentro[i - 1] && maschera[i - 1] >= SOGLIA_REGIONE) { dentro[i - 1] = 1; coda[fine++] = i - 1; }
      if (x < larghezza - 1 && !dentro[i + 1] && maschera[i + 1] >= SOGLIA_REGIONE) { dentro[i + 1] = 1; coda[fine++] = i + 1; }
      if (y > 0 && !dentro[i - larghezza] && maschera[i - larghezza] >= SOGLIA_REGIONE) { dentro[i - larghezza] = 1; coda[fine++] = i - larghezza; }
      if (y < altezza - 1 && !dentro[i + larghezza] && maschera[i + larghezza] >= SOGLIA_REGIONE) { dentro[i + larghezza] = 1; coda[fine++] = i + larghezza; }
    }

    // La regione viene allargata di alcuni pixel per non tagliare via la sfumatura del contorno
    let attuale = dentro;
    for (let passo = 0; passo < 4; passo++) {
      const allargata = attuale.slice();
      for (let y = 0; y < altezza; y++) {
        for (let x = 0; x < larghezza; x++) {
          const i = y * larghezza + x;
          if (attuale[i]) continue;
          if ((x > 0 && attuale[i - 1]) || (x < larghezza - 1 && attuale[i + 1]) ||
              (y > 0 && attuale[i - larghezza]) || (y < altezza - 1 && attuale[i + larghezza])) allargata[i] = 1;
        }
      }
      attuale = allargata;
    }
    return attuale;
  }

  /**
   * Toglie dal contorno il colore dello sfondo originale.
   *
   * Un pixel di bordo è una miscela: C = a·F + (1−a)·S, dove F è il colore della persona
   * e S quello dello sfondo di partenza. Componendo su un fondo nuovo senza correggere,
   * quel residuo di S resta visibile come alone — il problema tipico attorno ai capelli,
   * soprattutto se lo sfondo originale era scuro o colorato.
   *
   * Lo sfondo viene stimato come mediana dei pixel sicuramente esterni alla persona
   * (l'ipotesi regge perché allo scatto si chiede comunque una parete chiara e uniforme),
   * poi si inverte la miscela per ricavare F.
   */
  function scontaminaBordo(pixel, maschera, larghezza, altezza) {
    const dati = pixel.data;

    // Mediana dei pixel di sfondo: più robusta della media se nell'inquadratura
    // compaiono un battiscopa o una cornice.
    const campioniR = [], campioniG = [], campioniB = [];
    for (let m = 0; m < maschera.length; m++) {
      if (maschera[m] > 0.02) continue;
      const i = m * 4;
      campioniR.push(dati[i]); campioniG.push(dati[i + 1]); campioniB.push(dati[i + 2]);
    }
    if (campioniR.length < 200) return;   // sfondo non identificabile: meglio non toccare nulla

    const mediana = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
    const sfondo = [mediana(campioniR), mediana(campioniG), mediana(campioniB)];

    for (let m = 0; m < maschera.length; m++) {
      const a = maschera[m];
      if (a <= 0.04 || a >= 0.96) continue;   // fuori o dentro: niente da smontare
      const i = m * 4;
      for (let c = 0; c < 3; c++) {
        const smontato = (dati[i + c] - (1 - a) * sfondo[c]) / a;
        dati[i + c] = Math.max(0, Math.min(255, Math.round(smontato)));
      }
    }
  }

  /**
   * Restituisce una tela con la sola persona (sfondo trasparente).
   * @param {HTMLImageElement} immagine fotografia originale
   * @param {{puntoVolto?: {x: number, y: number}}} opzioni punto del volto in coordinate dell'immagine
   */
  async function preparaPersona(immagine, opzioni) {
    const o = opzioni || {};
    const seg = await caricaSegmentatore();

    const larghezzaOriginale = immagine.naturalWidth || immagine.width;
    const altezzaOriginale = immagine.naturalHeight || immagine.height;
    const scala = Math.min(1, LATO_MASSIMO / Math.max(larghezzaOriginale, altezzaOriginale));
    const larghezza = Math.max(1, Math.round(larghezzaOriginale * scala));
    const altezza = Math.max(1, Math.round(altezzaOriginale * scala));

    const tela = document.createElement('canvas');
    tela.width = larghezza;
    tela.height = altezza;
    const ctx = tela.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(immagine, 0, 0, larghezza, altezza);

    const risultato = seg.segment(tela);
    let maschera;
    try {
      maschera = Array.from(risultato.confidenceMasks[0].getAsFloat32Array());
    } finally {
      risultato.close();
    }

    maschera = sfumatura3x3(maschera.map(irrigidisci), larghezza, altezza);

    if (o.puntoVolto) {
      const regione = soloRegioneDelVolto(maschera, larghezza, altezza, o.puntoVolto.x * scala, o.puntoVolto.y * scala);
      if (regione) {
        for (let i = 0; i < maschera.length; i++) if (!regione[i]) maschera[i] = 0;
      }
    }

    const pixel = ctx.getImageData(0, 0, larghezza, altezza);
    scontaminaBordo(pixel, maschera, larghezza, altezza);
    for (let i = 0, m = 0; i < pixel.data.length; i += 4, m++) {
      pixel.data[i + 3] = Math.round(Math.max(0, Math.min(1, maschera[m])) * 255);
    }
    ctx.putImageData(pixel, 0, 0);

    let coperturaPersona = 0;
    for (let m = 0; m < maschera.length; m++) if (maschera[m] > 0.5) coperturaPersona++;

    return {
      tela,
      larghezza,
      altezza,
      coperturaPersona: coperturaPersona / maschera.length
    };
  }

  window.SuSfondo = { preparaPersona };
})();
