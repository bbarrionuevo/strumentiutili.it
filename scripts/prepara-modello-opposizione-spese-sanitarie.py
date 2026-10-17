#!/usr/bin/env python3
"""Prepara il PDF compilabile del modello di opposizione all'utilizzo dei dati
delle spese sanitarie per la dichiarazione precompilata.

L'Agenzia pubblica il modello anche in versione editabile, con i campi gia'
fatti: non serve ricostruire la geometria come per i modelli di versamento.
La versione editabile ha pero' quattro cose che nel browser non funzionano o
escono male, e che qui si sistemano su una copia:

1. Tre pulsanti di Acrobat in alto a destra («STAMPA», «CANCELLA DATI» e
   «SALVA CON NOME»), fatti di JavaScript che nel browser non fa nulla: si
   tolgono con i loro riquadri, cosi' non finiscono stampati sul modello.

2. Le sei caselle delle tipologie di spesa (A-F) hanno come stato acceso il
   nome /Si con l'accento, che in un PDF va scritto con le sequenze #XX e non
   tutti i lettori rimettono insieme allo stesso modo: diventa /On, come
   nell'AA5/6. Le caselle non hanno l'aspetto da spente: se ne aggiunge uno
   vuoto, cosi' pdf-lib non ridisegna le caselle non barrate.

3. I campi di testo dichiarano il carattere «Arial,Bold»: la virgola nel nome
   impedisce al compilatore di leggerne il corpo, che resterebbe automatico
   (lettere piu' grandi quanto piu' il testo e' corto). Il /DA diventa
   "/Helv 10 Tf 0 g", scritto in esadecimale perche' pdf-lib lo legga (vedi il
   commento in scripts/prepara-modelli-codice-fiscale.py).

4. «Luogo e data» e' un campo solo: diventa due campi nello stesso riquadro,
   il luogo a sinistra e la data a destra, cosi' la data si sceglie dal
   calendario e si scrive sempre nella stessa forma.

Nota sui nomi: nel PDF dell'Agenzia i campi del secondo riquadro si chiamano
«... rappresentante/tutore», ma il riquadro stampato e' «IN QUALITA' DI
RAPPRESENTANTE/TUTORE DI»: ci vanno i dati della persona rappresentata. I dati
di chi firma stanno nel primo riquadro, «IL SOTTOSCRITTO». I nomi restano
quelli dell'Agenzia; lo schema (data/modello-opposizione-spese-sanitarie-
schema.json) li collega ai passi giusti.

Lo script non modifica il file di partenza: produce
   assets/pdf/modello-opposizione-spese-sanitarie-compilabile.pdf
che e' quello caricato dalla pagina web.

Uso:  python scripts/prepara-modello-opposizione-spese-sanitarie.py
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import (
        ArrayObject, BooleanObject, ByteStringObject, DecodedStreamObject,
        DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject,
    )
except ImportError:  # pragma: no cover
    sys.exit("Serve pypdf:  python -m pip install pypdf")

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "assets" / "pdf"

SORGENTE = PDF_DIR / "modello-opposizione-spese-sanitarie-editabile.pdf"
DESTINAZIONE = PDF_DIR / "modello-opposizione-spese-sanitarie-compilabile.pdf"

PULSANTI = ("STAMPA", "CANCELLA DATI", "SALVA CON NOME")
STATO_ACCESO = "/On"
DA_TESTO = b"/Helv 10 Tf 0 g"

# Il riquadro «Luogo e data», diviso in due: (nome, x0, x1, allineamento).
# La y resta quella del campo originale. Le misure sono in punti, prese dal
# riquadro dell'Agenzia (x da 82,8 a 277,8).
LUOGO_E_DATA = "Luogo e Data"
DIVISIONE = (
    ("luogo_firma", 82.8, 200.0, 0),
    ("data_firma", 204.0, 277.8, 1),
)

# I campi che lo schema usa: se l'Agenzia li rinomina, lo script si ferma.
ATTESI = {
    "Codice Fiscale", "Cognome e Nome", "Luogo di nascita", "Data di nascita",
    "Tessera sanitaria n", "Data di scadenza",
    "Codice Fiscale rappresentante/tutore", "Cognome e Nome rappresentante/tutore",
    "Luogo di nascita rappresentante/tutore", "Data di nascita rappresentante / tutore",
    "Tessera sanitaria rappresentante/tutore", "Datadi scadenza rappresentante/tutore",
    "A", "B", "C", "D", "E", "F", "luogo_firma", "data_firma",
}


def campi_del_modulo(writer: PdfWriter):
    """Terne (nome, riferimento, campo) di tutti i campi dell'AcroForm."""
    for riferimento in writer._root_object["/AcroForm"]["/Fields"]:
        campo = riferimento.get_object()
        nome = campo.get("/T")
        if nome is not None:
            yield str(nome), riferimento, campo


