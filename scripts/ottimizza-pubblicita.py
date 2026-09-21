#!/usr/bin/env python3
"""Sistema i riquadri pubblicitari su tutte le pagine del sito.

Che cosa non andava, misurato nel browser prima di toccare niente:

1. Tutti i riquadri riservavano 250px di altezza, quale che fosse il formato.
   Per un banner orizzontale, alto 90px, erano 160px di vuoto a ogni pagina;
   per il grattacielo della barra laterale, che ne vuole 600, erano troppo
   pochi e l'annuncio faceva saltare l'impaginazione caricandosi.

2. La barra laterale era larga 243px su tutti gli schermi da 1280px in su,
   perche' il contenitore e' fermo a 1100px e la colonna prendeva 3/12. Sotto
   i 300px AdSense non ha formati che valga la pena servire: quella posizione
   non rendeva nulla. Tornando a 4/12 la colonna arriva a ~333px.

3. Su alcune pagine il riquadro laterale toccava un collegamento: zero pixel
   di distanza. E' il caso tipico del clic per sbaglio, che le norme di
   AdSense puniscono. Ora ogni riquadro ha 2rem di margine tutto attorno.

4. Il riquadro dentro al contenuto si vedeva solo da telefono. E' la
   posizione che rende di piu': ora si vede anche da computer.

5. La barra laterale non seguiva lo scorrimento. Su pagine alte 4000-6000px
   l'annuncio usciva subito dallo schermo: una impressione per visita.
   Adesso resta agganciato mentre si scorre.

Lo script non cambia il numero di annunci per pagina e non tocca il codice
di AdSense: cambia solo lo spazio che occupano e dove stanno.

Uso:  python scripts/ottimizza-pubblicita.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SEGNO_CSS = "/* --- riquadri pubblicitari: spazio riservato per formato --- */"

# Il foglio di stile nuovo. Si aggiunge dopo le regole esistenti, cosi' le
# sovrascrive senza doverle smontare: le pagine hanno tre varianti della
# stessa regola e riscriverle a mano una per una sarebbe solo un rischio.
CSS = """
    %s
    /* Ogni posizione riserva l'altezza del proprio formato, non 250px per
       tutti: cosi' non si spreca spazio e la pagina non salta al caricamento.
       Il margine ampio serve a non far finire un annuncio appiccicato a un
       pulsante, che e' il modo piu' facile per farsi sospendere l'account. */
    .su-ad {
      min-height: 0;
      margin-block: 2rem;
      padding: 0.5rem;
      flex-direction: column;
      gap: 0.25rem;
    }
    .su-ad > ins.adsbygoogle { flex: 1 1 auto; align-self: stretch; }

    /* testata: banner orizzontale, 100px da telefono e 90px da computer */
    .su-ad--testata { min-height: 100px; }
    /* dentro al contenuto: rettangolo 300x250 o 336x280 */
    .su-ad--contenuto { min-height: 280px; }
    /* barra laterale: mezza pagina 300x600, agganciata allo scorrimento */
    .su-ad--laterale { min-height: 280px; }
    /* fondo pagina: Multiplex, la griglia di suggerimenti */
    .su-ad--fondo { min-height: 280px; }

    @media (min-width: 1024px) {
      .su-ad--testata { min-height: 90px; }
      .su-ad--laterale {
        min-height: 600px;
        position: sticky;
        top: 6rem;
      }
    }

    /* Etichetta: le norme di AdSense chiedono che l'annuncio si distingua dal
       contenuto. Resta anche quando l'annuncio e' caricato. */
    .su-ad-etichetta {
      font-size: 10px;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
      color: #94a3b8;
      flex: 0 0 auto;
    }

    /* Segnaposto: si vede finche' l'annuncio non arriva, cosi' il riquadro
       vuoto non sembra un errore di caricamento. */
    .su-ad-segnaposto {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #cbd5e1;
      font-weight: 600;
      letter-spacing: 0.04em;
      min-height: inherit;
    }
    .su-ad[data-su-stato="pieno"] {
      background: none;
      border-color: transparent;
    }
    .su-ad[data-su-stato="pieno"] .su-ad-segnaposto { display: none; }
    /* Nessun annuncio da mostrare: il riquadro si chiude e lo spazio torna al
       contenuto, invece di lasciare un rettangolo grigio per sempre. */
    .su-ad[data-su-stato="vuoto"] {
      display: none;
    }

    /* Un <details> chiuso deve essere davvero chiuso. Su queste pagine le voci
       dell'elenco "Altri strumenti" mantenevano una casella cliccabile anche da
       chiuse: invisibili, ma raggiungibili col dito, e finivano a 2px dal
       riquadro pubblicitario della barra laterale. E' esattamente il clic per
       sbaglio che AdSense sanziona. */
    details:not([open]) > *:not(summary) { display: none !important; }
