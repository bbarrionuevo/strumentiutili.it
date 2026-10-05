"""Immagini dei modelli ufficiali compilati con un esempio (dati inventati).

Ogni immagine nasce dal compilatore vero: lo script apre la pagina in un
browser, scrive i dati dell'esempio nei campi, scarica il PDF ufficiale che
produce la pagina e ne disegna la prima facciata con pdf.js (vendor/). Ne
ritaglia la parte compilata e la salva in WebP in assets/esempi/. Se cambia lo
schema o il modello, basta rilanciare lo script: l'immagine resta fedele a
cio' che scarica chi usa il sito.

Uso:  python scripts/genera-esempi-moduli.py [nome ...]
      PROVA_CHROMIUM=/percorso/chromium per un Chromium preciso (senza: Edge)
"""
import base64, functools, http.server, io, os, pathlib, socketserver, sys, threading

ROOT = pathlib.Path(__file__).resolve().parent.parent
USCITA = ROOT / "assets" / "esempi"

try:
    from playwright.sync_api import sync_playwright
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e Pillow:  python -m pip install playwright pillow")

PORTA = 8773

# Gli esempi: pagina, campi da scrivere (chiave dello schema -> valore), righe
# da aggiungere e il ritaglio della prima facciata (frazioni di larghezza e
# altezza: sinistra, alto, destra, basso). Su ogni immagine si scrive
# «ESEMPIO · DATI INVENTATI», perche' nessuno la scambi per un modello vero.
ESEMPI = {
    "f24-elide-annualita": {
        "pagina": "/cittadino-tasse/f24-editabile/f24-elide/",
        "modello": "ELIDE",
        "passi": [
            {
                "contribuente.cf": "RSSMRA85T10H501O",
                "contribuente.cognome": "ROSSI",
                "contribuente.nome": "MARIO",
                "contribuente.nascitaGiorno": "10",
                "contribuente.nascitaMese": "12",
                "contribuente.nascitaAnno": "1985",
                "contribuente.sesso": "M",
                "contribuente.comuneNascita": "ROMA",
                "contribuente.provinciaNascita": "RM",
                "contribuente.domicilioComune": "ROMA",
                "contribuente.domicilioProvincia": "RM",
                "contribuente.domicilioVia": "VIA DI ESEMPIO 1",
                "contribuente.cfCoobbligato": "BNCLRA90A41F205I",
                "contribuente.codiceIdentificativo": "63",
            },
            {
                "erario.riga.0.tipo": "F",
                "erario.riga.0.elementi": "TMD2403012345000",
                "erario.riga.0.codice": "1501",
                "erario.riga.0.anno": "2026",
                "erario.riga.0.debito": "156,00",
            },
        ],
        "firma": "MARIO ROSSI",
        "ritaglio": (0.0, 0.0, 1.0, 0.43),
        "larghezza": 1100,
    },
}


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def scrivi(pag, modello, chiave, valore):
    sel = f'[data-campo="{modello}.{chiave}"]'
    pag.wait_for_selector(sel, timeout=8000)
    if pag.eval_on_selector(sel, "e => e.tagName") == "SELECT":
        pag.select_option(sel, valore)
    else:
        pag.fill(sel, valore)
        pag.dispatch_event(sel, "input")
    pag.dispatch_event(sel, "change")


def compila(ctx, esempio):
    pag = ctx.new_page()
    errori = []
    pag.on("pageerror", lambda e: errori.append(str(e)))
    pag.on("dialog", lambda d: d.accept())
    pag.goto(f"http://127.0.0.1:{PORTA}{esempio['pagina']}", wait_until="domcontentloaded")
    pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)
    m = esempio["modello"]
    for i, campi in enumerate(esempio["passi"]):
        if i:
            pag.click('[data-nav="avanti"]')
            pag.wait_for_timeout(300)
        for chiave, valore in campi.items():
            scrivi(pag, m, chiave, valore)
    voci = pag.locator("#mp-passi .mp-passo-voce")
    voci.nth(voci.count() - 1).click()
    pag.wait_for_timeout(300)
    if esempio.get("firma"):
        scrivi(pag, m, "chiusura.firma", esempio["firma"])
    with pag.expect_download(timeout=30000) as info:
        pag.click('[data-nav="genera"]')
    with open(info.value.path(), "rb") as f:
        pdf = f.read()
    if errori:
        raise SystemExit(f"Errori nella pagina: {errori}")
    pag.close()
    return pdf


