(function () {
  // Codici catastali degli Stati esteri (codice «Z») usati dall'Agenzia delle Entrate per il codice fiscale
  const STATI_ESTERI = Object.freeze({
    'AFGHANISTAN': 'Z200',
    'ALBANIA': 'Z100',
    'ALGERIA': 'Z301',
    'ANDORRA': 'Z101',
    'ANGOLA': 'Z302',
    'ARGENTINA': 'Z600',
    'ARMENIA': 'Z252',
    'AUSTRALIA': 'Z700',
    'AUSTRIA': 'Z102',
    'AZERBAIGIAN': 'Z253',
    'BAHREIN': 'Z204',
    'BANGLADESH': 'Z249',
    'BELGIO': 'Z103',
    'BIELORUSSIA': 'Z139',
    'BOLIVIA': 'Z601',
    'BOSNIA ERZEGOVINA': 'Z153',
    'BRASILE': 'Z602',
    'BULGARIA': 'Z104',
    'BURKINA FASO': 'Z354',
    'CAMBOGIA': 'Z208',
    'CAMERUN': 'Z306',
    'CANADA': 'Z401',
    'CILE': 'Z603',
    'CINA': 'Z210',
    'CITTA\' DEL VATICANO': 'Z106',
    'COLOMBIA': 'Z604',
    'COREA DEL SUD': 'Z213',
    'COSTA D\'AVORIO': 'Z313',
    'COSTA RICA': 'Z503',
    'CROAZIA': 'Z149',
    'CUBA': 'Z504',
    'DANIMARCA': 'Z107',
    'ECUADOR': 'Z605',
    'EGITTO': 'Z336',
    'EL SALVADOR': 'Z506',
    'EMIRATI ARABI UNITI': 'Z215',
    'ERITREA': 'Z368',
    'ESTONIA': 'Z144',
    'ETIOPIA': 'Z315',
    'FILIPPINE': 'Z216',
    'FINLANDIA': 'Z109',
    'FRANCIA': 'Z110',
    'GABON': 'Z316',
    'GAMBIA': 'Z317',
    'GEORGIA': 'Z254',
    'GERMANIA': 'Z112',
    'GHANA': 'Z318',
    'GIAPPONE': 'Z219',
    'GIORDANIA': 'Z220',
    'GRECIA': 'Z115',
    'GUATEMALA': 'Z509',
    'GUINEA': 'Z319',
    'HAITI': 'Z510',
    'HONDURAS': 'Z511',
    'INDIA': 'Z222',
    'INDONESIA': 'Z223',
    'IRAN': 'Z224',
    'IRAQ': 'Z225',
    'IRLANDA': 'Z116',
    'ISLANDA': 'Z117',
    'ISRAELE': 'Z226',
    'KAZAKISTAN': 'Z255',
    'KENYA': 'Z322',
    'KOSOVO': 'Z160',
    'KUWAIT': 'Z227',
    'LEBANON': 'Z229',
    'LETTONIA': 'Z145',
    'LIBANO': 'Z229',
    'LIBIA': 'Z326',
    'LIECHTENSTEIN': 'Z119',
    'LITUANIA': 'Z146',
    'LUSSEMBURGO': 'Z120',
    'MACEDONIA DEL NORD': 'Z148',
    'MALI': 'Z329',
    'MALTA': 'Z121',
    'MAROCCO': 'Z330',
    'MESSICO': 'Z514',
    'MOLDAVIA': 'Z140',
    'MOLDOVA': 'Z140',
    'MONACO': 'Z123',
    'MONGOLIA': 'Z233',
    'MONTENEGRO': 'Z159',
    'NEPAL': 'Z234',
    'NIGERIA': 'Z335',
    'NORVEGIA': 'Z125',
    'NUOVA ZELANDA': 'Z719',
    'PAESI BASSI': 'Z126',
    'PAKISTAN': 'Z236',
    'PANAMA': 'Z516',
    'PARAGUAY': 'Z610',
    'PERU': 'Z611',
    'POLONIA': 'Z127',
    'PORTOGALLO': 'Z128',
    'REGNO UNITO': 'Z114',
    'REPUBBLICA CECA': 'Z156',
    'REPUBBLICA DOMINICANA': 'Z505',
    'ROMANIA': 'Z129',
    'RUSSIA': 'Z154',
    'SAN MARINO': 'Z130',
    'SENEGAL': 'Z343',
    'SERBIA': 'Z158',
    'SINGAPORE': 'Z248',
    'SIRIA': 'Z240',
    'SLOVACCHIA': 'Z155',
    'SLOVENIA': 'Z150',
    'SOMALIA': 'Z345',
    'SPAGNA': 'Z131',
    'SRI LANKA': 'Z209',
    'STATI UNITI D\'AMERICA': 'Z404',
    'SUDAN': 'Z348',
    'SVEZIA': 'Z132',
    'SVIZZERA': 'Z133',
    'TUNISIA': 'Z352',
    'TURCHIA': 'Z243',
    'UCRAINA': 'Z138',
    'UGANDA': 'Z353',
    'UNGHERIA': 'Z134',
    'URUGUAY': 'Z613',
    'VENEZUELA': 'Z614',
    'VIETNAM': 'Z251',
    'ZAMBIA': 'Z355'
  });
  const monthCodes = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'H', 7: 'L', 8: 'M', 9: 'P', 10: 'R', 11: 'S', 12: 'T' };
  const oddMap = {
    '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
    'A': 1, 'B': 0, 'C': 5, 'D': 7, 'E': 9, 'F': 13, 'G': 15, 'H': 17, 'I': 19, 'J': 21,
    'K': 2, 'L': 4, 'M': 18, 'N': 20, 'O': 11, 'P': 3, 'Q': 6, 'R': 8, 'S': 12, 'T': 14,
    'U': 16, 'V': 10, 'W': 22, 'X': 25, 'Y': 24, 'Z': 23
  };
  const evenMap = {
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6, 'H': 7, 'I': 8, 'J': 9,
    'K': 10, 'L': 11, 'M': 12, 'N': 13, 'O': 14, 'P': 15, 'Q': 16, 'R': 17, 'S': 18, 'T': 19,
    'U': 20, 'V': 21, 'W': 22, 'X': 23, 'Y': 24, 'Z': 25
  };
  const checkChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const omocodiaMap = { '0': 'L', '1': 'M', '2': 'N', '3': 'P', '4': 'Q', '5': 'R', '6': 'S', '7': 'T', '8': 'U', '9': 'V' };
  const omocodiaReverse = Object.fromEntries(Object.entries(omocodiaMap).map(([k, v]) => [v, k]));
  // Posizioni numeriche (anno, giorno, numero del codice comune): l'indice 11 è la lettera del codice catastale e non va convertito
  const omocodiaDigitPositions = [6, 7, 9, 10, 12, 13, 14];

  function normalizeOmocodiaDigits(code) {
    const chars = String(code || '').toUpperCase().split('');
    for (const pos of omocodiaDigitPositions) {
      if (omocodiaReverse[chars[pos]]) {
        chars[pos] = omocodiaReverse[chars[pos]];
      }
    }
    return chars.join('');
  }

  function sanitizeTextInput(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^A-Za-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeName(str) {
    if (!str) return '';
    const s = sanitizeTextInput(str);
    return s.replace(/\s+/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  }

  function onlyConsonants(str) {
    return (normalizeName(str) || '').replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, '');
  }

  function onlyVowels(str) {
    return (normalizeName(str) || '').replace(/[^AEIOU]/g, '');
  }

  function threeLettersSurname(surname) {
    const s = normalizeName(surname);
    if (!s) return 'XXX';
    const cons = onlyConsonants(s);
    const vowels = onlyVowels(s);
    if (cons.length >= 3) return cons.slice(0, 3);
    return (cons + vowels + 'XXX').slice(0, 3);
  }

  function threeLettersName(name) {
    const s = normalizeName(name);
    if (!s) return 'XXX';
    const cons = onlyConsonants(s);
    const vowels = onlyVowels(s);
    if (cons.length >= 4) return (cons[0] + cons[2] + cons[3]);
    return (cons + vowels + 'XXX').slice(0, 3);
  }

  function parseDateParts(dateInput) {
    if (!dateInput) return null;
    const raw = String(dateInput).trim();
    if (!raw) return null;

    let year, month, day;
    if (raw.includes('-')) {
      const parts = raw.split('-');
      if (parts.length !== 3) return null;
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (raw.includes('/')) {
      const parts = raw.split('/');
      if (parts.length !== 3) return null;
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    } else {
      return null;
    }

    if ([year, month, day].some((value) => Number.isNaN(value))) return null;
    if (month < 1 || month > 12) return null;
    const maxDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const leapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const maxAllowed = month === 2 && leapYear ? 29 : maxDays[month - 1];
    if (day < 1 || day > maxAllowed) return null;

    return { year, month, day };
  }

  function computeControl(cf15) {
    let sum = 0;
    const base = String(cf15 || '').toUpperCase();
    for (let i = 0; i < base.length; i++) {
      const ch = base[i];
      if ((i + 1) % 2 === 1) {
        sum += oddMap[ch] || 0;
      } else {
        sum += evenMap[ch] || 0;
      }
    }
    return checkChars[sum % 26];
  }

  function buildComuneLookup(data) {
    const map = {};
    const list = [];
    if (!Array.isArray(data)) return { map, list };
    data.forEach((item) => {
      const name = item && (item.nome || item.name);
      const code = item && (item.codiceCatastale || item.codice || item.code);
      if (!name || !code) return;
      const rawName = sanitizeTextInput(name).toUpperCase();
      const codeUpper = String(code).trim().toUpperCase();
      map[rawName] = codeUpper;
      list.push({ name: rawName, upName: rawName, code: codeUpper });
    });
    list.sort((a, b) => a.upName.localeCompare(b.upName));
    return { map, list };
  }

  function buildStatiEsteriList() {
    return Object.entries(STATI_ESTERI)
      .map(([name, code]) => ({ name: String(name).trim().toUpperCase(), upName: String(name).trim().toUpperCase(), code: String(code).trim().toUpperCase() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function resolveStatoEsteroKey(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const normalized = raw.toUpperCase();
    const exact = STATI_ESTERI[normalized];
    if (exact) return exact;
    const matches = Object.entries(STATI_ESTERI).find(([name]) => name === normalized || name.replace(/['’]/g, '') === normalized.replace(/['’]/g, ''));
    return matches ? matches[1] : null;
  }

  function resolveComuneCode(comuneInput, explicitMap) {
    if (!comuneInput) return 'Z000';
    const input = String(comuneInput).trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(input)) {
      // Input looks like a 4-char code; accept it only if it matches a known codice catastale
      const knownMap = explicitMap || window.COMUNI_MAP || window.comuniMap || {};
      const knownCodes = Object.values(knownMap || {}).map(v => String(v).toUpperCase());
      const knownForeign = Object.values(STATI_ESTERI || {}).map(v => String(v).toUpperCase());
      if (knownCodes.includes(input) || knownForeign.includes(input)) return input;
      // otherwise treat as a name (example: 'ROMA') and continue lookup
    }

    const targetMap = explicitMap || window.COMUNI_MAP || window.comuniMap || {};
    if (targetMap[input]) return targetMap[input];

    const normalized = normalizeName(input);
    for (const key in targetMap) {
      if (normalizeName(key) === normalized) return targetMap[key];
    }

    const list = window.comuniList || [];
    const found = list.find((item) => {
      const name = String(item.name || item.nome || '').trim().toUpperCase();
      return name === input || normalizeName(name) === normalized;
    });
    if (found) return String(found.code || found.codiceCatastale || found.codice || 'Z000').toUpperCase();

    // Stato estero digitato per nome anche se l'elenco dei comuni non è ancora caricato
    const estero = resolveStatoEsteroKey(input);
    if (estero) return estero;

    return 'Z000';
  }

  function generateCodiceFiscale(nome, cognome, dateISO, sesso, comune) {
    const parsed = parseDateParts(dateISO);
    if (!parsed) return null;

    const safeNome = sanitizeTextInput(nome);
    const safeCognome = sanitizeTextInput(cognome);
    // Un codice catastale digitato (es. H501, Z129) va conservato: la sanitizzazione eliminerebbe le cifre
    const comuneGrezzo = String(comune || '').trim();
    const safeComune = /^[A-Za-z]\d{3}$/.test(comuneGrezzo) ? comuneGrezzo.toUpperCase() : sanitizeTextInput(comune);

    const s1 = threeLettersSurname(safeCognome);
    const s2 = threeLettersName(safeNome);
    const year = String(parsed.year).slice(-2);
    const month = monthCodes[parsed.month];
    let day = parsed.day;
    if (String(sesso || '').toUpperCase() === 'F') day += 40;
    const dayStr = String(day).padStart(2, '0');
    const comuneCode = resolveComuneCode(safeComune, window.COMUNI_MAP || window.comuniMap || null);
    const partial = (s1 + s2 + year + month + dayStr + comuneCode).toUpperCase();
    return (partial + computeControl(partial)).toUpperCase();
  }

  function validateCodiceFiscale(cf) {
    if (!cf || !/^[A-Z0-9]{16}$/.test(String(cf).toUpperCase())) {
      return { valid: false };
    }

    const upper = String(cf).toUpperCase();
    const givenControl = upper[15];
    const base15 = upper.slice(0, 15);

    const expected = computeControl(base15);
    if (expected === givenControl) {
      return { valid: true, canonical: base15 + expected };
    }

    const candidate = normalizeOmocodiaDigits(base15);
    if (candidate !== base15) {
      const expected2 = computeControl(candidate);
      if (expected2 === givenControl) {
        return { valid: true, canonical: candidate + expected2 };
      }
    }

    return { valid: false };
  }

  /**
   * Decodificatore Inverso del Codice Fiscale (client-side)
   * Restituisce data di nascita (ISO), sesso, età esatta e codice catastale + nome comune/stato
   */
  function parseCodiceFiscaleReverse(cf) {
    if (!cf || !/^[A-Z0-9]{16}$/.test(String(cf).toUpperCase())) return null;
    const upper = String(cf).toUpperCase();
    const normalized = normalizeOmocodiaDigits(upper);
    const yearDigits = normalized.slice(6, 8); // pos 7-8
    const monthChar = normalized[8]; // pos 9
    const dayStr = normalized.slice(9, 11); // pos 10-11
    const comuneCode = normalized.slice(11, 15); // pos 12-15

    const yy = parseInt(yearDigits, 10);
    const today = new Date();
    const currentFullYear = today.getFullYear();
    const currentYY = currentFullYear % 100;
    let century = currentFullYear - currentYY;
    if (yy > currentYY) century -= 100; // assume person born in previous century if yy greater than current yy
    const fullYear = century + yy;

    // month mapping reverse
    const monthMapRev = Object.fromEntries(Object.entries(monthCodes).map(([k,v])=>[v, Number(k)]));
    const month = monthMapRev[monthChar] || null;
    let day = parseInt(dayStr, 10);
    let sex = 'M';
    if (!Number.isNaN(day)){
      if (day > 40) { sex = 'F'; day = day - 40; } else { sex = 'M'; }
    }

    if (!month || Number.isNaN(day) || Number.isNaN(fullYear)) return null;

    // build birth date ISO
    const mm = String(month).padStart(2,'0');
    const dd = String(day).padStart(2,'0');
    const birthIso = `${fullYear}-${mm}-${dd}`;

    // exact age calculation
    const birthDate = new Date(`${fullYear}-${mm}-${dd}T00:00:00`);
    let ageYears = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) ageYears--;

    const diffMs = Math.abs(today - birthDate);
    const diffDays = Math.floor(diffMs / (1000*60*60*24));
    const exactYears = Math.floor(diffDays / 365.2425);
    const monthsApprox = Math.floor((diffDays - exactYears*365.2425) / 30.436875);

    // lookup comune/stato name
    let comuneName = null;
    let isForeign = false;
    const list = window.comuniList || [];
    const found = list.find(it => String(it.code || it.codice || it.codiceCatastale || '').toUpperCase() === comuneCode);
    if (found) {
      comuneName = found.name || found.nome || null;
      isForeign = (String(comuneCode).startsWith('Z'));
    } else if (STATI_ESTERI) {
      // reverse lookup in STATI_ESTERI
      const entry = Object.entries(STATI_ESTERI).find(([,c]) => String(c).toUpperCase() === comuneCode);
      if (entry) { comuneName = entry[0]; isForeign = true; }
    }

    return {
      codice: upper,
      birthIso,
      birth: { year: fullYear, month, day },
      age: ageYears,
      ageExact: { years: exactYears, months: monthsApprox, days: diffDays },
      sex,
      comuneCode,
      comuneName: comuneName || null,
      isForeign
    };
  }

  const api = {
    STATI_ESTERI,
    parseDateParts,
    monthCodes,
    oddMap,
    evenMap,
    checkChars,
    omocodiaMap,
    omocodiaReverse,
    normalizeOmocodiaDigits,
    normalizeName,
    onlyConsonants,
    onlyVowels,
    threeLettersSurname,
    threeLettersName,
    computeControl,
    buildComuneLookup,
    buildStatiEsteriList,
    resolveStatoEsteroKey,
    resolveComuneCode,
    parseCodiceFiscaleReverse,
    generateCodiceFiscale,
    validateCodiceFiscale
  };

  window.CodiceFiscale = api;
  window.generateCodiceFiscale = generateCodiceFiscale;
  window.validateCodiceFiscale = validateCodiceFiscale;
  window.computeControl = computeControl;
  window.normalizeName = normalizeName;
  window.resolveComuneCode = resolveComuneCode;
})();
