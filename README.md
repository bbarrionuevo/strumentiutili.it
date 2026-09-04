# StrumentiUtili.it

StrumentiUtili.it è un portale statico di micro‑strumenti pensato per il pubblico italiano: una raccolta di utility leggere, gratuite e interamente eseguite nel browser (100% client‑side). Il design privilegia la privacy, la semplicità d'uso e la compatibilità offline.

## Perché usare StrumentiUtili.it

- **Privacy e controllo:** tutti i calcoli e le elaborazioni vengono eseguiti localmente nel browser (Zero-Upload Policy). I file sensibili (DNI, CIE, XML, PDF) non abbandonano mai il dispositivo del cliente.
- **Performance e offline:** risorse e modelli vengono memorizzati nella cache del browser tramite Service Worker (`sw.js`) per utilizzi successivi senza connessione.
- **Deploy semplice:** sito statico compatibile con qualsiasi hosting o CDN (GitHub Pages, Vercel, Netlify).

## Categorie e struttura dei silos semantici (pSEO)

### 1) 💼 Lavoro e Stipendio
- **Calcolatore Stipendio Netto** — `/lavoro/stipendio-netto/`
- **Partita IVA Forfettaria 2026** — `/lavoro/partita-iva/`
- **Calcolo Ritenuta d'Acconto** — `/lavoro/ritenuta-acconto/`
- **Ricevuta Prestazione Occasionale** — `/lavoro/ricevuta-prestazione-occasionale/`
- **Calcolo TFR Liquidazione** — `/lavoro/calcolo-tfr/`
- **Simulatore Assegno Unico 2026** — `/lavoro/assegno-unico/`

### 2) 🏛️ Calcolatori Fiscali e Burocrazia
- **Suite Modelli F24 e F23 Editabili** — `/burocrazia/f24-editabile/`
- **Visualizzatore Fattura Elettronica (XML / .p7m)** — `/burocrazia/fattura-elettronica/`
- **Simulatore ISEE Ordinario 2026** — `/burocrazia/simulatore-isee/`
- **Generatore & Decodificatore Codice Fiscale** — `/burocrazia/codice-fiscale/`
- **Calcolo IVA** — `/burocrazia/calcolo-iva/`
- **Calcolo Ravvedimento Operoso** — `/burocrazia/ravvedimento-operoso/`
- **Generatore di Autocertificazione** — `/burocrazia/autocertificazione/`

### 3) 🏦 Finanza e Banche
- **Validatore IBAN & BIC/SWIFT** — `/finanza/validatore-iban/`
- **Calcolo Interessi Composti** — `/finanza/interessi-composti/`

### 4) 📄 Strumenti PDF e Scanner
- **Scanner Documenti & CIE (IA / OpenCV.js)** — `/pdf/scanner-documenti/`
- **Convertitore & Validatore PDF/A** — `/pdf/convertitore-pdfa/`
- **Suite PDF Tools (Organizza, Unisci, Dividi, Comprimi, Firma, Anonimizza)** — `/pdf/pdf-tools/`

### 5) 🤖 Intelligenza Artificiale Locale
- **Traduttore Documenti IA (Offline / ONNX)** — `/ia/traduttore/`
- **Riassunto Testo IA (Offline)** — `/ia/riassunto-testo/`
- **Estrazione Testo da Immagini / OCR (Tesseract.js)** — `/ia/ocr-immagini/`

### 6) 🎨 Media, Grafica e Testo
- **Generatore Codice QR** — `/media/generatore-qr/`
- **Convertitore Formato Immagini (WebP, PNG, JPEG, AVIF)** — `/media/convertitore-immagini/`
- **Contaparole e Caratteri** — `/media/contaparole/`

---

## Architettura tecnica

- **UI & Layout:** HTML5, Tailwind CSS.
- **Computer Vision:** WebAssembly / OpenCV.js per elaborazione fotometrica in tempo reale e rettificazione prospettica.
- **Generazione Documenti:** `pdf-lib` e `pdf.js` per manipolazione e rendering PDF lato client.
- **Machine Learning Client-Side:** ONNX Runtime Web / Transformers.js per modelli di traduzione e riassunto offline.
- **Service Worker:** Cache dinamica network-first (`sw.js`) per pieno supporto PWA e uso offline.
