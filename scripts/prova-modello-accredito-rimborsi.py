"""Prova end-to-end del compilatore per l'accredito dei rimborsi fiscali.

Avvia un server locale sulla cartella del sito, guida il browser sulla pagina
vera, verifica il banner che riprende l'IBAN dal validatore, controlla che un
IBAN sbagliato venga rifiutato, compila il modulo, scarica il PDF e confronta i
valori finiti nel modello.

Uso:  python scripts/prova-modello-accredito-rimborsi.py
"""
import sys, os, pathlib, tempfile, threading, http.server, functools, socketserver, json

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
SCARICATI = tempfile.mkdtemp(prefix="prova-rimborsi-")

try:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e pypdf:  python -m pip install playwright pypdf\n"
             "e poi:  python -m playwright install msedge")

PORTA = 8809
URL = f"http://127.0.0.1:{PORTA}/cittadino-tasse/accredito-rimborsi/"
IBAN = "IT60X0542811101000000123456"
esito = 0
errori = []

STATO_VALIDATORE = {"iban-input": IBAN}


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
            "try { localStorage.setItem('su_form_data__identita_burocrazia_validatore_iban_', "
            + json.dumps(json.dumps(STATO_VALIDATORE)) + "); } catch (e) {}")

        pag = ctx.new_page()
        pag.on("pageerror", lambda e: errori.append(str(e)))
        pag.on("dialog", lambda d: d.accept())
        pag.goto(URL, wait_until="load")
        pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)

        passi = [t.replace(chr(10), " ").strip() for t in
                 pag.locator("#mp-passi .mp-passo-voce").all_inner_texts()]
        print("passi:", passi)

        pag.wait_for_timeout(500)
        visibile = pag.is_visible("#ponte-iban")
        print("\nbanner dal validatore IBAN:", "visibile" if visibile else "ASSENTE")
        if not visibile:
            esito = 1
        else:
            print("  mostrato a gruppi:", pag.inner_text("#ponte-iban-valore"))

        def riempi(chiave, valore):
            sel = f'[data-campo="RIMBORSI.{chiave}"]'
            assert pag.locator(sel).count() > 0, f"campo assente: {chiave}"
            pag.fill(sel, valore)
            pag.dispatch_event(sel, "input")

        # --- passo 1 -------------------------------------------------------
        pag.check('input[name="r-RIMBORSI.richiesta.tipo"][value="1"]')
        pag.wait_for_timeout(300)
        riempi("richiesta.cognome", "ROSSI")
        riempi("richiesta.nome", "MARIO")
        riempi("richiesta.codiceFiscale", "RSSMRA85T10A562S")
        riempi("richiesta.comuneNascita", "ROMA")
        riempi("richiesta.provinciaNascita", "RM")
        riempi("richiesta.nascitaGiorno", "10")
        riempi("richiesta.nascitaMese", "12")
        riempi("richiesta.nascitaAnno", "1985")

        # --- passo 2 -------------------------------------------------------
        voci = pag.locator("#mp-passi .mp-passo-voce")
        voci.nth(1).click()
        pag.wait_for_timeout(300)
        riempi("residenza.comune", "ROMA")
        riempi("residenza.provincia", "RM")
        riempi("residenza.via", "VIA NAZIONALE")
        riempi("residenza.civico", "10")
        riempi("residenza.cap", "00184")
        riempi("residenza.email", "mario.rossi@example.it")
        riempi("residenza.telefonoPrefisso", "06")
        riempi("residenza.telefonoNumero", "1234567")

        # --- passo 3: un IBAN sbagliato deve essere rifiutato --------------
        voci.nth(2).click()
        pag.wait_for_timeout(300)
        riempi("conto.iban", "IT60X0542811101000000123400")
        pag.click('[data-nav="avanti"]')
        pag.wait_for_timeout(400)
        bloccato = pag.locator("#mp-corpo .mp-errore").count() > 0
        print("\nIBAN con cifre di controllo errate rifiutato:", bloccato)
        if not bloccato:
            print("  NO l'IBAN sbagliato e' passato")
            esito = 1

        # --- il ponte mette quello giusto ----------------------------------
        pag.click("#ponte-iban-usa")
        pag.wait_for_timeout(700)
        voci.nth(2).click()
        pag.wait_for_timeout(300)
        dal_ponte = pag.input_value('[data-campo="RIMBORSI.conto.iban"]')
        print("IBAN messo dal ponte:", dal_ponte)
        if dal_ponte != IBAN:
            print("  NO il ponte non ha scritto l'IBAN")
            esito = 1

        # --- ultimo passo ---------------------------------------------------
        indice_firma = [i for i, t in enumerate(passi) if "firma" in t.lower()][0]
        voci.nth(indice_firma).click()
        pag.wait_for_timeout(300)
        riempi("firma.giorno", "20")
        riempi("firma.mese", "09")
        riempi("firma.anno", "2026")
        riempi("firma.firma", "MARIO ROSSI")

        voci.nth(voci.count() - 1).click()
        pag.wait_for_timeout(300)
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
        "tipo_accredito": "X",
        "cognome": "ROSSI",
        "nome": "MARIO",
        "codice_fiscale": "RSSMRA85T10A562S",
        "comune_nascita": "ROMA",
        "provincia_nascita": "RM",
        "nascita_giorno": "10",
        "nascita_mese": "12",
        "nascita_anno": "1985",
        "residenza_comune": "ROMA",
        "residenza_provincia": "RM",
        "via": "VIA NAZIONALE",
        "civico": "10",
        "cap": "00184",
        "email": "mario.rossi@example.it",
        "telefono_prefisso": "06",
        "telefono_numero": "1234567",
        "iban": IBAN,
        "firma_giorno": "20",
        "firma_mese": "09",
        "firma_anno": "2026",
        "firma": "MARIO ROSSI",
    }, vuoti=("tipo_annullamento", "estero_banca", "estero_bic", "delega_cf", "frazione"))

    if errori:
        print("\nErrori JavaScript:", errori[:4])
        esito = 1
    print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
