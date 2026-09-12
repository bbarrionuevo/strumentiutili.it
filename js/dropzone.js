// js/dropzone.js — utility condivisa per zone di trascinamento e selezione file
// Risolve il bug mobile (iOS/Android) in cui il selettore di file non si apre:
// la causa più comune è una doppia invocazione sincrona di input.click() quando
// il pulsante "sfoglia" è annidato dentro la dropzone (il click bubbla e viene
// gestito due volte) oppure quando l'input è avvolto in una <label> nativa che
// apre già il picker da sola. Questo modulo centralizza la logica con una guardia
// anti-doppio-click e senza bloccare lo scroll nativo su touch.
(function () {
  function resolveEl(value) {
    if (!value) return null;
    return typeof value === 'string' ? document.getElementById(value) : value;
  }

  function setFilesOnInput(input, files) {
    if (!input || !files) return;
    try {
      const dt = new DataTransfer();
      for (let i = 0; i < files.length; i += 1) dt.items.add(files[i]);
      Object.defineProperty(input, 'files', { value: dt.files, writable: false, configurable: true });
    } catch (e) {
      // Alcuni browser non permettono di riassegnare FileList: fallback su proprietà privata
      input._files = files;
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function getInputFiles(input) {
    if (!input) return [];
    if (input.files && input.files.length) return input.files;
    if (input._files && input._files.length) return input._files;
    return [];
  }

  function setupDropzone(options) {
    const opts = options || {};
    const drop = resolveEl(opts.drop);
    const input = resolveEl(opts.input);
    const browse = resolveEl(opts.browse);
    const filenameEl = resolveEl(opts.filename);
    const onFiles = typeof opts.onFiles === 'function' ? opts.onFiles : null;

    if (!drop || !input) return null;

    // Guardia anti-doppio-click: su iOS Safari due chiamate sincrone a input.click()
    // possono aprire e richiudere immediatamente il selettore file, dando la falsa
    // impressione che "non succeda nulla" al tocco.
    let pickerGuard = false;
    function openPicker(event) {
      if (event) event.stopPropagation();
      if (pickerGuard) return;
      pickerGuard = true;
      input.click();
      window.setTimeout(() => { pickerGuard = false; }, 400);
    }

    drop.addEventListener('click', openPicker);
    if (browse) browse.addEventListener('click', openPicker);

    function updateFilenameLabel() {
      if (!filenameEl) return;
      const files = getInputFiles(input);
      if (files && files.length > 1) filenameEl.textContent = `${files.length} file selezionati`;
      else filenameEl.textContent = (files && files[0]) ? files[0].name : '';
    }

    input.addEventListener('change', () => {
      updateFilenameLabel();
      if (onFiles) onFiles(getInputFiles(input));
    });

    // Drag & drop (desktop): previene solo qui, non sui touch, per non bloccare lo scroll
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('ring-2', 'ring-indigo-300');
    }));
    ['dragleave', 'dragend'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('ring-2', 'ring-indigo-300');
    }));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('ring-2', 'ring-indigo-300');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) setFilesOnInput(input, files);
    });

    // Feedback visivo touch: SOLO passivo, nessun preventDefault, per non interferire
    // con lo scroll nativo della pagina su mobile.
    drop.addEventListener('touchstart', () => { drop.classList.add('bg-gray-100'); }, { passive: true });
    ['touchend', 'touchcancel'].forEach((ev) => {
      drop.addEventListener(ev, () => { drop.classList.remove('bg-gray-100'); }, { passive: true });
    });

    return {
      setFiles: (files) => setFilesOnInput(input, files),
      updateFilenameLabel,
      getFiles: () => getInputFiles(input)
    };
  }

  window.StrumentiDropzone = {
    setup: setupDropzone,
    setFilesOnInput,
    getInputFiles
  };
})();
