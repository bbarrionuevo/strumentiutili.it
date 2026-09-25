#!/usr/bin/env python3
"""Genera data/strumenti.json, l'indice usato dalla ricerca della home.

Nei menu compaiono gli strumenti. Chi cerca "bollo lombardia" o "dimissioni
metalmeccanici" deve pero' trovare lo strumento con la voce gia' scelta: per
ogni Regione, professione e contratto collettivo dei dati fiscali si aggiunge
una voce con il campo "variante", che porta allo strumento con il parametro
(?regione=lombardia, letto da js/parametri-url.js). Un tempo erano pagine
copiate una per una: ora sono redirect 301 in vercel.json.

Uso:  python scripts/genera-indice-strumenti.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
USCITA = ROOT / "data" / "strumenti.json"

CATEGORIE = {
    "fisco-professioni": "Fisco e Professioni",
    "cittadino-tasse": "Cittadino e Tasse",
    "lavoro-contratti": "Lavoro e Contratti",
    "identita-burocrazia": "Identita e Burocrazia",
    "pdf": "PDF e Scanner",
    "ia": "Intelligenza artificiale",
    "utilita-web": "Utilita e Web",
}

REGOLE = ROOT / "data" / "regole-fiscali-2026.json"

# (categoria, strumento, elenco nei dati fiscali, genere, parametro dell'indirizzo)
VARIANTI = [
    ("cittadino-tasse", "/cittadino-tasse/calcolo-bollo-auto/", ("bollo_auto_2026", "regioniSEO"), "regione", "regione"),
    ("fisco-professioni", "/fisco-professioni/partita-iva/", ("partitaIvaForfettario", "profesioniSEO"), "professione", None),
    ("lavoro-contratti", "/lavoro-contratti/lettera-dimissioni-preavviso/", ("ccnl_dimissioni", "ccnlSEO"), "settore", "ccnl"),
]


def meta(testo: str, nome: str) -> str:
    m = re.search(rf'<meta name="{nome}" content="(.*?)"', testo, re.S)
    return " ".join(m.group(1).split()) if m else ""


def titolo(testo: str) -> str:
    m = re.search(r"<title>(.*?)</title>", testo, re.S)
    if not m:
        return ""
    grezzo = " ".join(m.group(1).split())
    # i titoli finiscono con "— StrumentiUtili.it": nell'indice non serve
    return re.split(r"\s+[—-]\s+StrumentiUtili", grezzo)[0].strip()


def voci_varianti(originali: dict) -> list:
    regole = json.loads(REGOLE.read_text(encoding="utf-8"))
    fuori = []
    for categoria, originale, (sezione, elenco), genere, parametro in VARIANTI:
        base = originali[originale]
        for voce in regole[sezione][elenco]:
            valore = voce.get("codice") or voce["slug"]
            percorso = f"{originale}?{parametro}={valore}" if parametro else originale
            fuori.append({
                "percorso": percorso,
                "categoria": categoria,
                "nomeCategoria": CATEGORIE[categoria],
                "titolo": f"{base['titolo']}: {voce['nome']}",
                "descrizione": base["descrizione"],
                "variante": {"originale": originale, "genere": genere, "etichetta": voce["nome"]},
            })
    return fuori


def main() -> int:
    voci = []
    for categoria, nome_categoria in CATEGORIE.items():
        cartella_cat = ROOT / categoria
        if not cartella_cat.is_dir():
            continue
        # anche le pagine annidate, come i singoli modelli F24 sotto /f24-editabile/
        for pagina in sorted(cartella_cat.glob("*/**/index.html")):
            sub = pagina.parent
            relativo = sub.relative_to(cartella_cat).as_posix()
            testo = pagina.read_text(encoding="utf-8", errors="replace")
            voce = {
                "percorso": f"/{categoria}/{relativo}/",
                "categoria": categoria,
                "nomeCategoria": nome_categoria,
                "titolo": titolo(testo) or sub.name.replace("-", " ").title(),
                "descrizione": meta(testo, "description"),
            }
            voci.append(voce)

    voci += voci_varianti({v["percorso"]: v for v in voci})

    voci.sort(key=lambda v: (v["categoria"], "variante" in v, v["titolo"].lower()))

    USCITA.parent.mkdir(exist_ok=True)
    USCITA.write_text(
        json.dumps({"strumenti": voci}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )

    varianti = sum(1 for v in voci if "variante" in v)
    print(f"{USCITA.relative_to(ROOT)}: {len(voci)} voci ({len(voci) - varianti} strumenti, {varianti} varianti)")
    for categoria in CATEGORIE:
        n = sum(1 for v in voci if v["categoria"] == categoria)
        nv = sum(1 for v in voci if v["categoria"] == categoria and "variante" in v)
        if n:
            print(f"   {categoria}: {n - nv} strumenti + {nv} varianti")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
