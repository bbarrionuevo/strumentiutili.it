"""Prova end-to-end dei cinque compilatori: F24 ordinario, elide, semplificato,
accise e F23.

Lo script avvia da solo un server locale sulla cartella del sito, guida il
browser sulla pagina vera, compila i campi, scarica il PDF e controlla i valori
finiti dentro il modulo: e' l'unico modo per accorgersi se una modifica allo
schema o al motore ha rotto la compilazione.

Uso:  python scripts/prova-moduli-versamento.py
"""
import sys, os, pathlib, tempfile, threading, http.server, functools, socketserver

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
SCARICATI = tempfile.mkdtemp(prefix="prova-moduli-")

try:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e pypdf:  python -m pip install playwright pypdf\n"
             "e poi:  python -m playwright install msedge")

PORTA = 8771
esito = 0


def euro(testo):
    """Legge "1.250,50 €" come 1250.5. Alcune build headless di Edge non hanno
    i dati ICU completi e omettono il separatore delle migliaia: si accettano
    quindi entrambe le forme."""
    ripulito = testo.replace("€", "").replace(".", "").replace(",", ".").strip()
    return float(ripulito or 0)


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def controlla(nome_prova, campi, attesi, vuoti=()):
    global esito
    print(f"\n--- {nome_prova}: valori nel PDF ---")
    for nome, atteso in attesi.items():
        ottenuto = str(campi.get(nome, {}).get("/V", ""))
        ok = ottenuto == atteso
        if not ok:
            esito = 1
        print(f"  {'OK ' if ok else 'NO '} {nome}: {ottenuto!r}" + ("" if ok else f" (atteso {atteso!r})"))
    for nome in vuoti:
        ottenuto = str(campi.get(nome, {}).get("/V", ""))
        ok = ottenuto == ""
        if not ok:
            esito = 1
        print(f"  {'OK ' if ok else 'NO '} {nome} resta vuoto: {ottenuto!r}")


def apri(ctx, percorso, errori):
    pag = ctx.new_page()
    pag.on("pageerror", lambda e: errori.append(f"{percorso}: {e}"))
    pag.on("dialog", lambda d: d.accept())
    pag.goto(f"http://127.0.0.1:{PORTA}{percorso}", wait_until="domcontentloaded")
    pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)
    return pag


def scarica(pag):
    with pag.expect_download(timeout=30000) as info:
        pag.click('[data-nav="genera"]')
    d = info.value
    percorso = os.path.join(SCARICATI, d.suggested_filename)
    d.save_as(percorso)
    print("  scaricato:", d.suggested_filename)
    return PdfReader(percorso).get_fields() or {}


def scrittore(pag, modello):
    def riempi(chiave, valore):
        sel = f'[data-campo="{modello}.{chiave}"]'
        assert pag.locator(sel).count() > 0, f"campo assente: {chiave}"
        pag.fill(sel, valore)
        pag.dispatch_event(sel, "input")
    return riempi


def ultimo_passo(pag):
    voci = pag.locator("#mp-passi .mp-passo-voce")
    voci.nth(voci.count() - 1).click()
    pag.wait_for_timeout(300)


# ------------------------------------------------------------------ ordinario

