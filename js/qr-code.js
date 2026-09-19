(function(){
  const typeSel = document.getElementById('qr-type');
  const inputs = document.getElementById('qr-inputs');
  const textArea = document.getElementById('qr-text');
  const color = document.getElementById('qr-color');
  const bg = document.getElementById('qr-bg');
  const sizeIn = document.getElementById('qr-size');
  const btnGen = document.getElementById('gen-qr');
  const preview = document.getElementById('qr-preview');
  const btnPng = document.getElementById('download-png');
  const btnSvg = document.getElementById('download-svg');
  let ultimoQR = null;
  // Margine bianco di 4 moduli richiesto dallo standard QR per una lettura affidabile
  const MARGINE_MODULI = 4;

  function buildPayload(){
    const type = (typeSel && typeSel.value) || 'text';
    const textVal = (textArea && textArea.value) || '';
    if (type === 'text') return textVal;
    if (type === 'url') return textVal;
    if (type === 'wifi') {
      // expect input: SSID|WPA|PASSWORD
      const parts = (textVal||'').split('|');
      // la password può contenere "|": tutto ciò che segue il secondo separatore è password
      const ssid = parts[0]||''; const auth = parts[1] || 'WPA'; const pass = parts.slice(2).join('|');
      // Formato WIFI: i caratteri \ ; , : " vanno preceduti da backslash, altrimenti il telefono legge un SSID o una password troncati
      const esc = (v) => String(v).replace(/([\\;,:"])/g, '\\$1');
      if (!pass || /^nopass$/i.test(auth)) return `WIFI:T:nopass;S:${esc(ssid)};;`;
      return `WIFI:T:${auth};S:${esc(ssid)};P:${esc(pass)};;`;
    }
    if (type === 'vcard') {
      // expect multiline vcard fields
      return textVal;
    }
    return textVal;
  }

  function renderQR(){
    if (!preview) return;
    const payload = buildPayload();
    const colorVal = (color && color.value) || '#000000';
    const bgVal = (bg && bg.value) || '#ffffff';
    const size = Math.max(64, Math.min(2000, Number((sizeIn && sizeIn.value))||256));
    preview.innerHTML = '';
    ultimoQR = null;
    try{ ultimoQR = new QRCode(preview, { text: payload || ' ', width: size, height: size, colorDark: colorVal, colorLight: bgVal, correctLevel: QRCode.CorrectLevel.H }); }catch(e){
      console.error('QR render failed', e);
      preview.innerHTML = '';
      const msg = document.createElement('span');
      msg.className = 'text-red-600 text-sm font-medium text-center';
      msg.textContent = 'Contenuto troppo lungo per un codice QR con correzione degli errori alta (livello H): riduci il testo o usa un link.';
      preview.appendChild(msg);
    }
  }

  btnGen && btnGen.addEventListener('click', ()=>{ renderQR(); });

  btnPng && btnPng.addEventListener('click', ()=>{
    if (!preview) return alert('Genera prima un QR.');
    const canvas = preview.querySelector('canvas');
    if (!canvas) return alert('Genera prima un QR.');
    // Copia con margine: il canvas della libreria non include la zona di rispetto
    const moduli = ultimoQR && ultimoQR._oQRCode ? ultimoQR._oQRCode.getModuleCount() : 25;
    const margine = Math.round(canvas.width / moduli * MARGINE_MODULI);
    const out = document.createElement('canvas');
    out.width = canvas.width + margine * 2; out.height = canvas.height + margine * 2;
    const ctx = out.getContext('2d');
    ctx.fillStyle = (bg && bg.value) || '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, margine, margine);
    const url = out.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = 'qr.png'; document.body.appendChild(a); a.click(); a.remove();
  });

  btnSvg && btnSvg.addEventListener('click', ()=>{
    if (!preview) return alert('Genera prima un QR.');
    const modello = ultimoQR && ultimoQR._oQRCode;
    if (!modello) return alert('Genera prima un QR.');
    // SVG vettoriale: un quadrato per ogni modulo scuro, scalabile senza perdita per la stampa
    const n = modello.getModuleCount();
    const lato = n + MARGINE_MODULI * 2;
    let percorso = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (modello.isDark(r, c)) percorso += `M${c + MARGINE_MODULI} ${r + MARGINE_MODULI}h1v1h-1z`;
      }
    }
    const px = Math.max(64, Math.min(2000, Number((sizeIn && sizeIn.value)) || 256));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lato} ${lato}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${lato}" height="${lato}" fill="${(bg && bg.value) || '#ffffff'}"/><path d="${percorso}" fill="${(color && color.value) || '#000000'}"/></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = u; a.download = 'qr.svg'; document.body.appendChild(a); a.click(); a.remove();
    // revoca differita: una revoca immediata può interrompere il download in alcuni browser
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  });

  // change input UI depending on type
  typeSel && typeSel.addEventListener('change', ()=>{
    const t = (typeSel && typeSel.value) || 'text';
    if (!textArea) return;
    if (t === 'wifi') {
      textArea.placeholder = 'Inserisci: SSID|WPA|PASSWORD (es. MyWiFi|WPA|mypass)';
    } else if (t === 'vcard') {
      textArea.placeholder = 'Inserisci vCard (es. BEGIN:VCARD\nFN:Mario Rossi\nTEL:+390123456\nEND:VCARD)';
    } else {
      textArea.placeholder = 'Testo o URL...';
    }
  });
})();