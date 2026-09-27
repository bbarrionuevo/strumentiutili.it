"""Prova end-to-end dei compilatori del canone TV.

Avvia un server locale sulla cartella del sito e, per ciascuna delle tre
pagine, guida il browser come farebbe una persona: sceglie il quadro, riempie
i campi, genera il PDF e controlla i valori finiti nel modello ufficiale.

- disdetta: quadro B con i dati di un erede (campi condizionati e passo
  facoltativo), codice fiscale ripetuto in testa alla terza pagina;
- over 75: dichiarazione di esenzione da coniugato e poi, cambiando modello,
  richiesta di rimborso con euro e centesimi separati;
- rimborso in bolletta: due bollette, totale calcolato, motivo 4.

Uso:  python scripts/prova-moduli-canone-tv.py
Il browser e' Microsoft Edge se c'e', altrimenti il Chromium di Playwright.
"""
import sys, os, pathlib, tempfile, threading, http.server, functools, socketserver

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
SCARICATI = tempfile.mkdtemp(prefix="prova-canone-")

try:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e pypdf:  python -m pip install playwright pypdf\n"
             "e poi:  python -m playwright install msedge")

PORTA = 8811
BASE = f"http://127.0.0.1:{PORTA}"
CF = "RSSMRA85T10A562S"
CF_ALTRO = "BNCLRA50A41H501X"
CF_CONIUGE = "VRDGPP48B12F205A"
esito = 0
errori = []


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def valori_pdf(percorso):
    r = PdfReader(percorso)
    return {str(rif.get_object().get("/T", "")): str(rif.get_object().get("/V") or "")
            for rif in r.trailer["/Root"]["/AcroForm"]["/Fields"]}


def controlla(titolo, campi, attesi, vuoti=()):
    global esito
    print(f"\n--- {titolo} ---")
    for nome, atteso in attesi.items():
        ottenuto = campi.get(nome, "(campo assente)")
        ok = ottenuto == atteso
        esito |= 0 if ok else 1
        print(f"  {'OK ' if ok else 'NO '} {nome}: {ottenuto!r}" + ("" if ok else f" (atteso {atteso!r})"))
    for nome in vuoti:
        ottenuto = campi.get(nome, "")
        ok = ottenuto == ""
        esito |= 0 if ok else 1
        print(f"  {'OK ' if ok else 'NO '} {nome} resta vuoto: {ottenuto!r}")


def apri_browser(pw):
    # PROVA_CHROMIUM indica un eseguibile preciso, se la versione di Playwright
    # installata non ha il suo browser.
    eseguibile = os.environ.get("PROVA_CHROMIUM")
    if eseguibile:
        return pw.chromium.launch(executable_path=eseguibile, headless=True)
    try:
        return pw.chromium.launch(channel="msedge", headless=True)
    except Exception:
        return pw.chromium.launch(headless=True)


class Pagina:
    def __init__(self, ctx, percorso, modello):
        self.p = ctx.new_page()
        self.p.on("pageerror", lambda e: errori.append(f"{percorso}: {e}"))
        self.p.on("dialog", lambda d: d.accept())
        self.p.route("**/pagead2.googlesyndication.com/**", lambda r: r.abort())
        self.p.goto(BASE + percorso, wait_until="load")
        self.p.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)
        self.modello = modello

    def passo(self, testo):
        voci = self.p.locator("#mp-passi .mp-passo-voce")
        testi = [t.lower() for t in voci.all_inner_texts()]
        indice = next(i for i, t in enumerate(testi) if testo in t)
        voci.nth(indice).click()
        self.p.wait_for_timeout(250)

    def riempi(self, chiave, valore):
        sel = f'[data-campo="{self.modello}.{chiave}"]'
        assert self.p.locator(sel).count() > 0, f"campo assente: {chiave}"
        self.p.fill(sel, valore)
        self.p.dispatch_event(sel, "input")

    def scegli(self, chiave, valore):
        self.p.check(f'input[name="r-{self.modello}.{chiave}"][value="{valore}"]')
        self.p.wait_for_timeout(250)

    def spunta(self, chiave):
        self.p.check(f'[data-campo="{self.modello}.{chiave}"]')
        self.p.wait_for_timeout(200)

    def attiva(self, passo):
        self.p.check(f'[data-attiva="{passo}"]')
        self.p.wait_for_timeout(250)

    def genera(self):
        voci = self.p.locator("#mp-passi .mp-passo-voce")
        voci.nth(voci.count() - 1).click()
        self.p.wait_for_timeout(250)
        with self.p.expect_download(timeout=30000) as info:
            self.p.click('[data-nav="genera"]')
        d = info.value
        percorso = os.path.join(SCARICATI, f"{self.modello}-{d.suggested_filename}")
        d.save_as(percorso)
        return valori_pdf(percorso)


