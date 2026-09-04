(function(){
  const input = document.getElementById('img-input-cv');
  const convertBtn = document.getElementById('convert-btn');
  const targetSel = document.getElementById('target-format');
  const qualityEl = document.getElementById('quality');
  const progress = document.getElementById('convert-progress');
  const results = document.getElementById('convert-results');

  function setStatus(t){ if (progress) progress.textContent = t; }

  async function convertFile(file, targetType, quality){
    return new Promise((resolve, reject)=>{
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async ()=>{
        try{
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img,0,0);
          // toBlob conversion
          const q = Math.max(0.1, Math.min(1, (quality||80)/100));
          canvas.toBlob((blob)=>{
            URL.revokeObjectURL(url);
            if (!blob) return reject(new Error('Conversione fallita'));
            resolve(blob);
          }, targetType, q);
        }catch(e){ URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = (e)=>{ URL.revokeObjectURL(url); reject(new Error('Immagine non valida')); };
      img.src = url;
    });
  }

  convertBtn && convertBtn.addEventListener('click', async ()=>{
    if (!input || !input.files || !input.files.length) { setStatus('Seleziona almeno una immagine'); return; }
    const target = (targetSel && targetSel.value) || 'image/webp';
    const q = Number((qualityEl && qualityEl.value) || 80);
    if (results) results.innerHTML = '';
    setStatus('Conversione in corso...');
    for (const f of Array.from(input.files)){
      try{
        const before = f.size;
        const blob = await convertFile(f, target, q);
        const after = blob.size;
        const pct = Math.round(((before - after)/before) * 100);
        const url = URL.createObjectURL(blob);
        const card = document.createElement('div'); card.className='p-3 border rounded bg-white flex items-center gap-3';
        const img = document.createElement('img'); img.src = url; img.style.maxWidth='120px'; img.style.maxHeight='80px';
        const info = document.createElement('div');
        info.innerHTML = `<div class="font-semibold">${f.name}</div><div class="text-sm">Prima: ${(before/1024).toFixed(1)} KB — Dopo: ${(after/1024).toFixed(1)} KB (${pct}% risparmio)</div>`;
        const dl = document.createElement('a'); dl.href = url; dl.className='ml-auto btn btn-primary'; dl.download = (f.name.replace(/\.[^.]+$/, '') + '.' + (target.split('/')[1] || 'out')) ; dl.textContent='Scarica';
        // revoke object URL shortly after initiating download to free memory
        dl.addEventListener('click', ()=>{ setTimeout(()=>{ try{ URL.revokeObjectURL(url); }catch(e){} }, 1000); });
        card.appendChild(img); card.appendChild(info); card.appendChild(dl);
        if (results) results.appendChild(card);
      }catch(e){
        console.error('Convert error', e);
        if (results){
          const err = document.createElement('div');
          err.className='text-sm text-red-600';
          const message = window.StrumentiErrors
            ? window.StrumentiErrors.friendlyErrorMessage(e, `Errore convertendo ${f.name}.`)
            : `Errore convertendo ${f.name}`;
          err.textContent = message;
          results.appendChild(err);
        }
      }
    }
    setStatus('Conversione completata.');
  });
})();