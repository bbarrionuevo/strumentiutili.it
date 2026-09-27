// js/contratto-locazione-ui.js — Pagina del contratto di locazione (D.M. 16/01/2017).
//
// Legge il modulo, compone il contratto con js/contratto-locazione.js e lo
// mostra in anteprima mentre si scrive, con gli avvisi su durata, cauzione e
// accordo territoriale. PDF e Word si creano nel browser (librerie in
// /vendor/, caricate solo quando servono). Per la registrazione passa al
// modello RLI solo date e importi: nomi e codici fiscali restano qui.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const PDF_LIB = '/vendor/pdf-lib@1.17.1/pdf-lib.min.js';
  const DOCX_LIB = '/vendor/docx@7.6.0/docx.js';
  const PONTE_RLI = 'su_contratto_ponte_rli';
  const NOMI_MODELLI = { A: 'allegato A (canone concordato)', B: 'allegato B (transitorio)', C: 'allegato C (studenti universitari)' };
  const AIUTO_DURATA = {
    A: 'Minimo tre anni; alla scadenza il contratto è prorogato di diritto di due anni.',
    B: 'Al massimo diciotto mesi. Fino a trenta giorni alcuni articoli non si applicano.',
    C: 'Da sei a trentasei mesi; alla scadenza si rinnova per lo stesso periodo se lo studente non dà disdetta.'
  };
  // come si chiamano, per l'utente, gli spazi rimasti vuoti
  const NOMI_CAMPI = {
    locatore: 'locatore', conduttore: 'conduttore', documentoConduttore: 'documento del conduttore', comune: 'comune', via: 'via', civico: 'numero civico',
    piano: 'piano', scala: 'scala', interno: 'interno', vani: 'vani', usoPorzione: 'uso della porzione', catasto: 'dati catastali', ape: 'prestazione energetica',
    impianti: 'sicurezza degli impianti', millesimiProprieta: 'millesimi di proprietà', millesimiRiscaldamento: 'millesimi di riscaldamento',
    millesimiAcqua: 'millesimi acqua', millesimiAltre: 'altre tabelle millesimali', durata: 'durata', dal: 'inizio', al: 'fine', accordoTra: 'firmatari dell\'accordo',
    accordoDepositato: 'deposito dell\'accordo', accordoComune: 'comune dell\'accordo', canone: 'canone', numeroRate: 'numero di rate', importoRata: 'importo della rata',
    dateRate: 'scadenza delle rate', altroPagamento: 'modo di pagamento', depositoEuro: 'deposito', depositoMensilita: 'mensilità di deposito',
    personaAssistenteLocatore: 'persona dell\'organizzazione del locatore', personaAssistenteConduttore: 'persona dell\'organizzazione del conduttore',
    esigenza: 'esigenza', documentazione: 'documenti allegati', preavvisoRecesso: 'preavviso di recesso', corso: 'corso di studi', sedeCorso: 'università',
    statoImmobile: 'stato dell\'immobile', modalitaVisite: 'modalità delle visite', luogoFirma: 'luogo della firma', dataFirma: 'data della firma',
    integrativoData: 'data dell\'accordo integrativo', assistenteLocatore: 'organizzazione del locatore', assistenteConduttore: 'organizzazione del conduttore'
  };

  document.addEventListener('DOMContentLoaded', () => {
    const K = window.ContrattoLocazione;
    if (!K || !$('ct-app')) return;
    let modelli = null;
    let ultimo = null;

    const val = (id) => { const e = $(id); return e ? String(e.value || '').trim() : ''; };
    const sp = (id) => { const e = $(id); return Boolean(e && e.checked); };
    const tipo = () => { const r = document.querySelector('input[name="ct-tipo"]:checked'); return r ? r.value : 'A'; };

    // "Mario Rossi, nato a Roma il 01/02/1960, residente in Roma, via Po 1, codice fiscale ..."
    function persona(chi) {
      const p = `ct-${chi}`;
      const nome = val(`${p}-nome`);
      if (!nome) return '';
      const forma = val(`${p}-forma`);
      const luogo = [val(`${p}-comune`), val(`${p}-indirizzo`)].filter(Boolean).join(', ');
      const cf = val(`${p}-cf`).toUpperCase();
      const parti = [nome];
      if (forma === 'soc') {
        if (luogo) parti.push('con sede in ' + luogo);
        if (cf) parti.push('codice fiscale o partita IVA ' + cf);
        if (val(`${p}-rappresentante`)) parti.push('in persona del legale rappresentante ' + val(`${p}-rappresentante`));
      } else {
        const nato = forma === 'sigra' ? 'nata' : 'nato';
        const nascita = [val(`${p}-nascita-luogo`) && `a ${val(`${p}-nascita-luogo`)}`, K.dataItaliana(val(`${p}-nascita-data`)) && `il ${K.dataItaliana(val(`${p}-nascita-data`))}`].filter(Boolean).join(' ');
        if (nascita) parti.push(`${nato} ${nascita}`);
        if (luogo) parti.push('residente in ' + luogo);
        if (cf) parti.push('codice fiscale ' + cf);
      }
      return parti.join(', ');
    }

    function raccogli() {
      const t = tipo();
      return {
        formaLocatore: val('ct-locatore-forma'), locatore: persona('locatore'),
        assistenteLocatore: val('ct-locatore-assistente'), personaAssistenteLocatore: val('ct-locatore-assistente-persona'),
        formaConduttore: val('ct-conduttore-forma'), conduttore: persona('conduttore'), documentoConduttore: val('ct-conduttore-documento'),
        assistenteConduttore: val('ct-conduttore-assistente'), personaAssistenteConduttore: val('ct-conduttore-assistente-persona'),
        residenzaStudente: val('ct-conduttore-comune'),
        porzione: val('ct-porzione') === 'porzione', arredo: val('ct-arredo'),
        comune: val('ct-comune'), via: val('ct-via'), civico: val('ct-civico'), piano: val('ct-piano'), scala: val('ct-scala'), interno: val('ct-interno'),
        vani: val('ct-vani'), accessori: val('ct-accessori'), usoPorzione: val('ct-uso-porzione'), catasto: val('ct-catasto'), ape: val('ct-ape'), impianti: val('ct-impianti'),
        millesimiProprieta: val('ct-mill-proprieta'), millesimiRiscaldamento: val('ct-mill-riscaldamento'), millesimiAcqua: val('ct-mill-acqua'), millesimiAltre: val('ct-mill-altre'),
        durata: val('ct-durata'), unitaDurata: t === 'B' ? val('ct-unita') : (t === 'A' ? 'anni' : 'mesi'), dal: val('ct-dal'),
        esigenzaDi: val('ct-esigenza-di'), esigenza: val('ct-esigenza'), documentazione: val('ct-documentazione'), assistita: sp('ct-assistita'), comuneGrande: sp('ct-comune-grande'),
        corso: val('ct-corso'), sedeCorso: val('ct-sede-corso'),
        canoneMensile: val('ct-canone-mensile'), canoneTotale: val('ct-canone-totale'), numeroRate: val('ct-rate'), dateRate: val('ct-date-rate'),
        modoPagamento: val('ct-pagamento'), altroPagamento: val('ct-pagamento-altro'),
        senzaAccordo: sp('ct-senza-accordo'), accordoTra: val('ct-accordo-tra'), accordoDepositato: val('ct-accordo-data'),
        accordoComune: val('ct-accordo-comune') || val('ct-comune'), integrativoTra: val('ct-integrativo-tra'), integrativoData: val('ct-integrativo-data'),
        aggiornamentoIstat: t === 'A' ? val('ct-istat') : '', cedolare: sp('ct-cedolare'),
        depositoMensilita: val('ct-deposito'), depositoVersato: K.numero(val('ct-deposito')) === 0 ? 'no' : 'si', altreGaranzie: val('ct-garanzie'),
        quotaOneri: val('ct-oneri'), periodicitaOneri: val('ct-oneri-periodo'), altreUtenze: val('ct-utenze'),
        conviventi: val('ct-conviventi'), preavvisoRecesso: val('ct-preavviso'), subentro: val('ct-subentro'),
        consegnaStato: val('ct-stato'), statoImmobile: val('ct-stato-descrizione'), visite: val('ct-visite'), modalitaVisite: val('ct-visite-modalita'),
        altreClausole: val('ct-clausole'), luogoFirma: val('ct-luogo'), dataFirma: val('ct-data-firma')
      };
    }

    // ------------------------------------------------------------ campi visibili

    function visibilita(t, d) {
      const f = {
        porzione: d.porzione, breve: K.breve(t, d), senzaAccordo: d.senzaAccordo, integrativoTra: Boolean(d.integrativoTra),
        pagamentoAltro: d.modoPagamento === 'altro', statoDescritto: d.consegnaStato === 'descrizione', visiteAltre: d.visite === 'altre',
        assistenteLocatore: Boolean(d.assistenteLocatore), assistenteConduttore: Boolean(d.assistenteConduttore),
        locatorePersona: d.formaLocatore !== 'soc', locatoreSocieta: d.formaLocatore === 'soc',
        conduttorePersona: d.formaConduttore !== 'soc', conduttoreSocieta: d.formaConduttore === 'soc'
      };
      document.querySelectorAll('#ct-app [data-modelli]').forEach((el) => { el.hidden = !el.getAttribute('data-modelli').split(' ').includes(t); });
      document.querySelectorAll('#ct-app [data-se]').forEach((el) => {
        if (el.hasAttribute('data-modelli') && el.hidden) return;
        el.hidden = !K.vale(el.getAttribute('data-se'), f);
      });
      const durata = $('ct-durata');
      const etichetta = document.querySelector('label[for="ct-durata"]');
      if (etichetta) etichetta.textContent = durata.getAttribute('data-etichetta-' + t.toLowerCase());
      if ($('ct-durata-aiuto')) $('ct-durata-aiuto').textContent = AIUTO_DURATA[t];
      const c = K.calcola(t, d);
      $('ct-rate').placeholder = String(c.numeroRate);
      $('ct-accordo-comune').placeholder = d.comune || '';
    }

    // ------------------------------------------------------------ anteprima

    function paragrafo(testo, classe, evidenzia) {
      const p = document.createElement('p');
      p.className = classe;
      const pezzi = testo.split(K.PUNTINI);
      pezzi.forEach((pezzo, i) => {
        p.appendChild(document.createTextNode(pezzo));
        if (i < pezzi.length - 1) {
          if (evidenzia) {
            const m = document.createElement('mark');
            m.className = 'bg-amber-100 text-amber-900 rounded px-0.5';
            m.textContent = K.PUNTINI;
            p.appendChild(m);
          } else p.appendChild(document.createTextNode(K.PUNTINI));
        }
      });
      return p;
    }

    function disegna(blocchi) {
      const box = $('ct-anteprima');
      box.textContent = '';
      const classi = {
        titolo: 'text-center font-bold text-gray-900 text-base', sottotitolo: 'text-center text-xs text-gray-600 mb-3',
        articolo: 'text-center font-bold text-gray-900 whitespace-pre-line mt-4', paragrafo: 'text-gray-800 whitespace-pre-line',
        firme: 'text-gray-800 whitespace-pre-line mt-3', nota: 'text-gray-500 italic'
      };
      for (const b of blocchi) box.appendChild(paragrafo(b.testo, classi[b.k] || classi.paragrafo, b.k !== 'firme'));
    }

    function disegnaAvvisi(avvisi, mancanti) {
      const ul = $('ct-avvisi');
      ul.textContent = '';
      for (const a of avvisi) {
        const li = document.createElement('li');
        li.className = 'rounded-lg border p-3 text-xs leading-relaxed ' + (a.livello === 'errore' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900');
        const forte = document.createElement('strong');
        forte.textContent = a.livello === 'errore' ? 'Da correggere: ' : 'Attenzione: ';
        li.appendChild(forte);
        li.appendChild(document.createTextNode(a.testo + ' '));
        const fonte = document.createElement('span');
        fonte.className = 'opacity-75';
        fonte.textContent = '(' + a.fonte + ')';
        li.appendChild(fonte);
        ul.appendChild(li);
      }
      const nomi = mancanti.map((m) => NOMI_CAMPI[m] || m);
      $('ct-mancanti').textContent = nomi.length
        ? `Restano ${nomi.length} spazi con i puntini (${nomi.slice(0, 8).join(', ')}${nomi.length > 8 ? '…' : ''}): puoi scaricare il contratto anche così e completarli a penna.`
        : 'Tutti gli spazi del modello sono compilati.';
    }

    function aggiorna() {
      if (!modelli) return;
      const t = tipo();
      const d = raccogli();
      visibilita(t, d);
      const c = K.calcola(t, d);
      $('ct-fine').textContent = c.al ? `Fine del contratto: ${K.dataItaliana(c.al)}` + (t === 'A' ? ', poi proroga di diritto di due anni.' : '.') : '';
      const riepilogo = [];
      if (c.canone) riepilogo.push(`${t === 'B' ? 'Canone per la durata' : 'Canone annuo'}: ${K.euro(c.canone)} €, in ${c.numeroRate} rate da ${K.euro(c.importoRata)} €`);
      if (c.deposito !== null && K.numero(d.depositoMensilita)) riepilogo.push(`deposito: ${K.euro(c.deposito)} €`);
      $('ct-riepilogo').textContent = riepilogo.join('; ') + (riepilogo.length ? '.' : '');
      const { blocchi, mancanti } = K.componi(modelli[t], t, d);
      ultimo = { t, d, c, blocchi };
      disegna(blocchi);
      disegnaAvvisi(K.controlla(t, d), mancanti);
      $('ct-modello-nome').textContent = NOMI_MODELLI[t];
    }

    let attesa = null;
    const presto = () => { clearTimeout(attesa); attesa = setTimeout(aggiorna, 120); };
    $('ct-app').addEventListener('input', presto);
    $('ct-app').addEventListener('change', presto);

    // ------------------------------------------------------------ file

    function carica(src, globale) {
      if (window[globale]) return Promise.resolve(window[globale]);
      return new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => (window[globale] ? ok(window[globale]) : ko(new Error('Libreria non disponibile.')));
        s.onerror = () => ko(new Error('Non riesco a caricare il generatore: controlla la connessione.'));
        document.head.appendChild(s);
      });
    }

    function nomeFile(est) {
      const pulito = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return ['Contratto-locazione', ultimo.t === 'A' ? 'canone-concordato' : ultimo.t === 'B' ? 'transitorio' : 'studenti', pulito(ultimo.d.comune)].filter(Boolean).join('_') + '.' + est;
    }

    function scarica(blob, nome) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Helvetica ha la codifica WinAnsi: le lettere fuori da quel set diventano la lettera base
    function testoSicuro(v) {
      const ok = (ch) => { const c = ch.charCodeAt(0); return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.includes(ch); };
      return Array.from(String(v || '')).map((ch) => (ok(ch) ? ch : (ok(ch.normalize('NFD').charAt(0)) ? ch.normalize('NFD').charAt(0) : '?'))).join('');
    }

    async function creaPdf() {
      const { PDFDocument, StandardFonts, rgb } = await carica(PDF_LIB, 'PDFLib');
      const doc = await PDFDocument.create();
      doc.setTitle('Contratto di locazione - ' + NOMI_MODELLI[ultimo.t]);
      doc.setCreator('StrumentiUtili.it');
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
      const L = 595.28, H = 841.89, M = 56, utile = L - 2 * M;
      let pagina = doc.addPage([L, H]);
      let y = H - M;
      const nuova = () => { pagina = doc.addPage([L, H]); y = H - M; };
      const righe = (testo, f, dim) => {
        const out = [];
        for (const riga of String(testo).split('\n').map(testoSicuro)) {
          let cur = '';
          for (const parola of riga.split(' ')) {
            const prova = cur ? cur + ' ' + parola : parola;
            if (f.widthOfTextAtSize(prova, dim) > utile && cur) { out.push(cur); cur = parola; } else cur = prova;
          }
          out.push(cur);
        }
        return out;
      };
      const scrivi = (testo, { f = font, dim = 10.5, centro = false, dopo = 7, colore = rgb(0.1, 0.1, 0.1) } = {}) => {
        const passo = dim * 1.38;
        const rr = righe(testo, f, dim);
        if (y - passo * Math.min(rr.length, 2) < M + 20) nuova(); // niente titolo o prima riga isolati in fondo
        for (const r of rr) {
          if (y < M + 20) nuova();
          const x = centro ? M + (utile - f.widthOfTextAtSize(r, dim)) / 2 : M;
          pagina.drawText(r, { x, y, size: dim, font: f, color: colore });
          y -= passo;
        }
        y -= dopo;
      };
      for (const b of ultimo.blocchi) {
        if (b.k === 'titolo') scrivi(b.testo, { f: grassetto, dim: 13, centro: true, dopo: 2 });
        else if (b.k === 'sottotitolo') scrivi(b.testo, { dim: 9.5, centro: true, dopo: 14 });
        else if (b.k === 'articolo') { y -= 4; scrivi(b.testo, { f: grassetto, dim: 10.5, centro: true, dopo: 4 }); }
        else if (b.k === 'nota') scrivi(b.testo, { dim: 9.5, colore: rgb(0.35, 0.35, 0.35) });
        else if (b.k === 'firme') scrivi(b.testo.replace(/\n/g, '\n\n'), { dopo: 12 });
        else scrivi(b.testo);
      }
      const pagine = doc.getPages();
      pagine.forEach((p, i) => {
        const piede = testoSicuro(`Contratto di locazione, tipo ministeriale ${NOMI_MODELLI[ultimo.t]} del D.M. 16 gennaio 2017 - pagina ${i + 1} di ${pagine.length}`);
        p.drawText(piede, { x: M, y: 28, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });
      });
      return new Blob([await doc.save()], { type: 'application/pdf' });
    }

    async function creaDocx() {
      const D = await carica(DOCX_LIB, 'docx');
      const { Document, Packer, Paragraph, TextRun, AlignmentType } = D;
      const figli = [];
      for (const b of ultimo.blocchi) {
        const centro = b.k === 'titolo' || b.k === 'sottotitolo' || b.k === 'articolo';
        const righe = b.testo.split('\n');
        righe.forEach((riga, i) => figli.push(new Paragraph({
          alignment: centro ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { after: i === righe.length - 1 ? (b.k === 'firme' ? 240 : 140) : (b.k === 'firme' ? 240 : 0), before: b.k === 'articolo' && i === 0 ? 120 : 0 },
          children: [new TextRun({ text: riga, bold: b.k === 'titolo' || b.k === 'articolo', italics: b.k === 'nota', size: b.k === 'titolo' ? 26 : b.k === 'sottotitolo' ? 19 : 21 })]
        })));
      }
      const doc = new Document({
        creator: 'StrumentiUtili.it',
        title: 'Contratto di locazione - ' + NOMI_MODELLI[ultimo.t],
        styles: { default: { document: { run: { font: 'Calibri' } } } },
        sections: [{ children: figli }]
      });
      return Packer.toBlob(doc);
    }

    async function conStato(bottone, lavoro, fatto) {
      const stato = $('ct-stato');
      bottone.disabled = true;
      stato.textContent = 'Preparo il documento…';
      try {
        aggiorna();
        await lavoro();
        stato.textContent = fatto;
      } catch (e) {
        stato.textContent = 'Non è stato possibile creare il documento: ' + (e && e.message ? e.message : 'errore sconosciuto') + '.';
      } finally {
        bottone.disabled = false;
      }
    }

    $('ct-pdf').addEventListener('click', (ev) => conStato(ev.currentTarget, async () => scarica(await creaPdf(), nomeFile('pdf')),
      'PDF scaricato: rileggilo, stampalo in due copie e firmate ogni pagina.'));
    $('ct-docx').addEventListener('click', (ev) => conStato(ev.currentTarget, async () => scarica(await creaDocx(), nomeFile('docx')),
      'File Word scaricato: puoi modificarlo prima di stamparlo.'));
    $('ct-rli').addEventListener('click', () => {
      aggiorna();
      const { t, d, c } = ultimo;
      try {
        localStorage.setItem(PONTE_RLI, JSON.stringify({
          tipo: t, dal: d.dal || '', al: c.al || '', canone: c.canoneRli ? Math.floor(c.canoneRli) : '',
          dataStipula: d.dataFirma || '', cedolare: Boolean(d.cedolare), salvato: new Date().toISOString().slice(0, 10)
        }));
      } catch (e) { /* senza memoria il modello RLI si compila a mano */ }
      window.location.href = '/cittadino-tasse/modello-rli/#ponte-contratto';
    });

    // ------------------------------------------------------------ avvio

    fetch('/data/contratti-tipo-dm-2017.json')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((dati) => { modelli = dati.modelli; aggiorna(); })
      .catch(() => { $('ct-mancanti').textContent = 'Non riesco a caricare i testi dei modelli: controlla la connessione e ricarica la pagina.'; });
  });
})();
