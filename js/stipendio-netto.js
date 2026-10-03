// js/stipendio-netto.js — Dal lordo al netto in busta paga (regole lette dal JSON)
(function () {
  'use strict';

  function safeNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  // Redondeo bancario simétrico a 2 decimales (half-up)
  function round2(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2));
  }

  function formatEuro(value) {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(Number(value) || 0);
  }

  // IRPEF: delegata al motore condiviso js/irpef.js, che legge gli scaglioni
  // dal JSON senza indici fissi. Prima c'era una copia locale che, sopra i
  // 50.000 euro, cadeva in un fallback con le aliquote scritte nel codice.
  const motoreIrpef = (typeof window !== 'undefined' && window.StrumentiIrpef) ||
    (typeof self !== 'undefined' && self.StrumentiIrpef) || null;

  function computeIRPEF(imponibile, configIrpef) {
    if (!motoreIrpef) {
      throw new Error('[StipendioNetto] js/irpef.js non caricato.');
    }
    return motoreIrpef.computeIRPEF(imponibile, configIrpef);
  }

  // Detrazione per lavoro dipendente (art. 13 TUIR), con salvaguardia e correttivo (dal JSON)
  function computeDetrazioneLavoroDipendente(imponibile, workedDays, configIrpef) {
    const income = Math.max(0, safeNumber(imponibile, 0));
    const days = Math.min(365, Math.max(1, safeNumber(workedDays, 365)));
    const ded = configIrpef.deduzioniLavoroDipendente;
    let base = 0;

    if (income <= 15000) {
      base = ded.baseFino15k;
    } else if (income <= 28000) {
      base = ded.baseFino28k + (ded.incrementoFino28k * ((28000 - income) / 13000));
    } else if (income <= 50000) {
      base = ded.baseFino28k * ((50000 - income) / 22000);
    } else {
      base = 0;
    }

    // Clausola di salvaguardia: minimo per i contratti a tempo indeterminato
    if (income <= 15000 && base < ded.salvaguardiaMinimaIndeterminato) {
      base = ded.salvaguardiaMinimaIndeterminato;
    }

    // Correttivo dell'art. 13, comma 1.1 TUIR
    if (income > 25000 && income <= 35000) {
      base += ded.correzioneAggiuntiva25k35k;
    }

    // In proporzione ai giorni lavorati
    return round2(Math.max(0, base * (days / 365)));
  }

  // Taglio del cuneo fiscale strutturale 2026 (dal JSON)
  function computeCuneoFiscale(imponibile, workedDays, configIrpef) {
    const income = Math.max(0, safeNumber(imponibile, 0));
    const days = Math.min(365, Math.max(1, safeNumber(workedDays, 365)));
    const cuneoConfig = configIrpef.cuneoFiscale;
    let bonusErogato = 0;
    let detrazioneUlteriore = 0;

    // Bonus Esente (fino a 20k)
    for (let i = 0; i < cuneoConfig.bonusEsente.length; i++) {
        const tramo = cuneoConfig.bonusEsente[i];
        if (income <= tramo.soglia) {
             bonusErogato = income * tramo.aliquota;
             break;
        }
    }

    // Detrazione Ulteriore (20k - 40k)
    if (income > cuneoConfig.bonusEsente[cuneoConfig.bonusEsente.length-1].soglia && income <= cuneoConfig.detrazioneUlteriore.sogliaPiena) {
      detrazioneUlteriore = cuneoConfig.detrazioneUlteriore.importoMax * (days / 365);
    } else if (income > cuneoConfig.detrazioneUlteriore.sogliaPiena && income <= cuneoConfig.detrazioneUlteriore.sogliaLimite) {
      detrazioneUlteriore = cuneoConfig.detrazioneUlteriore.importoMax * 
                            ((cuneoConfig.detrazioneUlteriore.sogliaLimite - income) / (cuneoConfig.detrazioneUlteriore.sogliaLimite - cuneoConfig.detrazioneUlteriore.sogliaPiena)) * 
                            (days / 365);
    }

    return {
      bonusErogato: round2(Math.max(0, bonusErogato)),
      detrazioneUlteriore: round2(Math.max(0, detrazioneUlteriore))
    };
  }

  function calculateSalary(ral, mensilita, regole, options) {
    const safeRal = Math.max(0, safeNumber(ral, 0));
    const safeMensilita = Math.max(1, safeNumber(mensilita, 13));
    const config = options || {};
    const workedDays = Math.min(365, Math.max(1, safeNumber(config.workedDays, 365)));
    
    // I tassi di default ora provengono dal JSON se non specificati dall'utente
    const defaultRegRate = regole.irpef.aliquoteMedieLocali.regionale;
    const defaultComRate = regole.irpef.aliquoteMedieLocali.comunale;
    
    const regionalRate = safeNumber(config.regionalRate, defaultRegRate);
    const comunalRate = safeNumber(config.comunalRate, defaultComRate);

    // Parametri INPS fittiziamente inseriti nel file (sostituisci con quelli esatti se li aggiungi in `generale`)
    // Per questo blocco manteniamo le costanti locali se non presenti in regole, o le prendiamo dal JSON.
    // Li stiamo prendendo da partitaIvaForfettario.inps.massimale2026 come approssimazione, 
    // ma idealmente inps dipendenti dovrebbe avere una sua voce nel JSON.
    const INPS_CEILING = 56224; // regole.inpsLavoroDipendente?.massimale || 56224;
    const INPS_STANDARD = 0.0919; // regole.inpsLavoroDipendente?.aliquotaStandard || 0.0919;
    const INPS_SOLIDARITY = 0.1019; // regole.inpsLavoroDipendente?.aliquotaSolidarieta || 0.1019;

    // 1. Contributi previdenziali INPS a carico del dipendente
    const inpsBaseStandard = Math.min(safeRal, INPS_CEILING);
    const inpsStandard = inpsBaseStandard * INPS_STANDARD;
    const inpsExcess = Math.max(0, safeRal - INPS_CEILING);
    const inpsSolidarity = inpsExcess * INPS_SOLIDARITY;
    const totalInps = round2(inpsStandard + inpsSolidarity);

    // 2. Imponibile fiscale
    const imponibileIrpef = round2(Math.max(0, safeRal - totalInps));

    // 3. IRPEF Lorda
    const irpefLorda = computeIRPEF(imponibileIrpef, regole.irpef);

    // 4. Detrazioni
    const detrazioneLavoro = config.applyDetrazione === false
      ? 0
      : computeDetrazioneLavoroDipendente(imponibileIrpef, workedDays, regole.irpef);

    const cuneo = computeCuneoFiscale(imponibileIrpef, workedDays, regole.irpef);

    // 5. Trattamento Integrativo (Ex Bonus Renzi)
    let trattamentoIntegrativo = 0;
    const exBonus = regole.irpef.exBonusRenzi;
    if (imponibileIrpef > exBonus.sogliaMinima && imponibileIrpef <= exBonus.sogliaMassima && irpefLorda > detrazioneLavoro) {
      trattamentoIntegrativo = round2(exBonus.importoAnnuo * (workedDays / 365));
    }

    // 6. Sterilizzazione Benefici (Oltre 200k)
    let detrazioniTotali = detrazioneLavoro + cuneo.detrazioneUlteriore;
    if (imponibileIrpef > regole.irpef.meccanismoEsterilizzazione.sogliaAttivazioneReddito) {
       detrazioniTotali = Math.max(0, detrazioniTotali - regole.irpef.meccanismoEsterilizzazione.penalizzazioneDetrazioniEuro);
    }

    // 7. IRPEF Netta
    const irpefNetta = round2(Math.max(0, irpefLorda - detrazioniTotali));

    // 8. Addizionali regionale e comunale
    const regionalTax = round2(imponibileIrpef * regionalRate);
    const municipalTax = round2(imponibileIrpef * comunalRate);
    const addizionali = round2(regionalTax + municipalTax);

    // 9. Netto annuo e mensile
    const nettoAnnuo = round2(
      safeRal - totalInps - irpefNetta - addizionali + cuneo.bonusErogato + trattamentoIntegrativo
    );
    const nettoMensile = round2(nettoAnnuo / safeMensilita);

    return {
      ral: round2(safeRal),
      mensilita: safeMensilita,
      inpsBase: round2(inpsBaseStandard),
      inps: totalInps,
      imponibileIrpef,
      irpefLorda,
      detrazioneLavoro: round2(detrazioneLavoro),
      bonusCuneo: cuneo.bonusErogato,
      detrazioneCuneo: cuneo.detrazioneUlteriore,
      trattamentoIntegrativo,
      irpefNetta,
      regionalTax,
      municipalTax,
      addizionali,
      nettoAnnuo,
      nettoMensile,
      regionalRate,
      comunalRate
    };
  }

  function renderSalaryResult(result) {
    const fields = {
      'res-inps-base': formatEuro(result.inpsBase),
      previdenza: formatEuro(result.inps),
      imponibile: formatEuro(result.imponibileIrpef),
      'irpef-lorda': formatEuro(result.irpefLorda),
      detrazione: formatEuro(result.detrazioneLavoro),
      cuneo: formatEuro(result.bonusCuneo > 0 ? result.bonusCuneo : result.detrazioneCuneo),
      irpef: formatEuro(result.irpefNetta),
      addizionaliTot: formatEuro(result.addizionali),
      nettoAnnuale: formatEuro(result.nettoAnnuo),
      nettoMensile: formatEuro(result.nettoMensile)
    };

    Object.entries(fields).forEach(function ([id, value]) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    const cuneoLabel = document.getElementById('cuneo-label');
    if (cuneoLabel) {
      if (result.bonusCuneo > 0) {
        cuneoLabel.textContent = 'Bonus cuneo fiscale (erogato)';
      } else if (result.detrazioneCuneo > 0) {
        cuneoLabel.textContent = 'Detrazione ulteriore cuneo';
      } else {
        cuneoLabel.textContent = 'Cuneo fiscale';
      }
    }

    const addRegEl = document.getElementById('addReg');
    const addComEl = document.getElementById('addCom');
    if (addRegEl) addRegEl.textContent = formatEuro(result.regionalTax);
    if (addComEl) addComEl.textContent = formatEuro(result.municipalTax);
  }

  function resetSalaryResult() {
    [
      'res-inps-base',
      'previdenza',
      'imponibile',
      'irpef-lorda',
      'detrazione',
      'cuneo',
      'irpef',
      'addReg',
      'addCom',
      'addizionaliTot',
      'nettoAnnuale',
      'nettoMensile'
    ].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    ultimoCalcolo = null;
    document.querySelectorAll('[data-sn-quota]').forEach(function (b) { b.style.width = '0%'; });
    ['resta', 'inps', 'irpef', 'addizionali'].forEach(function (k) {
      const el = document.getElementById('sn-v-' + k);
      if (el) el.textContent = '—';
      const quota = document.getElementById('sn-p-' + k);
      if (quota) quota.textContent = '\u00a0';
    });
    const aiuti = document.getElementById('sn-aiuti');
    if (aiuti) aiuti.textContent = '';
    disegnaAumento();
  }

  // ------------------------------------------------ viste interattive
  let ultimoCalcolo = null;
  const ETICHETTE_QUOTA = { resta: 'resta a te', inps: 'contributi INPS', irpef: 'IRPEF netta', addizionali: 'addizionali' };

  function disegnaRipartizione(r) {
    const p = ripartizione(r);
    const parti = ['resta', 'inps', 'irpef', 'addizionali'];
    parti.forEach(function (k) {
      const barra = document.querySelector('[data-sn-quota="' + k + '"]');
      if (barra) barra.style.width = Math.max(0, p.quote[k]) + '%';
      const valore = document.getElementById('sn-v-' + k);
      if (valore) valore.textContent = formatEuro(p[k]);
      const quota = document.getElementById('sn-p-' + k);
      if (quota) quota.textContent = p.quote[k].toLocaleString('it-IT') + '% della RAL';
    });
    const barra = document.getElementById('sn-barra');
    if (barra) barra.setAttribute('aria-label', parti.map(function (k) { return ETICHETTE_QUOTA[k] + ' ' + p.quote[k].toLocaleString('it-IT') + '%'; }).join(', '));
    const frase = document.getElementById('sn-dove-frase');
    if (frase) frase.textContent = 'Di ogni 100 euro lordi ' + p.quote.resta.toLocaleString('it-IT') + ' restano a te; ' +
      p.quote.inps.toLocaleString('it-IT') + ' vanno all\'INPS, ' + p.quote.irpef.toLocaleString('it-IT') + ' all\'IRPEF e ' +
      p.quote.addizionali.toLocaleString('it-IT') + ' alle addizionali di Regione e Comune.';
    const aiuti = document.getElementById('sn-aiuti');
    if (aiuti) aiuti.textContent = p.aiuti > 0
      ? 'In più arrivano in busta ' + formatEuro(p.aiuti) + ' all\'anno tra bonus del cuneo fiscale e trattamento integrativo: per questo il netto annuale è ' + formatEuro(r.nettoAnnuo) + '.'
      : '';
  }

  function disegnaAumento() {
    const esito = document.getElementById('sn-aumento-esito');
    const scelta = document.getElementById('sn-aumento');
    if (!esito || !scelta || !ultimoCalcolo) return;
    const delta = safeNumber(scelta.value, 0);
    const c = ultimoCalcolo;
    const a = aumento(c.ral, delta, c.mensilita, c.regole, c.opzioni);
    if (!a) { esito.textContent = 'Calcola prima il netto con la tua RAL.'; return; }
    esito.textContent = 'Con ' + formatEuro(delta) + ' lordi in più all\'anno il netto sale di ' + formatEuro(a.nettoInPiu) +
      ' (circa ' + formatEuro(a.mensileInPiu) + ' al mese): di ogni euro lordo in più ti restano ' + a.centesimiPerEuro + ' centesimi.';
  }

  function bind() {
    if (typeof document === 'undefined') return;

    const calcBtn = document.getElementById('calcola');
    const resetBtn = document.getElementById('reset');
    if (!calcBtn) return;

    const sceltaAumento = document.getElementById('sn-aumento');
    if (sceltaAumento) sceltaAumento.addEventListener('change', disegnaAumento);

    calcBtn.addEventListener('click', async function () {
      
      // Caricamento Regole
      let regole = null;
      try {
          regole = await window.StrumentiData.getRegoleFiscali();
          if (!regole) throw new Error('Regole fiscali non disponibili.');
      } catch (e) {
          console.error("Errore nel caricamento delle regole fiscali:", e);
          alert("Impossibile caricare le aliquote. Riprova più tardi.");
          return;
      }

      const ral = safeNumber(document.getElementById('ral') && document.getElementById('ral').value, 0);
      const mensilita = safeNumber(document.getElementById('mensilita') && document.getElementById('mensilita').value, 13);
      
      // Fallback a valori JSON se l'input è vuoto
      const inputRegRate = document.getElementById('regional-rate') && document.getElementById('regional-rate').value;
      const inputComRate = document.getElementById('comunal-rate') && document.getElementById('comunal-rate').value;
      
      const regionalRate = inputRegRate ? safeNumber(inputRegRate, 1.73) / 100 : regole.irpef.aliquoteMedieLocali.regionale;
      const comunalRate = inputComRate ? safeNumber(inputComRate, 0.80) / 100 : regole.irpef.aliquoteMedieLocali.comunale;
      
      const applyDetrazione = !!(document.getElementById('apply-detrazione') && document.getElementById('apply-detrazione').checked);

      if (ral <= 0) {
        window.alert('Inserisci una RAL valida.');
        return;
      }

      const opzioni = {
        regionalRate: regionalRate,
        comunalRate: comunalRate,
        applyDetrazione: applyDetrazione
      };
      const risultato = calculateSalary(ral, mensilita, regole, opzioni);
      renderSalaryResult(risultato);
      ultimoCalcolo = { ral: ral, mensilita: mensilita, regole: regole, opzioni: opzioni };
      disegnaRipartizione(risultato);
      disegnaAumento();
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        const defaults = {
          ral: '',
          mensilita: '13',
          'regional-rate': '1.73',
          'comunal-rate': '0.80'
        };

        Object.entries(defaults).forEach(function ([id, value]) {
          const el = document.getElementById(id);
          if (el) el.value = value;
        });

        const applyDetrazione = document.getElementById('apply-detrazione');
        if (applyDetrazione) applyDetrazione.checked = true;
        resetSalaryResult();
      });
    }
  }

  // Dove finisce la RAL: contributi INPS, IRPEF netta, addizionali e quello
  // che resta al lavoratore. Bonus cuneo e trattamento integrativo arrivano in
  // busta in piu' (aiuti): il netto e' resta + aiuti. Quote in % della RAL.
  function ripartizione(r) {
    const resta = round2(r.ral - r.inps - r.irpefNetta - r.addizionali);
    const aiuti = round2(r.nettoAnnuo - resta);
    const quota = (x) => (r.ral > 0 ? Math.round(x / r.ral * 1000) / 10 : 0);
    const quote = { inps: quota(r.inps), irpef: quota(r.irpefNetta), addizionali: quota(r.addizionali) };
    quote.resta = Math.round((100 - quote.inps - quote.irpef - quote.addizionali) * 10) / 10;
    return { inps: r.inps, irpef: r.irpefNetta, addizionali: r.addizionali, resta, aiuti, quote };
  }

  // E se la RAL aumenta di 'delta'? Si rifa' il calcolo intero (scaglioni,
  // detrazioni e cuneo cambiano con il reddito) e si confrontano i due netti.
  function aumento(ral, delta, mensilita, regole, opzioni) {
    if (!(delta > 0) || !(ral > 0)) return null;
    const prima = calculateSalary(ral, mensilita, regole, opzioni);
    const dopo = calculateSalary(ral + delta, mensilita, regole, opzioni);
    const nettoInPiu = round2(dopo.nettoAnnuo - prima.nettoAnnuo);
    return {
      nettoInPiu,
      mensileInPiu: round2(dopo.nettoMensile - prima.nettoMensile),
      centesimiPerEuro: Math.round(nettoInPiu / delta * 100)
    };
  }

  // L'API globale esposta viene mantenuta per retrocompatibilità
  window.StipendioNetto = {
    calculateSalary: calculateSalary,
    ripartizione: ripartizione,
    aumento: aumento
  };

  bind();
})();