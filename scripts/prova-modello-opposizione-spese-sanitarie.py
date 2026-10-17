"""Prova end-to-end del compilatore del modello di opposizione all'utilizzo dei
dati delle spese sanitarie per la precompilata.

Avvia un server locale sulla cartella del sito, guida il browser sulla pagina
vera e la compila come un genitore che fa opposizione per il figlio di 14 anni:
prima prova ad andare avanti senza barrare nessuna tipologia (deve fermarsi),
poi barra B ed E, scrive i suoi dati nel riquadro «Il sottoscritto» e quelli del
figlio nel riquadro della persona rappresentata. Scarica il PDF e confronta i
valori finiti nel modello, compresi quelli che devono restare vuoti.

Uso:  python scripts/prova-modello-opposizione-spese-sanitarie.py
      PROVA_CHROMIUM=/percorso/chromium per un Chromium preciso (senza: Edge)
"""
import sys, os, pathlib, tempfile, threading, http.server, functools, socketserver

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
SCARICATI = tempfile.mkdtemp(prefix="prova-opposizione-")

try:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e pypdf:  python -m pip install playwright pypdf\n"
             "e poi:  python -m playwright install msedge")

PORTA = 8834
URL = f"http://127.0.0.1:{PORTA}/cittadino-tasse/opposizione-spese-sanitarie/"
M = "OPPOSIZIONE"
esito = 0
errori = []

# persone inventate, codici fiscali con il carattere di controllo giusto
GENITORE = {"cf": "RSSMRC80A01L219O", "nome": "ROSSI MARCO", "luogo": "TORINO",
            "nascita": "1980-01-01", "tessera": "11112222333344445555", "scadenza": "2029-01-01"}
FIGLIO = {"cf": "RSSLCU12M15L219Q", "nome": "ROSSI LUCA", "luogo": "TORINO",
          "nascita": "2012-08-15", "tessera": "66667777888899990000", "scadenza": "2031-08-15"}


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def valori_pdf(percorso):
    r = PdfReader(percorso)
    fuori = {}
    for rif in r.trailer["/Root"]["/AcroForm"]["/Fields"]:
        c = rif.get_object()
        valore = c.get("/V")
        fuori[str(c.get("/T", ""))] = str(valore) if valore is not None else ""
    return fuori


def controlla(campi, attesi, vuoti=()):
    global esito
    for nome, atteso in attesi.items():
        ottenuto = campi.get(nome, "(campo assente)")
        ok = ottenuto == atteso
        if not ok:
            esito = 1
        print(f"  {'OK ' if ok else 'NO '} {nome}: {ottenuto!r}" + ("" if ok else f" (atteso {atteso!r})"))
    for nome in vuoti:
        ottenuto = campi.get(nome, "")
        ok = ottenuto in ("", "/Off")
        if not ok:
            esito = 1
        print(f"  {'OK ' if ok else 'NO '} {nome} resta vuoto: {ottenuto!r}")