def togli_dalle_pagine(writer: PdfWriter, riferimento) -> None:
    """Toglie dalle pagine il riquadro del campo e quelli che ne sono figli."""
    for pagina in writer.pages:
        annotazioni = pagina.get("/Annots")
        if not annotazioni:
            continue
        for annotazione in list(annotazioni):
            padre = annotazione.get_object().get("/Parent")
            if annotazione == riferimento or getattr(padre, "idnum", None) == riferimento.idnum:
                annotazioni.remove(annotazione)


def togli_i_pulsanti(writer: PdfWriter) -> int:
    acroform = writer._root_object["/AcroForm"]
    tolti = 0
    for nome, riferimento, _campo in list(campi_del_modulo(writer)):
        if nome not in PULSANTI:
            continue
        acroform["/Fields"].remove(riferimento)
        togli_dalle_pagine(writer, riferimento)
        tolti += 1
    print(f"    {tolti} pulsanti di Acrobat rimossi, con i loro riquadri")
    return tolti


def sistema_le_caselle(writer: PdfWriter) -> int:
    """Stato acceso /On e un aspetto vuoto per lo stato spento."""
    quante = 0
    for _nome, _riferimento, campo in campi_del_modulo(writer):
        if campo.get("/FT") != "/Btn" or campo.get("/AP") is None:
            continue
        aspetto = campo["/AP"]
        acceso = None
        for sottochiave in ("/N", "/D"):
            sotto = aspetto.get(sottochiave)
            if sotto is None:
                continue
            for stato in [k for k in sotto.keys() if k not in ("/Off", STATO_ACCESO)]:
                acceso = acceso or str(stato)
                sotto[NameObject(STATO_ACCESO)] = sotto[NameObject(stato)]
                del sotto[NameObject(stato)]
        normale = aspetto["/N"]
        if "/Off" not in normale:
            vuoto = DecodedStreamObject()
            vuoto[NameObject("/Type")] = NameObject("/XObject")
            vuoto[NameObject("/Subtype")] = NameObject("/Form")
            x0, y0, x1, y1 = (float(v) for v in campo["/Rect"])
            vuoto[NameObject("/BBox")] = ArrayObject(
                [FloatObject(0), FloatObject(0), FloatObject(x1 - x0), FloatObject(y1 - y0)])
            vuoto.set_data(b"")
            normale[NameObject("/Off")] = writer._add_object(vuoto)
        for chiave in ("/AS", "/V", "/DV"):
            if acceso and campo.get(chiave) is not None and str(campo[chiave]) == acceso:
                campo[NameObject(chiave)] = NameObject(STATO_ACCESO)
        if campo.get("/AS") is None:
            campo[NameObject("/AS")] = NameObject("/Off")
        quante += 1
    print(f"    {quante} caselle da barrare con stato acceso {STATO_ACCESO}")
    return quante


def nuovo_campo(nome: str, rect, allineamento: int) -> DictionaryObject:
    campo = DictionaryObject()
    campo[NameObject("/Type")] = NameObject("/Annot")
    campo[NameObject("/Subtype")] = NameObject("/Widget")
    campo[NameObject("/FT")] = NameObject("/Tx")
    campo[NameObject("/T")] = TextStringObject(nome)
    campo[NameObject("/DA")] = ByteStringObject(DA_TESTO)
    campo[NameObject("/Q")] = NumberObject(allineamento)
    campo[NameObject("/F")] = NumberObject(4)
    campo[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in rect])
    return campo


