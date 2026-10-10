"""Immagini dei modelli ufficiali compilati con un esempio (dati inventati).

Ogni immagine nasce dal compilatore vero: lo script apre la pagina in un
browser, scrive i dati dell'esempio nei campi, scarica il PDF ufficiale che
produce la pagina e ne disegna la prima facciata con pdf.js (vendor/). Ne
ritaglia la parte compilata e la salva in WebP in assets/esempi/. Se cambia lo
schema o il modello, basta rilanciare lo script: l'immagine resta fedele a
cio' che scarica chi usa il sito.

Uso:  python scripts/genera-esempi-moduli.py [nome ...]
      PROVA_CHROMIUM=/percorso/chromium per un Chromium preciso (senza: Edge)
"""
import base64, functools, http.server, io, os, pathlib, socketserver, sys, threading

ROOT = pathlib.Path(__file__).resolve().parent.parent
USCITA = ROOT / "assets" / "esempi"

try:
    from playwright.sync_api import sync_playwright
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Servono playwright e Pillow:  python -m pip install playwright pillow")

PORTA = 8773

# Gli esempi: pagina, passi da compilare e ritaglio della prima facciata
# (frazioni di larghezza e altezza: sinistra, alto, destra, basso). Ogni passo
# ha i «campi» (chiave dello schema -> valore) e, se serve, il «passo» da aprire
# (una parte del suo titolo) e la sezione da «attiva»re; senza «passo» si va
# avanti di uno. Su ogni immagine si scrive
# «ESEMPIO · DATI INVENTATI», perche' nessuno la scambi per un modello vero.
ESEMPI = {
    "f24-elide-annualita": {
        "pagina": "/cittadino-tasse/f24-editabile/f24-elide/",
        "modello": "ELIDE",
        "passi": [
            {"campi": {
                "contribuente.cf": "RSSMRA85T10H501O",
                "contribuente.cognome": "ROSSI",
                "contribuente.nome": "MARIO",
                "contribuente.nascitaGiorno": "10",
                "contribuente.nascitaMese": "12",
                "contribuente.nascitaAnno": "1985",
                "contribuente.sesso": "M",
                "contribuente.comuneNascita": "ROMA",
                "contribuente.provinciaNascita": "RM",
                "contribuente.domicilioComune": "ROMA",
                "contribuente.domicilioProvincia": "RM",
                "contribuente.domicilioVia": "VIA DI ESEMPIO 1",
                "contribuente.cfCoobbligato": "BNCLRA90A41F205I",
                "contribuente.codiceIdentificativo": "63",
            }},
            {"campi": {
                "erario.riga.0.tipo": "F",
                "erario.riga.0.elementi": "TMD2403012345000",
                "erario.riga.0.codice": "1501",
                "erario.riga.0.anno": "2026",
                "erario.riga.0.debito": "156,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        "ritaglio": (0.0, 0.0, 1.0, 0.43),
        "larghezza": 1100,
    },
    # L'esempio ufficiale dell'Agenzia delle Entrate per il codice 2814 (ricerca
    # codici tributo, «Come compilare il modello F24»): ente D, provincia RM,
    # codice identificativo RMY00240W, 6.000,00 euro; il contribuente e' inventato
    "f24-accise-gas": {
        "pagina": "/cittadino-tasse/f24-editabile/f24-accise/",
        "modello": "ACCISE",
        "passi": [
            {"campi": {
                "contribuente.cf": "RSSMRA85T10H501O",
                "contribuente.cognome": "ROSSI",
                "contribuente.nome": "MARIO",
            }},
            {"passo": "Accise", "attiva": "accise", "campi": {
                "accise.riga.0.ente": "D",
                "accise.riga.0.prov": "RM",
                "accise.riga.0.tributo": "2814",
                "accise.riga.0.identificativo": "RMY00240W",
                "accise.riga.0.debito": "6000,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        # due ritagli: il contribuente e la sezione accise; in mezzo le
        # sezioni rimaste vuote
        "ritaglio": [(0.0, 0.0, 1.0, 0.258), (0.0, 0.6855, 1.0, 0.865)],
        "salto": "Sezioni Erario, INPS, Regioni e IMU: vuote",
        "larghezza": 1100,
    },
    # Un credito IRPEF (codice 4001, come nell'esempio ufficiale «importo a
    # credito») usato per l'acconto IMU di un immobile a Roma (codice 3918,
    # come nell'esempio ufficiale: H501, acconto, un immobile): il modello
    # chiude a zero. Contribuente e importi sono inventati
    "f24-ordinario-compensazione": {
        "pagina": "/cittadino-tasse/f24-editabile/f24-ordinario/",
        "modello": "F24",
        "passi": [
            {"campi": {
                "contribuente.cf": "RSSMRA85T10H501O",
                "contribuente.cognome": "ROSSI",
                "contribuente.nome": "MARIO",
                "contribuente.nascitaGiorno": "10",
                "contribuente.nascitaMese": "12",
                "contribuente.nascitaAnno": "1985",
                "contribuente.sesso": "M",
                "contribuente.comuneNascita": "ROMA",
                "contribuente.provinciaNascita": "RM",
                "contribuente.domicilioComune": "ROMA",
                "contribuente.domicilioProvincia": "RM",
                "contribuente.domicilioVia": "VIA DI ESEMPIO 1",
            }},
            {"passo": "Erario", "campi": {
                "erario.riga.0.tributo": "4001",
                "erario.riga.0.rateazione": "0101",
                "erario.riga.0.anno": "2025",
                "erario.riga.0.credito": "413,00",
            }},
            {"passo": "IMU", "attiva": "imu", "campi": {
                "imu.riga.0.ente": "H501",
                "imu.riga.0.acconto": "X",
                "imu.riga.0.numImmobili": "1",
                "imu.riga.0.tributo": "3918",
                "imu.riga.0.anno": "2026",
                "imu.riga.0.debito": "413,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        # contribuente ed Erario, la sezione IMU, la firma con il saldo finale
        "ritaglio": [(0.0, 0.0, 1.0, 0.385), (0.0, 0.584, 1.0, 0.685), (0.0, 0.828, 1.0, 0.868)],
        "salto": ["Sezioni INPS e Regioni: vuote", "Sezione altri enti previdenziali e assicurativi: vuota"],
        "larghezza": 1100,
    },
    # Acconto IMU di una seconda casa a Roma (A/2, rendita 750, 10,6 per mille:
    # 1.336 euro l'anno, acconto 668) e prima di due rate della TARI, sulla
    # stessa facciata del semplificato
    "f24-semplificato-imu-tari": {
        "pagina": "/cittadino-tasse/f24-editabile/f24-semplificato/",
        "modello": "SEMPLIFICATO",
        "passi": [
            {"campi": {
                "contribuente.cf": "RSSMRA85T10H501O",
                "contribuente.cognome": "ROSSI",
                "contribuente.nome": "MARIO",
                "contribuente.nascitaGiorno": "10",
                "contribuente.nascitaMese": "12",
                "contribuente.nascitaAnno": "1985",
                "contribuente.sesso": "M",
                "contribuente.comuneNascita": "ROMA",
                "contribuente.provinciaNascita": "RM",
            }},
            {"passo": "Motivo del pagamento", "campi": {
                "pagamento.riga.0.sezione": "EL",
                "pagamento.riga.0.tributo": "3918",
                "pagamento.riga.0.ente": "H501",
                "pagamento.riga.0.acconto": "X",
                "pagamento.riga.0.numImmobili": "1",
                "pagamento.riga.0.anno": "2026",
                "pagamento.riga.0.debito": "668,00",
            }},
            {"passo": "Motivo del pagamento", "aggiungi": "pagamento|riga", "campi": {
                "pagamento.riga.1.sezione": "EL",
                "pagamento.riga.1.tributo": "3944",
                "pagamento.riga.1.ente": "H501",
                "pagamento.riga.1.numImmobili": "1",
                "pagamento.riga.1.rateazione": "0102",
                "pagamento.riga.1.anno": "2026",
                "pagamento.riga.1.debito": "210,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        # contribuente, righe e saldo finale: gli estremi del versamento li
        # compila la banca
        "ritaglio": (0.0, 0.0, 1.0, 0.418),
        "larghezza": 1100,
    },
    # Registro su una sentenza (3% di 20.000 euro, codice 109T, causale RG):
    # attore e convenuto, ufficio ed estremi dell'atto sono inventati
    "f23-registro-sentenza": {
        "pagina": "/cittadino-tasse/f24-editabile/f23-editabile/",
        "modello": "F23",
        "passi": [
            {"passo": "Chi versa", "campi": {
                "contribuente.cognome": "ROSSI",
                "contribuente.nome": "MARIO",
                "contribuente.cf": "RSSMRA85T10H501O",
                "contribuente.nascitaGiorno": "10",
                "contribuente.nascitaMese": "12",
                "contribuente.nascitaAnno": "1985",
                "contribuente.sesso": "M",
                "contribuente.comuneNascita": "ROMA",
                "contribuente.provinciaNascita": "RM",
            }},
            {"passo": "Controparte", "attiva": "controparte", "campi": {
                "controparte.cognome": "BIANCHI",
                "controparte.nome": "LAURA",
                "controparte.cf": "BNCLRA90H55F205M",
                "controparte.nascitaGiorno": "15",
                "controparte.nascitaMese": "6",
                "controparte.nascitaAnno": "1990",
                "controparte.sesso": "F",
                "controparte.comuneNascita": "MILANO",
                "controparte.provinciaNascita": "MI",
            }},
            {"passo": "Dati del versamento", "campi": {
                "versamento.ufficioCodice": "TMD",
                "versamento.causale": "RG",
                "versamento.attoAnno": "2026",
                "versamento.attoNumero": "12345",
            }},
            {"passo": "Tributi", "campi": {
                "tributi.riga.0.codice": "109T",
                "tributi.riga.0.importo": "600,00",
            }},
        ],
        "firma": "MARIO ROSSI",
        "ritaglio": (0.0, 0.0, 1.0, 0.745),
        # il timbro dentro il riquadro vuoto del campo 1, per non coprire i titoli
        "etichetta_y": 0.102,
        "larghezza": 1100,
    },
    # L'esempio 4 della scheda «Esempi di compilazione» dell'Agenzia delle
    # Entrate: i coniugi hanno la residenza nella casa A, la luce della casa B
    # e' intestata alla moglie e il canone si paga sulla bolletta del marito.
    # La moglie compila il quadro B con il codice fiscale del marito; la data
    # inizio e' il 1° gennaio dell'anno di presentazione, come consentono le
    # istruzioni quando la famiglia esiste da prima. Le persone sono inventate.
    # I dati stanno sulla seconda e sulla terza facciata (la prima e'
    # l'informativa sulla privacy).
    "canone-tv-quadro-b": {
        "pagina": "/cittadino-tasse/disdetta-canone-rai/",
        "modello": "CANONE",
        "passi": [
            {"passo": "Che cosa dichiari", "campi": {
                "quadro.quadro": "B",
                "quadro.bConferma": True,
                "quadro.bCodiceFiscale": "RSSMRA58T10H501L",
                "quadro.bDataInizio": "2026-01-01",
            }},
            {"passo": "I tuoi dati", "campi": {
                "dichiarante.cognome": "BIANCHI",
                "dichiarante.nome": "LAURA",
                "dichiarante.dataNascita": "1960-06-15",
                "dichiarante.comuneNascita": "MILANO",
                "dichiarante.provinciaNascita": "MI",
                "dichiarante.codiceFiscale": "BNCLRA60H55F205G",
            }},
            {"passo": "Data e firma", "campi": {"firma.data": "2026-10-20"}},
        ],
        "ritaglio": [(2, 0.0, 0.165, 1.0, 0.405), (2, 0.0, 0.645, 1.0, 0.695), (3, 0.0, 0.255, 1.0, 0.405)],
        "salto": ["Erede e intermediario: vuoti", "Seconda facciata del modello: quadro A vuoto"],
        "etichetta_y": 0.2,
        "larghezza": 1100,
    },
    # Dichiarazione per l'esenzione di chi compie 75 anni il 20 gennaio 2027:
    # spetta per tutto il 2027 (istruzioni: 75 anni entro il 31 gennaio).
    # Coniugata, con il codice fiscale del marito convivente e la soglia di
    # 8.000 euro. Le persone sono inventate.
    "canone-tv-over-75": {
        "pagina": "/cittadino-tasse/esenzione-canone-rai-over-75/",
        "modello": "ESENZIONE75",
        "passi": [
            {"passo": "I tuoi dati", "campi": {
                "dichiarante.cognome": "VERDI",
                "dichiarante.nome": "ANNA",
                "dichiarante.dataNascita": "1952-01-20",
                "dichiarante.comuneNascita": "ROMA",
                "dichiarante.provinciaNascita": "RM",
                "dichiarante.codiceFiscale": "VRDNNA52A60H501G",
            }},
            {"passo": "La dichiarazione", "campi": {
                "dichiarazione.sezione": "I",
                "dichiarazione.anno": "2027",
                "dichiarazione.confermaResidenza": True,
                "dichiarazione.statoCivile": "si",
                "dichiarazione.coniugeCf": "GLLPLA50C03H501Q",
                "dichiarazione.confermaConviventi": True,
                "dichiarazione.soglia": "8000",
            }},
            {"passo": "Data e firma", "campi": {"firma.data": "2026-12-10"}},
        ],
        "ritaglio": (2, 0.0, 0.165, 1.0, 0.79),
        "etichetta_y": 0.2,
        "larghezza": 1100,
    },
    # Rimborso con il motivo 4 (canone addebitato su due contratti della
    # stessa famiglia): il marito chiede indietro le quote del canone delle
    # sue tre bollette 2026 e indica il codice fiscale della moglie, sulla cui
    # bolletta il canone resta. Senza data fine la richiesta vale anche come
    # quadro B (scheda «Rimborso del canone TV addebitato in bolletta»).
    # Persone, POD, fatture e importi sono inventati.
    "rimborso-canone-tv-motivo-4": {
        "pagina": "/cittadino-tasse/rimborso-canone-rai/",
        "modello": "RIMBORSO",
        "passi": [
            {"passo": "I tuoi dati", "campi": {
                "richiedente.cognome": "ROSSI",
                "richiedente.nome": "MARIO",
                "richiedente.dataNascita": "1958-12-10",
                "richiedente.comuneNascita": "ROMA",
                "richiedente.provinciaNascita": "RM",
                "richiedente.codiceFiscale": "RSSMRA58T10H501L",
                "richiedente.email": "mario.rossi@example.com",
            }},
            {"passo": "Anno e bollette", "aggiungi": ["fatture|riga", "fatture|riga"], "campi": {
                "fatture.anno": "2026",
                "fatture.riga.0.pod": "IT001E12345678",
                "fatture.riga.0.fattura": "2026-000312",
                "fatture.riga.0.importo": "18,00",
                "fatture.riga.1.fattura": "2026-000845",
                "fatture.riga.1.importo": "18,00",
                "fatture.riga.2.fattura": "2026-001377",
                "fatture.riga.2.importo": "18,00",
            }},
            {"passo": "Il motivo", "campi": {
                "motivo.codice": "4",
                "motivo.familiareCf": "BNCLRA60H55F205G",
                "motivo.dataInizio": "2026-01-01",
            }},
            {"passo": "Data e firma", "campi": {"firma.data": "2026-10-20"}},
        ],
        "ritaglio": [(3, 0.0, 0.065, 1.0, 0.215), (3, 0.0, 0.425, 1.0, 0.56)],
        "salto": "Righe 4-10 della tabella: vuote",
        # il timbro nella fascia grigia, a destra della scritta
        "etichetta_y": 0.219,
        "larghezza": 1100,
    },
    # Prima registrazione di un contratto 4+4 a canone libero (codice L1) con
    # la cedolare secca: un proprietario, un'inquilina, un appartamento a
    # Genova (codice comune D969, l'esempio delle FAQ dell'Agenzia sul
    # quadro C). Con la cedolare non si pagano registro e bollo; fogli e copie
    # si indicano lo stesso. Persone, dati catastali e importi sono inventati.
    "rli-cedolare-l1": {
        "pagina": "/cittadino-tasse/modello-rli/",
        "modello": "RLI",
        "passi": [
            {"passo": "Il contratto", "campi": {
                "contratto.tipologiaContratto": "L1",
                "contratto.durataDal": "2026-11-01",
                "contratto.durataAl": "2030-10-31",
                "contratto.importoCanone": "9600",
            }},
            {"passo": "Registrazione del contratto", "attiva": "registrazione", "campi": {
                "registrazione.nPagine": "2",
                "registrazione.nCopie": "2",
                "registrazione.dataStipula": "2026-10-20",
            }},
            {"passo": "Chi presenta", "campi": {
                "richiedente.cfRichiedente": "RSSMRA58T10H501L",
                "richiedente.tipoSoggetto": "1",
                "richiedente.cognomeRichiedente": "ROSSI",
                "richiedente.nomeRichiedente": "MARIO",
                "richiedente.nModuli": "1",
                "richiedente.firmaRichiedente": "MARIO ROSSI",
            }},
            {"passo": "Locatori", "campi": {
                "locatori.locatore.0.numero": "1",
                "locatori.locatore.0.cf": "RSSMRA58T10H501L",
                "locatori.locatore.0.cognome": "ROSSI",
                "locatori.locatore.0.nome": "MARIO",
                "locatori.locatore.0.dataNascita": "1958-12-10",
                "locatori.locatore.0.sesso": "M",
                "locatori.locatore.0.comuneNascita": "ROMA",
                "locatori.locatore.0.provinciaNascita": "RM",
            }},
            {"passo": "Conduttori", "campi": {
                "conduttori.conduttore.0.numero": "1",
                "conduttori.conduttore.0.cf": "BNCLRA60H55F205G",
                "conduttori.conduttore.0.cognome": "BIANCHI",
                "conduttori.conduttore.0.nome": "LAURA",
                "conduttori.conduttore.0.dataNascita": "1960-06-15",
                "conduttori.conduttore.0.sesso": "F",
                "conduttori.conduttore.0.comuneNascita": "MILANO",
                "conduttori.conduttore.0.provinciaNascita": "MI",
                "conduttori.conduttore.0.qualifica": "3",
            }},
            {"passo": "Gli immobili", "campi": {
                "immobili.immobile.0.numero": "1",
                "immobili.immobile.0.tipologia": "1",
                "immobili.immobile.0.codiceComune": "D969",
                "immobili.immobile.0.tu": "U",
                "immobili.immobile.0.ip": "I",
                "immobili.immobile.0.foglio": "12",
                "immobili.immobile.0.particella": "345",
                "immobili.immobile.0.subalterno": "7",
                "immobili.immobile.0.categoriaCatastale": "A3",
                "immobili.immobile.0.renditaCatastale": "650,74",
                "immobili.immobile.0.comune": "GENOVA",
                "immobili.immobile.0.provincia": "GE",
                "immobili.immobile.0.tipologiaVia": "VIA",
                "immobili.immobile.0.indirizzo": "DI ESEMPIO",
                "immobili.immobile.0.civico": "1",
            }},
            {"passo": "Cedolare secca", "attiva": "cedolare", "campi": {
                "cedolare.riga.0.immobile": "1",
                "cedolare.riga.0.locatore": "1",
                "cedolare.riga.0.possesso": "100",
                "cedolare.riga.0.si": True,
                "cedolare.dichiarazione.0.cf": "RSSMRA58T10H501L",
                "cedolare.dichiarazione.0.firma": "MARIO ROSSI",
            }},
        ],
        "ritaglio": [
            (2, 0.0, 0.0, 1.0, 0.42),      # titolo, quadro A e sezione I
            (2, 0.0, 0.565, 1.0, 0.70),    # sezione III, il richiedente
            (3, 0.0, 0.095, 1.0, 0.195),   # quadro B, il locatore
            (3, 0.0, 0.435, 1.0, 0.535),   # quadro B, la conduttrice
            (4, 0.0, 0.095, 1.0, 0.215),   # quadro C, l'immobile
            (4, 0.0, 0.505, 1.0, 0.575),   # quadro D, la prima riga
            (4, 0.0, 0.735, 1.0, 0.80),    # la dichiarazione del locatore
        ],
        "salto": [
            "Sezione II (adempimenti successivi): vuota alla prima registrazione",
            "Rappresentante, delega e imposte: vuoti (con la cedolare secca niente registro e bollo)",
            "Altri locatori: righe vuote",
            "Altri conduttori: righe vuote",
            "Altri immobili: righe vuote",
            "Righe 2-10 del quadro D: vuote",
        ],
        # il timbro nel riquadro «Riservato all'Agenzia delle Entrate»
        "etichetta_y": 0.17,
        "larghezza": 1100,
    },
}


class Silenzioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def scrivi(pag, modello, chiave, valore):
    sel = f'[data-campo="{modello}.{chiave}"]'
    pag.wait_for_selector(sel, timeout=8000)
    if pag.eval_on_selector(sel, "e => e.type") == "radio":
        # le scelte fra piu' voci (quadro, sezione, motivo): si spunta quella col valore
        pag.check(f'{sel}[value="{valore}"]')
    elif pag.eval_on_selector(sel, "e => e.type") == "checkbox":
        # le caselle da barrare (acconto, saldo...): «X» le spunta
        pag.set_checked(sel, bool(valore))
    elif pag.eval_on_selector(sel, "e => e.tagName") == "SELECT":
        pag.select_option(sel, valore)
    else:
        pag.fill(sel, valore)
        pag.dispatch_event(sel, "input")
    pag.dispatch_event(sel, "change")


def compila(ctx, esempio):
    pag = ctx.new_page()
    errori = []
    pag.on("pageerror", lambda e: errori.append(str(e)))
    pag.on("dialog", lambda d: d.accept())
    pag.goto(f"http://127.0.0.1:{PORTA}{esempio['pagina']}", wait_until="domcontentloaded")
    pag.wait_for_selector("#mp-corpo .mp-titolo", timeout=20000)
    m = esempio["modello"]
    for i, passo in enumerate(esempio["passi"]):
        if passo.get("passo"):
            voci = pag.locator("#mp-passi .mp-passo-voce")
            titoli = [t.replace("\n", " ") for t in voci.all_inner_texts()]
            voci.nth([k for k, t in enumerate(titoli) if passo["passo"] in t][0]).click()
            pag.wait_for_timeout(300)
        elif i:
            pag.click('[data-nav="avanti"]')
            pag.wait_for_timeout(300)
        if passo.get("attiva"):
            pag.check(f'[data-attiva="{passo["attiva"]}"]')
            pag.wait_for_timeout(400)
        aggiunte = passo.get("aggiungi") or []
        for gruppo in [aggiunte] if isinstance(aggiunte, str) else aggiunte:
            # una riga in piu' nel gruppo ripetibile («passo|gruppo»)
            pag.click(f'[data-aggiungi="{gruppo}"]')
            pag.wait_for_timeout(300)
        for chiave, valore in passo["campi"].items():
            scrivi(pag, m, chiave, valore)
    voci = pag.locator("#mp-passi .mp-passo-voce")
    voci.nth(voci.count() - 1).click()
    pag.wait_for_timeout(300)
    if esempio.get("firma"):
        scrivi(pag, m, "chiusura.firma", esempio["firma"])
    with pag.expect_download(timeout=30000) as info:
        pag.click('[data-nav="genera"]')
    with open(info.value.path(), "rb") as f:
        pdf = f.read()
    if errori:
        raise SystemExit(f"Errori nella pagina: {errori}")
    pag.close()
    return pdf


def disegna(ctx, pdf, larghezza, facciata=1):
    """Una facciata del PDF (la prima, se non si dice) come PNG, disegnata da
    pdf.js nel browser."""
    pag = ctx.new_page()
    pag.goto(f"http://127.0.0.1:{PORTA}/robots.txt")
    pag.add_script_tag(url="/vendor/pdfjs@3.11.174/pdf.min.js")
    dati = pag.evaluate(
        """async ([b64, larghezza, facciata]) => {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs@3.11.174/pdf.worker.min.js';
          const byte = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const doc = await pdfjsLib.getDocument({ data: byte }).promise;
          const p = await doc.getPage(facciata);
          const base = p.getViewport({ scale: 1 });
          const vista = p.getViewport({ scale: larghezza / base.width });
          const tela = document.createElement('canvas');
          tela.width = Math.round(vista.width);
          tela.height = Math.round(vista.height);
          const c = tela.getContext('2d');
          c.fillStyle = '#fff';
          c.fillRect(0, 0, tela.width, tela.height);
          await p.render({ canvasContext: c, viewport: vista, annotationMode: pdfjsLib.AnnotationMode.ENABLE }).promise;
          return tela.toDataURL('image/png');
        }""",
        [base64.b64encode(pdf).decode(), larghezza, facciata],
    )
    pag.close()
    return Image.open(io.BytesIO(base64.b64decode(dati.split(",", 1)[1])))


def facciate(ritaglio):
    """Le facciate che servono: un ritaglio di cinque numeri comincia con la
    facciata (1 = la prima); con quattro numeri e' la prima."""
    return sorted({r[0] if len(r) == 5 else 1 for r in (ritaglio if isinstance(ritaglio, list) else [ritaglio])})


def ritaglia(immagini, ritaglio, salto):
    """Il ritaglio della facciata; con piu' ritagli, uno sotto l'altro, separati
    da una fascia grigia che dice cosa e' stato tolto (un testo per ogni fascia,
    oppure lo stesso per tutte). «immagini»: facciata -> immagine."""
    pezzi = []
    for r in (ritaglio if isinstance(ritaglio, list) else [ritaglio]):
        img = immagini[r[0] if len(r) == 5 else 1]
        w, h = img.size
        l, a, d, g = r[-4:]
        pezzi.append(img.crop((round(l * w), round(a * h), round(d * w), round(g * h))).convert("RGB"))
    w = pezzi[0].size[0]
    if len(pezzi) == 1:
        return pezzi[0]
    fascia = max(28, w // 30)
    alto = sum(p.size[1] for p in pezzi) + fascia * (len(pezzi) - 1)
    tela = Image.new("RGB", (max(p.size[0] for p in pezzi), alto), "white")
    d = ImageDraw.Draw(tela)
    font = ImageFont.load_default(size=max(13, w // 70))
    y = 0
    for i, p in enumerate(pezzi):
        if i:
            testo = salto[i - 1] if isinstance(salto, list) else salto
            d.rectangle((0, y, tela.size[0], y + fascia - 1), fill="#e5e7eb")
            l, a, r, g = d.textbbox((0, 0), testo, font=font)
            d.text(((tela.size[0] - (r - l)) // 2 - l, y + (fascia - (g - a)) // 2 - a), testo, fill="#4b5563", font=font)
            y += fascia
        tela.paste(p, (0, y))
        y += p.size[1]
    return tela


def etichetta(img, y_frazione=None):
    """«ESEMPIO · DATI INVENTATI» in rosso, in alto a destra (o all'altezza
    indicata, in frazioni della larghezza)."""
    d = ImageDraw.Draw(img)
    testo = "ESEMPIO \u00b7 DATI INVENTATI"
    font = ImageFont.load_default(size=max(16, img.size[0] // 40))
    l, a, r, g = d.textbbox((0, 0), testo, font=font)
    x = img.size[0] - (r - l) - img.size[0] // 20
    y = round(img.size[0] * y_frazione) if y_frazione else img.size[0] // 14
    m = img.size[0] // 110
    d.rectangle((x - m, y - m, x + (r - l) + m, y + (g - a) + m + 2), fill="white", outline="#b91c1c", width=2)
    d.text((x - l, y - a), testo, fill="#b91c1c", font=font)


def main(nomi):
    USCITA.mkdir(parents=True, exist_ok=True)
    gestore = functools.partial(Silenzioso, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer(("127.0.0.1", PORTA), gestore)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            if os.environ.get("PROVA_CHROMIUM"):
                b = pw.chromium.launch(executable_path=os.environ["PROVA_CHROMIUM"], headless=True)
            else:
                b = pw.chromium.launch(channel="msedge", headless=True)
            ctx = b.new_context(accept_downloads=True, service_workers="block")
            for nome in nomi:
                esempio = ESEMPI[nome]
                pdf = compila(ctx, esempio)
                immagini = {f: disegna(ctx, pdf, esempio["larghezza"], f) for f in facciate(esempio["ritaglio"])}
                img = ritaglia(immagini, esempio["ritaglio"], esempio.get("salto", ""))
                etichetta(img, esempio.get("etichetta_y"))
                dest = USCITA / f"{nome}.webp"
                img.save(dest, "WEBP", quality=82, method=6)
                print(f"{dest.relative_to(ROOT)}: {img.size[0]}x{img.size[1]}, {dest.stat().st_size // 1024} KB")
            b.close()
    finally:
        server.shutdown()


if __name__ == "__main__":
    scelti = sys.argv[1:] or list(ESEMPI)
    sconosciuti = [n for n in scelti if n not in ESEMPI]
    if sconosciuti:
        sys.exit(f"Esempi sconosciuti: {', '.join(sconosciuti)}")
    main(scelti)
