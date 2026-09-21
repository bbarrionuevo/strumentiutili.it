#!/usr/bin/env python3
"""Crea i campi compilabili del modello RAP (Registrazione di Atto Privato).

Il RAP serve a registrare tre tipi di atto privato: il contratto di comodato,
il contratto preliminare di compravendita e il verbale di distribuzione utili.
Ognuno ha la sua pagina, e si compila solo quella che riguarda il proprio atto.

Come il modello RLI, il PDF dell'Agenzia non ha campi modulo ma disegna le
caselle come rettangoli bianchi sul pannello azzurro, con trattini verticali a
separare i caratteri dei campi "a pettine". Le coordinate qui sotto sono quelle
misurate su quel disegno.

Tre particolarita':

1. La testata con il codice fiscale, e il "Modulo N." dalla seconda pagina in
   poi, si ripetono su ogni foglio: sono un campo solo con piu' riquadri.

2. Gli importi hanno la virgola gia' stampata ma non le caselline dei centesimi.
   Ogni importo diventa percio' due campi, "<nome>" per gli euro (allineato a
   destra, contro la virgola) e "<nome>_cent" per i decimali.

3. Le due caselle "Descrizione" sono alte diverse righe: diventano campi di
   testo multiriga.

Produce assets/pdf/modello-rap-compilabile.pdf.

Uso:  python scripts/prepara-modello-rap.py
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
SORGENTE = PDF_DIR / "modello-rap-ufficiale.pdf"
DESTINAZIONE = PDF_DIR / "modello-rap-compilabile.pdf"

FLAG_PETTINE = 1 << 24
FLAG_MULTIRIGA = 1 << 12
A_SINISTRA, A_DESTRA = 0, 2
STACCO_VIRGOLA = 1.5   # spazio fra l'ultima cifra degli euro e la virgola stampata
# Le caselle alte 18 punti hanno l'etichetta stampata dentro, in alto: il testo
# va scritto sotto, dove ci sono i trattini del pettine. Si usa quindi solo la
# parte bassa del riquadro.
ALTEZZA_UTILE = 13.0

# (nome, [(pagina, x0, y0, x1, y1), ...], caselline, allineamento, multiriga)
CAMPI: list = []


def campo(nome, riquadri, caselline=None, allineamento=A_SINISTRA, multiriga=False,
          tutta_altezza=False):
    if not tutta_altezza:
        riquadri = [(p, x0, y0, x1, min(y1, y0 + ALTEZZA_UTILE)) for p, x0, y0, x1, y1 in riquadri]
    CAMPI.append((nome, riquadri, caselline, allineamento, multiriga))


def importo(nome, pagina, x0, y0, x1, y1, virgola):
    """Un importo con la virgola stampata: euro a destra, centesimi a pettine."""
    campo(nome, [(pagina, x0, y0, virgola - STACCO_VIRGOLA, y1)], None, A_DESTRA)
    campo(nome + "_cent", [(pagina, virgola + 2.0, y0, x1, y1)], 2)


# ------------------------------------------------- testata ripetuta sui fogli
campo("cf_testata", [(1, 336.2, 793.9, 566.6, 811.9)]
      + [(p, 230.3, 793.9, 460.7, 811.9) for p in (2, 3, 4, 5)], 16)
campo("modulo_n", [(p, 513.6, 793.9, 556.8, 811.9) for p in (2, 3, 4, 5)], 3)

# ----------------------------------------------------- pagina 1: dati generali
campo("ufficio_territoriale", [(1, 178.8, 673.9, 358.8, 691.9)])
campo("tipologia_atto", [(1, 409.2, 674.1, 427.2, 691.9)], 1)
campo("n_fogli", [(1, 474.0, 673.9, 502.8, 691.9)], 2)
campo("n_copie", [(1, 524.4, 673.9, 553.2, 691.9)], 2)
campo("data_atto", [(1, 106.8, 637.9, 222.0, 655.9)], 8)
campo("esenzioni", [(1, 387.6, 637.9, 402.0, 649.9)], 1)
campo("condizione_sospensiva", [(1, 438.0, 637.9, 452.4, 649.9)], 1)
campo("eventi_eccezionali", [(1, 488.4, 637.9, 502.8, 649.9)], 1)
campo("casi_particolari", [(1, 538.9, 637.9, 553.2, 649.9)], 1)
campo("allegati_scritture", [(1, 178.8, 601.9, 207.6, 619.9)], 2)
campo("allegati_ricevute", [(1, 258.0, 601.9, 286.8, 619.9)], 2)
campo("allegati_mappe", [(1, 337.2, 601.9, 366.0, 619.9)], 2)

campo("richiedente_cognome", [(1, 106.6, 565.9, 337.0, 583.9)])
campo("richiedente_nome", [(1, 351.6, 565.9, 560.4, 583.9)])
campo("richiedente_cf", [(1, 106.6, 529.9, 337.0, 547.9)], 16)
campo("mediatore", [(1, 387.6, 530.1, 405.6, 547.9)], 1)
campo("firma_richiedente", [(1, 351.6, 498.5, 560.3, 514.5)], tutta_altezza=True)

campo("rappresentante_cognome", [(1, 106.7, 457.9, 337.1, 475.9)])
campo("rappresentante_nome", [(1, 351.6, 457.9, 560.4, 475.9)])
campo("rappresentante_cf", [(1, 106.6, 421.9, 337.0, 439.9)])
campo("codice_carica", [(1, 524.4, 421.9, 538.8, 433.9)], 2)

campo("cf_intermediario", [(1, 373.2, 385.9, 560.4, 403.9)])
campo("impegno_telematico", [(1, 546.0, 361.9, 560.4, 373.9)], 1)
campo("impegno_giorno", [(1, 175.0, 325.7, 196.6, 343.7)], 2)
campo("impegno_mese", [(1, 196.6, 325.7, 218.2, 343.7)], 2)
campo("impegno_anno", [(1, 218.2, 325.7, 254.2, 343.7)], 4)
campo("firma_impegno", [(1, 351.6, 329.9, 560.4, 345.9)], tutta_altezza=True)

for nome, y in (("registro", 289.9), ("bollo", 265.9)):
    for voce, x0 in (("imposta", 186.0), ("sanzioni", 330.0), ("interessi", 474.0)):
        importo(f"{voce}_{nome}", 1, x0, y, x0 + 86.4, y + 18.0, x0 + 70.2)

# ------------------------------------------- pagina 2: quadro soggetti (6 blocchi)
# I primi tre sono i danti causa, gli altri tre gli aventi causa.
for indice in range(6):
    b = 721.9 - 108.0 * indice
    n = indice + 1
    campo(f"s{n}_cf", [(2, 106.8, b, 337.2, b + 18.0)], 16)
    campo(f"s{n}_cognome", [(2, 106.8, b - 36.0, 337.2, b - 18.0)])
    campo(f"s{n}_nome", [(2, 351.6, b - 36.0, 560.4, b - 18.0)])
    campo(f"s{n}_data_nascita", [(2, 106.8, b - 72.0, 222.0, b - 54.0)], 8)
    campo(f"s{n}_sesso", [(2, 232.8, b - 72.0, 247.2, b - 60.0)], 1)
    campo(f"s{n}_comune_nascita", [(2, 258.0, b - 72.0, 510.0, b - 54.0)])
    campo(f"s{n}_provincia", [(2, 524.5, b - 72.0, 560.6, b - 54.0)], 2)


def quadro_immobili(pagina, prefisso, base_primo):
    """I cinque immobili delle pagine del comodato e del preliminare."""
    for indice in range(5):
        b = base_primo - 108.0 * indice
        n = indice + 1
        campo(f"{prefisso}{n}_codice_comune", [(pagina, 106.8, b, 178.8, b + 18.0)], 5)
        campo(f"{prefisso}{n}_tu", [(pagina, 207.6, b, 229.2, b + 18.0)], 1)
        campo(f"{prefisso}{n}_sezione", [(pagina, 261.6, b, 304.8, b + 18.0)], 3)
        campo(f"{prefisso}{n}_foglio", [(pagina, 337.2, b, 394.8, b + 18.0)], 4)
        campo(f"{prefisso}{n}_particella", [(pagina, 423.6, b, 495.6, b + 18.0)], 5)
        campo(f"{prefisso}{n}_particella_den", [(pagina, 502.8, b, 560.4, b + 18.0)], 4)
        campo(f"{prefisso}{n}_subalterno", [(pagina, 106.8, b - 36.0, 164.4, b - 18.0)], 4)
        campo(f"{prefisso}{n}_accatastamento", [(pagina, 182.4, b - 36.0, 196.8, b - 24.0)], 1)
        campo(f"{prefisso}{n}_comune", [(pagina, 214.8, b - 36.0, 517.2, b - 18.0)])
        campo(f"{prefisso}{n}_provincia", [(pagina, 524.4, b - 36.0, 560.4, b - 18.0)], 2)
        campo(f"{prefisso}{n}_tipologia", [(pagina, 106.8, b - 72.0, 178.8, b - 54.0)])
        campo(f"{prefisso}{n}_indirizzo", [(pagina, 186.0, b - 72.0, 531.6, b - 54.0)])
        campo(f"{prefisso}{n}_civico", [(pagina, 538.8, b - 72.0, 560.4, b - 54.0)])


# ---------------------------------------- pagina 3: contratto di comodato
campo("com_tempo_indeterminato", [(3, 128.5, 721.9, 142.9, 733.9)], 1)
campo("com_durata_dal", [(3, 186.0, 721.9, 301.2, 739.9)], 8)
campo("com_durata_al", [(3, 322.8, 721.9, 438.0, 739.9)], 8)
campo("com_clausola_penale", [(3, 481.8, 722.3, 495.2, 733.3)], 1)
# Il riquadro del tipo di comodato non ha divisori stampati: una casella
# sola, cosi' il codice resta centrato dentro al riquadro.
campo("com_tipo", [(3, 114.0, 685.9, 157.2, 703.9)], 1)
campo("com_mobile", [(3, 186.0, 685.9, 200.4, 697.9)], 1)
campo("com_immobile", [(3, 236.4, 685.9, 250.8, 697.9)], 1)
campo("com_universalita", [(3, 286.9, 685.9, 301.3, 697.9)], 1)
campo("com_descrizione", [(3, 106.8, 625.9, 560.4, 667.9)], None, A_SINISTRA, True,
      tutta_altezza=True)
quadro_immobili(3, "ic", 577.8)

# --------------------------- pagina 4: contratto preliminare di compravendita
campo("pre_immobile", [(4, 123.6, 722.2, 137.0, 733.2)], 1)
campo("pre_altri_beni", [(4, 174.0, 722.2, 187.4, 733.2)], 1)
importo("pre_prezzo", 4, 211.9, 721.9, 276.7, 739.9, 265.0)
importo("pre_caparra_confirmatoria", 4, 281.0, 721.9, 345.8, 739.9, 334.3)
importo("pre_acconto", 4, 350.0, 721.9, 414.8, 739.9, 403.4)
importo("pre_caparra_penitenziale", 4, 419.1, 721.9, 483.9, 739.9, 472.5)
campo("pre_soggetto_iva", [(4, 123.5, 686.4, 136.9, 697.4)], 1)
campo("pre_clausola_penale", [(4, 195.5, 686.4, 208.9, 697.4)], 1)
campo("pre_stato_enti", [(4, 267.5, 686.4, 280.9, 697.4)], 1)
campo("pre_descrizione", [(4, 106.8, 614.0, 560.4, 668.2)], None, A_SINISTRA, True,
      tutta_altezza=True)
quadro_immobili(4, "ip", 565.8)

# ------------------------------ pagina 5: verbale di distribuzione utili
importo("utili_totale", 5, 106.8, 721.9, 207.6, 739.9, 196.2)
importo("utili_distribuiti", 5, 236.4, 721.9, 337.2, 739.9, 325.8)
for indice in range(5):
    b = 673.9 - 108.0 * indice
    n = indice + 1
    campo(f"so{n}_cf", [(5, 106.8, b, 337.2, b + 18.0)], 16)
    importo(f"so{n}_quota", 5, 387.6, b, 452.4, b + 18.0, 441.0)
    importo(f"so{n}_importo", 5, 474.0, b, 560.4, b + 18.0, 549.0)
    campo(f"so{n}_cognome", [(5, 106.8, b - 36.0, 337.2, b - 18.0)])
    campo(f"so{n}_nome", [(5, 351.6, b - 36.0, 560.4, b - 18.0)])
    campo(f"so{n}_data_nascita", [(5, 106.8, b - 72.0, 222.0, b - 54.0)], 8)
    campo(f"so{n}_sesso", [(5, 232.8, b - 72.0, 247.2, b - 60.0)], 1)
    campo(f"so{n}_comune_nascita", [(5, 258.0, b - 72.0, 510.0, b - 54.0)])
    campo(f"so{n}_provincia", [(5, 524.5, b - 72.0, 560.6, b - 54.0)], 2)


# ------------------------------------------------------------------ creazione

def campo_testo(writer, nome, caratteri, allineamento, multiriga):
    bandiere = 0
    if caratteri:
        bandiere |= FLAG_PETTINE
    if multiriga:
        bandiere |= FLAG_MULTIRIGA
    d = DictionaryObject()
    d[NameObject("/FT")] = NameObject("/Tx")
    d[NameObject("/T")] = TextStringObject(nome)
    d[NameObject("/Ff")] = NumberObject(bandiere)
    d[NameObject("/DA")] = TextStringObject("/Helv 0 Tf 0 g")
    if caratteri:
        d[NameObject("/MaxLen")] = NumberObject(caratteri)
    d[NameObject("/Q")] = NumberObject(allineamento)
    d[NameObject("/Kids")] = ArrayObject()
    return writer._add_object(d)


def widget(writer, riferimento, rect):
    w = DictionaryObject()
    w[NameObject("/Type")] = NameObject("/Annot")
    w[NameObject("/Subtype")] = NameObject("/Widget")
    w[NameObject("/F")] = NumberObject(4)
    w[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in rect])
    w[NameObject("/Parent")] = riferimento
    return writer._add_object(w)


def prepara() -> int:
    if not SORGENTE.exists():
        print(f"Manca {SORGENTE}: esegui prima scripts/scarica-modelli-ufficiali.py")
        return 1

    writer = PdfWriter(clone_from=PdfReader(str(SORGENTE)))
    pagine = list(writer.pages)
    campi, per_pagina = [], {i: [] for i in range(len(pagine))}
    visti = set()

    for nome, riquadri, caratteri, allineamento, multiriga in CAMPI:
        if nome in visti:
            print(f"  nome ripetuto: {nome}")
            return 1
        visti.add(nome)
        riferimento = campo_testo(writer, nome, caratteri, allineamento, multiriga)
        kids = riferimento.get_object()[NameObject("/Kids")]
        for npag, x0, y0, x1, y1 in riquadri:
            rif_widget = widget(writer, riferimento, (x0, y0, x1, y1))
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
        if per_pagina[i]:
            print(f"   pagina {i + 1}: {len(per_pagina[i])} riquadri")
    return 0


if __name__ == "__main__":
    raise SystemExit(prepara())
