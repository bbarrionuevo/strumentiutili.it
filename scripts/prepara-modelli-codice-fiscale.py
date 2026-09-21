#!/usr/bin/env python3
"""Prepara i PDF compilabili dei modelli del codice fiscale (AA4/8 e AA5/6).

A differenza dei modelli di versamento, l'Agenzia pubblica di questi due una
versione che ha gia' i campi modulo: non serve ricostruire la geometria. Quelle
versioni hanno pero' difetti che impediscono di compilarle da JavaScript.

AA4/8 - due problemi:

1. Le caselle a pettine (codice fiscale, date, provincia, C.A.P.) hanno il flag
   /Comb ma non /MaxLen. Senza il numero di caselline il lettore non sa in
   quante parti dividere il riquadro: il testo finisce fuori dai quadretti
   stampati. Qui il numero viene rimesso, contato sul modulo.

2. Il "codice tipologia richiedente" e' fatto di DUE menu a tendina sovrapposti
   sullo stesso riquadro: uno per i codici di una cifra e uno per quelli di due.
   Il secondo, per giunta, ha una voce sbagliata (il valore "16" compare due
   volte, al posto di "15"). I due menu vengono sostituiti da un'unica casella
   a pettine di due caratteri, allineata al riquadro stampato.

AA5/6 - tre problemi:

1. Il file e' cifrato con AES. pdf-lib, nel browser, non apre i PDF cifrati:
   la copia viene riscritta in chiaro. Non si toglie nessuna protezione utile,
   perche' la password di apertura e' vuota e quella dei permessi serve solo a
   scoraggiare le modifiche in Acrobat.

2. C'e' un pulsante "STAMPA" con dentro del JavaScript di Acrobat, che nel
   browser non fa nulla e che pdf-lib elenca fra i campi: viene tolto.

3. Le caselle da barrare hanno come stato acceso il nome /Si con l'accento.
   Un nome non ASCII dentro un PDF va scritto con le sequenze #XX e non tutti i
   lettori lo rimettono insieme allo stesso modo: lo stato viene rinominato /On.

   Inoltre quattro campi sono menu a tendina (sesso, codice carica, giorno e
   mese del termine): diventano caselle a pettine come tutte le altre, cosi'
   il compilatore ha un solo modo di scrivere nel modulo.

Lo script non modifica i file di partenza: produce le copie corrette
   assets/pdf/modello-aa4-8-compilabile.pdf
   assets/pdf/modello-aa5-6-compilabile.pdf
che sono quelle caricate dalle pagine web.

Uso:  python scripts/prepara-modelli-codice-fiscale.py
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import (
        ArrayObject, BooleanObject, ByteStringObject, DictionaryObject, FloatObject,
        NameObject, NumberObject, TextStringObject,
    )
except ImportError:  # pragma: no cover
    sys.exit("Serve pypdf:  python -m pip install pypdf")

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "assets" / "pdf"

SORGENTE = PDF_DIR / "modello-aa4-8-ufficiale.pdf"
DESTINAZIONE = PDF_DIR / "modello-aa4-8-compilabile.pdf"

SORGENTE_AA5 = PDF_DIR / "modello-aa5-6-editabile.pdf"
DESTINAZIONE_AA5 = PDF_DIR / "modello-aa5-6-compilabile.pdf"

FLAG_PETTINE = 1 << 24

# nome del campo -> caselline stampate sul modulo, contate sul PDF ufficiale
CASELLINE = {
    "codice fiscale_1": 16,
    "codice fiscale_2": 16,
    "codice fiscale_3": 16,
    "codice fiscale_4": 16,
    "quadro E_codice fiscale_1": 16,
    "quadro E_codice fiscale_2": 16,
    "cf_sottoscrittore": 16,
    "cf_delega": 16,
    "sottoscrizione_codice fiscale_1": 11,   # partita IVA di chi non e' persona fisica
    "data decesso": 8,                       # GGMMAAAA
    "data di nascita": 8,
    "data sottoscrizione": 8,
    "data delega": 8,
    "quadroB_provincia": 2,
    "quadroC_provincia": 2,
    "quadroC_cap": 5,
}

# I due menu a tendina sovrapposti, e la casella che li sostituisce. Le
# coordinate sono quelle dei due quadretti stampati, presi dal modulo.
TENDINE_DA_SOSTITUIRE = ("codice carica 1", "codice carica 2")
CASELLA_SOSTITUTIVA = {
    "nome": "codice_tipologia_richiedente",
    "rect": (531.88, 722.14, 560.18, 733.64),
    "caselline": 2,
    "pagina": 1,
}


def campi_del_modulo(writer: PdfWriter):
    """Coppie (nome, oggetto campo) di tutti i campi dell'AcroForm."""
    for riferimento in writer._root_object["/AcroForm"]["/Fields"]:
        campo = riferimento.get_object()
        nome = campo.get("/T")
        if nome is not None:
            yield str(nome), riferimento, campo


