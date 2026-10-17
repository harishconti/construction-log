// Server-side image optimisation, used as a backstop at finalize. This guarantees a compressed
// object even when the browser optimiser was skipped (older client, WASM blocked by CSP, a client
// that bypassed it entirely). Documents, GIFs and already-small images are left untouched.
//
// Two decoders are needed: `sharp` (libvips) handles jpeg/png/webp, but its prebuilt binaries
// deliberately exclude HEIC because HEVC is patent-encumbered — so HEIC/HEIF is decoded with a
// pure-JS WASM decoder instead. PDFs are NOT compressed here: real PDF re-compression needs
// Ghostscript, which the Vercel serverless runtime does not provide.
import sharp from 'sharp';
import {
  HEIC_OUTPUT_MIME,
  IMAGE_MAX_EDGE,
  IMAGE_QUALITY,
  isCompressibleImage,
  isHeic,
  shouldCompressImage,
} from './files';

export type CompressedImage = { bytes: Buffer; mimeType: string };

/**
 * Optimises an image buffer, returning the replacement bytes + mime, or `null` when there is nothing
 * to do (a document/GIF, an already-small image, or any failure — optimisation must never break an
 * upload).
 */
export async function compressImage(bytes: Buffer, mimeType: string): Promise<CompressedImage | null> {
  try {
    if (isHeic(mimeType)) {
      const jpeg = await convertHeicToJpeg(bytes);
      // Converted HEIC is always stored as viewable JPEG; try to shrink it further if it is large.
      return (await optimizeRaster(jpeg, HEIC_OUTPUT_MIME)) ?? { bytes: jpeg, mimeType: HEIC_OUTPUT_MIME };
    }
    if (isCompressibleImage(mimeType)) return await optimizeRaster(bytes, mimeType);
    return null;
  } catch {
    return null;
  }
}

async function optimizeRaster(bytes: Buffer, mimeType: string): Promise<CompressedImage | null> {
  const image = sharp(bytes, { failOn: 'none' });
  const meta = await image.metadata();
  if (!shouldCompressImage({ mimeType, bytes: bytes.length, width: meta.width, height: meta.height })) {
    return null;
  }

  const resized = image.resize({
    width: IMAGE_MAX_EDGE,
    height: IMAGE_MAX_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const outMime = mimeType === 'image/webp' ? 'image/webp' : mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  const out =
    outMime === 'image/png'
      ? await resized.png({ compressionLevel: 9, effort: 7 }).toBuffer()
      : outMime === 'image/webp'
        ? await resized.webp({ quality: IMAGE_QUALITY }).toBuffer()
        : await resized.jpeg({ quality: IMAGE_QUALITY, mozjpeg: true }).toBuffer();

  // Never replace an object with a larger one.
  if (out.length >= bytes.length) return null;
  return { bytes: out, mimeType: outMime };
}

async function convertHeicToJpeg(bytes: Buffer): Promise<Buffer> {
  const { default: convert } = await import('heic-convert');
  const out = await convert({ buffer: bytes, format: 'JPEG', quality: IMAGE_QUALITY / 100 });
  return Buffer.from(out as ArrayBuffer);
}
