// js/trascrizione.js — Controlador de Trascripción Audio con Comlink y Transferable Objects
document.addEventListener('DOMContentLoaded', () => {
  const audioInput = document.getElementById('audio-input');
  const fileNameDisplay = document.getElementById('file-name');
  const btnTranscribe = document.getElementById('btn-transcribe');
  
  const languageSelect = document.getElementById('language-select');
  const taskSelect = document.getElementById('task-select');

  const modelStatus = document.getElementById('model-status');
  const modelProgress = document.getElementById('model-progress');
  const transcriptionSpinner = document.getElementById('transcription-spinner');
  
  const resultArea = document.getElementById('transcription-result');
  const btnCopy = document.getElementById('btn-copy');
  const btnDownloadSrt = document.getElementById('btn-download-srt');

  let audioFile = null;
  let srtContent = '';
  let whisperWorker = null;

  audioInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    audioFile = file;
    fileNameDisplay.textContent = `File: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    fileNameDisplay.classList.remove('hidden');
    btnTranscribe.disabled = false;
  });

  async function readAndResampleAudio(file) {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const audioData = new Float32Array(length);
    
    if (numberOfChannels === 1) {
      audioData.set(audioBuffer.getChannelData(0));
    } else {
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      for (let i = 0; i < length; i++) {
        audioData[i] = (left[i] + right[i]) / 2;
      }
    }
    
    await audioCtx.close(); 
    return audioData;
  }

  function generateSRT(chunks) {
    let srt = '';
    chunks.forEach((chunk, index) => {
      const formatTime = (time) => {
        const date = new Date(0);
        date.setSeconds(time || 0);
        const hh = String(date.getUTCHours()).padStart(2, '0');
        const mm = String(date.getUTCMinutes()).padStart(2, '0');
        const ss = String(date.getUTCSeconds()).padStart(2, '0');
        const ms = String(Math.floor(((time || 0) % 1) * 1000)).padStart(3, '0');
        return `${hh}:${mm}:${ss},${ms}`;
      };

      const start = Array.isArray(chunk.timestamp) ? chunk.timestamp[0] : 0;
      const end = Array.isArray(chunk.timestamp) && chunk.timestamp[1] !== null ? chunk.timestamp[1] : start + 3;

      srt += `${index + 1}\n`;
      srt += `${formatTime(start)} --> ${formatTime(end)}\n`;
      srt += `${chunk.text.trim()}\n\n`;
    });
    return srt;
  }

  async function getWhisperWorker() {
    if (whisperWorker) return whisperWorker;
    const Comlink = await import('https://unpkg.com/comlink/dist/esm/comlink.mjs');
    const worker = new Worker('/js/workers/whisper-worker.js', { type: 'module' });
    const service = Comlink.wrap(worker);

    await service.initEnv(window.crossOriginIsolated, navigator.hardwareConcurrency || 2);

    whisperWorker = { service, Comlink };
    return whisperWorker;
  }

  function resetUI() {
    btnTranscribe.disabled = false;
    btnTranscribe.textContent = 'Avvia Trascrizione';
    transcriptionSpinner?.classList.add('hidden');
  }

  btnTranscribe?.addEventListener('click', async () => {
    if (!audioFile) return;

    btnTranscribe.disabled = true;
    btnTranscribe.textContent = 'Elaborazione in background...';
    transcriptionSpinner?.classList.remove('hidden');
    resultArea.value = '';
    srtContent = '';
    btnCopy.disabled = true;
    btnDownloadSrt.disabled = true;

    try {
      modelStatus.textContent = 'Lettura e ottimizzazione file audio...';
      const audioData = await readAndResampleAudio(audioFile);

      modelStatus.textContent = 'Inizializzazione motore AI...';
      const { service, Comlink } = await getWhisperWorker();

      modelStatus.textContent = 'Trascrizione neurale in corso... (UI fluida)';

      // TRANSFERIR EL BUFFER DE AUDIO SIN CLONAR MEMORIA (0ms overhead)
      const output = await service.transcribe(
        Comlink.transfer(audioData, [audioData.buffer]),
        languageSelect ? languageSelect.value : 'italian',
        taskSelect ? taskSelect.value : 'transcribe',
        Comlink.proxy((data) => {
          if (data.status === 'progress') {
            const progress = Math.round(data.progress);
            if (modelProgress) modelProgress.style.width = `${progress}%`;
            if (modelStatus) modelStatus.textContent = `Download Modello HD: ${progress}%`;
          } else if (data.status === 'done') {
            if (modelStatus) modelStatus.textContent = 'Modello HD pronto in memoria.';
            if (modelProgress) {
              modelProgress.style.width = '100%';
              modelProgress.classList.add('bg-emerald-500');
            }
          }
        })
      );

      resultArea.value = output.text.trim();
      if (output.chunks && output.chunks.length > 0) {
        srtContent = generateSRT(output.chunks);
        btnDownloadSrt.disabled = false;
      }
      modelStatus.textContent = 'Trascrizione completata con successo!';
      btnCopy.disabled = false;
      resetUI();

    } catch (error) {
      console.error(error);
      modelStatus.textContent = 'Errore durante la trascrizione.';
      resultArea.value = `Errore tecnico: ${error.message}`;
      resetUI();
    }
  });

  btnCopy?.addEventListener('click', async () => {
    if (!resultArea.value) return;
    try {
      await navigator.clipboard.writeText(resultArea.value);
      const originalText = btnCopy.textContent;
      btnCopy.textContent = '✅ Copiato!';
      setTimeout(() => btnCopy.textContent = originalText, 2000);
    } catch (err) {
      console.error(err);
    }
  });

  btnDownloadSrt?.addEventListener('click', () => {
    if (!srtContent) return;
    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Trascrizione_${Date.now()}.srt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
});