def prova_ordinario(ctx, errori):
    global esito
    pag = apri(ctx, "/cittadino-tasse/f24-editabile/f24-ordinario/", errori)
    riempi = scrittore(pag, "F24")
    riempi("contribuente.cf", "RSSMRA85T10A562S")
    riempi("contribuente.cognome", "ROSSI")
    riempi("contribuente.nome", "MARIO")
    riempi("contribuente.domicilioComune", "ROMA")
    riempi("contribuente.domicilioProvincia", "RM")
    pag.click('[data-nav="avanti"]')
    pag.wait_for_selector('[data-campo="F24.erario.riga.0.tributo"]', timeout=8000)
    riempi("erario.riga.0.tributo", "4001")
    riempi("erario.riga.0.anno", "2025")
    riempi("erario.riga.0.debito", "1250,50")
    pag.click('[data-aggiungi="erario|riga"]')
    pag.wait_for_timeout(300)
    riempi("erario.riga.1.tributo", "6099")
    riempi("erario.riga.1.anno", "2025")
    riempi("erario.riga.1.credito", "300,25")
    pag.wait_for_timeout(400)

    calcolati = [t.replace(".", "").strip() for t in pag.locator("#mp-corpo .mp-calcolato").all_inner_texts()]
    print("  totali di sezione:", calcolati[:3])
    if calcolati[:3] != ["1250,50", "300,25", "950,25"]:
        print("  NO i totali di sezione non corrispondono")
        esito = 1
    riepilogo = (pag.text_content("#tot-debiti").strip(), pag.text_content("#tot-crediti").strip(),
                 pag.text_content("#tot-saldo").strip())
    print("  riepilogo laterale:", riepilogo)
    if [euro(v) for v in riepilogo] != [1250.50, 300.25, 950.25]:
        print("  NO il riepilogo laterale non corrisponde")
        esito = 1

    ultimo_passo(pag)
    riempi("chiusura.firma", "MARIO ROSSI")
    riempi("chiusura.delegaA", "BANCA ESEMPIO SPA")
    riempi("chiusura.iban", "IT60X0542811101000000123456")
    pag.wait_for_timeout(200)
    campi = scarica(pag)
    controlla("F24 ordinario", campi, {
        "cf_contribuente": "RSSMRA85T10A562S", "cognome_denominazione": "ROSSI",
        "domicilio_provincia": "RM",
        "erario_1_tributo": "4001", "erario_1_anno": "2025",
        "erario_1_debito": "1250", "erario_1_debito_cent": "50",
        "erario_2_tributo": "6099", "erario_2_credito": "300", "erario_2_credito_cent": "25",
        "erario_totale_a": "1250", "erario_totale_a_cent": "50",
        "erario_totale_b": "300", "erario_totale_b_cent": "25",
        "erario_saldo": "950", "erario_saldo_cent": "25",
        "saldo_finale": "950", "saldo_finale_cent": "25",
        "firma": "MARIO ROSSI", "iban": "60X0542811101000000123456",
    }, vuoti=("inps_1_debito", "imu_1_tributo", "inail_totale_i"))
    pag.close()


# ---------------------------------------------------------------------- elide

def prova_elide(ctx, errori):
    global esito
    pag = apri(ctx, "/cittadino-tasse/f24-editabile/f24-elide/", errori)
    riempi = scrittore(pag, "ELIDE")
    riempi("contribuente.cf", "RSSMRA85T10A562S")
    riempi("contribuente.cognome", "ROSSI")
    riempi("contribuente.nome", "MARIO")
    pag.click('[data-nav="avanti"]')
    pag.wait_for_selector('[data-campo="ELIDE.erario.riga.0.tipo"]', timeout=8000)
    riempi("erario.codiceUfficio", "RM1")
    riempi("erario.riga.0.tipo", "A")
    riempi("erario.riga.0.elementi", "ZFA12300001234567")
    riempi("erario.riga.0.codice", "6099")
    riempi("erario.riga.0.anno", "2026")
    riempi("erario.riga.0.debito", "4320,75")
    pag.click('[data-aggiungi="erario|riga"]')
    pag.wait_for_timeout(300)
    riempi("erario.riga.1.tipo", "M")
    riempi("erario.riga.1.debito", "150,25")
    pag.wait_for_timeout(400)
    print("  riepilogo laterale:", pag.text_content("#tot-debiti").strip(),
          "|", pag.text_content("#tot-saldo").strip())

    ultimo_passo(pag)
    saldo = pag.locator("#mp-corpo .mp-calcolato").first.inner_text()
    print("  saldo finale:", saldo)
    if saldo.replace(".", "").strip() != "4471,00":
        print("  NO saldo errato")
        esito = 1
    riempi("chiusura.firma", "MARIO ROSSI")
    campi = scarica(pag)
    controlla("F24 elide", campi, {
        "cf_contribuente": "RSSMRA85T10A562S", "cognome_denominazione": "ROSSI",
        "erario_codice_ufficio": "RM1", "erario_1_tipo": "A",
        "erario_1_elementi": "ZFA12300001234567", "erario_1_codice": "6099",
        "erario_1_anno": "2026", "erario_1_debito": "4320", "erario_1_debito_cent": "75",
        "erario_2_tipo": "M", "erario_2_debito": "150", "erario_2_debito_cent": "25",
        "saldo_finale": "4471", "saldo_finale_cent": "00", "firma": "MARIO ROSSI",
    }, vuoti=("erario_3_tipo", "erario_28_debito"))
    pag.close()


# --------------------------------------------------------------- semplificato

