# Specifica dei tipi di contratto del D.M. 16/01/2017 (allegati A, B, C).
# Ogni voce: 'da' = parole con cui comincia il paragrafo nel testo ufficiale,
# 'campi' = il nome di ogni spazio con i puntini, nell'ordine in cui compare.

def P(id, da, campi=(), **altro):
    v = {'k': 'p', 'id': id, 'da': da, 'campi': list(campi)}
    v.update(altro)
    return v

def ART(n, titolo, **altro):
    v = {'k': 'art', 'n': str(n), 'titolo': titolo}
    v.update(altro)
    return v

FIRMA = '_firma'

def S(campo, testo, **opzioni):
    """Alternativa del modello: il testo si sostituisce con l'opzione scelta."""
    return {'campo': campo, 'testo': testo, 'opzioni': opzioni}

def T(testo, se, con=''):
    """Parte che si toglie (o si riscrive con 'con') quando vale la condizione 'se'."""
    return {'testo': testo, 'se': se, 'con': con}

def ISTR(id, da, se):
    """Istruzione del modello fra parentesi: non fa parte del contratto firmato."""
    return {'k': 'istr', 'id': id, 'da': da, 'campi': [], 'se': se}

ACCESSORI_PARENTESI = ' (indicare quali: soffitta, cantina, autorimessa singola, posto macchina in comune o meno, ecc. )'

def parti(forme_locatore, forme_conduttore, assistito_l, assistito_c):
    scelte = [S('formaLocatore', forme_locatore, sig='Il sig.', sigra='La sig.ra', soc='La soc.'),
              S('formaLocatore', 'denominato/a locatore', sig='denominato locatore', sigra='denominata locatore', soc='denominata locatore')]
    scelte += forme_conduttore
    # "(assistito/a da (2) {{assistente}}": il genere segue la parte assistita
    for campo, testo, token in (('formaLocatore', assistito_l, '{{assistenteLocatore}}'), ('formaConduttore', assistito_c, '{{assistenteConduttore}}')):
        inizio = testo.strip()[:testo.strip().index(token) + len(token)]
        scelte.append(S(campo, inizio, sig='(assistito da ' + token, sigra='(assistita da ' + token, soc='(assistita da ' + token))
    togli = [T(assistito_l, '!assistenteLocatore'), T(assistito_c, '!assistenteConduttore')]
    return {'scelte': scelte, 'togli': togli}

def immobile(parentesi, arredo):
    return {'se': '!porzione', 'scelte': [S('arredo', arredo, no='non ammobiliata', si='ammobiliata')],
            'togli': [T(parentesi + ' {{accessori}}', 'accessori', ': {{accessori}},'),
                      T(', e dotata altresì dei seguenti elementi accessori' + parentesi + ' {{accessori}}', '!accessori', ',')]}

def porzione(modo, arredo):
    return {'se': 'porzione', 'scelte': [S('arredo', arredo, no='non ammobiliata', si='ammobiliata')],
            'togli': [T(ACCESSORI_PARENTESI, 'accessori', ': {{accessori}},'),
                      T(', e dotata altresì dei seguenti elementi accessori' + ACCESSORI_PARENTESI, '!accessori', ','),
                      T(modo, '*', 'modo: {{usoPorzione}},')]}

def pagamento(testo):
    return S('modoPagamento', testo, domicilio='nel domicilio del locatore', bonifico='a mezzo di bonifico bancario', altro='{{altroPagamento}}')

STATO_OPZIONI = dict(descrizione='quanto segue: {{statoImmobile}}.', verbale="quanto risulta dall'allegato verbale di consegna.")
VISITE = S('visite', 'una volta la settimana, per almeno due ore, con esclusione dei giorni festivi oppure con le seguenti modalità: {{modalitaVisite}}',
           standard='una volta la settimana, per almeno due ore, con esclusione dei giorni festivi.', altre='con le seguenti modalità: {{modalitaVisite}}.')
FIRME = {'accapo': [' {{luogoFirma}}', ' Il locatore', ' Il conduttore']}
CLAUSOLE = {'accapo': [' Il locatore', ' Il conduttore']}

