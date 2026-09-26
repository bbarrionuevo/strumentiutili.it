// sw.js — Service Worker per StrumentiUtili.it
const CACHE_NAME = 'strumentiutili-v68';

// I file condivisi verso l'app installata (share_target nel manifest) arrivano
// qui con un POST: si mettono in IndexedDB con js/condivisi.js e si passa alla
// pagina /condividi/. Nessun server li riceve.
if (typeof importScripts === 'function') {
  try { importScripts('/js/condivisi.js'); } catch (e) { /* senza, la condivisione porta alla pagina vuota */ }
}

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/css/styles.css',

  // --- Silo Fisco & Professioni ---
  '/fisco-professioni/',
  '/fisco-professioni/generatore-xml-fatturapa/',
  '/fisco-professioni/modelli-partita-iva/',
  '/fisco-professioni/calcolo-rata-mutuo/',
  '/fisco-professioni/rivalutazione-istat/',
  '/fisco-professioni/concordato-preventivo-biennale/',
  '/fisco-professioni/partita-iva/',
  '/fisco-professioni/parcella-avvocato/',
  '/fisco-professioni/contributo-unificato/',
  '/fisco-professioni/interessi-moratori/',
  '/fisco-professioni/usufrutto/',
  '/fisco-professioni/fattura-elettronica/',
  '/fisco-professioni/calcolo-iva/',
  '/fisco-professioni/ravvedimento-operoso/',

  // --- Silo Cittadino & Tasse ---
  '/cittadino-tasse/',
  '/cittadino-tasse/modello-rli/',
  '/cittadino-tasse/modello-69/',
  '/cittadino-tasse/modello-rap/',
  '/cittadino-tasse/accredito-rimborsi/',
  '/cittadino-tasse/imposte-acquisto-casa/',
  '/cittadino-tasse/calcolo-bollo-auto/',
  '/cittadino-tasse/lettore-multa-codice-strada/',
  '/cittadino-tasse/esenzione-bollo-auto-2027/',
  '/cittadino-tasse/passaggio-di-proprieta/',
  '/cittadino-tasse/aliquote-irpef/',
  '/cittadino-tasse/f24-editabile/',
  '/cittadino-tasse/f24-editabile/f24-ordinario/',
  '/cittadino-tasse/f24-editabile/f24-semplificato/',
  '/cittadino-tasse/f24-editabile/f24-elide/',
  '/cittadino-tasse/f24-editabile/f24-accise/',
  '/cittadino-tasse/f24-editabile/f23-editabile/',
  '/cittadino-tasse/simulatore-isee/',
  '/cittadino-tasse/assegno-unico/',
  '/cittadino-tasse/calcolo-imu/',
  '/cittadino-tasse/imposta-registro-locazioni/',
  '/cittadino-tasse/simulatore-pensione/',

  // --- Silo Lavoro & Contratti ---
  '/lavoro-contratti/',
  '/lavoro-contratti/lettera-dimissioni-preavviso/',
  '/lavoro-contratti/calcolo-naspi/',
  '/lavoro-contratti/estratto-conto-contributivo/',
  '/lavoro-contratti/stipendio-netto/',
  '/lavoro-contratti/calcolo-tfr/',
  '/lavoro-contratti/ricevuta-prestazione-occasionale/',
  '/lavoro-contratti/ritenuta-acconto/',
  '/lavoro-contratti/giorni-lavorativi/',

  // --- Silo Identità & Burocrazia ---
  '/identita-burocrazia/',
  '/identita-burocrazia/calcolo-quote-ereditarie/',
  '/identita-burocrazia/codice-fiscale/',
  '/identita-burocrazia/richiesta-codice-fiscale/',
  '/identita-burocrazia/codice-fiscale-enti/',
  '/identita-burocrazia/validatore-iban/',
  '/identita-burocrazia/autocertificazione/',
  '/identita-burocrazia/fototessera/',
  '/identita-burocrazia/generatore-password/',
  '/identita-burocrazia/generatore-cv-ats/',

  // --- Silo PDF ---
  '/pdf/',
  '/pdf/unisci-pdf/',
  '/pdf/dividi-pdf/',
  '/pdf/comprimi-pdf/',
  '/pdf/jpg-in-pdf/',
  '/pdf/word-in-pdf/',
  '/pdf/apri-file-p7m/',
  '/condividi/',
  '/pdf/firma/',
  '/pdf/anonimizza/',
  '/pdf/convertitore-pdfa/',
  '/pdf/scanner-documenti/',

  // --- Silo IA Locale ---
  '/ia/',
  '/ia/traduttore/',
  '/ia/riassunto-testo/',
  '/ia/ocr-immagini/',
  '/ia/trascrizione-audio/',

  // --- Silo Utilità & Web ---
  '/utilita-web/',
  '/utilita-web/calcolo-percentuale/',
  '/utilita-web/interessi-composti/',
  '/utilita-web/generatore-qr/',
  '/utilita-web/convertitore-immagini/',
  '/utilita-web/contaparole/',
  '/utilita-web/pulisci-link/',
  '/utilita-web/calendario-da-stampare/',
  '/utilita-web/sudoku-del-giorno/',
  '/utilita-web/parola-del-giorno/',
  '/utilita-web/santo-del-giorno/',
  '/utilita-web/flashcard/',
  '/utilita-web/che-file-e/',
  '/utilita-web/accordatore/',
  '/utilita-web/metronomo/',
  '/utilita-web/rimuovi-dati-foto/',
  '/lavoro-contratti/calendario-turni/',
  '/identita-burocrazia/scadenziario/',
  '/identita-burocrazia/proteggi-documento/',
  '/utilita-web/media-universitaria/',
  '/utilita-web/calcolo-bmr/',
  '/utilita-web/budget-planner/',

  // Pagine Legali e Contatti
  '/contatti.html',
  '/politica-sulla-privacy.html',
  '/avviso-legale.html',

  // Script condivisi e utilità
  '/js/spazio.js',
  '/js/layout.js',
  '/js/data-loader.js',
  '/js/esenzione-bollo.js',
  '/js/esenzione-bollo-ui.js',
  '/js/dropzone.js',
  '/js/sfondo-persona.js',
  '/js/error-utils.js',
  '/js/storage-helper.js',
  
  // Script delle calcolatrici
  '/js/rli.js',
  '/js/fatturapa.js',
  '/js/compilatore-moduli.js',
  '/js/hr-dimissioni.js',
  '/js/mutuo.js',
  '/js/rivalutazione-istat.js',
  '/js/imposte-casa.js',
  '/js/bollo-auto.js',
  '/js/passaggio-proprieta.js',
  '/js/naspi.js',
  '/js/successioni.js',
  '/js/irpef.js',
  '/js/concordato.js',
  '/js/estratto-contributivo.js',
  '/js/pdf-righe.js',
  '/js/multa-termini.js',
  '/js/multa-lettura.js',
  '/js/ocr-testo.js',
  '/js/calendario-ics.js',
  '/js/calendario-vista.js',
  '/js/calendario-pdf.js',
  '/js/calendario-stampa.js',
  '/js/giornaliero.js',
  '/js/sudoku.js',
  '/js/sudoku-pdf.js',
  '/js/sudoku-ui.js',
  '/js/parole-soluzioni.js',
  '/js/parole-valide.js',
  '/js/parola.js',
  '/js/parola-ui.js',
  '/js/sole.js',
  '/js/santi.js',
  '/js/auguri.js',
  '/js/santi-ui.js',
  '/js/flashcard.js',
  '/js/flashcard-ui.js',
  '/js/tipo-file.js',
  '/js/tipo-file-ui.js',
  // il ripasso deve funzionare offline; i lettori di Anki si scaricano solo se servono
  '/vendor/ts-fsrs@5.4.2/ts-fsrs.umd.js',
  '/js/intonazione.js',
  '/js/accordatore-ui.js',
  '/js/metronomo.js',
  '/js/metronomo-ui.js',
  '/js/filigrana.js',
  '/js/filigrana-ui.js',
  '/js/exif.js',
  '/js/turni.js',
  '/js/turni-pdf.js',
  '/js/turni-ui.js',
  '/js/scadenze.js',
  '/js/scadenze-ui.js',
  '/js/exif-ui.js',
  '/js/multa-ui.js',
  '/js/estratto-import.js',
  '/js/estratto-ui.js',
  '/js/concordato-ui.js',
  '/js/stipendio-netto.js',
  '/js/partita-iva.js',
  '/js/parcella-avvocato.js',
  '/js/contributo-unificato.js',
  '/js/interessi-moratori.js',
  '/js/usufrutto.js',
  '/js/aliquote-irpef.js',
  '/js/imposta-locazioni.js',
  '/js/ritenuta.js',
  '/js/tfr.js',
  '/js/codice-fiscale.js',
  '/js/validatore-iban.js',
  '/js/fattura.js',
  '/js/isee.js',
  '/js/ravvedimento.js',
  '/js/assegno-unico.js',
  '/js/ricevuta-occasionale.js',
  '/js/guida-campi.js',
  '/js/pdfa.js',
  '/js/scanner.js',
  '/js/pdf-tools.js',
  '/js/p7m-lettura.js',
  '/js/p7m-ui.js',
  '/js/condivisi.js',
  '/js/prossimo.js',
  '/js/parametri-url.js',
  '/js/condivisi-ui.js',
  '/js/traduttore.js',
  '/js/riassunto.js',
  '/js/ocr.js',
  '/js/qr-code.js',
  '/js/convertitore-immagini.js',
  '/js/autocertificazione.js',
  '/js/percentuali.js',
  '/js/festivita.js',
  '/js/giorni-lavorativi.js',
  '/js/media-universitaria.js',
  '/js/calcolo-bmr.js',
  '/js/trascrizione.js',
  '/js/password.js',
  '/js/fototessera.js',
  '/js/pulisci-link.js',
  '/js/pulisci-link-ui.js',
  '/js/simulatore-pensione.js',
  '/js/generatore-cv-ats.js',
  '/js/budget-planner.js',

  // Web Workers
  '/js/workers/translation-worker.js',
  '/js/workers/pdf-worker.js',
  '/js/workers/face-worker.js',
  '/js/workers/cv-pdf-worker.js',

  // Dataset e asset visivi
  // data/comuni.json (4,65 MB) NON entra nella cache iniziale: lo usano tre
  // pagine su 126 e da solo era un terzo del peso. Lo prende la strategia
  // di runtime alla prima visita di quelle pagine.
  '/data/regole-fiscali-2026.json',
  '/data/strumenti.json',
  '/data/santi.json',
  '/data/modelli-piva-schema.json',
  '/data/modello-rli-schema.json',
  '/data/modello-f24-ordinario-schema.json',
  '/data/modello-f24-semplificato-schema.json',
  '/data/modello-f24-elide-schema.json',
  '/data/modello-f24-accise-schema.json',
  '/data/modello-f23-schema.json',
  '/data/modello-aa4-8-schema.json',
  '/data/modello-69-schema.json',
  '/data/modello-rap-schema.json',
  '/data/modello-accredito-rimborsi-schema.json',
  '/data/modello-aa5-6-schema.json',
  '/assets/icon.svg',
  '/assets/icon.png',
  '/assets/og-image.png',
  // --- Aggiunte automaticamente ---
  '/',
  '/avviso-legale/',
  '/cittadino-tasse/analizzatore-bolletta/',
  '/contatti/',
  '/ia/assistente-documenti/',
  '/lavoro-contratti/analizzatore-busta-paga/',
  '/politica-sulla-privacy/',
  // --- Aggiunte automaticamente ---
  '/',
  '/cittadino-tasse/consumo-elettrodomestici/',
  '/identita-burocrazia/disdetta/',
  '/utilita-web/costo-ricarica-auto-elettrica/',
  '/utilita-web/prezzo-unitario/'
];

