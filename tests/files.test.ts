import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_MAX_BYTES,
  IMAGE_MAX_BYTES,
  compressedImageMime,
  extensionFor,
  isAllowedMime,
  isCompressibleImage,
  isHeic,
  isViewable,
  kindFor,
  mayCompress,
  safeDownloadHeaders,
  sanitizeFilename,
  shouldCompressImage,
  sizeLimitFor,
  sniffMatches,
} from '../src/lib/files';

describe('file type allowlist', () => {
  it('allows raster images and the approved document set', () => {
    for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(isAllowedMime(m)).toBe(true);
    }
    for (const m of [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/heic',
      'image/heif',
    ]) {
      expect(isAllowedMime(m)).toBe(true);
    }
  });

  it('rejects active/dangerous and unknown types', () => {
    for (const m of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/javascript', 'application/zip']) {
      expect(isAllowedMime(m)).toBe(false);
    }
  });

  it('marks only raster images as inline-viewable', () => {
    expect(isViewable('image/png')).toBe(true);
    expect(isViewable('application/pdf')).toBe(false);
    expect(isViewable('image/heic')).toBe(false);
    expect(kindFor('image/png')).toBe('image');
    expect(kindFor('application/pdf')).toBe('document');
  });

  it('applies per-category size limits', () => {
    expect(sizeLimitFor('image/png')).toBe(IMAGE_MAX_BYTES);
    expect(sizeLimitFor('application/pdf')).toBe(DOCUMENT_MAX_BYTES);
  });

  it('maps known mime types to extensions', () => {
    expect(extensionFor('application/pdf')).toBe('pdf');
    expect(extensionFor('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('xlsx');
    expect(extensionFor('application/unknown')).toBe('bin');
  });
});

describe('sanitizeFilename', () => {
  it('strips path traversal and directories', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\bill.pdf')).toBe('bill.pdf');
  });

  it('removes quotes and control characters', () => {
    expect(sanitizeFilename('a"b.txt')).toBe('ab.txt');
    expect(sanitizeFilename('bad\u0000name.pdf')).toBe('badname.pdf');
  });

  it('falls back to a default and bounds length', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename(null)).toBe('file');
    expect(sanitizeFilename('x'.repeat(500)).length).toBe(200);
  });
});

describe('safeDownloadHeaders', () => {
  it('forces a non-inline, non-cacheable download', () => {
    const h = safeDownloadHeaders('report.pdf', 1234);
    expect(h['Content-Type']).toBe('application/octet-stream');
    expect(h['Content-Disposition']).toContain('attachment;');
    expect(h['Content-Disposition']).toContain("filename*=UTF-8''report.pdf");
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Cache-Control']).toBe('private, no-store');
    expect(h['Content-Length']).toBe('1234');
  });
});

describe('compression policy', () => {
  it('flags large or oversized images for compression', () => {
    expect(shouldCompressImage({ mimeType: 'image/jpeg', bytes: 5_000_000, width: 100, height: 100 })).toBe(true);
    expect(shouldCompressImage({ mimeType: 'image/jpeg', bytes: 100_000, width: 4000, height: 3000 })).toBe(true);
    expect(shouldCompressImage({ mimeType: 'image/jpeg', bytes: 100_000, width: 800, height: 600 })).toBe(false);
    expect(shouldCompressImage({ mimeType: 'application/pdf', bytes: 9_000_000, width: 1, height: 1 })).toBe(false);
  });

  it('excludes GIF from re-encoding but flags HEIC for conversion', () => {
    expect(isCompressibleImage('image/gif')).toBe(false);
    expect(isCompressibleImage('image/heic')).toBe(false);
    expect(isHeic('image/heic')).toBe(true);
    expect(isHeic('image/heif')).toBe(true);
    expect(mayCompress('image/heic')).toBe(true);
    expect(mayCompress('image/png')).toBe(true);
    expect(mayCompress('image/gif')).toBe(false);
    expect(mayCompress('application/pdf')).toBe(false);
  });

  it('preserves alpha only for PNG outputs', () => {
    expect(compressedImageMime('image/jpeg')).toBe('image/jpeg');
    expect(compressedImageMime('image/webp')).toBe('image/webp');
    expect(compressedImageMime('image/png', false)).toBe('image/jpeg');
    expect(compressedImageMime('image/png', true)).toBe('image/png');
  });
});

describe('sniffMatches', () => {
  const b = (...hex: number[]) => Buffer.from(hex);

  it('accepts correct magic bytes', () => {
    expect(sniffMatches('image/jpeg', b(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(sniffMatches('image/png', b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(sniffMatches('application/pdf', Buffer.from('%PDF-1.7'))).toBe(true);
    expect(sniffMatches('image/gif', Buffer.from('GIF89a'))).toBe(true);
  });

  it('rejects a mismatch (e.g. HTML declared as PNG)', () => {
    expect(sniffMatches('image/png', Buffer.from('<html>'))).toBe(false);
    expect(sniffMatches('application/pdf', Buffer.from('GIF89a'))).toBe(false);
  });

  it('treats text/spreadsheet types as matching (no signature)', () => {
    expect(sniffMatches('text/plain', Buffer.from('hello'))).toBe(true);
    expect(sniffMatches('text/csv', Buffer.from('a,b,c'))).toBe(true);
  });
});
