// Client-only, best-effort image optimiser run before upload. It never throws: any failure (an
// undecodable format, a blocked WASM instantiation, an old browser) returns the original file so the
// upload still proceeds — the server re-compresses at finalize regardless.
//
// Note: HEIC/HEIF cannot be decoded by `createImageBitmap` in most browsers, so it is converted to
// JPEG first with a WASM decoder. That needs `'wasm-unsafe-eval'` in the CSP `script-src` directive.
import {
  HEIC_OUTPUT_MIME,
  IMAGE_COMPRESS_MIN_BYTES,
  IMAGE_MAX_EDGE,
  IMAGE_QUALITY,
  compressedImageMime,
  isCompressibleImage,
  isHeic,
} from './files';

const HEIC_EXT = /\.(heic|heif)$/i;

type Decodable = CanvasImageSource & { width: number; height: number; close?: () => void };

/** Returns an upload-ready file: the compressed version when it helps, otherwise the original. */
export async function compressForUpload(file: File): Promise<File> {
  try {
    const mime = (file.type || '').toLowerCase();
    if (isHeic(mime) || (mime === '' && HEIC_EXT.test(file.name))) {
      const converted = await convertHeic(file);
      return converted ? await shrinkRaster(converted, HEIC_OUTPUT_MIME) : file;
    }
    if (isCompressibleImage(mime)) return await shrinkRaster(file, mime);
    return file;
  } catch {
    return file;
  }
}

async function convertHeic(file: File): Promise<File | null> {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob: file, toType: HEIC_OUTPUT_MIME, quality: IMAGE_QUALITY / 100 });
  const blob = Array.isArray(out) ? out[0] : out;
  if (!blob || typeof blob.size !== 'number') return null;
  return new File([blob], replaceExt(file.name, 'jpg'), { type: HEIC_OUTPUT_MIME, lastModified: Date.now() });
}

async function shrinkRaster(file: File, mime: string): Promise<File> {
  const bitmap = await decodeImage(file);
  if (!bitmap) return file;
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const needsResize = longEdge > IMAGE_MAX_EDGE;
    if (!needsResize && file.size <= IMAGE_COMPRESS_MIN_BYTES) return file;

    const scale = needsResize ? IMAGE_MAX_EDGE / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const outMime = compressedImageMime(mime, mime === 'image/png' && hasTransparency(bitmap));
    const blob = await canvasToBlob(canvas, outMime, IMAGE_QUALITY / 100);
    // Never replace a file with a larger one.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], replaceExt(file.name, extForMime(outMime)), {
      type: outMime,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close?.();
  }
}

async function decodeImage(file: File): Promise<Decodable | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the <img> path */
    }
  }
  return decodeViaElement(file);
}

function decodeViaElement(file: File): Promise<Decodable | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Samples a 64×64 downscale for any non-opaque pixel, so a transparent PNG is not flattened to JPEG. */
function hasTransparency(bitmap: Decodable): boolean {
  try {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true;
    ctx.drawImage(bitmap, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
    return false;
  } catch {
    return true; // unknown — stay safe and keep PNG
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

function extForMime(mime: string): string {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
}

function replaceExt(name: string, ext: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200) || 'image';
  return `${base}.${ext}`;
}