def rimetti_le_caselline(writer: PdfWriter) -> int:
    quanti = 0
    for nome, _riferimento, campo in campi_del_modulo(writer):
        attese = CASELLINE.get(nome)
        if attese is None:
            continue
        bandiere = int(campo.get("/Ff", 0) or 0)
        if not bandiere & FLAG_PETTINE:
            print(f"    {nome}: non e' a pettine, saltato")
            continue
        campo[NameObject("/MaxLen")] = NumberObject(attese)
        quanti += 1
    print(f"    caselline rimesse su {quanti} campi a pettine")
    return quanti


def sostituisci_le_tendine(writer: PdfWriter) -> None:
    """Toglie i due menu sovrapposti e mette al loro posto una casella sola."""
    acroform = writer._root_object["/AcroForm"]
    da_togliere = []
    for nome, riferimento, _campo in campi_del_modulo(writer):
        if nome in TENDINE_DA_SOSTITUIRE:
            da_togliere.append((nome, riferimento))

    for nome, riferimento in da_togliere:
        acroform["/Fields"].remove(riferimento)
        for pagina in writer.pages:
            annotazioni = pagina.get("/Annots")
            if annotazioni and riferimento in annotazioni:
                annotazioni.remove(riferimento)
        print(f"    {nome}: menu a tendina rimosso")

    x0, y0, x1, y1 = CASELLA_SOSTITUTIVA["rect"]
    campo = DictionaryObject()
    campo[NameObject("/Type")] = NameObject("/Annot")
    campo[NameObject("/Subtype")] = NameObject("/Widget")
    campo[NameObject("/FT")] = NameObject("/Tx")
    campo[NameObject("/T")] = TextStringObject(CASELLA_SOSTITUTIVA["nome"])
    campo[NameObject("/Ff")] = NumberObject(FLAG_PETTINE)
    campo[NameObject("/MaxLen")] = NumberObject(CASELLA_SOSTITUTIVA["caselline"])
    campo[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
    campo[NameObject("/Q")] = NumberObject(0)
    campo[NameObject("/F")] = NumberObject(4)
    campo[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in (x0, y0, x1, y1)])
    riferimento = writer._add_object(campo)

    acroform["/Fields"].append(riferimento)
    pagina = writer.pages[CASELLA_SOSTITUTIVA["pagina"]]
    if "/Annots" not in pagina:
        pagina[NameObject("/Annots")] = ArrayObject()
    pagina["/Annots"].append(riferimento)
    print(f"    {CASELLA_SOSTITUTIVA['nome']}: casella a pettine da "
          f"{CASELLA_SOSTITUTIVA['caselline']} caratteri al posto dei due menu")


def prepara() -> int:
    if not SORGENTE.exists():
        print(f"Manca {SORGENTE}: esegui prima scripts/scarica-modelli-ufficiali.py")
        return 1

    print(f"\n{SORGENTE.name} -> {DESTINAZIONE.name}")
    writer = PdfWriter(clone_from=PdfReader(str(SORGENTE)))

    rimetti_le_caselline(writer)
    sostituisci_le_tendine(writer)

    # Il lettore deve ridisegnare l'aspetto dei campi con i nuovi pettini.
    writer._root_object["/AcroForm"][NameObject("/NeedAppearances")] = BooleanObject(True)

    with open(DESTINAZIONE, "wb") as uscita:
        writer.write(uscita)

    # Rilettura dal file scritto: get_fields() non espone /MaxLen, quindi si
    # guardano direttamente i dizionari dei campi dell'AcroForm.
    controllo = PdfReader(str(DESTINAZIONE))
    campi = [rif.get_object() for rif in controllo.trailer["/Root"]["/AcroForm"]["/Fields"]]
    senza_caselline = [
        str(c.get("/T")) for c in campi
        if int(c.get("/Ff", 0) or 0) & FLAG_PETTINE and c.get("/MaxLen") is None
    ]
    print(f"    risultato: {len(campi)} campi, "
          f"{sum(1 for c in campi if c.get('/FT') == '/Tx')} di testo")
    if senza_caselline:
        print(f"    ATTENZIONE: pettini ancora senza caselline: {senza_caselline}")
        return 1
    return 0

