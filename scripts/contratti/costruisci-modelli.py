# Costruisce data/contratti-tipo-dm-2017.json dai testi ufficiali (tests/fixtures/dm-2017)
# e dalla specifica dei tre modelli (spec.py). Ogni paragrafo e' preso LETTERALMENTE dal testo
# ufficiale: la specifica dice solo dove comincia, come si chiamano i puntini da riempire, quali
# alternative del modello si scelgono e quando un paragrafo si stampa.
import json, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from modelli_dm2017 import MODELLI

RADICE = sys.argv[1]
RUN = re.compile(r'(?:[.…]*…[.…]*|\.{3,})(?:\s+(?:[.…]*…[.…]*|\.{3,}))*')

def normalizza(t):
    return re.sub(r'\s+', ' ', t).strip()

def tokenizza(testo, campi, pid):
    trovati = list(RUN.finditer(testo))
    if len(trovati) != len(campi):
        raise SystemExit(f'{pid}: {len(trovati)} spazi da riempire, {len(campi)} nomi: {[m.group(0)[:12] for m in trovati]}\n{testo}')
    out, pos = [], 0
    for m, c in zip(trovati, campi):
        out.append(testo[pos:m.start()])
        out.append('{{' + c + '}}')
        pos = m.end()
    out.append(testo[pos:])
    return ''.join(out)

def costruisci(lettera, spec):
    grezzo = open(os.path.join(RADICE, 'tests/fixtures/dm-2017/allegato-%s.txt' % lettera.lower())).read()
    T = normalizza(grezzo)
    corpo, note_txt = T.split(' NOTE ', 1)
    inizio = corpo.index(spec['titolo'])
    cur = inizio
    # posizioni di inizio di ogni voce
    voci = []
    for v in spec['voci']:
        if v['k'] == 'art':
            m = re.compile(r'Articolo ?' + v['n'] + r' \(' + re.escape(v['titolo']) + r'\)( \(\d+\))?').search(corpo, cur)
            if not m or corpo[cur:m.start()].strip() and voci == []:
                pass
            if not m:
                raise SystemExit(f'{lettera}: articolo {v["n"]} non trovato')
            voci.append((m.start(), m.end(), v, m.group(0)))
            cur = m.end()
        else:
            s = corpo.find(v['da'], cur)
            if s < 0:
                raise SystemExit(f'{lettera}/{v["id"]}: inizio non trovato: {v["da"]!r} dopo {corpo[cur:cur+80]!r}')
            voci.append((s, None, v, None))
            cur = s + len(v['da'])
    blocchi = []
    for i, (s, e, v, testa) in enumerate(voci):
        if v['k'] == 'art':
            b = {'k': 'art', 'n': v['n'], 't': testa}
            for chiave in ('se', 'scelte'):
                if v.get(chiave): b[chiave] = v[chiave]
            for sc in b.get('scelte', []):
                if sc['testo'] not in testa:
                    raise SystemExit(f'{lettera}/art {v["n"]}: testo della scelta non trovato: {sc["testo"]!r} in {testa!r}')
            blocchi.append(b)
            fine_prec = e
            continue
        fine = voci[i + 1][0] if i + 1 < len(voci) else len(corpo)
        testo = corpo[s:fine].strip()
        # nessun buco fra una voce e l'altra
        tpl = tokenizza(testo, v.get('campi', []), f'{lettera}/{v["id"]}')
        b = {'k': v['k'], 'id': v['id'], 't': tpl}
        for chiave in ('se', 'scelte', 'togli', 'accapo', 'chiudi'):
            if v.get(chiave):
                b[chiave] = v[chiave]
        for sc in b.get('scelte', []) + b.get('togli', []):
            if sc['testo'] not in tpl:
                raise SystemExit(f'{lettera}/{v["id"]}: testo della scelta non trovato: {sc["testo"]!r}\nin: {tpl}')
        for a in b.get('accapo', []):
            if a not in tpl:
                raise SystemExit(f'{lettera}/{v["id"]}: a capo non trovato: {a!r}')
        blocchi.append(b)
    # copertura: dal titolo alla fine del corpo non resta niente fuori
    if voci[0][0] != inizio + 0 and corpo[inizio:voci[0][0]].strip() not in ('',):
        pass
    note = {}
    parti = re.split(r'(?:^| )\((\d{1,2})\) ', ' ' + note_txt)
    atteso = 1
    corrente = None
    for p in parti[1:]:
        if p.isdigit() and int(p) == atteso:
            corrente = p; atteso += 1; note[corrente] = ''
        elif corrente:
            note[corrente] = (note[corrente] + ' ' + p).strip() if note[corrente] else p.strip()
    return {'titolo': spec['titolo'], 'sottotitolo': spec['sottotitolo'], 'fonte': spec['fonte'], 'blocchi': blocchi, 'note': note}

dati = {
    '_nota': "Tipi di contratto approvati dal D.M. 16 gennaio 2017 (Ministero delle infrastrutture e dei trasporti di concerto con il Ministero dell'economia e delle finanze, G.U. Serie generale n. 62 del 15 marzo 2017), allegati A, B e C. Il testo di ogni paragrafo e' quello della Gazzetta Ufficiale: al posto dei puntini da riempire c'e' {{nome}}. 'scelte' sono le alternative del modello (\"cancellare la parte che non interessa\"), 'togli' le parti che si omettono quando non servono, 'se' quando un paragrafo si stampa. Generato da scripts/contratti/ con la specifica dei modelli; tests/contratto-locazione.test.js confronta ogni paragrafo con il testo ufficiale.",
    'decreto': {
        'titolo': 'Decreto del Ministro delle infrastrutture e dei trasporti di concerto con il Ministro dell\'economia e delle finanze 16 gennaio 2017',
        'gazzetta': 'G.U. Serie generale n. 62 del 15 marzo 2017',
        'url': 'https://www.gazzettaufficiale.it/eli/id/2017/03/15/17A01858/sg'
    },
    'modelli': {}
}
for lettera, spec in MODELLI.items():
    dati['modelli'][lettera] = costruisci(lettera, spec)
uscita = os.path.join(RADICE, 'data/contratti-tipo-dm-2017.json')
open(uscita, 'w').write(json.dumps(dati, ensure_ascii=False, indent=1) + '\n')
if '--mostra' in sys.argv:
    for l, m in dati['modelli'].items():
        for b in m['blocchi']:
            print(l, b.get('id', 'art'), '|', b['t'][:400])
print('ok', {l: len(m['blocchi']) for l, m in dati['modelli'].items()})