def prova_semplificato(ctx, errori):
    global esito
    pag = apri(ctx, "/cittadino-tasse/f24-editabile/f24-semplificato/", errori)
    riempi = scrittore(pag, "SEMPLIFICATO")

    # il ponte dal calcolatore dell'IMU deve compilare la prima riga
    pag.fill("#imu-rendita", "450.50")
    pag.select_option("#imu-categoria", "A/2")
    pag.fill("#imu-aliquota", "10.6")
    pag.click("#btn-auto-imu")
    pag.wait_for_timeout(700)
    dal_ponte = {c: pag.input_value(f'[data-campo="SEMPLIFICATO.pagamento.riga.0.{c}"]')
                 for c in ("sezione", "tributo", "anno", "debito")}
    print("  riga scritta dal calcolatore IMU:", dal_ponte)
    if dal_ponte["sezione"] != "EL" or dal_ponte["tributo"] != "3918" or not dal_ponte["debito"]:
        print("  NO il ponte dal calcolatore IMU non ha compilato la riga")
        esito = 1

    pag.click('[data-aggiungi="pagamento|riga"]')
    pag.wait_for_timeout(300)
    pag.select_option('[data-campo="SEMPLIFICATO.pagamento.riga.1.sezione"]', "EL")
    riempi("pagamento.riga.1.tributo", "3944")
    riempi("pagamento.riga.1.ente", "H501")
    riempi("pagamento.riga.1.anno", "2026")
    riempi("pagamento.riga.1.debito", "120,40")
    riempi("pagamento.riga.1.credito", "20,40")
    pag.check('[data-campo="SEMPLIFICATO.pagamento.riga.1.saldo"]')
    pag.wait_for_timeout(400)
    riepilogo = (pag.text_content("#tot-debiti").strip(), pag.text_content("#tot-crediti").strip(),
                 pag.text_content("#tot-saldo").strip())
    print("  riepilogo laterale:", riepilogo)
    atteso_debiti = float(dal_ponte["debito"].replace(",", ".")) + 120.40
    if euro(riepilogo[1]) != 20.40 or round(euro(riepilogo[0]), 2) != round(atteso_debiti, 2):
        print("  NO il riepilogo laterale non corrisponde")
        esito = 1

    pag.locator("#mp-passi .mp-passo-voce").nth(0).click()
    pag.wait_for_timeout(250)
    riempi("contribuente.cf", "RSSMRA85T10A562S")
    riempi("contribuente.cognome", "ROSSI")
    riempi("contribuente.nome", "MARIO")

    ultimo_passo(pag)
    riempi("chiusura.firma", "MARIO ROSSI")
    riempi("chiusura.iban", "IT60X0542811101000000123456")
    pag.wait_for_timeout(200)
    campi = scarica(pag)
    controlla("F24 semplificato", campi, {
        "cf_contribuente": "RSSMRA85T10A562S", "cognome_denominazione": "ROSSI",
        "riga_1_sezione": "EL", "riga_1_tributo": "3918",
        "riga_1_debito": dal_ponte["debito"].split(",")[0],
        "riga_2_sezione": "EL", "riga_2_tributo": "3944", "riga_2_ente": "H501",
        "riga_2_anno": "2026", "riga_2_saldo": "X",
        "riga_2_debito": "120", "riga_2_debito_cent": "40",
        "riga_2_credito": "20", "riga_2_credito_cent": "40",
        "firma": "MARIO ROSSI", "iban": "60X0542811101000000123456",
    }, vuoti=("riga_3_tributo", "riga_10_debito"))
    pag.close()



# --------------------------------------------------------------------- accise

def prova_accise(ctx, errori):
    global esito
    pag = apri(ctx, "/cittadino-tasse/f24-editabile/f24-accise/", errori)
    riempi = scrittore(pag, "ACCISE")
    riempi("contribuente.cf", "RSSMRA85T10A562S")
    riempi("contribuente.cognome", "ROSSI")
    pag.click('[data-nav="avanti"]')
    pag.wait_for_selector('[data-campo="ACCISE.erario.riga.0.tributo"]', timeout=8000)
    riempi("erario.riga.0.tributo", "4001")
    riempi("erario.riga.0.anno", "2026")
    riempi("erario.riga.0.debito", "500,00")

    voci = pag.locator("#mp-passi .mp-passo-voce")
    titoli = [t.replace(chr(10), " ") for t in voci.all_inner_texts()]
    voci.nth([i for i, t in enumerate(titoli) if "Accise" in t][0]).click()
    pag.wait_for_timeout(300)
    pag.check('[data-attiva="accise"]')
    pag.wait_for_timeout(400)
    riempi("accise.codiceUfficio", "RM1")
    riempi("accise.riga.0.ente", "D")
    riempi("accise.riga.0.prov", "MI")
    riempi("accise.riga.0.tributo", "2801")
    riempi("accise.riga.0.identificativo", "ABC123456")
    riempi("accise.riga.0.debito", "1250,30")
    pag.wait_for_timeout(500)
    riepilogo = (pag.text_content("#tot-debiti").strip(), pag.text_content("#tot-saldo").strip())
    print("  riepilogo laterale:", riepilogo)
    if [euro(v) for v in riepilogo] != [1750.30, 1750.30]:
        print("  NO il riepilogo laterale non corrisponde")
        esito = 1

    ultimo_passo(pag)
    riempi("chiusura.firma", "MARIO ROSSI")
    campi = scarica(pag)
    controlla("F24 accise", campi, {
        "cf_contribuente": "RSSMRA85T10A562S", "erario_1_tributo": "4001",
        "erario_1_debito": "500", "erario_totale_a": "500",
        "accise_codice_ufficio": "RM1", "accise_1_ente": "D", "accise_1_prov": "MI",
        "accise_1_tributo": "2801", "accise_1_identificativo": "ABC123456",
        "accise_1_debito": "1250", "accise_1_debito_cent": "30",
        "accise_totale_o": "1250", "accise_totale_o_cent": "30", "accise_saldo": "1250",
        "saldo_finale": "1750", "saldo_finale_cent": "30", "firma": "MARIO ROSSI",
    }, vuoti=("accise_2_ente", "inps_1_debito"))
    pag.close()


