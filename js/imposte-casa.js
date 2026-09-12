// js/imposte-casa.js — Motore di calcolo Imposte Acquisto Casa 2026 (Zero-Backend)
document.addEventListener('DOMContentLoaded', async () => {
  const inVenditore = document.getElementById('calc-venditore');
  const inDestinazione = document.getElementById('calc-destinazione');
  const inCategoria = document.getElementById('calc-categoria');
  const inRendita = document.getElementById('calc-rendita');
  const inPrezzo = document.getElementById('calc-prezzo');
  const alertLusso = document.getElementById('alert-lusso');
  
  const outBase = document.getElementById('res-base');
  const outRegistro = document.getElementById('res-registro');
  const outIva = document.getElementById('res-iva');
  const outIpotecaria = document.getElementById('res-ipotecaria');
  const outCatastale = document.getElementById('res-catastale');
  const outTotale = document.getElementById('res-totale');
  
  let regole = null;

  try {
    const response = await fetch('/data/regole-fiscali-2026.json');
    const data = await response.json();
    regole = data.imposte_acquisto_casa_2026;
    calculateImposte();
  } catch (err) {
    console.error("Errore nel caricamento delle regole fiscali:", err);
  }

  function calculateImposte() {
    if (!regole) return;

    const venditore = inVenditore.value; // 'privato' o 'impresa'
    let destinazione = inDestinazione.value; // 'prima_casa' o 'seconda_casa'
    const categoria = inCategoria.value;
    const rendita = parseFloat(inRendita.value) || 0;
    const prezzo = parseFloat(inPrezzo.value) || 0;

    // Controllo Categorie di Lusso (A/1, A/8, A/9) - Disabilitano le agevolazioni Prima Casa
    if (regole.categorie_escluse_agevolazione.includes(categoria) && destinazione === 'prima_casa') {
      destinazione = 'seconda_casa'; // Forzatura legale
      alertLusso.classList.remove('hidden');
    } else {
      alertLusso.classList.add('hidden');
    }

    let baseImponibile = 0;
    let impostaRegistro = 0;
    let iva = 0;
    let impostaIpotecaria = 0;
    let impostaCatastale = 0;

    if (venditore === 'privato') {
      // Regime PREZZO-VALORE: Imposta di Registro
      const r_privato = regole.privato;
      const t_dest = destinazione === 'prima_casa' ? r_privato.prima_casa : r_privato.seconda_casa;
      
      baseImponibile = rendita * t_dest.coefficiente_totale; // Es: Rendita * 1.05 * 110
      
      // L'imposta di registro ha un minimo di legge di 1000€
      impostaRegistro = Math.max(r_privato.imposta_registro_minima, baseImponibile * t_dest.aliquota_registro);
      impostaIpotecaria = r_privato.imposta_ipotecaria_fissa;
      impostaCatastale = r_privato.imposta_catastale_fissa;
      iva = 0;

    } else if (venditore === 'impresa') {
      // Regime IVA
      const r_impresa = regole.impresa_costruttrice;
      baseImponibile = prezzo;

      let aliquotaIva = 0;
      if (destinazione === 'prima_casa') {
        aliquotaIva = r_impresa.prima_casa.aliquota_iva;
      } else {
        // Se è lusso applica 22%, altrimenti 10%
        aliquotaIva = regole.categorie_escluse_agevolazione.includes(categoria) 
                      ? r_impresa.seconda_casa.aliquota_iva_lusso 
                      : r_impresa.seconda_casa.aliquota_iva_standard;
      }

      iva = baseImponibile * aliquotaIva;
      impostaRegistro = r_impresa.imposta_registro_fissa; // 200€
      impostaIpotecaria = r_impresa.imposta_ipotecaria_fissa; // 200€
      impostaCatastale = r_impresa.imposta_catastale_fissa; // 200€
    }

    const totaleImposte = impostaRegistro + iva + impostaIpotecaria + impostaCatastale;

    // Rendering UI
    const fmt = val => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
    
    outBase.textContent = fmt(baseImponibile);
    outRegistro.textContent = fmt(impostaRegistro);
    outIva.textContent = fmt(iva);
    outIpotecaria.textContent = fmt(impostaIpotecaria);
    outCatastale.textContent = fmt(impostaCatastale);
    outTotale.textContent = fmt(totaleImposte);

    // UX: Evidenzia visivamente se la base è il prezzo o la rendita
    if (venditore === 'privato') {
      inRendita.parentElement.classList.add('ring-2', 'ring-indigo-100', 'bg-indigo-50/30', 'rounded-lg', 'p-2', '-m-2');
      inPrezzo.parentElement.classList.remove('ring-2', 'ring-indigo-100', 'bg-indigo-50/30', 'rounded-lg', 'p-2', '-m-2');
    } else {
      inPrezzo.parentElement.classList.add('ring-2', 'ring-indigo-100', 'bg-indigo-50/30', 'rounded-lg', 'p-2', '-m-2');
      inRendita.parentElement.classList.remove('ring-2', 'ring-indigo-100', 'bg-indigo-50/30', 'rounded-lg', 'p-2', '-m-2');
    }
  }

  // Event Listeners (Persistenza via storage-helper.js)
  const inputs = [inVenditore, inDestinazione, inCategoria, inRendita, inPrezzo];
  inputs.forEach(inp => { if(inp) inp.addEventListener('input', calculateImposte); });
});