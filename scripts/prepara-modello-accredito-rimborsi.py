#!/usr/bin/env python3
"""Crea i campi compilabili del modello per l'accredito dei rimborsi fiscali.

E' il modulo con cui una persona fisica chiede che i rimborsi dell'Agenzia
delle Entrate le arrivino con bonifico sul proprio conto, invece che per altre
vie, e con cui puo' annullare una richiesta gia' presentata.

Il PDF ufficiale e' di cinque pagine ma il modulo vero e' uno solo, la terza:
le altre sono la copertina, l'informativa sulla privacy e le istruzioni. Le
caselle sono rettangoli bianchi sul pannello azzurro, come nel modello RLI.

Una nota sull'IBAN: qui il pettine ha ventisette caselline, cioe' l'IBAN
italiano per intero, "IT" compreso. Non e' come sul F24, dove le due lettere
sono gia' stampate sul modulo e restano venticinque caselline.

Produce assets/pdf/modello-accredito-rimborsi-compilabile.pdf.

Uso:  python scripts/prepara-modello-accredito-rimborsi.py
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
SORGENTE = PDF_DIR / "modello-accredito-rimborsi-ufficiale.pdf"
DESTINAZIONE = PDF_DIR / "modello-accredito-rimborsi-compilabile.pdf"

PAGINA = 2               # il modulo sta sulla terza pagina
FLAG_PETTINE = 1 << 24
ALTEZZA_ETICHETTA = 13.0  # per i riquadri che hanno l'etichetta stampata dentro

# (nome, x0, y0, x1, y1, caselline | None)
CAMPI = [
    # tipo di richiesta: due quadretti con dentro il numero, si barrano con una X
    ("tipo_accredito", 114.1, 686.1, 126.3, 698.0, 1),
    ("tipo_annullamento", 114.1, 662.2, 126.3, 674.2, 1),

    # dati del contribuente
    ("cognome", 114.0, 625.9, 380.4, 643.9, None),
    ("nome", 387.6, 625.9, 560.4, 643.9, None),
    ("codice_fiscale", 114.0, 590.1, 344.4, 608.1, 16),
    ("comune_nascita", 114.0, 553.9, 402.0, 571.9, None),
    ("provincia_nascita", 409.1, 553.9, 452.3, 571.9, 2),
    ("nascita_giorno", 459.5, 553.9, 488.3, 571.9, 2),
    ("nascita_mese", 488.3, 553.9, 517.1, 571.9, 2),
    ("nascita_anno", 517.1, 553.9, 560.3, 571.9, 4),
    ("residenza_comune", 178.9, 523.9, 517.2, 541.9, None),
    ("residenza_provincia", 524.4, 523.9, 560.4, 541.9, 2),
    ("frazione", 178.8, 493.9, 258.0, 511.9, None),
    ("via", 265.2, 493.9, 466.8, 511.9, None),
    ("civico", 474.0, 493.9, 510.0, 511.9, None),
    ("cap", 517.2, 493.9, 560.4, 511.9, 5),
    ("email", 114.0, 457.9, 380.4, 475.9, None),
    ("telefono_prefisso", 387.6, 457.9, 412.8, 475.9, None),
    ("telefono_numero", 416.4, 457.9, 470.4, 475.9, None),
    ("fax_prefisso", 477.6, 457.9, 502.8, 475.9, None),
    ("fax_numero", 505.7, 457.9, 559.7, 475.9, None),

    # conto italiano: l'IBAN per intero
    ("iban", 110.6, 421.9, 501.1, 439.9, 27),

    # conto estero
    ("estero_banca", 142.8, 397.9, 560.4, 415.9, None),
    ("estero_intestato_a", 171.6, 373.9, 560.4, 391.9, None),
    ("estero_bic", 139.2, 349.9, 254.4, 367.9, None),
    ("estero_iban", 290.4, 349.9, 560.4, 367.9, None),
    ("estero_coordinate", 236.4, 325.9, 560.5, 343.9, None),
    ("estero_indirizzo_banca", 174.8, 301.9, 560.4, 319.9, None),

    # sottoscrizione
    ("firma_giorno", 135.6, 265.4, 157.2, 283.4, 2),
    ("firma_mese", 157.2, 265.4, 178.8, 283.4, 2),
    ("firma_anno", 178.8, 265.4, 214.8, 283.4, 4),
    ("firma", 301.3, 271.4, 560.4, 289.4, None),

    # delega
    ("delega_sottoscritto", 110.4, 229.7, 340.8, 247.7, None),
    ("delega_sig", 349.8, 229.7, 560.4, 247.7, None),
    ("delega_cf", 110.4, 205.3, 340.8, 223.3, 16),
    ("delega_nato_a", 110.6, 181.7, 340.8, 199.7, None),
    ("delega_provincia", 349.8, 181.7, 400.2, 199.7, 2),
    ("delega_il", 409.2, 181.7, 494.1, 199.7, None),
    ("delega_giorno", 110.4, 146.6, 135.6, 164.6, 2),
    ("delega_mese", 135.6, 146.6, 160.8, 164.6, 2),
    ("delega_anno", 160.8, 146.6, 189.6, 164.6, 4),
    ("delega_firma", 350.4, 151.7, 560.4, 169.7, None),
]

# Alcuni riquadri hanno l'etichetta stampata dentro, in alto: le tre date con
# "giorno mese anno" e le caselle del telefono e del fax con "prefisso" e
# "numero". Li' si scrive nella parte bassa, per non finirci sopra.
CON_ETICHETTA_DENTRO = {
    "nascita_giorno", "nascita_mese", "nascita_anno",
    "firma_giorno", "firma_mese", "firma_anno",
    "delega_giorno", "delega_mese", "delega_anno",
    "telefono_prefisso", "telefono_numero", "fax_prefisso", "fax_numero",
}


def campo_testo(writer, nome, caratteri):
    d = DictionaryObject()
    d[NameObject("/FT")] = NameObject("/Tx")
    d[NameObject("/T")] = TextStringObject(nome)
    d[NameObject("/Ff")] = NumberObject(FLAG_PETTINE if caratteri else 0)
    d[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
    if caratteri:
        d[NameObject("/MaxLen")] = NumberObject(caratteri)
    d[NameObject("/Q")] = NumberObject(0)
    return writer._add_object(d)


def prepara() -> int:
    if not SORGENTE.exists():
        print(f"Manca {SORGENTE}: esegui prima scripts/scarica-modelli-ufficiali.py")
        return 1

    writer = PdfWriter(clone_from=PdfReader(str(SORGENTE)))
    pagina = writer.pages[PAGINA]
    campi = []
    visti = set()

    for nome, x0, y0, x1, y1, caratteri in CAMPI:
        if nome in visti:
            print(f"  nome ripetuto: {nome}")
            return 1
        visti.add(nome)
        if nome in CON_ETICHETTA_DENTRO:
            y1 = min(y1, y0 + ALTEZZA_ETICHETTA)
        riferimento = campo_testo(writer, nome, caratteri)
        campo = riferimento.get_object()
        campo[NameObject("/Type")] = NameObject("/Annot")
        campo[NameObject("/Subtype")] = NameObject("/Widget")
        campo[NameObject("/F")] = NumberObject(4)
        campo[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in (x0, y0, x1, y1)])
        campi.append(riferimento)

    pagina[NameObject("/Annots")] = ArrayObject(campi)

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

    print(f"{DESTINAZIONE.name}: {len(campi)} campi sulla pagina {PAGINA + 1}")
    return 0


if __name__ == "__main__":
    raise SystemExit(prepara())
