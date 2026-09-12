// sw.js — Service Worker per StrumentiUtili.it
const CACHE_NAME = 'strumentiutili-v15';

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/css/styles.css',

  // --- Silo Fisco & Professioni ---
  '/fisco-professioni/',
  '/fisco-professioni/calcolo-rata-mutuo/',
  '/fisco-professioni/rivalutazione-istat/',
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
  '/cittadino-tasse/imposte-acquisto-casa/',
  '/cittadino-tasse/calcolo-bollo-auto/',
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

  // --- Silo Lavoro & Contratti ---
  '/lavoro-contratti/',
  '/lavoro-contratti/calcolo-naspi/',
  '/lavoro-contratti/stipendio-netto/',
  '/lavoro-contratti/calcolo-tfr/',
  '/lavoro-contratti/ricevuta-prestazione-occasionale/',
  '/lavoro-contratti/ritenuta-acconto/',
  '/lavoro-contratti/giorni-lavorativi/',

  // --- Silo Identità & Burocrazia ---
  '/identita-burocrazia/',
  '/identita-burocrazia/calcolo-quote-ereditarie/',
  '/identita-burocrazia/codice-fiscale/',
  '/identita-burocrazia/validatore-iban/',
  '/identita-burocrazia/autocertificazione/',
  '/identita-burocrazia/fototessera/',
  '/identita-burocrazia/generatore-password/',

  // --- Silo PDF ---
  '/pdf/',
  '/pdf/unisci-dividi/',
  '/pdf/comprimi-converti/',
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
  '/utilita-web/acortador-url/',
  '/utilita-web/media-universitaria/',
  '/utilita-web/calcolo-bmr/',

  // Pagine Legali e Contatti
  '/contatti.html',
  '/politica-sulla-privacy.html',
  '/avviso-legale.html',

  // Script condivisi e utilità
  '/js/main.js',
  '/js/data-loader.js',
  '/js/dropzone.js',
  '/js/error-utils.js',
  '/js/storage-helper.js',
  
  // Script delle calcolatrici
  '/js/mutuo.js',
  '/js/rivalutazione-istat.js',
  '/js/imposte-casa.js',
  '/js/bollo-auto.js',
  '/js/passaggio-proprieta.js',
  '/js/naspi.js',
  '/js/successioni.js',
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
  '/js/f24.js',
  '/js/pdfa.js',
  '/js/scanner.js',
  '/js/pdf-tools.js',
  '/js/traduttore.js',
  '/js/riassunto.js',
  '/js/ocr.js',
  '/js/qr-code.js',
  '/js/convertitore-immagini.js',
  '/js/autocertificazione.js',
  '/js/percentuali.js',
  '/js/giorni-lavorativi.js',
  '/js/media-universitaria.js',
  '/js/calcolo-bmr.js',
  '/js/trascrizione.js',
  '/js/password.js',
  '/js/fototessera.js',
  '/js/shortener.js',

  // Web Workers
  '/js/workers/worker-sample.js',
  '/js/workers/translation-worker.js',
  '/js/workers/p7m-worker.js',
  '/js/workers/pdf-worker.js',
  '/js/workers/face-worker.js',

  // Dataset e asset visivi
  '/data/comuni.json',
  '/data/regole-fiscali-2026.json',
  '/assets/icon.svg',
  '/assets/icon.png',
  '/assets/og-image.png'
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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (isBlockedRequest(url)) return;

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