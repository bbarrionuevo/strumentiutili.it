#!/usr/bin/env python3
"""Crea i campi compilabili del Modello 69 dell'Agenzia delle Entrate.

Il modello 69 serve a chiedere la registrazione degli atti e a comunicare gli
adempimenti successivi dei contratti di locazione: cessioni, risoluzioni e
proroghe, anche tacite.

Il PDF ufficiale non ha campi modulo e, come i modelli di versamento, e'
disegnato a linee: le caselle vanno percio' descritte qui in modo esplicito, a
partire dalle coordinate della griglia misurate sul file. Quasi tutto il modulo
e' "a pettine", con il passo costante di 14,4 punti.

Una particolarita': le tre pagine ripetono in alto gli stessi dati di
riferimento (chi chiede la registrazione, il suo codice fiscale, la data di
stipula, il numero di repertorio, la tipologia dell'atto e il numero di foglio).
Sono lo stesso dato in tre posizioni diverse, quindi diventano UN campo con TRE
riquadri: si scrive una volta e compare su tutte le pagine.

Produce assets/pdf/modello-69-compilabile.pdf.

Uso:  python scripts/prepara-modello-69.py
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import (
        ArrayObject, BooleanObject, DictionaryObject, FloatObject,
        NameObject, NumberObject, TextStringObject,
    )
except ImportError:  # pragma: no cover
    sys.exit("Serve pypdf:  python -m pip install pypdf")

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "assets" / "pdf"
SORGENTE = PDF_DIR / "modello-69-ufficiale.pdf"
DESTINAZIONE = PDF_DIR / "modello-69-compilabile.pdf"

FLAG_PETTINE = 1 << 24
ALTEZZA = 11.0      # altezza utile della casella sopra la linea di base
STACCO = 0.5        # quanto il testo sta sopra la linea

# Ogni voce: (nome, [(pagina, x0, x1, base_y), ...], caselline | None)
CAMPI: list[tuple[str, list[tuple[int, float, float, float]], int | None]] = []


def campo(nome, riquadri, caselline=None):
    CAMPI.append((nome, riquadri, caselline))


def riga(pagina, x0, x1, base):
    return (pagina, x0, x1, base)


# ------------------------------------------------- testata comune alle pagine
# Sulla prima pagina i dati stanno nel Quadro A; sulla seconda e sulla terza
# sono ripetuti in alto, in una striscia con un'altra disposizione.
campo("cf_richiedente", [riga(0, 109.3, 339.7, 530.2),
                         riga(1, 130.8, 361.5, 793.9),
                         riga(2, 130.9, 361.6, 793.8)], 16)
campo("data_stipula", [riga(0, 339.7, 454.9, 530.2),
                       riga(1, 361.5, 476.4, 793.9),
                       riga(2, 361.6, 476.5, 793.8)], 8)
campo("n_repertorio", [riga(0, 498.1, 569.5, 553.9),
                       riga(1, 476.4, 568.6, 793.9),
                       riga(2, 476.5, 568.6, 793.8)])
campo("tipologia_atto", [riga(0, 33.0, 400.0, 506.2),
                         riga(1, 33.0, 476.4, 769.9),
                         riga(2, 33.0, 476.5, 769.9)])
campo("foglio", [riga(0, 440.0, 498.1, 553.9),
                 riga(1, 530.0, 568.6, 769.9),
                 riga(2, 530.0, 568.6, 769.9)])

# ------------------------------------------------------- Quadro A: dati generali
campo("ufficio_di", [riga(0, 33.0, 382.9, 553.9)])
campo("data_fine_proroga", [riga(0, 454.9, 569.5, 530.2)], 8)

# Adempimento e uso abitativo: quadretti stampati, dentro ci va una X.
for nome, x0, x1 in (("adempimento_reg", 411.9, 427.9), ("adempimento_pro", 435.2, 451.2),
                     ("adempimento_ces", 458.5, 474.6), ("adempimento_ris", 481.8, 497.9),
                     ("uso_abitativo", 532.6, 548.7)):
    campo(nome, [riga(0, x0, x1, 506.8)], 1)

# --------------------------------------- Quadro B: soggetti destinatari (6 blocchi)
# Ogni blocco occupa tre righe alte 24 punti; i blocchi si ripetono ogni 72.
for indice in range(6):
    alto = 470.2 - 72 * indice          # prima riga del blocco
    medio, basso = alto - 24, alto - 48
    n = indice + 1
    campo(f"b{n}_n_ord", [riga(0, 30.1, 44.5, alto)], 1)
    campo(f"b{n}_cf", [riga(0, 44.5, 274.9, alto)], 16)
    campo(f"b{n}_cognome", [riga(0, 274.9, 569.5, alto)])
    campo(f"b{n}_nome", [riga(0, 30.1, 231.7, medio)])
    campo(f"b{n}_comune_nascita", [riga(0, 231.7, 397.3, medio)])
    campo(f"b{n}_provincia_nascita", [riga(0, 397.3, 426.1, medio)], 2)
    campo(f"b{n}_data_nascita", [riga(0, 426.1, 541.3, medio)], 8)
    campo(f"b{n}_sesso", [riga(0, 541.3, 569.5, medio)], 1)
    campo(f"b{n}_domicilio", [riga(0, 30.1, 274.9, basso)])
    campo(f"b{n}_provincia_domicilio", [riga(0, 274.9, 303.7, basso)], 2)
    campo(f"b{n}_via", [riga(0, 303.7, 541.3, basso)])
    campo(f"b{n}_civico", [riga(0, 541.3, 569.5, basso)])

# ------------------------------------- Quadro C: dati descrittivi dell'atto (6 righe)
for indice in range(6):
    base = 710.3 - 24 * indice
    n = indice + 1
    campo(f"c{n}_n_ord", [riga(1, 30.0, 44.4, base)], 1)
    campo(f"c{n}_codice_negozio", [riga(1, 44.4, 174.0, base)])
    campo(f"c{n}_iva", [riga(1, 174.0, 188.4, base)], 1)
    campo(f"c{n}_agevolazioni", [riga(1, 188.4, 202.8, base)], 1)
    campo(f"c{n}_effetti_sospesi", [riga(1, 202.8, 217.2, base)], 1)
    campo(f"c{n}_valore", [riga(1, 217.2, 439.7, base)])
    campo(f"c{n}_danti_causa", [riga(1, 439.7, 497.3, base)], 4)
    campo(f"c{n}_aventi_causa", [riga(1, 511.7, 568.6, base)], 4)
campo("c_totale_valore", [riga(1, 217.2, 439.7, 566.0)])

# ------------------------------------------- Quadro D: dati degli immobili (12 righe)
for indice in range(12):
    base = 517.9 - 24 * indice
    n = indice + 1
    campo(f"d{n}_n_ord", [riga(1, 30.0, 44.4, base)], 1)
    campo(f"d{n}_codice_comune", [riga(1, 44.4, 116.4, base)], 5)
    campo(f"d{n}_tu", [riga(1, 116.4, 130.8, base)], 1)
    campo(f"d{n}_ip", [riga(1, 130.8, 145.2, base)], 1)
    campo(f"d{n}_sezione", [riga(1, 145.2, 188.4, base)], 3)
    campo(f"d{n}_foglio", [riga(1, 188.4, 246.0, base)], 4)
    campo(f"d{n}_particella", [riga(1, 246.0, 318.0, base)], 5)
    campo(f"d{n}_particella_den", [riga(1, 332.4, 390.0, base)], 4)
    campo(f"d{n}_subalterno", [riga(1, 390.0, 447.6, base)], 4)
    campo(f"d{n}_accatastamento", [riga(1, 456.3, 470.2, base + 6.2)], 1)

# ------------------------------------------------------------------- Delega
for indice in range(5):
    base = 710.3 - 36 * indice
    campo(f"delega{indice + 1}_cf", [riga(2, 30.3, 260.7, base)], 16)
campo("delegato_cognome", [riga(2, 30.0, 188.9, 493.5)])
campo("delegato_nome", [riga(2, 188.9, 338.9, 493.5)])
campo("delegato_cf", [riga(2, 339.0, 569.4, 493.5)], 16)

# ----------------------------- Quadro E: associazione immobili / pertinenze (4 righe)
COLONNE_E = [51.9, 116.7, 181.5, 246.3, 311.1, 375.9, 440.7, 505.5, 568.6]
for indice in range(4):
    base = 433.9 - 24 * indice
    n = indice + 1
    campo(f"e{n}_negozio", [riga(2, 30.0, 51.9, base)], 1)
    campo(f"e{n}_principale", [riga(2, COLONNE_E[0], COLONNE_E[1], base)])
    for p in range(7):
        campo(f"e{n}_pertinenza{p + 1}", [riga(2, COLONNE_E[p + 1], COLONNE_E[p + 2], base)])

# -------------------------------- Quadro F: ulteriori dati degli immobili (10 righe)
COLONNE_F = [
    ("negozio", 30.0, 51.9), ("n_ord_imm", 51.9, 87.9), ("categoria", 87.9, 181.5),
    ("uso_abitativo", 181.5, 217.5), ("rendita", 217.5, 339.9), ("canone_concordato", 339.9, 375.9),
    ("n_ord_sog", 375.9, 411.9), ("possesso", 411.9, 534.3), ("opzione_cedolare", 534.3, 568.6),
]
for indice in range(10):
    base = 301.9 - 24 * indice
    n = indice + 1
    for nome_col, x0, x1 in COLONNE_F:
        campo(f"f{n}_{nome_col}", [riga(2, x0, x1, base)])


# ------------------------------------------------------------------ creazione

def campo_testo(writer, nome, caratteri=None):
    dizionario = DictionaryObject()
    dizionario[NameObject("/FT")] = NameObject("/Tx")
    dizionario[NameObject("/T")] = TextStringObject(nome)
    dizionario[NameObject("/Ff")] = NumberObject(FLAG_PETTINE if caratteri else 0)
    dizionario[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
    if caratteri:
        dizionario[NameObject("/MaxLen")] = NumberObject(caratteri)
    dizionario[NameObject("/Q")] = NumberObject(0)
    dizionario[NameObject("/Kids")] = ArrayObject()
    return writer._add_object(dizionario)


def widget(writer, riferimento_campo, rect):
    x0, y0, x1, y1 = rect
    w = DictionaryObject()
    w[NameObject("/Type")] = NameObject("/Annot")
    w[NameObject("/Subtype")] = NameObject("/Widget")
    w[NameObject("/F")] = NumberObject(4)
    w[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in (x0, y0, x1, y1)])
    w[NameObject("/Parent")] = riferimento_campo
    return writer._add_object(w)


def prepara() -> int:
    if not SORGENTE.exists():
        print(f"Manca {SORGENTE}: esegui prima scripts/scarica-modelli-ufficiali.py")
        return 1

    writer = PdfWriter(clone_from=PdfReader(str(SORGENTE)))
    pagine = list(writer.pages)
    campi, per_pagina = [], {i: [] for i in range(len(pagine))}
    visti = set()

    for nome, riquadri, caratteri in CAMPI:
        if nome in visti:
            print(f"  nome ripetuto: {nome}")
            return 1
        visti.add(nome)
        riferimento = campo_testo(writer, nome, caratteri)
        kids = riferimento.get_object()[NameObject("/Kids")]
        for npag, x0, x1, base in riquadri:
            rect = (x0, base + STACCO, x1, base + STACCO + ALTEZZA)
            rif_widget = widget(writer, riferimento, rect)
            kids.append(rif_widget)
            per_pagina[npag].append(rif_widget)
        campi.append(riferimento)

    for i, pagina in enumerate(pagine):
        pagina[NameObject("/Annots")] = ArrayObject(per_pagina[i])

    helv = DictionaryObject()
    helv[NameObject("/Type")] = NameObject("/Font")
    helv[NameObject("/Subtype")] = NameObject("/Type1")
    helv[NameObject("/BaseFont")] = NameObject("/Helvetica")
    helv[NameObject("/Encoding")] = NameObject("/WinAnsiEncoding")
    font = DictionaryObject()
    font[NameObject("/Helv")] = writer._add_object(helv)
    risorse = DictionaryObject()
    risorse[NameObject("/Font")] = font

    acroform = DictionaryObject()
    acroform[NameObject("/Fields")] = ArrayObject(campi)
    acroform[NameObject("/DR")] = risorse
    acroform[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
    acroform[NameObject("/NeedAppearances")] = BooleanObject(True)
    writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)

    with open(DESTINAZIONE, "wb") as f:
        writer.write(f)

    riquadri = sum(len(v) for v in per_pagina.values())
    print(f"{DESTINAZIONE.name}: {len(campi)} campi, {riquadri} riquadri")
    for i in sorted(per_pagina):
        print(f"   pagina {i + 1}: {len(per_pagina[i])} riquadri")
    return 0


if __name__ == "__main__":
    raise SystemExit(prepara())