# --------------------------------------------------------------------------
# AA5/6: codice fiscale di enti, associazioni, condomini
# --------------------------------------------------------------------------

# I quattro menu a tendina, con le caselline del riquadro stampato che li
# sostituisce. Le tendine restano in piedi solo in Acrobat: il compilatore web
# scrive testo, e il testo nelle caselline si vede in qualunque lettore.
TENDINE_AA5 = {
    "quadroc_sesso": 1,
    "codice carica": 2,
    "termine app_giorno": 2,
    "termine app_mese": 2,
}

STATO_ACCESO = "/On"


def tendine_in_caselline(writer: PdfWriter) -> int:
    """Trasforma i menu a tendina in caselle a pettine, stesso riquadro."""
    quante = 0
    for nome, _riferimento, campo in campi_del_modulo(writer):
        caselline = TENDINE_AA5.get(nome)
        if caselline is None or campo.get("/FT") != "/Ch":
            continue
        campo[NameObject("/FT")] = NameObject("/Tx")
        campo[NameObject("/Ff")] = NumberObject(FLAG_PETTINE)
        campo[NameObject("/MaxLen")] = NumberObject(caselline)
        campo[NameObject("/DA")] = TextStringObject("/HeBo 10 Tf 0 g")
        for chiave in ("/Opt", "/TI", "/I"):
            if chiave in campo:
                del campo[NameObject(chiave)]
        quante += 1
    print(f"    {quante} menu a tendina diventati caselle a pettine")
    return quante


def rinomina_lo_stato_acceso(writer: PdfWriter) -> int:
    """Porta a /On lo stato delle caselle da barrare, qualunque fosse."""
    quante = 0
    for nome, _riferimento, campo in campi_del_modulo(writer):
        if campo.get("/FT") != "/Btn":
            continue
        aspetto = campo.get("/AP")
        if aspetto is None:
            continue
        acceso = None
        for sottochiave in ("/N", "/D"):
            sotto = aspetto.get(sottochiave)
            if sotto is None:
                continue
            for stato in [k for k in sotto.keys() if k != "/Off"]:
                acceso = acceso or str(stato)
                sotto[NameObject(STATO_ACCESO)] = sotto[NameObject(stato)]
                del sotto[NameObject(stato)]
        if acceso is None or acceso == STATO_ACCESO:
            continue
        for chiave in ("/AS", "/V", "/DV"):
            if campo.get(chiave) is not None and str(campo[chiave]) == acceso:
                campo[NameObject(chiave)] = NameObject(STATO_ACCESO)
        quante += 1
    print(f"    {quante} caselle da barrare con stato acceso {STATO_ACCESO}")
    return quante


def togli_il_pulsante_stampa(writer: PdfWriter) -> None:
    """Il pulsante STAMPA contiene JavaScript di Acrobat: nel browser e' inerte."""
    acroform = writer._root_object["/AcroForm"]
    for nome, riferimento, _campo in list(campi_del_modulo(writer)):
        if nome != "STAMPA":
            continue
        acroform["/Fields"].remove(riferimento)
        for pagina in writer.pages:
            annotazioni = pagina.get("/Annots")
            if annotazioni and riferimento in annotazioni:
                annotazioni.remove(riferimento)
        print("    pulsante STAMPA rimosso")


# Il riquadro del sesso e' uno solo per due persone diverse: quello del
# rappresentante del soggetto d'imposta (quadro C) e quello del rappresentante
# del soggetto risultante dalla fusione (quadro D). Nel PDF dell'Agenzia
# condividono lo stesso campo, quindi scrivendo M nel primo compare M anche nel
# secondo. Il secondo riquadro diventa un campo a se'.
SESSO_CONDIVISO = "quadroc_sesso"
SESSO_SEPARATO = "rappresentante_sesso"

# I riquadri della firma sono disegnati sul modulo ma non hanno un campo:
# a penna si firma, da tastiera no. Si aggiunge una casella di testo per
# scriverci il nome, da firmare poi a mano o digitalmente.
FIRME_DA_AGGIUNGERE = [
    ("firma_sottoscrizione", 2, (331.5, 588.9, 560.2, 613.9)),
    ("firma_delega", 2, (345.0, 505.3, 560.2, 523.3)),
    ("firma_intermediario", 2, (388.5, 397.4, 560.7, 420.9)),
]

# pdf-lib sceglie il corpo del carattere in base all'altezza del riquadro. I
# riquadri della firma sono piu' alti degli altri e il nome verrebbe fuori in
# corpo 20, fuori scala rispetto al resto del modulo: si abbassano all'altezza
# delle altre caselle, restando appoggiati alla riga stampata.
ALTEZZA_FIRMA = 18.0

