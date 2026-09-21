#!/usr/bin/env python3
"""Crea i campi compilabili dei moduli di versamento: F24 e F23.

I PDF dell'Agenzia delle Entrate non hanno campi modulo, e a differenza del
modello RLI non hanno nemmeno rettangoli bianchi da riconoscere: il modulo e'
disegnato con centinaia di linee. Le caselle sono percio' definite qui in modo
esplicito, sezione per sezione, a partire dalle coordinate della griglia: per
ogni tabella si indicano le ordinate delle righe e le ascisse delle colonne, e
le celle vengono generate in ciclo.

Tre particolarita' comuni a tutti questi moduli:

1. Il modulo va consegnato in piu' copie identiche (banca, contribuente, ente).
   Ogni casella diventa quindi UN campo con piu' riquadri, uno per copia: si
   scrive il valore una volta e compare su tutte le copie, come sulla carta
   carbone. Nell'ordinario e nell'elide le copie sono pagine distinte; nel
   semplificato stanno sullo stesso foglio, una sotto l'altra.

2. Gli importi hanno la virgola gia' stampata, con due caselline per i
   centesimi. Ogni importo genera percio' due campi, "<nome>" per gli euro e
   "<nome>_cent" per i centesimi. Gli euro sono allineati a destra, cosi' le
   cifre si appoggiano alla virgola come si scriverebbero a penna.

3. Molte caselle sono "a pettine": il modulo stampa i divisori fra un carattere
   e il successivo. Per farci coincidere il testo si usa il flag /Comb con la
   lunghezza massima pari al numero di caselline.

Produce un file "-compilabile.pdf" per ogni variante trattata.

Uso:  python scripts/prepara-moduli-versamento.py           (tutti i moduli)
      python scripts/prepara-moduli-versamento.py elide     (uno solo)
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

ALTEZZA_RIGA = 10.5      # altezza utile della casella sopra la linea di base
FLAG_PETTINE = 1 << 24
A_SINISTRA, A_DESTRA = 0, 2
MARGINE_VIRGOLA = 2.0    # spazio fra l'ultima cifra degli euro e la virgola stampata
CORPO_IMPORTI = 8        # corpo fisso degli euro, per pareggiare le caselline dei centesimi


# --------------------------------------------------------- forme delle colonne
# Ogni colonna e' (nome, x0, x1, forma), dove forma vale:
#   None        casella libera
#   n (intero)  casella a pettine con n caselline
#   "importo"   importo con virgola: diventa due campi, euro e centesimi

def libera(nome, x0, x1):
    return (nome, x0, x1, None)


def pettine(nome, x0, x1, caselline):
    return (nome, x0, x1, caselline)


def importo(nome, x0, x1):
    return (nome, x0, x1, "importo")


# ------------------------------------------------------------- F24 ordinario
# Tre pagine identiche. Le caselline dei centesimi sono larghe 7,1 punti.

SEZIONI_ORDINARIO = [
    {
        "id": "erario",
        "righe": [589.9, 577.9, 565.9, 553.9, 541.9, 529.9],
        "colonne": [
            libera("tributo", 156.5, 214.3),
            libera("rateazione", 221.4, 264.6),
            libera("anno", 271.8, 315.0),
            importo("debito", 322.2, 401.3),
            importo("credito", 408.5, 487.7),
        ],
    },
    {
        "id": "inps",
        "righe": [481.6, 469.6, 457.6, 445.4],
        "colonne": [
            libera("sede", 19.9, 48.6),
            libera("causale", 55.8, 84.6),
            libera("matricola", 91.8, 212.3),
            libera("periodo_da", 221.2, 264.6),
            libera("periodo_a", 271.8, 315.2),
            importo("debito", 322.2, 401.3),
            importo("credito", 408.6, 487.7),
        ],
    },
    {
        "id": "regioni",
        "righe": [397.9, 385.9, 373.9, 361.9],
        "colonne": [
            pettine("regione", 19.8, 48.5, 2),
            libera("tributo", 156.6, 214.3),
            libera("rateazione", 221.5, 264.5),
            libera("anno", 271.8, 314.9),
            importo("debito", 322.2, 401.3),
            importo("credito", 408.6, 487.7),
        ],
    },
    {
        "id": "imu",
        "righe": [313.9, 301.9, 289.9, 277.9],
        "colonne": [
            pettine("ente", 20.3, 63.5, 4),
            pettine("ravv", 73.6, 83.0, 1),
            pettine("immob_variati", 87.6, 97.0, 1),
            pettine("acconto", 102.0, 111.4, 1),
            pettine("saldo", 116.1, 125.4, 1),
            libera("num_immobili", 131.1, 145.5),
            libera("tributo", 156.3, 213.6),
            libera("rateazione", 221.1, 264.3),
            libera("anno", 271.5, 314.7),
            importo("debito", 322.2, 401.3),
            importo("credito", 408.4, 487.7),
        ],
    },
    {
        "id": "inail",
        "righe": [229.9, 217.9, 205.9],
        "colonne": [
            libera("sede", 98.9, 134.7),
            libera("ditta", 142.1, 199.7),
            libera("cc", 207.0, 221.6),
            libera("num_riferimento", 235.8, 279.2),
            libera("causale", 286.2, 300.5),
            importo("debito", 322.2, 401.3),
            importo("credito", 408.4, 487.7),
        ],
    },
    {
        "id": "altri_enti",
        "righe": [169.9, 157.9],
        # La prima colonna, "codice ente", e' disegnata a pettine e non come
        # casella bordata: non compare fra le linee orizzontali della griglia.
        "colonne": [
            pettine("ente", 19.8, 63.0, 4),
            libera("sede", 63.0, 99.1),
            libera("causale", 106.2, 135.2),
            libera("posizione", 142.3, 214.2),
            libera("periodo_da", 221.5, 264.6),
            libera("periodo_a", 271.7, 315.0),
            importo("debito", 322.2, 401.3),
            importo("credito", 408.6, 487.7),
        ],
    },
]

# Righe dei totali. Stanno sempre 12 punti sotto l'ultima riga di dati della
# sezione: sono quelle che portano "TOTALE <lettera>", il secondo importo e il
# saldo di sezione. Le lettere seguono l'ordine stampato sul modulo.
_TOTALI_ORDINARIO = [
    ("erario", 517.4, "a", "b"), ("inps", 433.4, "c", "d"),
    ("regioni", 349.9, "e", "f"), ("imu", 265.9, "g", "h"),
    ("inail", 193.9, "i", "l"), ("altri_enti", 145.9, "m", "n"),
]
TOTALI_ORDINARIO = [
    (sez, y, [importo(f"totale_{primo}", 322.2, 401.3),
              importo(f"totale_{secondo}", 408.6, 487.7),
              importo("saldo", 495.2, 574.1)])
    for sez, y, primo, secondo in _TOTALI_ORDINARIO
]

# Caselle isolate: (nome, x0, y0, x1, y1, forma) con un settimo elemento
# facoltativo, gli indici delle copie su cui la casella esiste davvero.
SINGOLE_ORDINARIO = [
    # intestazione
    ("delega_a", 336.1, 771.4, 574.2, 783.4, None),
    ("agenzia", 336.1, 747.0, 490.0, 759.0, None),
    ("provincia_agenzia", 528.0, 747.0, 574.2, 759.0, None),

    # contribuente
    ("cf_contribuente", 113.4, 719.3, 343.8, 736.3, 16),
    ("anno_imposta_non_solare", 552.6, 719.3, 566.6, 733.3, 1),
    ("cognome_denominazione", 113.4, 700.3, 401.0, 716.3, None),
    ("nome", 408.0, 700.3, 574.2, 716.3, None),
    ("data_nascita_giorno", 113.4, 671.3, 142.2, 688.3, 2),
    ("data_nascita_mese", 142.2, 671.3, 171.0, 688.3, 2),
    ("data_nascita_anno", 171.0, 671.3, 228.6, 688.3, 4),
    ("sesso", 243.1, 671.3, 257.5, 688.3, 1),
    ("comune_nascita", 271.0, 671.3, 538.0, 688.3, None),
    ("provincia_nascita", 538.0, 671.3, 566.8, 688.3, 2),
    ("domicilio_comune", 113.4, 647.3, 327.0, 664.3, None),
    ("domicilio_provincia", 329.4, 647.3, 358.2, 664.3, 2),
    ("domicilio_via", 365.0, 647.3, 574.2, 664.3, None),
    ("cf_coobbligato", 185.4, 623.3, 415.8, 640.3, 16),
    ("codice_identificativo_coobbligato", 538.0, 623.3, 566.8, 640.3, 2),

    # estremi della sezione erario
    ("erario_codice_ufficio", 19.8, 517.4, 63.0, 529.4, 3),
    ("erario_codice_atto", 77.4, 517.4, 236.3, 529.4, 11),

    # IMU: identificativo operazione e detrazione
    ("imu_identificativo_operazione", 314.9, 337.9, 574.1, 347.9, 18),
    ("imu_detrazione", 73.6, 265.9, 152.7, 276.4, "importo"),

    # saldo finale e firma
    ("saldo_finale", 495.2, 121.9, 574.1, 132.4, "importo"),
    ("firma", 43.0, 114.9, 314.0, 131.9, None),

    # L'autorizzazione all'addebito e' stampata solo sulla prima copia, quella
    # per la banca. Le prime due lettere "IT" sono gia' sul modulo: restano 25
    # caselline per numero di controllo, CIN, ABI, CAB e numero di conto.
    ("iban", 137.1, 27.9, 317.0, 38.4, 25, (0,)),
]


# ---------------------------------------------------------------- F24 elide
# Tre pagine identiche. Una sola tabella lunga 28 righe: tipo, elementi
# identificativi, codice, anno e importo a debito. Non ci sono crediti da
# compensare ne' totali di sezione. Caselline dei centesimi larghe 7,8 punti.
SEZIONI_ELIDE = [
    {
        "id": "erario",
        "righe": [517.9 - 12 * i for i in range(28)],
        "colonne": [
            pettine("tipo", 32.5, 46.9, 1),
            pettine("elementi", 57.7, 302.5, 17),
            pettine("codice", 309.7, 352.9, 4),
            pettine("anno", 360.1, 403.3, 4),
            importo("debito", 410.5, 575.9),
        ],
    },
]

TOTALI_ELIDE = []

SINGOLE_ELIDE = [
    ("delega_a", 337.9, 771.9, 576.1, 783.9, None),
    ("agenzia", 337.9, 747.0, 490.0, 759.0, None),
    ("provincia_agenzia", 528.0, 747.0, 576.1, 759.0, None),

    ("cf_contribuente", 115.4, 722.2, 345.8, 734.2, 16),
    ("cognome_denominazione", 115.4, 698.1, 410.6, 710.1, None),
    ("nome", 417.8, 698.2, 569.0, 710.2, None),
    ("data_nascita_giorno", 115.4, 674.2, 144.2, 686.2, 2),
    ("data_nascita_mese", 144.2, 674.2, 173.0, 686.2, 2),
    ("data_nascita_anno", 173.0, 674.2, 230.6, 686.2, 4),
    ("sesso", 245.1, 674.2, 259.5, 686.2, 1),
    ("comune_nascita", 273.8, 674.2, 532.1, 686.2, None),
    ("provincia_nascita", 540.0, 674.2, 568.8, 686.2, 2),
    ("domicilio_comune", 115.4, 650.2, 327.0, 662.2, None),
    ("domicilio_provincia", 331.4, 650.2, 360.2, 662.2, 2),
    ("domicilio_via", 367.4, 650.2, 569.0, 662.2, None),
    ("cf_coobbligato", 187.4, 626.2, 417.8, 638.2, 16),
    ("codice_identificativo_coobbligato", 540.0, 626.2, 568.8, 638.2, 2),

    ("erario_codice_ufficio", 32.1, 565.6, 75.3, 577.6, 3),
    ("erario_codice_atto", 87.2, 565.6, 246.1, 577.6, 11),

    ("saldo_finale", 496.8, 133.9, 575.9, 144.4, "importo"),
    ("firma", 45.0, 126.9, 316.0, 143.9, None),
]


# ------------------------------------------------------------ F24 semplificato
# Un solo foglio con DUE copie sovrapposte, sfalsate di 408 punti. Una sola
# tabella di 10 righe che tiene insieme erario, regioni ed enti locali.
# Caselline dei centesimi larghe 7,0 punti.
SEZIONI_SEMPLIFICATO = [
    {
        "id": "riga",
        "righe": [626.0 - 12 * i for i in range(10)],
        "colonne": [
            pettine("sezione", 30.8, 66.8, 2),
            libera("tributo", 77.4, 113.4),
            pettine("ente", 117.7, 160.9, 4),
            pettine("ravv", 167.6, 180.6, 1),
            pettine("immob_variati", 187.8, 200.6, 1),
            pettine("acconto", 207.6, 220.5, 1),
            pettine("saldo", 227.1, 240.1, 1),
            libera("num_immobili", 245.7, 263.7),
            libera("rateazione", 268.2, 304.2),
            libera("anno", 308.3, 344.3),
            importo("detrazione", 349.3, 399.5),
            importo("debito", 405.0, 484.0),
            importo("credito", 487.5, 566.7),
        ],
    },
]

TOTALI_SEMPLIFICATO = []

SINGOLE_SEMPLIFICATO = [
    ("delega_a", 337.6, 789.9, 573.2, 802.9, None),
    ("agenzia", 337.6, 771.9, 490.0, 784.9, None),
    ("provincia_agenzia", 528.0, 771.9, 573.2, 784.9, None),

    ("cf_contribuente", 113.3, 735.4, 343.7, 747.9, 16),
    ("codice_ufficio", 354.9, 734.3, 398.1, 744.3, 3),
    ("codice_atto", 408.1, 734.3, 567.0, 744.3, 11),
    ("cognome_denominazione", 113.4, 711.8, 408.6, 724.3, None),
    ("nome", 415.8, 711.8, 567.0, 724.3, None),
    ("data_nascita_giorno", 113.4, 687.9, 142.2, 700.4, 2),
    ("data_nascita_mese", 142.2, 687.9, 171.0, 700.4, 2),
    ("data_nascita_anno", 171.0, 687.9, 228.6, 700.4, 4),
    ("sesso", 242.9, 687.9, 257.3, 700.4, 1),
    ("comune_nascita", 271.8, 687.9, 530.0, 700.4, None),
    ("provincia_nascita", 538.0, 687.9, 566.8, 700.4, 2),
    ("cf_coobbligato", 185.4, 663.9, 415.8, 676.4, 16),
    ("codice_identificativo_coobbligato", 538.0, 663.9, 566.8, 676.4, 2),
    ("identificativo_operazione", 314.9, 651.9, 574.1, 661.4, 18),

    ("saldo_finale", 487.6, 505.9, 566.7, 516.4, "importo"),
    # Il riquadro della firma e' piu' stretto sulla copia della banca, che porta
    # a sinistra l'etichetta "FIRMA": si parte da dove finisce l'etichetta.
    ("firma", 76.0, 495.5, 262.0, 512.5, None),
    # Come nell'ordinario, l'IBAN sta solo sulla copia della banca. Le
    # coordinate di tutte le caselle sono quelle della copia in alto: lo
    # scostamento della seconda copia viene aggiunto dopo.
    ("iban", 386.8, 494.0, 567.0, 504.5, 25, (1,)),
]



# ---------------------------------------------------------------- F24 accise
# Tre pagine identiche. E' l'ordinario con una sezione in piu', quella delle
# accise e dei monopoli, che non ammette compensazioni e ha quindi la sola
# colonna dei debiti. Manca invece la sezione INAIL e quella degli altri enti.
# Caselline dei centesimi larghe 7,1 punti.
SEZIONI_ACCISE = [
    {
        "id": "erario",
        "righe": [590.9, 578.9, 566.9, 554.9, 542.9, 530.9],
        "colonne": [
            libera("tributo", 156.6, 214.3),
            libera("rateazione", 221.5, 264.7),
            libera("anno", 271.9, 315.1),
            importo("debito", 322.2, 401.3),
            importo("credito", 408.6, 487.7),
        ],
    },
    {
        "id": "inps",
        "righe": [482.6, 470.6, 458.6, 446.4],
        "colonne": [
            libera("sede", 20.0, 48.6),
            libera("causale", 55.9, 84.6),
            libera("matricola", 91.9, 212.3),
            libera("periodo_da", 221.2, 264.7),
            libera("periodo_a", 271.8, 315.3),
            importo("debito", 322.3, 401.3),
            importo("credito", 408.7, 487.7),
        ],
    },
    {
        "id": "regioni",
        "righe": [398.9, 386.9, 374.9, 362.9],
        "colonne": [
            pettine("regione", 19.9, 48.5, 2),
            libera("tributo", 156.6, 214.3),
            libera("rateazione", 221.6, 264.6),
            libera("anno", 271.9, 314.9),
            importo("debito", 322.2, 401.3),
            importo("credito", 408.6, 487.7),
        ],
    },
    {
        "id": "imu",
        "righe": [314.9, 302.9, 290.9, 278.9],
        "colonne": [
            pettine("ente", 20.3, 63.5, 4),
            pettine("ravv", 73.5, 83.1, 1),
            pettine("immob_variati", 87.5, 97.4, 1),
            pettine("acconto", 101.9, 111.1, 1),
            pettine("saldo", 116.0, 125.5, 1),
            libera("num_immobili", 131.3, 145.3),
            libera("tributo", 156.4, 213.6),
            libera("rateazione", 221.2, 264.4),
            libera("anno", 271.6, 314.8),
            importo("debito", 322.2, 401.3),
            importo("credito", 408.5, 487.7),
        ],
    },
    {
        "id": "accise",
        "righe": [230.9, 218.9, 206.9, 194.9, 182.9, 170.9, 158.9],
        # "ente" e "prov." stanno dentro lo stesso riquadro, diviso a meta' da
        # una linea alta quanto tutta la sezione.
        "colonne": [
            pettine("ente", 20.7, 42.4, 2),
            pettine("prov", 42.4, 63.7, 2),
            libera("tributo", 68.4, 111.8),
            libera("identificativo", 115.4, 197.7),
            libera("rateazione", 202.2, 245.2),
            pettine("mese", 252.0, 266.6, 2),
            libera("anno", 271.9, 315.1),
            importo("debito", 322.2, 401.3),
        ],
    },
]

_TOTALI_ACCISE = [
    ("erario", 518.9, "a", "b"), ("inps", 434.6, "c", "d"),
    ("regioni", 350.9, "e", "f"), ("imu", 266.4, "g", "h"),
]
TOTALI_ACCISE = [
    (sez, y, [importo(f"totale_{primo}", 322.3, 401.3),
              importo(f"totale_{secondo}", 408.7, 487.7),
              importo("saldo", 495.0, 574.2)])
    for sez, y, primo, secondo in _TOTALI_ACCISE
] + [
    # la sezione accise non ha crediti: un totale solo e il suo saldo
    ("accise", 146.9, [importo("totale_o", 322.2, 401.3),
                       importo("saldo", 495.0, 574.2)]),
]

SINGOLE_ACCISE = [
    ("delega_a", 336.6, 783.0, 574.2, 795.0, None),
    ("agenzia", 336.6, 759.5, 490.0, 771.5, None),
    ("provincia_agenzia", 528.0, 759.5, 574.2, 771.5, None),

    ("cf_contribuente", 113.4, 722.9, 343.8, 737.3, 16),
    ("anno_imposta_non_solare", 552.7, 722.9, 567.1, 734.9, 1),
    ("cognome_denominazione", 113.5, 699.3, 408.7, 713.3, None),
    ("nome", 415.9, 699.3, 567.1, 713.3, None),
    ("data_nascita_giorno", 113.5, 674.9, 142.3, 689.3, 2),
    ("data_nascita_mese", 142.3, 674.9, 171.1, 689.3, 2),
    ("data_nascita_anno", 171.1, 674.9, 228.7, 689.3, 4),
    ("sesso", 243.0, 674.9, 257.4, 689.3, 1),
    ("comune_nascita", 271.9, 674.9, 530.1, 689.3, None),
    ("provincia_nascita", 538.1, 674.9, 566.9, 689.3, 2),
    ("domicilio_comune", 113.5, 650.9, 322.3, 665.3, None),
    ("domicilio_provincia", 329.5, 650.9, 358.3, 665.3, 2),
    ("domicilio_via", 365.5, 650.9, 567.1, 665.3, None),
    ("cf_coobbligato", 185.5, 626.9, 415.9, 641.3, 16),
    ("codice_identificativo_coobbligato", 538.1, 626.9, 566.9, 641.3, 2),

    ("erario_codice_ufficio", 19.9, 518.9, 63.1, 530.2, 3),
    ("erario_codice_atto", 79.3, 518.9, 238.2, 530.2, 11),

    ("imu_identificativo_operazione", 315.0, 339.4, 573.9, 349.3, 18),
    ("imu_detrazione", 73.7, 266.4, 152.9, 276.9, "importo"),

    ("accise_codice_ufficio", 46.8, 146.9, 90.0, 158.2, 3),
    ("accise_codice_atto", 115.2, 146.9, 273.6, 158.2, 11),

    ("saldo_finale", 495.0, 122.9, 574.2, 133.4, "importo"),
    ("firma", 48.0, 115.9, 314.0, 132.9, None),
    ("iban", 137.1, 27.9, 317.0, 38.4, 25, (0,)),
]



# ---------------------------------------------------------------------- F23
# Tre pagine identiche. Il modello per tasse, imposte, sanzioni e altre entrate
# che non passano dal F24: imposta di registro sugli atti giudiziari, sanzioni,
# contributi. La tabella ha otto righe alte 24 punti e un totale in fondo.
# Caselline dei centesimi larghe 7,05 punti.
ALTEZZA_RIGA_F23 = 12.0

SEZIONI_F23 = [
    {
        "id": "tributo",
        "righe": [407.2 - 24 * i for i in range(8)],
        "colonne": [
            pettine("codice", 33.7, 90.8, 4),
            libera("descrizione", 112.9, 321.2),
            importo("importo", 343.3, 494.0),
            pettine("destinatario", 516.1, 573.2, 4),
        ],
    },
]

TOTALI_F23 = [
    ("totale", 215.2, [importo("complessivo", 343.3, 494.0)]),
]

SINGOLE_F23 = [
    # intestazione: o si versa direttamente al concessionario, oppure si delega
    ("versamento_diretto_a", 280.0, 769.0, 571.0, 783.0, None),
    ("delega_a", 280.0, 733.0, 571.0, 747.0, None),
    ("agenzia_ufficio", 316.0, 709.0, 500.0, 723.0, None),
    ("provincia_agenzia", 534.0, 709.0, 571.0, 723.0, None),
    ("numero_riferimento", 328.9, 673.0, 573.2, 687.0, 17),

    # 4. chi versa
    ("contribuente_cognome", 40.9, 613.0, 306.6, 627.0, None),
    ("contribuente_nome", 306.6, 613.0, 458.0, 627.0, None),
    ("contribuente_nascita_giorno", 459.3, 613.0, 487.1, 627.0, 2),
    ("contribuente_nascita_mese", 487.1, 613.0, 515.9, 627.0, 2),
    ("contribuente_nascita_anno", 515.9, 613.0, 573.4, 627.0, 4),
    ("contribuente_sesso", 48.1, 589.0, 62.0, 603.0, 1),
    ("contribuente_comune_nascita", 105.7, 589.0, 285.2, 603.0, None),
    ("contribuente_provincia_nascita", 300.1, 589.0, 328.4, 603.0, 2),
    ("contribuente_cf", 343.3, 589.0, 573.2, 603.0, 16),

    # 5. controparte
    ("controparte_cognome", 40.9, 553.0, 307.1, 567.0, None),
    ("controparte_nome", 307.1, 553.0, 458.0, 567.0, None),
    ("controparte_nascita_giorno", 459.3, 553.0, 487.1, 567.0, 2),
    ("controparte_nascita_mese", 487.1, 553.0, 515.9, 567.0, 2),
    ("controparte_nascita_anno", 515.9, 553.0, 573.4, 567.0, 4),
    ("controparte_sesso", 48.1, 529.0, 62.0, 543.0, 1),
    ("controparte_comune_nascita", 105.7, 529.0, 285.2, 543.0, None),
    ("controparte_provincia_nascita", 300.1, 529.0, 328.4, 543.0, 2),
    ("controparte_cf", 343.3, 529.0, 573.2, 543.0, 16),

    # dati del versamento
    ("ufficio_codice", 40.9, 457.0, 83.6, 471.0, 3),
    ("ufficio_sub_codice", 91.2, 457.0, 119.5, 471.0, 2),
    ("codice_territoriale", 134.6, 457.0, 191.7, 471.0, 4),
    ("contenzioso", 220.9, 457.0, 234.8, 471.0, 1),
    ("causale", 264.1, 457.0, 292.4, 471.0, 2),
    ("atto_anno", 300.1, 457.0, 357.5, 471.0, 4),
    ("atto_numero", 357.5, 457.0, 573.2, 471.0, 15),

    # chiusura
    ("importo_in_lettere", 36.0, 183.0, 571.0, 199.0, None),
    ("firma", 348.0, 128.0, 568.0, 146.0, None),
    ("addebito_conto", 66.0, 60.0, 150.5, 72.0, None),
    ("addebito_abi", 166.0, 60.0, 214.0, 72.0, None),
    ("addebito_cab", 220.0, 60.0, 283.7, 72.0, None),
    ("addebito_firma", 71.0, 35.6, 284.7, 47.6, None),
]


# nome breve -> definizione del modulo
MODELLI = {
    "ordinario": {
        "file": "modello-f24-ordinario",
        "sezioni": SEZIONI_ORDINARIO, "totali": TOTALI_ORDINARIO,
        "singole": SINGOLE_ORDINARIO, "passo_cent": 7.1, "copie": None,
    },
    "elide": {
        "file": "modello-f24-elide",
        "sezioni": SEZIONI_ELIDE, "totali": TOTALI_ELIDE,
        "singole": SINGOLE_ELIDE, "passo_cent": 7.8, "copie": None,
    },
    "accise": {
        "file": "modello-f24-accise",
        "sezioni": SEZIONI_ACCISE, "totali": TOTALI_ACCISE,
        "singole": SINGOLE_ACCISE, "passo_cent": 7.1, "copie": None,
    },
    "f23": {
        "file": "modello-f23",
        "sezioni": SEZIONI_F23, "totali": TOTALI_F23,
        "singole": SINGOLE_F23, "passo_cent": 7.05, "copie": None,
        "altezza_riga": ALTEZZA_RIGA_F23,
    },
    "semplificato": {
        "file": "modello-f24-semplificato",
        "sezioni": SEZIONI_SEMPLIFICATO, "totali": TOTALI_SEMPLIFICATO,
        "singole": SINGOLE_SEMPLIFICATO, "passo_cent": 7.0,
        # due copie sullo stesso foglio: (indice di pagina, scostamento in y)
        "copie": [(0, 0.0), (0, -408.0)],
    },
}


# ------------------------------------------------------------------ creazione

def campo_testo(writer, nome, rect, caratteri=None, allineamento=A_SINISTRA, corpo=0):
    # corpo 0 vuol dire "adatta da solo": va bene per i testi liberi, che possono
    # essere lunghi. Gli importi hanno invece un corpo fisso, altrimenti le cifre
    # degli euro risultano piu' piccole di quelle dei centesimi a pettine.
    campo = DictionaryObject()
    campo[NameObject("/FT")] = NameObject("/Tx")
    campo[NameObject("/T")] = TextStringObject(nome)
    campo[NameObject("/Ff")] = NumberObject(FLAG_PETTINE if caratteri else 0)
    campo[NameObject("/DA")] = TextStringObject(f"/Helv {corpo} Tf 0 g")
    if caratteri:
        campo[NameObject("/MaxLen")] = NumberObject(caratteri)
    campo[NameObject("/Q")] = NumberObject(allineamento)
    campo[NameObject("/Kids")] = ArrayObject()
    return writer._add_object(campo)


def widget(writer, riferimento_campo, rect):
    x0, y0, x1, y1 = rect
    w = DictionaryObject()
    w[NameObject("/Type")] = NameObject("/Annot")
    w[NameObject("/Subtype")] = NameObject("/Widget")
    w[NameObject("/F")] = NumberObject(4)
    w[NameObject("/Rect")] = ArrayObject([FloatObject(v) for v in (x0, y0, x1, y1)])
    w[NameObject("/Parent")] = riferimento_campo
    return writer._add_object(w)


def spezza_importo(nome, x0, y0, x1, y1, passo, copie=None):
    """Un importo diventa due campi: euro a destra e centesimi a pettine."""
    taglio = x1 - 2 * passo
    yield nome, (x0, y0, taglio - MARGINE_VIRGOLA, y1), None, A_DESTRA, copie, CORPO_IMPORTI
    yield nome + "_cent", (taglio, y0, x1, y1), 2, A_SINISTRA, copie, 0


def celle_del_modello(sezioni, totali, singole, passo, altezza=ALTEZZA_RIGA):
    """Genera (nome, rect, caratteri, allineamento, copie, corpo) per ogni casella."""
    for sez in sezioni:
        for indice, y in enumerate(sez["righe"], start=1):
            for nome_col, x0, x1, forma in sez["colonne"]:
                base = f"{sez['id']}_{indice}_{nome_col}"
                if forma == "importo":
                    yield from spezza_importo(base, x0, y, x1, y + altezza, passo)
                else:
                    yield base, (x0, y, x1, y + altezza), forma, A_SINISTRA, None, 0

    for sez_id, y, colonne in totali:
        for nome_col, x0, x1, forma in colonne:
            base = f"{sez_id}_{nome_col}"
            if forma == "importo":
                yield from spezza_importo(base, x0, y, x1, y + altezza, passo)
            else:
                yield base, (x0, y, x1, y + altezza), forma, A_SINISTRA, None, 0

    for voce in singole:
        nome, x0, y0, x1, y1, forma = voce[:6]
        copie = voce[6] if len(voce) > 6 else None
        if forma == "importo":
            yield from spezza_importo(nome, x0, y0, x1, y1, passo, copie)
        else:
            yield nome, (x0, y0, x1, y1), forma, A_SINISTRA, copie, 0


def prepara(nome_breve) -> int:
    definizione = MODELLI[nome_breve]
    sorgente = PDF_DIR / f"{definizione['file']}-ufficiale.pdf"
    destinazione = PDF_DIR / f"{definizione['file']}-compilabile.pdf"
    if not sorgente.exists():
        print(f"Manca {sorgente}: esegui prima scripts/scarica-modelli-ufficiali.py")
        return 1

    reader = PdfReader(str(sorgente))
    writer = PdfWriter(clone_from=reader)
    pagine = list(writer.pages)
    copie = definizione["copie"] or [(i, 0.0) for i in range(len(pagine))]

    campi, per_pagina = [], {i: [] for i in range(len(pagine))}
    visti = set()

    celle = celle_del_modello(definizione["sezioni"], definizione["totali"],
                              definizione["singole"], definizione["passo_cent"],
                              definizione.get("altezza_riga", ALTEZZA_RIGA))
    for nome, rect, caratteri, allineamento, solo_copie, corpo in celle:
        if nome in visti:
            print(f"  nome ripetuto: {nome}")
            return 1
        visti.add(nome)
        riferimento = campo_testo(writer, nome, rect, caratteri, allineamento, corpo)
        kids = riferimento.get_object()[NameObject("/Kids")]
        # lo stesso campo compare su tutte le copie del modulo
        for numero, (indice_pagina, scostamento) in enumerate(copie):
            if solo_copie is not None and numero not in solo_copie:
                continue
            rett = (rect[0], rect[1] + scostamento, rect[2], rect[3] + scostamento)
            rif_widget = widget(writer, riferimento, rett)
            kids.append(rif_widget)
            per_pagina[indice_pagina].append(rif_widget)
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

    with open(destinazione, "wb") as f:
        writer.write(f)

    riquadri = sum(len(v) for v in per_pagina.values())
    print(f"{destinazione.name}: {len(campi)} campi, "
          f"{riquadri} riquadri su {len(copie)} copie")
    return 0


def main(argomenti) -> int:
    richiesti = argomenti or list(MODELLI)
    sconosciuti = [a for a in richiesti if a not in MODELLI]
    if sconosciuti:
        print(f"Varianti sconosciute: {sconosciuti}. Disponibili: {list(MODELLI)}")
        return 1
    return max(prepara(a) for a in richiesti)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