A = {
    'titolo': 'LOCAZIONE ABITATIVA',
    'sottotitolo': '(Legge 9 dicembre 1998, n. 431, articolo 2, comma 3)',
    'fonte': 'https://www.gazzettaufficiale.it/do/atto/serie_generale/caricaPdf?cdimg=17A0185800100010110001&dgu=2017-03-15&art.dataPubblicazioneGazzetta=2017-03-15&art.codiceRedazionale=17A01858&art.num=1&art.tiposerie=SG',
    'voci': [
        P('intestazione', 'LOCAZIONE ABITATIVA', accapo=[' (Legge']),
        P('parti', 'Il/La sig./soc. (1)', ['locatore', 'assistenteLocatore', 'personaAssistenteLocatore', 'conduttore', 'documentoConduttore', 'assistenteConduttore', 'personaAssistenteConduttore'],
          **parti('Il/La sig./soc. (1)',
                  [S('formaConduttore', 'al/ alla sig. (1)', sig='al sig.', sigra='alla sig.ra', soc='alla soc.'),
                   S('formaConduttore', 'denominato/ a conduttore, identificato/ a mediante (3)', sig='denominato conduttore, identificato mediante', sigra='denominata conduttore, identificata mediante', soc='denominata conduttore, identificata mediante')],
                  '(assistito/a da (2) {{assistenteLocatore}} in persona di {{personaAssistenteLocatore}}) ',
                  ' (assistito/a da (2) {{assistenteConduttore}}in persona di {{personaAssistenteConduttore}} )')),
        P('immobile', 'A) l’unità immobiliare posta in', ['comune', 'via', 'civico', 'piano', 'scala', 'interno', 'vani', 'accessori'], **immobile(' (indicare quali: soffitta, cantina, autorimessa singola, posto macchina in comune o meno, ecc.)', 'non ammobiliata / ammobiliata (4)')),
        P('porzione', 'B) una porzione dell’unità immobiliare', ['comune', 'via', 'civico', 'piano', 'scala', 'interno', 'vani', 'usoPorzione'], **porzione('modo (5) {{usoPorzione}}', 'non ammobiliata / ammobiliata (4)')),
        P('catasto', 'a) estremi catastali', ['catasto']),
        P('ape', 'b) prestazione energetica', ['ape']),
        P('impianti', 'c) sicurezza impianti', ['impianti']),
        P('millesimi', 'd) tabelle millesimali', ['millesimiProprieta', 'millesimiRiscaldamento', 'millesimiAcqua', 'millesimiAltre']),
        P('regolata', 'La locazione è regolata'),
        ART(1, 'Durata'),
        P('durata', 'Il contratto è stipulato per la durata di', ['durata', 'dal', 'al']),
        ART(2, 'Canone'),
        P('canone', "A. Il canone annuo di locazione, secondo quanto stabilito dall'Accordo", ['accordoTra', 'accordoDepositato', 'accordoComune', 'integrativoTra', 'integrativoData', 'canone', 'altroPagamento', 'numeroRate', 'importoRata', 'dateRate'], se='!senzaAccordo',
          scelte=[pagamento('nel domicilio del locatore ovvero a mezzo di bonifico bancario, ovvero{{altroPagamento}}')],
          togli=[T(' , ovvero dall’accordo integrativo sottoscritto tra {{integrativoTra}}(7) in data {{integrativoData}}', '!integrativoTra')]),
        P('istat', "Nel caso in cui l'Accordo territoriale di cui al presente punto", ['aggiornamentoIstat'], se='!senzaAccordo&aggiornamentoIstat'),
        P('canoneDecreto', 'B. Il canone annuo di locazione, secondo quanto stabilito dal decreto', ['canone', 'altroPagamento', 'numeroRate', 'importoRata', 'dateRate'], se='senzaAccordo',
          scelte=[pagamento('nel domicilio del locatore ovvero a mezzo di bonifico bancario, ovvero{{altroPagamento}}')]),
        P('istatDecreto', 'Nel caso in cui nel predetto decreto sia previsto', ['aggiornamentoIstat'], se='senzaAccordo&aggiornamentoIstat'),
        ART(3, 'Deposito cauzionale e altre forme di garanzia'),
        P('deposito', 'A garanzia delle obbligazioni assunte', ['depositoEuro', 'depositoMensilita'], scelte=[S('depositoVersato', 'versa/non versa (4)', si='versa', no='non versa')]),
        P('garanzie', 'Eventuali altre forme di garanzia', ['altreGaranzie'], se='altreGaranzie'),
        ART(4, 'Oneri accessori'),
        P('oneri', 'Per gli oneri accessori le parti fanno applicazione', ['quotaOneri'],
          togli=[T(' Per le spese di cui al presente articolo il conduttore versa una quota di euro{{quotaOneri}} salvo conguaglio (12).', '!quotaOneri')]),
        ART(5, 'Spese di bollo e di registrazione'),
        P('bollo', 'Le spese di bollo per il presente contratto'),
        ART(6, 'Pagamento'),
        P('pagamento', "Il pagamento del canone o di quant'altro"),
        ART(7, 'Uso'),
        P('uso', "L'immobile deve essere destinato esclusivamente", ['conviventi'],
          togli=[T(' e delle seguenti persone attualmente con lui conviventi {{conviventi}} Salvo', '!conviventi', '. Salvo'),
                 T('conviventi {{conviventi}} Salvo', 'conviventi', 'conviventi: {{conviventi}}. Salvo')]),
        ART(8, 'Recesso del conduttore'),
        P('recesso', "E' facoltà del conduttore recedere"),
        ART(9, 'Consegna'),
        P('consegna', "Il conduttore dichiara di aver visitato"),
        P('stato', 'Le parti danno atto, in relazione allo stato', ['statoImmobile'],
          scelte=[S('consegnaStato', "quanto segue: {{statoImmobile}} ovvero di quanto risulta dall'allegato verbale di consegna.", **STATO_OPZIONI)]),
        ART(10, 'Modifiche e danni'),
        P('modifiche', 'Il conduttore non può apportare alcuna modifica'),
        ART(11, 'Assemblee'),
        P('assemblee', 'Il conduttore ha diritto di voto'),
        ART(12, 'Impianti'),
        P('impiantiUso', 'Il conduttore - in caso d'),
        ART(13, 'Accesso'),
        P('accesso', "Il conduttore deve consentire l'accesso"),
        P('visite', 'Nel caso in cui il locatore intenda vendere', ['modalitaVisite'], scelte=[VISITE]),
        ART(14, 'Commissione di negoziazione paritetica e conciliazione stragiudiziale'),
        P('commissione', 'La Commissione di cui all’articolo 6'),
        ART(15, 'Varie'),
        P('varie', 'A tutti gli effetti del presente contratto'),
        P('altreClausole', 'Altre clausole:', ['altreClausole'], se='altreClausole'),
        P('firme', 'Letto, approvato e sottoscritto', ['luogoFirma', 'dataFirma', FIRMA, FIRMA], **FIRME),
        P('clausole', 'A mente degli articoli 1341 e 1342', [FIRMA, FIRMA], **CLAUSOLE),
    ],
}

