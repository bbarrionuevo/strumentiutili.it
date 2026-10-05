// js/storage-helper.js — I valori dei calcolatori, ricordati su questo dispositivo.
//
// Chi torna su un calcolatore ritrova i numeri che aveva inserito: e' una delle
// ragioni per tornare. Ma fino a ieri succedeva in silenzio, per ogni campo di
// ogni pagina e per sempre, mentre la pagina Chi siamo prometteva che chiusa la
// scheda i dati sparivano. Ora:
//
//   1. Si dice. Una riga in cima alla pagina avvisa quando i valori vengono
//      salvati o ritrovati, con il comando per cancellarli.
//   2. I campi sensibili non si salvano: quelli marcati data-no-save e quelli
//      che per nome sono IBAN, codice fiscale, password, PIN o carte. Quelli
//      gia' salvati in passato si tolgono al primo caricamento.
//   3. Tutto si cancella dal piede di ogni pagina (js/spazio.js).
//   4. Sulle calcolatrici con il pulsante [data-condividi] il calcolo si
//      condivide con un link: chi lo apre ritrova gli stessi valori e il
//      risultato. Nel link vanno solo numeri, date e scelte dei menu, mai
//      nomi, codici fiscali o IBAN; e un link preparato apposta non puo'
//      scrivere testo nella pagina. I valori stanno dopo il # dell'indirizzo:
//      quella parte il browser non la manda mai al server.
//
// L'API AppStorage (save, load, remove) resta la stessa: la usano anche
// js/compilatore-moduli.js e js/generatore-cv-ats.js.
(function () {
  'use strict';

  const AppStorage = {
    save(key, data) {
      try {
        localStorage.setItem(`su_${key}`, JSON.stringify(data));
      } catch (e) {
        console.warn('[Storage] Salvataggio locale non riuscito:', e);
      }
    },

    load(key, fallback = null) {
      try {
        const item = localStorage.getItem(`su_${key}`);
        return item ? JSON.parse(item) : fallback;
      } catch (e) {
        console.warn('[Storage] Lettura locale non riuscita per la chiave:', key);
        return fallback;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(`su_${key}`);
      } catch (e) {
        console.warn('[Storage] Cancellazione locale non riuscita:', e);
      }
    }
  };

  // Nomi di campo che contengono dati da non lasciare in un browser che
  // magari e' condiviso: si confronta la parola intera, cosi' "cf" colpisce
  // "f24-cf" ma non "cfu".
  const SENSIBILE = /(^|[-_])(iban|cf|codice[-_]?fiscale|password|pwd|pin|cvv|carta|card)([-_]|$)/i;
  // I modelli (js/compilatore-moduli.js) chiamano i campi in camelCase e con i
  // punti ("f24.contribuente.cfCoobbligato", "ibanEstero", "altroCf2"): si
  // separano le parole prima del confronto.
  const parole = (chiave) => String(chiave || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .replace(/\./g, '-');
  const sensibile = (chiave) => SENSIBILE.test(parole(chiave));
  const TIPI_ESCLUSI = ['file', 'password', 'submit', 'button', 'hidden', 'reset', 'image'];

  function chiaveCampo(el) { return el.id || el.name || ''; }

  function daSalvare(el) {
    const chiave = chiaveCampo(el);
    if (!chiave || TIPI_ESCLUSI.includes(el.type)) return false;
    if (el.hasAttribute && el.hasAttribute('data-no-save')) return false;
    if (el.closest && el.closest('[data-no-save]')) return false;
    return !sensibile(chiave);
  }

  AppStorage.campoSensibile = sensibile;

  // ------------------------------------------------ il calcolo in un link

  const NUMERO = /^-?[0-9]{1,12}([.,][0-9]{1,4})?$/;
  const DATA = /^\d{4}-\d{2}-\d{2}$/;

  /** Il valore che un campo puo' prendere da un link, o null. */
  function valoreAmmesso(el, v) {
    v = String(v == null ? '' : v).trim();
    if (el.tagName === 'SELECT') return Array.from(el.options).some((o) => o.value === v) ? v : null;
    if (el.type === 'checkbox') return v === '1' || v === '0' ? v : null;
    if (el.type === 'radio') return v === el.value ? v : null;
    if (el.type === 'date') return DATA.test(v) ? v : null;
    if (el.tagName === 'TEXTAREA' || !['text', 'number', 'range', 'tel'].includes(el.type)) return null;
    v = v.replace(/\s/g, '');
    return NUMERO.test(v) ? v : null;
  }

  /** Le coppie [nome, valore] dei campi cambiati rispetto alla pagina appena aperta. */
  function valoriDelCalcolo(campi) {
    const coppie = [];
    campi.forEach((el) => {
      if (!daSalvare(el)) return;
      if (el.type === 'radio') {
        if (el.checked && !el.defaultChecked && el.name && valoreAmmesso(el, el.value) !== null) coppie.push([el.name, el.value]);
        return;
      }
      let v;
      let iniziale;
      if (el.type === 'checkbox') { v = el.checked ? '1' : '0'; iniziale = el.defaultChecked ? '1' : '0'; }
      else if (el.tagName === 'SELECT') {
        const d = Array.from(el.options).find((o) => o.defaultSelected) || el.options[0];
        v = el.value; iniziale = d ? d.value : '';
      } else { v = el.value; iniziale = el.defaultValue; }
      if (v === iniziale) return;
      const ammesso = valoreAmmesso(el, v);
      if (ammesso !== null) coppie.push([chiaveCampo(el), ammesso]);
    });
    return coppie;
  }

  /** Mette nei campi i valori arrivati dal link; restituisce i campi cambiati. */
  function valoriDalLink(campi, cerca) {
    const p = new URLSearchParams(cerca || '');
    const cambiati = [];
    campi.forEach((el) => {
      if (!daSalvare(el) || el.getAttribute('data-da-url') === '1') return;
      const chiave = el.type === 'radio' ? el.name : chiaveCampo(el);
      if (!chiave || !p.has(chiave)) return;
      const v = valoreAmmesso(el, p.get(chiave));
      if (v === null) return;
      if (el.type === 'radio') el.checked = true;
      else if (el.type === 'checkbox') el.checked = v === '1';
      else el.value = v;
      el.setAttribute('data-da-url', '1');
      cambiati.push(el);
    });
    return cambiati;
  }

  function avviaCondividi(pulsante, campi) {
    const esito = pulsante.parentElement && pulsante.parentElement.querySelector('[data-condividi-esito]');
    const scrivi = (testo) => { if (esito) esito.textContent = testo; };
    pulsante.addEventListener('click', async () => {
      const coppie = valoriDelCalcolo(campi);
      if (!coppie.length) { scrivi('Inserisci prima i tuoi valori: il link li porta con sé.'); return; }
      const url = location.origin + location.pathname + location.search + '#' + new URLSearchParams(coppie).toString();
      // Sul telefono il menu di condivisione (WhatsApp, email...); sul computer il link copiato
      const telefono = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (navigator.share && telefono) {
        try { await navigator.share({ title: document.title, url }); scrivi(''); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      try {
        await navigator.clipboard.writeText(url);
        scrivi('Link copiato: chi lo apre vede questo calcolo con i tuoi valori (mai codici fiscali o IBAN).');
      } catch (e) {
        scrivi('Copia questo link: ' + url);
      }
    });
  }

  AppStorage.linkCalcolo = { valoreAmmesso, valoriDelCalcolo, valoriDalLink };

  // ---------------------------------------------------- avviso in pagina

  function avviso(container, ritrovati, suCancella) {
    let barra = document.getElementById('su-memoria');
    if (!barra) {
      barra = document.createElement('div');
      barra.id = 'su-memoria';
      barra.setAttribute('role', 'status');
      barra.className = 'su-memoria mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs text-gray-600';
      const testo = document.createElement('span');
      testo.setAttribute('data-testo', '');
      const bottone = document.createElement('button');
      bottone.type = 'button';
      bottone.className = 'font-semibold text-indigo-700 hover:underline';
      bottone.textContent = 'Cancella';
      bottone.addEventListener('click', () => { suCancella(); barra.remove(); });
      barra.appendChild(testo);
      barra.appendChild(bottone);
      // Subito sotto le briciole di pane, dove si guarda per prima cosa.
      const principale = document.querySelector('main');
      const briciole = principale && principale.querySelector('nav[aria-label="Percorso"]');
      if (briciole) briciole.insertAdjacentElement('afterend', barra);
      else if (principale) principale.insertAdjacentElement('afterbegin', barra);
      else return;
    }
    barra.querySelector('[data-testo]').textContent = ritrovati
      ? '💾 Hai ritrovato i valori inseriti l’ultima volta: sono salvati solo su questo dispositivo.'
      : '💾 I valori che inserisci restano salvati solo su questo dispositivo, per ritrovarli la prossima volta.';
  }

  // ------------------------------------------------------------- avvio

  document.addEventListener('DOMContentLoaded', () => {
    // Una chiave per pagina (es. "form_data__fisco_professioni_partita_iva_").
    const pageKey = location.pathname.replace(/[\/\.]/g, '_') || 'home';
    const storageKey = `form_data_${pageKey}`;

    const containers = document.querySelectorAll('form, main');
    if (!containers.length) return;

    const savedData = AppStorage.load(storageKey, {}) || {};

    // Dati sensibili salvati dalle versioni precedenti: via.
    let ripulito = false;
    Object.keys(savedData).forEach((k) => {
      const campo = document.getElementById(k);
      if (sensibile(k) || (campo && campo.closest && campo.closest('[data-no-save]'))) { delete savedData[k]; ripulito = true; }
    });
    if (ripulito) AppStorage.save(storageKey, savedData);

    const tutti = [];
    let ritrovati = 0;

    // Un calcolo arrivato da un link: i suoi valori al posto di quelli ricordati
    const pulsanti = document.querySelectorAll('[data-condividi]');
    let dalLink = [];
    if (pulsanti.length) {
      const campiPagina = Array.from(document.querySelectorAll('main input, main select'));
      dalLink = valoriDalLink(campiPagina, location.hash.replace(/^#/, ''));
      pulsanti.forEach((b) => avviaCondividi(b, campiPagina));
      const ricalcola = async (campi) => {
        // Gli strumenti che aspettano le regole fiscali (js/data-loader.js)
        // collegano il pulsante «Calcola» solo dopo: si aspetta la stessa
        // richiesta, poi un giro in piu'.
        try { if (window.StrumentiData && window.StrumentiData.getRegoleFiscali) await window.StrumentiData.getRegoleFiscali(); } catch (e) { /* si calcola lo stesso */ }
        await new Promise((ok) => setTimeout(ok, 0));
        campi.forEach((el) => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const calcola = document.querySelector('[data-calcola]');
        if (calcola) calcola.click();
        const esito = document.querySelector('[data-condividi-esito]');
        if (esito) esito.textContent = 'Stai guardando un calcolo condiviso con un link: cambia i valori per rifarlo con i tuoi.';
      };
      if (dalLink.length) window.addEventListener('load', () => ricalcola(dalLink));
      // Un link alla stessa pagina gia' aperta cambia solo la parte dopo il #: niente ricarica
      window.addEventListener('hashchange', () => {
        campiPagina.forEach((el) => el.removeAttribute('data-da-url'));
        const nuovi = valoriDalLink(campiPagina, location.hash.replace(/^#/, ''));
        if (nuovi.length) ricalcola(nuovi);
      });
    }

    function cancellaPagina() {
      AppStorage.remove(storageKey);
      Object.keys(savedData).forEach((k) => delete savedData[k]);
      // Ogni campo torna al valore con cui la pagina e' arrivata.
      tutti.forEach((input) => {
        if (input.type === 'checkbox' || input.type === 'radio') input.checked = input.defaultChecked;
        else if (input.tagName === 'SELECT') {
          Array.from(input.options).forEach((o) => { o.selected = o.defaultSelected; });
        } else input.value = input.defaultValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    containers.forEach((container) => {
      const inputs = Array.from(container.querySelectorAll('input, select, textarea')).filter(daSalvare);
      inputs.forEach((i) => { if (!tutti.includes(i)) tutti.push(i); });

      // 1. Valori ritrovati (non se il calcolo arriva da un link)
      inputs.forEach((input) => {
        if (dalLink.length) return;
        const fieldKey = chiaveCampo(input);
        if (savedData[fieldKey] === undefined) return;
        // la scelta arrivata dall'indirizzo (js/parametri-url.js) vince su quella ricordata
        if (input.getAttribute('data-da-url') === '1') return;
        if (input.type === 'checkbox') input.checked = Boolean(savedData[fieldKey]);
        else if (input.type === 'radio') input.checked = (input.value === savedData[fieldKey]);
        else input.value = savedData[fieldKey];
        ritrovati++;
        // Le calcolatrici reattive devono ricalcolare con i valori ritrovati.
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // 2. Salvataggio mentre si scrive
      container.addEventListener('input', (e) => {
        const target = e.target;
        if (!e.isTrusted || !daSalvare(target)) return;
        const fieldKey = chiaveCampo(target);
        if (target.type === 'checkbox') savedData[fieldKey] = target.checked;
        else if (target.type === 'radio') { if (target.checked) savedData[fieldKey] = target.value; }
        else savedData[fieldKey] = target.value;
        AppStorage.save(storageKey, savedData);
        avviso(container, false, cancellaPagina);
      });
    });

    if (ritrovati) avviso(containers[0], true, cancellaPagina);
  });

  window.AppStorage = AppStorage;
})();
