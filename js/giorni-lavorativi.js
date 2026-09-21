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

    // Imposta le date di default (Oggi e Oggi + 30 giorni)
    const today = new Date();
    startDateInput.value = today.toISOString().split('T')[0];
    
    const nextMonth = new Date(today);
    nextMonth.setDate(today.getDate() + 30);
    endDateInput.value = nextMonth.toISOString().split('T')[0];

    // Algoritmo di Computus per la Pasquetta (Lunedì dell'Angelo)
    function getPasquetta(year) {
      const a = year % 19;
      const b = Math.floor(year / 100);
      const c = year % 100;
      const d = Math.floor(b / 4);
      const e = b % 4;
      const f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3);
      const h = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4);
      const k = c % 4;
      const l = (32 + 2 * e + 2 * i - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // Mese 0-indicizzato in JS
      const day = ((h + l - 7 * m + 114) % 31) + 1;
      
      // Pasquetta è il giorno successivo a Pasqua
      const pasquetta = new Date(year, month, day + 1);
      return pasquetta;
    }

    // Festività nazionali fisse in Italia
    const fixedHolidays = [
      "01-01", // Capodanno
      "06-01", // Epifania
      "25-04", // Liberazione
      "01-05", // Lavoratori
      "02-06", // Repubblica
      "15-08", // Ferragosto
      "01-11", // Tutti i Santi
      "08-12", // Immacolata Concezione
      "25-12", // Natale
      "26-12"  // S.Stefano
    ];

    function calculateDays() {
      if (!startDateInput.value || !endDateInput.value) return;

      const start = new Date(startDateInput.value);
      const end = new Date(endDateInput.value);

      // Resetta i contatori
      let totalDays = 0;
      let workingDays = 0;
      let weekendCount = 0;
      let holidayCount = 0;

      if (start > end) {
        resWorkingDays.textContent = "0";
        resTotalDays.textContent = "0";
        resWeekendDays.textContent = "0";
        resHolidayDays.textContent = "0";
        return;
      }

      const excludeWeekends = chkWeekends.checked;
      const excludeHolidays = chkHolidays.checked;
      
      const patronD = patronDay.value ? parseInt(patronDay.value, 10) : null;
      const patronM = patronMonth.value ? parseInt(patronMonth.value, 10) : null;

      // Cache della Pasquetta per anno
      const pasquettaCache = {};

      let current = new Date(start);
      // Azzera orario per calcolo pulito
      current.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      while (current <= end) {
        totalDays++;
        let isWeekend = false;
        let isHoliday = false;

        const dayOfWeek = current.getDay(); // 0 = Domenica, 6 = Sabato
        const dd = String(current.getDate()).padStart(2, '0');
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const year = current.getFullYear();
        const dateString = `${dd}-${mm}`;

        // Controllo Weekend
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          isWeekend = true;
          if (excludeWeekends) weekendCount++;
        }

        // Controllo Festività
        if (excludeHolidays) {
          // Festività fisse
          if (fixedHolidays.includes(dateString)) {
            isHoliday = true;
          }

          // Festività mobile (Pasquetta)
          if (!pasquettaCache[year]) {
            pasquettaCache[year] = getPasquetta(year);
          }
          const pasq = pasquettaCache[year];
          if (current.getTime() === pasq.getTime()) {
            isHoliday = true;
          }

          // Santo Patrono (se non è già festivo o weekend per evitare doppi conteggi)
          if (patronD && patronM) {
            if (current.getDate() === patronD && (current.getMonth() + 1) === patronM) {
              isHoliday = true;
            }
          }

          if (isHoliday) {
            // Contiamo la festività solo se non è caduta nel weekend (o se non stiamo escludendo i weekend)
            if (!isWeekend || !excludeWeekends) {
               holidayCount++;
            }
          }
        }

        // Se dobbiamo escludere i weekend e questo giorno è weekend, non è lavorativo
        const dropForWeekend = excludeWeekends && isWeekend;
        // Se dobbiamo escludere i festivi e questo giorno è festivo, non è lavorativo
        const dropForHoliday = excludeHolidays && isHoliday;

        if (!dropForWeekend && !dropForHoliday) {
          workingDays++;
        }

        // Avanza al giorno successivo
        current.setDate(current.getDate() + 1);
      }

      // Aggiorna l'interfaccia
      resTotalDays.textContent = totalDays;
      resWorkingDays.textContent = workingDays;
      resWeekendDays.textContent = weekendCount;
      resHolidayDays.textContent = holidayCount;
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