B = {
    'titolo': 'LOCAZIONE ABITATIVA DI NATURA TRANSITORIA',
    'sottotitolo': '(Legge 9 dicembre 1998, n. 431, articolo 5, comma 1)',
    'fonte': 'https://www.gazzettaufficiale.it/do/atto/serie_generale/caricaPdf?cdimg=17A0185800200010110001&dgu=2017-03-15&art.dataPubblicazioneGazzetta=2017-03-15&art.codiceRedazionale=17A01858&art.num=1&art.tiposerie=SG',
    'voci': [
        P('intestazione', 'LOCAZIONE ABITATIVA DI NATURA TRANSITORIA', accapo=[' (Legge']),
        P('parti', 'Il/La sig./soc. (1)', ['locatore', 'assistenteLocatore', 'personaAssistenteLocatore', 'conduttore', 'documentoConduttore', 'assistenteConduttore', 'personaAssistenteConduttore'],
          **parti('Il/La sig./soc. (1)',
                  [S('formaConduttore', 'al/ alla sig. (1)', sig='al sig.', sigra='alla sig.ra', soc='alla soc.'),
                   S('formaConduttore', 'denominato/ a conduttore, identificato/a mediante (3)', sig='denominato conduttore, identificato mediante', sigra='denominata conduttore, identificata mediante', soc='denominata conduttore, identificata mediante')],
                  '(assistito/a da (2) {{assistenteLocatore}} in persona di {{personaAssistenteLocatore}}) ',
                  ' (assistito/ a da (2) {{assistenteConduttore}} in persona di {{personaAssistenteConduttore}} )')),
        P('immobile', 'A) l’unità immobiliare posta in', ['comune', 'via', 'civico', 'piano', 'scala', 'interno', 'vani', 'accessori'], **immobile(ACCESSORI_PARENTESI, 'non ammobiliata/ammobiliata (4)')),
        P('porzione', 'B) una porzione dell’unità immobiliare', ['comune', 'via', 'civico', 'piano', 'scala', 'interno', 'vani', 'usoPorzione'], **porzione('modo (5) :{{usoPorzione}}', 'non ammobiliata/ammobiliata (4)')),
        P('catasto', 'a) estremi catastali', ['catasto']),
        P('ape', 'b) prestazione energetica', ['ape']),
        P('impianti', 'c) sicurezza impianti', ['impianti']),
        P('millesimi', 'd) tabelle millesimali', ['millesimiProprieta', 'millesimiRiscaldamento', 'millesimiAcqua', 'millesimiAltre']),
        P('regolata', 'La locazione è regolata'),
        ART(1, 'Durata'),
        P('durata', 'Il contratto è stipulato per la durata di', ['durata', 'dal', 'al'], scelte=[S('unitaDurata', 'mesi/giorni (6)', mesi='mesi', giorni='giorni')]),
        ART(2, 'Esigenza del locatore/conduttore', scelte=[S('esigenzaDi', 'Esigenza del locatore/conduttore) (4)', locatore='Esigenza del locatore)', conduttore='Esigenza del conduttore)')]),
        P('esigenza', 'A) Il locatore/conduttore, nel rispetto', ['accordoTra', 'accordoDepositato', 'accordoComune', 'integrativoTra', 'integrativoData', 'esigenza', 'documentazione'], se='!assistita|breve', chiudi=True,
          scelte=[S('esigenzaDi', 'Il locatore/conduttore', locatore='Il locatore', conduttore='Il conduttore')],
          togli=[T(', ovvero dall’Accordo integrativo sottoscritto tra{{integrativoTra}} in data{{integrativoData}}(7)', '!integrativoTra'),
                 T('del contratto{{esigenza}}', '*', 'del contratto: {{esigenza}}'),
                 T(', e che documenta, in caso di durata superiore a 30 giorni, allegando {{documentazione}}', 'breve')]),
        P('esigenzaAssistita', 'B) Ai sensi di quanto previsto dall’art. 2, comma 4', ['accordoTra', 'accordoDepositato', 'accordoComune', 'integrativoTra', 'integrativoData', 'assistenteLocatore', 'personaAssistenteLocatore', 'assistenteConduttore', 'personaAssistenteConduttore', 'esigenza'], se='assistita&!breve', chiudi=True,
          togli=[T(', ovvero dall’Accordo integrativo sottoscritto tra{{integrativoTra}} (7) in data{{integrativoData}}', '!integrativoTra'),
                 T('per il seguente motivo{{esigenza}}', '*', 'per il seguente motivo: {{esigenza}}')]),
        ISTR('istrEsigenza', '(Il presente periodo non si applica', 'mai'),
        ART(3, 'Inadempimento delle modalità di stipula'),
        P('inadempimento', 'Il presente contratto è ricondotto alla durata', se='!breve'),
        P('riacquisto', "In ogni caso, ove il locatore abbia riacquistato", se='!breve'),
        ISTR('istrInadempimento', '(Il presente articolo non si applica', 'breve'),
        ART(4, 'Canone'),
        P('canone', 'A. Il canone di locazione è convenuto in euro', ['canone', 'altroPagamento', 'numeroRate', 'importoRata', 'dateRate'], se='breve|!comuneGrande',
          scelte=[pagamento('nel domicilio del locatore ovvero a mezzo di bonifico bancario, ovvero {{altroPagamento}}')]),
        P('canoneAccordo', 'B. Nei Comuni con un numero di abitanti superiore a diecimila', ['accordoDepositato', 'accordoComune', 'integrativoTra', 'integrativoData', 'canone', 'altroPagamento', 'numeroRate', 'importoRata', 'dateRate'], se='!breve&comuneGrande&!senzaAccordo',
          scelte=[pagamento('nel domicilio del locatore ovvero a mezzo di bonifico bancario, ovvero {{altroPagamento}}')],
          togli=[T(', ovvero dall’Accordo integrativo (7) sottoscritto tra{{integrativoTra}} in data{{integrativoData}}', '!integrativoTra')]),
        ISTR('istrCanoneAccordo', '(Il periodo B non si applica', 'mai'),
        P('canoneDecreto', "C. Il canone di locazione, secondo quanto stabilito dal decreto", ['canone', 'altroPagamento', 'numeroRate', 'importoRata', 'dateRate'], se='!breve&comuneGrande&senzaAccordo',
          scelte=[pagamento('nel domicilio del locatore ovvero a mezzo di bonifico bancario ovvero{{altroPagamento}}')]),
        ISTR('istrCanoneDecreto', '(Il periodo C non si applica', 'mai'),
        ART(5, 'Deposito cauzionale e altre forme di garanzia'),
        P('deposito', 'A garanzia delle obbligazioni assunte', ['depositoEuro', 'depositoMensilita'], scelte=[S('depositoVersato', 'versa/non versa (4)', si='versa', no='non versa')]),
        P('garanzie', 'Altre forme di garanzia', ['altreGaranzie'], se='altreGaranzie'),
        ART(6, 'Oneri accessori'),
        P('oneri', 'Per gli oneri accessori le parti fanno applicazione', se='!breve'),
        P('utenze', 'Sono interamente a carico del conduttore le spese relative ad ogni utenza', ['altreUtenze'], se='!breve', togli=[T(' e altro {{altreUtenze}}', '!altreUtenze')]),
        P('quotaOneri', 'Per le spese di cui al presente articolo', ['quotaOneri'], se='!breve&quotaOneri'),
        ISTR('istrOneri', '(Il presente articolo non si applica', 'breve'),
        ART(7, 'Spese di bollo e registrazione'),
        P('bollo', 'Le spese di bollo per il presente contratto', se='!breve'),
        ISTR('istrBollo', '(Il presente articolo non si applica', 'breve'),
        ART(8, 'Pagamento'),
        P('pagamento', "Il pagamento del canone o di quant'altro"),
        ART(9, 'Uso'),
        P('uso', "L'immobile deve essere destinato esclusivamente", ['conviventi'],
          togli=[T(' e delle seguenti persone attualmente con lui conviventi: {{conviventi}} Salvo', '!conviventi', '. Salvo'),
                 T('conviventi: {{conviventi}} Salvo', 'conviventi', 'conviventi: {{conviventi}}. Salvo')]),
        ART(10, 'Recesso del conduttore'),
        P('recesso', 'Il conduttore ha facoltà di recedere', ['preavvisoRecesso'], se='!breve'),
        ISTR('istrRecesso', '(Il presente articolo non si applica', 'breve'),
        ART(11, 'Consegna'),
        P('consegna', "Il conduttore dichiara di aver visitato"),
        P('stato', 'Le parti danno atto, in relazione allo stato', ['statoImmobile'],
          scelte=[S('consegnaStato', "quanto segue:{{statoImmobile}}/ di quanto risulta dall'allegato verbale di consegna.", **STATO_OPZIONI)]),
        ART(12, 'Modifiche e danni'),
        P('modifiche', 'Il conduttore non può apportare alcuna modifica'),
        ART(13, 'Assemblee'),
        P('assemblee', 'Il conduttore ha diritto di voto', se='!breve'),
        ISTR('istrAssemblee', '(Il presente articolo non si applica', 'breve'),
        ART(14, 'Impianti'),
        P('impiantiUso', 'Il conduttore - in caso d', se='!breve'),
        ISTR('istrImpianti', '(Il presente articolo non si applica', 'breve'),
        ART(15, 'Accesso'),
        P('accesso', "Il conduttore deve consentire l'accesso"),
        P('visite', 'Nel caso in cui il locatore intenda vendere', ['modalitaVisite'], se='!breve', scelte=[VISITE]),
        ISTR('istrVisite', '(Il secondo periodo non si applica', 'mai'),
        ART(16, 'Commissione di negoziazione paritetica e conciliazione stragiudiziale'),
        P('commissione', 'La Commissione di cui all’articolo 6'),
        ART(17, 'Varie'),
        P('varie', 'A tutti gli effetti del presente contratto'),
        P('altreClausole', 'Altre clausole', ['altreClausole'], se='altreClausole'),
        P('firme', 'Letto, approvato e sottoscritto', ['luogoFirma', 'dataFirma', FIRMA, FIRMA], **FIRME),
        P('clausole', 'A mente degli articoli 1341 e 1342', [FIRMA, FIRMA], **CLAUSOLE),
    ],
}

