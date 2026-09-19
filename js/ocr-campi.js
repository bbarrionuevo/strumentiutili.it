// js/ocr-campi.js — Lettura assistita di etichette e cartellini per precompilare i campi
//
// Riusa il motore OCR già presente nel progetto (/js/workers/ocr-worker.js, Tesseract.js in
// WebAssembly): il worker viene creato solo quando l'utente chiede la scansione, così la pagina
// non scarica nulla finché non serve. Tutto avviene nel browser: l'immagine non lascia il
// dispositivo, non viene inviata a nessun servizio.
//
// L'OCR qui è un aiuto alla compilazione, mai l'unica strada: ogni valore riconosciuto torna
// all'interfaccia come proposta modificabile, con l'indicazione di quanto è affidabile.
(function () {
  'use strict';

  const LATO_MASSIMO = 1600;   // oltre questa dimensione l'OCR non migliora e la memoria cresce
  const TIMEOUT_MS = 90000;    // un riconoscimento bloccato non deve lasciare lo spinner all'infinito

  function caricaImmagine(file) {
    return new Promise((risolvi, rifiuta) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); risolvi(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rifiuta(new Error('Immagine non leggibile.')); };
      img.src = url;
    });
  }

  // Pre-elaborazione leggera su canvas: ridimensiona, porta in scala di grigi e aumenta il
  // contrasto attorno alla luminosità media. Sulle foto di cartellini e etichette questo basta;
  // non si carica OpenCV (diversi megabyte) per non penalizzare l'avvio della pagina.
  function preparaImmagine(img) {
    const scala = Math.min(1, LATO_MASSIMO / Math.max(img.naturalWidth, img.naturalHeight));
    const larghezza = Math.max(1, Math.round(img.naturalWidth * scala));
    const altezza = Math.max(1, Math.round(img.naturalHeight * scala));

    const canvas = document.createElement('canvas');
    canvas.width = larghezza;
    canvas.height = altezza;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, larghezza, altezza);
    ctx.drawImage(img, 0, 0, larghezza, altezza);

    try {
      const dati = ctx.getImageData(0, 0, larghezza, altezza);
      const px = dati.data;
      let somma = 0;
      for (let i = 0; i < px.length; i += 4) {
        const grigio = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        px[i] = px[i + 1] = px[i + 2] = grigio;
        somma += grigio;
      }
      const media = somma / (px.length / 4);
      // Contrasto attorno alla media: schiarisce la carta e scurisce le cifre
      const fattore = 1.6;
      for (let i = 0; i < px.length; i += 4) {
        const v = Math.max(0, Math.min(255, (px[i] - media) * fattore + media));
        px[i] = px[i + 1] = px[i + 2] = v;
      }
      ctx.putImageData(dati, 0, 0);
    } catch (e) {
      // Canvas "sporcato" da un'immagine di altra origine: si procede senza pre-elaborazione
    }

    return canvas;
  }

  function canvasInBlobUrl(canvas) {
    return new Promise((risolvi, rifiuta) => {
      canvas.toBlob((blob) => {
        if (!blob) return rifiuta(new Error('Conversione dell\'immagine non riuscita.'));
        risolvi(URL.createObjectURL(blob));
      }, 'image/jpeg', 0.92);
    });
  }

  function eseguiWorker(blobUrl, opzioni) {
    return new Promise((risolvi, rifiuta) => {
      let worker;
      try {
        worker = new Worker('/js/workers/ocr-worker.js');
      } catch (e) {
        return rifiuta(new Error('Motore OCR non disponibile su questo browser.'));
      }

      const chiudi = () => {
        clearTimeout(timer);
        try { worker.terminate(); } catch (e) { /* già terminato */ }
      };

      const timer = setTimeout(() => {
        chiudi();
        rifiuta(new Error('La lettura dell\'immagine sta impiegando troppo tempo: inserisci i dati a mano.'));
      }, TIMEOUT_MS);

      worker.onmessage = (evento) => {
        const dati = evento.data || {};
        if (dati.type === 'progress' && opzioni.onProgresso) opzioni.onProgresso(`Lettura in corso: ${dati.pct}%`);
        else if (dati.type === 'status' && opzioni.onProgresso) opzioni.onProgresso(dati.msg);
        else if (dati.type === 'success') {
          chiudi();
          risolvi({ testo: dati.text || '', parole: dati.words || [], testoNumerico: dati.numericText || '' });
        } else if (dati.type === 'error') {
          chiudi();
          rifiuta(new Error(dati.msg || 'Errore durante la lettura.'));
        }
      };
      worker.onerror = (err) => {
        chiudi();
        rifiuta(new Error((err && err.message) || 'Il motore OCR si è interrotto.'));
      };

      worker.postMessage({ imageBlobUrl: blobUrl, lang: 'ita', keywords: opzioni.parole || [] });
    });
  }

  // Confidenza media delle parole riconosciute: serve a dire all'utente quanto fidarsi
  function confidenzaMedia(parole) {
    if (!parole || !parole.length) return 0;
    let somma = 0;
    for (const p of parole) somma += (p.confidence || 0);
    return somma / parole.length;
  }

  async function leggi(file, opzioni) {
    const o = opzioni || {};
    if (!file || !/^image\//.test(file.type || '')) {
      throw new Error('Seleziona una fotografia (JPG, PNG o HEIC convertito).');
    }

    if (o.onProgresso) o.onProgresso('Preparazione dell\'immagine...');
    const img = await caricaImmagine(file);
    const canvas = preparaImmagine(img);
    const blobUrl = await canvasInBlobUrl(canvas);

    try {
      const esito = await eseguiWorker(blobUrl, o);
      canvas.width = 0;
      return {
        testo: esito.testo,
        testoNumerico: esito.testoNumerico,
        parole: esito.parole,
        confidenza: confidenzaMedia(esito.parole)
      };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  // ---- Estrattori condivisi -------------------------------------------------
  // Le espressioni lavorano sul testo minuscolo con spazi normalizzati.

  function normalizza(testo) {
    return String(testo || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      // confusioni tipiche dell'OCR sulle cifre: O/o al posto di 0, l/I al posto di 1
      .replace(/(^|[\s€])[o](?=[.,]\d)/g, '$10')
      .replace(/(\d)[oO](\d)/g, '$10$2');
  }

  // Prezzo in euro: "€ 2,49", "2.49 €", "EUR 2,49"
  function trovaPrezzo(testo) {
    const t = normalizza(testo);
    const candidati = [];
    const regex = /(?:€|eur\b)\s*(\d{1,4}(?:[.,]\d{1,2})?)|(\d{1,4}[.,]\d{2})\s*(?:€|eur\b)/g;
    let m;
    while ((m = regex.exec(t))) {
      const valore = window.SuNumeri.parse(m[1] || m[2]);
      if (valore !== null && valore > 0 && valore < 10000) candidati.push(valore);
    }
    return candidati.length ? candidati : null;
  }

  // Quantità con unità: "500 g", "1,5 l", "750ml", "6 pz"
  function trovaQuantita(testo) {
    const t = normalizza(testo);
    const regex = /(\d{1,5}(?:[.,]\d{1,3})?)\s?(kg|g(?:r|rammi)?|ml|cl|lt?|litri?|pz|pezzi|pcs)\b/g;
    const trovate = [];
    let m;
    while ((m = regex.exec(t))) {
      const valore = window.SuNumeri.parse(m[1]);
      if (valore === null || valore <= 0) continue;
      trovate.push({ valore, unita: normalizzaUnita(m[2]) });
    }
    return trovate.length ? trovate : null;
  }

  function normalizzaUnita(sigla) {
    const s = String(sigla || '').toLowerCase();
    if (s === 'kg') return 'kg';
    if (s === 'g' || s === 'gr' || s === 'grammi') return 'g';
    if (s === 'ml') return 'ml';
    if (s === 'cl') return 'cl';
    if (s === 'l' || s === 'lt' || s === 'litro' || s === 'litri') return 'l';
    return 'pz';
  }

  // Consumo energetico dichiarato in etichetta, con l'unità di misura che lo qualifica
  function trovaConsumo(testo) {
    const t = normalizza(testo);
    const esiti = [];

    const per100 = t.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*kwh\s*(?:\/|per|su)?\s*100\s*cicl/);
    if (per100) esiti.push({ valore: window.SuNumeri.parse(per100[1]), unita: 'kwh100cicli' });

    const annuo = t.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*kwh\s*(?:\/|per)?\s*(?:annum|anno|annui|year)/);
    if (annuo) esiti.push({ valore: window.SuNumeri.parse(annuo[1]), unita: 'kwhAnno' });

    const perCiclo = t.match(/(\d{1,3}(?:[.,]\d{1,3})?)\s*kwh\s*(?:\/|per)?\s*cicl/);
    if (perCiclo && !per100) esiti.push({ valore: window.SuNumeri.parse(perCiclo[1]), unita: 'kwhCiclo' });

    return esiti.filter((e) => e.valore !== null && e.valore > 0);
  }

  // Classe energetica: utile come conferma visiva, mai come sostituto del consumo dichiarato
  function trovaClasseEnergetica(testo) {
    const t = normalizza(testo);
    const m = t.match(/class[ei]\s*(?:energetica)?\s*[:\s]\s*([a-g])\b/) || t.match(/\b([a-g])\s*\+{0,3}\b\s*class/);
    return m ? m[1].toUpperCase() : null;
  }

  window.SuOcr = {
    leggi,
    normalizza,
    trovaPrezzo,
    trovaQuantita,
    trovaConsumo,
    trovaClasseEnergetica,
    normalizzaUnita
  };
})();