def disegna(ctx, pdf, larghezza):
    """La prima facciata del PDF come PNG, disegnata da pdf.js nel browser."""
    pag = ctx.new_page()
    pag.goto(f"http://127.0.0.1:{PORTA}/robots.txt")
    pag.add_script_tag(url="/vendor/pdfjs@3.11.174/pdf.min.js")
    dati = pag.evaluate(
        """async ([b64, larghezza]) => {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs@3.11.174/pdf.worker.min.js';
          const byte = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const doc = await pdfjsLib.getDocument({ data: byte }).promise;
          const p = await doc.getPage(1);
          const base = p.getViewport({ scale: 1 });
          const vista = p.getViewport({ scale: larghezza / base.width });
          const tela = document.createElement('canvas');
          tela.width = Math.round(vista.width);
          tela.height = Math.round(vista.height);
          const c = tela.getContext('2d');
          c.fillStyle = '#fff';
          c.fillRect(0, 0, tela.width, tela.height);
          await p.render({ canvasContext: c, viewport: vista, annotationMode: pdfjsLib.AnnotationMode.ENABLE }).promise;
          return tela.toDataURL('image/png');
        }""",
        [base64.b64encode(pdf).decode(), larghezza],
    )
    pag.close()
    return Image.open(io.BytesIO(base64.b64decode(dati.split(",", 1)[1])))


def etichetta(img):
    """«ESEMPIO · DATI INVENTATI» in rosso, in alto a destra."""
    d = ImageDraw.Draw(img)
    testo = "ESEMPIO \u00b7 DATI INVENTATI"
    font = ImageFont.load_default(size=max(16, img.size[0] // 40))
    l, a, r, g = d.textbbox((0, 0), testo, font=font)
    x = img.size[0] - (r - l) - img.size[0] // 20
    y = img.size[0] // 14
    m = img.size[0] // 110
    d.rectangle((x - m, y - m, x + (r - l) + m, y + (g - a) + m + 2), fill="white", outline="#b91c1c", width=2)
    d.text((x - l, y - a), testo, fill="#b91c1c", font=font)


def main(nomi):
    USCITA.mkdir(parents=True, exist_ok=True)
    gestore = functools.partial(Silenzioso, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer(("127.0.0.1", PORTA), gestore)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            if os.environ.get("PROVA_CHROMIUM"):
                b = pw.chromium.launch(executable_path=os.environ["PROVA_CHROMIUM"], headless=True)
            else:
                b = pw.chromium.launch(channel="msedge", headless=True)
            ctx = b.new_context(accept_downloads=True, service_workers="block")
            for nome in nomi:
                esempio = ESEMPI[nome]
                pdf = compila(ctx, esempio)
                img = disegna(ctx, pdf, esempio["larghezza"])
                l, a, r, g = esempio["ritaglio"]
                w, h = img.size
                img = img.crop((round(l * w), round(a * h), round(r * w), round(g * h))).convert("RGB")
                etichetta(img)
                dest = USCITA / f"{nome}.webp"
                img.save(dest, "WEBP", quality=82, method=6)
                print(f"{dest.relative_to(ROOT)}: {img.size[0]}x{img.size[1]}, {dest.stat().st_size // 1024} KB")
            b.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    scelti = sys.argv[1:] or list(ESEMPI)
    sconosciuti = [n for n in scelti if n not in ESEMPI]
    if sconosciuti:
        sys.exit(f"Esempi sconosciuti: {', '.join(sconosciuti)}")
    main(scelti)
