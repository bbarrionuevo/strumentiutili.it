// js/workers/scanner-worker.js — Motor de visión artificial OpenCV en segundo plano
importScripts('https://unpkg.com/comlink/dist/umd/comlink.js');
importScripts('https://unpkg.com/pdf-lib/dist/pdf-lib.min.js');

let cvReady = false;

// Configurar callback de inicialización de OpenCV en el Worker
self.Module = {
  onRuntimeInitialized() {
    cvReady = true;
  }
};

importScripts('https://docs.opencv.org/4.8.0/opencv.js');

const CONFIG = {
  detectionMaxDimension: 1200,
  minAreaRatio: 0.08,
  maxAreaRatio: 0.985,
  maxOutputWidth: 3000,
  maxOutputHeight: 4000,
  jpegQuality: 0.94
};

function imageDataToMat(imgData) {
  const mat = new cv.Mat(imgData.height, imgData.width, cv.CV_8UC4);
  mat.data.set(imgData.data);
  return mat;
}

function matToImageData(mat) {
  const imgMat = new cv.Mat();
  if (mat.channels() === 1) {
    cv.cvtColor(mat, imgMat, cv.COLOR_GRAY2RGBA);
  } else if (mat.channels() === 3) {
    cv.cvtColor(mat, imgMat, cv.COLOR_RGB2RGBA);
  } else {
    mat.copyTo(imgMat);
  }
  const imgData = new ImageData(new Uint8ClampedArray(imgMat.data), imgMat.cols, imgMat.rows);
  imgMat.delete();
  return imgData;
}

function orderPoints(points) {
  if (!points || points.length !== 4) return points || [];
  const pts = points.slice();
  const centerX = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const centerY = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;

  pts.sort((a, b) => Math.atan2(a.y - centerY, a.x - centerX) - Math.atan2(b.y - centerY, b.x - centerX));

  let startIndex = 0;
  let minSum = Infinity;
  for (let j = 0; j < pts.length; j++) {
    const sum = pts[j].x + pts[j].y;
    if (sum < minSum) { minSum = sum; startIndex = j; }
  }

  const ordered = [];
  for (let k = 0; k < 4; k++) { ordered.push(pts[(startIndex + k) % 4]); }
  return ordered;
}

