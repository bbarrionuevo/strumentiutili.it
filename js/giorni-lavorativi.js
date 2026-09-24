(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const chkWeekends = document.getElementById('chk-weekends');
    const chkHolidays = document.getElementById('chk-holidays');
    const patronDay = document.getElementById('patron-day');
    const patronMonth = document.getElementById('patron-month');

    const resWorkingDays = document.getElementById('res-working-days');
    const resTotalDays = document.getElementById('res-total-days');
    const resWeekendDays = document.getElementById('res-weekend-days');
    const resHolidayDays = document.getElementById('res-holiday-days');

    // Popola select del giorno (1-31)
    for (let i = 1; i <= 31; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = i;
      patronDay.appendChild(option);
    }

    // Date iniziali: oggi e fra 30 giorni, nel fuso del dispositivo. Prima si
    // usava toISOString(), che e' in UTC: in Italia fra mezzanotte e l'una
    // (le due con l'ora legale) "oggi" diventava ieri.
    const oggi = window.Festivita.oggi();
    startDateInput.value = oggi;
    endDateInput.value = window.Festivita.aggiungi(oggi, 30);

    // Il conteggio e le festivita' (compreso il 4 ottobre, di nuovo festivo
    // dal 2026) stanno in js/festivita.js, provato nei test.
    function calculateDays() {
      if (!startDateInput.value || !endDateInput.value) return;

      const patronD = patronDay.value ? parseInt(patronDay.value, 10) : null;
      const patronM = patronMonth.value ? parseInt(patronMonth.value, 10) : null;
      const patrono = patronD && patronM
        ? { md: String(patronM).padStart(2, '0') + '-' + String(patronD).padStart(2, '0'), nome: 'Santo patrono' }
        : null;

      const r = window.Festivita.contaGiorni(startDateInput.value, endDateInput.value, {
        escludiWeekend: chkWeekends.checked,
        escludiFestivi: chkHolidays.checked,
        patrono: patrono
      }) || { totali: 0, lavorativi: 0, weekend: 0, festivi: 0 };

      resTotalDays.textContent = r.totali;
      resWorkingDays.textContent = r.lavorativi;
      resWeekendDays.textContent = r.weekend;
      resHolidayDays.textContent = r.festivi;
    }

    // Event Listeners
    const inputs = [startDateInput, endDateInput, chkWeekends, chkHolidays, patronDay, patronMonth];
    inputs.forEach(input => {
      input.addEventListener('change', calculateDays);
      if(input.type !== 'checkbox') input.addEventListener('input', calculateDays);
    });

    // Calcolo Iniziale
    calculateDays();

  });
})();