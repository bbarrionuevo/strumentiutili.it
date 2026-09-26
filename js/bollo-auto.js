// js/bollo-auto.js — Motore di calcolo Bollo e Superbollo 2026 (Zero-Backend)
document.addEventListener('DOMContentLoaded', async () => {
  const inputKw = document.getElementById('calc-kw');
  const inputEuro = document.getElementById('calc-euro');
  const inputRegione = document.getElementById('calc-regione');
  const inputImmatricolazione = document.getElementById('calc-anno');
  // max="2026" scritto nella pagina sarebbe diventato sbagliato a gennaio
  if (inputImmatricolazione) inputImmatricolazione.max = String(new Date().getFullYear() + 1);
  
  const outBollo = document.getElementById('res-bollo');
  const outSuperbollo = document.getElementById('res-superbollo');
  const outTotale = document.getElementById('res-totale');
  
  let regoleBollo = null;

  try {
    const data = await window.StrumentiData.getRegoleFiscali();
    if (!data) throw new Error('Regole fiscali non disponibili.');
    regoleBollo = data.bollo_auto_2026;
    calculateBollo();
  } catch (err) {
    console.error("Errore nel caricamento delle regole fiscali:", err);
    // Senza tariffe non c'e' niente da calcolare: lo si dice, invece di
    // lasciare gli importi a zero come se fossero un risultato.
    const box = document.getElementById("res-origine");
    if (box) {
      box.className = "mt-3 text-[11px] leading-snug text-amber-300";
      box.textContent = "Non sono riuscito a caricare le tariffe. Controlla la connessione e ricarica la pagina.";
    }
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
      // Se la Regione non ha tariffe proprie caricate si ricade su quelle
      // nazionali. Prima succedeva in silenzio: la pagina prometteva un calcolo
      // regionale e mostrava un numero nazionale. Adesso il ripiego si dichiara.
      // "nazionale" non e' una Regione: e' la tariffa di riferimento, usata
      // finche' non se ne sceglie una.
      const propria = regione && regione !== "nazionale" ? regoleBollo.regioni[regione] : null;
      const regioneData = propria || regoleBollo.regioni["nazionale"];
      const conTariffaPropria = (regoleBollo.regioni_con_tariffa_propria || []).indexOf(regione) !== -1;
      mostraOrigine(!regione ? "da_scegliere" : propria ? "regionale" : (conTariffaPropria ? "nazionale_provvisoria" : "nazionale"));
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

    // Dice quale tariffa e stata usata. Per le Regioni che hanno tariffe
    // proprie non ancora caricate e un avviso: il numero e indicativo.
    function mostraOrigine(origine) {
      const box = document.getElementById("res-origine");
      if (!box) return;
      if (origine === "regionale") {
        box.className = "mt-3 text-[11px] leading-snug text-gray-300";
        box.textContent = "Importo calcolato con le tariffe deliberate da questa Regione (o Provincia autonoma).";
        return;
      }
      if (origine === "da_scegliere") {
        box.className = "mt-3 text-[11px] leading-snug text-amber-300";
        box.textContent = "Scegli la Regione di residenza: l’importo qui sopra usa la tariffa nazionale di riferimento, che alcune Regioni aumentano.";
        return;
      }
      if (origine === "nazionale") {
        box.className = "mt-3 text-[11px] leading-snug text-gray-300";
        box.textContent = "Questa Regione applica le tariffe nazionali di riferimento.";
        return;
      }
      box.className = "mt-3 text-[11px] leading-snug text-amber-300";
      box.innerHTML = "Attenzione: questa Regione delibera tariffe proprie che non abbiamo ancora caricato. " +
        "L’importo qui sopra usa la tariffa nazionale ed è quindi indicativo: verificalo sul " +
        "<a href=\"https://online.aci.it/acinet/calcolobollo/\" target=\"_blank\" rel=\"noopener nofollow\" class=\"underline\">calcolatore ACI</a>.";
    }

  // Event Listeners
  const inputs = [inputKw, inputEuro, inputRegione, inputImmatricolazione];
  inputs.forEach(inp => {
    if(inp) inp.addEventListener('input', calculateBollo);
  });
});