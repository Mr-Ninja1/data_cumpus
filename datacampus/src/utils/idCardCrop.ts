/**
 * Client-side ID card framing + auto-crop.
 * Crops to the on-screen guide, then tightens around the brightest
 * rectangular document region so background clutter is removed.
 */

export type CropRect = { x: number; y: number; w: number; h: number };

/** Standard student / credit-card aspect (~85.6 × 54 mm). */
export const ID_ASPECT = 1.586;

/** Guide rect centered in the video frame (normalized 0–1). */
export function guideRectNormalized(
  videoW: number,
  videoH: number,
  cover = 0.78
): CropRect {
  const maxW = videoW * cover;
  const maxH = videoH * cover;
  let w = maxW;
  let h = w / ID_ASPECT;
  if (h > maxH) {
    h = maxH;
    w = h * ID_ASPECT;
  }
  return {
    x: (videoW - w) / 2,
    y: (videoH - h) / 2,
    w,
    h,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Scan luminance inside a region and shrink to the document edges
 * by finding where brightness jumps (card vs darker desk/hand).
 */
export function tightenCrop(
  imageData: ImageData,
  seed: CropRect,
  pad = 8
): CropRect {
  const { width, height, data } = imageData;
  const x0 = clamp(Math.floor(seed.x), 0, width - 1);
  const y0 = clamp(Math.floor(seed.y), 0, height - 1);
  const x1 = clamp(Math.ceil(seed.x + seed.w), 1, width);
  const y1 = clamp(Math.ceil(seed.y + seed.h), 1, height);

  const lum = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  // Average luminance of the guide interior
  let sum = 0;
  let n = 0;
  const step = Math.max(2, Math.floor(Math.min(seed.w, seed.h) / 40));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      sum += lum(x, y);
      n++;
    }
  }
  const avg = n ? sum / n : 128;
  // Card surfaces are usually brighter than surrounding desk
  const threshold = Math.max(40, avg * 0.55);

  let left = x0;
  let right = x1 - 1;
  let top = y0;
  let bottom = y1 - 1;

  const colBright = (x: number) => {
    let bright = 0;
    let total = 0;
    for (let y = y0; y < y1; y += step) {
      total++;
      if (lum(x, y) >= threshold) bright++;
    }
    return total ? bright / total : 0;
  };

  const rowBright = (y: number) => {
    let bright = 0;
    let total = 0;
    for (let x = x0; x < x1; x += step) {
      total++;
      if (lum(x, y) >= threshold) bright++;
    }
    return total ? bright / total : 0;
  };

  const edgeCut = 0.18;
  while (left < right - 20 && colBright(left) < edgeCut) left += step;
  while (right > left + 20 && colBright(right) < edgeCut) right -= step;
  while (top < bottom - 20 && rowBright(top) < edgeCut) top += step;
  while (bottom > top + 20 && rowBright(bottom) < edgeCut) bottom -= step;

  const x = clamp(left - pad, 0, width - 1);
  const y = clamp(top - pad, 0, height - 1);
  const w = clamp(right - left + 1 + pad * 2, 1, width - x);
  const h = clamp(bottom - top + 1 + pad * 2, 1, height - y);

  // Keep roughly ID aspect so OCR gets a clean card crop
  const aspect = w / h;
  if (aspect > ID_ASPECT * 1.15) {
    const targetW = Math.round(h * ID_ASPECT);
    const dx = Math.floor((w - targetW) / 2);
    return { x: x + dx, y, w: targetW, h };
  }
  if (aspect < ID_ASPECT * 0.85) {
    const targetH = Math.round(w / ID_ASPECT);
    const dy = Math.floor((h - targetH) / 2);
    return { x, y: y + dy, w, h: targetH };
  }

  return { x, y, w, h };
}

/** Capture a video frame, crop to the ID guide, tighten, return a JPEG Blob. */
export async function captureAndCropId(
  video: HTMLVideoElement,
  quality = 0.92
): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Camera not ready");

  const canvas = document.createElement("canvas");
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.drawImage(video, 0, 0, vw, vh);
  const guide = guideRectNormalized(vw, vh);
  const full = ctx.getImageData(0, 0, vw, vh);
  const tight = tightenCrop(full, guide);

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(tight.w));
  out.height = Math.max(1, Math.round(tight.h));
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas unavailable");
  octx.drawImage(
    canvas,
    tight.x,
    tight.y,
    tight.w,
    tight.h,
    0,
    0,
    out.width,
    out.height
  );

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Capture failed"))),
      "image/jpeg",
      quality
    );
  });
}

/** Crop an uploaded still image to the centered ID guide + tighten. */
export async function cropStillToId(file: File, quality = 0.92): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const guide = guideRectNormalized(canvas.width, canvas.height, 0.92);
  const full = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tight = tightenCrop(full, guide);

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(tight.w));
  out.height = Math.max(1, Math.round(tight.h));
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas unavailable");
  octx.drawImage(
    canvas,
    tight.x,
    tight.y,
    tight.w,
    tight.h,
    0,
    0,
    out.width,
    out.height
  );

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))),
      "image/jpeg",
      quality
    );
  });
}