def main():
    global esito
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORTA), functools.partial(Silenzioso, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    with sync_playwright() as pw:
        if os.environ.get("PROVA_CHROMIUM"):
            b = pw.chromium.launch(executable_path=os.environ["PROVA_CHROMIUM"], headless=True)
        else:
            b = pw.chromium.launch(channel="msedge", headless=True)
        ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 1100})
        pag = ctx.new_page()
        pag.on("pageerror", lambda e: errori.append(str(e)))
        pag.on("dialog", lambda d: d.accept())
        pag.goto(URL, wait_until="load")
        pag.wait_for_selector("#mp-app[data-pronto] #mp-corpo .mp-titolo", timeout=20000)

        passi = [t.replace(chr(10), " ").strip() for t in
                 pag.locator("#mp-passi .mp-passo-voce").all_inner_texts()]
        print("passi:", passi)
        if len(passi) != 4:
            print("  NO i passi dovrebbero essere 4")
            esito = 1

        def riempi(chiave, valore):
            sel = f'[data-campo="{M}.{chiave}"]'
            assert pag.locator(sel).count() > 0, f"campo assente: {chiave}"
            pag.fill(sel, valore)
            pag.dispatch_event(sel, "input")

        # --- senza nessuna tipologia non si va avanti ------------------------
        pag.click('[data-nav="avanti"]')
        pag.wait_for_timeout(400)
        fermo = pag.locator("#mp-corpo .mp-errore").count() == 1
        print("\nsenza tipologie il compilatore si ferma:", fermo)
        if not fermo:
            esito = 1
        # barrata una casella, l'errore sparisce
        pag.check(f'[data-campo="{M}.spese.b"]')
        pag.wait_for_timeout(300)
        sparito = pag.locator("#mp-corpo .mp-errore").count() == 0
        print("barrata una tipologia, l'errore sparisce:", sparito)
        if not sparito:
            esito = 1
        pag.check(f'[data-campo="{M}.spese.e"]')

        # --- chi firma: il genitore -----------------------------------------
        pag.click('[data-nav="avanti"]')
        pag.wait_for_timeout(300)
        riempi("sottoscritto.codiceFiscale", GENITORE["cf"])
        riempi("sottoscritto.cognomeNome", GENITORE["nome"])
        riempi("sottoscritto.luogoNascita", GENITORE["luogo"])
        riempi("sottoscritto.dataNascita", GENITORE["nascita"])
        riempi("sottoscritto.tessera", "1111 2222 3333 4444 5555")
        riempi("sottoscritto.scadenza", GENITORE["scadenza"])

        # un numero di tessera troppo lungo va rifiutato
        valore_prima = pag.input_value(f'[data-campo="{M}.sottoscritto.tessera"]')
        riempi("sottoscritto.tessera", "123456789012345678901")
        pag.click('[data-nav="avanti"]')
        pag.wait_for_timeout(400)
        rifiutato = pag.locator("#mp-corpo .mp-errore").count() > 0
        print("\nnumero di tessera di 21 cifre rifiutato:", rifiutato)
        if not rifiutato:
            esito = 1
        riempi("sottoscritto.tessera", valore_prima)
        pag.click('[data-nav="avanti"]')
        pag.wait_for_timeout(300)

        # --- la persona rappresentata: il figlio -----------------------------
        pag.check('[data-attiva="rappresentato"]')
        pag.wait_for_timeout(400)
        riempi("rappresentato.codiceFiscale", FIGLIO["cf"])
        riempi("rappresentato.cognomeNome", FIGLIO["nome"])
        riempi("rappresentato.luogoNascita", FIGLIO["luogo"])
        riempi("rappresentato.dataNascita", FIGLIO["nascita"])
        riempi("rappresentato.tessera", FIGLIO["tessera"])
        riempi("rappresentato.scadenza", FIGLIO["scadenza"])
        pag.click('[data-nav="avanti"]')
        pag.wait_for_timeout(300)

        # --- luogo e data ----------------------------------------------------
        riempi("firma.luogo", "TORINO")
        riempi("firma.data", "2026-10-19")

        # nessun codice fiscale ne' numero di tessera nella memoria del browser
        salvato = pag.evaluate("() => Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\\n')")
        trapelati = [x for x in (GENITORE["cf"], FIGLIO["cf"], GENITORE["tessera"], FIGLIO["tessera"]) if x in salvato]
        print("\ndati sensibili nella memoria del browser:", trapelati or "nessuno")
        if trapelati:
            esito = 1

        with pag.expect_download(timeout=30000) as info:
            pag.click('[data-nav="genera"]')
        d = info.value
        percorso = os.path.join(SCARICATI, d.suggested_filename)
        d.save_as(percorso)
        print("scaricato:", d.suggested_filename)
        b.close()
    srv.shutdown()

    campi = valori_pdf(percorso)
    print("\n--- valori nel PDF ---")
    controlla(campi, {
        "B": "/On",
        "E": "/On",
        "Codice Fiscale": GENITORE["cf"],
        "Cognome e Nome": GENITORE["nome"],
        "Luogo di nascita": GENITORE["luogo"],
        "Data di nascita": "01/01/1980",
        "Tessera sanitaria n": GENITORE["tessera"],
        "Data di scadenza": "01/01/2029",
        "Codice Fiscale rappresentante/tutore": FIGLIO["cf"],
        "Cognome e Nome rappresentante/tutore": FIGLIO["nome"],
        "Luogo di nascita rappresentante/tutore": FIGLIO["luogo"],
        "Data di nascita rappresentante / tutore": "15/08/2012",
        "Tessera sanitaria rappresentante/tutore": FIGLIO["tessera"],
        "Datadi scadenza rappresentante/tutore": "15/08/2031",
        "luogo_firma": "TORINO",
        "data_firma": "19/10/2026",
    }, vuoti=("A", "C", "D", "F"))

    if errori:
        print("\nerrori JavaScript nella pagina:", errori)
        esito = 1
    print("\nTUTTO BENE" if not esito else "\nCI SONO PROBLEMI")
    return esito


if __name__ == "__main__":
    sys.exit(main())
