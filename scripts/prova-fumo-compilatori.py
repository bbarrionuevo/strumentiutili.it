"""Prova di fumo: ogni pagina che usa il motore dei moduli deve avviarsi,
mostrare i passi e non lanciare errori JavaScript."""
import sys, threading, http.server, functools, socketserver
from playwright.sync_api import sync_playwright

import pathlib
ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
PORTA = 8823
PAGINE = [
    "/cittadino-tasse/modello-rli/",
    "/fisco-professioni/modelli-partita-iva/",
    "/identita-burocrazia/richiesta-codice-fiscale/",
    "/identita-burocrazia/codice-fiscale-enti/",
    "/cittadino-tasse/modello-69/",
    "/cittadino-tasse/modello-rap/",
    "/cittadino-tasse/accredito-rimborsi/",
    "/cittadino-tasse/f24-editabile/f24-ordinario/",
    "/cittadino-tasse/f24-editabile/f24-semplificato/",
    "/cittadino-tasse/f24-editabile/f24-elide/",
    "/cittadino-tasse/f24-editabile/f24-accise/",
    "/cittadino-tasse/f24-editabile/f23-editabile/",
]
esito = 0

class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORTA), functools.partial(Silenzioso, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as pw:
    b = pw.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1280, "height": 1000})
    for percorso in PAGINE:
        pag = ctx.new_page()
        errori = []
        pag.on("pageerror", lambda e: errori.append(str(e)))
        try:
            pag.goto("http://127.0.0.1:%d%s" % (PORTA, percorso), wait_until="load")
            pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)
            passi = pag.locator("#mp-passi .mp-passo-voce").count()
            campi = pag.locator("#mp-corpo [data-campo]").count()
            # si arriva fino in fondo cliccando l'ultima voce
            pag.locator("#mp-passi .mp-passo-voce").nth(passi - 1).click()
            pag.wait_for_timeout(250)
            genera = pag.locator('[data-nav="genera"]').count()
        except Exception as e:
            print("NO  %-48s %s" % (percorso, str(e).splitlines()[0][:90]))
            esito = 1
            pag.close()
            continue
        vivi = [x for x in errori if "consent" not in x.lower()]
        ok = passi > 0 and campi > 0 and genera == 1 and not vivi
        if not ok: esito = 1
        print("%s %-48s passi=%-2d campi=%-3d genera=%d%s"
              % ("OK " if ok else "NO ", percorso, passi, campi, genera,
                 "" if not vivi else "  ERRORI: " + str(vivi[:2])))
        pag.close()

    # il ponte dal validatore IBAN verso il modello dei rimborsi
    pag = ctx.new_page()
    pag.goto("http://127.0.0.1:%d/identita-burocrazia/validatore-iban/" % PORTA, wait_until="load")
    pag.wait_for_selector("#iban-input", timeout=15000)
    stati = {}
    for etichetta, valore in (("vuoto", ""), ("IT valido", "IT60 X054 2811 1010 0000 0123 456"),
                              ("estero", "DE89 3704 0044 0532 0130 00")):
        pag.fill("#iban-input", valore)
        pag.dispatch_event("#iban-input", "input")
        pag.wait_for_timeout(180)
        stati[etichetta] = pag.is_visible("#collegamento-rimborsi")
    atteso = {"vuoto": False, "IT valido": True, "estero": False}
    ok = stati == atteso
    if not ok: esito = 1
    print("%s %-48s %s" % ("OK " if ok else "NO ", "ponte validatore IBAN -> rimborsi", stati))
    pag.close()
    b.close()
srv.shutdown()
print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
sys.exit(esito)
