"""Prova end-to-end del compilatore del Modello 69.

Avvia un server locale sulla cartella del sito, guida il browser sulla pagina
vera, verifica il banner che riprende i dati dal Modello RLI, compila i quadri,
scarica il PDF e controlla i valori finiti nel modulo.

Uso:  python scripts/prova-modello-69.py
"""
import sys, os, pathlib, tempfile, threading, http.server, functools, socketserver, json

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
SCARICATI = tempfile.mkdtemp(prefix="prova-69-")

try:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e pypdf:  python -m pip install playwright pypdf\n"
             "e poi:  python -m playwright install msedge")

PORTA = 8791
URL = f"http://127.0.0.1:{PORTA}/cittadino-tasse/modello-69/"
esito = 0
errori = []

# Stato che il compilatore del Modello RLI lascia in memoria locale: serve a
# verificare il banner che travasa i dati da un modello all'altro.
STATO_RLI = {
    "modello": "RLI",
    "passo": 0,
    "dati": {
        "RLI.richiedente.cfRichiedente": "RSSMRA85T10A562S",
        "RLI.registrazione.ufficioTerritoriale": "ROMA 1",
        "RLI.locatori.locatore.0.cf": "RSSMRA85T10A562S",
        "RLI.locatori.locatore.0.cognome": "ROSSI",
        "RLI.locatori.locatore.0.nome": "MARIO",
        "RLI.locatori.locatore.0.dataNascita": "1985-12-10",
        "RLI.locatori.locatore.0.sesso": "M",
        "RLI.locatori.locatore.0.comuneNascita": "ROMA",
        "RLI.locatori.locatore.0.provinciaNascita": "RM",
        "RLI.conduttori.conduttore.0.cf": "BNCGNN50A01H501N",
        "RLI.conduttori.conduttore.0.cognome": "BIANCHI",
        "RLI.conduttori.conduttore.0.nome": "GIOVANNI",
    },
    "attivi": {}, "righe": {},
}


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def valori_pdf(percorso):
    r = PdfReader(percorso)
    return {str(rif.get_object().get("/T", "")): str(rif.get_object().get("/V") or "")
            for rif in r.trailer["/Root"]["/AcroForm"]["/Fields"]}


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
        ok = ottenuto == ""
        if not ok:
            esito = 1
        print(f"  {'OK ' if ok else 'NO '} {nome} resta vuoto: {ottenuto!r}")


