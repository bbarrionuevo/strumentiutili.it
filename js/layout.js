// js/layout.js — Comportamento comune a tutte le pagine: registrazione del
// service worker, menu delle categorie su telefono e ricerca fra gli strumenti
// (che capisce le frasi grazie a js/assistente.js).
//
// Prima il menu esisteva solo da 1024px in su e la ricerca solo in home.
(function () {
  'use strict';

  // ------------------------------------------------------ service worker

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // --------------------------------------------- riapertura del consenso

  // Il GDPR (art. 7.3) chiede che ritirare il consenso sia facile quanto darlo.
  // Il messaggio lo mostra la CMP di Google configurata in AdSense ("Privacy e
  // messaggi"), che arriva con adsbygoogle.js. Il comando nel piede parte
  // nascosto e compare solo quando la CMP e' pronta, cioe' dove il messaggio
  // viene davvero mostrato: altrove sarebbe un bottone che non fa niente.
  //
  // Si usa l'API ufficiale: le funzioni si accodano in googlefc.callbackQueue
  // e Google le esegue quando la CMP e' caricata, anche se arriva tardi su
  // una rete lenta (prima si controllava per dieci secondi e poi si
  // rinunciava). Con un blocco pubblicita' la CMP non arriva e il comando
  // resta nascosto, come deve.
  function avviaRevocaConsenso() {
    var voce = document.getElementById('riapri-consenso-voce');
    var bottone = document.getElementById('riapri-consenso');
    if (!voce || !bottone) return;

    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push({
      CONSENT_API_READY: function () {
        if (typeof window.googlefc.showRevocationMessage !== 'function') return;
        voce.hidden = false;
        bottone.addEventListener('click', function () {
          window.googlefc.callbackQueue.push(window.googlefc.showRevocationMessage);
        });
      }
    });
  }

  // ------------------------------------------------------- menu telefono

  function avviaMenu() {
    var bottone = document.getElementById('menu-toggle');
    var pannello = document.getElementById('menu-mobile');
    if (!bottone || !pannello) return;

    var iconaApri = bottone.querySelector('[data-menu-icona="apri"]');
    var iconaChiudi = bottone.querySelector('[data-menu-icona="chiudi"]');

    function mostra(aperto) {
      pannello.hidden = !aperto;
      bottone.setAttribute('aria-expanded', aperto ? 'true' : 'false');
      bottone.setAttribute('aria-label', aperto ? 'Chiudi il menu delle categorie' : 'Apri il menu delle categorie');
      if (iconaApri) iconaApri.classList.toggle('hidden', aperto);
      if (iconaChiudi) iconaChiudi.classList.toggle('hidden', !aperto);
    }

    bottone.addEventListener('click', function () {
      mostra(pannello.hidden);
    });

    // Esc chiude e riporta il fuoco sul bottone, altrimenti si resta persi.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !pannello.hidden) {
        mostra(false);
        bottone.focus();
      }
    });

    // Un tocco fuori dal menu lo chiude.
    document.addEventListener('click', function (e) {
      if (pannello.hidden) return;
      if (pannello.contains(e.target) || bottone.contains(e.target)) return;
      mostra(false);
    });

    // Tornando al layout da computer il pannello non deve restare aperto.
    if (window.matchMedia) {
      var grande = window.matchMedia('(min-width: 1024px)');
      var suCambio = function (e) { if (e.matches) mostra(false); };
      if (grande.addEventListener) grande.addEventListener('change', suCambio);
      else if (grande.addListener) grande.addListener(suCambio);
    }
  }

  // ------------------------------------------------------------ ricerca

  // L'indice degli strumenti e il motore che capisce le frasi
  // (js/assistente.js, con il vocabolario di data/sinonimi.json) si caricano
  // al primo uso, una volta sola per pagina. Se il motore non arriva si torna
  // alla ricerca semplice: tutte le parole nel titolo o nella descrizione.
  var ricercaPronta = null;

  function caricaScript(src) {
    return new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = ko;
      document.head.appendChild(s);
    });
  }

  function preparaRicerca() {
    if (ricercaPronta) return ricercaPronta;
    var json = function (u, vuoto) {
      return fetch(u).then(function (r) { return r.ok ? r.json() : vuoto; }).catch(function () { return vuoto; });
    };
    ricercaPronta = Promise.all([
      json('/data/strumenti.json', { strumenti: [] }),
      json('/data/sinonimi.json', null),
      window.Assistente ? Promise.resolve() : caricaScript('/js/assistente.js').catch(function () {})
    ]).then(function (r) {
      var indice = r[0].strumenti || [];
      var motore = null;
      if (window.Assistente && r[1]) {
        try { motore = window.Assistente.prepara(indice, r[1]); } catch (e) { motore = null; }
      }
      return { indice: indice, motore: motore };
    });
    return ricercaPronta;
  }

  function senzaAccenti(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // La ricerca semplice di prima, di riserva: tutte le parole devono
  // comparire, il titolo pesa piu' della descrizione, le varianti dopo.
  function punteggio(voce, parole) {
    var titolo = senzaAccenti(voce.titolo);
    var testo = titolo + ' ' + senzaAccenti(voce.descrizione) + ' ' + senzaAccenti(voce.percorso);
    var p = 0;
    for (var i = 0; i < parole.length; i++) {
      if (testo.indexOf(parole[i]) === -1) return -1;
      if (titolo.indexOf(parole[i]) === 0) p += 3;
      else if (titolo.indexOf(parole[i]) !== -1) p += 2;
      else p += 1;
    }
    if (voce.variante) p -= 1;
    return p;
  }

  function risultati(testo) {
    return preparaRicerca().then(function (dati) {
      if (!senzaAccenti(testo).trim()) return [];
      if (dati.motore) {
        return window.Assistente.cerca(dati.motore, testo, 12).map(function (x) { return x.voce; });
      }
      var parole = senzaAccenti(testo).split(/\s+/).filter(Boolean);
      return dati.indice
        .map(function (v) { return { v: v, p: punteggio(v, parole) }; })
        .filter(function (x) { return x.p >= 0; })
        .sort(function (a, b) { return b.p - a.p || a.v.titolo.localeCompare(b.v.titolo); })
        .map(function (x) { return x.v; });
    });
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Una casella di ricerca con la sua tendina dei risultati (quella in alto
  // in tutte le pagine e quella grande della home)
  function avviaRicerca(campo, tendina, prefisso) {
    if (!campo || !tendina) return;
    var evidenziato = -1;

    function apri(aperto) {
      tendina.hidden = !aperto;
      campo.setAttribute('aria-expanded', aperto ? 'true' : 'false');
      if (!aperto) { evidenziato = -1; campo.removeAttribute('aria-activedescendant'); }
    }

    function voci() {
      return Array.prototype.slice.call(tendina.querySelectorAll('[role="option"]'));
    }

    function evidenzia(nuovo) {
      var elenco = voci();
      if (!elenco.length) return;
      if (evidenziato >= 0 && elenco[evidenziato]) elenco[evidenziato].classList.remove('bg-indigo-50');
      evidenziato = (nuovo + elenco.length) % elenco.length;
      var attivo = elenco[evidenziato];
      attivo.classList.add('bg-indigo-50');
      campo.setAttribute('aria-activedescendant', attivo.id);
      if (attivo.scrollIntoView) attivo.scrollIntoView({ block: 'nearest' });
    }

    function disegna(trovati, testo) {
      if (!trovati.length) {
        tendina.innerHTML = '<p class="px-4 py-3 text-sm text-gray-600">Non ho trovato uno strumento per &laquo;' +
          esc(testo) + '&raquo;. Prova a dirlo con altre parole (per esempio &laquo;pagare il bollo&raquo; o ' +
          '&laquo;unire due PDF&raquo;) oppure guarda la <a class="text-indigo-700 underline" href="/mappa-del-sito/">mappa di tutti gli strumenti</a>.</p>';
        apri(true);
        return;
      }

      var righe = trovati.slice(0, 8).map(function (v, i) {
        var etichetta = v.variante
          ? esc(v.variante.genere) + ': ' + esc(v.variante.etichetta)
          : (/^\/guide\//.test(v.percorso) ? 'Guida' : esc(v.nomeCategoria));
        return '<a id="' + prefisso + '-' + i + '" role="option" href="' + esc(v.percorso) + '" ' +
          'class="block px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none">' +
          '<span class="block text-xs font-semibold uppercase tracking-wide text-indigo-600">' + etichetta + '</span>' +
          '<span class="block text-sm font-medium text-gray-900 mt-0.5">' + esc(v.titolo) + '</span>' +
          (i === 0 && v.descrizione ? '<span class="block text-xs text-gray-600 mt-1">' + esc(v.descrizione) + '</span>' : '') +
          '</a>';
      }).join('');

      tendina.innerHTML = righe;
      apri(true);
    }

    function cerca(testo) {
      if (!senzaAccenti(testo).trim()) { apri(false); return; }
      risultati(testo).then(function (trovati) {
        if (campo.value.trim() !== testo) return;   // nel frattempo si e' scritto altro
        disegna(trovati, testo);
      });
    }

    var attesa = null;
    campo.addEventListener('input', function (e) {
      var testo = e.target.value.trim();
      clearTimeout(attesa);
      attesa = setTimeout(function () { cerca(testo); }, 120);
    });

    campo.addEventListener('keydown', function (e) {
      if (e.isComposing) return;   // Invio che conferma un carattere (tastiere IME)
      if (e.key === 'Escape') { apri(false); return; }
      if (e.key === 'Enter') {
        // Invio: la voce scelta con le frecce o, se non se n'e' scelta
        // nessuna, il primo risultato.
        var testo = campo.value.trim();
        e.preventDefault();
        if (!testo) return;
        var attivo = !tendina.hidden && evidenziato >= 0 ? voci()[evidenziato] : null;
        if (attivo) { window.location.href = attivo.getAttribute('href'); return; }
        clearTimeout(attesa);
        risultati(testo).then(function (trovati) {
          if (trovati.length) window.location.href = trovati[0].percorso;
          else disegna(trovati, testo);
        });
        return;
      }
      if (tendina.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); evidenzia(evidenziato + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); evidenzia(evidenziato - 1); }
    });

    campo.addEventListener('focus', function () {
      preparaRicerca();   // si comincia a caricare mentre si scrive
      if (campo.value.trim()) cerca(campo.value.trim());
    });

    document.addEventListener('click', function (e) {
      if (tendina.hidden) return;
      if (tendina.contains(e.target) || campo.contains(e.target)) return;
      apri(false);
    });

    return { cerca: cerca };
  }

  // Gli esempi sotto la ricerca della home: senza JavaScript sono link allo
  // strumento, con JavaScript scrivono la frase nella casella e mostrano i
  // risultati, per far vedere che si puo' scrivere come si parla.
  function avviaEsempi(campo, ricerca) {
    if (!campo || !ricerca) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-esempio]'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        campo.value = a.getAttribute('data-esempio');
        campo.focus();
        ricerca.cerca(campo.value.trim());
      });
    });
  }

  // -------------------------------------------------------- il tuo spazio

  // Recenti, preferiti e cancellazione (la logica e' in js/spazio.js). Tutto
  // resta nel browser: e' la memoria che fa ritrovare a chi torna i propri
  // strumenti, e si cancella dal piede di ogni pagina.
  function avviaSpazio() {
    var S = window.Spazio;
    if (!S) return;
    var disponibile = (function () {
      try { localStorage.setItem('su_prova', '1'); localStorage.removeItem('su_prova'); return true; } catch (e) { return false; }
    })();
    if (!disponibile) return;

    var stella = document.getElementById('su-fissa');
    if (stella) {
      var percorso = stella.getAttribute('data-percorso');
      var titolo = stella.getAttribute('data-titolo');
      S.registraVisita(percorso, titolo);
      var segno = stella.querySelector('[data-stella]');
      var testo = stella.querySelector('[data-stella-testo]');
      var aggiornaStella = function () {
        var fissato = S.eFissato(percorso);
        stella.setAttribute('aria-pressed', fissato ? 'true' : 'false');
        if (segno) segno.textContent = fissato ? '★' : '☆';
        if (testo) testo.textContent = fissato ? 'Tra i preferiti' : 'Salva tra i preferiti';
        stella.classList.toggle('text-amber-700', fissato);
        stella.classList.toggle('border-amber-300', fissato);
        stella.classList.toggle('bg-amber-50', fissato);
      };
      stella.addEventListener('click', function () { S.alterna(percorso, titolo); aggiornaStella(); });
      aggiornaStella();
      stella.hidden = false; // pagine generate prima che il posto fosse riservato
      stella.classList.remove('invisible');
    }

    var voce = document.getElementById('su-cancella-voce');
    var cancella = document.getElementById('su-cancella-dati');
    if (voce && cancella) {
      voce.hidden = false;
      cancella.addEventListener('click', function () {
        if (!window.confirm('Cancellare da questo dispositivo i valori inseriti negli strumenti, le partite, le flashcard, i preferiti e gli strumenti recenti?')) return;
        var quanti = S.cancellaTutto();
        // I file condivisi verso l'app installata aspettano qui (vedi sw.js);
        // mazzi e carte delle flashcard stanno nel loro database.
        ['strumentiutili', 'strumentiutili-flashcard'].forEach(function (nome) {
          try { if (window.indexedDB) window.indexedDB.deleteDatabase(nome); } catch (e) { /* niente */ }
        });
        cancella.textContent = quanti ? 'Dati cancellati da questo dispositivo' : 'Non c’era niente da cancellare';
        cancella.disabled = true;
      });
    }

    disegnaPerTe(S);
  }

  // La riga "Per te" della home: preferiti, poi recenti. Costruita con
  // textContent, mai con innerHTML: i titoli vengono dall'archivio del browser.
  function disegnaPerTe(S) {
    var sezione = document.getElementById('per-te');
    var elenco = document.getElementById('per-te-elenco');
    if (!sezione || !elenco) return;
    var voci = S.perTe(6);
    if (!voci.length) return;
    elenco.textContent = '';
    voci.forEach(function (v) {
      var a = document.createElement('a');
      a.href = v.percorso;
      a.className = 'flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-indigo-300 hover:shadow-md transition';
      var icona = document.createElement('span');
      icona.setAttribute('aria-hidden', 'true');
      icona.className = v.fissato ? 'text-amber-500 text-lg' : 'text-gray-400 text-lg';
      icona.textContent = v.fissato ? '★' : '↺';
      var nome = document.createElement('span');
      nome.className = 'font-semibold text-gray-900 text-sm';
      nome.textContent = v.titolo;
      a.appendChild(icona);
      a.appendChild(nome);
      elenco.appendChild(a);
    });
    sezione.hidden = false;
  }

  // ---------------------------------------------------------------- avvio

  function avvia() {
    avviaMenu();
    avviaRicerca(document.getElementById('search'), document.getElementById('risultati-menu'), 'risultato');
    var campoHome = document.getElementById('cerca-home');
    avviaEsempi(campoHome, avviaRicerca(campoHome, document.getElementById('risultati-home'), 'risultato-home'));
    avviaRevocaConsenso();
    avviaSpazio();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
