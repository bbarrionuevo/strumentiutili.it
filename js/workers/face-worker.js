// js/workers/face-worker.js — Detección facial biométrica con face-api.js y Comlink
importScripts('https://unpkg.com/comlink/dist/umd/comlink.js');
importScripts('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js');

let modelsLoaded = false;

const faceService = {
  async loadModels() {
    if (modelsLoaded) return true;
    const modelUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
    await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
    modelsLoaded = true;
    return true;
  },

  async detectFace(imageData) {
    await this.loadModels();

    // Recrear la imagen en una canvas fuera de pantalla (OffscreenCanvas)
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    const detection = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }))
      .withFaceLandmarks();

    if (!detection) return null;

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
      estimatedHeadHeight
    };
  }
};

Comlink.expose(faceService);