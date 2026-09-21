#!/usr/bin/env python3
"""Scarica da agenziaentrate.gov.it i modelli ufficiali e le relative istruzioni.

Tiene traccia, in un unico posto, di quale versione di ogni modello sta usando il
sito: i modelli dell'Agenzia vengono aggiornati e un modulo scaduto e' un modulo
che l'ufficio scarta. Rilanciando lo script si riscaricano i file e si vede subito,
dalla dimensione, se qualcosa e' cambiato.

Le pagine di riferimento sono elencate accanto a ogni voce: se un link diretto
smette di funzionare, e' da li' che si recupera quello nuovo.

Uso:  python scripts/scarica-modelli-ufficiali.py
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "assets" / "pdf"
BASE = "https://www.agenziaentrate.gov.it/portale/"

# nome locale -> (percorso del documento, pagina ufficiale di riferimento)
MODELLI = {
    # --- RLI: modello e istruzioni aggiornati al 20 ottobre 2025 -------------
    "modello-rli-ufficiale.pdf": (
        "documents/20143/9390371/RLI_modello.pdf/0a161bc4-3dab-04d5-08fe-ef0e8c3cd9cf?t=1760958301757",
        "schede/fabbricatiterreni/registrazione-di-un-nuovo-contratto/modello_istruzioni-regime-ordinario",
    ),
    "istruzioni-rli.pdf": (
        "documents/20143/9390371/RLI_istruzioni.pdf/9e4a3f27-43bd-9f5d-e3a8-92a5a14fab72?t=1760546481878",
        "schede/fabbricatiterreni/registrazione-di-un-nuovo-contratto/modello_istruzioni-regime-ordinario",
    ),

    # --- F24 ordinario -------------------------------------------------------
    "modello-f24-ordinario-ufficiale.pdf": (
        "documents/20143/250689/Modello+di+versamento+unificato+-+F24+Ordinario_i+Modello+F24+%282%29.pdf/b773b043-a490-82de-550a-eda75246efa0?t=1372409604419",
        "schede/pagamenti/f24/modello-e-istruzioni-f24",
    ),
    "istruzioni-f24-ordinario.pdf": (
        "documents/20143/250689/Avvertenze+per+la+compilazione+del+modello_Avvertenze+modello+F24.pdf/fa5458b1-c37b-23db-a395-a730fe393fc5?t=1372434682515",
        "schede/pagamenti/f24/modello-e-istruzioni-f24",
    ),

    # --- F24 semplificato ----------------------------------------------------
    "modello-f24-semplificato-ufficiale.pdf": (
        "documents/20143/251039/Modello+F24+Semplificato+nuovo_F24+semplificato_mod.pdf/d9a07dd2-cb18-36b6-ecee-b648087604a6?t=1372415501789",
        "schede/pagamenti/f24-semplificato/modello-e-istruzioni-f24-semplificato",
    ),
    "istruzioni-f24-semplificato.pdf": (
        "documents/20143/251039/Avvertenze+F24+Semplificato+nuovo_avvertenze+f24+semplificato.pdf/ed86f682-9fb1-1fc2-d778-e191d1c58bfb?t=1372415587655",
        "schede/pagamenti/f24-semplificato/modello-e-istruzioni-f24-semplificato",
    ),

    # --- F24 elementi identificativi (Elide) ---------------------------------
    "modello-f24-elide-ufficiale.pdf": (
        "documents/20143/251856/Modello+F24+identificativi+nuovo_Modello+F24+elementi+identif.pdf/0f618835-9fe0-7c8e-47a3-3bec74b8571d?t=1318491835426",
        "schede/pagamenti/f24-elementi-identificativi-f24elide/modello-e-istruzioni-f24elide",
    ),
    "istruzioni-f24-elide.pdf": (
        "documents/20143/251856/Avvertenze+per+la+compilazione+F24+identificativi+nuovo_Avvertenze+F24+elementi+identif.pdf/8456bfe1-e694-4bf1-f437-f4fc2812c2ca?t=1328033714958",
        "schede/pagamenti/f24-elementi-identificativi-f24elide/modello-e-istruzioni-f24elide",
    ),

    # --- F24 accise ----------------------------------------------------------
    "modello-f24-accise-ufficiale.pdf": (
        "documents/20143/251540/Modello+F24+Accise+nuovo_Modello+F24+accise.pdf/5408f260-4c38-d72f-5aeb-64d177e24844?t=1372413037711",
        "schede/pagamenti/f24-accise/modello-f24-accise-2012",
    ),
    "istruzioni-f24-accise.pdf": (
        "documents/20143/251540/Avvertenze+per+la+compilazione+del+modello+F24accise_avvertenze+f24+accise.pdf/5130a7d6-ee37-3bb5-2eb1-e467beafbb73?t=1372413114163",
        "schede/pagamenti/f24-accise/modello-f24-accise-2012",
    ),

    # --- F23 -----------------------------------------------------------------
    "modello-f23-ufficiale.pdf": (
        "documents/20143/250258/Modello+f23_nuovof23c.pdf/fbd03214-6929-7d39-f559-be891255e833?t=1310657517075",
        "schede/pagamenti/f23/modello+f23",
    ),
    "istruzioni-f23.pdf": (
        "documents/20143/250258/Istruzioni+Modello+f23_istrf23c.pdf/f0103176-5e14-afca-9378-992877f0c2dc?t=1310657813904",
        "schede/pagamenti/f23/modello+f23",
    ),

    # --- AA4/8: codice fiscale e tessera sanitaria per le persone fisiche ----
    # L'Agenzia pubblica gia' una versione con i campi modulo: si usa quella,
    # cosi' non serve ricostruire la geometria come per i modelli di versamento.
    "modello-aa4-8-ufficiale.pdf": (
        "documents/20143/278893/modello+editabile+AA4_8_AA4-8+ita_giugno.pdf/2094fd47-b6ec-f19e-dace-f49eb1ba07a8?t=1749733351614",
        "codice-fiscale-e-tessera-sanitaria/modello-e-istruzioni",
    ),
    "istruzioni-aa4-8.pdf": (
        "documents/20143/278893/istruzioni+cf+AA48_istruzioni+modello+AA4+8.pdf/1c62b06c-535a-5b59-c8e0-4a329a5b4668?t=1372163197137",
        "codice-fiscale-e-tessera-sanitaria/modello-e-istruzioni",
    ),

    # --- AA5/6: codice fiscale per enti, associazioni e condomini ----------
    # La versione editabile e' cifrata con AES: si tiene anche quella piatta,
    # da cui si ricostruisce la geometria come per i modelli di versamento.
    "modello-aa5-6-ufficiale.pdf": (
        "documents/20143/278453/Modello+AA5_6_AA5_mod_giugno.pdf/eab48915-6538-18c1-7c19-2cdb1aa7081b?t=1779097518533",
        "schede/istanze/codice-fiscale-modello-aa5_6/modello-e-istruzioni-cf-aa5_6",
    ),
    "modello-aa5-6-editabile.pdf": (
        "documents/20143/278453/Modello+editabile+AA5_6_AA5_italiano_giugno.pdf/8a059682-3f73-9caa-5e09-460b5ab76027?t=1779097638520",
        "schede/istanze/codice-fiscale-modello-aa5_6/modello-e-istruzioni-cf-aa5_6",
    ),
    "istruzioni-aa5-6.pdf": (
        "documents/20143/9459643/AA5_istruzioni_2025.pdf/1e018876-fbd9-2f3c-2648-e46869bcef44?t=1763405985986",
        "schede/istanze/codice-fiscale-modello-aa5_6/modello-e-istruzioni-cf-aa5_6",
    ),

    # --- Modello 69: registrazione atti e adempimenti successivi -----------
    "modello-69-ufficiale.pdf": (
        "documents/20143/256138/Modello+69+contratto+locazione_modello+69_mod.pdf/2aef9fa6-7c02-577c-fd9e-452595f6946b?t=1397562942298",
        "schede/pagamenti/registrazione-atti/modelli-e-istruzioni-registrazione-atti",
    ),
    "istruzioni-69.pdf": (
        "documents/20143/256138/Modello+69+Istruzioni_modello_69_istruzioni_colore.pdf/ec1a48e8-7dd1-ef6a-84d1-2280683e7ecf?t=1440506356036",
        "schede/pagamenti/registrazione-atti/modelli-e-istruzioni-registrazione-atti",
    ),

    # --- Modello RAP: registrazione degli atti privati ---------------------
    "modello-rap-ufficiale.pdf": (
        "documents/20143/256138/RAP_mod+19032026.pdf/e2904086-ee81-ffea-fc3a-af13aed07ea2?t=1773931488536",
        "schede/pagamenti/registrazione-atti/modelli-e-istruzioni-registrazione-atti",
    ),
    "istruzioni-rap.pdf": (
        "documents/20143/256138/RAP_COM_PRE_UT_istr.pdf/90106fee-b68e-8de1-2625-6a696a9f520b?t=1743590209738",
        "schede/pagamenti/registrazione-atti/modelli-e-istruzioni-registrazione-atti",
    ),

    # --- Accreditamento dei rimborsi fiscali su conto corrente (persone fisiche)
    "modello-accredito-rimborsi-ufficiale.pdf": (
        "documents/20143/293180/Rich_accred-PF+2025.pdf/8c2b7c9e-5763-20bb-756e-aa29832807d6?t=1764935505336",
        "schede/rimborsi/accredito-rimborsi-su-conto-corrente-accrimbcc/modello-e-istruzioni-accrimbcc",
    ),
}


def scarica(nome: str, percorso: str) -> int:
    destinazione = PDF_DIR / nome
    prima = destinazione.stat().st_size if destinazione.exists() else 0
    richiesta = urllib.request.Request(
        BASE + percorso,
        headers={"User-Agent": "Mozilla/5.0 (StrumentiUtili.it aggiornamento modelli)"},
    )
    with urllib.request.urlopen(richiesta, timeout=60) as risposta:
        contenuto = risposta.read()
    if not contenuto.startswith(b"%PDF"):
        print(f"  {nome}: NON e' un PDF, scaricamento ignorato")
        return 0
    destinazione.write_bytes(contenuto)
    dopo = len(contenuto)
    if prima == 0:
        stato = "nuovo"
    elif prima == dopo:
        stato = "invariato"
    else:
        stato = f"CAMBIATO (era {prima} byte)"
    print(f"  {nome}: {dopo} byte — {stato}")
    return dopo


def main() -> int:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Scaricamento in {PDF_DIR.relative_to(ROOT)}\n")
    errori = 0
    for nome, (percorso, _pagina) in MODELLI.items():
        try:
            if not scarica(nome, percorso):
                errori += 1
        except Exception as e:      # rete, 404, timeout
            print(f"  {nome}: ERRORE — {e}")
            errori += 1
    print("\nFatto." if not errori else f"\nCompletato con {errori} problemi.")
    return 1 if errori else 0


if __name__ == "__main__":
    raise SystemExit(main())
