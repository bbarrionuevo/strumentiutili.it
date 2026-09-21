"""Prova end-to-end del compilatore del modello AA5/6.

Avvia un server locale sulla cartella del sito, guida il browser sulla pagina
vera, verifica il banner che riprende i dati dal generatore di codice fiscale,
compila il modulo come farebbe l'amministratore di un condominio, scarica il PDF
e confronta i valori finiti nel modello.

Uso:  python scripts/prova-modello-aa5-6.py
"""
import sys, os, pathlib, tempfile, threading, http.server, functools, socketserver, json

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
SCARICATI = tempfile.mkdtemp(prefix="prova-aa5-")

try:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e pypdf:  python -m pip install playwright pypdf\n"
             "e poi:  python -m playwright install msedge")

PORTA = 8831
URL = f"http://127.0.0.1:{PORTA}/identita-burocrazia/codice-fiscale-enti/"
esito = 0
errori = []

# quello che il generatore di codice fiscale avrebbe lasciato in memoria
STATO_GENERATORE = {"cognome": "Bianchi", "nome": "Giovanna", "sesso": "F",
                    "data": "1972-05-14", "comune": "Milano"}


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def valori_pdf(percorso):
    r = PdfReader(percorso)
    fuori = {}
    for rif in r.trailer["/Root"]["/AcroForm"]["/Fields"]:
        c = rif.get_object()
        valore = c.get("/V")
        fuori[str(c.get("/T", ""))] = str(valore) if valore is not None else ""
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
        ctx.add_init_script(
            "try { localStorage.setItem('su_form_data__identita_burocrazia_codice_fiscale_', "
            + json.dumps(json.dumps(STATO_GENERATORE)) + "); } catch (e) {}")

        pag = ctx.new_page()
        pag.on("pageerror", lambda e: errori.append(str(e)))
        pag.on("dialog", lambda d: d.accept())
        pag.goto(URL, wait_until="load")
        pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)

        passi = [t.replace(chr(10), " ").strip() for t in
                 pag.locator("#mp-passi .mp-passo-voce").all_inner_texts()]
        print("passi:", passi)
        if len(passi) != 10:
            print("  NO i passi dovrebbero essere 10")
            esito = 1

        def riempi(chiave, valore):
            sel = f'[data-campo="AA5_6.{chiave}"]'
            assert pag.locator(sel).count() > 0, f"campo assente: {chiave}"
            pag.fill(sel, valore)
            pag.dispatch_event(sel, "input")

        def scegli(chiave, valore):
            sel = f'[data-campo="AA5_6.{chiave}"]'
            assert pag.locator(sel).count() > 0, f"campo assente: {chiave}"
            pag.select_option(sel, valore)

        # --- i numeri di pagina arrivano gia' scritti -----------------------
        primo = pag.input_value('[data-campo="AA5_6.richiesta.numeroPagina"]')
        secondo = pag.input_value('[data-campo="AA5_6.richiesta.numeroPagina2"]')
        print(f"\nnumerazione preimpostata: {primo!r} e {secondo!r}")
        if (primo, secondo) != ("01", "02"):
            print("  NO i valori iniziali non sono stati applicati")
            esito = 1

        # --- passo 1: quadro A ---------------------------------------------
        pag.check('input[name="r-AA5_6.richiesta.tipo"][value="1"]')
        pag.wait_for_timeout(300)
        riempi("richiesta.dataCostituzione", "2010-03-07")
        riempi("richiesta.cfTestata", "BNCGNN72E54F205S")

        # i campi degli altri tipi di richiesta non devono nemmeno comparire
        nascosti = [c for c in ("richiesta.cfVariazione", "richiesta.cfEstinzione",
                                "richiesta.cfDuplicato", "richiesta.cfRichiedente")
                    if pag.locator(f'[data-campo="AA5_6.{c}"]').count() > 0]
        print("campi degli altri tipi di richiesta ancora a schermo:", nascosti or "nessuno")
        if nascosti:
            esito = 1

        # --- passo 2: l'ente ------------------------------------------------
        voci = pag.locator("#mp-passi .mp-passo-voce")
        voci.nth(1).click()
        pag.wait_for_timeout(300)
        riempi("ente.denominazione", "CONDOMINIO VIA GARIBALDI 12")
        scegli("ente.naturaGiuridica", "51")
        riempi("ente.codiceAttivita", "681000")
        riempi("ente.descrizioneAttivita", "GESTIONE DELLE PARTI COMUNI DELL EDIFICIO")
        riempi("ente.termineGiorno", "30")
        riempi("ente.termineMese", "06")

        # --- passo 3: la sede ------------------------------------------------
        voci.nth(2).click()
        pag.wait_for_timeout(300)
        riempi("sede.indirizzo", "VIA GIUSEPPE GARIBALDI 12")
        riempi("sede.cap", "20121")
        riempi("sede.comune", "MILANO")
        riempi("sede.provincia", "MI")

        # --- passo 5: il rappresentante, dal ponte ---------------------------
        indice_rappr = [i for i, t in enumerate(passi) if "rappresenta" in t.lower()][0]
        pag.wait_for_timeout(200)
        visibile = pag.is_visible("#ponte-cf")
        print("\nbanner dal generatore di codice fiscale:", "visibile" if visibile else "ASSENTE")
        if not visibile:
            esito = 1
        else:
            print("  propone:", pag.inner_text("#ponte-cf-nome"))
            pag.click("#ponte-cf-usa")
            pag.wait_for_timeout(800)

        voci.nth(indice_rappr).click()
        pag.wait_for_timeout(300)
        dal_ponte = {
            "cognome": pag.input_value('[data-campo="AA5_6.rappresentante.cognome"]'),
            "nome": pag.input_value('[data-campo="AA5_6.rappresentante.nome"]'),
            "comune": pag.input_value('[data-campo="AA5_6.rappresentante.comuneNascita"]'),
            "provincia": pag.input_value('[data-campo="AA5_6.rappresentante.provinciaNascita"]'),
            "sesso": pag.input_value('[data-campo="AA5_6.rappresentante.sesso"]'),
        }
        print("  scritto dal ponte:", dal_ponte)
        atteso_ponte = {"cognome": "BIANCHI", "nome": "GIOVANNA", "comune": "MILANO",
                        "provincia": "MI", "sesso": "F"}
        if dal_ponte != atteso_ponte:
            print("  NO il ponte non ha riempito il quadro C:", atteso_ponte)
            esito = 1

        scegli("rappresentante.carica", "13")
        riempi("rappresentante.codiceFiscale", "BNCGNN72E54F205S")

        # --- un codice fiscale sbagliato deve essere rifiutato ---------------
        riempi("rappresentante.codiceFiscale", "BNCGNN72E54F205A")
        pag.click('[data-nav="avanti"]')
        pag.wait_for_timeout(400)
        bloccato = pag.locator("#mp-corpo .mp-errore").count() > 0
        print("\ncodice fiscale con carattere di controllo errato rifiutato:", bloccato)
        if not bloccato:
            esito = 1
        riempi("rappresentante.codiceFiscale", "BNCGNN72E54F205S")

        # --- allegati e firma ------------------------------------------------
        indice_firma = [i for i, t in enumerate(passi) if "firma" in t.lower()][0]
        voci.nth(indice_firma).click()
        pag.wait_for_timeout(300)
        riempi("allegati.elenco", "COPIA DEL VERBALE DI NOMINA DELL AMMINISTRATORE")
        riempi("allegati.data", "2026-09-21")
        riempi("allegati.codiceFiscale", "BNCGNN72E54F205S")
        riempi("allegati.firma", "GIOVANNA BIANCHI")

        # --- genera -----------------------------------------------------------
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
        "attribuzione codice fiscale": "/On",
        "data costituzione": "07032010",
        "codice fiscale_pagina": "BNCGNN72E54F205S",
        "numero pagina": "01",
        "numero pagina2": "02",
        "denominazione": "CONDOMINIO VIA GARIBALDI 12",
        "natura giuridica": "51",
        "codice attività": "681000",
        "descrizione attività": "GESTIONE DELLE PARTI COMUNI DELL EDIFICIO",
        "termine app_giorno": "30",
        "termine app_mese": "06",
        "indirizzo completo": "VIA GIUSEPPE GARIBALDI 12",
        "cap": "20121",
        "comune": "MILANO",
        "provincia": "MI",
        "quadroC_cognome": "BIANCHI",
        "quadroC_nome": "GIOVANNA",
        "quadroc_sesso": "F",
        "codice carica": "13",
        "quadroC_comune": "MILANO",
        "quadroc_provincia": "MI",
        "quadroc_data di nascita": "14051972",
        "quadroC_codice fiscale_richiedente": "BNCGNN72E54F205S",
        "allegati": "COPIA DEL VERBALE DI NOMINA DELL AMMINISTRATORE",
        "sottoscrizione_data": "21/09/2026",
        "codice fiscale_sottoscrizione": "BNCGNN72E54F205S",
        "firma_sottoscrizione": "GIOVANNA BIANCHI",
    }, vuoti=("variazione dati", "estinzione", "richiesta duplicato", "richiesta attribuzione",
              "codice fiscale_cs2", "codice fiscale_cs3", "codice fiscale_cs4",
              "codice fiscale_richiedente", "data variazione", "data estinzione",
              "indirizzo completo_domicilio fiscale", "cap_domicilio fiscale",
              "fusione", "concentrazione", "trasformazione", "quadro d_codice fiscale 1",
              "dati relativi al soggetto_denominazione", "rappresentante_cognome",
              "rappresentante_sesso", "delega_il sottoscritto", "firma_delega",
              "codice fiscale_telematico", "impegno telematico contribuente",
              "firma_intermediario", "sigla"))

    # il codice fiscale di testata deve comparire su tutte e due le pagine
    r = PdfReader(percorso)
    dove = {}
    for i, p in enumerate(r.pages):
        for a in (p.get("/Annots") or []):
            dove[a.idnum] = i
    for rif in r.trailer["/Root"]["/AcroForm"]["/Fields"]:
        o = rif.get_object()
        if str(o.get("/T")) == "codice fiscale_pagina":
            pagine = sorted(dove.get(k.idnum, "?") for k in (o.get("/Kids") or []))
            ok = pagine == [1, 2]
            if not ok:
                esito = 1
            print(f"\n  {'OK ' if ok else 'NO '} testata scritta una volta e stampata sulle pagine {pagine}")

    if errori:
        print("\nErrori JavaScript:", errori[:4])
        esito = 1
    print("\nESITO:", "TUTTO OK" if esito == 0 else "CI SONO PROBLEMI")
    return esito


sys.exit(main())