# ------------------------------------------------------------------------ F23

def prova_f23(ctx, errori):
    global esito
    pag = apri(ctx, "/cittadino-tasse/f24-editabile/f23-editabile/", errori)
    riempi = scrittore(pag, "F23")
    riempi("pagamento.delegaA", "BANCA ESEMPIO SPA")
    riempi("pagamento.agenziaUfficio", "AG. 12 ROMA")
    riempi("pagamento.provinciaAgenzia", "RM")

    voci = pag.locator("#mp-passi .mp-passo-voce")
    voci.nth(1).click()
    pag.wait_for_timeout(250)
    riempi("contribuente.cognome", "ROSSI")
    riempi("contribuente.nome", "MARIO")
    riempi("contribuente.cf", "RSSMRA85T10A562S")
    riempi("contribuente.comuneNascita", "ROMA")
    riempi("contribuente.provinciaNascita", "RM")

    voci.nth(3).click()
    pag.wait_for_timeout(250)
    riempi("versamento.ufficioCodice", "T7K")
    riempi("versamento.attoAnno", "2026")
    riempi("versamento.attoNumero", "3T/12345")

    voci.nth(4).click()
    pag.wait_for_timeout(250)
    riempi("tributi.riga.0.codice", "109T")
    riempi("tributi.riga.0.importo", "200,00")
    pag.click('[data-aggiungi="tributi|riga"]')
    pag.wait_for_timeout(300)
    riempi("tributi.riga.1.codice", "671T")
    riempi("tributi.riga.1.importo", "16,00")
    pag.wait_for_timeout(400)
    complessivo = pag.locator("#mp-corpo .mp-calcolato").first.inner_text()
    print("  importo complessivo:", complessivo)
    if complessivo.replace(".", "").strip() != "216,00":
        print("  NO l'importo complessivo non corrisponde")
        esito = 1
    if euro(pag.text_content("#tot-saldo")) != 216.00:
        print("  NO il riepilogo laterale non corrisponde")
        esito = 1

    ultimo_passo(pag)
    riempi("chiusura.importoInLettere", "duecentosedici/00")
    riempi("chiusura.firma", "MARIO ROSSI")
    campi = scarica(pag)
    controlla("F23", campi, {
        "delega_a": "BANCA ESEMPIO SPA", "provincia_agenzia": "RM",
        "contribuente_cognome": "ROSSI", "contribuente_cf": "RSSMRA85T10A562S",
        "ufficio_codice": "T7K", "atto_anno": "2026", "atto_numero": "3T/12345",
        "tributo_1_codice": "109T", "tributo_1_importo": "200", "tributo_1_importo_cent": "00",
        "tributo_2_codice": "671T", "tributo_2_importo": "16",
        "totale_complessivo": "216", "totale_complessivo_cent": "00",
        "importo_in_lettere": "duecentosedici/00", "firma": "MARIO ROSSI",
    }, vuoti=("controparte_cognome", "tributo_3_codice", "tributo_8_importo"))
    pag.close()


def main():
    global esito
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORTA), functools.partial(Silenzioso, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errori = []
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge", headless=True)
        ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 1100})
        for nome, prova in (("ORDINARIO", prova_ordinario), ("ELIDE", prova_elide),
                            ("SEMPLIFICATO", prova_semplificato), ("ACCISE", prova_accise),
                            ("F23", prova_f23)):
            print(f"\n================= {nome} =================")
            prova(ctx, errori)
        b.close()
    srv.shutdown()
    if errori:
        print("\nErrori JavaScript:", errori[:5])
        esito = 1
    print("\nESITO COMPLESSIVO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
