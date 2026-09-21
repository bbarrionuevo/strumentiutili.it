// js/budget-planner.js — Budget Planner Intelligente 50/30/20 (Zero-Backend)
(function () {
  'use strict';

  const OBIETTIVI = { necessita_50: 50, desideri_30: 30, risparmiEInvestimenti_20: 20 };

  // Riferimenti prudenziali (% del reddito netto) per individuare le voci di necessità fuori scala
  const RIFERIMENTI_NECESSITA = {
    abitazione: { soglia: 30, nome: 'Abitazione', azione: 'rinegoziare o surrogare il mutuo', link: { href: '/fisco-professioni/calcolo-rata-mutuo/', testo: 'Simula una nuova rata del mutuo' } },
    utenzeDomestiche: { soglia: 6, nome: 'Utenze domestiche', azione: 'ottimizzare le utenze luce/gas', link: { href: '/cittadino-tasse/analizzatore-bolletta/', testo: 'Verifica se la tua bolletta è cara' } },
    alimentazione: { soglia: 15, nome: 'Alimentazione e salute', azione: 'pianificare la spesa settimanale e confrontare i punti vendita', link: null },
    mobilita: { soglia: 10, nome: 'Mobilità', azione: 'ridurre i costi di trasporto confrontando RC Auto e abbonamenti ai mezzi pubblici', link: { href: '/cittadino-tasse/calcolo-bollo-auto/', testo: 'Controlla l\'importo del bollo auto' } }
  };

  const CONSIGLI_DESIDERI = {
    ristorazione: 'Ristoranti e food delivery sono la voce più alta: fissare un tetto settimanale e cucinare in anticipo riduce la spesa senza rinunce drastiche.',
    intrattenimento: 'Streaming e abbonamenti sportivi sono la voce più alta: verifica i servizi che usi davvero e disdici quelli duplicati.',
    beniVoluttuari: 'Gli acquisti non essenziali sono la voce più alta: applica la regola delle 72 ore prima di ogni acquisto superiore a 50 €.'
  };

  const TOLLERANZA_DEFICIT = 0.005;

  function scheletro() {
    return {
      redditoNettoDisponibile: 0,
      uscite: {
        necessita_50: {
          abitazione: { mutuoOAffitto: 0, speseCondominiali: 0, manutenzioneStraordinaria: 0, tributiLocali: { IMU: 0, TARI: 0 } },
          utenzeDomestiche: { energiaElettrica: 0, gasMetano: 0, servizioIdrico: 0, fibraOttica: 0 },
          alimentazione: { spesaGdo: 0, farmaciaESalute: 0 },
          mobilita: { carburante: 0, assicurazioneRCA: 0, bolloAuto: 0, abbonamentoTPL: 0 }
        },
        desideri_30: {
          ristorazione: { ristorantiPub: 0, foodDelivery: 0 },
          intrattenimento: { piattaformeStreaming: 0, sportEBenessere: 0 },
          beniVoluttuari: { abbigliamento: 0, tecnologiaDiConsumo: 0 }
        },
        risparmiEInvestimenti_20: {
          accantonamenti: { fondoEmergenza: 0, pianoAccumuloCapitale: 0, fondoPensioneIntegrativo: 0 },
          servizioDebito: { prestitoPersonale: 0, carteRevolving: 0 }
        }
      }
    };
  }

  // ==============================================================
  // PARSING E ARITMETICA
  // ==============================================================
  // Accetta "1.234,56", "1234.56", "85,5", "1.200". Ritorna null se non valido.
  function parseImporto(raw) {
    let s = String(raw == null ? '' : raw).replace(/[€\s]/g, '');
    if (!s) return 0;
    if (!/^[\d.,]+$/.test(s)) return null;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function arrotonda2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function sommaRicorsiva(nodo) {
    if (typeof nodo === 'number') return nodo;
    return Object.values(nodo).reduce((acc, figlio) => acc + sommaRicorsiva(figlio), 0);
  }

  function impostaPercorso(obj, percorso, valore) {
    const parti = percorso.split('.');
    let nodo = obj;
    for (let i = 0; i < parti.length - 1; i++) {
      if (!(parti[i] in nodo)) return false;
      nodo = nodo[parti[i]];
    }
    if (!(parti[parti.length - 1] in nodo)) return false;
    nodo[parti[parti.length - 1]] = valore;
    return true;
  }

  const euro = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  const perc = (n) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + '%';

  function statoNecessita(r) { return r <= 50 ? 'verde' : (r <= 60 ? 'giallo' : 'rosso'); }
  function statoDesideri(r) { return r <= 30 ? 'verde' : (r <= 40 ? 'giallo' : 'rosso'); }
  function statoRisparmi(r) { return r >= 20 ? 'verde' : (r >= 10 ? 'giallo' : 'rosso'); }

  // ==============================================================
  // MOTORE DIAGNOSTICO
  // ==============================================================
  function analizza(budgetMensile) {
    const reddito = budgetMensile.redditoNettoDisponibile;
    const u = budgetMensile.uscite;
    const totali = {
      necessita_50: sommaRicorsiva(u.necessita_50),
      desideri_30: sommaRicorsiva(u.desideri_30),
      risparmiEInvestimenti_20: sommaRicorsiva(u.risparmiEInvestimenti_20)
    };
    const totaleUscite = totali.necessita_50 + totali.desideri_30 + totali.risparmiEInvestimenti_20;
    const saldo = reddito - totaleUscite;
    const ratio = (k) => (reddito > 0 ? arrotonda2(totali[k] / reddito * 100) : 0);

    const diagnostica = {
      ratioNecessita: ratio('necessita_50'),
      ratioDesideri: ratio('desideri_30'),
      ratioRisparmi: ratio('risparmiEInvestimenti_20'),
      warningCode: 'OK_BALANCED',
      suggestedAction: ''
    };
    const semafori = {
      necessita: statoNecessita(diagnostica.ratioNecessita),
      desideri: statoDesideri(diagnostica.ratioDesideri),
      risparmi: statoRisparmi(diagnostica.ratioRisparmi)
    };
    const alerts = [];

    if (reddito <= 0) {
      diagnostica.warningCode = totaleUscite > 0 ? 'ERR_NO_INCOME' : 'EMPTY';
      diagnostica.suggestedAction = 'Inserisci il reddito netto mensile per calcolare la ripartizione 50/30/20.';
      alerts.push({ tono: 'blu', html: '💡 ' + diagnostica.suggestedAction });
      return { diagnostica, semafori, totali, totaleUscite, saldo, alerts, reddito };
    }

    const inDeficit = -saldo > reddito * TOLLERANZA_DEFICIT;
    const necessitaFuori = diagnostica.ratioNecessita > OBIETTIVI.necessita_50;
    const desideriFuori = diagnostica.ratioDesideri > OBIETTIVI.desideri_30;
    const risparmiSotto = diagnostica.ratioRisparmi < OBIETTIVI.risparmiEInvestimenti_20;

    // 1. Deficit
    if (inDeficit) {
      alerts.push({
        tono: 'rosso',
        html: '🚨 <b>Bilancio in deficit:</b> le uscite (' + euro(totaleUscite) + ') superano il reddito netto (' + euro(reddito) + ') di <b>' + euro(-saldo) + '</b> al mese. La differenza sta erodendo i risparmi o generando nuovo debito.'
      });
    }

    // 2. Necessità: voci oltre i riferimenti, ordinate per eccesso
    let azioniNecessita = [];
    if (necessitaFuori) {
      const eccessi = Object.keys(RIFERIMENTI_NECESSITA)
        .map(k => ({ chiave: k, rif: RIFERIMENTI_NECESSITA[k], quota: sommaRicorsiva(u.necessita_50[k]) / reddito * 100 }))
        .filter(v => v.quota > v.rif.soglia)
        .sort((a, b) => (b.quota - b.rif.soglia) - (a.quota - a.rif.soglia));

      azioniNecessita = eccessi.map(v => v.rif.azione);
      const azioneTesto = azioniNecessita.length
        ? ' Valutare di ' + azioniNecessita.join(' o ') + '.'
        : ' Rivedere le voci fisse più elevate.';
      const suggerimento = 'L\'incidenza delle spese fisse (' + perc(diagnostica.ratioNecessita) + ') supera la soglia di sicurezza del 50%.' + azioneTesto;

      let dettaglio = '';
      if (eccessi.length) {
        dettaglio = '<ul>' + eccessi.map(v =>
          '<li><b>' + v.rif.nome + ':</b> ' + perc(v.quota) + ' del reddito (riferimento ' + v.rif.soglia + '%)' +
          (v.rif.link ? ' — <a href="' + v.rif.link.href + '">' + v.rif.link.testo + '</a>' : '') + '</li>'
        ).join('') + '</ul>';
      }
      alerts.push({ tono: semafori.necessita === 'rosso' ? 'rosso' : 'giallo', html: '🏠 <b>Necessità oltre il 50%.</b> ' + suggerimento + dettaglio });
      diagnostica.suggestedAction = suggerimento;
    }

    // 3. Desideri: consiglio sulla sottocategoria più pesante
    if (desideriFuori) {
      const principale = Object.keys(u.desideri_30)
        .map(k => ({ chiave: k, totale: sommaRicorsiva(u.desideri_30[k]) }))
        .sort((a, b) => b.totale - a.totale)[0];
      const suggerimento = 'I desideri assorbono il ' + perc(diagnostica.ratioDesideri) + ' del reddito, oltre l\'obiettivo del 30%. ' + CONSIGLI_DESIDERI[principale.chiave];
      alerts.push({ tono: semafori.desideri === 'rosso' ? 'rosso' : 'giallo', html: '🎭 <b>Desideri oltre il 30%.</b> ' + suggerimento });
      if (!diagnostica.suggestedAction) diagnostica.suggestedAction = suggerimento;
    }

    // 4. Risparmi e debiti
    const debito = u.risparmiEInvestimenti_20.servizioDebito;
    const accantonamenti = u.risparmiEInvestimenti_20.accantonamenti;
    if (risparmiSotto) {
      let consiglio;
      if (debito.carteRevolving > 0) {
        consiglio = 'Hai rate su carte revolving, tra le forme di credito più costose: estinguerle è il risparmio con il rendimento più alto.';
      } else if (accantonamenti.fondoEmergenza <= 0) {
        consiglio = 'Inizia da un fondo di emergenza pari a 3-6 mesi di spese essenziali (tra ' + euro(totali.necessita_50 * 3) + ' e ' + euro(totali.necessita_50 * 6) + ').';
      } else {
        consiglio = 'Aumenta gradualmente il piano di accumulo: anche piccole cifre costanti crescono nel tempo. <a href="/utilita-web/interessi-composti/">Calcola l\'effetto degli interessi composti</a>.';
      }
      const suggerimento = 'Risparmi e rimborsi sono al ' + perc(diagnostica.ratioRisparmi) + ', sotto l\'obiettivo del 20%.';
      alerts.push({ tono: semafori.risparmi === 'rosso' ? 'rosso' : 'giallo', html: '🌱 <b>Risparmio sotto il 20%.</b> ' + suggerimento + ' ' + consiglio });
      if (!diagnostica.suggestedAction) diagnostica.suggestedAction = suggerimento;
    } else if (accantonamenti.fondoEmergenza <= 0 && totaleUscite > 0) {
      alerts.push({ tono: 'blu', html: '💡 Stai rispettando il 20%, ma non accantoni nulla nel fondo di emergenza: una spesa imprevista potrebbe costringerti a usare il credito.' });
    }

    // 5. Reddito non allocato
    if (saldo > 0 && totaleUscite > 0) {
      const potenziale = (totali.risparmiEInvestimenti_20 + saldo) / reddito * 100;
      alerts.push({
        tono: 'blu',
        html: '💶 Hai <b>' + euro(saldo) + '</b> non assegnati ogni mese.' + (risparmiSotto ? ' Destinandoli al risparmio arriveresti al <b>' + perc(potenziale) + '</b>.' : ' Assegnali a un obiettivo preciso per evitare che si disperdano.')
      });
    }

    if (inDeficit) diagnostica.warningCode = 'ERR_DEFICIT';
    else if (necessitaFuori) diagnostica.warningCode = 'ERR_NEEDS_OVER_BUDGET';
    else if (desideriFuori) diagnostica.warningCode = 'ERR_WANTS_OVER_BUDGET';
    else if (risparmiSotto) diagnostica.warningCode = 'ERR_SAVINGS_UNDER_TARGET';

    if (inDeficit) diagnostica.suggestedAction = 'Le uscite superano il reddito di ' + euro(-saldo) + ' al mese. ' + diagnostica.suggestedAction;

    if (diagnostica.warningCode === 'OK_BALANCED' && totaleUscite > 0) {
      diagnostica.suggestedAction = 'Il bilancio rispetta la regola 50/30/20.';
      alerts.unshift({ tono: 'verde', html: '✅ <b>Bilancio in equilibrio.</b> Necessità, desideri e risparmi rispettano la regola 50/30/20.' });
    }

    return { diagnostica, semafori, totali, totaleUscite, saldo, alerts, reddito };
  }

  function costruisciStato(valoriPerPercorso) {
    const budgetMensile = scheletro();
    Object.keys(valoriPerPercorso).forEach(p => impostaPercorso(budgetMensile, p, valoriPerPercorso[p]));
    const analisi = analizza(budgetMensile);
    return { stato: { budgetMensile: budgetMensile, diagnosticaAnalytics: analisi.diagnostica }, analisi: analisi };
  }

  // Esempio dal documento di specifica
  const ESEMPIO = {
    'redditoNettoDisponibile': 3200,
    'uscite.necessita_50.abitazione.mutuoOAffitto': 950, 'uscite.necessita_50.abitazione.speseCondominiali': 120,
    'uscite.necessita_50.abitazione.manutenzioneStraordinaria': 50, 'uscite.necessita_50.abitazione.tributiLocali.IMU': 0,
    'uscite.necessita_50.abitazione.tributiLocali.TARI': 25, 'uscite.necessita_50.utenzeDomestiche.energiaElettrica': 85,
    'uscite.necessita_50.utenzeDomestiche.gasMetano': 70, 'uscite.necessita_50.utenzeDomestiche.servizioIdrico': 30,
    'uscite.necessita_50.utenzeDomestiche.fibraOttica': 29.9, 'uscite.necessita_50.alimentazione.spesaGdo': 400,
    'uscite.necessita_50.alimentazione.farmaciaESalute': 60, 'uscite.necessita_50.mobilita.carburante': 140,
    'uscite.necessita_50.mobilita.assicurazioneRCA': 55, 'uscite.necessita_50.mobilita.bolloAuto': 22,
    'uscite.necessita_50.mobilita.abbonamentoTPL': 39, 'uscite.desideri_30.ristorazione.ristorantiPub': 200,
    'uscite.desideri_30.ristorazione.foodDelivery': 80, 'uscite.desideri_30.intrattenimento.piattaformeStreaming': 45,
    'uscite.desideri_30.intrattenimento.sportEBenessere': 60, 'uscite.desideri_30.beniVoluttuari.abbigliamento': 150,
    'uscite.desideri_30.beniVoluttuari.tecnologiaDiConsumo': 100, 'uscite.risparmiEInvestimenti_20.accantonamenti.fondoEmergenza': 200,
    'uscite.risparmiEInvestimenti_20.accantonamenti.pianoAccumuloCapitale': 150, 'uscite.risparmiEInvestimenti_20.accantonamenti.fondoPensioneIntegrativo': 50,
    'uscite.risparmiEInvestimenti_20.servizioDebito.prestitoPersonale': 90, 'uscite.risparmiEInvestimenti_20.servizioDebito.carteRevolving': 0
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseImporto, sommaRicorsiva, costruisciStato, analizza, scheletro, ESEMPIO };
  }
  if (typeof document === 'undefined') return;

  // ==============================================================
  // UI
  // ==============================================================
  const COLORI_SEMAFORO = { verde: '#10b981', giallo: '#f59e0b', rosso: '#ef4444', neutro: '#d1d5db' };
  const COLORI_GRAFICO = ['#4f46e5', '#f59e0b', '#10b981', '#e5e7eb'];

  let inputs = [];
  let grafico = null;
  let ultimoStato = null;
  let timer = null;

  function $(id) { return document.getElementById(id); }

  function leggiValori() {
    const valori = {};
    inputs.forEach(input => {
      const n = parseImporto(input.value);
      const valido = n !== null;
      input.classList.toggle('bp-input-errore', !valido);
      input.setAttribute('aria-invalid', valido ? 'false' : 'true');
      valori[input.dataset.bpPath] = valido ? n : 0;
    });
    return valori;
  }

  function aggiornaSemaforo(chiave, ratio, stato, totale, attivo) {
    $('bp-ratio-' + chiave).textContent = attivo ? perc(ratio) : '--';
    $('bp-semaforo-' + chiave).style.backgroundColor = attivo ? COLORI_SEMAFORO[stato] : COLORI_SEMAFORO.neutro;
    $('bp-barra-' + chiave).style.width = (attivo ? Math.min(ratio, 100) : 0) + '%';
    $('bp-euro-' + chiave).textContent = euro(totale);
  }

  function aggiornaGrafico(a) {
    const valoreCentro = $('bp-centro-valore');
    const etichettaCentro = $('bp-centro-etichetta');
    const dati = [a.totali.necessita_50, a.totali.desideri_30, a.totali.risparmiEInvestimenti_20, Math.max(0, a.saldo)];
    const vuoto = dati.every(v => v === 0);

    if (a.reddito > 0) {
      const allocato = a.totaleUscite / a.reddito * 100;
      valoreCentro.textContent = Math.round(allocato) + '%';
      valoreCentro.style.color = allocato > 100 + TOLLERANZA_DEFICIT * 100 ? COLORI_SEMAFORO.rosso : '#111827';
      etichettaCentro.textContent = 'del reddito allocato';
    } else {
      valoreCentro.textContent = '--';
      valoreCentro.style.color = '#111827';
      etichettaCentro.textContent = 'inserisci il reddito';
    }

    if (typeof window.Chart === 'undefined') {
      $('bp-grafico').classList.add('hidden');
      $('bp-grafico-fallback').classList.remove('hidden');
      return;
    }

    const datiGrafico = vuoto ? [1, 0, 0, 0] : dati;
    const colori = vuoto ? ['#f3f4f6', '#f3f4f6', '#f3f4f6', '#f3f4f6'] : COLORI_GRAFICO;

    if (!grafico) {
      const riduciMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      grafico = new window.Chart($('bp-grafico'), {
        type: 'doughnut',
        data: {
          labels: ['Necessità', 'Desideri', 'Risparmi e debiti', 'Non allocato'],
          datasets: [{ data: datiGrafico, backgroundColor: colori, borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 }]
        },
        options: {
          cutout: '68%',
          maintainAspectRatio: false,
          animation: { duration: riduciMovimento ? 0 : 600, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  if (!ultimoStato || ultimoStato.analisi.totaleUscite === 0) return '';
                  const r = ultimoStato.analisi.reddito;
                  return ' ' + euro(ctx.raw) + (r > 0 ? ' (' + perc(ctx.raw / r * 100) + ')' : '');
                }
              }
            }
          }
        }
      });
    } else {
      grafico.data.datasets[0].data = datiGrafico;
      grafico.data.datasets[0].backgroundColor = colori;
      grafico.update();
    }
  }

  function render() {
    const valori = leggiValori();
    ultimoStato = costruisciStato(valori);
    const a = ultimoStato.analisi;
    const d = a.diagnostica;
    const attivo = a.reddito > 0;

    aggiornaSemaforo('necessita', d.ratioNecessita, a.semafori.necessita, a.totali.necessita_50, attivo);
    aggiornaSemaforo('desideri', d.ratioDesideri, a.semafori.desideri, a.totali.desideri_30, attivo);
    aggiornaSemaforo('risparmi', d.ratioRisparmi, a.semafori.risparmi, a.totali.risparmiEInvestimenti_20, attivo);

    Object.keys(a.totali).forEach(k => { $('bp-sub-' + k).textContent = euro(a.totali[k]); });

    const saldoEl = $('bp-saldo');
    saldoEl.textContent = attivo ? euro(a.saldo) : '--';
    saldoEl.style.color = attivo && a.saldo < 0 ? COLORI_SEMAFORO.rosso : '#111827';

    $('bp-alerts').innerHTML = a.alerts.map(al => '<div class="bp-alert bp-tono-' + al.tono + '">' + al.html + '</div>').join('');
    aggiornaGrafico(a);
  }

  function pianifica() {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  }

  function formattaPerInput(n) {
    return n === 0 ? '' : new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(n);
  }

  // Scrive i valori e notifica storage-helper.js tramite l'evento input
  function impostaValori(mappa) {
    inputs.forEach(input => {
      const v = mappa ? mappa[input.dataset.bpPath] : undefined;
      input.value = typeof v === 'number' ? formattaPerInput(v) : '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    render();
  }

  function haDati() {
    return inputs.some(i => i.value.trim() !== '');
  }

  function init() {
    const workspace = $('bp-workspace');
    if (!workspace) return;
    inputs = Array.from(workspace.querySelectorAll('input[data-bp-path]'));

    workspace.addEventListener('input', (e) => {
      if (e.target.matches('input[data-bp-path]')) pianifica();
    });

    $('bp-esempio').addEventListener('click', () => {
      if (haDati() && !window.confirm('Sostituire i dati attuali con il bilancio di esempio?')) return;
      impostaValori(ESEMPIO);
    });

    $('bp-azzera').addEventListener('click', () => {
      if (!window.confirm('Azzerare tutti gli importi salvati su questo dispositivo?')) return;
      impostaValori(null);
    });

    window.BudgetPlanner = { getStato: () => (ultimoStato ? JSON.parse(JSON.stringify(ultimoStato.stato)) : null) };

    // storage-helper.js ha già ripristinato gli importi salvati
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
