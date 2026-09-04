// sw.js — Service Worker per StrumentiUtili.it
const CACHE_NAME = 'strumentiutili-v11';

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/css/styles.css',

  // --- Silo Lavoro ---
  '/lavoro/',
  '/lavoro/stipendio-netto/',
  '/lavoro/partita-iva/',
  '/lavoro/ritenuta-acconto/',
  '/lavoro/ricevuta-prestazione-occasionale/',
  '/lavoro/calcolo-tfr/',
  '/lavoro/assegno-unico/',

  // --- Silo Burocrazia ---
  '/burocrazia/',
  '/burocrazia/f24-editabile/',
  '/burocrazia/f24-editabile/f24-ordinario/',
  '/burocrazia/f24-editabile/f24-semplificato/',
  '/burocrazia/f24-editabile/f24-elide/',
  '/burocrazia/f24-editabile/f24-accise/',
  '/burocrazia/f24-editabile/f23-editabile/',
  '/burocrazia/fattura-elettronica/',
  '/burocrazia/simulatore-isee/',
  '/burocrazia/codice-fiscale/',
  '/burocrazia/calcolo-iva/',
  '/burocrazia/ravvedimento-operoso/',
  '/burocrazia/autocertificazione/',

  // --- Silo Finanza ---
  '/finanza/',
  '/finanza/validatore-iban/',
  '/finanza/interessi-composti/',

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

  // --- Silo Media ---
  '/media/',
  '/media/generatore-qr/',
  '/media/convertitore-immagini/',
  '/media/contaparole/',

  // Pagine Legali e Contatti
  '/contatti.html',
  '/politica-sulla-privacy.html',
  '/avviso-legale.html',

  // Script condivisi e utilità
  '/js/main.js',
  '/js/dropzone.js',
  '/js/error-utils.js',
  '/js/stipendio-netto.js',
  '/js/partita-iva.js',
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
  '/js/workers/worker-sample.js',
  '/js/workers/translation-worker.js',
  '/js/workers/p7m-worker.js',

  // Dataset e asset visivi
  '/data/comuni.json',
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