(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const pwdDisplay = document.getElementById('pwd-display');
    const lengthSlider = document.getElementById('pwd-length');
    const lengthVal = document.getElementById('length-val');
    
    const chkUpper = document.getElementById('chk-upper');
    const chkLower = document.getElementById('chk-lower');
    const chkNumbers = document.getElementById('chk-numbers');
    const chkSymbols = document.getElementById('chk-symbols');
    const chkExclude = document.getElementById('chk-exclude');
    
    const btnGenerate = document.getElementById('btn-generate');
    const btnCopy = document.getElementById('btn-copy');

    const chars = {
      upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      lower: 'abcdefghijklmnopqrstuvwxyz',
      numbers: '0123456789',
      symbols: '!@#$%^&*()_+~`|}{[]:;?><,./-='
    };

    const ambiguous = ['i', 'l', '1', 'L', 'o', '0', 'O'];

    function generatePassword() {
      let charSet = '';
      if (chkUpper.checked) charSet += chars.upper;
      if (chkLower.checked) charSet += chars.lower;
      if (chkNumbers.checked) charSet += chars.numbers;
      if (chkSymbols.checked) charSet += chars.symbols;

      if (charSet === '') {
        pwdDisplay.textContent = 'Seleziona un set di caratteri';
        pwdDisplay.classList.replace('text-emerald-400', 'text-red-500');
        return;
      }

      if (chkExclude.checked) {
        ambiguous.forEach(char => {
          charSet = charSet.split(char).join('');
        });
      }

      const length = parseInt(lengthSlider.value, 10);
      const array = new Uint32Array(length);
      window.crypto.getRandomValues(array);

      let password = '';
      for (let i = 0; i < length; i++) {
        password += charSet[array[i] % charSet.length];
      }

      pwdDisplay.textContent = password;
      pwdDisplay.classList.replace('text-red-500', 'text-emerald-400');
    }

    lengthSlider.addEventListener('input', (e) => {
      lengthVal.textContent = `${e.target.value} caratteri`;
      generatePassword();
    });

    [chkUpper, chkLower, chkNumbers, chkSymbols, chkExclude].forEach(chk => {
      chk.addEventListener('change', generatePassword);
    });

    btnGenerate.addEventListener('click', generatePassword);

    btnCopy.addEventListener('click', async () => {
      const pwd = pwdDisplay.textContent;
      if (pwd === 'Seleziona un set di caratteri') return;
      
      try {
        await navigator.clipboard.writeText(pwd);
        const originalText = btnCopy.textContent;
        btnCopy.textContent = '✅ Copiato!';
        setTimeout(() => btnCopy.textContent = originalText, 2000);
      } catch (err) {
        console.error('Errore copia:', err);
      }
    });

    // Auto-genera all'avvio
    generatePassword();
  });
})();