function applyFilter(mat, filter) {
  if (filter === 'bw') {
    const gray = new cv.Mat(), background = new cv.Mat(), flat = new cv.Mat(), normalized = new cv.Mat(), result = new cv.Mat();
    try {
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, background, new cv.Size(51, 51), 0);
      cv.divide(gray, background, flat, 240);
      cv.normalize(flat, normalized, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
      cv.adaptiveThreshold(normalized, result, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 10);
      cv.cvtColor(result, mat, cv.COLOR_GRAY2RGBA);
    } finally {
      gray.delete(); background.delete(); flat.delete(); normalized.delete(); result.delete();
    }
  } else if (filter === 'grayscale') {
    const gray = new cv.Mat(), background = new cv.Mat(), flat = new cv.Mat();
    try {
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, background, new cv.Size(51, 51), 0);
      cv.divide(gray, background, flat, 235);
      cv.normalize(flat, flat, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
      cv.cvtColor(flat, mat, cv.COLOR_GRAY2RGBA);
    } finally {
      gray.delete(); background.delete(); flat.delete();
    }
  } else {
    const rgb = new cv.Mat(), ycrcb = new cv.Mat(), channels = new cv.MatVector();
    const background = new cv.Mat(), flat = new cv.Mat(), blurred = new cv.Mat(), sharp = new cv.Mat();
    try {
      cv.cvtColor(mat, rgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(rgb, ycrcb, cv.COLOR_RGB2YCrCb);
      cv.split(ycrcb, channels);
      const luminance = channels.get(0);
      cv.GaussianBlur(luminance, background, new cv.Size(51, 51), 0);
      cv.divide(luminance, background, flat, 235);
      cv.normalize(flat, flat, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
      cv.GaussianBlur(flat, blurred, new cv.Size(0, 0), 1.5);
      cv.addWeighted(flat, 1.20, blurred, -0.20, 0, sharp);
      channels.set(0, sharp);
      cv.merge(channels, ycrcb);
      cv.cvtColor(ycrcb, rgb, cv.COLOR_YCrCb2RGB);
      cv.cvtColor(rgb, mat, cv.COLOR_RGB2RGBA);
    } finally {
      rgb.delete(); ycrcb.delete(); channels.delete(); background.delete(); flat.delete(); blurred.delete(); sharp.delete();
    }
  }
}

const scannerService = {
  async isReady() {
    while (!cvReady) {
      await new Promise(r => setTimeout(r, 100));
    }
    return true;
  },

  async detectCorners(imageData) {
    if (!cvReady) return null;
    let src = null, small = null, gray = null, blurred = null, edges = null;
    try {
      src = imageDataToMat(imageData);
      const originalWidth = src.cols;
      const originalHeight = src.rows;
      const scale = Math.min(1, CONFIG.detectionMaxDimension / Math.max(originalWidth, originalHeight));
      const width = Math.max(1, Math.round(originalWidth * scale));
      const height = Math.max(1, Math.round(originalHeight * scale));

      small = new cv.Mat();
      cv.resize(src, small, new cv.Size(width, height), 0, 0, cv.INTER_AREA);

      gray = new cv.Mat();
      cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);

      blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

      edges = new cv.Mat();
      cv.Canny(blurred, edges, 50, 150, 3, false);

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      const imageArea = width * height;
      let bestCandidate = null;
      let maxArea = 0;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = Math.abs(cv.contourArea(contour));
        const areaRatio = area / imageArea;

        if (areaRatio >= CONFIG.minAreaRatio && areaRatio <= CONFIG.maxAreaRatio) {
          const perimeter = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, perimeter * 0.02, true);

          if (approx.rows === 4 && cv.isContourConvex(approx) && area > maxArea) {
            maxArea = area;
            const points = [];
            for (let p = 0; p < 4; p++) {
              points.push({
                x: approx.data32S[p * 2] / scale,
                y: approx.data32S[p * 2 + 1] / scale
              });
            }
            bestCandidate = orderPoints(points);
          }
          approx.delete();
        }
        contour.delete();
      }

      contours.delete();
      hierarchy.delete();

      return bestCandidate;
    } catch (e) {
      console.error('[Worker Scanner] Error detectCorners:', e);
      return null;
    } finally {
      if (src) src.delete(); if (small) small.delete(); if (gray) gray.delete(); if (blurred) blurred.delete(); if (edges) edges.delete();
    }
  },

  async processDocument(imageData, points, filter) {
    if (!cvReady) throw new Error("OpenCV not ready");
    let src = null, dst = null, sourcePoints = null, destinationPoints = null, transform = null;
    try {
      src = imageDataToMat(imageData);
      const ordered = orderPoints(points);
      const tl = ordered[0], tr = ordered[1], br = ordered[2], bl = ordered[3];

      const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
      let outputWidth = Math.round(Math.max(distance(tl, tr), distance(bl, br)));
      let outputHeight = Math.round(Math.max(distance(tl, bl), distance(tr, br)));

      outputWidth = Math.min(CONFIG.maxOutputWidth, Math.max(300, outputWidth));
      outputHeight = Math.min(CONFIG.maxOutputHeight, Math.max(300, outputHeight));

      sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outputWidth, 0, outputWidth, outputHeight, 0, outputHeight]);

      transform = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
      dst = new cv.Mat();

      cv.warpPerspective(src, dst, transform, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

      applyFilter(dst, filter);

      const processedImageData = matToImageData(dst);
      return Comlink.transfer(processedImageData, [processedImageData.data.buffer]);
    } finally {
      if (src) src.delete(); if (dst) dst.delete(); if (sourcePoints) sourcePoints.delete(); if (destinationPoints) destinationPoints.delete(); if (transform) transform.delete();
    }
  },

  async generatePdf(imageBuffers) {
    const pdfDocument = await PDFLib.PDFDocument.create();

    for (const bytes of imageBuffers) {
      const image = await pdfDocument.embedJpg(bytes);
      const landscape = image.width > image.height;
      const pageWidth = landscape ? 841.89 : 595.28;
      const pageHeight = landscape ? 595.28 : 841.89;

      const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;

      const page = pdfDocument.addPage([pageWidth, pageHeight]);
      page.drawImage(image, {
        x: (pageWidth - drawWidth) / 2,
        y: (pageHeight - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight
      });
    }

    const pdfBytes = await pdfDocument.save();
    return Comlink.transfer(pdfBytes.buffer, [pdfBytes.buffer]);
  }
};

Comlink.expose(scannerService);