#!/usr/bin/env python3
"""Crea i campi compilabili dei quattro modelli dell'Agenzia sul canone TV.

- Dichiarazione sostitutiva relativa al canone (quadri A, B e C): la
  "disdetta" per chi non ha il televisore, l'addebito su un'altra utenza
  della famiglia, la revoca di una dichiarazione precedente.
- Dichiarazione per l'esenzione di chi ha compiuto 75 anni con reddito basso.
- Richiesta di rimborso del canone pagato nella bolletta della luce.
- Richiesta di rimborso per chi aveva diritto all'esenzione over 75.

I PDF ufficiali non hanno campi: le caselle sono rettangoli bianchi sul
pannello azzurro, come nel modello per l'accredito dei rimborsi. Le misure
qui sotto sono state prese dal disegno dei riquadri (pdfplumber) e verificate
riempiendo ogni campo e guardando il PDF.

Il riquadro "Impegno alla presentazione telematica" resta senza campi: lo
compila l'intermediario, non chi usa il sito. Anche lo spazio della firma
resta vuoto: si firma a penna o con la firma digitale.

Produce assets/pdf/modello-<nome>-compilabile.pdf per ciascun modello.

Uso:  python scripts/prepara-moduli-canone-tv.py
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

FLAG_MULTIRIGA = 1 << 12
FLAG_PETTINE = 1 << 24
ALTEZZA_ETICHETTA = 13.0  # riquadri con "giorno mese anno" stampato dentro, in alto

# Le righe dei dati anagrafici sono identiche nei quattro modelli: stessa
# griglia, stesse misure. Cambia solo l'altezza (y) delle righe.
def anagrafica(prefisso, pagina, y_nome, y_nascita, y_cf):
    return [
        (f"{prefisso}cognome", pagina, 106.8, y_nome, 322.8, y_nome + 18, None),
        (f"{prefisso}nome", pagina, 337.2, y_nome, 553.2, y_nome + 18, None),
        (f"{prefisso}data_nascita", pagina, 106.8, y_nascita, 222.0, y_nascita + 18, 8),
        (f"{prefisso}comune_nascita", pagina, 243.6, y_nascita, 502.9, y_nascita + 18, None),
        (f"{prefisso}provincia_nascita", pagina, 517.2, y_nascita, 553.2, y_nascita + 18, 2),
        (f"{prefisso}codice_fiscale", pagina, 106.8, y_cf, 337.2, y_cf + 18, 16),
    ]


# In alto sulla terza pagina il modello ripete il codice fiscale.
CF_TESTATA = ("codice_fiscale_testata", 2, 330.0, 792.7, 560.4, 806.7, 16)

# (nome, pagina 0-based, x0, y0, x1, y1, caselline | None)
MODELLI = {
    "canone-tv": {
        "etichetta": {"data_nascita", "erede_data_nascita", "data_firma", "b_data_inizio", "c_data"},
        "campi": [
            *anagrafica("", 1, 637.9, 601.9, 565.9),
            *anagrafica("erede_", 1, 457.9, 421.9, 385.9),
            # quadri compilati: si barra quello scelto
            ("quadro_a", 1, 179.8, 266.3, 193.3, 277.4, 1),
            ("quadro_b", 1, 359.6, 266.4, 373.0, 277.4, 1),
            ("quadro_c", 1, 539.3, 266.9, 552.7, 277.9, 1),
            ("data_firma", 1, 106.8, 205.9, 222.0, 223.9, 8),
            CF_TESTATA,
            # quadro A: le due dichiarazioni alternative
            ("a_nessun_televisore", 2, 107.3, 698.4, 120.7, 709.4, 1),
            ("a_oltre_suggellamento", 2, 107.3, 662.4, 120.7, 673.4, 1),
            # quadro B: l'altra utenza della famiglia
            ("b_dichiara", 2, 107.3, 554.4, 120.7, 565.4, 1),
            ("b_codice_fiscale", 2, 159.8, 506.0, 390.2, 524.0, 16),
            ("b_data_inizio", 2, 437.4, 506.2, 552.6, 524.2, 8),
            # quadro C: la data della dichiarazione che si revoca
            ("c_data", 2, 436.8, 422.2, 552.0, 440.2, 8),
        ],
    },
    "canone-tv-75": {
        "etichetta": {"data_nascita", "data_firma"},
        "campi": [
            *anagrafica("", 1, 637.9, 601.9, 565.9),
            ("anno_esenzione", 1, 495.0, 470.4, 552.6, 488.4, 4),
            ("non_coniugato", 1, 275.8, 403.6, 289.2, 414.6, 1),
            ("coniuge_codice_fiscale", 1, 322.8, 385.8, 553.2, 403.8, 16),
            ("reddito_6713", 1, 424.1, 314.1, 437.5, 325.1, 1),
            ("reddito_8000", 1, 424.1, 290.1, 437.5, 301.1, 1),
            ("anno_variazione", 1, 495.0, 230.4, 552.6, 248.4, 4),
            ("data_firma", 1, 106.8, 193.9, 222.0, 211.9, 8),
        ],
    },
    "rimborso-canone-tv": {
        "etichetta": {"data_nascita", "erede_data_nascita", "data_firma", "data_inizio", "data_fine"},
        "multiriga": {"descrizione"},
        "destra": {"totale", *(f"importo_{i}" for i in range(1, 11))},
        "campi": [
            *anagrafica("", 1, 637.8, 601.8, 565.8),
            ("email", 1, 106.8, 529.8, 337.2, 547.8, None),
            *anagrafica("erede_", 1, 493.7, 457.7, 421.7),
            CF_TESTATA,
            ("anno", 2, 294.0, 745.9, 351.6, 763.9, 4),
            ("totale", 2, 438.0, 745.6, 502.8, 763.6, None),
            # dieci righe: POD, numero della fattura, importo del canone
            *[
                campo
                for i in range(10)
                for campo in (
                    (f"pod_{i + 1}", 2, 106.8, 709.9 - 24 * i, 294.0, 727.9 - 24 * i, None),
                    (f"fattura_{i + 1}", 2, 308.4, 709.9 - 24 * i, 474.0, 727.9 - 24 * i, None),
                    (f"importo_{i + 1}", 2, 488.4, 709.9 - 24 * i, 553.2, 727.9 - 24 * i, None),
                )
            ],
            ("motivo", 2, 186.0, 457.9, 214.8, 475.9, 1),
            # solo con il motivo 4: il familiare a cui e' addebitato il canone
            ("familiare_codice_fiscale", 2, 106.0, 397.9, 336.4, 415.9, 16),
            ("data_inizio", 2, 366.0, 397.9, 452.4, 415.9, 8),
            ("data_fine", 2, 472.7, 397.9, 559.1, 415.9, 8),
            # sotto l'etichetta "Descrizione sintetica del motivo:"
            ("descrizione", 2, 112.0, 116.0, 553.0, 328.0, None),
            ("data_firma", 2, 128.4, 37.9, 243.6, 55.9, 8),
        ],
    },
    "rimborso-canone-tv-75": {
        "etichetta": {"data_nascita", "data_firma"},
        "destra": {"totale"},
        "campi": [
            *anagrafica("", 1, 637.9, 601.9, 565.9),
            ("anno", 1, 323.3, 541.9, 380.9, 559.9, 4),
            # la virgola dei decimali e' gia' stampata a x 362,5-364,8
            ("totale", 1, 323.4, 517.9, 361.8, 535.9, None),
            ("totale_cent", 1, 365.2, 517.9, 380.9, 535.9, 2),
            ("non_coniugato", 1, 275.8, 355.6, 289.2, 366.6, 1),
            ("coniuge_codice_fiscale", 1, 322.8, 337.8, 553.2, 355.8, 16),
            ("reddito_6713", 1, 424.1, 266.1, 437.5, 277.1, 1),
            ("reddito_8000", 1, 424.1, 242.1, 437.5, 253.1, 1),
            ("data_firma", 1, 106.8, 193.9, 222.0, 211.9, 8),
        ],
    },
}


def campo_testo(writer, nome, caratteri, multiriga=False, destra=False):
    d = DictionaryObject()
    d[NameObject("/FT")] = NameObject("/Tx")
    d[NameObject("/T")] = TextStringObject(nome)
    flag = (FLAG_PETTINE if caratteri else 0) | (FLAG_MULTIRIGA if multiriga else 0)
    d[NameObject("/Ff")] = NumberObject(flag)
    d[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
    if caratteri:
        d[NameObject("/MaxLen")] = NumberObject(caratteri)
    d[NameObject("/Q")] = NumberObject(2 if destra else 0)
    return writer._add_object(d)


def prepara_modello(nome: str, regole: dict) -> int:
    sorgente = PDF_DIR / f"modello-{nome}-ufficiale.pdf"
    destinazione = PDF_DIR / f"modello-{nome}-compilabile.pdf"
    if not sorgente.exists():
        print(f"Manca {sorgente.name}: esegui prima scripts/scarica-modelli-ufficiali.py")
        return 1

    writer = PdfWriter(clone_from=PdfReader(str(sorgente)))
    per_pagina: dict[int, list] = {}
    tutti = []
    visti = set()

    for nome_campo, pagina, x0, y0, x1, y1, caratteri in regole["campi"]:
        if nome_campo in visti:
            print(f"  {nome}: nome ripetuto {nome_campo}")
            return 1
        visti.add(nome_campo)
        if nome_campo in regole.get("etichetta", ()):
            y1 = min(y1, y0 + ALTEZZA_ETICHETTA)
        riferimento = campo_testo(
            writer, nome_campo, caratteri,
            multiriga=nome_campo in regole.get("multiriga", ()),
            destra=nome_campo in regole.get("destra", ()),
        )
        campo = riferimento.get_object()
        campo[NameObject("/Type")] = NameObject("/Annot")
        campo[NameObject("/Subtype")] = NameObject("/Widget")
        campo[NameObject("/F")] = NumberObject(4)
        campo[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in (x0, y0, x1, y1)])
        campo[NameObject("/P")] = writer.pages[pagina].indirect_reference
        per_pagina.setdefault(pagina, []).append(riferimento)
        tutti.append(riferimento)

    for pagina, campi in per_pagina.items():
        writer.pages[pagina][NameObject("/Annots")] = ArrayObject(campi)

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
    acroform[NameObject("/Fields")] = ArrayObject(tutti)
    acroform[NameObject("/DR")] = risorse
    acroform[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
    acroform[NameObject("/NeedAppearances")] = BooleanObject(True)
    writer._root_object[NameObject("/AcroForm")] = writer._add_object(acroform)

    with open(destinazione, "wb") as f:
        writer.write(f)
    pagine = ", ".join(str(p + 1) for p in sorted(per_pagina))
    print(f"{destinazione.name}: {len(tutti)} campi (pagine {pagine})")
    return 0


def main() -> int:
    esito = 0
    for nome, regole in MODELLI.items():
        esito |= prepara_modello(nome, regole)
    return esito


if __name__ == "__main__":
    raise SystemExit(main())
