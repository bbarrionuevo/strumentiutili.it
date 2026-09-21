"""Prova end-to-end del compilatore del modello RAP.

Avvia un server locale sulla cartella del sito, guida il browser sulla pagina
vera, verifica i due banner che riprendono i dati dal calcolatore IMU e da
quello delle imposte di acquisto casa, compila i quadri, scarica il PDF e
controlla i valori finiti nel modulo.

Uso:  python scripts/prova-modello-rap.py
"""
import sys, os, pathlib, tempfile, threading, http.server, functools, socketserver, json

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
SCARICATI = tempfile.mkdtemp(prefix="prova-rap-")

try:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e pypdf:  python -m pip install playwright pypdf\n"
             "e poi:  python -m playwright install msedge")

PORTA = 8795
URL = f"http://127.0.0.1:{PORTA}/cittadino-tasse/modello-rap/"
esito = 0
errori = []

# Quello che i due calcolatori lasciano in memoria locale.
STATO_IMU = {"calc-rendita": "450.50", "calc-categoria": "A/2", "calc-comodato": True}
STATO_CASA = {"calc-prezzo": "180000", "calc-categoria": "A/2", "calc-venditore": "privato"}


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
            "try {"
            f" localStorage.setItem('su_form_data__cittadino_tasse_calcolo_imu_', {json.dumps(json.dumps(STATO_IMU))});"
            f" localStorage.setItem('su_form_data__cittadino_tasse_imposte_acquisto_casa_', {json.dumps(json.dumps(STATO_CASA))});"
            "} catch (e) {}")

        pag = ctx.new_page()
        pag.on("pageerror", lambda e: errori.append(str(e)))
        pag.on("dialog", lambda d: d.accept())
        pag.goto(URL, wait_until="domcontentloaded")
        pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)

        passi = [t.replace(chr(10), " ").strip() for t in
                 pag.locator("#mp-passi .mp-passo-voce").all_inner_texts()]
        print("passi:", passi)

        pag.wait_for_timeout(500)
        for banner, etichetta in (("#ponte-imu", "IMU comodato"), ("#ponte-casa", "imposte acquisto casa")):
            visibile = pag.is_visible(banner)
            print(f"banner {etichetta}: {'visibile' if visibile else 'ASSENTE'}")
            if not visibile:
                esito = 1
        print("  prezzo mostrato:", pag.inner_text("#ponte-casa-prezzo"))

        def riempi(chiave, valore):
            sel = f'[data-campo="RAP.{chiave}"]'
            assert pag.locator(sel).count() > 0, f"campo assente: {chiave}"
            pag.fill(sel, valore)
            pag.dispatch_event(sel, "input")

        def scegli(chiave, valore):
            sel = f'[data-campo="RAP.{chiave}"]'
            pag.select_option(sel, valore)
            pag.dispatch_event(sel, "input")

        # --- il ponte del comodato attiva il quadro giusto -----------------
        pag.click("#ponte-imu-usa")
        pag.wait_for_timeout(700)
        tipologia = pag.input_value('[data-campo="RAP.atto.tipologiaAtto"]')
        print("\ntipologia impostata dal ponte IMU:", tipologia)
        if tipologia != "1":
            print("  NO il ponte non ha impostato il comodato")
            esito = 1

        # --- passo 1: dati generali ----------------------------------------
        riempi("atto.cfTestata", "RSSMRA85T10A562S")
        riempi("atto.moduloN", "001")
        riempi("atto.ufficioTerritoriale", "ROMA 1")
        pag.fill('[data-campo="RAP.atto.dataAtto"]', "2026-09-01")
        pag.dispatch_event('[data-campo="RAP.atto.dataAtto"]', "input")
        riempi("atto.nFogli", "1")
        riempi("atto.nCopie", "2")

        # --- passo 2: richiedente ------------------------------------------
        voci = pag.locator("#mp-passi .mp-passo-voce")
        voci.nth(1).click()
        pag.wait_for_timeout(300)
        riempi("richiedente.cognome", "ROSSI")
        riempi("richiedente.nome", "MARIO")
        riempi("richiedente.cf", "RSSMRA85T10A562S")
        riempi("richiedente.firma", "MARIO ROSSI")

        # --- passo 4: le parti del contratto -------------------------------
        indice_soggetti = [i for i, t in enumerate(passi) if "parti" in t.lower()][0]
        voci.nth(indice_soggetti).click()
        pag.wait_for_timeout(350)
        riempi("soggetti.dante.0.cf", "RSSMRA85T10A562S")
        riempi("soggetti.dante.0.cognome", "ROSSI")
        riempi("soggetti.dante.0.nome", "MARIO")
        riempi("soggetti.avente.0.cf", "BNCGNN50A01H501N")
        riempi("soggetti.avente.0.cognome", "BIANCHI")
        riempi("soggetti.avente.0.nome", "GIOVANNI")
        scegli("soggetti.avente.0.sesso", "M")

        # --- passo del comodato (gia' attivato dal ponte) ------------------
        indice_comodato = [i for i, t in enumerate(passi) if "comodato" in t.lower()][0]
        voci.nth(indice_comodato).click()
        pag.wait_for_timeout(400)
        attivo = pag.locator('[data-campo="RAP.comodato.durataDal"]').count() > 0
        print("quadro del comodato attivato dal ponte:", attivo)
        if not attivo:
            print("  NO il quadro del comodato non e' attivo")
            esito = 1
        pag.fill('[data-campo="RAP.comodato.durataDal"]', "2026-10-01")
        pag.dispatch_event('[data-campo="RAP.comodato.durataDal"]', "input")
        pag.check('[data-campo="RAP.comodato.tempoIndeterminato"]')
        pag.wait_for_timeout(250)
        scegli("comodato.tipo", "2")
        riempi("comodato.descrizione", "Appartamento concesso in comodato al figlio")
        riempi("comodato.immobile.0.codiceComune", "H501")
        scegli("comodato.immobile.0.tu", "U")
        riempi("comodato.immobile.0.foglio", "123")
        riempi("comodato.immobile.0.particella", "456")
        riempi("comodato.immobile.0.subalterno", "7")
        riempi("comodato.immobile.0.comune", "ROMA")
        riempi("comodato.immobile.0.provincia", "RM")
        riempi("comodato.immobile.0.tipologia", "VIA")
        riempi("comodato.immobile.0.indirizzo", "NAZIONALE")
        riempi("comodato.immobile.0.civico", "10")

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
        "cf_testata": "RSSMRA85T10A562S",
        "modulo_n": "001",
        "ufficio_territoriale": "ROMA 1",
        "tipologia_atto": "1",
        "data_atto": "01092026",
        "n_fogli": "1",
        "n_copie": "2",
        "richiedente_cognome": "ROSSI",
        "richiedente_cf": "RSSMRA85T10A562S",
        "firma_richiedente": "MARIO ROSSI",
        "s1_cf": "RSSMRA85T10A562S",
        "s1_cognome": "ROSSI",
        "s4_cf": "BNCGNN50A01H501N",
        "s4_cognome": "BIANCHI",
        "s4_sesso": "M",
        "com_durata_dal": "01102026",
        "com_tempo_indeterminato": "X",
        "com_tipo": "2",
        "com_immobile": "X",
        "com_descrizione": "Appartamento concesso in comodato al figlio",
        "ic1_codice_comune": "H501",
        "ic1_tu": "U",
        "ic1_foglio": "123",
        "ic1_particella": "456",
        "ic1_subalterno": "7",
        "ic1_comune": "ROMA",
        "ic1_provincia": "RM",
        "ic1_indirizzo": "NAZIONALE",
    }, vuoti=("s2_cf", "s5_cf", "ic2_codice_comune", "pre_prezzo", "utili_totale",
              "so1_cf", "ip1_codice_comune", "cf_intermediario"))

    if errori:
        print("\nErrori JavaScript:", errori[:4])
        esito = 1
    print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
