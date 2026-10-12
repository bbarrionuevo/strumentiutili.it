"""Prova end-to-end del compilatore dei modelli AA9/12 e AA7/10.

Avvia un server locale sulla cartella del sito, guida il browser sulla pagina
vera e scarica due PDF:

- AA9/12: inizio attivita' di una traduttrice nel regime forfetario (esempio 1
  della pagina). Prima prova il CAP generico di Bologna, 40100, che il
  compilatore deve segnalare senza dire che l'Agenzia «non lo accetta».
- AA7/10: inizio attivita' con attribuzione del codice fiscale (casella 1) di
  uno studio associato. Prima si sceglie la casella 3 e si scrive un codice
  fiscale del soggetto, poi si passa alla casella 1: in alto su ogni pagina deve
  andare il codice del rappresentante del quadro C, non quello rimasto.

Poi controlla i valori finiti nei moduli: codice attivita' nelle sue caselle,
date in caselle e su riga libera (20/10/2026), testata delle quattro pagine.

Uso:  python scripts/prova-modelli-piva.py
      PROVA_CHROMIUM=/percorso/chromium per un Chromium preciso (senza: Edge)
"""
import sys, os, pathlib, tempfile, threading, http.server, functools, socketserver

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
SC = tempfile.mkdtemp(prefix="prova-piva-")

try:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e pypdf:  python -m pip install playwright pypdf\n"
             "e poi:  python -m playwright install msedge")

PORTA = 8783
URL = f"http://127.0.0.1:{PORTA}/fisco-professioni/modelli-partita-iva/"
CF_TITOLARE = "VRDGLI90C55A944A"
CF_SOGGETTO_VECCHIO = "01234567890"
esito = 0
errori = []


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def valori_pdf(percorso):
    """Legge i valori dei campi direttamente dai dizionari dell'AcroForm."""
    r = PdfReader(percorso)
    fuori = {}
    for rif in r.trailer["/Root"]["/AcroForm"]["/Fields"]:
        c = rif.get_object()
        nome = str(c.get("/T", ""))
        valore = c.get("/V")
        fuori[nome] = str(valore) if valore is not None else ""
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


def verifica(cond, testo):
    global esito
    if not cond:
        esito = 1
    print(f"  {'OK ' if cond else 'NO '} {testo}")