# Il riquadro degli allegati tiene quattro righe stampate, ed e' alto 96 punti.
# pdf-lib, quando non riesce a leggere il corpo del carattere scritto nel campo,
# lo ricava dall'altezza del riquadro: in questo verrebbe fuori un corpo 28, da
# titolo di giornale. Qui il corpo si fissa.
#
# Perche' pdf-lib non riesce a leggerlo: pypdf, scrivendo una stringa fra
# parentesi, protegge ogni carattere non alfanumerico con la sua sequenza
# ottale, e "/Helv 10 Tf 0 g" diventa "/Helv 10 Tf 0 g". E' PDF valido, ma
# il lettore di stringhe di pdf-lib non scioglie le sequenze ottali e quindi non
# trova piu' il nome del carattere. Scritta in esadecimale, la stessa stringa
# pdf-lib la legge senza inciampi.
CORPI_FISSI = {"allegati": 10}


def fissa_il_corpo_del_carattere(writer: PdfWriter) -> int:
    quanti = 0
    for nome, _riferimento, campo in campi_del_modulo(writer):
        corpo = CORPI_FISSI.get(nome)
        if corpo is None:
            continue
        campo[NameObject("/DA")] = ByteStringObject(b"/Helv %d Tf 0 g" % corpo)
        quanti += 1
    print(f"    corpo del carattere fissato su {quanti} riquadri alti")
    return quanti

# Il codice fiscale va ripetuto in testa a ogni pagina, sempre lo stesso. Nel
# PDF dell'Agenzia sono due campi distinti, quindi andrebbe scritto due volte:
# diventano un campo solo con due riquadri, come le copie dell'F24. Chi poi
# apre il PDF scaricato e corregge la testata se la ritrova corretta su
# entrambe le pagine.
TESTATE_DA_UNIRE = ("codice fiscale_pagina", "codice fiscale_pagina2")


def separa_i_due_sessi(writer: PdfWriter) -> int:
    """Stacca il riquadro del quadro D dal campo condiviso con il quadro C."""
    for nome, _riferimento, campo in campi_del_modulo(writer):
        if nome != SESSO_CONDIVISO:
            continue
        riquadri = campo.get("/Kids")
        if not riquadri or len(riquadri) < 2:
            print(f"    {SESSO_CONDIVISO}: un riquadro solo, niente da separare")
            return 0
        # quello piu' in basso nella pagina e' il rappresentante del quadro D
        piu_basso = min(riquadri, key=lambda k: float(k.get_object()["/Rect"][1]))
        riquadri.remove(piu_basso)
        staccato = piu_basso.get_object()
        staccato[NameObject("/T")] = TextStringObject(SESSO_SEPARATO)
        staccato[NameObject("/FT")] = NameObject("/Tx")
        staccato[NameObject("/Ff")] = NumberObject(FLAG_PETTINE)
        staccato[NameObject("/MaxLen")] = NumberObject(1)
        staccato[NameObject("/DA")] = TextStringObject("/HeBo 10 Tf 0 g")
        staccato[NameObject("/Q")] = NumberObject(1)
        if "/Parent" in staccato:
            del staccato[NameObject("/Parent")]
        writer._root_object["/AcroForm"]["/Fields"].append(piu_basso)
        print(f"    {SESSO_SEPARATO}: riquadro staccato da {SESSO_CONDIVISO}")
        return 1
    return 0


def aggiungi_le_firme(writer: PdfWriter) -> int:
    acroform = writer._root_object["/AcroForm"]
    gia_presenti = {nome for nome, _r, _c in campi_del_modulo(writer)}
    quante = 0
    for nome, numero_pagina, (x0, y0, x1, y1) in FIRME_DA_AGGIUNGERE:
        if nome in gia_presenti:
            continue
        y1 = min(y1, y0 + ALTEZZA_FIRMA)
        campo = DictionaryObject()
        campo[NameObject("/Type")] = NameObject("/Annot")
        campo[NameObject("/Subtype")] = NameObject("/Widget")
        campo[NameObject("/FT")] = NameObject("/Tx")
        campo[NameObject("/T")] = TextStringObject(nome)
        campo[NameObject("/DA")] = TextStringObject("/HeBo 10 Tf 0 g")
        campo[NameObject("/Q")] = NumberObject(0)
        campo[NameObject("/F")] = NumberObject(4)
        campo[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in (x0, y0, x1, y1)])
        riferimento = writer._add_object(campo)
        acroform["/Fields"].append(riferimento)
        pagina = writer.pages[numero_pagina]
        if "/Annots" not in pagina:
            pagina[NameObject("/Annots")] = ArrayObject()
        pagina["/Annots"].append(riferimento)
        quante += 1
    print(f"    {quante} caselle per il nome sotto le firme")
    return quante