""" % SEGNO_CSS

ETICHETTA = '<span class="su-ad-etichetta">Pubblicit&agrave;</span>'
SEGNAPOSTO = '<span class="su-ad-segnaposto" aria-hidden="true">Spazio pubblicitario</span>'

# Formato di AdSense adatto a ogni posizione.
FORMATI = {
    "testata": "horizontal",
    "contenuto": "rectangle",
    "laterale": "vertical",
    # "autorelaxed" e' il Multiplex: una griglia di riquadri nativi, che a fondo
    # pagina rende piu' di un banner display perche' somiglia a un elenco di
    # contenuti correlati.
    "fondo": "autorelaxed",
}


def posizioni(html: str) -> list[tuple[int, int, str]]:
    """Trova i riquadri e assegna a ciascuno la sua posizione."""
    trovati = []
    for m in re.finditer(r'<div class="su-ad(?P<classi>[^"]*)"', html):
        trovati.append([m.start(), m.end(), m.group("classi")])
    fuori = []
    for indice, (inizio, fine, classi) in enumerate(trovati):
        if "ad-slot-desktop" in classi:
            dove = "laterale"
        elif "ad-slot-mobile" in classi:
            dove = "contenuto"
        elif indice == 0:
            dove = "testata"
        elif indice == len(trovati) - 1:
            dove = "fondo"
        else:
            dove = "contenuto"
        fuori.append((inizio, fine, dove))
    return fuori


def sistema_riquadri(html: str) -> tuple[str, dict]:
    conteggio = {}
    # si lavora dal fondo, cosi' gli indici di quelli prima restano validi
    for inizio, fine, dove in reversed(posizioni(html)):
        conteggio[dove] = conteggio.get(dove, 0) + 1
        apertura = html[inizio:fine]
        classi = re.search(r'<div class="su-ad(?P<c>[^"]*)"', apertura).group("c")

        nuove = classi
        # il riquadro dentro al contenuto non e' piu' solo per telefono
        if dove == "contenuto":
            nuove = nuove.replace("ad-slot-mobile", "").replace("ad-slot-desktop", "")
        # via i fondini e i bordi propri: adesso li mette la regola .su-ad
        nuove = re.sub(r"\bbg-gray-50\b|\bborder border-gray-100\b|\bp-2\b|\bp-3\b", " ", nuove)
        nuove = re.sub(r"\s+", " ", nuove).strip()
        if "su-ad--" not in nuove:
            nuove = "su-ad--%s %s" % (dove, nuove)

        html = html[:inizio] + '<div class="su-ad %s" data-su-pos="%s"' % (nuove, dove) + html[fine:]

        # dentro al riquadro: etichetta, annuncio, segnaposto
        chiusura = html.find("</div>", inizio)
        corpo = html[html.index(">", inizio) + 1:chiusura]
        ins = re.search(r"<ins\b.*?</ins>", corpo, re.S)
        if not ins:
            continue
        marchio = ins.group(0)
        marchio = re.sub(r'\s*data-ad-format="[^"]*"', "", marchio)
        marchio = re.sub(r'\s*data-su-pos="[^"]*"', "", marchio)
        marchio = marchio.replace(
            "<ins ", '<ins data-su-pos="%s" data-ad-format="%s" ' % (dove, FORMATI[dove]), 1)
        # il Multiplex non vuole full-width-responsive
        if dove == "fondo":
            marchio = re.sub(r'\s*data-full-width-responsive="[^"]*"', "", marchio)
        nuovo_corpo = "\n        %s\n        %s\n        %s\n      " % (ETICHETTA, marchio, SEGNAPOSTO)
        html = html[:html.index(">", inizio) + 1] + nuovo_corpo + html[chiusura:]
    return html, conteggio


def allarga_la_colonna(html: str) -> int:
    """Riporta la barra laterale a 4/12 anche sugli schermi grandi."""
    quante = 0
    coppie = [
        ('class="w-full lg:col-span-8 xl:col-span-9 lg:col-start-1 block"',
         'class="w-full lg:col-span-8 lg:col-start-1 block"'),
        ('class="w-full lg:col-span-4 xl:col-span-3 lg:col-start-9 xl:col-start-10 lg:row-span-2 block"',
         'class="w-full lg:col-span-4 lg:col-start-9 lg:row-span-2 block"'),
        ('class="w-full lg:col-span-8 xl:col-span-9 lg:col-start-1"',
         'class="w-full lg:col-span-8 lg:col-start-1"'),
        ('class="w-full lg:col-span-4 xl:col-span-3 lg:col-start-9 xl:col-start-10 lg:row-span-2"',
         'class="w-full lg:col-span-4 lg:col-start-9 lg:row-span-2"'),
    ]
    for vecchio, nuovo in coppie:
        if vecchio in html:
            quante += html.count(vecchio)
            html = html.replace(vecchio, nuovo)
    return html, quante


def aggiungi_css(html: str) -> str:
    if SEGNO_CSS in html:
        return html
    m = re.search(r"\.su-ad ins\.adsbygoogle\s*\{[^}]*\}", html)
    if not m:
        m = re.search(r"\.su-ad\s*\{[^}]*\}", html)
    if not m:
        return html
    return html[:m.end()] + "\n" + CSS + html[m.end():]


def aggiungi_script(html: str) -> str:
    if "/js/pubblicita.js" in html:
        return html
    return html.replace("</body>", '  <script defer src="/js/pubblicita.js"></script>\n</body>', 1)


def main() -> int:
    pagine = sorted(ROOT.rglob("index.html"))
    totali = {"pagine": 0, "riquadri": 0, "colonne": 0}
    per_posizione: dict[str, int] = {}

    for f in pagine:
        html = originale = f.read_text(encoding="utf-8")
        if "su-ad" not in html:
            continue
        html = aggiungi_css(html)
        html, conteggio = sistema_riquadri(html)
        html, colonne = allarga_la_colonna(html)
        html = aggiungi_script(html)
        if html == originale:
            continue
        f.write_text(html, encoding="utf-8")
        totali["pagine"] += 1
        totali["colonne"] += colonne
        for dove, n in conteggio.items():
            per_posizione[dove] = per_posizione.get(dove, 0) + n
            totali["riquadri"] += n

    print("pagine sistemate: %d" % totali["pagine"])
    print("riquadri: %d  ->  %s" % (totali["riquadri"],
                                    ", ".join("%s %d" % (k, v) for k, v in sorted(per_posizione.items()))))
    print("colonne riportate a 4/12: %d" % totali["colonne"])

    # controllo: nessun annuncio perso per strada
    ins = sum(f.read_text(encoding="utf-8").count("adsbygoogle\"") for f in pagine)
    print("unita' <ins class=\"adsbygoogle\"> in tutto il sito: %d" % ins)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