C = {
    'titolo': 'LOCAZIONE ABITATIVA PER STUDENTI UNIVERSITARI',
    'sottotitolo': '(Legge 9 dicembre 1998, n. 431, articolo 5, comma 3)',
    'fonte': 'https://www.gazzettaufficiale.it/do/atto/serie_generale/caricaPdf?cdimg=17A0185800300010110001&dgu=2017-03-15&art.dataPubblicazioneGazzetta=2017-03-15&art.codiceRedazionale=17A01858&art.num=1&art.tiposerie=SG',
    'voci': [
        P('intestazione', 'LOCAZIONE ABITATIVA PER STUDENTI UNIVERSITARI', accapo=[' (Legge']),
        P('parti', 'Il/La (1)', ['locatore', 'assistenteLocatore', 'personaAssistenteLocatore', 'conduttore', 'documentoConduttore', 'assistenteConduttore', 'personaAssistenteConduttore'],
          **parti('Il/La (1)',
                  [S('formaConduttore', 'a (2)', sig='al sig.', sigra='alla sig.ra', soc='a'),
                   S('formaConduttore', 'denominato/ a conduttore, identificato/ a mediante (4)', sig='denominato conduttore, identificato mediante', sigra='denominata conduttore, identificata mediante', soc='denominata conduttore, identificata mediante')],
                  '(assistito/a da (3){{assistenteLocatore}} in persona di {{personaAssistenteLocatore}}) ',
                  ' (assistito/ a da (3) {{assistenteConduttore}}in persona di {{personaAssistenteConduttore}})')),
        P('immobile', 'A) l’unità immobiliare posta in', ['comune', 'via', 'civico', 'piano', 'scala', 'interno', 'vani', 'accessori'], **immobile(ACCESSORI_PARENTESI, 'non ammobiliata/ammobiliata (5)')),
        P('porzione', "B) una porzione dell'unità immobiliare", ['comune', 'via', 'civico', 'piano', 'scala', 'interno', 'vani', 'usoPorzione'], **porzione('modo: (6) {{usoPorzione}}', 'non ammobiliata/ammobiliata (5)')),
        P('catasto', 'a) estremi catastali', ['catasto']),
        P('ape', 'b) prestazione energetica', ['ape']),
        P('impianti', 'c) sicurezza impianti', ['impianti']),
        P('millesimi', 'd) tabelle millesimali', ['millesimiProprieta', 'millesimiRiscaldamento', 'millesimiAcqua', 'millesimiAltre']),
        P('regolata', 'La locazione è regolata'),
        ART(1, 'Durata'),
        P('durata', 'Il contratto è stipulato per la durata di', ['durata', 'dal', 'al'], togli=[T('{{al}} Alla prima', '*', '{{al}}. Alla prima')]),
        ART(2, 'Natura transitoria'),
        P('natura', "Secondo quanto previsto dall'Accordo territoriale", ['accordoTra', 'accordoDepositato', 'accordoComune', 'corso', 'sedeCorso'], chiudi=True),
        ART(3, 'Canone'),
        P('canone', "A. Il canone annuo di locazione, secondo quanto stabilito dall'Accordo", ['accordoTra', 'accordoDepositato', 'accordoComune', 'integrativoTra', 'integrativoData', 'canone', 'altroPagamento', 'numeroRate', 'importoRata', 'dateRate'], se='!senzaAccordo',
          scelte=[pagamento('nel domicilio del locatore ovvero a mezzo di bonifico bancario, ovvero{{altroPagamento}}')],
          togli=[T(', ovvero dell’accordo integrativo sottoscritto tra {{integrativoTra}}(9) in data {{integrativoData}}', '!integrativoTra')]),
        P('canoneDecreto', 'B. Il canone annuo di locazione, secondo quanto stabilito dal decreto', ['canone', 'altroPagamento', 'numeroRate', 'importoRata', 'dateRate'], se='senzaAccordo',
          scelte=[pagamento('nel domicilio del locatore ovvero a mezzo di bonifico bancario, ovvero{{altroPagamento}}')]),
        ART(4, 'Deposito cauzionale e altre forme di garanzia'),
        P('deposito', 'A garanzia delle obbligazioni assunte', ['depositoEuro', 'depositoMensilita'], scelte=[S('depositoVersato', 'versa/non versa (5)', si='versa', no='non versa')]),
        P('garanzie', 'Altre forme di garanzia', ['altreGaranzie'], se='altreGaranzie'),
        ART(5, 'Oneri accessori'),
        P('oneri', 'Per gli oneri accessori le parti fanno applicazione'),
        P('utenze', 'Sono interamente a carico del conduttore le spese relative ad ogni utenza', ['altreUtenze'], togli=[T(' e altro {{altreUtenze}}', '!altreUtenze')]),
        P('quotaOneri', 'Per le spese di cui al presente articolo', ['quotaOneri'], se='quotaOneri'),
        ART(6, 'Spese di bollo e di registrazione'),
        P('bollo', 'Le spese di bollo per il presente contratto'),
        ART(7, 'Pagamento'),
        P('pagamento', "Il pagamento del canone o di quant'altro"),
        ART(8, 'Uso'),
        P('uso', "L'immobile deve essere destinato esclusivamente"),
        ART(9, 'Recesso del conduttore'),
        P('recesso', 'Il conduttore ha facoltà di recedere'),
        P('subentro', 'Le modalità di subentro', ['subentro'], se='subentro', chiudi=True),
        ART(10, 'Consegna'),
        P('consegna', "Il conduttore dichiara di aver visitato"),
        P('stato', "Le parti danno atto, in relazione allo stato", ['statoImmobile'],
          scelte=[S('consegnaStato', "quanto segue: {{statoImmobile}} ovvero di quanto risulta dall'allegato verbale di consegna.", **STATO_OPZIONI)]),
        ART(11, 'Modifiche e danni'),
        P('modifiche', 'Il conduttore non può apportare alcuna modifica'),
        ART(12, 'Assemblee'),
        P('assemblee', 'Il conduttore ha diritto di voto'),
        ART(13, 'Impianti'),
        P('impiantiUso', 'Il conduttore - in caso di'),
        ART(14, 'Accessi'),
        P('accesso', "Il conduttore deve consentire l'accesso"),
        P('visite', 'Nel caso in cui il locatore intenda vendere', ['modalitaVisite'], scelte=[VISITE]),
        ART(15, 'Commissione di negoziazione paritetica e conciliazione stragiudiziale'),
        P('commissione', 'La Commissione di cui all’articolo 6'),
        ART(16, 'Varie'),
        P('varie', 'A tutti gli effetti del presente contratto'),
        P('altreClausole', 'Altre clausole', ['altreClausole'], se='altreClausole'),
        P('firme', 'Letto, approvato e sottoscritto', ['luogoFirma', 'dataFirma', FIRMA, FIRMA], **FIRME),
        P('clausole', 'A mente degli articoli 1341 e 1342', [FIRMA, FIRMA], **CLAUSOLE),
    ],
}

MODELLI = {'A': A, 'B': B, 'C': C}
