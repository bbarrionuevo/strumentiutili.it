#!/usr/bin/env python3
"""Genera data/strumenti.json, l'indice usato dalla ricerca della home.

Nei menu compaiono gli strumenti originali. Le pagine costruite per il
posizionamento sui motori di ricerca (il bollo auto regione per regione, la
partita IVA professione per professione, le dimissioni per contratto collettivo)
sono varianti dello stesso strumento: non vanno nei menu, ma devono restare
raggiungibili da chi le cerca. Finiscono quindi nell'indice con il campo
"variante" valorizzato, cosi la ricerca le trova e il menu resta pulito.

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

# Famiglie di pagine generate: prefisso della cartella -> strumento originale
VARIANTI = [
    ("cittadino-tasse", "calcolo-bollo-auto-", "/cittadino-tasse/calcolo-bollo-auto/", "regione"),
    ("fisco-professioni", "partita-iva-", "/fisco-professioni/partita-iva/", "professione"),
    ("lavoro-contratti", "lettera-dimissioni-", "/lavoro-contratti/lettera-dimissioni-preavviso/", "settore"),
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


def variante_di(categoria: str, cartella: str):
    for cat, prefisso, originale, genere in VARIANTI:
        # l'originale puo' condividere il prefisso delle sue varianti
        # (lettera-dimissioni-preavviso): non e' una variante di se stesso
        if f"/{categoria}/{cartella}/" == originale:
            continue
        if cat == categoria and cartella.startswith(prefisso) and cartella != prefisso.rstrip("-"):
            etichetta = cartella[len(prefisso):].replace("_", " ").replace("-", " ").strip()
            return {"originale": originale, "genere": genere, "etichetta": etichetta}
    return None


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
            v = variante_di(categoria, relativo)
            if v:
                voce["variante"] = v
            voci.append(voce)

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
