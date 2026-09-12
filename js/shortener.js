(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const inputUrl = document.getElementById('url-input');
    const btnShorten = document.getElementById('btn-shorten');
    const resultBox = document.getElementById('result-box');
    const shortUrlDisplay = document.getElementById('short-url');
    const btnCopy = document.getElementById('btn-copy-url');

    // Opción Principal: Spoo.me (CORS nativo con Form Data)
    async function shortenWithSpoo(longUrl) {
      const formData = new URLSearchParams();
      formData.append('url', longUrl);

      const response = await fetch('https://spoo.me/', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      });

      if (!response.ok) throw new Error('Spoo.me HTTP Error');
      const data = await response.json();

      if (data && data.short_url) {
        return data.short_url;
      }
      throw new Error('Respuesta inválida de Spoo.me');
    }

    // Opción de Respaldo: CleanURI API
    async function shortenWithCleanUri(longUrl) {
      const formData = new URLSearchParams();
      formData.append('url', longUrl);

      const response = await fetch('https://cleanuri.com/api/v1/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      if (!response.ok) throw new Error('CleanURI HTTP Error');
      const data = await response.json();

      if (data && data.result_url) {
        return data.result_url;
      }
      throw new Error('Respuesta inválida de CleanURI');
    }

    btnShorten.addEventListener('click', async () => {
      const longUrl = inputUrl.value.trim();
      
      if (!longUrl || (!longUrl.startsWith('http://') && !longUrl.startsWith('https://'))) {
        alert('Inserisci un URL valido che inizia con http:// o https://');
        return;
      }

      btnShorten.disabled = true;
      btnShorten.textContent = 'Elaborazione...';
      resultBox.classList.add('hidden');

      let shortLink = null;

      try {
        shortLink = await shortenWithSpoo(longUrl);
      } catch (errPrimary) {
        try {
          shortLink = await shortenWithCleanUri(longUrl);
        } catch (errSecondary) {
          console.error('Servicios no disponibles:', errSecondary);
        }
      }

      if (shortLink) {
        shortUrlDisplay.value = shortLink;
        resultBox.classList.remove('hidden');
      } else {
        alert('Si è verificato un errore durante la generazione del link. Verifica che l\'URL sia corretto e riprova.');
      }

      btnShorten.disabled = false;
      btnShorten.textContent = 'Accorcia URL';
    });

    btnCopy.addEventListener('click', async () => {
      if (!shortUrlDisplay.value) return;
      
      try {
        await navigator.clipboard.writeText(shortUrlDisplay.value);
        const originalText = btnCopy.textContent;
        btnCopy.textContent = '✅ Copiato!';
        setTimeout(() => btnCopy.textContent = originalText, 2000);
      } catch (err) {
        console.error('Errore copia:', err);
      }
    });
  });
})();