def dividi_luogo_e_data(writer: PdfWriter) -> int:
    acroform = writer._root_object["/AcroForm"]
    trovato = [(r, c) for n, r, c in campi_del_modulo(writer) if n == LUOGO_E_DATA]
    if not trovato:
        print(f"    {LUOGO_E_DATA}: campo non trovato")
        return 0
    riferimento, campo = trovato[0]
    _x0, y0, _x1, y1 = (float(v) for v in campo["/Rect"])
    numero_pagina = next(i for i, p in enumerate(writer.pages)
                         if riferimento in (p.get("/Annots") or []))
    acroform["/Fields"].remove(riferimento)
    togli_dalle_pagine(writer, riferimento)
    pagina = writer.pages[numero_pagina]
    for nome, x0, x1, allineamento in DIVISIONE:
        nuovo = writer._add_object(nuovo_campo(nome, (x0, y0, x1, y1), allineamento))
        acroform["/Fields"].append(nuovo)
        pagina["/Annots"].append(nuovo)
    print(f"    «{LUOGO_E_DATA}» diviso in {len(DIVISIONE)} campi")
    return len(DIVISIONE)


def fissa_il_carattere(writer: PdfWriter) -> int:
    quanti = 0
    for _nome, _riferimento, campo in campi_del_modulo(writer):
        if campo.get("/FT") != "/Tx":
            continue
        campo[NameObject("/DA")] = ByteStringObject(DA_TESTO)
        quanti += 1
    print(f"    carattere fissato su {quanti} campi di testo")
    return quanti


def prepara() -> int:
    if not SORGENTE.exists():
        print(f"Manca {SORGENTE}: esegui prima scripts/scarica-modelli-ufficiali.py")
        return 1

    print(f"\n{SORGENTE.name} -> {DESTINAZIONE.name}")
    lettore = PdfReader(str(SORGENTE))
    if lettore.is_encrypted and not lettore.decrypt(""):
        print("    la password di apertura non e' vuota: impossibile procedere")
        return 1

    writer = PdfWriter(clone_from=lettore)
    togli_i_pulsanti(writer)
    sistema_le_caselle(writer)
    dividi_luogo_e_data(writer)
    fissa_il_carattere(writer)
    writer._root_object["/AcroForm"][NameObject("/NeedAppearances")] = BooleanObject(True)

    with open(DESTINAZIONE, "wb") as uscita:
        writer.write(uscita)

    controllo = PdfReader(str(DESTINAZIONE))
    campi = {str(r.get_object().get("/T")): r.get_object()
             for r in controllo.trailer["/Root"]["/AcroForm"]["/Fields"]}
    problemi = []
    if set(campi) != ATTESI:
        problemi.append(f"campi diversi da quelli attesi: mancano {sorted(ATTESI - set(campi))}, "
                        f"in piu' {sorted(set(campi) - ATTESI)}")
    for nome, campo in campi.items():
        if campo.get("/FT") == "/Btn":
            stati = set((campo.get("/AP") or {}).get("/N", {}).keys())
            if stati != {"/On", "/Off"}:
                problemi.append(f"{nome}: stati {sorted(stati)}")
    for nome in ("Codice Fiscale", "Codice Fiscale rappresentante/tutore"):
        if campi.get(nome, {}).get("/MaxLen") != 16:
            problemi.append(f"{nome}: servono 16 caselline")
    annotazioni = [str(a.get_object().get("/T") or a.get_object().get("/Parent", {}).get("/T"))
                   for p in controllo.pages for a in (p.get("/Annots") or [])]
    rimasti = [n for n in annotazioni if n in PULSANTI]
    if rimasti:
        problemi.append(f"pulsanti ancora sulla pagina: {rimasti}")
    print(f"    risultato: {len(campi)} campi, "
          f"{sum(1 for c in campi.values() if c.get('/FT') == '/Tx')} di testo, "
          f"{sum(1 for c in campi.values() if c.get('/FT') == '/Btn')} da barrare")
    for problema in problemi:
        print(f"    ATTENZIONE: {problema}")
    return 1 if problemi else 0


if __name__ == "__main__":
    esito = prepara()
    print("\nFatto." if not esito else "\nCompletato con problemi.")
    raise SystemExit(esito)
