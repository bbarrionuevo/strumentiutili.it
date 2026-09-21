"""Verifica che il consenso comandi la personalizzazione, non l'esistenza dell'annuncio.

Cookiebot non si carica su 127.0.0.1 (il dominio non e' autorizzato nel suo
pannello), quindi qui se ne finge uno: si scrive window.Cookiebot con lo stato
del consenso e si lancia l'evento che il vero Cookiebot lancerebbe. Quello che
si controlla e' la reazione della pagina, che e' il pezzo scritto da noi.

Attese:
  - all'avvio, prima che il consenso sia noto:  requestNonPersonalizedAds = 1
  - consenso rifiutato:                         1  (annunci non personalizzati)
  - consenso accettato:                         0  (annunci personalizzati)
  - l'etichetta di AdSense non dev'essere mai bloccata da Cookiebot

Uso:  python scripts/prova-consenso-adsense.py
"""
import sys, pathlib, threading, http.server, functools, socketserver

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sys.exit("Serve playwright:  python -m pip install playwright")

PORTA = 8867
PAGINE = ["/", "/cittadino-tasse/f24-editabile/f24-ordinario/",
          "/identita-burocrazia/codice-fiscale-enti/"]
esito = 0


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def stato(pag):
    return pag.evaluate("() => window.adsbygoogle && window.adsbygoogle.requestNonPersonalizedAds")


def finge_cookiebot(pag, marketing, evento):
    pag.evaluate("""([m, e]) => {
        window.Cookiebot = { consent: { marketing: m, statistics: m, preferences: m } };
        window.dispatchEvent(new Event(e));
    }""", [marketing, evento])


def main():
    global esito
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORTA), functools.partial(Silenzioso, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge", headless=True)
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        for percorso in PAGINE:
            pag = ctx.new_page()
            # nessuna chiamata vera a Google né a Cookiebot
            pag.route("**/pagead2.googlesyndication.com/**", lambda r: r.abort())
            pag.route("**/consent.cookiebot.com/**", lambda r: r.abort())
            pag.goto("http://127.0.0.1:%d%s" % (PORTA, percorso), wait_until="domcontentloaded")
            pag.wait_for_timeout(250)

            prove = [("prima del consenso", None, None, 1)]
            iniziale = stato(pag)

            finge_cookiebot(pag, False, "CookiebotOnDecline")
            rifiutato = stato(pag)

            finge_cookiebot(pag, True, "CookiebotOnAccept")
            accettato = stato(pag)

            finge_cookiebot(pag, False, "CookiebotOnConsentReady")
            ritirato = stato(pag)

            # l'etichetta di AdSense non deve essere stata disinnescata
            tipo = pag.evaluate("""() => {
                const s = document.querySelector('script[src*="googlesyndication"]');
                return s ? (s.getAttribute('type') || 'javascript') + '|' +
                           (s.hasAttribute('data-cookieconsent') ? 'ignore' : 'bloccabile') : 'assente';
            }""")

            atteso = (1, 1, 0, 1)
            ottenuto = (iniziale, rifiutato, accettato, ritirato)
            ok = ottenuto == atteso and tipo == "javascript|ignore"
            if not ok:
                esito = 1
            print("%s %-46s avvio=%s rifiuto=%s accetto=%s ritiro=%s  tag=%s"
                  % ("OK " if ok else "NO ", percorso, iniziale, rifiutato, accettato, ritirato, tipo))
            if not ok:
                print("      atteso avvio=1 rifiuto=1 accetto=0 ritiro=1, tag=javascript|ignore")
            pag.close()
        b.close()
    srv.shutdown()

    print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
