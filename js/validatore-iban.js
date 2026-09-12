(function () {
  // Super Dizionario ABI - Copertura massiva del mercato italiano
  const ABI_MAP = {
    '03069': 'Intesa Sanpaolo',
    '02008': 'UniCredit',
    '07601': 'Poste Italiane',
    '05034': 'Banco BPM',
    '03111': 'BPER Banca',
    '01030': 'Banca Monte dei Paschi di Siena (MPS)',
    '01005': 'Banca Nazionale del Lavoro (BNL / BNP Paribas)',
    '06230': 'Crédit Agricole Italia',
    '03015': 'FinecoBank',
    '03332': 'Credem (Credito Emiliano)',
    '08883': 'Banca Mediolanum',
    '03268': 'Banca Sella',
    '03396': 'Banca Popolare di Sondrio',
    '03062': 'Banca Generali',
    '03493': 'Banca IFIS',
    '03599': 'Banca Etica',
    '03440': 'Banco Desio e della Brianza',
    '05387': 'BPER Banca (ex Carige)',
    '08769': 'Cassa Depositi e Prestiti',
    '03140': 'Banca d\'Italia',
    '06045': 'Cassa di Risparmio di Bolzano (Sparkasse)',
    '03359': 'Banca Profilo',
    '07072': 'Banca Passadore',
    '03127': 'Banca Popolare Pugliese',
    '05424': 'Banca Popolare di Bari (BDM Banca)',
    '03368': 'Banca Sistema',
    '03104': 'Banca Popolare di Fondi',
    '03475': 'Banca Popolare del Cassinate',
    '08327': 'BCC di Milano',
    '08325': 'BCC di Roma',
    '08833': 'BCC di Napoli',
    '08453': 'BCC EmilBanca',
    '08430': 'BCC Centropadana',
    '08304': 'BCC ChiantiBanca',
    '03395': 'Illimity Bank',
    '03239': 'Banca Fideuram',
    '01010': 'Iccrea Banca',
    '03512': 'Banca d\'Alba',
    '03250': 'Banca di Credito Peloritano',
    '03110': 'Banca Popolare di Lajatico',
    '06083': 'Cassa di Risparmio di Parma e Piacenza',
    '06175': 'Cassa di Risparmio di Ravenna',
    '03058': 'CheBanca! / Mediobanca Premier',
    '03019': 'Compass Banca',
    '03138': 'Banca Popolare di Cortona',
    '03159': 'Banca di Cividale (Sparkasse)',
    '08968': 'Findomestic Banca',
    '03115': 'CA Auto Bank (ex FCA Bank)',
    '03384': 'Volkswagen Bank',
    '08990': 'N26 Bank (Succursale Italiana)',
    '08998': 'Revolut Bank (Succursale Italiana)',
    '03031': 'Banca Farmafactoring',
    '03103': 'Banca Popolare del Frusinate'
  };

  // Regole internazionali IBAN (Lunghezza esatta per paese)
  const IBAN_RULES = {
    'IT': { len: 27, name: 'Italia' },
    'DE': { len: 22, name: 'Germania' },
    'FR': { len: 27, name: 'Francia' },
    'ES': { len: 24, name: 'Spagna' },
    'GB': { len: 22, name: 'Regno Unito' },
    'CH': { len: 21, name: 'Svizzera' },
    'AT': { len: 20, name: 'Austria' },
    'BE': { len: 16, name: 'Belgio' },
    'NL': { len: 18, name: 'Paesi Bassi' },
    'PT': { len: 25, name: 'Portogallo' },
    'GR': { len: 27, name: 'Grecia' },
    'IE': { len: 22, name: 'Irlanda' },
    'LU': { len: 20, name: 'Lussemburgo' },
    'SM': { len: 27, name: 'San Marino' },
    'VA': { len: 22, name: 'Città del Vaticano' },
    'MC': { len: 27, name: 'Monaco' },
    'PL': { len: 28, name: 'Polonia' },
    'SE': { len: 28, name: 'Svezia' },
    'RO': { len: 28, name: 'Romania' }
  };

  function normalizeIban(value) {
    return String(value || '').replace(/\s+/g, '').toUpperCase();
  }

  function ibanToNumericString(iban) {
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let numeric = '';

    for (const ch of rearranged) {
      if (ch >= '0' && ch <= '9') {
        numeric += ch;
        continue;
      }
      if (ch >= 'A' && ch <= 'Z') {
        numeric += String(ch.charCodeAt(0) - 55);
        continue;
      }
      throw new Error("Carattere non valido nell'IBAN.");
    }

    return numeric;
  }

  function ibanMod97Check(iban) {
    try {
      const numericString = ibanToNumericString(iban);
      return BigInt(numericString) % 97n === 1n;
    } catch (error) {
      return false;
    }
  }

  function decomposeItalianIban(iban) {
    if (!/^IT\d{2}[A-Z][0-9]{5}[0-9]{5}[A-Z0-9]{12}$/.test(iban)) {
      return null;
    }

    return {
      paese: iban.slice(0, 2),
      controllo: iban.slice(2, 4),
      cin: iban[4],
      abi: iban.slice(5, 10),
      cab: iban.slice(10, 15),
      conto: iban.slice(15)
    };
  }

  function validateBIC(code) {
    const value = String(code || '').trim().toUpperCase();
    return /^[A-Z]{6}[A-Z2-9][A-NP-Z0-9](?:[A-Z0-9]{3})?$/.test(value) && (value.length === 8 || value.length === 11);
  }

  function renderIbanResult(iban) {
    const resultDiv = document.getElementById('iban-result');
    if (!resultDiv) return;

    if (!iban) {
      resultDiv.className = 'mt-4 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700';
      resultDiv.textContent = 'Inserisci un IBAN da controllare.';
      return;
    }

    // Controllo sintassi base
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) {
      resultDiv.className = 'mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700';
      resultDiv.textContent = 'Formato IBAN non plausibile (deve iniziare con 2 lettere, 2 numeri, e contenere solo caratteri alfanumerici).';
      return;
    }

    const countryCode = iban.slice(0, 2);
    const rule = IBAN_RULES[countryCode];

    // Controllo lunghezza specifica per paese (se noto)
    if (rule && iban.length !== rule.len) {
      resultDiv.className = 'mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700';
      resultDiv.textContent = `Errore di lunghezza: Un IBAN registrato in ${rule.name} deve essere lungo esattamente ${rule.len} caratteri (attuale: ${iban.length}).`;
      return;
    }

    // Controllo Matematico GLOBALE MOD-97
    if (!ibanMod97Check(iban)) {
      resultDiv.className = 'mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700';
      resultDiv.textContent = 'IBAN non valido: controllo matematico MOD 97-10 non superato (potrebbe esserci un errore di battitura).';
      return;
    }

    // Costruzione Output
    const countryName = rule ? rule.name : 'Internazionale (Sconosciuto)';
    let html = `<div class="font-semibold text-emerald-700">IBAN valido (${countryName})</div>`;
    html += '<div class="mt-2 text-sm text-gray-700">Il controllo matematico MOD 97-10 è stato eseguito correttamente.</div>';

    // Dettagli specifici se è Italiano
    if (countryCode === 'IT') {
      const parts = decomposeItalianIban(iban);
      if (parts) {
        const banca = ABI_MAP[parts.abi] || 'Istituto non presente nella mappa offline';
        html += '<dl class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 overflow-x-auto">';
        html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">Paese</dt><dd class="font-medium">${parts.paese} (Italia)</dd></div>`;
        html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">Check digits</dt><dd class="font-medium">${parts.controllo}</dd></div>`;
        html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">CIN</dt><dd class="font-medium">${parts.cin}</dd></div>`;
        html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">ABI</dt><dd class="font-medium">${parts.abi} — ${banca}</dd></div>`;
        html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">CAB</dt><dd class="font-medium">${parts.cab}</dd></div>`;
        html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">Conto</dt><dd class="font-medium">${parts.conto}</dd></div>`;
        html += '</dl>';
      }
    } else {
      // Dettagli base per IBAN Internazionali
      html += '<dl class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">';
      html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">Paese</dt><dd class="font-medium">${countryCode} (${countryName})</dd></div>`;
      html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">Lunghezza</dt><dd class="font-medium">${iban.length} caratteri</dd></div>`;
      html += '</dl>';
    }

    resultDiv.className = 'mt-4 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-gray-800';
    resultDiv.innerHTML = html;
  }

  function renderBicResult(bic) {
    const resultDiv = document.getElementById('bic-result');
    if (!resultDiv) return;

    if (!bic) {
      resultDiv.className = 'mt-4 rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700';
      resultDiv.textContent = 'Inserisci un codice BIC / SWIFT.';
      return;
    }

    const valid = validateBIC(bic);
    resultDiv.className = valid
      ? 'mt-4 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700'
      : 'mt-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700';
    resultDiv.textContent = valid
      ? 'BIC / SWIFT sintatticamente valido (8 oppure 11 caratteri).'
      : 'BIC / SWIFT non valido: verifica banca, paese, località e filiale.';
  }

  function bind() {
    if (typeof document === 'undefined') return;

    const ibanInput = document.getElementById('iban-input');
    const bicInput = document.getElementById('bic-input');
    const checkIban = document.getElementById('check-iban');
    const clearIban = document.getElementById('clear-iban');
    const checkBic = document.getElementById('check-bic');
    const clearBic = document.getElementById('clear-bic');

    if (checkIban) {
      checkIban.addEventListener('click', function () {
        renderIbanResult(normalizeIban(ibanInput && ibanInput.value));
      });
    }

    if (clearIban) {
      clearIban.addEventListener('click', function () {
        if (ibanInput) ibanInput.value = '';
        renderIbanResult('');
      });
    }

    if (checkBic) {
      checkBic.addEventListener('click', function () {
        renderBicResult(String(bicInput && bicInput.value || '').trim().toUpperCase());
      });
    }

    if (clearBic) {
      clearBic.addEventListener('click', function () {
        if (bicInput) bicInput.value = '';
        renderBicResult('');
      });
    }
  }

  const api = {
    ABI_MAP: ABI_MAP,
    IBAN_RULES: IBAN_RULES,
    normalizeIban: normalizeIban,
    ibanToNumericString: ibanToNumericString,
    ibanMod97Check: ibanMod97Check,
    decomposeItalianIban: decomposeItalianIban,
    validateBIC: validateBIC
  };

  window.IbanValidator = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  bind();
})();