const BLOCKED_HOSTS = [
  'pagead2.googlesyndication.com',
  'googlesyndication.com',
  'google.com',
  'doubleclick.net',
  'google-analytics.com'
];

function isBlockedRequest(url) {
  return BLOCKED_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith('.' + host));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    ).finally(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Statici (js, css, dati, immagini): prima la cache, aggiornandola in secondo
// piano. Prima era rete-per-tutto, quindi i 14 MB precaricati non
// acceleravano niente e servivano solo offline.
const STATICI = /^\/(js|css|assets|data|vendor)\//;

function aggiornaInSecondoPiano(request) {
  return fetch(request).then((risposta) => {
    if (risposta && risposta.status === 200 && risposta.type === 'basic') {
      const copia = risposta.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
    }
    return risposta;
  });
}

async function riceviCondivisione(request) {
  try {
    const dati = await request.formData();
    const C = self.Condivisi;
    const file = dati.getAll('file').filter((f) => f && typeof f !== 'string' && f.size);
    if (file.length && C) {
      await C.salva(C.stessoGenere(file));
      return Response.redirect('/condividi/', 303);
    }
    // Solo testo o un link (per esempio da Chrome o WhatsApp): si pulisce.
    const testo = ['titolo', 'testo', 'link'].map((k) => dati.get(k)).filter(Boolean).join(' ').trim();
    if (testo) return Response.redirect('/utilita-web/pulisci-link/?text=' + encodeURIComponent(testo), 303);
  } catch (e) { /* si ripiega sulla pagina di scelta */ }
  return Response.redirect('/condividi/', 303);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/condividi/') {
    event.respondWith(riceviCondivisione(request));
    return;
  }

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (isBlockedRequest(url)) return;
  // Le statistiche di Vercel passano dritte: dalla cache misurerebbero visite
  // finte, e offline non hanno niente da misurare.
  if (url.pathname.startsWith('/_vercel/')) return;

  // Statici: risposta immediata dalla cache, aggiornamento silenzioso.
  if (STATICI.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((inCache) => {
        const dallaRete = aggiornaInSecondoPiano(request).catch(() => inCache);
        return inCache || dallaRete;
      })
    );
    return;
  }

  // Pagine: prima la rete, cosi i calcoli fiscali restano aggiornati.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('/');
          return undefined;
        })
      )
  );
});