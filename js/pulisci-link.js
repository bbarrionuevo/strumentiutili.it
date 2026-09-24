// js/pulisci-link.js — Togliere da un link quello che serve solo a tracciare.
//
// Un link condiviso si porta dietro parametri che non servono ad aprire la
// pagina: utm_source, fbclid, gclid, l'identificativo di condivisione di
// YouTube e Spotify, le mille varianti di Amazon. Dicono a chi l'ha creato da
// dove arrivi e chi te l'ha mandato. Qui si tolgono, e si scartano anche i
// "reindirizzamenti" di Google, Facebook, Instagram e Outlook, che avvolgono il
// link vero dentro il proprio.
//
// Tutto sul testo: nessuna richiesta di rete. Per questo non si possono
// "espandere" i link corti (bit.ly e simili): per sapere dove portano bisogna
// chiederlo a loro server, e questo strumento non contatta nessuno.
//
// Funziona nel browser (window.PulisciLink) e in Node.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PulisciLink = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Parametri di tracciamento validi su qualunque sito.
  var OVUNQUE = {
    fbclid: 'identificativo del clic da Facebook',
    gclid: 'identificativo del clic da Google Ads',
    gclsrc: 'origine del clic da Google Ads',
    dclid: 'identificativo del clic da Google Display',
    gbraid: 'identificativo del clic da Google Ads',
    wbraid: 'identificativo del clic da Google Ads',
    msclkid: 'identificativo del clic da Microsoft Ads',
    twclid: 'identificativo del clic da X (Twitter)',
    ttclid: 'identificativo del clic da TikTok',
    li_fat_id: 'identificativo del clic da LinkedIn',
    igshid: 'identificativo della condivisione da Instagram',
    igsh: 'identificativo della condivisione da Instagram',
    mc_cid: 'campagna email di Mailchimp',
    mc_eid: 'destinatario dell’email di Mailchimp',
    _hsenc: 'tracciamento email di HubSpot',
    _hsmi: 'tracciamento email di HubSpot',
    mkt_tok: 'tracciamento email di Marketo',
    yclid: 'identificativo del clic da Yandex',
    ysclid: 'identificativo del clic da Yandex',
    srsltid: 'identificativo del risultato di Google Shopping',
    _ga: 'identificativo di Google Analytics',
    _gl: 'identificativo di Google Analytics',
    oly_anon_id: 'tracciamento di Omeda',
    oly_enc_id: 'tracciamento di Omeda',
    vero_id: 'tracciamento email di Vero',
    wickedid: 'tracciamento di Wicked Reports',
    s_cid: 'campagna di Adobe Analytics',
    ref_src: 'origine della condivisione da X (Twitter)'
  };

  // Parametri che tracciano solo su certi siti: altrove lo stesso nome
  // potrebbe servire alla pagina (su un sito qualsiasi "si" puo' voler dire
  // qualcosa), quindi si tolgono solo dove si sa che cosa sono.
  var PER_SITO = [
    { dominio: /(^|\.)(youtube\.com|youtu\.be)$/, parametri: { si: 'identificativo della condivisione', feature: 'modo in cui e’ stato condiviso', pp: 'dati di tracciamento della ricerca' } },
    { dominio: /(^|\.)spotify\.com$/, parametri: { si: 'identificativo della condivisione', context: 'contesto della condivisione' } },
    { dominio: /(^|\.)(x\.com|twitter\.com)$/, parametri: { s: 'tipo di condivisione', t: 'identificativo della condivisione' } },
    { dominio: /(^|\.)(tiktok\.com)$/, parametri: { _t: 'identificativo della condivisione', _r: 'identificativo della condivisione', is_from_webapp: 'origine della condivisione', sender_device: 'dispositivo di chi ha condiviso', sender_web_id: 'identificativo di chi ha condiviso' } },
    { dominio: /(^|\.)(aliexpress\.[a-z.]+)$/, parametri: { spm: 'percorso di navigazione', scm: 'tracciamento interno', pvid: 'tracciamento interno', algo_pvid: 'tracciamento interno', algo_exp_id: 'tracciamento interno', aff_fcid: 'affiliazione', aff_fsk: 'affiliazione', aff_platform: 'affiliazione', aff_trace_key: 'affiliazione', sk: 'affiliazione', terminal_id: 'tracciamento interno' } },
    { dominio: /(^|\.)(ebay\.[a-z.]+)$/, parametri: { _trkparms: 'tracciamento interno', _trksid: 'tracciamento interno', hash: 'tracciamento interno', amdata: 'tracciamento interno', mkcid: 'campagna', mkrid: 'campagna', campid: 'affiliazione', customid: 'affiliazione', toolid: 'affiliazione', mkevt: 'campagna' } }
  ];

  // Siti che avvolgono il link vero dentro il proprio.
  var AVVOLGENTI = [
    { dominio: /(^|\.)google\.[a-z.]+$/, percorso: /^\/url$/, parametro: ['q', 'url'], nome: 'Google' },
    { dominio: /^l\.facebook\.com$|^lm\.facebook\.com$/, percorso: /^\/l\.php$/, parametro: ['u'], nome: 'Facebook' },
    { dominio: /^l\.instagram\.com$/, percorso: /^\/$/, parametro: ['u'], nome: 'Instagram' },
    { dominio: /(^|\.)safelinks\.protection\.outlook\.com$/, percorso: /.*/, parametro: ['url'], nome: 'Outlook' },
    { dominio: /(^|\.)youtube\.com$/, percorso: /^\/redirect$/, parametro: ['q'], nome: 'YouTube' },
    { dominio: /(^|\.)linkedin\.com$/, percorso: /^\/redir\/redirect$/, parametro: ['url'], nome: 'LinkedIn' }
  ];

  function eAmazon(host) { return /(^|\.)amazon\.[a-z.]+$/.test(host); }

  function nuovaUrl(testo) {
    try { return new URL(testo); } catch (e) { return null; }
  }

  // Amazon: la pagina di un prodotto e' tutta nell'ASIN. Il resto (ref,
  // pf_rd_*, qid, sr, crid, tag...) e' tracciamento o affiliazione.
  function pulisciAmazon(u, rimossi) {
    var m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?]|$)/i);
    if (!m) return false;
    u.searchParams.forEach(function (valore, nome) { rimossi.push({ nome: nome, valore: valore, motivo: 'tracciamento o affiliazione di Amazon' }); });
    var resto = u.pathname.replace(m[0], '');
    if (resto && resto !== '/') rimossi.push({ nome: 'percorso', valore: resto, motivo: 'tracciamento di Amazon nel percorso' });
    u.pathname = '/dp/' + m[1].toUpperCase();
    u.search = '';
    return true;
  }

  function pulisciUrl(testo) {
    var avvisi = [];
    var rimossi = [];
    var u = nuovaUrl(String(testo).trim());
    if (!u || !/^https?:$/.test(u.protocol)) return { valido: false, originale: testo, pulito: testo, rimossi: rimossi, avvisi: avvisi };

    // Si scartano gli involucri, anche uno dentro l'altro (Outlook che avvolge Google).
    for (var giri = 0; giri < 5; giri++) {
      var host = u.hostname.toLowerCase();
      var involucro = AVVOLGENTI.filter(function (a) { return a.dominio.test(host) && a.percorso.test(u.pathname); })[0];
      if (!involucro) break;
      var dentro = null;
      for (var i = 0; i < involucro.parametro.length && !dentro; i++) dentro = u.searchParams.get(involucro.parametro[i]);
      var interno = dentro && nuovaUrl(dentro);
      if (!interno || !/^https?:$/.test(interno.protocol)) break;
      avvisi.push('Il link passava da ' + involucro.nome + ', che registra il clic prima di mandarti alla pagina: ora porta direttamente a destinazione.');
      u = interno;
    }

    var h = u.hostname.toLowerCase();
    if (!(eAmazon(h) && pulisciAmazon(u, rimossi))) {
      var perSito = {};
      PER_SITO.forEach(function (r) { if (r.dominio.test(h)) Object.keys(r.parametri).forEach(function (k) { perSito[k] = r.parametri[k]; }); });
      var nomi = [];
      u.searchParams.forEach(function (valore, nome) { nomi.push([nome, valore]); });
      nomi.forEach(function (coppia) {
        var nome = coppia[0], chiave = nome.toLowerCase(), motivo = null;
        if (/^utm_/.test(chiave)) motivo = 'campagna di marketing (' + chiave.slice(4) + ')';
        else if (Object.prototype.hasOwnProperty.call(OVUNQUE, chiave)) motivo = OVUNQUE[chiave];
        else if (/^(pf_rd_|pd_rd_)/.test(chiave)) motivo = 'tracciamento di Amazon';
        else if (Object.prototype.hasOwnProperty.call(perSito, chiave)) motivo = perSito[chiave] || 'tracciamento';
        if (!motivo) return;
        rimossi.push({ nome: nome, valore: coppia[1], motivo: motivo });
        u.searchParams.delete(nome);
      });
    }

    var pulito = u.toString();
    // URLSearchParams lascia un "?" vuoto quando toglie l'ultimo parametro.
    if (!u.search) pulito = pulito.replace(/\?(?=#|$)/, '');
    return { valido: true, originale: testo, pulito: pulito, rimossi: rimossi, avvisi: avvisi };
  }

  // Un messaggio intero (per esempio copiato da WhatsApp): si puliscono tutti
  // i link che contiene e il resto del testo resta com'e'.
  var RE_LINK = /https?:\/\/[^\s<>"'`]+/g;

  function pulisciTesto(testo) {
    var link = [];
    var fuori = String(testo || '').replace(RE_LINK, function (trovato) {
      // La punteggiatura finale di una frase non fa parte del link.
      var coda = (trovato.match(/[.,;:!?)\]}]+$/) || [''])[0];
      var corpo = coda ? trovato.slice(0, -coda.length) : trovato;
      var r = pulisciUrl(corpo);
      link.push(r);
      return r.pulito + coda;
    });
    return { testo: fuori, link: link };
  }

  return { pulisciUrl: pulisciUrl, pulisciTesto: pulisciTesto };
});
