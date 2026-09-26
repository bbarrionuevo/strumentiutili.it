"""Controlla i riquadri pubblicitari su un campione di pagine.

Tre cose, che sono i tre modi di farsi rifiutare o sospendere da AdSense:

1. Distanza dai comandi. Nessun elemento su cui si possa davvero cliccare deve
   trovarsi a meno di 24px da un riquadro. Non basta guardare le coordinate:
   una voce dentro a un menu chiuso ha una casella ma non e' raggiungibile, e
   contarla darebbe un falso allarme. Si verifica con elementFromPoint.

2. Spazio riservato. Finche' AdSense non manda annunci i riquadri non si
   vedono (src/input.css, --su-ad-riserva: 0). Qui si aprono le pagine con
   ?anteprima-pubblicita=1, che li mostra come dopo l'approvazione: ognuno
   deve avere un'altezza propria, altrimenti la pagina salta quando
   l'annuncio arriva (Cumulative Layout Shift).

3. Larghezza utile. Sotto i 300px AdSense non ha formati che rendano: un
   riquadro laterale piu' stretto e' spazio sprecato.

Uso:  python scripts/prova-pubblicita.py
"""
import sys, pathlib, threading, http.server, functools, socketserver

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sys.exit("Serve playwright:  python -m pip install playwright\n"
             "e poi:  python -m playwright install chromium")

PORTA = 8863
PAGINE = [
    "/",
    "/cittadino-tasse/",
    "/identita-burocrazia/",
    "/cittadino-tasse/f24-editabile/f24-ordinario/",
    "/identita-burocrazia/codice-fiscale-enti/",
    "/fisco-professioni/modelli-partita-iva/",
]
SCHERMI = {"computer": {"width": 1440, "height": 900}, "telefono": {"width": 390, "height": 844}}

DISTANZA_MINIMA = 24     # px fra un annuncio e qualcosa di cliccabile
LARGHEZZA_MINIMA = 300   # px sotto i quali AdSense non serve formati utili

esito = 0

MISURA = """() => {
  const fuori = [];
  document.querySelectorAll('.su-ad').forEach((c) => {
    const r = c.getBoundingClientRect();
    if (getComputedStyle(c).display === 'none' || r.height === 0) return;
    const ins = c.querySelector('ins.adsbygoogle');
    let peggiore = null;
    document.querySelectorAll('a,button,input,select,summary,textarea').forEach((e) => {
      const re = e.getBoundingClientRect();
      if (!re.width || !re.height || c.contains(e)) return;
      const dx = Math.max(r.left - re.right, re.left - r.right, 0);
      const dy = Math.max(r.top - re.bottom, re.top - r.bottom, 0);
      const d = Math.hypot(dx, dy);
      if (d > 40) return;
      // raggiungibile davvero? una voce dentro a un menu chiuso non lo e'
      const sopra = document.elementFromPoint(re.left + re.width / 2, re.top + re.height / 2);
      if (!(sopra && (sopra === e || e.contains(sopra) || sopra.contains(e)))) return;
      if (!peggiore || d < peggiore.d) {
        peggiore = {d: Math.round(d), t: (e.textContent || e.tagName).trim().slice(0, 26)};
      }
    });
    fuori.push({
      posizione: c.dataset.suPos || '?',
      largh: Math.round(r.width), alt: Math.round(r.height),
      formato: ins ? ins.getAttribute('data-ad-format') : null,
      vicino: peggiore
    });
  });
  return fuori;
}"""


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main():
    global esito
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORTA), functools.partial(Silenzioso, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True)
        for schermo, misure in SCHERMI.items():
            ctx = b.new_context(viewport=misure)
            print("\n=== %s (%dpx) ===" % (schermo, misure["width"]))
            for percorso in PAGINE:
                pag = ctx.new_page()
                # senza rete verso Google: si misura lo spazio riservato, che e'
                # quello che conta per il salto dell'impaginazione
                pag.route("**/pagead2.googlesyndication.com/**", lambda r: r.abort())
                pag.goto("http://127.0.0.1:%d%s?anteprima-pubblicita=1" % (PORTA, percorso), wait_until="load")
                pag.wait_for_timeout(500)
                riquadri = pag.evaluate(MISURA)
                problemi = []
                for r in riquadri:
                    if r["vicino"] and r["vicino"]["d"] < DISTANZA_MINIMA:
                        problemi.append("%s a %dpx da \"%s\""
                                        % (r["posizione"], r["vicino"]["d"], r["vicino"]["t"]))
                    if r["alt"] <= 0:
                        problemi.append("%s senza spazio riservato" % r["posizione"])
                    if r["posizione"] == "laterale" and r["largh"] < LARGHEZZA_MINIMA:
                        problemi.append("%s largo solo %dpx" % (r["posizione"], r["largh"]))
                ok = not problemi
                if not ok:
                    esito = 1
                print("%s %-46s %d riquadri  %s"
                      % ("OK " if ok else "NO ", percorso, len(riquadri),
                         " | ".join("%s %dx%d" % (r["posizione"], r["largh"], r["alt"])
                                    for r in riquadri)))
                for p in problemi:
                    print("      NO  %s" % p)
                pag.close()
            ctx.close()
        b.close()
    srv.shutdown()

    print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
