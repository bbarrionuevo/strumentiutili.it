#!/usr/bin/env python3
"""Prepara i PDF compilabili dei modelli AA9/12 e AA7/10 per il compilatore web.

I PDF editabili di partenza (assets/pdf/modello-*-ufficiale.pdf) hanno due difetti
che impediscono di compilarli da JavaScript:

1. Alcuni campi hanno piu' widget che condividono lo stesso nome. Nel PDF un nome
   corrisponde a un valore, quindi scrivere nel campo riempirebbe tutti i riquadri
   che lo condividono. Nel modello AA7/10, per esempio, indirizzo, C.A.P. e
   provincia di "sede legale", "domicilio fiscale" e "luogo di esercizio" sono lo
   stesso campo: i tre blocchi si compilerebbero con lo stesso indirizzo.
2. Nel modello AA7/10 il campo "codice carica" del quadro C e' una casella di
   spunta, ma deve contenere un codice numerico (1-15).

Lo script non modifica i file di partenza: produce le copie corrette
   assets/pdf/modello-aa9-12-compilabile.pdf
   assets/pdf/modello-aa7-10-compilabile.pdf
che sono quelle caricate dalla pagina web.

Uso:  python scripts/prepara-modelli-piva.py
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import (
        ArrayObject,
        DictionaryObject,
        FloatObject,
        NameObject,
        NumberObject,
        TextStringObject,
    )
except ImportError:  # pragma: no cover
    sys.exit("Serve pypdf:  python -m pip install pypdf")


ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "assets" / "pdf"

MODELLI = [
    ("modello-aa9-12-ufficiale.pdf", "modello-aa9-12-compilabile.pdf"),
    ("modello-aa7-10-ufficiale.pdf", "modello-aa7-10-compilabile.pdf"),
]

# Campi che contengono un solo codice o una "X": il riquadro stampato sul modulo
# sta al centro dell'area del campo, quindi il testo va centrato perche' cada
# dentro al riquadro. Il valore e' il numero massimo di caratteri ammessi.
DA_CENTRARE = {
    # --- AA9/12 -------------------------------------------------------------
    "variazione_dati_l_8j0t": 1,                                    # casella L (liquidazione)
    "acquisti_intracomunitari_di_beni_di_cui_all_art_60_bis_7c9r": 1,
    "cessazione_c_2d6c": 1,                                         # cessazione commercio elettronico
    "cessazione_c_3c0w": 1,                                         # cessazione rappresentante
    "regime_fiscale_agevolato_vedere_istruzioni_0l4l": 1,
    "codice_carica_9y8m": 2,
    "tipo_sede_row_1_3y5x": 1,
    "tipo_sede_row_2_5y3r": 1,
    "tipo_sede_row_3_8g3x": 1,
    "titolarita_dell_immobile_8d7x": 1,
    "tipo_di_catasto_4r0a": 1,
    "tipologia_della_clientela_8q3d": 1,
    "luogo_di_esercizio_aperto_al_pubblico_4r1n": 1,
    # --- AA7/10 -------------------------------------------------------------
    "text_551_487_5p3r-QUADRO A": 1,                                # casella C
    "text_551_636_3f5i": 1,                                         # casella P
    "natura_giuridica_0p8o-QUADRO B": 2,
    "acquisti_intracomunitari_di_beni_di_cui_all_art_60_bis_2c7q-QUADRO B": 1,
    "titolarita_dell_immobile_8d8t-QUADRO I": 1,
    "tipo_di_catasto_1n3g-QUADRO I": 1,
    "tipologia_della_clientela_7g0v-QUADRO I": 1,
    "luogo_di_esercizio_aperto_al_pubblico_9l8v-QUADRO I": 1,
    **{f"sezione_2_tipo_sede_{n}-QUADRO G": 1 for n in range(1, 9)},
}

# Campi con le caselline stampate (un carattere per casella) che nei PDF
# dell'Agenzia non sono «a pettine»: il testo usciva tutto a sinistra, fuori
# dalle caselle (il codice attivita' dell'AA9, la data di inizio dell'AA7, il
# codice fiscale in alto alle pagine 3-5 dell'AA7). Il valore e' il numero di
# caselle, contato sulle stanghette stampate dentro il riquadro del campo.
A_PETTINE = {
    # --- AA9/12 -------------------------------------------------------------
    "partita_iva_richiesta_duplicato_8g9q": 11,
    "codice_attivita_8i2j": 6,
    "volume_d_affari_presunto_7l7g": 11,
    "c_a_p_1_5a6z": 5,                                              # quadro F
    "c_a_p_3_5e8v": 5,
    "estremi_registrazione_contratto_di_locazione_o_di_comodato_data_di_registrazione_1c4m": 8,
    # --- AA7/10 -------------------------------------------------------------
    "data_inizio_4k5m-QUADRO A": 8,                                 # casella 1
    "data_inizio_4k5m-QUADRO A__2": 8,                              # casella 2
    "codice_attivita_1v0n-QUADRO B": 6,
    "volume_d_affari_presunto_5p4a-QUADRO B": 11,
    "codice_fiscale_4z9s": 16,                                      # testata pag. 3
    "codice_fiscale_3m6a": 16,                                      # testata pag. 4
    "codice_fiscale_5i8h": 16,                                      # testata pag. 5
    "partita_iva_codice_fiscale_1_6f3l-QUADRO D": 11,
    "partita_iva_codice_fiscale_2_5f6z-QUADRO D": 11,
    "partita_iva_codice_fiscale_3_0b9h-QUADRO D": 11,
    "partita_iva_codice_fiscale_4_4y1k-QUADRO D": 11,
    "partita_iva_codice_fiscale_5_3z5q-QUADRO D": 11,
    "partita_iva_codice_fiscale_6_2b9x-QUADRO D": 11,
    "partita_iva_o_codice_fiscale_del_conferitario_o_cessionario_6r7z-QUADRO D-SEZIONE 2": 11,
    "sezione_2_pl_codice_9f8d-QUADRO D-SEZIONE 2": 11,
    "partita_iva_o_codice_fiscale_del_locatore_8z6r-QUADRO D-SEZIONE 3": 11,
    "c_a_p_1_3y0t-QUADRO E": 5,
    **{f"sezione_1_codice_attivita_{n}-QUADRO G": 6 for n in range(1, 10)},
    "sezione_1_volume_d_affari_presunto_5-QUADRO G": 9,
    **{f"sezione_2_c_a_p_{n}-QUADRO G": 5 for n in range(6, 9)},
    "partita_iva_o_codice_fiscale_del_rappresentante_2g2h-QUADRO H": 11,
    "operazioni_intracomunitarie_volume_acquisti_presunto_7c4z-QUADRO I": 11,
    "operazioni_intracomunitarie_volume_cessioni_presunto_7s9z--QUADRO I": 11,
    "quadri_compilati_codice_fiscale_4q7q-QUADRO I": 16,
}

# Caselle di spunta che devono invece accogliere un codice.
DA_CONVERTIRE_IN_TESTO = {
    "codice_carica_4w9n-QUADRO C": 2,  # AA7 quadro C: codici 1-15
}

# Due campi dell'AA9 sono piu' larghi del riquadro stampato e non sono centrati
# su di esso: la "X" cadrebbe di fianco alla casella. Qui il riquadro del campo
# viene ristretto alle coordinate del quadretto stampato, misurate sul modulo.
RIQUADRI_CORRETTI = {
    "cessazione_c_2d6c": (544.5, 244.0, 552.5, 257.0),
    "luogo_di_esercizio_aperto_al_pubblico_4r1n": (247.0, 253.0, 256.5, 270.0),
}


def indice_pagine(reader: PdfReader) -> dict[int, int]:
    """Mappa id(oggetto annotazione) -> numero di pagina (1-based)."""
    mappa = {}
    for numero, pagina in enumerate(reader.pages, start=1):
        for annot in pagina.get("/Annots") or []:
            mappa[id(annot.get_object())] = numero
    return mappa


def ordine_visivo(widget: DictionaryObject, pagine: dict[int, int]) -> tuple:
    """Ordina i widget come li legge una persona: pagina, alto-basso, sinistra-destra."""
    rect = widget.get("/Rect") or [0, 0, 0, 0]
    return (pagine.get(id(widget), 0), -float(rect[3]), float(rect[0]))


def separa_widget_omonimi(writer: PdfWriter, pagine: dict[int, int]) -> list[str]:
    """Dai a ogni widget un nome proprio, cosi' ognuno ha un valore indipendente."""
    acroform = writer._root_object["/AcroForm"]
    campi = acroform["/Fields"]
    aggiunti = []
    note = []

    for riferimento in list(campi):
        campo = riferimento.get_object()
        kids = campo.get("/Kids")
        if not kids or len(kids) < 2:
            continue

        nome_base = str(campo.get("/T"))
        widget = sorted(
            (k.get_object() for k in kids),
            key=lambda w: ordine_visivo(w, pagine),
        )
        # Il primo widget tiene il nome originale, gli altri ne ricevono uno nuovo.
        primo, altri = widget[0], widget[1:]
        note.append(f"    {nome_base}: {len(kids)} riquadri -> separati")

        campo[NameObject("/Kids")] = ArrayObject(
            [k for k in kids if k.get_object() is primo]
        )

        for posizione, doppione in enumerate(altri, start=2):
            nuovo = DictionaryObject()
            for chiave in ("/FT", "/Ff", "/MaxLen", "/DA", "/Q", "/DV"):
                if chiave in campo:
                    nuovo[NameObject(chiave)] = campo[NameObject(chiave)]
            nuovo[NameObject("/T")] = TextStringObject(f"{nome_base}__{posizione}")
            nuovo[NameObject("/Kids")] = ArrayObject()
            riferimento_nuovo = writer._add_object(nuovo)
            nuovo[NameObject("/Kids")].append(
                next(k for k in kids if k.get_object() is doppione)
            )
            doppione[NameObject("/Parent")] = riferimento_nuovo
            aggiunti.append(riferimento_nuovo)

    for riferimento in aggiunti:
        campi.append(riferimento)

    for riga in note:
        print(riga)
    return [str(r.get_object()["/T"]) for r in aggiunti]


