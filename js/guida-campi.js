// js/guida-campi.js — Guide contestuali ai campi dei moduli (riusabile su tutti gli strumenti)
//
// Markup atteso:
//   <button type="button" data-guida-toggle="ID" aria-expanded="false" aria-controls="ID">ⓘ</button>
//   <input data-guida="ID" aria-describedby="ID">
//   <div id="ID" role="note" hidden> ... <span data-guida-live></span> ... </div>
//
// Esempi dinamici opzionali: window.SuGuidaLive = { ID: (campo) => 'testo' }
// registrati dallo script dello strumento; vengono ricalcolati a ogni digitazione.
(function () {
  'use strict';

  const fissate = new Set();

  function card(id) {
    return document.getElementById(id);
  }

  function pulsanti(id) {
    return document.querySelectorAll('[data-guida-toggle="' + id + '"]');
  }

  function aggiornaLive(id, campo) {
    const registro = window.SuGuidaLive || {};
    const el = card(id);
    if (!el || typeof registro[id] !== 'function') return;
    const bersaglio = el.querySelector('[data-guida-live]');
    if (!bersaglio) return;
    let testo = '';
    try {
      testo = registro[id](campo) || '';
    } catch (e) {
      testo = '';
    }
    bersaglio.textContent = testo;
    bersaglio.hidden = !testo;
  }

  function apri(id, campo) {
    const el = card(id);
    if (!el) return;
    el.hidden = false;
    pulsanti(id).forEach(b => b.setAttribute('aria-expanded', 'true'));
    if (campo) aggiornaLive(id, campo);
  }

  function chiudi(id) {
    const el = card(id);
    if (!el) return;
    el.hidden = true;
    fissate.delete(id);
    pulsanti(id).forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  function campoDi(id) {
    return document.querySelector('[data-guida="' + id + '"]');
  }

  // Chiudere una card durante un clic sposta il layout tra pressione e rilascio del puntatore:
  // il clic finirebbe su un altro elemento. Le chiusure vengono quindi rinviate a clic concluso.
  let puntatorePremuto = false;
  let chiusureInSospeso = [];

  function eseguiChiusure() {
    const ids = chiusureInSospeso;
    chiusureInSospeso = [];
    ids.forEach(id => { if (!fissate.has(id)) chiudi(id); });
  }

  function init() {
    document.addEventListener('pointerdown', () => { puntatorePremuto = true; }, true);
    document.addEventListener('pointerup', () => {
      // setTimeout 0: eseguito dopo l'evento click generato dallo stesso rilascio
      setTimeout(() => { puntatorePremuto = false; eseguiChiusure(); }, 0);
    }, true);

    // Focus su un campo guidato: mostra la sua guida e chiude quelle aperte dagli altri campi.
    // Il focus su pulsanti o link non chiude nulla.
    document.addEventListener('focusin', (e) => {
      const campo = e.target.closest && e.target.closest('[data-guida]');
      if (!campo) return;
      const idCorrente = campo.dataset.guida;
      document.querySelectorAll('[data-guida]').forEach(c => {
        const id = c.dataset.guida;
        const el = card(id);
        if (id !== idCorrente && el && !el.hidden && !fissate.has(id)) chiusureInSospeso.push(id);
      });
      if (!puntatorePremuto) eseguiChiusure();
      apri(idCorrente, campo);
    });

    document.addEventListener('input', (e) => {
      const campo = e.target.closest && e.target.closest('[data-guida]');
      const el = campo ? card(campo.dataset.guida) : null;
      if (el && !el.hidden) aggiornaLive(campo.dataset.guida, campo);
    });

    // Pulsante ⓘ: apre e fissa la guida, oppure la chiude
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('[data-guida-toggle]');
      if (!btn) return;
      e.preventDefault();
      const id = btn.dataset.guidaToggle;
      if (card(id) && card(id).hidden) {
        fissate.add(id);
        apri(id, campoDi(id));
      } else {
        chiudi(id);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const campo = e.target.closest && (e.target.closest('[data-guida]') || e.target.closest('[data-guida-toggle]'));
      if (!campo) return;
      const id = campo.dataset.guida || campo.dataset.guidaToggle;
      if (card(id) && !card(id).hidden) {
        chiudi(id);
        e.stopPropagation();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
