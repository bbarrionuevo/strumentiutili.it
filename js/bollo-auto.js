// js/bollo-auto.js — Motore di calcolo Bollo e Superbollo 2026 (Zero-Backend)
document.addEventListener('DOMContentLoaded', async () => {
  const inputKw = document.getElementById('calc-kw');
  const inputEuro = document.getElementById('calc-euro');
  const inputRegione = document.getElementById('calc-regione');
  const inputImmatricolazione = document.getElementById('calc-anno');
  
  const outBollo = document.getElementById('res-bollo');
  const outSuperbollo = document.getElementById('res-superbollo');
  const outTotale = document.getElementById('res-totale');
  
  let regoleBollo = null;

  try {
    const response = await fetch('/data/regole-fiscali-2026.json');
    const data = await response.json();
    regoleBollo = data.bollo_auto_2026;
    calculateBollo();
  } catch (err) {
    console.error("Errore nel caricamento delle regole fiscali:", err);
  }

  function calculateBollo() {
    if (!regoleBollo) return;

    // Troncamento legale rigoroso della potenza (es. 185.8 kW -> 185 kW)
    const kwInput = parseFloat(inputKw.value) || 0;
    const kw = Math.floor(kwInput); 

    const euroClass = inputEuro.value;
    const regione = inputRegione.value;
    
    const annoImmatricolazione = parseInt(inputImmatricolazione.value) || new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    const anniAnzianita = Math.max(0, currentYear - annoImmatricolazione);

    let bollo = 0;
    let superbollo = 0;

    // 1. Calcolo Bollo Regionale Base
    // Se la regione non ha un nodo specifico, usa la tariffa nazionale
    const regioneData = regoleBollo.regioni[regione] || regoleBollo.regioni["nazionale"];
    const tariffe = regioneData.classi_euro[euroClass];

    if (tariffe && kw > 0) {
      if (kw <= 100) {
        bollo = kw * tariffe.tariffa_base;
      } else {
        bollo = (100 * tariffe.tariffa_base) + ((kw - 100) * tariffe.tariffa_eccedente);
      }
    }

    // 2. Calcolo Superbollo Erariale (Addizionale oltre 185 kW)
    const regoleSuperbollo = regoleBollo.superbollo;
    if (kw > regoleSuperbollo.franchigia_kw) {
      const kwEccedenti = kw - regoleSuperbollo.franchigia_kw;
      
      let tariffaApplicabile = 0;
      for (const fascia of regoleSuperbollo.scaglioni_riduzione) {
        if (anniAnzianita >= fascia.anni_min && anniAnzianita <= fascia.anni_max) {
          tariffaApplicabile = fascia.tariffa_kw;
          break;
        }
      }
      superbollo = kwEccedenti * tariffaApplicabile;
    }

    // Arrotondamento commerciale simmetrico a 2 decimali
    const totaleLordo = bollo + superbollo;
    const totale = Math.round((totaleLordo + Number.EPSILON) * 100) / 100;

    // Rendering UI
    const fmt = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    outBollo.textContent = fmt(bollo);
    outSuperbollo.textContent = fmt(superbollo);
    outTotale.textContent = fmt(totale);
  }

  // Event Listeners
  const inputs = [inputKw, inputEuro, inputRegione, inputImmatricolazione];
  inputs.forEach(inp => {
    if(inp) inp.addEventListener('input', calculateBollo);
  });
});