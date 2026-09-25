// js/compilatore-moduli.js — Compilazione guidata dei modelli dell'Agenzia delle Entrate
//
// Motore condiviso: legge la mappa dei campi da uno schema JSON, costruisce una
// procedura passo per passo con la spiegazione di ogni voce presa dalle
// istruzioni ufficiali e, alla fine, riempie il vero PDF dell'Agenzia delle
// Entrate con pdf-lib e lo fa scaricare. Tutto nel browser: nessun dato esce
// dal dispositivo.
//
// La pagina lo configura con gli attributi del contenitore:
//   <div id="mp-app" data-schema="/data/...json" data-stato="chiave_locale">
// e, se il modulo e' uno solo, data-modello="RLI".
(() => {
  'use strict';

  const PERCORSO_REGOLE = '/data/regole-fiscali-2026.json';

  const stato = {
    schema: null,
    capVietati: [],
    chiaveStato: 'compilatore_moduli',
    modello: null,
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

  // --- Corpo del carattere nei PDF dell'Agenzia -----------------------------
  //
  // Nei moduli compilabili dell'Agenzia la stringa /DA di ogni campo scrive la
  // barra del nome del carattere sfuggita in ottale: "\057Helv 0 Tf" invece di
  // "/Helv 0 Tf". pdf-lib non la riconosce, quindi setFontSize() lancia
  // "No Tf operator found for DA of field" e il corpo resta su 0, cioe'
  // automatico. Su 2.481 campi dei 13 modelli, 2.480 sono scritti cosi'.
  //
  // Con il corpo automatico pdf-lib ingrandisce il testo finche' riempie il
  // riquadro: piu' il testo e' corto, piu' le lettere diventano grandi. Nel
  // modulo F24 Elide la sigla della provincia usciva a 16pt dentro un riquadro
  // alto 12, tagliata sopra e sotto, mentre il cognome accanto stava a 9.
  //
  // Qui il /DA si riscrive per intero, con la barra normale, tenendo il nome
  // del carattere e il colore che il modulo dichiara.

  const RE_TF = /(?:\\057|\/)([A-Za-z0-9#+._-]+)\s+([\d.]+)\s+Tf/;

  function daDelCampo(campo) {
    try { return String(campo.acroField.getDefaultAppearance() || ''); }
    catch (e) { return ''; }
  }

  function altezzaRiquadro(campo) {
    try {
      const widget = campo.acroField.getWidgets()[0];
      return widget ? widget.getRectangle().height : 0;
    } catch (e) { return 0; }
  }

  // Quando il modulo non dichiara un corpo, lo si ricava dall'altezza del
  // riquadro. La proporzione 0,76 non e' inventata: e' quella dei campi che
  // l'Agenzia dichiara davvero (8pt nei riquadri alti 10,5 dei modelli F24).
  // Il tetto di 10pt tiene i riquadri alti in riga con gli AA4/8 e AA5/6, dove
  // l'Agenzia dichiara appunto 10.
  function corpoPerAltezza(altezza) {
    if (!altezza) return 8;
    const misura = Math.round(altezza * 0.76 * 2) / 2;
    return Math.min(10, Math.max(6, misura));
  }

  function corpoDelCampo(campo) {
    const trovato = RE_TF.exec(daDelCampo(campo));
    const dichiarato = trovato ? parseFloat(trovato[2]) : 0;
    if (dichiarato > 0) return dichiarato;          // il modulo ha gia' deciso
    let multilinea = false;
    try { multilinea = campo.isMultiline(); } catch (e) { /* niente */ }
    if (multilinea) return 10;
    return corpoPerAltezza(altezzaRiquadro(campo));
  }

  // Riscrive il /DA in una forma che pdf-lib sa leggere, con un corpo fisso.
  // Restituisce la misura applicata, o 0 se non si e' potuto fare niente.
  function fissaCorpoDelCampo(campo) {
    const originale = daDelCampo(campo);
    const trovato = RE_TF.exec(originale);
    const nome = trovato ? trovato[1] : 'Helv';
    const corpo = corpoDelCampo(campo);

    // Si tiene il resto del /DA (di solito "0 g" oppure "0 0 0 rg"): e' il
    // colore dell'inchiostro e cambia da modulo a modulo.
    const resto = trovato
      ? originale.slice(trovato.index + trovato[0].length).trim()
      : '0 g';

    try {
      campo.acroField.setDefaultAppearance('/' + nome + ' ' + corpo + ' Tf ' + (resto || '0 g'));
    } catch (e) {
      return 0;
    }
    // Ora che il /DA e' leggibile, questa non lancia piu'.
    try { campo.setFontSize(corpo); } catch (e) { /* il /DA da solo basta */ }
    return corpo;
  }

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

  // L'IBAN italiano: IT + due cifre di controllo + CIN + ABI + CAB + conto,
  // 27 caratteri in tutto. La verifica e' quella standard ISO 7064 mod 97.
  function ibanItalianoValido(iban) {
    const v = String(iban || '').replace(/\s/g, '').toUpperCase();
    if (!/^IT[0-9]{2}[A-Z][0-9]{10}[0-9A-Z]{12}$/.test(v)) return false;
    const ruotato = v.slice(4) + v.slice(0, 4);
    let resto = 0;
    for (const carattere of ruotato) {
      const cifre = /[0-9]/.test(carattere)
        ? carattere
        : String(carattere.charCodeAt(0) - 55);
      for (const c of cifre) resto = (resto * 10 + Number(c)) % 97;
    }
    return resto === 1;
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
      case 'iban':
      case 'ibanCompleto':
        return ibanItalianoValido(v) ? null : 'IBAN non valido: servono 27 caratteri che cominciano con IT, e le cifre di controllo devono tornare.';
      case 'ateco':
        return /^[0-9]{4,6}$/.test(v) ? null : 'Il codice ATECO va scritto in cifre, senza punti (per esempio 620100).';
      case 'importo':
        return /^[0-9]{1,11}$/.test(v.replace(/[.,\s]/g, '')) ? null : 'Indica un importo in euro, senza decimali.';
      case 'numero':
        return /^[0-9]{1,4}$/.test(v) ? null : 'Indica solo cifre.';
      case 'importoEuro':
      case 'euro':
        return /^[0-9]{1,9}([.,][0-9]{1,2})?$/.test(v.replace(/\s/g, ''))
          ? null : 'Indica un importo in euro, con al massimo due decimali (per esempio 1250,00).';
      case 'anno':
        return /^(19|20)\d{2}$/.test(v) ? null : 'Indica un anno di quattro cifre (per esempio 2026).';
      case 'email':
        return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(valore).trim()) ? null : 'Indirizzo e-mail non valido.';
      case 'data':
      case 'dataEstesa':
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
      if (campo.type === 'radio' || campo.type === 'radioX') {
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
      case 'iban':
      case 'ibanCompleto': return 'type="text" maxlength="32" class="mp-input mp-maiuscolo"';
      case 'ateco': return 'type="text" maxlength="6" inputmode="numeric" class="mp-input"';
      case 'importo': return 'type="text" inputmode="numeric" class="mp-input"';
      case 'numero': return 'type="text" inputmode="numeric" maxlength="4" class="mp-input"';
      case 'importoEuro':
      case 'euro': return 'type="text" inputmode="decimal" class="mp-input"';
      case 'anno': return 'type="text" inputmode="numeric" maxlength="4" class="mp-input"';
      case 'data': case 'dataEstesa': return 'type="date" class="mp-input"';
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

    if (campo.type === 'radio' || campo.type === 'radioX') {
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

    if (campo.calcolo) {
      const importo = stato.schema ? valutaCalcolo(campo.calcolo, modelloCorrente()) : null;
      return `<div class="mp-campo ${classeLarghezza(campo.width)}">
        <div class="mp-etichetta-riga">
          <span class="mp-etichetta" id="${idEtichetta}">${esc(campo.label)}</span>
          ${pulsanteGuida(idGuida, campo.help)}
        </div>
        <output class="mp-input mp-calcolato" data-calcolato="${esc(campo.id)}" aria-labelledby="${idEtichetta}">${
          importo === null ? '—' : importo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        }</output>
        ${bloccoGuida(idGuida, campo.help)}
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
    document.querySelectorAll('button[data-modello]').forEach((b) => {
      b.classList.toggle('mp-scelta-attiva', b.dataset.modello === stato.modello);
      b.setAttribute('aria-pressed', String(b.dataset.modello === stato.modello));
    });
    const titolo = document.getElementById('mp-titolo-modello');
    if (titolo) titolo.textContent = modello.nome;

    aggiornaRiepilogo();
  }

  function avviso(testo, tipo) {
    riquadroStato.className = `mp-avviso mp-avviso-${tipo || 'info'}`;
    riquadroStato.textContent = testo;
    riquadroStato.hidden = !testo;
  }

  /* ---------------------------------------------------------- persistenza */

  // Codice fiscale, IBAN e simili non si salvano: si riscrivono ogni volta.
  function senzaSensibili(dati) {
    const sensibile = window.AppStorage.campoSensibile || (() => false);
    const fuori = {};
    Object.keys(dati || {}).forEach((k) => { if (!sensibile(k)) fuori[k] = dati[k]; });
    return fuori;
  }

  function salva() {
    if (!window.AppStorage) return;
    window.AppStorage.save(stato.chiaveStato, {
      modello: stato.modello,
      passo: stato.passo,
      dati: senzaSensibili(stato.dati),
      attivi: stato.attivi,
      righe: stato.righe
    });
  }

  function ripristina() {
    if (!window.AppStorage) return;
    const salvato = window.AppStorage.load(stato.chiaveStato, null);
    if (!salvato) return;
    if (!app.dataset.modello && salvato.modello && stato.schema.modelli[salvato.modello]) {
      stato.modello = salvato.modello;
    }
    if (typeof salvato.passo === 'number') stato.passo = salvato.passo;
    const dati = senzaSensibili(salvato.dati);
    Object.assign(stato.dati, dati);
    // i salvataggi di prima contenevano anche codici fiscali e IBAN: si riscrivono senza
    if (Object.keys(dati).length !== Object.keys(salvato.dati || {}).length) {
      window.AppStorage.save(stato.chiaveStato, Object.assign({}, salvato, { dati: dati }));
    }
    Object.assign(stato.attivi, salvato.attivi || {});
    Object.assign(stato.righe, salvato.righe || {});
  }

  /**
   * Alcuni campi partono gia' scritti: la numerazione delle pagine dell'AA5/6,
   * per dirne una, e' 01 e 02 per chiunque presenti il modello una volta sola.
   * Il valore preimpostato si mette solo se la casella non ha gia' qualcosa,
   * cosi' non sovrascrive ne' quello che la persona ha scritto ne' quello
   * ripescato dal salvataggio automatico.
   */
  function applicaValoriIniziali() {
    const modello = modelloCorrente();
    if (!modello) return;
    const metti = (passo, campo) => {
      if (campo.default === undefined) return;
      const k = chiave(passo.id, campo.id);
      if (stato.dati[k] === undefined || stato.dati[k] === '') stato.dati[k] = campo.default;
    };
    (modello.passi || []).forEach((passo) => {
      (passo.campi || []).forEach((campo) => {
        if (campo.type === 'gruppo') campo.campi.forEach((sotto) => metti(passo, sotto));
        else metti(passo, campo);
      });
    });
  }

  function dimentica() {
    stato.dati = Object.create(null);
    stato.attivi = Object.create(null);
    stato.righe = Object.create(null);
    stato.errori = Object.create(null);
    stato.passo = 0;
    applicaValoriIniziali();
    try {
      const chiavePagina = location.pathname.replace(/[\/.]/g, '_') || 'home';
      if (window.AppStorage) {
        window.AppStorage.remove(stato.chiaveStato);
        window.AppStorage.remove(`form_data_${chiavePagina}`);
      }
      localStorage.removeItem(`su_${stato.chiaveStato}`);
      localStorage.removeItem(`su_form_data_${chiavePagina}`);
    } catch (e) { /* la privacy non deve bloccare l'utente */ }
  }

  /* --------------------------------------------------------- generazione PDF */

  /** Converte 2026-03-15 nel formato ggmmaaaa richiesto dai modelli. */
  function dataItaliana(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    return m ? `${m[3]}${m[2]}${m[1]}` : '';
  }

  // Sul F24 la virgola degli importi e' gia' stampata e i centesimi hanno le loro
  // due caselline: l'importo va quindi spezzato in parte intera e decimale.
  /**
   * Alcuni moduli, come il Modello 69, hanno una casella sola per l'importo,
   * senza le caselline separate dei centesimi: li' i decimali vanno scritti
   * dentro allo stesso riquadro, con la virgola.
   */
  function unisciImporto(valore) {
    const parti = spezzaImporto(valore);
    return parti ? `${parti.euro},${parti.centesimi}` : '';
  }

  function spezzaImporto(valore) {
    const pulito = String(valore == null ? '' : valore).replace(/[^\d.,]/g, '').replace(/\./g, ',');
    if (!pulito) return null;
    const [intero, decimali] = pulito.split(',');
    const euro = (intero || '').replace(/^0+(?=\d)/, '') || '0';
    const centesimi = ((decimali || '') + '00').slice(0, 2);
    return { euro, centesimi };
  }

  function perModello(valore, tipo) {
    const v = String(valore == null ? '' : valore).trim();
    switch (tipo) {
      case 'data': return dataItaliana(v);
      // Dove il modulo non ha le caselline ma una riga libera, la data si scrive
      // come la scriverebbe una persona: 20/09/2026, non 20092026.
      case 'dataEstesa': return dataItaliana(v).replace(/^(..)(..)(....)$/, '$1/$2/$3');
      case 'cf': case 'cfOpiva': case 'provincia': return v.toUpperCase();
      // Sul F24 le prime due lettere sono gia' stampate sul modulo: restano 25
      // caselline e il prefisso va tolto. Altrove, come nel modello per
      // l'accredito dei rimborsi, il pettine ne ha 27 e l'IBAN si scrive tutto.
      case 'iban': return v.replace(/\s/g, '').toUpperCase().replace(/^IT/, '');
      case 'ibanCompleto': return v.replace(/\s/g, '').toUpperCase();
      case 'importo': case 'numero': case 'anno': return v.replace(/[^\d]/g, '');
      case 'euro': return unisciImporto(v);
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


  /** Ricalcola i totali mostrati nel passo corrente, senza ridisegnarlo. */
  const inEuro = (n) => Number(n || 0).toLocaleString('it-IT',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /**
   * Riporta i totali del modello nel riquadro di riepilogo della pagina, se
   * c'e'. Il riepilogo e' fuori dal compilatore (di solito nella barra
   * laterale) e si aggancia con gli attributi data-riepilogo="...".
   */
  function aggiornaRiepilogo() {
    const modello = modelloCorrente();
    const regole = modello.riepilogo;
    if (!regole) return;
    Object.keys(regole).forEach((voce) => {
      const elemento = document.querySelector(`[data-riepilogo="${CSS.escape(voce)}"]`);
      if (!elemento) return;
      const valore = valutaCalcolo(regole[voce], modello);
      elemento.textContent = `${inEuro(valore)} €`;
    });
    const avvertenza = document.querySelector('[data-riepilogo="avviso"]');
    if (avvertenza && regole.saldo) {
      const saldo = valutaCalcolo(regole.saldo, modello) || 0;
      const negativo = saldo < 0;
      avvertenza.textContent = negativo
        ? 'I crediti superano i debiti: il saldo di un F24 non puo’ essere negativo. '
          + 'Riduci il credito compensato fino ad azzerare i debiti.'
        : '';
      avvertenza.classList.toggle('hidden', !negativo);
    }
  }

  function aggiornaCalcolati() {
    aggiornaRiepilogo();
    const modello = modelloCorrente();
    const passo = modello.passi[stato.passo];
    if (!passo) return;
    (passo.campi || []).forEach((campo) => {
      if (!campo.calcolo) return;
      const uscita = riquadroCorpo.querySelector(`[data-calcolato="${CSS.escape(campo.id)}"]`);
      if (!uscita) return;
      const importo = valutaCalcolo(campo.calcolo, modello);
      uscita.textContent = importo === null ? '—'
        : importo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  }

  /** Somma tutti i valori di una colonna di un gruppo ripetibile. */
  function sommaColonna(riferimento, modello) {
    const [passoId, gruppoId, sottoId] = riferimento.split('.');
    const passo = modello.passi.find((p) => p.id === passoId);
    if (!passo || !passoAttivo(passo)) return 0;
    const gruppo = (passo.ripetibili || []).find((g) => g.id === gruppoId);
    if (!gruppo) return 0;
    let totale = 0;
    for (let i = 0; i < gruppo.righe.length; i++) {
      const parti = spezzaImporto(leggi(chiaveRiga(passoId, gruppoId, i, sottoId)));
      if (parti) totale += Number(parti.euro) + Number(parti.centesimi) / 100;
    }
    return totale;
  }

  /**
   * Valuta la regola di calcolo di un totale.
   *   { somma: ["passo.gruppo.colonna", ...] }
   *   { differenza: [regola, regola] }   ciascuna regola e' a sua volta un calcolo
   */
  function valutaCalcolo(regola, modello) {
    if (!regola) return null;
    if (regola.somma) {
      return regola.somma.reduce((t, r) => t + sommaColonna(r, modello), 0);
    }
    if (regola.differenza) {
      const valori = regola.differenza.map((r) => valutaCalcolo(r, modello) || 0);
      return valori[0] - (valori[1] || 0);
    }
    return null;
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
      // Scelta unica fra riquadri stampati sul modulo: si segna con una X la
      // casella corrispondente, come si farebbe a penna.
      if (campo.type === 'radioX') {
        const scelta = opzioniDi(campo).find((o) => o.value === valore);
        if (scelta && scelta.pdf) { testi.set(scelta.pdf, 'X'); segnaQuadro(passo, campo); }
        return;
      }
      if (!campo.pdf) return;
      if (campo.type === 'importoEuro') {
        const parti = spezzaImporto(valore);
        if (!parti) return;
        testi.set(campo.pdf, parti.euro);
        if (campo.pdfCentesimi) testi.set(campo.pdfCentesimi, parti.centesimi);
        segnaQuadro(passo, campo);
        return;
      }
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
            if (sotto.type === 'checkX') {
              testi.set(nomePdf, 'X'); segnaQuadro(passo, null);
              return;
            }
            if (sotto.type === 'importoEuro') {
              const parti = spezzaImporto(valore);
              if (!parti) return;
              const nomi = typeof nomePdf === 'string' ? { euro: nomePdf } : nomePdf;
              testi.set(nomi.euro, parti.euro);
              if (nomi.cent) testi.set(nomi.cent, parti.centesimi);
              segnaQuadro(passo, null);
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

    // Totali calcolati: su un modulo di pagamento un totale sbagliato significa
    // versare la cifra sbagliata, quindi li somma il programma e non la persona.
    modello.passi.forEach((passo) => {
      if (!passoAttivo(passo)) return;
      (passo.campi || []).forEach((campo) => {
        if (!campo.calcolo || !campo.pdf) return;
        const importo = valutaCalcolo(campo.calcolo, modello);
        if (importo === null) return;
        if (campo.type === 'euro') {
          testi.set(campo.pdf, unisciImporto(importo.toFixed(2)));
          segnaQuadro(passo, campo);
          return;
        }
        const parti = spezzaImporto(importo.toFixed(2));
        testi.set(campo.pdf, parti.euro);
        if (campo.pdfCentesimi) testi.set(campo.pdfCentesimi, parti.centesimi);
        segnaQuadro(passo, campo);
      });
    });

    // Testata: i dati che il modello ripete in alto su ogni pagina.
    const testata = modello.testata || {};
    (testata.copie || []).forEach((regola) => {
      let valore = regola.valore;
      if (!valore && regola.da) {
        const [passoId, campoId] = regola.da.split('.');
        valore = perModello(leggi(chiave(passoId, campoId)) || '', regola.tipo || 'testo');
      }
      if (!valore) return;
      regola.a.forEach((nome) => testi.set(nome, valore));
    });
    if (testata.numeroPagina) {
      testata.numeroPagina.forEach((nome, i) => testi.set(nome, String(i + 1)));
      if (testata.totalePagine) testi.set(testata.totalePagine, String(testata.numeroPagina.length));
    }

    // Riquadro "quadri compilati": si barra ciò che è stato effettivamente riempito.
    if (modello.caselleQuadri) {
      quadri.forEach((lettera) => {
        const nome = modello.caselleQuadri[lettera];
        if (nome) spunte.add(nome);
      });
    }

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
        const valore = ripulisci(testo);
        try {
          const campo = modulo.getTextField(nome);
          const max = campo.getMaxLength();
          // Senza questo il corpo resta automatico e le lettere escono di
          // misura diversa in ogni riquadro: vedi il commento sopra
          // fissaCorpoDelCampo.
          fissaCorpoDelCampo(campo);
          campo.setText(max && valore.length > max ? valore.slice(0, max) : valore);
          return;
        } catch (e) { /* non e' una casella di testo: si prova col menu */ }
        // Alcuni modelli gia' compilabili dell'Agenzia (per esempio l'AA4/8)
        // usano veri menu a tendina al posto delle caselle di testo.
        try {
          const menu = modulo.getDropdown(nome);
          const scelte = menu.getOptions();
          const scelta = scelte.find((o) => o === valore)
            || scelte.find((o) => String(o).trim() === valore.trim());
          if (scelta === undefined) throw new Error('valore non in elenco');
          menu.select(scelta);
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
      const rifNome = (modello.testata && modello.testata.riferimentoNomeFile) || '';
      const [passoRif, campoRif] = rifNome.split('.');
      const identificativo = passoRif
        ? String(leggi(chiave(passoRif, campoRif)) || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
        : '';
      const nomeFile = `${modello.codice.replace(/[^A-Za-z0-9]+/g, '_')}${identificativo ? '_' + identificativo : ''}_compilato.pdf`;
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
    if (['cf', 'cfOpiva', 'provincia', 'iban', 'ibanCompleto'].includes(tipo)) {
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
      aggiornaCalcolati();
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
      // Anche le caselle di spunta vanno ridisegnate: da una spunta possono
      // dipendere altri campi, come il codice fiscale che il modello AA4/8
      // chiede solo dopo aver scelto il tipo di richiesta.
      if (elemento.dataset.tipo === 'toggle' || elemento.type === 'checkbox'
          || elemento.tagName === 'SELECT') {
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

    document.querySelectorAll('button[data-modello]').forEach((bottone) => {
      bottone.addEventListener('click', () => {
        if (stato.modello === bottone.dataset.modello) return;
        stato.modello = bottone.dataset.modello;
        stato.passo = 0;
        stato.errori = Object.create(null);
        applicaValoriIniziali();
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


  /* ------------------------------------------------------------- API esterna */

  // Permette a uno strumento della stessa pagina (per esempio il simulatore
  // delle imposte) di travasare i propri dati dentro al modulo.
  window.CompilatoreModuli = {
    /**
     * @param {Object} mappa  chiavi "passo.campo" oppure "passo.gruppo.indice.sottocampo"
     * @param {Object} [opzioni]  { attiva: ["passoOpzionale", ...] }
     * @returns {number} quanti valori sono stati effettivamente riportati
     */
    precompila(mappa, opzioni) {
      if (!stato.schema) return 0;
      let quanti = 0;
      Object.keys(mappa || {}).forEach((percorso) => {
        const valore = mappa[percorso];
        if (valore === '' || valore == null || valore === false) return;
        stato.dati[`${stato.modello}.${percorso}`] = valore;
        quanti += 1;
      });
      ((opzioni && opzioni.attiva) || []).forEach((passo) => {
        stato.attivi[`${stato.modello}.${passo}`] = true;
      });
      // Se la mappa riempie righe di un gruppo ripetibile, quelle righe devono
      // anche diventare visibili: altrimenti restano scritte nei dati ma non
      // compaiono sul modulo e non finiscono nel PDF.
      Object.keys(mappa || {}).forEach((percorso) => {
        const parti = percorso.split('.');
        if (parti.length !== 4) return;
        const indice = Number(parti[2]);
        if (!Number.isInteger(indice)) return;
        const k = `${stato.modello}.${parti[0]}.${parti[1]}`;
        stato.righe[k] = Math.max(stato.righe[k] || 1, indice + 1);
      });

      if (quanti) {
        salva();
        render();
      }
      return quanti;
    },

    /**
     * Riempie una riga di un gruppo ripetibile, riusando la prima riga rimasta
     * vuota e aggiungendone una nuova solo quando serve davvero. Serve agli
     * strumenti della stessa pagina, per esempio il calcolatore dell'IMU che
     * scrive il risultato dentro al modello.
     *
     * @param {string} passoId
     * @param {string} gruppoId
     * @param {Object} valori  sottocampo -> valore
     * @returns {number} l'indice della riga riempita, -1 se il gruppo e' pieno
     */
    aggiungiRiga(passoId, gruppoId, valori) {
      if (!stato.schema) return -1;
      const passo = modelloCorrente().passi.find((p) => p.id === passoId);
      const gruppo = passo && (passo.ripetibili || []).find((g) => g.id === gruppoId);
      if (!gruppo) return -1;

      const vuota = (i) => gruppo.sottocampi.every(
        (s) => !leggi(chiaveRiga(passoId, gruppoId, i, s.id)));

      let indice = 0;
      while (indice < gruppo.righe.length && !vuota(indice)) indice += 1;
      if (indice >= gruppo.righe.length) return -1;

      Object.keys(valori || {}).forEach((sotto) => {
        const valore = valori[sotto];
        if (valore === '' || valore == null || valore === false) return;
        stato.dati[chiaveRiga(passoId, gruppoId, indice, sotto)] = valore;
      });

      const k = `${stato.modello}.${passoId}.${gruppoId}`;
      stato.righe[k] = Math.max(stato.righe[k] || 1, indice + 1);
      stato.passo = modelloCorrente().passi.indexOf(passo);
      stato.errori = Object.create(null);
      salva();
      render();
      return indice;
    }
  };

  /* --------------------------------------------------------------- avvio */

  document.addEventListener('DOMContentLoaded', async () => {
    app = document.getElementById('mp-app');
    if (!app) return;
    riquadroPassi = document.getElementById('mp-passi');
    riquadroCorpo = document.getElementById('mp-corpo');
    riquadroNav = document.getElementById('mp-nav');
    riquadroStato = document.getElementById('mp-stato');

    stato.chiaveStato = app.dataset.stato || stato.chiaveStato;

    try {
      const [schema, regole] = await Promise.all([
        fetch(app.dataset.schema).then((r) => { if (!r.ok) throw new Error('schema'); return r.json(); }),
        fetch(PERCORSO_REGOLE).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      ]);
      stato.schema = schema;
      stato.modello = app.dataset.modello || Object.keys(schema.modelli)[0];
      const modelliRegole = regole && regole.modelli_partita_iva;
      stato.capVietati = (modelliRegole && modelliRegole.blacklist_cap_generici) || [];
    } catch (errore) {
      console.error(errore);
      riquadroCorpo.innerHTML = '<p class="mp-errore">Non è stato possibile caricare la mappa dei campi dei modelli. Ricarica la pagina.</p>';
      return;
    }

    ripristina();
    applicaValoriIniziali();
    collega();
    render();
  });
})();
