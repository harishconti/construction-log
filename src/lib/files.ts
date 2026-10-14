// Attachment file policy: which types are allowed, how big, and how they are served.
// Only raster images are ever rendered inline; everything else is download-only.

export type FileKind = 'image' | 'document';

export const MAX_FILES_PER_RECORD = 10;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Raster images safe to render inline in the browser. */
const VIEWABLE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Allowed but never rendered inline (served as an attachment). HEIC included but not viewable. */
const DOCUMENT_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'image/heic',
  'image/heif',
]);

export const ALLOWED_MIME: readonly string[] = [...VIEWABLE_MIME, ...DOCUMENT_MIME];

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export function isAllowedMime(mime: string): boolean {
  return VIEWABLE_MIME.has(mime) || DOCUMENT_MIME.has(mime);
}

export function isViewable(mime: string): boolean {
  return VIEWABLE_MIME.has(mime);
}

export function kindFor(mime: string): FileKind {
  return isViewable(mime) ? 'image' : 'document';
}

export function sizeLimitFor(mime: string): number {
  return isViewable(mime) ? IMAGE_MAX_BYTES : DOCUMENT_MAX_BYTES;
}

export function extensionFor(mime: string): string {
  return EXT_BY_MIME[mime] ?? 'bin';
}

/** Strips directories, path separators, quotes and control characters; bounds length. */
export function sanitizeFilename(name: string | null | undefined): string {
  const base = (name ?? '').split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["'\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return cleaned || 'file';
}

function asciiFallback(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return ascii || 'file';
}

/**
 * Response headers for a download: forced octet-stream attachment with a sanitized filename,
 * nosniff, and no caching. Content bytes are whatever the user uploaded, so they must never be
 * rendered inline.
 */
export function safeDownloadHeaders(filename: string, size?: number | null): Record<string, string> {
  const safe = sanitizeFilename(filename);
  return {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${asciiFallback(safe)}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    ...(typeof size === 'number' ? { 'Content-Length': String(size) } : {}),
  };
}
