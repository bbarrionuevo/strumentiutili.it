#!/usr/bin/env python3
"""Assegna a ogni posizione il suo blocco annunci di AdSense.

Oggi tutte le 490 unita' del sito usano lo stesso identificativo. AdSense le
serve lo stesso, ma nei rapporti diventano una riga sola: non si sa se rende di
piu' il banner in testata o il rettangolo dentro al contenuto, e quindi non si
puo' decidere niente sui dati. Con un blocco per posizione, il pannello di
AdSense mostra quattro righe e si vede subito dove sta il guadagno.

Come si fa, una volta sola:

  1. Su AdSense, Annunci > Per unita' pubblicitaria, crea quattro unita':

       testata     Display responsivo   (banner orizzontale in cima)
       contenuto   Display responsivo   (rettangolo dentro all'articolo)
       laterale    Display responsivo   (verticale nella barra laterale)
       fondo       Multiplex            (griglia di contenuti correlati)

  2. Copia il numero che compare in data-ad-slot di ciascuna e incollalo qui
     sotto, al posto della stringa vuota.

  3. Esegui:  python scripts/imposta-slot-pubblicitari.py

Le posizioni lasciate vuote non vengono toccate: si puo' procedere un blocco
alla volta. Lo script non aggiunge e non toglie annunci.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# posizione -> identificativo del blocco annunci ("" = non ancora creato)
SLOT = {
    "testata": "4436348652",
    "contenuto": "8859818557",
    "laterale": "6912312067",
    "fondo": "1157333219",
}


def main() -> int:
    da_fare = {k: v for k, v in SLOT.items() if v.strip()}
    if not da_fare:
        print("Nessun identificativo indicato: apri questo file e compila SLOT.")
        print("Le posizioni disponibili sono: " + ", ".join(SLOT))
        return 0

    for posizione, identificativo in da_fare.items():
        if not re.fullmatch(r"\d{6,}", identificativo.strip()):
            print("L'identificativo di %r non sembra valido: %r "
                  "(sono solo cifre, come 1234567890)" % (posizione, identificativo))
            return 1

    cambiate, totale = 0, 0
    for f in sorted(ROOT.rglob("index.html")):
        html = originale = f.read_text(encoding="utf-8")
        for posizione, identificativo in da_fare.items():
            # si riscrive data-ad-slot solo dentro all'<ins> di quella posizione
            def sostituisci(m, nuovo=identificativo.strip()):
                return re.sub(r'data-ad-slot="[^"]*"', 'data-ad-slot="%s"' % nuovo, m.group(0))

            html, n = re.subn(
                r'<ins[^>]*data-su-pos="%s"[^>]*>' % re.escape(posizione),
                sostituisci, html)
            totale += n
        if html != originale:
            f.write_text(html, encoding="utf-8")
            cambiate += 1

    print("posizioni aggiornate: %s" % ", ".join(sorted(da_fare)))
    print("unita' riscritte: %d su %d pagine" % (totale, cambiate))
    mancanti = [k for k, v in SLOT.items() if not v.strip()]
    if mancanti:
        print("ancora senza blocco proprio: %s" % ", ".join(mancanti))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
