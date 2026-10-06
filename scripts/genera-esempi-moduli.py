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

# Gli esempi: pagina, passi da compilare e ritaglio della prima facciata
# (frazioni di larghezza e altezza: sinistra, alto, destra, basso). Ogni passo
# ha i «campi» (chiave dello schema -> valore) e, se serve, il «passo» da aprire
# (una parte del suo titolo) e la sezione da «attiva»re; senza «passo» si va
# avanti di uno. Su ogni immagine si scrive
# «ESEMPIO · DATI INVENTATI», perche' nessuno la scambi per un modello vero.
ESEMPI = {
    "f24-elide-annualita": {
        "pagina": "/cittadino-tasse/f24-editabile/f24-elide/",
        "modello": "ELIDE",
        "passi": [
            {"campi": {
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
            }},
            {"campi": {
                "erario.riga.0.tipo": "F",
                "erario.riga.0.elementi": "TMD2403012345000",
                "erario.riga.0.codice": "1501",
                "erario.riga.0.anno": "2026",
                "erario.riga.0.debito": "156,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        "ritaglio": (0.0, 0.0, 1.0, 0.43),
        "larghezza": 1100,
    },
    # L'esempio ufficiale dell'Agenzia delle Entrate per il codice 2814 (ricerca
    # codici tributo, «Come compilare il modello F24»): ente D, provincia RM,
    # codice identificativo RMY00240W, 6.000,00 euro; il contribuente e' inventato
    "f24-accise-gas": {
        "pagina": "/cittadino-tasse/f24-editabile/f24-accise/",
        "modello": "ACCISE",
        "passi": [
            {"campi": {
                "contribuente.cf": "RSSMRA85T10H501O",
                "contribuente.cognome": "ROSSI",
                "contribuente.nome": "MARIO",
            }},
            {"passo": "Accise", "attiva": "accise", "campi": {
                "accise.riga.0.ente": "D",
                "accise.riga.0.prov": "RM",
                "accise.riga.0.tributo": "2814",
                "accise.riga.0.identificativo": "RMY00240W",
                "accise.riga.0.debito": "6000,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        # due ritagli: il contribuente e la sezione accise; in mezzo le
        # sezioni rimaste vuote
        "ritaglio": [(0.0, 0.0, 1.0, 0.258), (0.0, 0.6855, 1.0, 0.865)],
        "salto": "Sezioni Erario, INPS, Regioni e IMU: vuote",
        "larghezza": 1100,
    },
    # Un credito IRPEF (codice 4001, come nell'esempio ufficiale «importo a
    # credito») usato per l'acconto IMU di un immobile a Roma (codice 3918,
    # come nell'esempio ufficiale: H501, acconto, un immobile): il modello
    # chiude a zero. Contribuente e importi sono inventati
    "f24-ordinario-compensazione": {
        "pagina": "/cittadino-tasse/f24-editabile/f24-ordinario/",
        "modello": "F24",
        "passi": [
            {"campi": {
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
            }},
            {"passo": "Erario", "campi": {
                "erario.riga.0.tributo": "4001",
                "erario.riga.0.rateazione": "0101",
                "erario.riga.0.anno": "2025",
                "erario.riga.0.credito": "413,00",
            }},
            {"passo": "IMU", "attiva": "imu", "campi": {
                "imu.riga.0.ente": "H501",
                "imu.riga.0.acconto": "X",
                "imu.riga.0.numImmobili": "1",
                "imu.riga.0.tributo": "3918",
                "imu.riga.0.anno": "2026",
                "imu.riga.0.debito": "413,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        # contribuente ed Erario, la sezione IMU, la firma con il saldo finale
        "ritaglio": [(0.0, 0.0, 1.0, 0.385), (0.0, 0.584, 1.0, 0.685), (0.0, 0.828, 1.0, 0.868)],
        "salto": ["Sezioni INPS e Regioni: vuote", "Sezione altri enti previdenziali e assicurativi: vuota"],
        "larghezza": 1100,
    },
    # Acconto IMU di una seconda casa a Roma (A/2, rendita 750, 10,6 per mille:
    # 1.336 euro l'anno, acconto 668) e prima di due rate della TARI, sulla
    # stessa facciata del semplificato
    "f24-semplificato-imu-tari": {
        "pagina": "/cittadino-tasse/f24-editabile/f24-semplificato/",
        "modello": "SEMPLIFICATO",
        "passi": [
            {"campi": {
                "contribuente.cf": "RSSMRA85T10H501O",
                "contribuente.cognome": "ROSSI",
                "contribuente.nome": "MARIO",
                "contribuente.nascitaGiorno": "10",
                "contribuente.nascitaMese": "12",
                "contribuente.nascitaAnno": "1985",
                "contribuente.sesso": "M",
                "contribuente.comuneNascita": "ROMA",
                "contribuente.provinciaNascita": "RM",
            }},
            {"passo": "Motivo del pagamento", "campi": {
                "pagamento.riga.0.sezione": "EL",
                "pagamento.riga.0.tributo": "3918",
                "pagamento.riga.0.ente": "H501",
                "pagamento.riga.0.acconto": "X",
                "pagamento.riga.0.numImmobili": "1",
                "pagamento.riga.0.anno": "2026",
                "pagamento.riga.0.debito": "668,00",
            }},
            {"passo": "Motivo del pagamento", "aggiungi": "pagamento|riga", "campi": {
                "pagamento.riga.1.sezione": "EL",
                "pagamento.riga.1.tributo": "3944",
                "pagamento.riga.1.ente": "H501",
                "pagamento.riga.1.numImmobili": "1",
                "pagamento.riga.1.rateazione": "0102",
                "pagamento.riga.1.anno": "2026",
                "pagamento.riga.1.debito": "210,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        # contribuente, righe e saldo finale: gli estremi del versamento li
        # compila la banca
        "ritaglio": (0.0, 0.0, 1.0, 0.418),
        "larghezza": 1100,
    },
    # Registro su una sentenza (3% di 20.000 euro, codice 109T, causale RG):
    # attore e convenuto, ufficio ed estremi dell'atto sono inventati
    "f23-registro-sentenza": {
        "pagina": "/cittadino-tasse/f24-editabile/f23-editabile/",
        "modello": "F23",
        "passi": [
            {"passo": "Chi versa", "campi": {
                "contribuente.cognome": "ROSSI",
                "contribuente.nome": "MARIO",
                "contribuente.cf": "RSSMRA85T10H501O",
                "contribuente.nascitaGiorno": "10",
                "contribuente.nascitaMese": "12",
                "contribuente.nascitaAnno": "1985",
                "contribuente.sesso": "M",
                "contribuente.comuneNascita": "ROMA",
                "contribuente.provinciaNascita": "RM",
            }},
            {"passo": "Controparte", "attiva": "controparte", "campi": {
                "controparte.cognome": "BIANCHI",
                "controparte.nome": "LAURA",
                "controparte.cf": "BNCLRA90H55F205M",
                "controparte.nascitaGiorno": "15",
                "controparte.nascitaMese": "6",
                "controparte.nascitaAnno": "1990",
                "controparte.sesso": "F",
                "controparte.comuneNascita": "MILANO",
                "controparte.provinciaNascita": "MI",
            }},
            {"passo": "Dati del versamento", "campi": {
                "versamento.ufficioCodice": "TMD",
                "versamento.causale": "RG",
                "versamento.attoAnno": "2026",
                "versamento.attoNumero": "12345",
            }},
            {"passo": "Tributi", "campi": {
                "tributi.riga.0.codice": "109T",
                "tributi.riga.0.importo": "600,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        "ritaglio": (0.0, 0.0, 1.0, 0.745),
        # il timbro dentro il riquadro vuoto del campo 1, per non coprire i titoli
        "etichetta_y": 0.102,
        "larghezza": 1100,
    },
}


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def scrivi(pag, modello, chiave, valore):
    sel = f'[data-campo="{modello}.{chiave}"]'
    pag.wait_for_selector(sel, timeout=8000)
    if pag.eval_on_selector(sel, "e => e.type") == "checkbox":
        # le caselle da barrare (acconto, saldo...): «X» le spunta
        pag.set_checked(sel, bool(valore))
    elif pag.eval_on_selector(sel, "e => e.tagName") == "SELECT":
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
    for i, passo in enumerate(esempio["passi"]):
        if passo.get("passo"):
            voci = pag.locator("#mp-passi .mp-passo-voce")
            titoli = [t.replace("\n", " ") for t in voci.all_inner_texts()]
            voci.nth([k for k, t in enumerate(titoli) if passo["passo"] in t][0]).click()
            pag.wait_for_timeout(300)
        elif i:
            pag.click('[data-nav="avanti"]')
            pag.wait_for_timeout(300)
        if passo.get("attiva"):
            pag.check(f'[data-attiva="{passo["attiva"]}"]')
            pag.wait_for_timeout(400)
        if passo.get("aggiungi"):
            # una riga in piu' nel gruppo ripetibile («passo|gruppo»)
            pag.click(f'[data-aggiungi="{passo["aggiungi"]}"]')
            pag.wait_for_timeout(300)
        for chiave, valore in passo["campi"].items():
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


def ritaglia(img, ritaglio, salto):
    """Il ritaglio della facciata; con piu' ritagli, uno sotto l'altro, separati
    da una fascia grigia che dice cosa e' stato tolto (un testo per ogni fascia,
    oppure lo stesso per tutte)."""
    w, h = img.size
    pezzi = [img.crop((round(l * w), round(a * h), round(r * w), round(g * h))).convert("RGB")
             for l, a, r, g in (ritaglio if isinstance(ritaglio, list) else [ritaglio])]
    if len(pezzi) == 1:
        return pezzi[0]
    fascia = max(28, w // 30)
    alto = sum(p.size[1] for p in pezzi) + fascia * (len(pezzi) - 1)
    tela = Image.new("RGB", (max(p.size[0] for p in pezzi), alto), "white")
    d = ImageDraw.Draw(tela)
    font = ImageFont.load_default(size=max(13, w // 70))
    y = 0
    for i, p in enumerate(pezzi):
        if i:
            testo = salto[i - 1] if isinstance(salto, list) else salto
            d.rectangle((0, y, tela.size[0], y + fascia - 1), fill="#e5e7eb")
            l, a, r, g = d.textbbox((0, 0), testo, font=font)
            d.text(((tela.size[0] - (r - l)) // 2 - l, y + (fascia - (g - a)) // 2 - a), testo, fill="#4b5563", font=font)
            y += fascia
        tela.paste(p, (0, y))
        y += p.size[1]
    return tela


def etichetta(img, y_frazione=None):
    """«ESEMPIO · DATI INVENTATI» in rosso, in alto a destra (o all'altezza
    indicata, in frazioni della larghezza)."""
    d = ImageDraw.Draw(img)
    testo = "ESEMPIO \u00b7 DATI INVENTATI"
    font = ImageFont.load_default(size=max(16, img.size[0] // 40))
    l, a, r, g = d.textbbox((0, 0), testo, font=font)
    x = img.size[0] - (r - l) - img.size[0] // 20
    y = round(img.size[0] * y_frazione) if y_frazione else img.size[0] // 14
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
                img = ritaglia(img, esempio["ritaglio"], esempio.get("salto", ""))
                etichetta(img, esempio.get("etichetta_y"))
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