def anagrafica(pag, passo):
    pag.riempi(f"{passo}.cognome", "ROSSI")
    pag.riempi(f"{passo}.nome", "MARIO")
    pag.riempi(f"{passo}.dataNascita", "1985-12-10")
    pag.riempi(f"{passo}.comuneNascita", "ANZIO")
    pag.riempi(f"{passo}.provinciaNascita", "RM")
    pag.riempi(f"{passo}.codiceFiscale", CF)


ANAGRAFICA_PDF = {"cognome": "ROSSI", "nome": "MARIO", "data_nascita": "10121985",
                  "comune_nascita": "ANZIO", "provincia_nascita": "RM", "codice_fiscale": CF}


def main():
    global esito
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORTA), functools.partial(Silenzioso, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    with sync_playwright() as pw:
        b = apri_browser(pw)
        ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 1100})

        # --- 1. disdetta: quadro B come erede ------------------------------
        pag = Pagina(ctx, "/cittadino-tasse/disdetta-canone-rai/", "CANONE")
        pag.p.fill("#canone-data-invio", "2026-09-27")
        pag.p.dispatch_event("#canone-data-invio", "input")
        frase = pag.p.inner_text("[data-canone-esito]")
        print("riquadro della data:", frase)
        if "tutto il 2027" not in frase:
            esito = 1
        pag.scegli("quadro.quadro", "B")
        pag.spunta("quadro.bConferma")
        pag.riempi("quadro.bCodiceFiscale", CF_ALTRO)
        pag.riempi("quadro.bDataInizio", "2026-01-01")
        pag.passo("tuoi dati")
        anagrafica(pag, "dichiarante")
        pag.passo("erede")
        pag.attiva("erede")
        pag.riempi("erede.cognome", "BIANCHI")
        pag.riempi("erede.nome", "LAURA")
        pag.riempi("erede.codiceFiscale", CF_ALTRO)
        pag.passo("firma")
        pag.riempi("firma.data", "2026-09-27")
        controlla("disdetta, quadro B da erede", pag.genera(), {
            **ANAGRAFICA_PDF,
            "codice_fiscale_testata": CF,
            "quadro_b": "X", "b_dichiara": "X", "b_codice_fiscale": CF_ALTRO, "b_data_inizio": "01012026",
            "erede_cognome": "BIANCHI", "erede_nome": "LAURA", "erede_codice_fiscale": CF_ALTRO,
            "data_firma": "27092026",
        }, vuoti=("quadro_a", "quadro_c", "a_nessun_televisore", "a_oltre_suggellamento", "c_data"))

        # --- 2a. over 75: esenzione da coniugato ----------------------------
        pag = Pagina(ctx, "/cittadino-tasse/esenzione-canone-rai-over-75/", "ESENZIONE75")
        pag.p.fill("#canone-nascita", "1952-01-15")
        pag.p.fill("#canone-anno", "2027")
        pag.p.dispatch_event("#canone-anno", "input")
        frase = pag.p.inner_text("[data-canone-esito]")
        print("\nriquadro dell'eta':", frase)
        if "tutto l'anno" not in frase:
            esito = 1
        anagrafica(pag, "dichiarante")
        pag.passo("dichiarazione")
        pag.scegli("dichiarazione.sezione", "I")
        pag.riempi("dichiarazione.anno", "2027")
        pag.spunta("dichiarazione.confermaResidenza")
        pag.scegli("dichiarazione.statoCivile", "si")
        pag.riempi("dichiarazione.coniugeCf", CF_CONIUGE)
        pag.spunta("dichiarazione.confermaConviventi")
        pag.scegli("dichiarazione.soglia", "8000")
        pag.passo("firma")
        pag.riempi("firma.data", "2026-09-27")
        controlla("esenzione over 75", pag.genera(), {
            **ANAGRAFICA_PDF,
            "anno_esenzione": "2027", "coniuge_codice_fiscale": CF_CONIUGE, "reddito_8000": "X",
            "data_firma": "27092026",
        }, vuoti=("non_coniugato", "reddito_6713", "anno_variazione"))

        # --- 2b. stesso sito, modello del rimborso -------------------------
        pag.p.click('button[data-modello="RIMBORSO75"]')
        pag.p.wait_for_timeout(400)
        pag.modello = "RIMBORSO75"
        anagrafica(pag, "richiedente")
        pag.passo("anno")
        pag.riempi("rimborso.anno", "2025")
        pag.riempi("rimborso.importo", "90")
        pag.passo("requisiti")
        pag.spunta("dichiarazione.confermaResidenza")
        pag.scegli("dichiarazione.statoCivile", "no")
        pag.spunta("dichiarazione.confermaConviventi")
        pag.scegli("dichiarazione.soglia", "8000")
        pag.passo("firma")
        pag.riempi("firma.data", "2026-09-27")
        controlla("rimborso over 75", pag.genera(), {
            **ANAGRAFICA_PDF,
            "anno": "2025", "totale": "90", "totale_cent": "00", "non_coniugato": "X", "reddito_8000": "X",
            "data_firma": "27092026",
        }, vuoti=("coniuge_codice_fiscale", "reddito_6713"))

        # --- 3. rimborso in bolletta, motivo 4 ------------------------------
        pag = Pagina(ctx, "/cittadino-tasse/rimborso-canone-rai/", "RIMBORSO")
        anagrafica(pag, "richiedente")
        pag.riempi("richiedente.email", "mario.rossi@example.it")
        pag.passo("bollette")
        pag.riempi("fatture.anno", "2026")
        pag.riempi("fatture.riga.0.pod", "IT001E12345678")
        pag.riempi("fatture.riga.0.fattura", "F-2026-001")
        pag.riempi("fatture.riga.0.importo", "9")
        pag.p.click('[data-aggiungi="fatture|riga"]')
        pag.p.wait_for_timeout(300)
        pag.riempi("fatture.riga.1.fattura", "F-2026-002")
        pag.riempi("fatture.riga.1.importo", "9,00")
        totale = pag.p.inner_text('[data-calcolato="totale"]')
        print("\ntotale calcolato in pagina:", totale)
        if totale.strip() != "18,00":
            esito = 1
        pag.passo("motivo")
        pag.p.select_option('[data-campo="RIMBORSO.motivo.codice"]', "4")
        pag.p.wait_for_timeout(300)
        pag.riempi("motivo.familiareCf", CF_ALTRO)
        pag.riempi("motivo.dataInizio", "2026-01-01")
        pag.riempi("motivo.descrizione", "Canone addebitato anche sul contratto di mia moglie")
        pag.passo("firma")
        pag.riempi("firma.data", "2026-09-27")
        controlla("rimborso in bolletta, motivo 4", pag.genera(), {
            **ANAGRAFICA_PDF,
            "codice_fiscale_testata": CF, "email": "mario.rossi@example.it",
            "anno": "2026", "totale": "18,00",
            "pod_1": "IT001E12345678", "fattura_1": "F-2026-001", "importo_1": "9,00",
            "fattura_2": "F-2026-002", "importo_2": "9,00",
            "motivo": "4", "familiare_codice_fiscale": CF_ALTRO, "data_inizio": "01012026",
            "descrizione": "Canone addebitato anche sul contratto di mia moglie",
            "data_firma": "27092026",
        }, vuoti=("pod_2", "importo_3", "data_fine", "erede_cognome"))

        b.close()
    srv.shutdown()

    if errori:
        print("\nErrori JavaScript:", errori[:4])
        esito = 1
    print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
