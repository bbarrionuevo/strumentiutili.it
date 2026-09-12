(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    
    // Nodi DOM
    const radiosGender = document.querySelectorAll('input[name="gender"]');
    const inputAge = document.getElementById('input-age');
    const inputHeight = document.getElementById('input-height');
    const inputWeight = document.getElementById('input-weight');
    const selectActivity = document.getElementById('input-activity');

    const resBMR = document.getElementById('res-bmr');
    const resTDEE = document.getElementById('res-tdee');

    function calculateCalories() {
      // Otteniamo il valore del radio button selezionato
      let gender = 'male';
      radiosGender.forEach(radio => {
        if (radio.checked) gender = radio.value;
      });

      const age = parseInt(inputAge.value, 10);
      const height = parseFloat(inputHeight.value);
      const weight = parseFloat(inputWeight.value);
      const activityMultiplier = parseFloat(selectActivity.value);

      // Validazione basica (Se manca un campo, azzeriamo i risultati visuali in modo pulito)
      if (isNaN(age) || isNaN(height) || isNaN(weight) || age <= 0 || height <= 0 || weight <= 0) {
        resBMR.textContent = "0";
        resTDEE.textContent = "0";
        return;
      }

      // Applicazione Equazione di Mifflin-St Jeor
      let bmr = (10 * weight) + (6.25 * height) - (5 * age);
      
      if (gender === 'male') {
        bmr += 5;
      } else {
        bmr -= 161;
      }

      // Calcolo TDEE
      const tdee = bmr * activityMultiplier;

      // Aggiornamento DOM (arrotondamento all'intero più vicino)
      resBMR.textContent = Math.round(bmr).toLocaleString('it-IT');
      resTDEE.textContent = Math.round(tdee).toLocaleString('it-IT');
    }

    // Aggiungiamo i listener per intercettare qualsiasi cambiamento in tempo reale
    radiosGender.forEach(radio => radio.addEventListener('change', calculateCalories));
    inputAge.addEventListener('input', calculateCalories);
    inputHeight.addEventListener('input', calculateCalories);
    inputWeight.addEventListener('input', calculateCalories);
    selectActivity.addEventListener('change', calculateCalories);

  });
})();