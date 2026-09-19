// js/consumo-elettrodomestici.js — Consumo e costo degli elettrodomestici a partire dall'etichetta
//
// Ogni regolamento europeo dichiara il consumo in un'unità diversa (kWh per 100 cicli, kWh/anno,
// kWh per ciclo): non esiste una conversione unica, quindi l'interfaccia e la formula cambiano
// con l'apparecchio selezionato. Tutto il calcolo avviene nel browser.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // Configurazione per tipo di apparecchio: quale dato chiede l'etichetta e come si trasforma in kWh
  const APPARECCHI = {
    lavatrice: {
      modo: 'cicli',
      etichetta: 'Consumo dichiarato (kWh per 100 cicli)',
      aiuto: 'Sull\'etichetta energetica è il valore riferito a 100 cicli del programma eco 40-60, previsto dal regolamento (UE) 2019/2014.',
      esempio: '52',
      cicliPredefiniti: 3,
      unitaUso: 'ciclo'
    },
    lavastoviglie: {
      modo: 'cicli',
      etichetta: 'Consumo dichiarato (kWh per 100 cicli)',
      aiuto: 'Sull\'etichetta energetica è il valore riferito a 100 cicli del programma eco, previsto dal regolamento (UE) 2019/2017.',
      esempio: '74',
      cicliPredefiniti: 5,
      unitaUso: 'ciclo'
    },
    frigorifero: {
      modo: 'annuo',
      etichetta: 'Consumo dichiarato (kWh all\'anno)',
      aiuto: 'Sull\'etichetta energetica è il consumo annuo previsto dal regolamento (UE) 2019/2016: comprende il funzionamento continuo dell\'apparecchio.',
      esempio: '180',
      unitaUso: 'giorno'
    },
    forno: {
      modo: 'cicloOPotenza',
      etichetta: 'Consumo dichiarato (kWh per ciclo)',
      aiuto: 'Sull\'etichetta energetica è il consumo per ciclo previsto dal regolamento (UE) 65/2014. Se non lo hai, lascia il campo vuoto e inserisci potenza e durata.',
      esempio: '0,89',
      cicliPredefiniti: 2,
      unitaUso: 'utilizzo'
    },
    condizionatore: {
      modo: 'annuoOPotenza',
      etichetta: 'Consumo dichiarato (kWh all\'anno, in raffrescamento)',
      aiuto: 'Sull\'etichetta è il consumo annuo previsto dal regolamento (UE) 626/2011, calcolato su un numero convenzionale di ore di funzionamento. Se preferisci partire dalla potenza, lascia il campo vuoto.',
      esempio: '250',
      unitaUso: 'ora'
    },
    altro: {
      modo: 'potenza',
      etichetta: 'Consumo dichiarato (kWh per utilizzo)',
      aiuto: 'Per gli apparecchi senza etichetta energetica conviene partire dalla potenza in watt e dalle ore di utilizzo.',
      esempio: '',
      unitaUso: 'utilizzo'
    }
  };

  const CICLI_PERIODO = { settimana: 52, mese: 12, anno: 1 };
  const PAROLE_OCR = ['etichetta', 'energetica', 'classe', 'kwh', 'annum', 'anno', 'cicli', 'ciclo', 'eco', 'energy'];

  document.addEventListener('DOMContentLoaded', () => {
    const selApparecchio = $('apparecchio');
    if (!selApparecchio) return;

    const campoConsumo = $('consumo');
    const campoCosto = $('costo-kwh');
    const campoCicli = $('cicli');
    const campoPeriodo = $('periodo');
    const campoPotenza = $('potenza');
    const campoOre = $('ore-uso');
    const campoGiorni = $('giorni-anno');
    const boxDichiarato = $('box-dichiarato');
    const boxPotenza = $('box-potenza');
    const boxCicli = $('box-cicli');
    const errore = $('errore');
    const avvertenza = $('avvertenza');
    const notaPrezzo = $('nota-prezzo');

    let datiMercato = null;

    // I valori indicativi di mercato stanno nel file centralizzato delle regole, con fonte e data
    if (window.StrumentiData && window.StrumentiData.getRegoleFiscali) {
      window.StrumentiData.getRegoleFiscali().then((regole) => {
        if (regole && regole.consumi_energia_2026) datiMercato = regole.consumi_energia_2026.elettricita;
      }).catch(() => { /* il campo resta compilabile a mano */ });
    }

    function configura() {
      const tipo = selApparecchio.value;
      const cfg = APPARECCHI[tipo];

      $('etichetta-consumo').textContent = cfg.etichetta;
      $('aiuto-consumo').textContent = cfg.aiuto;
      campoConsumo.placeholder = cfg.esempio ? `Es. ${cfg.esempio}` : 'Es. 1,2';

      const usaCicli = cfg.modo === 'cicli' || cfg.modo === 'cicloOPotenza';
      const mostraPotenza = cfg.modo === 'potenza' || cfg.modo === 'cicloOPotenza' || cfg.modo === 'annuoOPotenza';

      boxDichiarato.classList.toggle('hidden', cfg.modo === 'potenza');
      boxCicli.classList.toggle('hidden', !usaCicli);
      boxPotenza.classList.toggle('hidden', !mostraPotenza);

      // Per forno e condizionatore la potenza è un'alternativa, non un obbligo
      campoGiorni.parentElement.classList.toggle('hidden', cfg.modo === 'cicloOPotenza');

      if (usaCicli && !campoCicli.value && cfg.cicliPredefiniti) {
        campoCicli.value = String(cfg.cicliPredefiniti);
        campoPeriodo.value = 'settimana';
      }

      calcola();
    }

    function valore(campo, opzioni) {
      const grezzo = campo.value.trim();
      if (!grezzo) return { vuoto: true, valore: null };
      const n = window.SuNumeri.parseValido(grezzo, opzioni);
      return { vuoto: false, valore: n };
    }

    // Titoli dei riquadri: per il frigorifero il primo dato è giornaliero, non "per utilizzo"
    const TITOLI_USO = { ciclo: 'Per ciclo', giorno: 'Al giorno', ora: 'Per ora', utilizzo: 'Per utilizzo' };

    function mostraRisultati(dati) {
      const titolo = $('res-uso-titolo');
      if (titolo) titolo.textContent = TITOLI_USO[dati.unitaUso] || 'Per utilizzo';
      $('res-uso').textContent = dati.costoUso === null ? '—' : window.SuNumeri.euro(dati.costoUso);
      $('res-uso-kwh').textContent = dati.kwhUso === null ? '' : `${window.SuNumeri.kwh(dati.kwhUso, 2)} per ${dati.unitaUso}`;
      $('res-mese').textContent = dati.costoMese === null ? '—' : window.SuNumeri.euro(dati.costoMese);
      $('res-mese-kwh').textContent = dati.kwhAnno === null ? '' : window.SuNumeri.kwh(dati.kwhAnno / 12, 1) + ' al mese';
      $('res-anno').textContent = dati.costoAnno === null ? '—' : window.SuNumeri.euro(dati.costoAnno);
      $('res-anno-kwh').textContent = dati.kwhAnno === null ? '' : window.SuNumeri.kwh(dati.kwhAnno, 1) + ' all\'anno';
      $('formula').textContent = dati.formula || '';

      if (dati.avviso) {
        avvertenza.textContent = dati.avviso;
        avvertenza.classList.remove('hidden');
      } else {
        avvertenza.classList.add('hidden');
      }
    }

    function azzera(messaggio) {
      errore.textContent = messaggio || '';
      mostraRisultati({ costoUso: null, kwhUso: null, costoMese: null, costoAnno: null, kwhAnno: null, formula: '', unitaUso: '' });
    }

    function calcola() {
      const tipo = selApparecchio.value;
      const cfg = APPARECCHI[tipo];

      const costo = valore(campoCosto, { positivo: true, max: 10 });
      if (!costo.vuoto && costo.valore === null) return azzera('Inserisci un costo dell\'energia valido, per esempio 0,28.');

      const dichiarato = valore(campoConsumo, { positivo: true, max: 100000 });
      if (!dichiarato.vuoto && dichiarato.valore === null) return azzera('Il consumo dichiarato deve essere un numero maggiore di zero.');

      let kwhAnno = null;
      let kwhUso = null;
      let unitaUso = cfg.unitaUso;
      let formula = '';
      let avviso = '';

      const cicli = valore(campoCicli, { positivo: true, max: 100000 });
      const usiAnno = (!cicli.vuoto && cicli.valore !== null)
        ? cicli.valore * CICLI_PERIODO[campoPeriodo.value]
        : null;

      if (!cicli.vuoto && cicli.valore === null) return azzera('Il numero di cicli deve essere maggiore di zero.');

      if (cfg.modo === 'cicli') {
        if (dichiarato.vuoto) return azzera('');
        if (usiAnno === null) return azzera('Indica quante volte usi l\'apparecchio.');
        kwhUso = dichiarato.valore / 100;                   // l'etichetta dichiara 100 cicli
        kwhAnno = kwhUso * usiAnno;
        formula = `${window.SuNumeri.numero(dichiarato.valore, 2)} kWh / 100 cicli ÷ 100 = ${window.SuNumeri.numero(kwhUso, 3)} kWh per ciclo × ${window.SuNumeri.numero(usiAnno, 0)} cicli all'anno = ${window.SuNumeri.kwh(kwhAnno, 1)} all'anno`;
      } else if (cfg.modo === 'annuo') {
        if (dichiarato.vuoto) return azzera('');
        kwhAnno = dichiarato.valore;
        kwhUso = kwhAnno / 365;                             // il frigorifero funziona in continuo
        unitaUso = 'giorno';
        formula = `${window.SuNumeri.kwh(kwhAnno, 0)} all'anno ÷ 365 giorni = ${window.SuNumeri.numero(kwhUso, 2)} kWh al giorno`;
      } else if (cfg.modo === 'cicloOPotenza') {
        if (usiAnno === null) return azzera('Indica quante volte usi l\'apparecchio.');
        if (!dichiarato.vuoto) {
          kwhUso = dichiarato.valore;
          formula = `${window.SuNumeri.numero(kwhUso, 2)} kWh per ciclo × ${window.SuNumeri.numero(usiAnno, 0)} utilizzi all'anno = ${window.SuNumeri.kwh(kwhUso * usiAnno, 1)} all'anno`;
        } else {
          const potenza = valore(campoPotenza, { positivo: true, max: 30000 });
          const ore = valore(campoOre, { positivo: true, max: 24 });
          if (potenza.vuoto || ore.vuoto) return azzera('');
          if (potenza.valore === null) return azzera('La potenza deve essere un numero maggiore di zero.');
          if (ore.valore === null) return azzera('Le ore per utilizzo devono essere comprese fra 0 e 24.');
          kwhUso = potenza.valore * ore.valore / 1000;
          formula = `${window.SuNumeri.numero(potenza.valore, 0)} W × ${window.SuNumeri.numero(ore.valore, 2)} h ÷ 1000 = ${window.SuNumeri.numero(kwhUso, 2)} kWh per utilizzo × ${window.SuNumeri.numero(usiAnno, 0)} utilizzi = ${window.SuNumeri.kwh(kwhUso * usiAnno, 1)} all'anno`;
          avviso = 'Stima basata sulla potenza impostata: un forno assorbe la potenza massima solo durante il riscaldamento e poi la modula con il termostato, quindi il consumo reale è in genere inferiore.';
        }
        kwhAnno = kwhUso * usiAnno;
      } else if (cfg.modo === 'annuoOPotenza') {
        if (!dichiarato.vuoto) {
          kwhAnno = dichiarato.valore;
          kwhUso = null;
          unitaUso = '';
          formula = `${window.SuNumeri.kwh(kwhAnno, 0)} all'anno dichiarati in etichetta`;
          avviso = 'Il consumo dichiarato in etichetta è calcolato su un numero convenzionale di ore di funzionamento stagionale: il consumo reale dipende dal clima, dalle temperature impostate e dall\'isolamento dell\'ambiente.';
        } else {
          const potenza = valore(campoPotenza, { positivo: true, max: 30000 });
          const ore = valore(campoOre, { positivo: true, max: 24 });
          const giorni = valore(campoGiorni, { positivo: true, max: 366 });
          if (potenza.vuoto || ore.vuoto || giorni.vuoto) return azzera('');
          if (potenza.valore === null) return azzera('La potenza deve essere un numero maggiore di zero.');
          if (ore.valore === null) return azzera('Le ore di utilizzo devono essere comprese fra 0 e 24.');
          if (giorni.valore === null) return azzera('I giorni di utilizzo devono essere compresi fra 1 e 366.');
          kwhUso = potenza.valore * ore.valore / 1000;
          kwhAnno = kwhUso * giorni.valore;
          unitaUso = 'giorno';
          formula = `${window.SuNumeri.numero(potenza.valore, 0)} W × ${window.SuNumeri.numero(ore.valore, 1)} h ÷ 1000 = ${window.SuNumeri.numero(kwhUso, 2)} kWh al giorno × ${window.SuNumeri.numero(giorni.valore, 0)} giorni = ${window.SuNumeri.kwh(kwhAnno, 1)} all'anno`;
          avviso = 'Stima basata sulla potenza impostata: un climatizzatore inverter riduce l\'assorbimento una volta raggiunta la temperatura, quindi il consumo reale è in genere inferiore.';
        }
      } else if (cfg.modo === 'potenza') {
        const potenza = valore(campoPotenza, { positivo: true, max: 30000 });
        const ore = valore(campoOre, { positivo: true, max: 24 });
        const giorni = valore(campoGiorni, { positivo: true, max: 366 });
        if (potenza.vuoto || ore.vuoto || giorni.vuoto) return azzera('');
        if (potenza.valore === null) return azzera('La potenza deve essere un numero maggiore di zero.');
        if (ore.valore === null) return azzera('Le ore di utilizzo devono essere comprese fra 0 e 24.');
        if (giorni.valore === null) return azzera('I giorni di utilizzo devono essere compresi fra 1 e 366.');
        kwhUso = potenza.valore * ore.valore / 1000;
        kwhAnno = kwhUso * giorni.valore;
        unitaUso = 'utilizzo';
        formula = `${window.SuNumeri.numero(potenza.valore, 0)} W × ${window.SuNumeri.numero(ore.valore, 2)} h ÷ 1000 = ${window.SuNumeri.numero(kwhUso, 2)} kWh per utilizzo × ${window.SuNumeri.numero(giorni.valore, 0)} utilizzi = ${window.SuNumeri.kwh(kwhAnno, 1)} all'anno`;
        avviso = 'Il calcolo dalla potenza è una stima: la potenza indicata è quella massima assorbita, mentre molti apparecchi la modulano durante il funzionamento.';
      }

      errore.textContent = '';

      if (kwhAnno === null) {
        return mostraRisultati({ costoUso: null, kwhUso: null, costoMese: null, costoAnno: null, kwhAnno: null, formula: '', unitaUso: '' });
      }

      if (costo.vuoto || costo.valore === null) {
        mostraRisultati({
          costoUso: null, kwhUso, costoMese: null, costoAnno: null, kwhAnno,
          formula: formula + ' — inserisci il costo dell\'energia per ottenere l\'importo in euro.',
          unitaUso, avviso
        });
        return;
      }

      const costoAnno = kwhAnno * costo.valore;
      mostraRisultati({
        costoUso: kwhUso === null ? null : kwhUso * costo.valore,
        kwhUso,
        costoMese: costoAnno / 12,
        costoAnno,
        kwhAnno,
        unitaUso,
        avviso,
        formula: `${formula} × ${window.SuNumeri.numero(costo.valore, 3)} €/kWh = ${window.SuNumeri.euro(costoAnno)} all'anno`
      });
    }

    // ---- Eventi -------------------------------------------------------------
    selApparecchio.addEventListener('change', configura);
    [campoConsumo, campoCosto, campoCicli, campoPotenza, campoOre, campoGiorni].forEach((el) => {
      if (el) el.addEventListener('input', calcola);
    });
    campoPeriodo.addEventListener('change', calcola);

    $('usa-indicativo').addEventListener('click', () => {
      const prezzo = datiMercato && datiMercato.prezzo_indicativo_kwh ? datiMercato.prezzo_indicativo_kwh : 0.22;
      campoCosto.value = window.SuNumeri.numero(prezzo, 2);
      notaPrezzo.textContent = datiMercato
        ? `Valore indicativo: ${datiMercato.nota_calcolo} Fonte: ${datiMercato.fonte}.`
        : 'Valore indicativo comprensivo di energia, trasporto, oneri e imposte. Sostituiscilo con il costo della tua bolletta.';
      calcola();
    });

    campoCosto.addEventListener('input', () => {
      if (notaPrezzo.textContent) notaPrezzo.textContent = '';
    });

    // ---- Scansione dell'etichetta energetica --------------------------------
    const bottoneScan = $('scan-etichetta');
    const inputFoto = $('foto-etichetta');
    const statoOcr = $('stato-ocr');

    bottoneScan.addEventListener('click', () => inputFoto.click());

    // Trascinamento della foto dell'etichetta sulla scheda dei dati di consumo
    const schedaDati = bottoneScan.closest('.bg-white');
    if (schedaDati && window.StrumentiDropzone) {
      ['dragenter', 'dragover'].forEach((evento) => schedaDati.addEventListener(evento, (e) => {
        e.preventDefault();
        schedaDati.classList.add('ring-2', 'ring-indigo-300');
      }));
      ['dragleave', 'dragend'].forEach((evento) => schedaDati.addEventListener(evento, () => {
        schedaDati.classList.remove('ring-2', 'ring-indigo-300');
      }));
      schedaDati.addEventListener('drop', (e) => {
        e.preventDefault();
        schedaDati.classList.remove('ring-2', 'ring-indigo-300');
        const file = e.dataTransfer && e.dataTransfer.files;
        if (file && file.length) window.StrumentiDropzone.setFilesOnInput(inputFoto, file);
      });
    }

    inputFoto.addEventListener('change', async () => {
      const file = inputFoto.files && inputFoto.files[0];
      inputFoto.value = '';
      if (!file) return;

      bottoneScan.disabled = true;
      errore.textContent = '';
      statoOcr.textContent = 'Avvio della lettura...';

      try {
        const esito = await window.SuOcr.leggi(file, {
          parole: PAROLE_OCR,
          onProgresso: (messaggio) => { statoOcr.textContent = messaggio; }
        });

        const testo = `${esito.testo}\n${esito.testoNumerico}`;
        const consumi = window.SuOcr.trovaConsumo(testo);
        const classe = window.SuOcr.trovaClasseEnergetica(testo);

        if (!consumi.length) {
          // La classe da sola non permette di ricavare il consumo: non si inventa un valore
          statoOcr.textContent = '';
          errore.textContent = classe
            ? `Rilevata la classe energetica ${classe}, ma non il consumo dichiarato. La classe non basta per il calcolo: inserisci il valore in kWh a mano.`
            : 'Non è stato possibile leggere il consumo dall\'etichetta. Inseriscilo a mano.';
          return;
        }

        // Si allinea il tipo di apparecchio all'unità di misura effettivamente letta
        const lettura = consumi[0];
        const tipoCorrente = selApparecchio.value;
        const modo = APPARECCHI[tipoCorrente].modo;

        let descrizione = '';
        if (lettura.unita === 'kwh100cicli') {
          if (modo !== 'cicli') selApparecchio.value = 'lavatrice';
          descrizione = `${window.SuNumeri.numero(lettura.valore, 2)} kWh per 100 cicli`;
        } else if (lettura.unita === 'kwhAnno') {
          if (modo !== 'annuo' && modo !== 'annuoOPotenza') selApparecchio.value = 'frigorifero';
          descrizione = `${window.SuNumeri.numero(lettura.valore, 0)} kWh all'anno`;
        } else {
          if (modo !== 'cicloOPotenza') selApparecchio.value = 'forno';
          descrizione = `${window.SuNumeri.numero(lettura.valore, 2)} kWh per ciclo`;
        }

        configura();
        campoConsumo.value = window.SuNumeri.numero(lettura.valore, lettura.valore % 1 === 0 ? 0 : 2);
        calcola();

        const nota = classe ? ` Classe energetica ${classe}.` : '';
        statoOcr.textContent = esito.confidenza < 70
          ? `Rilevato ${descrizione}.${nota} Lettura incerta: controlla il valore e il tipo di apparecchio.`
          : `Rilevato ${descrizione}.${nota} Controlla che il tipo di apparecchio sia corretto.`;
      } catch (err) {
        statoOcr.textContent = '';
        errore.textContent = window.StrumentiErrors
          ? window.StrumentiErrors.friendlyErrorMessage(err, 'Lettura non riuscita: inserisci i dati a mano.')
          : (err.message || 'Lettura non riuscita: inserisci i dati a mano.');
      } finally {
        bottoneScan.disabled = false;
      }
    });

    configura();
  });
})();
