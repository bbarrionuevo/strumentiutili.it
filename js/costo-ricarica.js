// js/costo-ricarica.js — Costo di una ricarica di un'auto elettrica
//
// I prezzi proposti sono valori indicativi presi dal file centralizzato delle regole, con fonte
// e data: restano sempre modificabili, perché le tariffe di ricarica cambiano per operatore,
// potenza, abbonamento e promozione. Il calcolo avviene interamente nel browser.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // Valori di ripiego usati se il file delle regole non è disponibile
  const PREZZI_PREDEFINITI = { casa: 0.22, ac: 0.63, dc: 0.74, hpc: 0.85 };
  const PERDITE_PREDEFINITE = 10;

  const DESCRIZIONI = {
    casa: 'ricarica domestica',
    ac: 'colonnina in corrente alternata',
    dc: 'colonnina rapida in corrente continua',
    hpc: 'colonnina ultrarapida'
  };

  document.addEventListener('DOMContentLoaded', () => {
    const campoBatteria = $('batteria');
    if (!campoBatteria) return;

    const campoIniziale = $('soc-iniziale');
    const campoFinale = $('soc-finale');
    const campoPrezzo = $('prezzo-kwh');
    const campoPerdite = $('perdite');
    const campoPotenza = $('potenza');
    const campoConsumo = $('consumo-100');
    const selTipo = $('tipo-ricarica');
    const errore = $('errore');
    const notaPrezzo = $('nota-prezzo');

    let tariffe = null;
    let prezzoModificatoDallUtente = false;

    campoPerdite.value = String(PERDITE_PREDEFINITE);

    function prezzoIndicativo(tipo) {
      if (tariffe) {
        const mappa = { casa: tariffe.casa_kwh, ac: tariffe.ac_kwh, dc: tariffe.dc_kwh, hpc: tariffe.hpc_kwh };
        if (Number.isFinite(mappa[tipo])) return mappa[tipo];
      }
      return PREZZI_PREDEFINITI[tipo];
    }

    function applicaPrezzoIndicativo() {
      const tipo = selTipo.value;
      campoPrezzo.value = window.SuNumeri.numero(prezzoIndicativo(tipo), 2);
      notaPrezzo.textContent = tariffe
        ? `Valore indicativo per ${DESCRIZIONI[tipo]}. ${tariffe.nota} Fonte: ${tariffe.fonte}.`
        : `Valore indicativo per ${DESCRIZIONI[tipo]}: sostituiscilo con la tariffa del tuo contratto o dell'operatore.`;
      calcola();
    }

    if (window.StrumentiData && window.StrumentiData.getRegoleFiscali) {
      window.StrumentiData.getRegoleFiscali().then((regole) => {
        if (regole && regole.consumi_energia_2026) {
          tariffe = regole.consumi_energia_2026.ricarica_veicoli;
          const perditeDati = tariffe && tariffe.perdite_predefinite_pct;
          if (Number.isFinite(perditeDati) && !campoPerdite.dataset.tocco) campoPerdite.value = String(perditeDati);
          if (!prezzoModificatoDallUtente) applicaPrezzoIndicativo();
        }
      }).catch(() => { /* si resta sui valori predefiniti, comunque modificabili */ });
    }

    function valore(campo, opzioni) {
      const grezzo = campo.value.trim();
      if (!grezzo) return { vuoto: true, valore: null };
      return { vuoto: false, valore: window.SuNumeri.parseValido(grezzo, opzioni) };
    }

    function azzera(messaggio) {
      errore.textContent = messaggio || '';
      ['res-batteria', 'res-rete', 'res-costo', 'res-tempo', 'res-effettivo', 'res-100km'].forEach((id) => { $(id).textContent = '—'; });
      $('res-tempo-nota').textContent = '';
      $('res-100km-nota').textContent = '';
      $('formula').textContent = '';
    }

    function calcola() {
      const batteria = valore(campoBatteria, { positivo: true, max: 1000 });
      const iniziale = valore(campoIniziale, { min: 0, max: 100 });
      const finale = valore(campoFinale, { min: 0, max: 100 });
      const prezzo = valore(campoPrezzo, { positivo: true, max: 10 });
      const perdite = valore(campoPerdite, { min: 0, max: 90 });
      const potenza = valore(campoPotenza, { positivo: true, max: 1000 });
      const consumo = valore(campoConsumo, { positivo: true, max: 200 });

      if (!batteria.vuoto && batteria.valore === null) return azzera('La capacità della batteria deve essere un numero maggiore di zero.');
      if (!iniziale.vuoto && iniziale.valore === null) return azzera('La carica iniziale deve essere compresa fra 0 e 100.');
      if (!finale.vuoto && finale.valore === null) return azzera('La carica finale deve essere compresa fra 0 e 100.');
      if (!prezzo.vuoto && prezzo.valore === null) return azzera('Il prezzo dell\'energia deve essere un numero maggiore di zero.');
      if (!perdite.vuoto && perdite.valore === null) return azzera('Le perdite devono essere comprese fra 0 e 90%.');
      if (!potenza.vuoto && potenza.valore === null) return azzera('La potenza di ricarica deve essere un numero maggiore di zero.');
      if (!consumo.vuoto && consumo.valore === null) return azzera('Il consumo deve essere un numero maggiore di zero.');

      if (!iniziale.vuoto && !finale.vuoto && finale.valore <= iniziale.valore) {
        return azzera('La carica finale deve essere maggiore di quella iniziale.');
      }

      errore.textContent = '';

      const perditeFrazione = (perdite.vuoto ? PERDITE_PREDEFINITE : perdite.valore) / 100;
      const rendimento = 1 - perditeFrazione;

      // Costo per 100 km: dipende solo da consumo, perdite e prezzo, quindi si calcola anche
      // senza i dati della singola ricarica
      if (!consumo.vuoto && !prezzo.vuoto && rendimento > 0) {
        const energiaRete100 = consumo.valore / rendimento;
        const costo100 = energiaRete100 * prezzo.valore;
        $('res-100km').textContent = window.SuNumeri.euro(costo100);
        $('res-100km-nota').textContent = `${window.SuNumeri.numero(consumo.valore, 1)} kWh/100 km ÷ ${window.SuNumeri.numero(rendimento, 2)} = ${window.SuNumeri.kwh(energiaRete100, 1)} dalla rete × ${window.SuNumeri.numero(prezzo.valore, 2)} €/kWh`;
      } else {
        $('res-100km').textContent = '—';
        $('res-100km-nota').textContent = '';
      }

      if (batteria.vuoto || iniziale.vuoto || finale.vuoto) {
        ['res-batteria', 'res-rete', 'res-costo', 'res-tempo', 'res-effettivo'].forEach((id) => { $(id).textContent = '—'; });
        $('res-tempo-nota').textContent = '';
        $('formula').textContent = '';
        return;
      }

      const energiaBatteria = batteria.valore * (finale.valore - iniziale.valore) / 100;
      const energiaRete = energiaBatteria / rendimento;

      $('res-batteria').textContent = window.SuNumeri.kwh(energiaBatteria, 1);
      $('res-rete').textContent = window.SuNumeri.kwh(energiaRete, 1);

      if (prezzo.vuoto) {
        $('res-costo').textContent = '—';
        $('res-effettivo').textContent = '—';
        $('formula').textContent = 'Inserisci il prezzo dell\'energia per ottenere il costo della ricarica.';
      } else {
        const costo = energiaRete * prezzo.valore;
        $('res-costo').textContent = window.SuNumeri.euro(costo);
        $('res-effettivo').textContent = `${window.SuNumeri.numero(costo / energiaBatteria, 3)} €/kWh`;
        $('formula').textContent = `${window.SuNumeri.numero(batteria.valore, 1)} kWh × (${window.SuNumeri.numero(finale.valore, 0)}% − ${window.SuNumeri.numero(iniziale.valore, 0)}%) = ${window.SuNumeri.kwh(energiaBatteria, 1)} in batteria · ÷ ${window.SuNumeri.numero(rendimento, 2)} = ${window.SuNumeri.kwh(energiaRete, 1)} dalla rete · × ${window.SuNumeri.numero(prezzo.valore, 3)} €/kWh = ${window.SuNumeri.euro(costo)}`;
      }

      if (potenza.vuoto) {
        $('res-tempo').textContent = '—';
        $('res-tempo-nota').textContent = 'Inserisci la potenza di ricarica per una stima del tempo.';
      } else {
        const ore = energiaRete / potenza.valore;
        $('res-tempo').textContent = window.SuNumeri.durata(ore);
        $('res-tempo-nota').textContent = 'Stima semplificata: la potenza reale può diminuire durante la ricarica, soprattutto alle alte percentuali di batteria.';
      }
    }

    // ---- Eventi -------------------------------------------------------------
    selTipo.addEventListener('change', () => {
      prezzoModificatoDallUtente = false;
      applicaPrezzoIndicativo();
    });

    campoPrezzo.addEventListener('input', () => {
      prezzoModificatoDallUtente = true;
      notaPrezzo.textContent = '';
      calcola();
    });

    campoPerdite.addEventListener('input', () => {
      campoPerdite.dataset.tocco = '1';
      calcola();
    });

    [campoBatteria, campoIniziale, campoFinale, campoPotenza, campoConsumo].forEach((el) => {
      el.addEventListener('input', calcola);
    });

    applicaPrezzoIndicativo();
  });
})();
