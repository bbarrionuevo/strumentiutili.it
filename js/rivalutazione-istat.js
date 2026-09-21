// js/rivalutazione-istat.js — ISTAT e Interessi Legali 2026 (Zero-Backend)
document.addEventListener('DOMContentLoaded', async () => {
  // Nodi ISTAT
  const inCanone = document.getElementById('istat-canone');
  const inMeseInizio = document.getElementById('istat-mese-inizio');
  const inAnnoInizio = document.getElementById('istat-anno-inizio');
  const inMeseFine = document.getElementById('istat-mese-fine');
  const inAnnoFine = document.getElementById('istat-anno-fine');
  const inPerc = document.getElementById('istat-percentuale');
  
  const outIstatDiff = document.getElementById('res-istat-diff');
  const outIstatAumento = document.getElementById('res-istat-aumento');
  const outIstatNuovo = document.getElementById('res-istat-nuovo');
  
  // Nodi Interessi
  const inCapitale = document.getElementById('int-capitale');
  const inDataInizio = document.getElementById('int-data-inizio');
  const inDataFine = document.getElementById('int-data-fine');
  
  const outIntGiorni = document.getElementById('res-int-giorni');
  const outIntMaturati = document.getElementById('res-int-maturati');
  const outIntTotale = document.getElementById('res-int-totale');

  let regole = null;

  try {
    const data = await window.StrumentiData.getRegoleFiscali();
    if (!data) throw new Error('Regole fiscali non disponibili.');
    regole = data.rivalutazione_interessi_2026;
    calculateIstat();
    calculateInteressi();
  } catch (err) {
    console.error("Errore JSON regole fiscali:", err);
  }

  const fmt = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  function calculateIstat() {
    if (!regole) return;
    const canone = parseFloat(inCanone.value) || 0;
    const mInizio = inMeseInizio.value;
    const aInizio = inAnnoInizio.value;
    const mFine = inMeseFine.value;
    const aFine = inAnnoFine.value;
    const perc = parseFloat(inPerc.value) || 100;

    if (canone <= 0) return;

    try {
      // Da gennaio 2026 ISTAT pubblica in base 2025=100: si riporta alla base 2015 con il coefficiente di raccordo
      const indice = (anno, mese) => {
        const v = regole.serie_istat_foi[anno] && regole.serie_istat_foi[anno][mese];
        if (!v) return null;
        return Number(anno) >= regole.foi_base_2025_dal_anno ? v * regole.foi_coefficiente_raccordo_2015 : v;
      };
      const indiceInizio = indice(aInizio, mInizio);
      const indiceFine = indice(aFine, mFine);

      if (!indiceInizio || !indiceFine) {
        outIstatDiff.textContent = "Dati ISTAT non disponibili";
        outIstatAumento.textContent = fmt(0);
        outIstatNuovo.textContent = fmt(canone);
        return;
      }

      // ISTAT pubblica la variazione arrotondata a un decimale: è quella che si applica al canone
      let variazione = Math.round(((indiceFine - indiceInizio) / indiceInizio) * 1000) / 10;

      // Regola giurisprudenziale: la deflazione non abbassa il canone base
      if (variazione < 0) variazione = 0;

      const variazioneApplicata = variazione * (perc / 100);
      const aumento = canone * (variazioneApplicata / 100);
      const nuovoCanone = canone + aumento;

      outIstatDiff.textContent = variazione.toFixed(1).replace('.', ',') + '%';
      outIstatAumento.textContent = fmt(aumento);
      outIstatNuovo.textContent = fmt(nuovoCanone);

    } catch (e) {
      outIstatDiff.textContent = "Data fuori range";
    }
  }

  function calculateInteressi() {
    if (!regole) return;
    const capitale = parseFloat(inCapitale.value) || 0;
    const dInizio = new Date(inDataInizio.value);
    const dFine = new Date(inDataFine.value);

    if (capitale <= 0 || isNaN(dInizio) || isNaN(dFine) || dInizio >= dFine) {
      outIntGiorni.textContent = "0";
      outIntMaturati.textContent = "€ 0,00";
      outIntTotale.textContent = "€ 0,00";
      return;
    }

    const tassi = regole.interessi_legali;
    let interessiTotali = 0;
    let giorniTotali = 0;

    tassi.forEach(periodo => {
      const pInizio = new Date(periodo.dal);
      // Fine periodo esclusiva (giorno dopo "al"): con "al" inclusivo si perdeva un giorno a ogni cambio d'anno
      const pFine = new Date(periodo.al);
      pFine.setUTCDate(pFine.getUTCDate() + 1);

      const overlapInizio = dInizio > pInizio ? dInizio : pInizio;
      const overlapFine = dFine < pFine ? dFine : pFine;

      if (overlapInizio < overlapFine) {
        const giorni = Math.round((overlapFine - overlapInizio) / (1000 * 3600 * 24));
        giorniTotali += giorni;
        // Formula pro rata temporis: C * r * gg / (N * 100) (N=365 o 366)
        interessiTotali += (capitale * periodo.tasso * giorni) / periodo.giorni_anno;
      }
    });

    outIntGiorni.textContent = giorniTotali;
    outIntMaturati.textContent = fmt(interessiTotali);
    outIntTotale.textContent = fmt(capitale + interessiTotali);
  }

  const inputsIstat = [inCanone, inMeseInizio, inAnnoInizio, inMeseFine, inAnnoFine, inPerc];
  inputsIstat.forEach(inp => { if(inp) inp.addEventListener('input', calculateIstat); });

  const inputsInteressi = [inCapitale, inDataInizio, inDataFine];
  inputsInteressi.forEach(inp => { if(inp) inp.addEventListener('input', calculateInteressi); });
});