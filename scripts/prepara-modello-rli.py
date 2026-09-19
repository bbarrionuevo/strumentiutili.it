#!/usr/bin/env python3
"""Crea i campi compilabili del modello RLI.

Il PDF pubblicato dall'Agenzia delle Entrate (assets/pdf/modello-rli-ufficiale.pdf)
non ha campi modulo: e' un disegno. Le caselle da compilare pero' sono rettangoli
bianchi tracciati sopra il pannello grigio, e i campi "a pettine" hanno trattini
verticali che separano i singoli caratteri. Lo script li ricava dal content stream,
li riconosce dalla posizione e crea un AcroForm con un campo di testo per ognuno,
con il numero massimo di caratteri corretto.

Tutte le caselle diventano campi di testo, comprese quelle da barrare: sui modelli
dell'Agenzia "barrare" significa tracciare una X, e un campo di testo centrato la
disegna esattamente dentro al quadretto.

Produce assets/pdf/modello-rli-compilabile.pdf, che e' il file caricato dalla
pagina web. Il file di partenza non viene modificato.

Uso:  python scripts/prepara-modello-rli.py
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import (
        ArrayObject,
        BooleanObject,
        DictionaryObject,
        FloatObject,
        NameObject,
        NumberObject,
        TextStringObject,
    )
    from pypdf.generic import ContentStream
except ImportError:  # pragma: no cover
    sys.exit("Serve pypdf:  python -m pip install pypdf")


ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "assets" / "pdf"
SORGENTE = PDF_DIR / "modello-rli-ufficiale.pdf"
DESTINAZIONE = PDF_DIR / "modello-rli-compilabile.pdf"

TOLLERANZA = 2.0          # scarto ammesso in orizzontale
SCARTO_VERTICALE = 9.0    # le caselle di una stessa riga non sono perfettamente allineate
FLAG_PETTINE = 1 << 24    # bit 25: testo distribuito nelle caselle stampate


# --------------------------------------------------------------- lettura grafica

def _numero(x):
    try:
        return float(x)
    except Exception:
        return 0.0


def _estendi(bbox, punto):
    x, y = punto
    if bbox is None:
        return [x, y, x, y]
    return [min(bbox[0], x), min(bbox[1], y), max(bbox[2], x), max(bbox[3], y)]


def percorsi_pagina(pagina):
    """Rettangoli e tracciati della pagina, con il colore di riempimento."""
    cs = ContentStream(pagina.get_contents(), pagina.pdf)
    out = []
    fill = (0.0, 0.0, 0.0)
    ctm = [1, 0, 0, 1, 0, 0]
    pila = []
    corrente = None

    def applica(m, x, y):
        return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])

    def moltiplica(a, b):
        return [
            a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
        ]

    for operandi, operatore in cs.operations:
        op = operatore.decode() if isinstance(operatore, bytes) else str(operatore)
        if op == "q":
            pila.append((fill, list(ctm)))
        elif op == "Q":
            if pila:
                fill, ctm = pila.pop()
        elif op == "cm":
            ctm = moltiplica([_numero(v) for v in operandi], ctm)
        elif op in ("rg", "sc", "scn"):
            v = [_numero(x) for x in operandi if not isinstance(x, NameObject)]
            if len(v) == 3:
                fill = tuple(v)
            elif len(v) == 1:
                fill = (v[0], v[0], v[0])
        elif op == "g":
            v = _numero(operandi[0]); fill = (v, v, v)
        elif op == "k":
            c, m, y, kk = [_numero(v) for v in operandi]
            fill = ((1 - c) * (1 - kk), (1 - m) * (1 - kk), (1 - y) * (1 - kk))
        elif op == "re":
            x, y, w, h = [_numero(v) for v in operandi]
            for px, py in ((x, y), (x + w, y + h)):
                corrente = _estendi(corrente, applica(ctm, px, py))
        elif op in ("m", "l"):
            corrente = _estendi(corrente, applica(ctm, _numero(operandi[0]), _numero(operandi[1])))
        elif op in ("c", "v", "y"):
            v = [_numero(x) for x in operandi]
            for i in range(0, len(v) - 1, 2):
                corrente = _estendi(corrente, applica(ctm, v[i], v[i + 1]))
        elif op in ("f", "F", "f*", "b", "b*", "B", "B*", "S", "s", "n") and corrente:
            out.append({"rect": [round(v, 1) for v in corrente],
                        "fill": tuple(round(v, 3) for v in fill), "op": op})
            corrente = None
    return out


# Sfondi bianchi delle diciture stampate in testata: vanno tolti prima di contare
# i trattini, altrimenti ne inghiottono uno e il pettine risulta piu' corto.
SFONDI_ETICHETTA = [
    (166.9, 793.4, 220.3, 811.4),   # "Codice fiscale"
    (454.8, 793.4, 508.2, 811.4),   # "Modulo N."
    (518.4, 766.4, 566.9, 778.9),   # "MOD. RLI"
]


def caselle_pagina(pagina):
    """Caselle compilabili: [{rect, celle}] in ordine di lettura."""
    altezza = float(pagina.mediabox.height)
    percorsi = percorsi_pagina(pagina)

    tratti = []
    for p in percorsi:
        if p["op"] != "S":
            continue
        x0, y0, x1, y1 = p["rect"]
        if abs(x1 - x0) < 0.6 and 2.0 < (y1 - y0) < 30.0:
            tratti.append(((x0 + x1) / 2, y0, y1))

    def scartabile(b):
        if b[0] < 60 and b[3] > altezza - 60:          # logo dell'Agenzia
            return True
        return any(all(abs(a - c) < 1.5 for a, c in zip(b, e)) for e in SFONDI_ETICHETTA)

    grezze = []
    for p in percorsi:
        if p["op"] not in ("f", "f*", "B", "B*") or p["fill"] != (1.0, 1.0, 1.0):
            continue
        b = p["rect"]
        if not (6.0 <= b[2] - b[0] <= 530.0 and 6.0 <= b[3] - b[1] <= 40.0):
            continue
        if scartabile(b):
            continue
        grezze.append(b)

    # via i rettangoli interamente contenuti in un altro: sono ritagli interni
    def dentro_altro(b):
        for a in grezze:
            if a is b:
                continue
            if (a[0] <= b[0] + .5 and a[1] <= b[1] + .5 and a[2] >= b[2] - .5 and a[3] >= b[3] - .5
                    and (a[2] - a[0]) * (a[3] - a[1]) > (b[2] - b[0]) * (b[3] - b[1])):
                return True
        return False

    box = [b for b in grezze if not dentro_altro(b)]

    def celle(b):
        dentro = [t for t in tratti
                  if b[0] + 1 < t[0] < b[2] - 1 and t[1] < b[3] - 1 and t[2] > b[1] + 1]
        return len(dentro) + 1 if dentro else None

    caselle = [{"rect": b, "celle": celle(b)} for b in box]

    # pettini disegnati sul fondo bianco (codice fiscale in testata, Modulo N.)
    liberi = [t for t in tratti
              if not any(b[0] - 1 <= t[0] <= b[2] + 1 and b[1] - 1 <= t[1] and t[2] <= b[3] + 1
                         for b in box)]
    liberi.sort(key=lambda t: (round(t[1], 1), t[0]))
    gruppo = []
    for t in liberi + [None]:
        if t is not None and gruppo and abs(t[1] - gruppo[-1][1]) < 1.5 and 0 < t[0] - gruppo[-1][0] < 22:
            gruppo.append(t)
            continue
        if len(gruppo) >= 3:
            caselle.append({"rect": [gruppo[0][0], gruppo[0][1], gruppo[-1][0], gruppo[0][2]],
                            "celle": len(gruppo) - 1})
        gruppo = [t] if t is not None else []

    caselle.sort(key=lambda c: (-c["rect"][3], c["rect"][0]))
    return caselle


# ------------------------------------------------------------------ mappa campi
# Ogni voce: (nome, x, y) dove x e y sono l'angolo in basso a sinistra della
# casella, letti dal modello. I blocchi che si ripetono sono generati in ciclo
# sulle ordinate reali rilevate, perche' il passo non e' perfettamente costante.

def mappa_pagina2():
    return [
        ("cf_testata_p2", 230.3, 793.9),

        # Quadro A - dati generali
        ("tipologia_contratto", 110.4, 649.9),
        ("durata_dal", 186.0, 649.9),
        ("durata_al", 322.8, 649.9),
        ("importo_canone", 452.4, 649.9),
        ("pagamento_intera_durata", 121.7, 614.7),
        ("eventi_eccezionali", 172.1, 614.4),
        ("casi_particolari", 222.5, 614.4),
        ("esenzioni", 272.9, 614.4),
        ("contratto_tempo_indeterminato", 323.3, 614.4),
        ("clausola_penale_volontaria", 373.7, 614.4),
        ("tipo_garanzie_pac", 424.1, 614.4),
        ("garanzia_soggetta_iva", 474.5, 614.4),
        ("cf_garante", 106.8, 577.9),
        ("importo_garanzia", 351.6, 577.9),
        ("cf_secondo_garante", 106.8, 541.9),

        # Sezione I - registrazione
        ("ufficio_territoriale", 157.2, 505.9),
        ("n_pagine", 351.6, 505.9),
        ("n_copie", 394.8, 505.9),
        ("data_stipula", 438.0, 505.9),
        ("allegati_scritture_private", 150.0, 470.5),
        ("allegati_ricevute_quietanze", 229.2, 470.5),
        ("allegati_mappe_planimetrie", 315.6, 470.5),
        ("contratto_soggetto_iva", 438.5, 470.1),
        ("condizione_sospensiva", 510.5, 470.8),

        # Sezione II - adempimenti successivi
        ("annualita", 366.0, 433.9),
        ("data_inizio_canone_rinegoziato", 438.0, 433.9),
        ("adempimenti_successivi", 107.3, 434.1),
        ("tipologia_proroga", 149.1, 434.0),
        ("tipologia_subentro", 190.9, 434.0),
        ("tipologia_regime", 232.6, 434.1),
        ("cdc", 274.4, 434.1),
        ("tardivita_annualita_successiva", 316.1, 434.1),
        ("data_fine_adempimento", 106.6, 397.9),
        ("corrispettivo_cessione_risoluzione", 229.2, 397.9),
        ("codice_identificativo_contratto", 308.2, 397.9),
        ("rif_cod_ufficio", 106.8, 361.9),
        ("rif_anno", 164.4, 361.9),
        ("rif_serie", 236.4, 361.9),
        ("rif_numero", 279.6, 361.9),
        ("rif_sottonumero", 380.4, 361.9),

        # Sezione III - richiedente
        ("richiedente_cognome", 106.6, 325.9),
        ("richiedente_nome", 351.5, 325.9),
        ("tipo_soggetto", 50.3, 302.7),
        ("cf_richiedente", 106.6, 289.9),
        ("n_moduli_compilati", 351.4, 289.5),
        ("firma_richiedente", 351.6, 254.5),

        # Rappresentante legale
        ("rappresentante_cognome", 106.7, 229.9),
        ("rappresentante_nome", 351.6, 229.9),
        ("cf_rappresentante", 106.6, 205.9),
        ("codice_carica", 525.5, 205.8),

        # Delega
        ("firma_delegante", 351.6, 159.1),
        ("cf_delegato", 107.0, 158.6),

        # Presentazione telematica
        ("cf_intermediario", 106.8, 109.7),
        ("impegno_presentazione", 540.0, 110.2),
        ("firma_intermediario", 351.4, 86.2),
        ("data_impegno", 107.1, 85.6),

        # Imposte
        ("imposta_registro", 182.8, 61.9),
        ("sanzioni_registro", 322.8, 61.9),
        ("interessi_registro", 467.4, 61.9),
        ("imposta_bollo", 182.8, 37.9),
        ("sanzioni_bollo", 322.8, 37.9),
        ("interessi_bollo", 467.4, 37.9),
    ]


def mappa_pagina3(ancore):
    """8 blocchi identici: 4 locatori e 4 conduttori."""
    voci = [("cf_testata_p3", 230.3, 793.9), ("modulo_n_p3", 513.6, 793.9)]
    for i, cima in enumerate(ancore, start=1):
        ruolo = "locatore" if i <= 4 else "conduttore"
        n = i if i <= 4 else i - 4
        p = f"{ruolo}{n}"
        voci += [
            (f"{p}_cf", 114.0, cima - 18.0),
            (f"{p}_qualifica", 366.5, cima - 24.4),
            (f"{p}_soggettivita_iva", 420.5, cima - 24.4),
            (f"{p}_cedente", 470.9, cima - 24.4),
            (f"{p}_cessionario", 524.9, cima - 24.4),
            (f"{p}_cognome", 114.0, cima - 42.0),
            (f"{p}_nome", 358.8, cima - 42.0),
            (f"{p}_numero", 50.2, cima - 45.0),
            (f"{p}_data_nascita", 114.0, cima - 66.0),
            (f"{p}_comune_nascita", 265.2, cima - 66.0),
            (f"{p}_provincia_nascita", 524.5, cima - 66.0),
            (f"{p}_sesso", 240.0, cima - 66.0),
        ]
    return voci


def mappa_pagina4(immobili, righe_d, firme):
    voci = [("cf_testata_p4", 230.3, 793.9), ("modulo_n_p4", 513.6, 793.9)]

    for i, cima in enumerate(immobili, start=1):
        p = f"immobile{i}"
        voci += [
            (f"{p}_codice_comune", 164.5, cima - 18.0),
            (f"{p}_tu", 243.6, cima - 18.0),
            (f"{p}_ip", 272.4, cima - 18.0),
            (f"{p}_sezione_urbana", 303.2, cima - 18.0),
            (f"{p}_foglio", 355.2, cima - 18.0),
            (f"{p}_particella", 423.6, cima - 18.0),
            (f"{p}_particella_seconda", 502.8, cima - 18.0),
            (f"{p}_tipologia", 124.8, cima - 14.8),
            (f"{p}_numero", 50.2, cima - 18.0),
            (f"{p}_subalterno", 106.8, cima - 42.4),
            (f"{p}_comune", 214.8, cima - 42.4),
            (f"{p}_provincia", 524.4, cima - 42.4),
            (f"{p}_in_via_accatastamento", 186.1, cima - 42.4),
            (f"{p}_categoria_catastale", 106.8, cima - 66.4),
            (f"{p}_rendita_catastale", 164.1, cima - 66.4),
            (f"{p}_tipologia_via", 250.8, cima - 66.5),
            (f"{p}_indirizzo", 330.0, cima - 66.5),
            (f"{p}_civico", 538.8, cima - 66.4),
        ]

    # quadro D: due colonne di cinque righe (1-5 a sinistra, 6-10 a destra)
    for j, cima in enumerate(righe_d):
        for colonna, (xi, xl, xp, xsi, xno) in enumerate(
                ((135.7, 178.9, 222.1, 290.9, 305.3), (376.9, 420.1, 463.3, 532.1, 546.5))):
            n = j + 1 + colonna * 5
            voci += [
                (f"tassazione{n}_immobile", xi, cima - 18.0),
                (f"tassazione{n}_locatore", xl, cima - 18.0),
                (f"tassazione{n}_possesso", xp, cima - 18.0),
                (f"tassazione{n}_cedolare_si", xsi, cima - 17.5),
                (f"tassazione{n}_cedolare_no", xno, cima - 17.5),
            ]

    for i, cima in enumerate(firme, start=1):
        voci += [
            (f"dichiarazione{i}_cf", 106.9, cima - 18.0),
            (f"dichiarazione{i}_firma", 344.5, cima - 18.0),
        ]
    return voci


def mappa_pagina5(righe):
    voci = [("cf_testata_p5", 230.3, 793.9)]
    for j, cima in enumerate(righe):
        for colonna, x in enumerate((171.6, 402.0)):
            annualita = 2 + j + colonna * 4
            voci.append((f"canone_annualita_{annualita}", x, cima - 18.0))
    return voci


def ancore(caselle, x, larghezza=None, celle=None):
    """Ordinate (lato alto) delle caselle che stanno a una certa ascissa."""
    out = []
    for c in caselle:
        if abs(c["rect"][0] - x) > TOLLERANZA:
            continue
        if larghezza is not None and abs((c["rect"][2] - c["rect"][0]) - larghezza) > TOLLERANZA:
            continue
        if celle is not None and c["celle"] != celle:
            continue
        out.append(c["rect"][3])
    return sorted(out, reverse=True)


# ------------------------------------------------------------ creazione campi

def crea_campo(writer, nome, casella):
    x0, y0, x1, y1 = casella["rect"]
    campo = DictionaryObject()
    campo[NameObject("/FT")] = NameObject("/Tx")
    campo[NameObject("/T")] = TextStringObject(nome)
    campo[NameObject("/Ff")] = NumberObject(0)
    campo[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
    campo[NameObject("/Type")] = NameObject("/Annot")
    campo[NameObject("/Subtype")] = NameObject("/Widget")
    campo[NameObject("/F")] = NumberObject(4)           # stampabile
    campo[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in (x0, y0, x1, y1)])

    if casella["celle"]:
        campo[NameObject("/MaxLen")] = NumberObject(casella["celle"])
        campo[NameObject("/Ff")] = NumberObject(FLAG_PETTINE)
        campo[NameObject("/Q")] = NumberObject(0)
    elif (x1 - x0) <= 30:
        # quadretti singoli: una X o un codice, centrati
        campo[NameObject("/MaxLen")] = NumberObject(2 if (x1 - x0) > 20 else 1)
        campo[NameObject("/Q")] = NumberObject(1)
    else:
        campo[NameObject("/Q")] = NumberObject(0)

    return writer._add_object(campo)


def prepara() -> int:
    if not SORGENTE.exists():
        print(f"Manca {SORGENTE}")
        return 1

    reader = PdfReader(str(SORGENTE))
    writer = PdfWriter(clone_from=reader)

    campi_totali = []
    problemi = []

    for numero_pagina in (2, 3, 4, 5):
        pagina = writer.pages[numero_pagina - 1]
        caselle = caselle_pagina(pagina)

        if numero_pagina == 2:
            voci = mappa_pagina2()
        elif numero_pagina == 3:
            voci = mappa_pagina3(ancore(caselle, 114.0, celle=16))
        elif numero_pagina == 4:
            voci = mappa_pagina4(
                ancore(caselle, 164.5, celle=5),
                ancore(caselle, 135.7),
                ancore(caselle, 106.9, celle=16),
            )
        else:
            voci = mappa_pagina5(ancore(caselle, 171.6))

        rimaste = list(caselle)
        riferimenti = []
        for nome, x, y in voci:
            # stessa colonna, e fra le righe vicine si prende la piu' prossima:
            # le etichette stampate spostano le caselle di qualche punto.
            vicine = [c for c in rimaste
                      if abs(c["rect"][0] - x) <= TOLLERANZA and abs(c["rect"][1] - y) <= SCARTO_VERTICALE]
            trovata = min(vicine, key=lambda c: abs(c["rect"][1] - y)) if vicine else None
            if trovata is None:
                problemi.append(f"pagina {numero_pagina}: nessuna casella per '{nome}' a ({x}, {y})")
                continue
            rimaste.remove(trovata)
            riferimenti.append(crea_campo(writer, nome, trovata))
            campi_totali.append(nome)

        for c in rimaste:
            problemi.append(f"pagina {numero_pagina}: casella senza nome in {c['rect']}")

        pagina[NameObject("/Annots")] = ArrayObject(riferimenti)
        print(f"  pagina {numero_pagina}: {len(riferimenti)} campi creati")

    # Risorsa font richiamata dal /DA dei campi: senza di questa alcuni lettori
    # non sanno con quale carattere disegnare il testo.
    helvetica = DictionaryObject()
    helvetica[NameObject("/Type")] = NameObject("/Font")
    helvetica[NameObject("/Subtype")] = NameObject("/Type1")
    helvetica[NameObject("/BaseFont")] = NameObject("/Helvetica")
    helvetica[NameObject("/Encoding")] = NameObject("/WinAnsiEncoding")
    font_dict = DictionaryObject()
    font_dict[NameObject("/Helv")] = writer._add_object(helvetica)
    risorse = DictionaryObject()
    risorse[NameObject("/Font")] = font_dict

    acroform = DictionaryObject()
    acroform[NameObject("/Fields")] = ArrayObject(
        [r for p in writer.pages for r in (p.get("/Annots") or [])]
    )
    acroform[NameObject("/DR")] = risorse
    acroform[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
    acroform[NameObject("/NeedAppearances")] = BooleanObject(True)
    writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)

    with open(DESTINAZIONE, "wb") as f:
        writer.write(f)

    doppioni = {n for n in campi_totali if campi_totali.count(n) > 1}
    if doppioni:
        problemi.append(f"nomi ripetuti: {sorted(doppioni)}")

    print(f"\n{DESTINAZIONE.name}: {len(campi_totali)} campi")
    if problemi:
        print("\nPROBLEMI:")
        for p in problemi:
            print("  " + p)
        return 1
    print("Tutte le caselle sono state riconosciute.")
    return 0


if __name__ == "__main__":
    raise SystemExit(prepara())
