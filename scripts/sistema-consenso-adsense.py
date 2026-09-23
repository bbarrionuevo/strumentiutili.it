#!/usr/bin/env python3
"""Fa caricare AdSense anche a chi rifiuta i cookie, con annunci non personalizzati.

Com'era. Cookiebot gira con data-blockingmode="auto", che tiene fermi gli script
di marketing finche' l'utente non accetta. L'etichetta di AdSense non era
marcata in nessun modo, quindi finiva in quel gruppo: a chi rifiutava non veniva
mostrato *nessun* annuncio. Non e' quello che la norma chiede, ed e' la meta'
circa del traffico europeo che non rende niente.

Com'e' adesso. Lo script di AdSense si carica sempre. Quello che cambia con il
consenso non e' l'esistenza dell'annuncio ma la sua personalizzazione:

  - senza consenso pubblicitario  -> requestNonPersonalizedAds = 1
    annunci scelti in base al contenuto della pagina e non alla persona, senza
    identificatori pubblicitari (Consent Mode resta su "denied" e
    ads_data_redaction su true, come gia' era);
  - con il consenso               -> requestNonPersonalizedAds = 0
    Cookiebot lo comunica appena l'utente accetta, e per chi ha gia' accettato
    in passato lo fa gia' al caricamento della pagina.

Il valore di partenza e' 1, cioe' il piu' prudente: se per qualsiasi motivo il
consenso non arrivasse in tempo, si finisce sull'annuncio non personalizzato,
mai sul contrario.

Resta da fare una cosa sola, nel pannello di AdSense e non nel codice: in
Privacy e messaggi > Normativa UE, gli annunci non personalizzati devono essere
consentiti. Se quella casella e' chiusa, a chi rifiuta continuera' a non
comparire nulla.

Uso:  python scripts/sistema-consenso-adsense.py
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

VECCHIO = ('<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
           '?client=ca-pub-9434300808171957" crossorigin="anonymous"></script>')

NUOVO = '''<script data-cookieconsent="ignore">
    /* AdSense si carica sempre: chi rifiuta i cookie vede annunci NON
       personalizzati invece di non vederne affatto. Si parte da 1, il valore
       prudente; Cookiebot lo porta a 0 solo quando il consenso c'e' davvero. */
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.requestNonPersonalizedAds = 1;
    (function () {
        function consensoPubblicitario() {
            var c = window.Cookiebot && window.Cookiebot.consent;
            window.adsbygoogle.requestNonPersonalizedAds = (c && c.marketing) ? 0 : 1;
        }
        window.addEventListener('CookiebotOnConsentReady', consensoPubblicitario);
        window.addEventListener('CookiebotOnAccept', consensoPubblicitario);
        window.addEventListener('CookiebotOnDecline', consensoPubblicitario);
    })();
</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9434300808171957" crossorigin="anonymous"></script>'''


def main() -> int:
    cambiate, gia_fatte = 0, 0
    for f in sorted(ROOT.rglob("index.html")):
        html = f.read_text(encoding="utf-8")
        if "requestNonPersonalizedAds" in html:
            gia_fatte += 1
            continue
        if VECCHIO not in html:
            continue
        f.write_text(html.replace(VECCHIO, NUOVO, 1), encoding="utf-8")
        cambiate += 1

    print("pagine sistemate: %d  (gia' a posto: %d)" % (cambiate, gia_fatte))

    # controllo su tutto il sito
    pagine = list(ROOT.rglob("index.html"))
    con_adsense = [f for f in pagine if "googlesyndication" in f.read_text(encoding="utf-8")]
    senza_ignore, senza_npa, senza_default = [], [], []
    for f in con_adsense:
        html = f.read_text(encoding="utf-8")
        if 'googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9434300808171957" crossorigin="anonymous" data-cookieconsent="ignore"' not in html:
            senza_ignore.append(f.name)
        if "requestNonPersonalizedAds" not in html:
            senza_npa.append(str(f))
        if 'ad_storage: "denied"' not in html and "ad_storage: 'denied'" not in html:
            senza_default.append(str(f))

    print("pagine con AdSense: %d" % len(con_adsense))
    print("  senza data-cookieconsent=ignore: %s" % (senza_ignore[:3] or "nessuna"))
    print("  senza il valore prudente di partenza: %s" % (senza_npa[:3] or "nessuna"))
    print("  senza Consent Mode su denied: %s" % (senza_default[:3] or "nessuna"))
    return 1 if (senza_ignore or senza_npa or senza_default) else 0


if __name__ == "__main__":
    raise SystemExit(main())