def unisci_le_testate(writer: PdfWriter) -> int:
    """Fa dei due codici fiscali di testata un campo solo con due riquadri."""
    acroform = writer._root_object["/AcroForm"]
    trovati = {nome: rif for nome, rif, _c in campi_del_modulo(writer)
               if nome in TESTATE_DA_UNIRE}
    if len(trovati) != 2:
        print(f"    testate: trovate {len(trovati)} su 2, niente da unire")
        return 0

    principale, secondaria = (trovati[n] for n in TESTATE_DA_UNIRE)
    modello = principale.get_object()

    genitore = DictionaryObject()
    for chiave in ("/FT", "/Ff", "/MaxLen", "/DA", "/Q"):
        if chiave in modello:
            genitore[NameObject(chiave)] = modello[chiave]
    genitore[NameObject("/T")] = TextStringObject(TESTATE_DA_UNIRE[0])
    riferimento_genitore = writer._add_object(genitore)

    riquadri = ArrayObject()
    for riferimento in (principale, secondaria):
        riquadro = riferimento.get_object()
        for chiave in ("/T", "/FT", "/Ff", "/MaxLen", "/DA", "/Q", "/V", "/DV"):
            if chiave in riquadro:
                del riquadro[NameObject(chiave)]
        riquadro[NameObject("/Parent")] = riferimento_genitore
        riquadri.append(riferimento)
        acroform["/Fields"].remove(riferimento)
    genitore[NameObject("/Kids")] = riquadri

    acroform["/Fields"].append(riferimento_genitore)
    print(f"    {TESTATE_DA_UNIRE[0]}: un campo solo per le due pagine")
    return 1


def prepara_aa5_6() -> int:
    if not SORGENTE_AA5.exists():
        print(f"Manca {SORGENTE_AA5}: esegui prima scripts/scarica-modelli-ufficiali.py")
        return 1

    print(f"\n{SORGENTE_AA5.name} -> {DESTINAZIONE_AA5.name}")
    lettore = PdfReader(str(SORGENTE_AA5))
    if lettore.is_encrypted:
        if not lettore.decrypt(""):
            print("    la password di apertura non e' vuota: impossibile procedere")
            return 1
        print("    cifratura AES aperta con password vuota e non riscritta")

    writer = PdfWriter(clone_from=lettore)
    togli_il_pulsante_stampa(writer)
    tendine_in_caselline(writer)
    rinomina_lo_stato_acceso(writer)
    separa_i_due_sessi(writer)
    aggiungi_le_firme(writer)
    unisci_le_testate(writer)
    fissa_il_corpo_del_carattere(writer)
    writer._root_object["/AcroForm"][NameObject("/NeedAppearances")] = BooleanObject(True)

    with open(DESTINAZIONE_AA5, "wb") as uscita:
        writer.write(uscita)

    controllo = PdfReader(str(DESTINAZIONE_AA5))
    if controllo.is_encrypted:
        print("    ATTENZIONE: la copia e' ancora cifrata")
        return 1
    campi = [rif.get_object() for rif in controllo.trailer["/Root"]["/AcroForm"]["/Fields"]]
    pettini_nudi = [
        str(c.get("/T")) for c in campi
        if int(c.get("/Ff", 0) or 0) & FLAG_PETTINE and c.get("/MaxLen") is None
    ]
    rimaste = [str(c.get("/T")) for c in campi if c.get("/FT") == "/Ch"]
    stati_strani = [
        str(c.get("/T")) for c in campi if c.get("/FT") == "/Btn" and c.get("/AP")
        and [k for k in (c["/AP"].get("/N") or {}).keys() if k not in ("/Off", STATO_ACCESO)]
    ]
    print(f"    risultato: {len(campi)} campi, "
          f"{sum(1 for c in campi if c.get('/FT') == '/Tx')} di testo, "
          f"{sum(1 for c in campi if c.get('/FT') == '/Btn')} da barrare")
    for etichetta, elenco in (("pettini senza caselline", pettini_nudi),
                              ("menu a tendina rimasti", rimaste),
                              ("stati acceso non normalizzati", stati_strani)):
        if elenco:
            print(f"    ATTENZIONE: {etichetta}: {elenco}")
            return 1
    return 0


if __name__ == "__main__":
    esito = prepara() | prepara_aa5_6()
    print("\nFatto." if not esito else "\nCompletato con problemi.")
    raise SystemExit(esito)
