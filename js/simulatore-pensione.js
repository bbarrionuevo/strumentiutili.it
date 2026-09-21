// js/simulatore-pensione.js — Motore attuariale Pensione 2026 (Zero-Backend)
// Calcolo istantaneo: resta sul main thread, solo il caricamento delle regole è asincrono.
(function () {
  'use strict';

  // ==============================================================
  // UTILITÀ DATE (mese per mese, con gestione dei fine mese)
  // ==============================================================
  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addMonths(date, months) {
    const giorno = date.getDate();
    const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const giorniNelMese = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(giorno, giorniNelMese));
    return d;
  }

  // Inversa di addMonths: l'ultimo giorno del mese vale come mese compiuto
  // (es. nato il 29/02 compie gli anni il 28/02 negli anni non bisestili)
  function diffMesi(da, a) {
    let mesi = (a.getFullYear() - da.getFullYear()) * 12 + (a.getMonth() - da.getMonth());
    const ultimoGiorno = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
    if (a.getDate() < da.getDate() && a.getDate() < ultimoGiorno) mesi--;
    return mesi;
  }

  function etaCompiuta(nascita, data) {
    return Math.floor(diffMesi(nascita, data) / 12);
  }

  function maxDate(a, b) {
    return a > b ? a : b;
  }

  // ==============================================================
  // FISCO E ATTUARIA
  // ==============================================================
  function calcolaIrpef(redditoAnnuo, confIrpef) {
    const s = confIrpef.scaglioni;
    if (redditoAnnuo <= 0) return 0;
    if (redditoAnnuo <= s[0].limite) return redditoAnnuo * s[0].aliquota;
    if (redditoAnnuo <= s[1].limite) return s[1].base + (redditoAnnuo - s[0].limite) * s[1].aliquota;
    return s[2].base + (redditoAnnuo - s[1].limite) * s[2].aliquota;
  }

  function coefficientePerEta(eta, tabella) {
    const eta_disponibili = Object.keys(tabella).map(Number);
    const min = Math.min.apply(null, eta_disponibili);
    const max = Math.max.apply(null, eta_disponibili);
    const etaApplicata = Math.min(max, Math.max(min, eta));
    return { coefficiente: tabella[String(etaApplicata)], etaApplicata: etaApplicata, fuoriTabella: eta < min };
  }

  function calcolaImporto(montante, eta, regole) {
    const p = regole.pensioni;
    const coeff = coefficientePerEta(eta, p.coefficienti_trasformazione_25_26);
    const lordoAnnuo = montante * coeff.coefficiente;
    const irpefAnnua = calcolaIrpef(lordoAnnuo, regole.irpef);
    return {
      coefficiente: coeff.coefficiente,
      etaCoefficiente: coeff.etaApplicata,
      coefficienteFuoriTabella: coeff.fuoriTabella,
      lordoAnnuo: lordoAnnuo,
      lordoMensile: lordoAnnuo / p.mensilita_annue,
      irpefAnnua: irpefAnnua,
      nettoMensile: (lordoAnnuo - irpefAnnua) / p.mensilita_annue
    };
  }

  // ==============================================================
  // ALBERO DECISIONALE INPS 2026
  // Ipotesi: contribuzione continua da oggi fino alla decorrenza.
  // ==============================================================
  function calcolaProiezione(input, regole, oggiInput) {
    const p = regole.pensioni;
    const oggi = startOfDay(oggiInput || new Date());
    const nascita = startOfDay(input.dataNascita);
    const contributiOggi = input.anniContributi * 12 + input.mesiContributi;

    function contributiAlla(data) {
      return contributiOggi + Math.max(0, diffMesi(oggi, data));
    }

    function dataRaggiungimentoContributi(anni) {
      return addMonths(oggi, Math.max(0, anni * 12 - contributiOggi));
    }

    // --- PENSIONE ANTICIPATA ORDINARIA (indipendente dall'età) ---
    const soglia = input.sesso === 'donna' ? p.requisiti_anticipata.donne : p.requisiti_anticipata.uomini;
    const sogliaMesi = soglia.anni * 12 + soglia.mesi;
    const maturazioneAnticipata = addMonths(oggi, Math.max(0, sogliaMesi - contributiOggi));
    const decorrenzaAnticipata = addMonths(maturazioneAnticipata, p.requisiti_anticipata.finestra_mobile_mesi);
    const anticipata = {
      tipo: 'anticipata',
      maturazione: maturazioneAnticipata,
      decorrenza: decorrenzaAnticipata,
      eta: etaCompiuta(nascita, decorrenzaAnticipata),
      contributiMesi: contributiAlla(decorrenzaAnticipata)
    };
    anticipata.importo = calcolaImporto(input.montante, anticipata.eta, regole);

    // --- PENSIONE DI VECCHIAIA (67 anni + 20 di contributi + soglia importo) ---
    const rv = p.requisiti_vecchiaia;
    const dataVecchiaia = maxDate(
      maxDate(addMonths(nascita, rv.eta_anni * 12), dataRaggiungimentoContributi(rv.contributi_anni)),
      oggi
    );
    let vecchiaia = {
      tipo: 'vecchiaia',
      decorrenza: dataVecchiaia,
      eta: etaCompiuta(nascita, dataVecchiaia),
      contributiMesi: contributiAlla(dataVecchiaia),
      derogaImporto: false
    };
    vecchiaia.importo = calcolaImporto(input.montante, vecchiaia.eta, regole);

    // Soglia economica: sotto l'Assegno Sociale l'uscita slitta a 71 anni (5 anni di contributi)
    if (vecchiaia.importo.lordoMensile < rv.importo_minimo_mensile) {
      const deroga = rv.deroga_importo_insufficiente;
      const dataDeroga = maxDate(
        maxDate(addMonths(nascita, deroga.eta_anni * 12), dataRaggiungimentoContributi(deroga.contributi_anni)),
        oggi
      );
      const importoTentato = vecchiaia.importo.lordoMensile;
      vecchiaia = {
        tipo: 'vecchiaia',
        decorrenza: dataDeroga,
        eta: etaCompiuta(nascita, dataDeroga),
        contributiMesi: contributiAlla(dataDeroga),
        derogaImporto: true,
        importoSottoSoglia: importoTentato
      };
      vecchiaia.importo = calcolaImporto(input.montante, vecchiaia.eta, regole);
    }

    // Via consigliata: la prima decorrenza utile
    const scelta = anticipata.decorrenza < vecchiaia.decorrenza ? anticipata : vecchiaia;
    const alternativa = scelta === anticipata ? vecchiaia : anticipata;

    return {
      oggi: oggi,
      scelta: scelta,
      alternativa: alternativa,
      giaMaturata: scelta.decorrenza <= oggi,
      sogliaAnticipataMesi: sogliaMesi,
      assegnoSociale: rv.importo_minimo_mensile
    };
  }

  // Esportazione per test in Node
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calcolaProiezione, calcolaIrpef, addMonths, diffMesi, etaCompiuta };
  }
  if (typeof document === 'undefined') return;

  // ==============================================================
  // LIVELLO UI
  // ==============================================================
  const fmtEuro = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
  const fmtData = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtAnniMesi = (mesi) => {
    const a = Math.floor(mesi / 12), m = mesi % 12;
    return a + (a === 1 ? ' anno' : ' anni') + (m > 0 ? ' e ' + m + (m === 1 ? ' mese' : ' mesi') : '');
  };
  const fmtPercentuale = (c) => (c * 100).toFixed(3).replace('.', ',') + '%';

  const TONI = {
    rosso: 'bg-red-50 text-red-800 border-red-200',
    arancione: 'bg-orange-50 text-orange-800 border-orange-200',
    verde: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    blu: 'bg-blue-50 text-blue-800 border-blue-200'
  };
  const alertBox = (tono, html) => '<div class="p-4 text-sm font-medium rounded-lg border ' + TONI[tono] + '">' + html + '</div>';

  let regole = null;
  let el = {};

  function cacheDom() {
    [
      'pens-data-nascita', 'pens-sesso', 'pens-anni-contributi', 'pens-mesi-contributi', 'pens-montante',
      'btn-calcola-pensione', 'res-via-accesso', 'res-via-dettaglio', 'alerts-container',
      'res-data-pensione', 'res-eta-pensione', 'res-lordo-mensile', 'res-netto-mensile',
      'res-contributi-finali', 'res-coefficiente', 'res-lordo-annuo', 'res-irpef-annua'
    ].forEach(id => { el[id] = document.getElementById(id); });
  }

  function leggiInput() {
    const valoreData = el['pens-data-nascita'].value;
    return {
      dataNascita: valoreData ? new Date(valoreData + 'T00:00:00') : null,
      sesso: el['pens-sesso'].value === 'donna' ? 'donna' : 'uomo',
      anniContributi: Math.max(0, Math.floor(parseFloat(el['pens-anni-contributi'].value) || 0)),
      mesiContributi: Math.min(11, Math.max(0, Math.floor(parseFloat(el['pens-mesi-contributi'].value) || 0))),
      montante: Math.max(0, parseFloat(el['pens-montante'].value) || 0)
    };
  }

  function mostraMessaggio(titolo, dettaglio) {
    el['res-via-accesso'].textContent = titolo;
    el['res-via-dettaglio'].textContent = dettaglio;
    el['alerts-container'].innerHTML = '';
    ['res-data-pensione', 'res-lordo-mensile', 'res-netto-mensile', 'res-contributi-finali',
      'res-coefficiente', 'res-lordo-annuo', 'res-irpef-annua'].forEach(id => { el[id].textContent = '--'; });
    el['res-eta-pensione'].innerHTML = '&nbsp;';
  }

  function validaInput(input) {
    if (!input.dataNascita || isNaN(input.dataNascita.getTime())) {
      return 'Inserisci la tua data di nascita per avviare la simulazione.';
    }
    const oggi = startOfDay(new Date());
    const eta = etaCompiuta(input.dataNascita, oggi);
    if (input.dataNascita > oggi || eta > 100) return 'La data di nascita inserita non è valida.';
    if (eta < 15) return 'La simulazione richiede un\'età di almeno 15 anni.';
    if (input.montante <= 0) return 'Inserisci il montante contributivo stimato alla pensione.';
    return null;
  }

  function render(input, r) {
    const s = r.scelta;
    const imp = s.importo;

    el['res-via-accesso'].textContent = s.tipo === 'anticipata'
      ? 'Pensione Anticipata Ordinaria'
      : (s.derogaImporto ? 'Pensione di Vecchiaia a 71 anni' : 'Pensione di Vecchiaia');

    el['res-via-dettaglio'].textContent = r.giaMaturata
      ? 'Hai già maturato i requisiti per questa via di uscita: puoi presentare domanda all\'INPS.'
      : (s.tipo === 'anticipata'
        ? 'Raggiungerai la soglia contributiva di ' + fmtAnniMesi(r.sogliaAnticipataMesi) + ' il ' + fmtData(s.maturazione) + '; la prima rata decorre dopo la finestra mobile.'
        : 'È la prima via di uscita utile in base alla tua età e ai contributi, assumendo che tu continui a versare senza interruzioni.');

    el['res-data-pensione'].textContent = r.giaMaturata ? 'Già maturata' : fmtData(s.decorrenza);
    el['res-eta-pensione'].textContent = 'a ' + s.eta + ' anni di età';
    el['res-lordo-mensile'].textContent = fmtEuro(imp.lordoMensile);
    el['res-netto-mensile'].textContent = fmtEuro(imp.nettoMensile);
    el['res-contributi-finali'].textContent = fmtAnniMesi(s.contributiMesi);
    el['res-coefficiente'].textContent = fmtPercentuale(imp.coefficiente) + ' (' + imp.etaCoefficiente + ' anni)';
    el['res-lordo-annuo'].textContent = fmtEuro(imp.lordoAnnuo);
    el['res-irpef-annua'].textContent = '- ' + fmtEuro(imp.irpefAnnua);

    const alerts = [];

    if (s.derogaImporto) {
      alerts.push(alertBox('arancione', '⚠️ <b>Soglia minima non raggiunta:</b> a 67 anni la tua pensione sarebbe di ' + fmtEuro(s.importoSottoSoglia) + ' lordi al mese, sotto l\'Assegno Sociale (' + fmtEuro(r.assegnoSociale) + '). Per i contributivi puri l\'uscita di vecchiaia slitta quindi a 71 anni.'));
    }

    if (s.tipo === 'anticipata') {
      alerts.push(alertBox('blu', '⏱️ <b>Finestra mobile:</b> tra la maturazione del requisito e la prima rata passano 3 mesi. Se smetti di lavorare subito, resterai senza reddito per quel periodo.'));
    }

    if (imp.coefficienteFuoriTabella) {
      alerts.push(alertBox('arancione', '📉 <b>Età di uscita sotto i 57 anni:</b> i coefficienti ministeriali partono da 57 anni, quindi è stato applicato il valore minimo. L\'importo reale sarebbe inferiore a quello stimato.'));
    }

    // Confronto intelligente: posticipare a 71 anni (massimo coefficiente INPS)
    if (s.eta < 71) {
      // Il coefficiente massimo si raggiunge a 71 anni (6,510%)
      const coeff71 = 0.06510;
      // Calcolo stimato su 13 mensilità
      const lordoMensile71 = (input.montante * coeff71) / 13; 
      
      alerts.push(alertBox('verde', '💡 <b>Aspettare conviene?</b> Se decidi di posticipare l\'uscita a 71 anni, il coefficiente di trasformazione raggiunge il suo massimo (6,510%) e il tuo assegno lordo diventerebbe ' + fmtEuro(lordoMensile71) + ' al mese.'));
    }

    alerts.push(alertBox('blu', '🔗 Vuoi sapere quanto vale oggi la tua liquidazione? Usa il <a href="/lavoro-contratti/calcolo-tfr/" class="underline font-semibold">Calcolatore TFR</a> o verifica le <a href="/cittadino-tasse/aliquote-irpef/" class="underline font-semibold">Aliquote IRPEF 2026</a>.'));

    el['alerts-container'].innerHTML = alerts.join('');
  }

  function aggiorna() {
    if (!regole) return;
    const input = leggiInput();
    const errore = validaInput(input);
    if (errore) {
      mostraMessaggio('Dati incompleti', errore);
      return;
    }
    render(input, calcolaProiezione(input, regole));
  }

  async function init() {
    cacheDom();
    if (!el['btn-calcola-pensione']) return;

    try {
      regole = await window.StrumentiData.getRegoleFiscali();
    } catch (err) {
      console.error('[Pensione] Errore caricamento regole:', err);
      regole = null;
    }

    if (!regole || !regole.pensioni || !regole.irpef) {
      mostraMessaggio('Parametri non disponibili', 'Impossibile caricare i requisiti INPS 2026. Verifica la connessione e ricarica la pagina.');
      el['btn-calcola-pensione'].disabled = true;
      return;
    }

    // Esempio dinamico nella guida del campo montante (vedi js/guida-campi.js)
    window.SuGuidaLive = window.SuGuidaLive || {};
    window.SuGuidaLive['guida-pens-montante'] = (campo) => {
      const montante = parseFloat(campo.value);
      if (!(montante > 0)) return '';
      const coeff67 = regole.pensioni.coefficienti_trasformazione_25_26['67'];
      return 'Con ' + fmtEuro(montante) + ' a 67 anni: circa ' + fmtEuro(montante * coeff67 / regole.pensioni.mensilita_annue) + ' lordi al mese (coefficiente ' + fmtPercentuale(coeff67) + ').';
    };

    el['btn-calcola-pensione'].addEventListener('click', (e) => {
      e.preventDefault();
      aggiorna();
    });

    // Ricalcolo reattivo mentre l'utente modifica i campi
    let timer = null;
    ['pens-data-nascita', 'pens-sesso', 'pens-anni-contributi', 'pens-mesi-contributi', 'pens-montante'].forEach(id => {
      el[id].addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(aggiorna, 250);
      });
    });

    // storage-helper.js ha già ripristinato i valori salvati: calcolo immediato
    if (el['pens-data-nascita'].value) aggiorna();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
