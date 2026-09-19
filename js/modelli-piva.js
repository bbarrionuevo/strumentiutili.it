// js/modelli-piva.js — Compilatore guidato dei modelli AA9/12 e AA7/10
//
// Legge la mappa dei campi da /data/modelli-piva-schema.json, costruisce una
// procedura passo per passo con la spiegazione di ogni voce presa dalle
// istruzioni ufficiali e, alla fine, riempie il vero PDF dell'Agenzia delle
// Entrate con pdf-lib e lo fa scaricare. Tutto nel browser: nessun dato esce
// dal dispositivo.
(() => {
  'use strict';

  const PERCORSO_SCHEMA = '/data/modelli-piva-schema.json';
  const PERCORSO_REGOLE = '/data/regole-fiscali-2026.json';
  const CHIAVE_STATO = 'modelli_piva_compilatore';

  const stato = {
    schema: null,
    capVietati: [],
    modello: 'AA9',
    passo: 0,
    dati: Object.create(null),      // "passo.campo" -> valore
    attivi: Object.create(null),    // "modello.passo" -> true se un quadro opzionale e' stato attivato
    righe: Object.create(null),     // "modello.passo.gruppo" -> righe visibili
    errori: Object.create(null)
  };

  let app, riquadroPassi, riquadroCorpo, riquadroNav, riquadroStato;

  /* ------------------------------------------------------------------ utili */

  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // I due modelli hanno quadri con lo stesso nome ma significato diverso (il
  // quadro B2 dell'AA9 è l'attività, quello dell'AA7 la sede legale): le chiavi
  // portano quindi il modello, così cambiando modulo i dati non si mescolano.
  const chiave = (passo, campo) => `${stato.modello}.${passo}.${campo}`;
  const chiaveRiga = (passo, gruppo, i, campo) => `${stato.modello}.${passo}.${gruppo}.${i}.${campo}`;

  const leggi = (k) => stato.dati[k];
  const scrivi = (k, v) => {
    if (v === '' || v === false || v == null) delete stato.dati[k];
    else stato.dati[k] = v;
    salva();
  };

  function modelloCorrente() {
    return stato.schema.modelli[stato.modello];
  }

  function opzioniDi(campo) {
    if (Array.isArray(campo.options)) return campo.options;
    if (typeof campo.options === 'string') return stato.schema.tabelle[campo.options] || [];
    return [];
  }

  function passoAttivo(passo) {
    if (!passo.opzionale) return true;
    return Boolean(stato.attivi[`${stato.modello}.${passo.id}`]);
  }

  function righeVisibili(passo, gruppo) {
    const k = `${stato.modello}.${passo.id}.${gruppo.id}`;
    const n = stato.righe[k];
    return Math.min(Math.max(n || 1, 1), gruppo.righe.length);
  }

  /** Valuta la condizione "showIf" di un campo rispetto ai valori del suo passo. */
  function visibile(campo, passo) {
    const cond = campo.showIf;
    if (!cond) return true;
    const valore = leggi(chiave(passo.id, cond.campo));
    if (cond.vero !== undefined) return Boolean(valore) === cond.vero;
    if (Array.isArray(cond.in)) return cond.in.includes(valore);
    return true;
  }

  function obbligatorio(campo, passo) {
    if (campo.required !== true) return false;
    return visibile(campo, passo);
  }

  /* ------------------------------------------------------------- validazione */

  function luhnPartitaIva(piva) {
    if (!/^[0-9]{11}$/.test(piva)) return false;
    let somma = 0;
    for (let i = 0; i <= 9; i += 2) somma += Number(piva[i]);
    for (let i = 1; i <= 9; i += 2) {
      let c = 2 * Number(piva[i]);
      if (c > 9) c -= 9;
      somma += c;
    }
    return (10 - (somma % 10)) % 10 === Number(piva[10]);
  }

  function codiceFiscaleValido(cf) {
    if (!/^[A-Z0-9]{16}$/.test(cf)) return false;
    if (typeof window.validateCodiceFiscale === 'function') {
      try { return window.validateCodiceFiscale(cf).valid; } catch (e) { /* ricade sul formato */ }
    }
    return true;
  }

  /** Restituisce un messaggio d'errore, oppure null se il valore va bene. */
  function controlla(campo, passo) {
    const grezzo = leggi(chiave(passo.id, campo.id));
    const valore = typeof grezzo === 'string' ? grezzo.trim() : grezzo;

    if (!valore) {
      return obbligatorio(campo, passo) ? 'Questo campo è obbligatorio.' : null;
    }
    return controllaValore(campo.type, valore);
  }

  function controllaValore(tipo, valore) {
    const v = String(valore).trim().toUpperCase();
    switch (tipo) {
      case 'cf':
        return codiceFiscaleValido(v) ? null : 'Codice fiscale non valido: servono 16 caratteri con il carattere di controllo corretto.';
      case 'cfNum':
        return /^[0-9]{11}$/.test(v) ? null : 'Il codice fiscale di una società o di un ente è composto da 11 cifre.';
      case 'piva':
        return luhnPartitaIva(v) ? null : 'Partita IVA non valida: servono 11 cifre con cifra di controllo corretta.';
      case 'cfOpiva':
        if (/^[0-9]{11}$/.test(v)) return luhnPartitaIva(v) ? null : 'Partita IVA non valida: la cifra di controllo non torna.';
        return codiceFiscaleValido(v) ? null : 'Inserisci una partita IVA (11 cifre) oppure un codice fiscale (16 caratteri).';
      case 'cap':
        if (!/^[0-9]{5}$/.test(v)) return 'Il C.A.P. è composto da 5 cifre.';
        if (stato.capVietati.includes(v)) return 'Questo è il C.A.P. generico della città: l\'Agenzia delle Entrate non lo accetta. Indica il C.A.P. specifico della via.';
        return null;
      case 'provincia':
        return /^[A-Z]{2}$/.test(v) ? null : 'La provincia va indicata con la sigla di due lettere (RM, MI, EE per l\'estero).';
      case 'ateco':
        return /^[0-9]{4,6}$/.test(v) ? null : 'Il codice ATECO va scritto in cifre, senza punti (per esempio 620100).';
      case 'importo':
        return /^[0-9]{1,11}$/.test(v.replace(/[.\s]/g, '')) ? null : 'Indica un importo in euro, senza decimali.';
      case 'email':
        return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(valore).trim()) ? null : 'Indirizzo e-mail non valido.';
      case 'data':
        return /^\d{4}-\d{2}-\d{2}$/.test(String(valore)) ? null : 'Data non valida.';
      default:
        return null;
    }
  }

  /** Controlla tutti i campi visibili del passo; restituisce le chiavi in errore. */
  function controllaPasso(passo) {
    const errori = {};
    if (!passoAttivo(passo)) return errori;

    (passo.campi || []).forEach((campo) => {
      if (campo.type === 'toggle' || !visibile(campo, passo)) return;
      if (campo.type === 'gruppo') {
        campo.campi.forEach((sotto) => {
          const msg = controlla(sotto, passo);
          if (msg) errori[chiave(passo.id, sotto.id)] = msg;
        });
        return;
      }
      if (campo.type === 'radio') {
        if (obbligatorio(campo, passo) && !leggi(chiave(passo.id, campo.id))) {
          errori[chiave(passo.id, campo.id)] = 'Scegli una delle opzioni.';
        }
        return;
      }
      const msg = controlla(campo, passo);
      if (msg) errori[chiave(passo.id, campo.id)] = msg;
    });

    (passo.ripetibili || []).forEach((gruppo) => {
      const totale = righeVisibili(passo, gruppo);
      for (let i = 0; i < totale; i++) {
        gruppo.sottocampi.forEach((sotto) => {
          if (!gruppo.righe[i] || !gruppo.righe[i][sotto.id]) return;
          const k = chiaveRiga(passo.id, gruppo.id, i, sotto.id);
          const valore = leggi(k);
          if (!valore) return;
          const msg = controllaValore(sotto.type, valore);
          if (msg) errori[k] = msg;
        });
      }
    });

    return errori;
  }

  /* -------------------------------------------------------------- interfaccia */

  function classeLarghezza(l) {
    switch (l) {
      case 'quarter': return 'mp-c3';
      case 'third': return 'mp-c4';
      case 'half': return 'mp-c6';
      case 'twothirds': return 'mp-c8';
      default: return 'mp-c12';
    }
  }

  function attributiInput(tipo) {
    switch (tipo) {
      case 'cf': return 'type="text" maxlength="16" inputmode="text" class="mp-input mp-maiuscolo"';
      case 'cfNum': return 'type="text" maxlength="11" inputmode="numeric" class="mp-input"';
      case 'piva': return 'type="text" maxlength="11" inputmode="numeric" class="mp-input"';
      case 'cfOpiva': return 'type="text" maxlength="16" class="mp-input mp-maiuscolo"';
      case 'cap': return 'type="text" maxlength="5" inputmode="numeric" class="mp-input"';
      case 'provincia': return 'type="text" maxlength="2" class="mp-input mp-maiuscolo"';
      case 'ateco': return 'type="text" maxlength="6" inputmode="numeric" class="mp-input"';
      case 'importo': return 'type="text" inputmode="numeric" class="mp-input"';
      case 'data': return 'type="date" class="mp-input"';
      case 'email': return 'type="email" class="mp-input"';
      default: return 'type="text" class="mp-input"';
    }
  }

  function bloccoGuida(idGuida, testo) {
    if (!testo) return '';
    return `<div id="${idGuida}" role="note" hidden class="mp-guida">${esc(testo)}</div>`;
  }

  function pulsanteGuida(idGuida, testo) {
    if (!testo) return '';
    return `<button type="button" class="mp-info" data-guida-toggle="${idGuida}"
      aria-expanded="false" aria-controls="${idGuida}" title="Che cosa devo scrivere qui?">i</button>`;
  }

  function renderCampo(campo, passo, prefissoChiave, idBase) {
    const k = prefissoChiave;
    const idGuida = `g-${idBase}`;
    const idEtichetta = `l-${idBase}`;
    const errore = stato.errori[k];
    const valore = leggi(k);
    const stella = obbligatorio(campo, passo) ? ' <span class="mp-obb">*</span>' : '';

    if (campo.type === 'toggle') {
      return `<div class="mp-campo mp-c12">
        <label class="mp-switch">
          <input type="checkbox" data-campo="${esc(k)}" data-tipo="toggle" ${valore ? 'checked' : ''}>
          <span>${esc(campo.label)}</span>
        </label>
        ${campo.help ? `<p class="mp-nota">${esc(campo.help)}</p>` : ''}
      </div>`;
    }

    if (campo.type === 'check' || campo.type === 'checkX') {
      return `<div class="mp-campo ${classeLarghezza(campo.width)}">
        <label class="mp-checkbox">
          <input type="checkbox" data-campo="${esc(k)}" data-tipo="check" ${valore ? 'checked' : ''}>
          <span>${esc(campo.label)}${stella}</span>
        </label>
        ${campo.help ? `<p class="mp-nota">${esc(campo.help)}</p>` : ''}
      </div>`;
    }

    if (campo.type === 'radio') {
      const opzioni = opzioniDi(campo).map((o, i) => `
        <label class="mp-radio">
          <input type="radio" name="r-${esc(k)}" value="${esc(o.value)}" data-campo="${esc(k)}" data-tipo="radio"
            ${valore === o.value ? 'checked' : ''}>
          <span class="mp-radio-testo">
            <strong>${esc(o.label)}</strong>
            ${o.help ? `<em>${esc(o.help)}</em>` : ''}
          </span>
        </label>`).join('');
      return `<fieldset class="mp-campo mp-c12 mp-fieldset">
        <legend class="mp-legenda">${esc(campo.label)}${stella}</legend>
        ${campo.help ? `<p class="mp-nota">${esc(campo.help)}</p>` : ''}
        <div class="mp-radio-gruppo">${opzioni}</div>
        ${errore ? `<p class="mp-errore">${esc(errore)}</p>` : ''}
      </fieldset>`;
    }

    if (campo.type === 'select') {
      const opzioni = opzioniDi(campo);
      const haVuoto = opzioni.some((o) => o.value === '');
      const voci = (haVuoto ? [] : [{ value: '', label: '— Seleziona —' }]).concat(opzioni)
        .map((o) => `<option value="${esc(o.value)}" ${valore === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      return `<div class="mp-campo ${classeLarghezza(campo.width)}">
        <div class="mp-etichetta-riga">
          <span class="mp-etichetta" id="${idEtichetta}">${esc(campo.label)}${stella}</span>
          ${pulsanteGuida(idGuida, campo.help)}
        </div>
        <select class="mp-input" data-campo="${esc(k)}" data-tipo="select"
          data-guida="${idGuida}" aria-labelledby="${idEtichetta}" aria-describedby="${idGuida}">${voci}</select>
        ${bloccoGuida(idGuida, campo.help)}
        ${errore ? `<p class="mp-errore">${esc(errore)}</p>` : ''}
      </div>`;
    }

    const segnaposto = campo.placeholder ? ` placeholder="${esc(campo.placeholder)}"` : '';
    return `<div class="mp-campo ${classeLarghezza(campo.width)}">
      <div class="mp-etichetta-riga">
        <span class="mp-etichetta" id="${idEtichetta}">${esc(campo.label)}${stella}</span>
        ${pulsanteGuida(idGuida, campo.help)}
      </div>
      <input ${attributiInput(campo.type)} data-campo="${esc(k)}" data-tipo="${esc(campo.type)}"
        data-guida="${idGuida}" aria-labelledby="${idEtichetta}" aria-describedby="${idGuida}"
        value="${esc(valore || '')}"${segnaposto}>
      ${bloccoGuida(idGuida, campo.help)}
      ${errore ? `<p class="mp-errore">${esc(errore)}</p>` : ''}
    </div>`;
  }

  function renderGruppo(campo, passo) {
    const corpo = campo.campi.map((sotto) =>
      renderCampo(sotto, passo, chiave(passo.id, sotto.id), `${passo.id}-${sotto.id}`)).join('');
    return `<fieldset class="mp-campo mp-c12 mp-fieldset">
      <legend class="mp-legenda">${esc(campo.label)}</legend>
      ${campo.help ? `<p class="mp-nota">${esc(campo.help)}</p>` : ''}
      <div class="mp-griglia">${corpo}</div>
    </fieldset>`;
  }

  function renderRipetibile(gruppo, passo) {
    const totale = righeVisibili(passo, gruppo);
    const righe = [];
    for (let i = 0; i < totale; i++) {
      const mappa = gruppo.righe[i] || {};
      const campi = gruppo.sottocampi.filter((s) => mappa[s.id]).map((sotto) => {
        const k = chiaveRiga(passo.id, gruppo.id, i, sotto.id);
        const idBase = `${passo.id}-${gruppo.id}-${i}-${sotto.id}`;
        if (sotto.type === 'radioCoppia') {
          const valore = leggi(k);
          const scelte = sotto.options.map((o) => `
            <label class="mp-radio mp-radio-inline">
              <input type="radio" name="r-${esc(k)}" value="${esc(o.value)}" data-campo="${esc(k)}" data-tipo="radio"
                ${valore === o.value ? 'checked' : ''}>
              <span>${esc(o.label)}</span>
            </label>`).join('');
          return `<div class="mp-campo ${classeLarghezza(sotto.width)}">
            <span class="mp-etichetta">${esc(sotto.label)}</span>
            <div class="mp-radio-gruppo mp-radio-gruppo-inline">${scelte}</div>
          </div>`;
        }
        return renderCampo(sotto, passo, k, idBase);
      }).join('');
      righe.push(`<div class="mp-riga"><span class="mp-riga-numero">Riquadro ${i + 1}</span>
        <div class="mp-griglia">${campi}</div></div>`);
    }

    const puoAggiungere = totale < gruppo.righe.length;
    return `<fieldset class="mp-campo mp-c12 mp-fieldset">
      <legend class="mp-legenda">${esc(gruppo.label)}</legend>
      ${gruppo.help ? `<p class="mp-nota">${esc(gruppo.help)}</p>` : ''}
      ${righe.join('')}
      ${puoAggiungere ? `<button type="button" class="mp-btn mp-btn-lieve" data-aggiungi="${esc(passo.id)}|${esc(gruppo.id)}">
        + Aggiungi un altro riquadro (${totale} di ${gruppo.righe.length})</button>` : ''}
    </fieldset>`;
  }

  function renderPasso(passo) {
    const attivo = passoAttivo(passo);
    const interruttore = passo.opzionale ? `
      <label class="mp-switch mp-switch-grande">
        <input type="checkbox" data-attiva="${esc(passo.id)}" ${attivo ? 'checked' : ''}>
        <span>Questo quadro mi riguarda: voglio compilarlo</span>
      </label>` : '';

    if (passo.opzionale && !attivo) {
      return `<h2 class="mp-titolo">${esc(passo.titolo)}</h2>
        <p class="mp-descrizione">${esc(passo.descrizione)}</p>
        ${interruttore}
        <p class="mp-saltato">Quadro non compilato. Se non ti riguarda puoi passare avanti: resterà vuoto nel PDF, come previsto dalle istruzioni.</p>`;
    }

    const corpo = (passo.campi || [])
      .filter((c) => visibile(c, passo))
      .map((c) => c.type === 'gruppo'
        ? renderGruppo(c, passo)
        : renderCampo(c, passo, chiave(passo.id, c.id), `${passo.id}-${c.id}`))
      .join('');

    const ripetibili = (passo.ripetibili || []).map((g) => renderRipetibile(g, passo)).join('');

    return `<h2 class="mp-titolo">${esc(passo.titolo)}</h2>
      <p class="mp-descrizione">${esc(passo.descrizione)}</p>
      ${interruttore}
      <div class="mp-griglia">${corpo}</div>
      ${ripetibili}`;
  }

  function renderElencoPassi() {
    const passi = modelloCorrente().passi;
    return passi.map((p, i) => {
      const classi = ['mp-passo-voce'];
      if (i === stato.passo) classi.push('mp-passo-attivo');
      if (p.opzionale && !passoAttivo(p)) classi.push('mp-passo-saltato');
      return `<button type="button" class="${classi.join(' ')}" data-vai="${i}"
        ${i === stato.passo ? 'aria-current="step"' : ''}>
        <span class="mp-passo-numero">${i + 1}</span>
        <span class="mp-passo-nome">${esc(p.titolo)}</span>
      </button>`;
    }).join('');
  }

  /**
   * Ridisegna conservando il punto in cui si trovava la persona: il pannello
   * viene ricostruito da zero a ogni modifica, quindi senza questo il cursore
   * salterebbe via dopo ogni scelta.
   */
  function renderMantenendoFuoco() {
    const attivo = document.activeElement;
    const riferimento = attivo && attivo.dataset ? attivo.dataset.campo : null;
    const valore = attivo && attivo.type === 'radio' ? attivo.value : null;
    render();
    if (!riferimento) return;
    const selettore = valore === null
      ? `[data-campo="${CSS.escape(riferimento)}"]`
      : `[data-campo="${CSS.escape(riferimento)}"][value="${CSS.escape(valore)}"]`;
    const nuovo = app.querySelector(selettore);
    if (nuovo) nuovo.focus({ preventScroll: true });
  }

  function render() {
    const modello = modelloCorrente();
    const passi = modello.passi;
    stato.passo = Math.min(Math.max(stato.passo, 0), passi.length - 1);
    const passo = passi[stato.passo];

    riquadroPassi.innerHTML = renderElencoPassi();
    riquadroCorpo.innerHTML = renderPasso(passo);

    const ultimo = stato.passo === passi.length - 1;
    riquadroNav.innerHTML = `
      <button type="button" class="mp-btn mp-btn-lieve" data-nav="indietro" ${stato.passo === 0 ? 'disabled' : ''}>← Indietro</button>
      <span class="mp-conta">Passo ${stato.passo + 1} di ${passi.length}</span>
      ${ultimo
        ? '<button type="button" class="mp-btn mp-btn-forte" data-nav="genera">Genera e scarica il modello compilato</button>'
        : '<button type="button" class="mp-btn mp-btn-forte" data-nav="avanti">Avanti →</button>'}`;

    const badge = document.getElementById('mp-badge-modello');
    if (badge) badge.textContent = modello.codice;
    const sottotitolo = document.getElementById('mp-sottotitolo-modello');
    if (sottotitolo) sottotitolo.textContent = modello.sottotitolo;
    const link = document.getElementById('mp-link-istruzioni');
    if (link) {
      link.href = modello.istruzioni;
      link.textContent = `Istruzioni ufficiali ${modello.codice} (PDF)`;
    }
    document.querySelectorAll('[data-modello]').forEach((b) => {
      b.classList.toggle('mp-scelta-attiva', b.dataset.modello === stato.modello);
      b.setAttribute('aria-pressed', String(b.dataset.modello === stato.modello));
    });
  }

  function avviso(testo, tipo) {
    riquadroStato.className = `mp-avviso mp-avviso-${tipo || 'info'}`;
    riquadroStato.textContent = testo;
    riquadroStato.hidden = !testo;
  }

  /* ---------------------------------------------------------- persistenza */

  function salva() {
    if (!window.AppStorage) return;
    window.AppStorage.save(CHIAVE_STATO, {
      modello: stato.modello,
      passo: stato.passo,
      dati: stato.dati,
      attivi: stato.attivi,
      righe: stato.righe
    });
  }

  function ripristina() {
    if (!window.AppStorage) return;
    const salvato = window.AppStorage.load(CHIAVE_STATO, null);
    if (!salvato) return;
    if (salvato.modello && stato.schema.modelli[salvato.modello]) stato.modello = salvato.modello;
    if (typeof salvato.passo === 'number') stato.passo = salvato.passo;
    Object.assign(stato.dati, salvato.dati || {});
    Object.assign(stato.attivi, salvato.attivi || {});
    Object.assign(stato.righe, salvato.righe || {});
  }

  function dimentica() {
    stato.dati = Object.create(null);
    stato.attivi = Object.create(null);
    stato.righe = Object.create(null);
    stato.errori = Object.create(null);
    stato.passo = 0;
    try {
      const chiavePagina = location.pathname.replace(/[\/.]/g, '_') || 'home';
      if (window.AppStorage) {
        window.AppStorage.remove(CHIAVE_STATO);
        window.AppStorage.remove(`form_data_${chiavePagina}`);
      }
      localStorage.removeItem(`su_${CHIAVE_STATO}`);
      localStorage.removeItem(`su_form_data_${chiavePagina}`);
    } catch (e) { /* la privacy non deve bloccare l'utente */ }
  }

  /* --------------------------------------------------------- generazione PDF */

  /** Converte 2026-03-15 nel formato ggmmaaaa richiesto dai modelli. */
  function dataItaliana(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    return m ? `${m[3]}${m[2]}${m[1]}` : '';
  }

  function perModello(valore, tipo) {
    const v = String(valore == null ? '' : valore).trim();
    switch (tipo) {
      case 'data': return dataItaliana(v);
      case 'cf': case 'cfOpiva': case 'provincia': return v.toUpperCase();
      case 'importo': return v.replace(/[^\d]/g, '');
      case 'cap': case 'piva': case 'cfNum': case 'ateco': return v.replace(/[^\dA-Za-z]/g, '');
      default: return v;
    }
  }

  // Helvetica standard copre solo la codifica WinAnsi: tutto il resto va tolto,
  // altrimenti pdf-lib non riesce a disegnare il testo.
  const RIMPIAZZI = {
    '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"',
    '–': '-', '—': '-', '…': '...', ' ': ' ', '«': '<<', '»': '>>'
  };

  function ripulisci(testo) {
    let out = '';
    for (const ch of String(testo)) {
      const sostituto = RIMPIAZZI[ch];
      const candidato = sostituto !== undefined ? sostituto : ch;
      for (const c of candidato) {
        const codice = c.codePointAt(0);
        const ammesso = (codice >= 32 && codice <= 126) ||
          (codice >= 160 && codice <= 255);
        if (ammesso) out += c;
      }
    }
    return out;
  }

  /** Percorre lo schema e raccoglie che cosa scrivere nel PDF. */
  function raccogli() {
    const modello = modelloCorrente();
    const testi = new Map();
    const spunte = new Set();
    const quadri = new Set();

    const segnaQuadro = (passo, campo) => {
      const q = (campo && campo.quadro) || passo.quadro;
      if (q) quadri.add(q);
    };

    const scriviCampo = (campo, passo, k) => {
      const valore = leggi(k);
      if (campo.type === 'toggle') return;
      if (!valore) return;

      if (campo.type === 'radio') {
        const scelta = opzioniDi(campo).find((o) => o.value === valore);
        if (scelta && scelta.pdf) { spunte.add(scelta.pdf); segnaQuadro(passo, campo); }
        return;
      }
      if (campo.type === 'check') {
        if (campo.pdf) { spunte.add(campo.pdf); segnaQuadro(passo, campo); }
        return;
      }
      if (campo.type === 'checkX') {
        if (campo.pdf) { testi.set(campo.pdf, 'X'); segnaQuadro(passo, campo); }
        return;
      }
      if (!campo.pdf) return;
      const testo = perModello(valore, campo.type);
      if (!testo) return;
      testi.set(campo.pdf, testo);
      segnaQuadro(passo, campo);
    };

    modello.passi.forEach((passo) => {
      if (!passoAttivo(passo)) return;

      (passo.campi || []).forEach((campo) => {
        if (!visibile(campo, passo)) return;
        if (campo.type === 'gruppo') {
          campo.campi.forEach((sotto) => scriviCampo(sotto, passo, chiave(passo.id, sotto.id)));
          return;
        }
        scriviCampo(campo, passo, chiave(passo.id, campo.id));
      });

      (passo.ripetibili || []).forEach((gruppo) => {
        const totale = righeVisibili(passo, gruppo);
        for (let i = 0; i < totale; i++) {
          const mappa = gruppo.righe[i];
          if (!mappa) continue;
          gruppo.sottocampi.forEach((sotto) => {
            const nomePdf = mappa[sotto.id];
            if (!nomePdf) return;
            const valore = leggi(chiaveRiga(passo.id, gruppo.id, i, sotto.id));
            if (!valore) return;
            if (sotto.type === 'radioCoppia') {
              const nome = nomePdf[valore];
              if (nome) { spunte.add(nome); segnaQuadro(passo, null); }
              return;
            }
            if (sotto.type === 'check') {
              spunte.add(nomePdf); segnaQuadro(passo, null);
              return;
            }
            const testo = perModello(valore, sotto.type);
            if (!testo) return;
            testi.set(nomePdf, testo);
            segnaQuadro(passo, null);
          });
        }
      });
    });

    // Testata: il codice fiscale va in alto su ogni pagina, insieme alla numerazione.
    const cf = perModello(leggi(chiave('quadroA', 'cfContribuente')) || '', 'cf');
    const testata = modello.testata;
    if (cf) testata.codiceFiscale.forEach((nome) => testi.set(nome, cf));
    testata.numeroPagina.forEach((nome, i) => testi.set(nome, String(i + 1)));
    testi.set(testata.totalePagine, String(testata.numeroPagina.length));

    // Riquadro "quadri compilati": si barra ciò che è stato effettivamente riempito.
    quadri.forEach((lettera) => {
      const nome = modello.caselleQuadri[lettera];
      if (nome) spunte.add(nome);
    });

    return { testi, spunte };
  }

  async function generaPdf() {
    if (typeof PDFLib === 'undefined') {
      avviso('La libreria PDF non è ancora stata caricata. Attendi qualche istante e riprova.', 'errore');
      return;
    }

    const modello = modelloCorrente();
    const passi = modello.passi;

    // Controllo finale su tutti i passi, non solo su quello aperto.
    for (let i = 0; i < passi.length; i++) {
      const errori = controllaPasso(passi[i]);
      if (Object.keys(errori).length) {
        stato.errori = errori;
        stato.passo = i;
        render();
        avviso('Ci sono campi da correggere in questo passo: li trovi segnati in rosso.', 'errore');
        riquadroCorpo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    stato.errori = Object.create(null);

    const bottone = riquadroNav.querySelector('[data-nav="genera"]');
    if (bottone) { bottone.disabled = true; bottone.textContent = 'Preparo il modello…'; }
    avviso('Sto compilando il PDF ufficiale nel tuo browser…', 'info');

    try {
      const risposta = await fetch(modello.pdf);
      if (!risposta.ok) throw new Error(`Modello non raggiungibile (${risposta.status})`);
      const originale = await risposta.arrayBuffer();

      const documento = await PDFLib.PDFDocument.load(originale);
      const modulo = documento.getForm();
      const { testi, spunte } = raccogli();
      const mancanti = [];

      testi.forEach((testo, nome) => {
        try {
          const campo = modulo.getTextField(nome);
          const max = campo.getMaxLength();
          let valore = ripulisci(testo);
          if (max && valore.length > max) valore = valore.slice(0, max);
          campo.setText(valore);
        } catch (e) {
          mancanti.push(nome);
        }
      });

      spunte.forEach((nome) => {
        try {
          modulo.getCheckBox(nome).check();
        } catch (e) {
          mancanti.push(nome);
        }
      });

      if (mancanti.length) console.warn('Campi non trovati nel PDF:', mancanti);

      documento.setTitle(`Modello ${modello.codice} compilato`);
      documento.setProducer('StrumentiUtili.it');
      documento.setCreator('StrumentiUtili.it — Compilatore modelli Partita IVA');
      documento.setCreationDate(new Date());

      const byte = await documento.save();
      const identificativo = String(leggi(chiave('quadroA', 'cfContribuente')) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const nomeFile = `${modello.codice.replace('/', '_')}${identificativo ? '_' + identificativo : ''}_compilato.pdf`;
      scarica(byte, nomeFile);

      avviso(`Fatto: ${nomeFile} è stato scaricato. Controlla i dati, stampa il modello e firmalo a penna prima di presentarlo.`, 'ok');
    } catch (errore) {
      console.error(errore);
      avviso('Non è stato possibile generare il modello. Ricarica la pagina e riprova.', 'errore');
    } finally {
      if (bottone) { bottone.disabled = false; bottone.textContent = 'Genera e scarica il modello compilato'; }
    }
  }

  function scarica(byte, nomeFile) {
    const blob = new Blob([byte], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeFile;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* -------------------------------------------------------------- interazioni */

  function normalizzaInput(elemento, tipo) {
    if (['cf', 'cfOpiva', 'provincia'].includes(tipo)) {
      const posizione = elemento.selectionStart;
      elemento.value = elemento.value.toUpperCase();
      try { elemento.setSelectionRange(posizione, posizione); } catch (e) { /* input date e simili */ }
    }
  }

  function collega() {
    app.addEventListener('input', (evento) => {
      const elemento = evento.target;
      if (!elemento.dataset || !elemento.dataset.campo) return;
      if (elemento.type === 'radio') return;
      normalizzaInput(elemento, elemento.dataset.tipo);
      const valore = elemento.type === 'checkbox' ? elemento.checked : elemento.value;
      scrivi(elemento.dataset.campo, valore);
      if (stato.errori[elemento.dataset.campo]) {
        delete stato.errori[elemento.dataset.campo];
        const messaggio = elemento.parentElement.querySelector('.mp-errore');
        if (messaggio) messaggio.remove();
      }
    });

    app.addEventListener('change', (evento) => {
      const elemento = evento.target;

      if (elemento.dataset.attiva) {
        stato.attivi[`${stato.modello}.${elemento.dataset.attiva}`] = elemento.checked;
        salva();
        render();
        return;
      }

      if (!elemento.dataset.campo) return;
      if (elemento.type === 'radio') {
        if (!elemento.checked) return;
        scrivi(elemento.dataset.campo, elemento.value);
        renderMantenendoFuoco();
        return;
      }
      if (elemento.dataset.tipo === 'toggle' || elemento.tagName === 'SELECT') {
        const valore = elemento.type === 'checkbox' ? elemento.checked : elemento.value;
        scrivi(elemento.dataset.campo, valore);
        renderMantenendoFuoco();
      }
    });

    app.addEventListener('click', (evento) => {
      const aggiungi = evento.target.closest('[data-aggiungi]');
      if (aggiungi) {
        const [passoId, gruppoId] = aggiungi.dataset.aggiungi.split('|');
        const k = `${stato.modello}.${passoId}.${gruppoId}`;
        stato.righe[k] = (stato.righe[k] || 1) + 1;
        salva();
        render();
        return;
      }

      const vai = evento.target.closest('[data-vai]');
      if (vai) {
        stato.errori = Object.create(null);
        stato.passo = Number(vai.dataset.vai);
        salva();
        render();
        riquadroCorpo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const nav = evento.target.closest('[data-nav]');
      if (nav) {
        const azione = nav.dataset.nav;
        if (azione === 'indietro') {
          stato.errori = Object.create(null);
          stato.passo -= 1;
          avviso('', 'info');
          salva();
          render();
          riquadroCorpo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (azione === 'avanti') {
          const errori = controllaPasso(modelloCorrente().passi[stato.passo]);
          stato.errori = errori;
          if (Object.keys(errori).length) {
            render();
            avviso('Controlla i campi segnati in rosso prima di proseguire.', 'errore');
            return;
          }
          avviso('', 'info');
          stato.passo += 1;
          salva();
          render();
          riquadroCorpo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (azione === 'genera') {
          generaPdf();
        }
      }
    });

    document.querySelectorAll('[data-modello]').forEach((bottone) => {
      bottone.addEventListener('click', () => {
        if (stato.modello === bottone.dataset.modello) return;
        stato.modello = bottone.dataset.modello;
        stato.passo = 0;
        stato.errori = Object.create(null);
        avviso('', 'info');
        salva();
        render();
      });
    });

    const azzera = document.getElementById('mp-azzera');
    if (azzera) {
      azzera.addEventListener('click', () => {
        if (!window.confirm('Vuoi cancellare tutti i dati inseriti? L\'operazione non è annullabile.')) return;
        dimentica();
        render();
        avviso('Dati cancellati. Nulla è mai stato inviato a un server.', 'ok');
      });
    }
  }

  /* --------------------------------------------------------------- avvio */

  document.addEventListener('DOMContentLoaded', async () => {
    app = document.getElementById('mp-app');
    if (!app) return;
    riquadroPassi = document.getElementById('mp-passi');
    riquadroCorpo = document.getElementById('mp-corpo');
    riquadroNav = document.getElementById('mp-nav');
    riquadroStato = document.getElementById('mp-stato');

    try {
      const [schema, regole] = await Promise.all([
        fetch(PERCORSO_SCHEMA).then((r) => { if (!r.ok) throw new Error('schema'); return r.json(); }),
        fetch(PERCORSO_REGOLE).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ]);
      stato.schema = schema;
      const modelliRegole = regole && regole.modelli_partita_iva;
      stato.capVietati = (modelliRegole && modelliRegole.blacklist_cap_generici) || [];
    } catch (errore) {
      console.error(errore);
      riquadroCorpo.innerHTML = '<p class="mp-errore">Non è stato possibile caricare la mappa dei campi dei modelli. Ricarica la pagina.</p>';
      return;
    }

    ripristina();
    collega();
    render();
  });
})();
