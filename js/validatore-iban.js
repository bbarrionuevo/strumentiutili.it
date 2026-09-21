(function () {
  // Codici ABI delle principali banche, verificati su un elenco pubblico dei codici ABI (settembre 2026).
  // BancoPosta (07601) non è una banca ma usa un proprio codice ABI negli IBAN di Poste Italiane.
  const ABI_MAP = {
    '01005': 'Banca Nazionale del Lavoro (BNL)',
    '01015': 'Banco di Sardegna',
    '01030': 'Banca Monte dei Paschi di Siena (MPS)',
    '02008': 'UniCredit',
    '03015': 'FinecoBank',
    '03025': 'Banca Profilo',
    '03032': 'Credem (Credito Emiliano)',
    '03048': 'Banca del Piemonte',
    '03058': 'Mediobanca Premier (ex CheBanca!)',
    '03062': 'Banca Mediolanum',
    '03069': 'Intesa Sanpaolo',
    '03075': 'Banca Generali',
    '03104': 'Deutsche Bank',
    '03105': 'Volkswagen Bank',
    '03115': 'Findomestic Banca',
    '03158': 'Banca Sistema',
    '03205': 'Banca Ifis',
    '03239': 'Intesa Sanpaolo Private Banking',
    '03268': 'Banca Sella',
    '03296': 'Fideuram',
    '03332': 'Banca Passadore',
    '03365': 'Cherry Bank',
    '03426': 'Banca di Credito Peloritano',
    '03440': 'Banco di Desio e della Brianza',
    '03445': 'Crédit Agricole Auto Bank (ex FCA Bank)',
    '03669': 'Revolut Bank',
    '05000': 'BFF Bank',
    '05018': 'Banca Etica',
    '05034': 'Banco BPM',
    '05104': 'Banca Popolare del Lazio',
    '05116': 'Banca Valsabbina',
    '05232': 'Banca Popolare di Lajatico',
    '05262': 'Banca Popolare Pugliese',
    '05296': 'Banca Popolare di Fondi',
    '05297': 'Banca Popolare del Frusinate',
    '05372': 'Banca Popolare del Cassinate',
    '05387': 'BPER Banca',
    '05424': 'BdM Banca (ex Banca Popolare di Bari)',
    '05484': 'Banca di Cividale (CiviBank)',
    '05496': 'Banca Popolare di Cortona',
    '05696': 'Banca Popolare di Sondrio',
    '05856': 'Volksbank (Banca Popolare dell\'Alto Adige)',
    '06045': 'Cassa di Risparmio di Bolzano (Sparkasse)',
    '06085': 'Banca di Asti',
    '06230': 'Crédit Agricole Italia',
    '06270': 'La Cassa di Ravenna',
    '07072': 'Emil Banca',
    '07110': 'BCC di Napoli',
    '07601': 'Poste Italiane (BancoPosta)',
    '08000': 'Iccrea Banca',
    '08324': 'Banca Centropadana',
    '08327': 'Banca di Credito Cooperativo di Roma',
    '08453': 'BCC di Milano',
    '08673': 'ChiantiBanca',
    '19275': 'Compass Banca'
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
    // Svezia e Romania hanno IBAN di 24 caratteri: con 28 gli IBAN validi venivano rifiutati
    'SE': { len: 24, name: 'Svezia' },
    'RO': { len: 24, name: 'Romania' },
    'NO': { len: 15, name: 'Norvegia' },
    'DK': { len: 18, name: 'Danimarca' },
    'FI': { len: 18, name: 'Finlandia' },
    'CZ': { len: 24, name: 'Repubblica Ceca' },
    'SK': { len: 24, name: 'Slovacchia' },
    'SI': { len: 19, name: 'Slovenia' },
    'HR': { len: 21, name: 'Croazia' },
    'HU': { len: 28, name: 'Ungheria' },
    'BG': { len: 22, name: 'Bulgaria' },
    'LT': { len: 20, name: 'Lituania' },
    'LV': { len: 21, name: 'Lettonia' },
    'EE': { len: 20, name: 'Estonia' },
    'MT': { len: 31, name: 'Malta' },
    'CY': { len: 28, name: 'Cipro' },
    'IS': { len: 26, name: 'Islanda' },
    'LI': { len: 21, name: 'Liechtenstein' }
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

  // CIN italiano: carattere di controllo sulle coordinate nazionali (ABI + CAB + conto), pesi dispari/pari e modulo 26
  const CIN_PESI_DISPARI = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
  function computeItalianCin(abiCabConto) {
    const lettere = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let somma = 0;
    for (let i = 0; i < abiCabConto.length; i++) {
      const ch = abiCabConto[i];
      const valore = ch >= '0' && ch <= '9' ? Number(ch) : lettere.indexOf(ch);
      somma += i % 2 === 0 ? CIN_PESI_DISPARI[valore] : valore;
    }
    return lettere[somma % 26];
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
        const cinAtteso = computeItalianCin(parts.abi + parts.cab + parts.conto);
        html += '<dl class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 overflow-x-auto">';
        html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">Paese</dt><dd class="font-medium">${parts.paese} (Italia)</dd></div>`;
        html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">Check digits</dt><dd class="font-medium">${parts.controllo}</dd></div>`;
        html += `<div class="rounded border bg-white p-3"><dt class="text-xs text-gray-500">CIN</dt><dd class="font-medium">${parts.cin} ${cinAtteso === parts.cin ? '(coerente con ABI, CAB e conto)' : '(non coerente: atteso ' + cinAtteso + ')'}</dd></div>`;
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
    computeItalianCin: computeItalianCin,
    validateBIC: validateBIC
  };

  window.IbanValidator = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  bind();
})();
