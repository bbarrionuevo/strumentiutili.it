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

  function buildPayload(){
    const type = (typeSel && typeSel.value) || 'text';
    const textVal = (textArea && textArea.value) || '';
    if (type === 'text') return textVal;
    if (type === 'url') return textVal;
    if (type === 'wifi') {
      // expect input: SSID|WPA|PASSWORD
      const parts = (textVal||'').split('|');
      const ssid = parts[0]||''; const auth = parts[1] || 'WPA'; const pass = parts[2]||'';
      return `WIFI:T:${auth};S:${ssid};P:${pass};;`;
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
    try{ new QRCode(preview, { text: payload || ' ', width: size, height: size, colorDark: colorVal, colorLight: bgVal, correctLevel: QRCode.CorrectLevel.H }); }catch(e){ console.error('QR render failed', e); }
  }

  btnGen && btnGen.addEventListener('click', ()=>{ renderQR(); });

  btnPng && btnPng.addEventListener('click', ()=>{
    if (!preview) return alert('Genera prima un QR.');
    const canvas = preview.querySelector('canvas');
    if (!canvas) return alert('Genera prima un QR.');
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = 'qr.png'; document.body.appendChild(a); a.click(); a.remove();
  });

  btnSvg && btnSvg.addEventListener('click', ()=>{
    if (!preview) return alert('Genera prima un QR.');
    const canvas = preview.querySelector('canvas');
    if (!canvas) return alert('Genera prima un QR.');
    const url = canvas.toDataURL('image/png');
    // create SVG wrapper with embedded PNG (fallback)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${url}" width="${canvas.width}" height="${canvas.height}"/></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = u; a.download = 'qr.svg'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
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