def main():
    global esito
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORTA), functools.partial(Silenzioso, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge", headless=True)
        ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 1100})
        ctx.add_init_script(
            "try { localStorage.setItem('su_modello_rli_compilatore', "
            + json.dumps(json.dumps(STATO_RLI)) + "); } catch (e) {}")

        pag = ctx.new_page()
        pag.on("pageerror", lambda e: errori.append(str(e)))
        pag.on("dialog", lambda d: d.accept())
        pag.goto(URL, wait_until="domcontentloaded")
        pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)

        passi = [t.replace(chr(10), " ").strip() for t in
                 pag.locator("#mp-passi .mp-passo-voce").all_inner_texts()]
        print("passi:", passi)

        pag.wait_for_timeout(400)
        visibile = pag.is_visible("#ponte-rli")
        print("\nbanner dal Modello RLI visibile:", visibile)
        if not visibile:
            print("  NO il banner non compare")
            esito = 1
        else:
            print("  riassunto:", pag.inner_text("#ponte-rli-riassunto"))

        def riempi(chiave, valore):
            sel = f'[data-campo="MOD69.{chiave}"]'
            assert pag.locator(sel).count() > 0, f"campo assente: {chiave}"
            pag.fill(sel, valore)
            pag.dispatch_event(sel, "input")

        def scegli(chiave, valore):
            sel = f'[data-campo="MOD69.{chiave}"]'
            pag.select_option(sel, valore)
            pag.dispatch_event(sel, "input")

        # --- il ponte riempie testata e Quadro B ---------------------------
        pag.click("#ponte-rli-usa")
        pag.wait_for_timeout(700)
        dal_ponte = {c: pag.input_value(f'[data-campo="MOD69.atto.{c}"]')
                     for c in ("cfRichiedente", "ufficioDi")}
        print("\ntestata dal ponte:", dal_ponte)
        if dal_ponte["cfRichiedente"] != "RSSMRA85T10A562S" or dal_ponte["ufficioDi"] != "ROMA 1":
            print("  NO il ponte non ha compilato la testata")
            esito = 1

        # --- passo 1: adempimento ------------------------------------------
        pag.check('input[name="r-MOD69.atto.adempimento"][value="ris"]')
        pag.wait_for_timeout(300)
        riempi("atto.tipologiaAtto", "RM1 2024 3T 1234 000")
        pag.fill('[data-campo="MOD69.atto.dataStipula"]', "2026-06-30")
        pag.dispatch_event('[data-campo="MOD69.atto.dataStipula"]', "input")
        riempi("atto.foglio", "1/1")
        pag.wait_for_timeout(300)
        proroga_visibile = pag.locator('[data-campo="MOD69.atto.dataFineProroga"]').count() > 0
        print("data fine proroga nascosta con 'Ris':", not proroga_visibile)
        if proroga_visibile:
            print("  NO il campo della proroga non dovrebbe comparire")
            esito = 1

        # --- passo 2: soggetti (gia' popolati dal ponte) -------------------
        voci = pag.locator("#mp-passi .mp-passo-voce")
        voci.nth(1).click()
        pag.wait_for_timeout(400)
        primo = {c: pag.input_value(f'[data-campo="MOD69.soggetti.riga.0.{c}"]')
                 for c in ("nOrd", "cf", "cognome", "provinciaNascita")}
        print("primo soggetto dal ponte:", primo)
        if primo["cognome"] != "ROSSI" or primo["nOrd"] != "1":
            print("  NO il ponte non ha compilato il Quadro B")
            esito = 1
        secondo_presente = pag.locator('[data-campo="MOD69.soggetti.riga.1.cognome"]').count() > 0
        if secondo_presente:
            print("secondo soggetto:", pag.input_value('[data-campo="MOD69.soggetti.riga.1.cognome"]'))
        riempi("soggetti.riga.0.domicilio", "00184 ROMA")
        riempi("soggetti.riga.0.provinciaDomicilio", "RM")
        riempi("soggetti.riga.0.via", "VIA NAZIONALE")
        riempi("soggetti.riga.0.civico", "10")

        # --- passo 3: negozi (quadro opzionale, con totale calcolato) ------
        voci.nth(2).click()
        pag.wait_for_timeout(250)
        pag.check('[data-attiva="negozi"]')
        pag.wait_for_timeout(450)
        riempi("negozi.riga.0.nOrd", "1")
        riempi("negozi.riga.0.codiceNegozio", "7202")
        riempi("negozi.riga.0.valore", "9600,00")
        riempi("negozi.riga.0.dantiCausa", "1")
        riempi("negozi.riga.0.aventiCausa", "2")
        pag.check('[data-campo="MOD69.negozi.riga.0.agevolazioni"]')
        pag.wait_for_timeout(400)
        pag.click('[data-aggiungi="negozi|riga"]')
        pag.wait_for_timeout(350)
        riempi("negozi.riga.1.nOrd", "2")
        riempi("negozi.riga.1.valore", "400,50")
        pag.wait_for_timeout(500)
        totale = pag.locator("#mp-corpo .mp-calcolato").first.inner_text()
        print("\ntotale valore calcolato:", totale)
        if totale.replace(".", "").strip() != "10000,50":
            print("  NO il totale non corrisponde")
            esito = 1

        # --- passo 4: immobili ---------------------------------------------
        voci.nth(3).click()
        pag.wait_for_timeout(250)
        pag.check('[data-attiva="immobili"]')
        pag.wait_for_timeout(450)
        riempi("immobili.riga.0.nOrd", "1")
        riempi("immobili.riga.0.codiceComune", "H501")
        scegli("immobili.riga.0.tu", "U")
        scegli("immobili.riga.0.ip", "I")
        riempi("immobili.riga.0.foglio", "123")
        riempi("immobili.riga.0.particella", "456")
        riempi("immobili.riga.0.subalterno", "7")
        pag.check('[data-campo="MOD69.immobili.riga.0.accatastamento"]')

        # il bottone che genera il PDF sta sull'ultimo passo
        voci.nth(voci.count() - 1).click()
        pag.wait_for_timeout(350)

        with pag.expect_download(timeout=30000) as info:
            pag.click('[data-nav="genera"]')
        d = info.value
        percorso = os.path.join(SCARICATI, d.suggested_filename)
        d.save_as(percorso)
        print("\nscaricato:", d.suggested_filename)
        b.close()
    srv.shutdown()

    campi = valori_pdf(percorso)
    print("\n--- valori nel PDF ---")
    controlla(campi, {
        "cf_richiedente": "RSSMRA85T10A562S",
        "ufficio_di": "ROMA 1",
        "adempimento_ris": "X",
        "tipologia_atto": "RM1 2024 3T 1234 000",
        "data_stipula": "30062026",
        "foglio": "1/1",
        "b1_n_ord": "1",
        "b1_cf": "RSSMRA85T10A562S",
        "b1_cognome": "ROSSI",
        "b1_nome": "MARIO",
        "b1_data_nascita": "10121985",
        "b1_sesso": "M",
        "b1_comune_nascita": "ROMA",
        "b1_provincia_nascita": "RM",
        "b1_domicilio": "00184 ROMA",
        "b1_provincia_domicilio": "RM",
        "b1_via": "VIA NAZIONALE",
        "b1_civico": "10",
        "b2_cognome": "BIANCHI",
        "b2_cf": "BNCGNN50A01H501N",
        "c1_codice_negozio": "7202",
        "c1_valore": "9600,00",
        "c1_agevolazioni": "X",
        "c1_danti_causa": "1",
        "c1_aventi_causa": "2",
        "c2_valore": "400,50",
        "c_totale_valore": "10000,50",
        "d1_codice_comune": "H501",
        "d1_tu": "U",
        "d1_ip": "I",
        "d1_foglio": "123",
        "d1_particella": "456",
        "d1_subalterno": "7",
        "d1_accatastamento": "X",
    }, vuoti=("adempimento_reg", "adempimento_pro", "data_fine_proroga",
              "b3_cognome", "c3_valore", "d2_codice_comune", "delegato_cognome",
              "e1_principale", "f1_categoria"))

    if errori:
        print("\nErrori JavaScript:", errori[:4])
        esito = 1
    print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
