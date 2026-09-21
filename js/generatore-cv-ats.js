// js/generatore-cv-ats.js — Generatore CV ATS-Friendly (Zero-Backend)
(function () {
  'use strict';

  const STORAGE_KEY = 'cv_ats_state';
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const SEZIONI = {
    profilo: 'Profilo Professionale',
    esperienza: 'Esperienza Lavorativa',
    istruzione: 'Istruzione',
    competenze: 'Competenze'
  };
  const TESTO_GDPR = 'Autorizzo il trattamento dei dati personali contenuti nel mio curriculum vitae ai sensi del D.Lgs. 196/2003 e del Regolamento UE 2016/679 (GDPR).';
  const PREFISSO_FOTO = 'data:image/jpeg;base64,';

  // ==============================================================
  // STATO (struttura curriculumVitae del documento di specifica)
  // ==============================================================
  function statoVuoto() {
    return {
      curriculumVitae: {
        candidato: {
          nomeCognome: '',
          titoloProfessionale: '',
          contattiNelBody: { email: '', telefono: '', posizione: '', linkRilevanti: [] }
        },
        profiloProfessionale: '',
        esperienzaLavorativa: [],
        istruzione: [],
        competenze: { hardSkills: '', lingue: '' }
      },
      opzioni: { fotoAttiva: false, foto: null, autorizzazioneGdpr: true }
    };
  }

  function statoEsempio() {
    const s = statoVuoto();
    s.curriculumVitae = {
      candidato: {
        nomeCognome: 'Giulia Bianchi',
        titoloProfessionale: 'Sviluppatrice Backend Senior',
        contattiNelBody: {
          email: 'giulia.bianchi@esempio.it',
          telefono: '+39 333 9876543',
          posizione: 'Roma, Italia',
          linkRilevanti: ['linkedin.com/in/giuliabianchi', 'github.com/giuliabianchi']
        }
      },
      profiloProfessionale: 'Ingegnere del software con 6 anni di esperienza nella progettazione di architetture distribuite e API ad alte prestazioni. Specializzata in Node.js e PostgreSQL, con particolare attenzione a sicurezza, scalabilità e ottimizzazione dei costi infrastrutturali.',
      esperienzaLavorativa: [
        {
          ruolo: 'Software Architect',
          datoreDiLavoro: 'Tech Solutions SpA',
          luogo: 'Roma',
          dataInizio: '02/2023',
          dataFine: 'Presente',
          descrizioneTestuale: 'Progettazione di microservizi in ambiente Node.js per una piattaforma con 2 milioni di utenti.\n- Ottimizzazione delle query PostgreSQL con riduzione dei tempi di risposta del 40%\n- Coordinamento tecnico di un team di 5 sviluppatori',
          tecnologie: 'Node.js, TypeScript, PostgreSQL'
        },
        {
          ruolo: 'Sviluppatrice Backend',
          datoreDiLavoro: 'Digital Factory Srl',
          luogo: 'Milano',
          dataInizio: '11/2021',
          dataFine: '01/2023',
          descrizioneTestuale: '- Sviluppo di API REST per servizi di pagamento\n- Migrazione di un monolite verso container Docker',
          tecnologie: 'Node.js, Docker, Redis'
        }
      ],
      istruzione: [
        {
          titoloConseguito: 'Laurea Magistrale in Ingegneria Informatica',
          istituto: 'Università degli Studi di Roma La Sapienza',
          dataInizio: '09/2016',
          dataFine: '10/2021'
        }
      ],
      competenze: {
        hardSkills: 'Architettura di Sistema, Zero-Backend Design, Ottimizzazione OCR',
        lingue: 'Italiano (Madrelingua), Inglese (C1 - IELTS)'
      }
    };
    return s;
  }

  function normalizzaStato(raw) {
    const base = statoVuoto();
    if (!raw || typeof raw !== 'object' || !raw.curriculumVitae) return base;
    const cv = raw.curriculumVitae;
    const c = cv.candidato || {};
    const k = c.contattiNelBody || {};
    const str = (v) => (typeof v === 'string' ? v : '');
    base.curriculumVitae.candidato.nomeCognome = str(c.nomeCognome);
    base.curriculumVitae.candidato.titoloProfessionale = str(c.titoloProfessionale);
    base.curriculumVitae.candidato.contattiNelBody = {
      email: str(k.email),
      telefono: str(k.telefono),
      posizione: str(k.posizione),
      linkRilevanti: Array.isArray(k.linkRilevanti) ? k.linkRilevanti.filter(x => typeof x === 'string') : []
    };
    base.curriculumVitae.profiloProfessionale = str(cv.profiloProfessionale);
    base.curriculumVitae.esperienzaLavorativa = Array.isArray(cv.esperienzaLavorativa) ? cv.esperienzaLavorativa.filter(x => x && typeof x === 'object') : [];
    base.curriculumVitae.istruzione = Array.isArray(cv.istruzione) ? cv.istruzione.filter(x => x && typeof x === 'object') : [];
    base.curriculumVitae.competenze = { hardSkills: str((cv.competenze || {}).hardSkills), lingue: str((cv.competenze || {}).lingue) };
    const o = raw.opzioni || {};
    base.opzioni.fotoAttiva = o.fotoAttiva === true;
    base.opzioni.foto = typeof o.foto === 'string' && o.foto.indexOf(PREFISSO_FOTO) === 0 ? o.foto : null;
    base.opzioni.autorizzazioneGdpr = o.autorizzazioneGdpr !== false;
    return base;
  }

  // ==============================================================
  // TESTO COMPATIBILE PDF (WinAnsi): evita glifi errati che corrompono il parsing
  // ==============================================================
  const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  // Lettere che la normalizzazione NFD non scompone in lettera base + segno
  const LETTERE_SENZA_SCOMPOSIZIONE = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'ı': 'i', 'Ħ': 'H', 'ħ': 'h' };

  function testoSicuro(valore) {
    return String(valore == null ? '' : valore)
      .normalize('NFC')
      .replace(/\r\n?/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[‐-‒−]/g, '-')
      .split('')
      // Le lettere fuori da WinAnsi con segni diacritici (es. «Ș», «ğ», «ă») diventano la lettera base invece di sparire: «Ștefan» → «Stefan», non «tefan»
      .map(ch => (carattereWinAnsi(ch) ? ch : (LETTERE_SENZA_SCOMPOSIZIONE[ch] || (carattereWinAnsi(ch.normalize('NFD').charAt(0)) ? ch.normalize('NFD').charAt(0) : ''))))
      .join('');
  }

  function carattereWinAnsi(ch) {
    const c = ch.charCodeAt(0);
    return ch === '\n' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.indexOf(ch) !== -1;
  }

  // ==============================================================
  // DATE: stato "MM/YYYY" | "YYYY" | "Presente" -> "Mese Anno"
  // ==============================================================
  function componiData(mese, anno) {
    const a = String(anno || '').trim();
    if (!/^\d{4}$/.test(a)) return '';
    return mese ? mese + '/' + a : a;
  }

  function scomponiData(valore) {
    const m = /^(\d{2})\/(\d{4})$/.exec(valore || '');
    if (m && +m[1] >= 1 && +m[1] <= 12) return { mese: m[1], anno: m[2] };
    if (/^\d{4}$/.test(valore || '')) return { mese: '', anno: valore };
    return { mese: '', anno: '' };
  }

  function formatData(valore) {
    if (valore === 'Presente') return 'Presente';
    const d = scomponiData(valore);
    if (!d.anno) return '';
    return d.mese ? MESI[+d.mese - 1] + ' ' + d.anno : d.anno;
  }

  function formatPeriodo(inizio, fine) {
    const a = formatData(inizio);
    const b = formatData(fine);
    return a && b ? a + ' - ' + b : (a || b);
  }

  // ==============================================================
  // MODELLO DI IMPAGINAZIONE: unica fonte per anteprima e PDF
  // ==============================================================
  function righe(testo) {
    return testoSicuro(testo).split('\n')
      .map(r => r.trim())
      .filter(Boolean)
      .map(r => (/^[-•*]\s*/.test(r)
        ? { tipo: 'punto', testo: r.replace(/^[-•*]\s*/, '') }
        : { tipo: 'paragrafo', testo: r }));
  }

  function pulito(v) {
    return testoSicuro(v).replace(/\s*\n\s*/g, ' ').trim();
  }

  function costruisciModello(stato) {
    const cv = stato.curriculumVitae;
    const k = cv.candidato.contattiNelBody;
    const sezioni = [];

    const profilo = righe(cv.profiloProfessionale);
    if (profilo.length) sezioni.push({ titolo: SEZIONI.profilo, voci: [{ paragrafi: profilo }] });

    const esperienze = cv.esperienzaLavorativa.map(e => ({
      titolo: pulito(e.ruolo),
      sottotitolo: [pulito(e.datoreDiLavoro), pulito(e.luogo)].filter(Boolean).join(', '),
      periodo: formatPeriodo(e.dataInizio, e.dataFine),
      paragrafi: righe(e.descrizioneTestuale),
      nota: pulito(e.tecnologie) ? 'Tecnologie: ' + pulito(e.tecnologie) : ''
    })).filter(v => v.titolo || v.sottotitolo || v.periodo || v.paragrafi.length || v.nota);
    if (esperienze.length) sezioni.push({ titolo: SEZIONI.esperienza, voci: esperienze });

    const istruzione = cv.istruzione.map(i => ({
      titolo: pulito(i.titoloConseguito),
      sottotitolo: pulito(i.istituto),
      periodo: formatPeriodo(i.dataInizio, i.dataFine),
      paragrafi: [],
      nota: ''
    })).filter(v => v.titolo || v.sottotitolo || v.periodo);
    if (istruzione.length) sezioni.push({ titolo: SEZIONI.istruzione, voci: istruzione });

    const competenze = [];
    if (pulito(cv.competenze.hardSkills)) competenze.push({ tipo: 'paragrafo', testo: 'Competenze tecniche: ' + pulito(cv.competenze.hardSkills) });
    if (pulito(cv.competenze.lingue)) competenze.push({ tipo: 'paragrafo', testo: 'Lingue: ' + pulito(cv.competenze.lingue) });
    if (competenze.length) sezioni.push({ titolo: SEZIONI.competenze, voci: [{ paragrafi: competenze }] });

    const nome = pulito(cv.candidato.nomeCognome);
    return {
      nome: nome,
      titolo: pulito(cv.candidato.titoloProfessionale),
      contatti: [k.email, k.telefono, k.posizione].map(pulito).filter(Boolean).join(' | '),
      link: k.linkRilevanti.map(pulito).filter(Boolean).join(' | '),
      foto: stato.opzioni.fotoAttiva && stato.opzioni.foto ? stato.opzioni.foto : null,
      sezioni: sezioni,
      gdpr: stato.opzioni.autorizzazioneGdpr ? TESTO_GDPR : '',
      meta: {
        titolo: nome ? 'Curriculum Vitae - ' + nome : 'Curriculum Vitae',
        paroleChiave: pulito(cv.competenze.hardSkills)
      }
    };
  }

  // Esportazione per test in Node
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { costruisciModello, statoEsempio, statoVuoto, normalizzaStato, formatPeriodo, testoSicuro, componiData };
  }
  if (typeof document === 'undefined') return;

  // ==============================================================
  // PERSISTENZA LOCALE
  // ==============================================================
  const archivio = {
    carica() {
      try {
        if (window.AppStorage) return window.AppStorage.load(STORAGE_KEY, null);
        const raw = localStorage.getItem('su_' + STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    salva(stato) {
      try {
        if (window.AppStorage) return window.AppStorage.save(STORAGE_KEY, stato);
        localStorage.setItem('su_' + STORAGE_KEY, JSON.stringify(stato));
      } catch (e) { console.warn('[CV] Salvataggio locale non riuscito:', e); }
    },
    elimina() {
      try {
        if (window.AppStorage) return window.AppStorage.remove(STORAGE_KEY);
        localStorage.removeItem('su_' + STORAGE_KEY);
      } catch (e) { /* noop */ }
    }
  };

  // ==============================================================
  // DOM
  // ==============================================================
  let builder, preview, btnDownload, status, fotoPanel, fotoThumb, listaEsp, listaIstr, tplEsp, tplIstr;
  let fotoCorrente = null;
  let timerAggiornamento = null;

  function cacheDom() {
    builder = document.getElementById('cv-builder');
    preview = document.getElementById('cv-preview');
    btnDownload = document.getElementById('cv-download');
    status = document.getElementById('cv-status');
    fotoPanel = document.getElementById('cv-foto-panel');
    fotoThumb = document.getElementById('cv-foto-thumb');
    listaEsp = document.getElementById('cv-lista-esperienze');
    listaIstr = document.getElementById('cv-lista-istruzione');
    tplEsp = document.getElementById('tpl-esperienza');
    tplIstr = document.getElementById('tpl-istruzione');
  }

  function opzione(nome) {
    return builder.querySelector('[data-opt="' + nome + '"]');
  }

  function impostaPercorso(obj, percorso, valore) {
    const parti = percorso.split('.');
    let nodo = obj;
    for (let i = 0; i < parti.length - 1; i++) nodo = nodo[parti[i]];
    nodo[parti[parti.length - 1]] = valore;
  }

  function leggiPercorso(obj, percorso) {
    return percorso.split('.').reduce((nodo, chiave) => (nodo == null ? nodo : nodo[chiave]), obj);
  }

  function campiVoce(item) {
    const campi = {};
    item.querySelectorAll('[data-field]').forEach(el => {
      campi[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return campi;
  }

  function leggiStatoDalDom() {
    const stato = statoVuoto();
    const cv = stato.curriculumVitae;

    builder.querySelectorAll('[data-cv]').forEach(el => {
      const percorso = el.dataset.cv;
      const valore = percorso === 'candidato.contattiNelBody.linkRilevanti'
        ? el.value.split('\n').map(x => x.trim()).filter(Boolean)
        : el.value;
      impostaPercorso(cv, percorso, valore);
    });

    cv.esperienzaLavorativa = Array.from(listaEsp.children).map(item => {
      const f = campiVoce(item);
      return {
        ruolo: f.ruolo,
        datoreDiLavoro: f.datoreDiLavoro,
        luogo: f.luogo,
        dataInizio: componiData(f.inizioMese, f.inizioAnno),
        dataFine: f.inCorso ? 'Presente' : componiData(f.fineMese, f.fineAnno),
        descrizioneTestuale: f.descrizioneTestuale,
        tecnologie: f.tecnologie
      };
    });

    cv.istruzione = Array.from(listaIstr.children).map(item => {
      const f = campiVoce(item);
      return {
        titoloConseguito: f.titoloConseguito,
        istituto: f.istituto,
        dataInizio: componiData(f.inizioMese, f.inizioAnno),
        dataFine: f.inCorso ? 'Presente' : componiData(f.fineMese, f.fineAnno)
      };
    });

    stato.opzioni.fotoAttiva = opzione('fotoAttiva').checked;
    stato.opzioni.foto = fotoCorrente;
    stato.opzioni.autorizzazioneGdpr = opzione('autorizzazioneGdpr').checked;
    return stato;
  }

  function popolaMesi(select) {
    const vuota = document.createElement('option');
    vuota.value = '';
    vuota.textContent = 'Mese';
    select.appendChild(vuota);
    MESI.forEach((nome, i) => {
      const opt = document.createElement('option');
      opt.value = String(i + 1).padStart(2, '0');
      opt.textContent = nome;
      select.appendChild(opt);
    });
  }

  function aggiornaCampiFine(item) {
    const inCorso = item.querySelector('[data-field="inCorso"]').checked;
    item.querySelector('[data-field="fineMese"]').disabled = inCorso;
    item.querySelector('[data-field="fineAnno"]').disabled = inCorso;
  }

  function aggiungiVoce(tipo, dati) {
    const tpl = tipo === 'esperienza' ? tplEsp : tplIstr;
    const lista = tipo === 'esperienza' ? listaEsp : listaIstr;
    const item = tpl.content.firstElementChild.cloneNode(true);
    item.querySelectorAll('select').forEach(popolaMesi);

    const d = dati || {};
    const inizio = scomponiData(d.dataInizio);
    const fine = scomponiData(d.dataFine);
    const valori = Object.assign({}, d, {
      inizioMese: inizio.mese,
      inizioAnno: inizio.anno,
      fineMese: fine.mese,
      fineAnno: fine.anno
    });

    item.querySelectorAll('[data-field]').forEach(el => {
      const campo = el.dataset.field;
      if (campo === 'inCorso') el.checked = d.dataFine === 'Presente';
      else if (typeof valori[campo] === 'string') el.value = valori[campo];
    });
    aggiornaCampiFine(item);
    lista.appendChild(item);
    return item;
  }

  function scriviStatoNelDom(stato) {
    const cv = stato.curriculumVitae;
    builder.querySelectorAll('[data-cv]').forEach(el => {
      const valore = leggiPercorso(cv, el.dataset.cv);
      el.value = Array.isArray(valore) ? valore.join('\n') : (valore || '');
    });

    listaEsp.replaceChildren();
    listaIstr.replaceChildren();
    cv.esperienzaLavorativa.forEach(e => aggiungiVoce('esperienza', e));
    cv.istruzione.forEach(i => aggiungiVoce('istruzione', i));

    opzione('fotoAttiva').checked = stato.opzioni.fotoAttiva;
    opzione('autorizzazioneGdpr').checked = stato.opzioni.autorizzazioneGdpr;
    fotoCorrente = stato.opzioni.foto;
    aggiornaPannelloFoto();
  }

  function aggiornaPannelloFoto() {
    fotoPanel.classList.toggle('hidden', !opzione('fotoAttiva').checked);
    if (fotoCorrente) {
      fotoThumb.src = fotoCorrente;
      fotoThumb.classList.remove('hidden');
    } else {
      fotoThumb.removeAttribute('src');
      fotoThumb.classList.add('hidden');
    }
  }

  // ==============================================================
  // ANTEPRIMA
  // ==============================================================
  function el(tag, classe, testo) {
    const nodo = document.createElement(tag);
    if (classe) nodo.className = classe;
    if (testo != null) nodo.textContent = testo;
    return nodo;
  }

  function renderAnteprima(m) {
    const frammento = document.createDocumentFragment();

    if (!m.nome && !m.contatti && !m.sezioni.length) {
      frammento.appendChild(el('p', 'cv-vuoto', 'Inizia a compilare il modulo: l\'anteprima del tuo CV apparirà qui.'));
      preview.replaceChildren(frammento);
      return;
    }

    if (m.foto) {
      const img = el('img', 'cv-foto');
      img.src = m.foto;
      img.alt = 'Fototessera';
      frammento.appendChild(img);
    }
    frammento.appendChild(el('h1', 'cv-nome', m.nome || 'Nome e cognome'));
    if (m.titolo) frammento.appendChild(el('p', 'cv-titolo', m.titolo));
    if (m.contatti) frammento.appendChild(el('p', 'cv-contatti', m.contatti));
    if (m.link) frammento.appendChild(el('p', 'cv-contatti', m.link));

    m.sezioni.forEach(sezione => {
      frammento.appendChild(el('h2', 'cv-sezione', sezione.titolo));
      sezione.voci.forEach(voce => {
        const box = el('div', 'cv-voce');
        if (voce.titolo) box.appendChild(el('p', 'cv-voce-titolo', voce.titolo));
        if (voce.sottotitolo) box.appendChild(el('p', 'cv-par', voce.sottotitolo));
        if (voce.periodo) box.appendChild(el('p', 'cv-periodo', voce.periodo));
        (voce.paragrafi || []).forEach(p => {
          box.appendChild(p.tipo === 'punto' ? el('p', 'cv-bullet', '• ' + p.testo) : el('p', 'cv-par', p.testo));
        });
        if (voce.nota) box.appendChild(el('p', 'cv-par', voce.nota));
        frammento.appendChild(box);
      });
    });

    if (m.gdpr) frammento.appendChild(el('p', 'cv-gdpr', m.gdpr));
    preview.replaceChildren(frammento);
  }

  function aggiorna() {
    const stato = leggiStatoDalDom();
    archivio.salva(stato);
    renderAnteprima(costruisciModello(stato));
  }

  function pianificaAggiornamento() {
    clearTimeout(timerAggiornamento);
    timerAggiornamento = setTimeout(aggiorna, 200);
  }

  // ==============================================================
  // FOTO: ritaglio 35x45 sul thread principale (unica operazione su canvas)
  // ==============================================================
  async function preparaFoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Immagine non leggibile.'));
        i.src = url;
      });
      const W = 350, H = 450, rapporto = W / H;
      let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
      if (sw / sh > rapporto) {
        sw = sh * rapporto;
        sx = (img.naturalWidth - sw) / 2;
      } else {
        sh = sw / rapporto;
        // Leggermente sopra il centro: nei ritratti il volto sta nel terzo superiore
        sy = (img.naturalHeight - sh) * 0.3;
      }
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      return canvas.toDataURL('image/jpeg', 0.85);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function gestisciFileFoto(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      mostraStato('Formato non supportato: usa un\'immagine JPG, PNG o WebP.', 'errore');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      mostraStato('L\'immagine supera i 10 MB.', 'errore');
      return;
    }
    try {
      fotoCorrente = await preparaFoto(file);
      aggiornaPannelloFoto();
      aggiorna();
      mostraStato('', '');
    } catch (err) {
      mostraStato(err.message, 'errore');
    }
  }

  // ==============================================================
  // PDF IN WEB WORKER (la composizione non blocca l'interfaccia)
  // ==============================================================
  let pdfWorker = null;
  let richiestaId = 0;

  function mostraStato(testo, tipo) {
    status.textContent = testo;
    status.style.color = tipo === 'errore' ? '#b91c1c' : (tipo === 'ok' ? '#047857' : '#4b5563');
  }

  function generaPdf(modello) {
    return new Promise((resolve, reject) => {
      if (!pdfWorker) pdfWorker = new Worker('/js/workers/cv-pdf-worker.js');
      const id = ++richiestaId;
      const worker = pdfWorker;

      function pulisci() {
        worker.removeEventListener('message', onMessaggio);
        worker.removeEventListener('error', onErrore);
      }
      function onMessaggio(e) {
        if (!e.data || e.data.id !== id) return;
        pulisci();
        if (e.data.type === 'success') resolve(e.data.buffer);
        else reject(new Error(e.data.msg || 'Errore nella generazione del PDF.'));
      }
      function onErrore(e) {
        pulisci();
        worker.terminate();
        pdfWorker = null;
        reject(new Error((e && e.message) || 'Il motore PDF si è interrotto.'));
      }

      worker.addEventListener('message', onMessaggio);
      worker.addEventListener('error', onErrore);
      worker.postMessage({ id: id, modello: modello });
    });
  }

  function nomeFile(nome) {
    const base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return 'CV_' + (base || 'ATS') + '.pdf';
  }

  async function scaricaPdf() {
    const stato = leggiStatoDalDom();
    const modello = costruisciModello(stato);
    const k = stato.curriculumVitae.candidato.contattiNelBody;

    if (!modello.nome) {
      mostraStato('Inserisci nome e cognome prima di scaricare il CV.', 'errore');
      return;
    }
    if (!k.email.trim() && !k.telefono.trim()) {
      mostraStato('Inserisci almeno un recapito (email o telefono): senza contatti il CV non è utilizzabile.', 'errore');
      return;
    }

    btnDownload.disabled = true;
    btnDownload.textContent = 'Generazione in corso...';
    mostraStato('', '');
    try {
      const buffer = await generaPdf(modello);
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeFile(modello.nome);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      mostraStato('PDF generato nel tuo browser. Nessun dato è stato inviato online.', 'ok');
    } catch (err) {
      console.error('[CV] Errore PDF:', err);
      mostraStato(err.message, 'errore');
    } finally {
      btnDownload.disabled = false;
      btnDownload.textContent = 'Scarica PDF ATS';
    }
  }

  // ==============================================================
  // EVENTI
  // ==============================================================
  function haContenuto() {
    const m = costruisciModello(leggiStatoDalDom());
    return Boolean(m.nome || m.contatti || m.sezioni.length);
  }

  function onClick(e) {
    const bottone = e.target.closest('[data-action]');
    if (!bottone) return;
    const azione = bottone.dataset.action;
    const item = bottone.closest('.cv-item');

    switch (azione) {
      case 'aggiungi-esperienza':
      case 'aggiungi-istruzione': {
        const nuovo = aggiungiVoce(azione === 'aggiungi-esperienza' ? 'esperienza' : 'istruzione', null);
        const primo = nuovo.querySelector('input');
        if (primo) primo.focus();
        break;
      }
      case 'su':
        if (item && item.previousElementSibling) item.parentNode.insertBefore(item, item.previousElementSibling);
        break;
      case 'giu':
        if (item && item.nextElementSibling) item.parentNode.insertBefore(item.nextElementSibling, item);
        break;
      case 'rimuovi':
        if (item) item.remove();
        break;
      case 'rimuovi-foto':
        fotoCorrente = null;
        aggiornaPannelloFoto();
        break;
      case 'carica-esempio':
        if (haContenuto() && !window.confirm('Sostituire i dati attuali con il CV di esempio?')) return;
        scriviStatoNelDom(statoEsempio());
        break;
      case 'cancella-dati':
        if (!window.confirm('Eliminare definitivamente tutti i dati del CV salvati su questo dispositivo?')) return;
        archivio.elimina();
        scriviStatoNelDom(statoVuoto());
        renderAnteprima(costruisciModello(statoVuoto()));
        mostraStato('Dati eliminati da questo dispositivo.', 'ok');
        return;
      default:
        return;
    }
    aggiorna();
  }

  function onModifica(e) {
    const target = e.target;
    if (target.dataset.opt === 'fotoFile') {
      if (e.type === 'change') gestisciFileFoto(target);
      return;
    }
    if (target.dataset.field === 'inCorso') aggiornaCampiFine(target.closest('.cv-item'));
    if (target.dataset.opt === 'fotoAttiva') aggiornaPannelloFoto();
    pianificaAggiornamento();
  }

  function init() {
    cacheDom();
    if (!builder || !preview || !tplEsp || !tplIstr) return;

    scriviStatoNelDom(normalizzaStato(archivio.carica()));
    renderAnteprima(costruisciModello(leggiStatoDalDom()));

    builder.addEventListener('input', onModifica);
    builder.addEventListener('change', onModifica);
    builder.addEventListener('click', onClick);
    btnDownload.addEventListener('click', scaricaPdf);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