def nome_completo(campo: DictionaryObject) -> str:
    parti = []
    corrente = campo
    while corrente is not None:
        titolo = corrente.get("/T")
        if titolo:
            parti.insert(0, str(titolo))
        genitore = corrente.get("/Parent")
        corrente = genitore.get_object() if genitore is not None else None
    return ".".join(parti)


def sistema_tipi_campo(writer: PdfWriter) -> None:
    """Centra le pseudo-caselle e converte in testo le caselle che vogliono un codice."""
    acroform = writer._root_object["/AcroForm"]
    for riferimento in acroform["/Fields"]:
        campo = riferimento.get_object()
        nome = nome_completo(campo)

        if nome in DA_CENTRARE and campo.get("/FT") == "/Tx":
            lunghezza = DA_CENTRARE[nome]
            campo[NameObject("/Q")] = NumberObject(1)
            campo[NameObject("/MaxLen")] = NumberObject(lunghezza)
            print(f"    {nome}: testo centrato ({lunghezza} caratteri)")

        if nome in A_PETTINE and campo.get("/FT") == "/Tx":
            caselle = A_PETTINE[nome]
            campo[NameObject("/Ff")] = NumberObject(int(campo.get("/Ff", 0)) | (1 << 24))
            campo[NameObject("/MaxLen")] = NumberObject(caselle)
            print(f"    {nome}: a pettine ({caselle} caselle)")

        if nome in RIQUADRI_CORRETTI:
            nuovo = RIQUADRI_CORRETTI[nome]
            for kid in campo.get("/Kids") or []:
                widget = kid.get_object()
                widget[NameObject("/Rect")] = ArrayObject(
                    [FloatObject(v) for v in nuovo]
                )
            print(f"    {nome}: riquadro allineato alla casella stampata")

        if nome in DA_CONVERTIRE_IN_TESTO:
            lunghezza = DA_CONVERTIRE_IN_TESTO[nome]
            campo[NameObject("/FT")] = NameObject("/Tx")
            campo[NameObject("/Ff")] = NumberObject(0)
            campo[NameObject("/Q")] = NumberObject(1)
            campo[NameObject("/MaxLen")] = NumberObject(lunghezza)
            campo[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
            for chiave in ("/AS", "/V", "/AP"):
                if chiave in campo:
                    del campo[NameObject(chiave)]
            for kid in campo.get("/Kids") or []:
                widget = kid.get_object()
                for chiave in ("/AS", "/AP", "/MK"):
                    if chiave in widget:
                        del widget[NameObject(chiave)]
            print(f"    {nome}: casella di spunta -> campo di testo ({lunghezza} caratteri)")


def prepara(sorgente: Path, destinazione: Path) -> None:
    print(f"\n{sorgente.name} -> {destinazione.name}")
    reader = PdfReader(str(sorgente))
    pagine = indice_pagine(reader)

    writer = PdfWriter(clone_from=reader)
    # Ricalcola la mappa sugli oggetti clonati dal writer.
    pagine = {}
    for numero, pagina in enumerate(writer.pages, start=1):
        for annot in pagina.get("/Annots") or []:
            pagine[id(annot.get_object())] = numero

    separa_widget_omonimi(writer, pagine)
    sistema_tipi_campo(writer)

    with open(destinazione, "wb") as uscita:
        writer.write(uscita)

    controllo = PdfReader(str(destinazione))
    campi = controllo.get_fields() or {}
    widget = sum(len(p.get("/Annots") or []) for p in controllo.pages)
    print(f"    risultato: {len(campi)} campi, {widget} riquadri")
    if len(campi) != widget:
        print("    ATTENZIONE: restano nomi condivisi")


def main() -> int:
    for sorgente, destinazione in MODELLI:
        percorso = PDF_DIR / sorgente
        if not percorso.exists():
            print(f"Manca {percorso}")
            return 1
        prepara(percorso, PDF_DIR / destinazione)
    print("\nFatto.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
