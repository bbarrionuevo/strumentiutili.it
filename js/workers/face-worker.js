// js/workers/face-worker.js — Detección facial biométrica con face-api.js y Comlink
// Versioni fissate: un aggiornamento della libreria non deve cambiare il comportamento senza verifica
importScripts('https://unpkg.com/comlink@4.4.2/dist/umd/comlink.js');
importScripts('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js');

// Safari meno recente non espone OffscreenCanvas nei Worker: in quel caso il rilevamento non può
// funzionare qui e va segnalato subito, altrimenti la chiamata resterebbe appesa per sempre e la
// pagina mostrerebbe lo spinner all'infinito. Il thread principale ha un percorso alternativo.
var supportaOffscreen = typeof OffscreenCanvas !== 'undefined';

// In un Web Worker non esistono document né HTMLCanvasElement: senza un ambiente esplicito face-api
// lancia «getEnv - environment is not defined» e l'inquadratura automatica non parte mai.
if (supportaOffscreen) faceapi.env.setEnv({
  Canvas: OffscreenCanvas,
  CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D,
  Image: class {},
  ImageData,
  Video: class {},
  createCanvasElement: () => new OffscreenCanvas(1, 1),
  createImageElement: () => { throw new Error('createImageElement non disponibile nel worker'); },
  createVideoElement: () => { throw new Error('createVideoElement non disponibile nel worker'); },
  fetch: (url, init) => fetch(url, init),
  readFile: () => { throw new Error('readFile non disponibile nel worker'); }
});

let modelsLoaded = false;

const faceService = {
  async loadModels() {
    if (!supportaOffscreen) throw new Error('OffscreenCanvas non disponibile in questo browser.');
    if (modelsLoaded) return true;
    const modelUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
    await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
    modelsLoaded = true;
    return true;
  },

  async detectFace(imageData) {
    if (!supportaOffscreen) throw new Error('OffscreenCanvas non disponibile in questo browser.');
    await this.loadModels();

    // Recrear la imagen en una canvas fuera de pantalla (OffscreenCanvas)
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    const tutti = await faceapi
      .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }))
      .withFaceLandmarks();

    if (!tutti || !tutti.length) return null;

    // Si lavora sul volto più grande: è il soggetto in primo piano
    const detection = tutti.reduce((piuGrande, corrente) => {
      const areaCorrente = corrente.detection.box.width * corrente.detection.box.height;
      const areaMaggiore = piuGrande.detection.box.width * piuGrande.detection.box.height;
      return areaCorrente > areaMaggiore ? corrente : piuGrande;
    }, tutti[0]);

    const landmarks = detection.landmarks;
    const jawOutline = landmarks.getJawOutline();
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const chinPoint = jawOutline[8];
    const leftEyeCenter = {
      x: leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length,
      y: leftEye.reduce((sum, p) => sum + p.y, 0) / leftEye.length
    };
    const rightEyeCenter = {
      x: rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length,
      y: rightEye.reduce((sum, p) => sum + p.y, 0) / rightEye.length
    };

    const avgEyeX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
    const avgEyeY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
    const eyeToChinDistance = Math.abs(chinPoint.y - avgEyeY);
    const estimatedHeadHeight = eyeToChinDistance * 2.2;

    return {
      avgEyeX,
      avgEyeY,
      estimatedHeadHeight,
      numeroVolti: tutti.length
    };
  }
};

Comlink.expose(faceService);