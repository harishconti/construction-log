import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { compressImage } from '../src/lib/compress';

/** A noisy photo-like JPEG (flat colours would compress to almost nothing and skew the assertions). */
async function noisyJpeg(width: number, height: number): Promise<Buffer> {
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

describe('compressImage (server backstop)', () => {
  it('downscales and shrinks a large JPEG to within the edge cap', async () => {
    const big = await noisyJpeg(3200, 2400);
    expect(big.length).toBeGreaterThan(400 * 1024);

    const out = await compressImage(big, 'image/jpeg');
    expect(out).not.toBeNull();
    expect(out!.mimeType).toBe('image/jpeg');
    expect(out!.bytes.length).toBeLessThan(big.length);

    const meta = await sharp(out!.bytes).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(2000);
  });

  it('leaves an already-small image untouched', async () => {
    const small = await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 10, g: 10, b: 10 } } })
      .jpeg()
      .toBuffer();
    expect(await compressImage(small, 'image/jpeg')).toBeNull();
  });

  it('ignores documents and GIFs (no re-encoding)', async () => {
    expect(await compressImage(Buffer.from('%PDF-1.7 ...'), 'application/pdf')).toBeNull();
    expect(await compressImage(Buffer.from('a,b,c'), 'text/csv')).toBeNull();
    expect(await compressImage(Buffer.from('GIF89a'), 'image/gif')).toBeNull();
  });

  it('returns null instead of throwing on undecodable bytes', async () => {
    expect(await compressImage(Buffer.from('not really a jpeg'), 'image/jpeg')).toBeNull();
  });
});
