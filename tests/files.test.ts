import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_MAX_BYTES,
  IMAGE_MAX_BYTES,
  extensionFor,
  isAllowedMime,
  isViewable,
  kindFor,
  safeDownloadHeaders,
  sanitizeFilename,
  sizeLimitFor,
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