class Modulo:
    def __init__(self, pag, modello):
        self.pag, self.m = pag, modello

    def sel(self, chiave):
        return f'[data-campo="{self.m}.{chiave}"]'

    def scrivi(self, chiave, valore):
        s = self.sel(chiave)
        self.pag.wait_for_selector(s, timeout=8000)
        tipo = self.pag.eval_on_selector(s, "e => e.tagName === 'SELECT' ? 'select' : e.type")
        if tipo == "radio":
            self.pag.check(f'{s}[value="{valore}"]')
        elif tipo == "checkbox":
            self.pag.set_checked(s, bool(valore))
        elif tipo == "select":
            self.pag.select_option(s, valore)
        else:
            self.pag.fill(s, valore)
            self.pag.dispatch_event(s, "input")
        self.pag.dispatch_event(s, "change")
        self.pag.wait_for_timeout(120)

    def passo(self, parte_del_titolo):
        voci = self.pag.locator("#mp-passi .mp-passo-voce")
        titoli = [t.replace("\n", " ") for t in voci.all_inner_texts()]
        voci.nth([k for k, t in enumerate(titoli) if parte_del_titolo in t][0]).click()
        self.pag.wait_for_timeout(300)

    def scarica(self, nome):
        self.passo("Firma")
        try:
            with self.pag.expect_download(timeout=30000) as info:
                self.pag.click('[data-nav="genera"]')
        except Exception:
            print("DOWNLOAD NON PARTITO. avviso:", self.pag.inner_text("#mp-stato").strip()[:160])
            print("campi segnalati:", [t.strip()[:80] for t in self.pag.locator("#mp-corpo .mp-errore").all_inner_texts()])
            raise
        percorso = os.path.join(SC, nome)
        info.value.save_as(percorso)
        print("\nscaricato:", info.value.suggested_filename)
        return percorso


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
        ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 1100}, service_workers="block")
        pag = ctx.new_page()
        pag.on("pageerror", lambda e: errori.append(str(e)))
        pag.on("dialog", lambda d: d.accept())
        pag.goto(URL, wait_until="domcontentloaded")
        pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)

        # --- AA9/12 --------------------------------------------------------
        print("--- AA9/12: inizio attivita' nel regime forfetario")
        f = Modulo(pag, "AA9")
        f.scrivi("quadroA.tipoDichiarazione", "1")
        f.scrivi("quadroA.cfContribuente", CF_TITOLARE)
        f.scrivi("quadroA.dataInizio", "2026-10-19")
        f.passo("Chi sei")
        f.scrivi("quadroB1.dittaNome", "VERDI GIULIA")
        f.passo("Attività e luogo")
        f.scrivi("quadroB2.codiceAteco", "743000")
        f.scrivi("quadroB2.descrizioneAttivita", "ATTIVITÀ DI TRADUZIONE E INTERPRETARIATO")
        f.scrivi("quadroB2.indirizzoSede", "VIA DI ESEMPIO 1")
        f.scrivi("quadroB2.capSede", "40100")
        f.scrivi("quadroB2.comuneSede", "BOLOGNA")
        f.scrivi("quadroB2.provinciaSede", "BO")
        f.scrivi("quadroB2.scrittureSede", "X")
        f.scrivi("quadroB2.regimeAgevolato", "2")
        # il CAP generico si segnala andando avanti
        pag.click('[data-nav="avanti"]')
        pag.wait_for_timeout(400)
        messaggi = " ".join(pag.locator("#mp-corpo .mp-errore").all_inner_texts())
        print("messaggio sul CAP 40100:", messaggi.strip()[:160])
        verifica("generico della città" in messaggi, "il CAP generico viene segnalato")
        verifica("non lo accetta" not in messaggi, "senza dire che l'Agenzia non lo accetta")
        f.passo("Attività e luogo")
        f.scrivi("quadroB2.capSede", "40121")
        f.passo("Titolare")
        f.scrivi("quadroC.dataNascita", "1990-03-15")
        f.scrivi("quadroC.comuneNascita", "BOLOGNA")
        f.scrivi("quadroC.provNascita", "BO")
        f.scrivi("quadroC.indirizzoRes", "VIA DI ESEMPIO 1")
        f.scrivi("quadroC.capRes", "40121")
        f.scrivi("quadroC.comuneRes", "BOLOGNA")
        f.scrivi("quadroC.provRes", "BO")
        f.passo("Firma")
        f.scrivi("firma.dataFirma", "2026-10-20")
        f.scrivi("firma.cfFirmatario", CF_TITOLARE)
        aa9 = f.scarica("aa9.pdf")

        # --- AA7/10 --------------------------------------------------------
        print("\n--- AA7/10: inizio attivita' con attribuzione del codice fiscale")
        pag.click('button[data-modello="AA7"]')
        pag.wait_for_timeout(600)
        s = Modulo(pag, "AA7")
        # una scelta precedente lascia in memoria un codice del soggetto
        s.scrivi("quadroA.tipoDichiarazione", "3")
        s.scrivi("quadroA.cfContribuente", CF_SOGGETTO_VECCHIO)
        s.scrivi("quadroA.tipoDichiarazione", "1")
        s.scrivi("quadroA.dataInizio1", "2026-10-19")
        s.passo("Dati identificativi")
        s.scrivi("quadroB1.denominazione", "STUDIO ASSOCIATO VERDI E NERI")
        s.scrivi("quadroB1.naturaGiuridica", "27")
        s.passo("Sede legale")
        s.scrivi("quadroB2.sedeIndirizzo", "VIA DI ESEMPIO 2")
        s.scrivi("quadroB2.sedeCap", "40121")
        s.scrivi("quadroB2.sedeComune", "BOLOGNA")
        s.scrivi("quadroB2.sedeProvincia", "BO")
        s.passo("Attività e luogo")
        s.scrivi("quadroB3.codiceAteco", "692001")
        s.scrivi("quadroB3.descrizioneAttivita", "ATTIVITÀ DI COMMERCIALISTI")
        # il luogo di esercizio coincide con la sede: resta vuoto
        s.passo("Rappresentante")
        s.scrivi("quadroC.cognomeRappr", "VERDI")
        s.scrivi("quadroC.nomeRappr", "GIULIA")
        s.scrivi("quadroC.codiceCarica", "1")
        s.scrivi("quadroC.cfRappr", CF_TITOLARE)
        s.passo("Firma")
        s.scrivi("firma.dataFirma", "2026-10-20")
        s.scrivi("firma.cfFirmatario", CF_TITOLARE)
        aa7 = s.scarica("aa7.pdf")
        b.close()
    srv.shutdown()

    print("\n--- valori nel PDF AA9/12 ---")
    controlla(valori_pdf(aa9), {
        "codice_fiscale_1p0j": CF_TITOLARE,
        "codice_fiscale_6w7h": CF_TITOLARE,
        "codice_fiscale_5s0u": CF_TITOLARE,
        "codice_fiscale_9q2l": CF_TITOLARE,
        "data_inizio_9r9g": "19102026",
        "ditta_ovvero_cognome_e_nome_4w3o": "VERDI GIULIA",
        "codice_attivita_8i2j": "743000",
        "c_a_p_quadro_b_5k7h": "40121",
        "regime_fiscale_agevolato_vedere_istruzioni_0l4l": "2",
        "data_7n1n": "20/10/2026",
    }, vuoti=("volume_d_affari_presunto_7l7g", "partita_iva_variazione_dati_5k4q"))

    print("\n--- valori nel PDF AA7/10 ---")
    campi = valori_pdf(aa7)
    controlla(campi, {
        "codice_fiscale_7y2c": CF_TITOLARE,
        "codice_fiscale_4z9s": CF_TITOLARE,
        "codice_fiscale_3m6a": CF_TITOLARE,
        "codice_fiscale_5i8h": CF_TITOLARE,
        "data_inizio_4k5m-QUADRO A": "19102026",
        "natura_giuridica_0p8o-QUADRO B": "27",
        "codice_attivita_1v0n-QUADRO B": "692001",
        "codice_fiscale_7y2c-QUADRO C": CF_TITOLARE,
        "quadri_compilati_data_4b1x-QUADRO I": "20/10/2026",
    }, vuoti=("codice_fiscale_7y2c-QUADRO A",))
    verifica(CF_SOGGETTO_VECCHIO not in campi.values(), "il codice fiscale rimasto dalla casella 3 non finisce nel modello")

    if errori:
        print("\nErrori JavaScript:", errori[:4])
        esito = 1
    print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
