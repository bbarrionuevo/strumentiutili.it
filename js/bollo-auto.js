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
    if (!regoleBollo || !window.BolloCalcolo) return;

    const annoImmatricolazione = parseInt(inputImmatricolazione.value) || new Date().getFullYear();
    const anniAnzianita = Math.max(0, new Date().getFullYear() - annoImmatricolazione);

    // Il conto e' in js/bollo-calcolo.js, lo stesso usato dalle guide e dai test.
    const r = window.BolloCalcolo.calcola({
      kw: inputKw.value,
      classe: inputEuro.value,
      regione: inputRegione.value,
      anni: anniAnzianita
    }, regoleBollo);

    // Se la Regione non ha tariffe proprie caricate si ricade su quelle
    // nazionali, e lo si dice: prima succedeva in silenzio.
    mostraOrigine(r.origine);

    const fmt = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    outBollo.textContent = fmt(r.bollo);
    outSuperbollo.textContent = fmt(r.superbollo);
    outTotale.textContent = fmt(r.totale);
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
      // origine === "nazionale_provvisoria": la Regione ha tariffe proprie non ancora caricate
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