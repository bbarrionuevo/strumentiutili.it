"""Prova end-to-end del compilatore del modello AA4/8.

Avvia un server locale sulla cartella del sito, guida il browser sulla pagina
vera, verifica il banner che riprende i dati dal generatore di codice fiscale,
compila i quadri, scarica il PDF e controlla i valori finiti nel modulo.

Uso:  python scripts/prova-modello-aa4-8.py
"""
import sys, os, pathlib, tempfile, threading, http.server, functools, socketserver

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
SC = tempfile.mkdtemp(prefix="prova-aa48-")

try:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e pypdf:  python -m pip install playwright pypdf\n"
             "e poi:  python -m playwright install msedge")

PORTA = 8781
URL = f"http://127.0.0.1:{PORTA}/identita-burocrazia/richiesta-codice-fiscale/"
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


def main():
    global esito
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", PORTA), functools.partial(Silenzioso, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    with sync_playwright() as pw:
        b = pw.chromium.launch(channel="msedge", headless=True)
        ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 1100})

        # Si finge che la persona abbia gia' usato il generatore di codice fiscale:
        # e' il presupposto del banner intelligente.
        ctx.add_init_script("""
          try {
            localStorage.setItem('su_form_data__identita_burocrazia_codice_fiscale_', JSON.stringify({
              cognome: 'Rossi', nome: 'Mario', data: '1985-12-10', sesso: 'M', comune: 'Roma'
            }));
          } catch (e) {}
        """)

        pag = ctx.new_page()
        pag.on("pageerror", lambda e: errori.append(str(e)))
        pag.on("dialog", lambda d: d.accept())
        pag.goto(URL, wait_until="domcontentloaded")
        pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)

        passi = [t.replace(chr(10), " ").strip() for t in
                 pag.locator("#mp-passi .mp-passo-voce").all_inner_texts()]
        print("passi:", passi)

        # --- banner intelligente -------------------------------------------
        pag.wait_for_timeout(400)
        visibile = pag.is_visible("#ponte-cf")
        print("\nbanner dal generatore di codice fiscale visibile:", visibile)
        if not visibile:
            print("  NO il banner non compare")
            esito = 1
        else:
            print("  nome mostrato:", pag.inner_text("#ponte-cf-nome"))

        def riempi(chiave, valore):
            sel = f'[data-campo="AA48.{chiave}"]'
            assert pag.locator(sel).count() > 0, f"campo assente: {chiave}"
            pag.fill(sel, valore)
            pag.dispatch_event(sel, "input")

        # --- passo 1: che cosa chiedi --------------------------------------
        pag.check('input[name="r-AA48.richiesta.tipologia"][value="T"]')
        pag.wait_for_timeout(300)
        sel_tipologia = '[data-campo="AA48.richiesta.codiceTipologiaT"]'
        if pag.locator(sel_tipologia).count() == 0:
            print("  NO il codice tipologia per soggetto terzo non compare")
            esito = 1
        pag.select_option(sel_tipologia, "13")
        pag.dispatch_event(sel_tipologia, "input")

        pag.check('[data-campo="AA48.richiesta.attribuzione"]')
        pag.wait_for_timeout(250)
        pag.check('[data-campo="AA48.richiesta.decesso"]')
        pag.wait_for_timeout(300)
        riempi("richiesta.cfDecesso", "BNCGNN50A01H501N")
        pag.fill('[data-campo="AA48.richiesta.dataDecesso"]', "2026-03-07")
        pag.dispatch_event('[data-campo="AA48.richiesta.dataDecesso"]', "input")

        pag.check('[data-campo="AA48.richiesta.duplicato"]')
        pag.wait_for_timeout(300)
        riempi("richiesta.cfDuplicato", "BNCGNN50A01H501N")
        pag.select_option('[data-campo="AA48.richiesta.motivazione"]', "1")
        pag.dispatch_event('[data-campo="AA48.richiesta.motivazione"]', "input")

        # --- il ponte riempie il Quadro B ----------------------------------
        pag.click("#ponte-cf-usa")
        pag.wait_for_timeout(700)
        voci = pag.locator("#mp-passi .mp-passo-voce")
        voci.nth(1).click()
        pag.wait_for_timeout(300)
        dal_ponte = {c: pag.input_value(f'[data-campo="AA48.anagrafica.{c}"]')
                     for c in ("cognome", "nome", "dataNascita", "sesso", "comuneNascita",
                               "provinciaNascita")}
        print("\nQuadro B compilato dal ponte:", dal_ponte)
        if dal_ponte["cognome"] != "ROSSI" or dal_ponte["provinciaNascita"] != "RM":
            print("  NO il ponte non ha compilato correttamente")
            esito = 1

        # --- passo 3: residenza (quadro opzionale) -------------------------
        voci.nth(2).click()
        pag.wait_for_timeout(250)
        pag.check('[data-attiva="residenza"]')
        pag.wait_for_timeout(400)
        riempi("residenza.comune", "ROMA")
        riempi("residenza.provincia", "RM")
        riempi("residenza.cap", "00184")
        pag.select_option('[data-campo="AA48.residenza.tipologiaVia"]', "Corso")
        pag.dispatch_event('[data-campo="AA48.residenza.tipologiaVia"]', "input")
        riempi("residenza.indirizzo", "ITALIA")
        riempi("residenza.civico", "10 PAL. A")

        # --- ultimo passo: sottoscrizione ----------------------------------
        voci.nth(voci.count() - 1).click()
        pag.wait_for_timeout(300)
        riempi("sottoscrizione.cfSottoscrittore", "RSSMRA85T10A562S")
        pag.fill('[data-campo="AA48.sottoscrizione.dataFirma"]', "2026-09-20")
        pag.dispatch_event('[data-campo="AA48.sottoscrizione.dataFirma"]', "input")

        try:
            with pag.expect_download(timeout=25000) as info:
                pag.click('[data-nav="genera"]')
        except Exception:
            print('DOWNLOAD NON PARTITO. avviso:', pag.inner_text('#mp-stato').strip()[:160])
            print('campi segnalati:', [t.strip()[:70] for t in
                  pag.locator('#mp-corpo .mp-errore').all_inner_texts()])
            etichette = pag.eval_on_selector_all('#mp-corpo .mp-errore',
                'n => n.map(e => (e.closest(".mp-campo")||e.parentElement).innerText.split(String.fromCharCode(10))[0])')
            print('etichette in errore:', etichette)
            raise
        d = info.value
        percorso = os.path.join(SC, d.suggested_filename)
        d.save_as(percorso)
        print("\nscaricato:", d.suggested_filename)
        b.close()
    srv.shutdown()

    campi = valori_pdf(percorso)
    print("\n--- valori nel PDF ---")
    controlla(campi, {
        "richiesta per soggetto terzo": "/Sì",
        "codice_tipologia_richiedente": "13",
        "attribuzione codice fiscale": "/Sì",
        "comunicazione decesso": "/Sì",
        "codice fiscale_2": "BNCGNN50A01H501N",
        "data decesso": "07032026",
        "richiesta duplicato": "/Sì",
        "codice fiscale_4": "BNCGNN50A01H501N",
        "motivazione": "1",
        "quadroB_cognome": "ROSSI",
        "quadroB_nome": "MARIO",
        "quadroc_sesso": "M",
        "data di nascita": "10121985",
        "quadroB_comune": "ROMA",
        "quadroB_provincia": "RM",
        "quadroC_comune": "ROMA",
        "quadroC_cap": "00184",
        "TIPOLOGIA": "Corso",
        "quadroC_indirizzo post": "ITALIA",
        "quadroC_numero civico": "10 PAL. A",
        "cf_sottoscrittore": "RSSMRA85T10A562S",
        "data sottoscrizione": "20092026",
    }, vuoti=("richiesta diretta", "variazione dati", "codice fiscale_1",
              "richiesta certificato", "quadroD_stato estero", "cf_delega"))

    if errori:
        print("\nErrori JavaScript:", errori[:4])
        esito = 1
    print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
