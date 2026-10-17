// Attachment file policy: which types are allowed, how big, and how they are served.
// Only raster images are ever rendered inline; everything else is download-only.

export type FileKind = 'image' | 'document';

export const MAX_FILES_PER_RECORD = 10;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Compression policy (shared by the browser optimiser and the server finalize step)
// ---------------------------------------------------------------------------

/** Long-edge target for stored images (px). Large enough that bills stay legible. */
export const IMAGE_MAX_EDGE = 2000;
/** Re-encode quality for lossy formats (jpeg/webp), 1–100. */
export const IMAGE_QUALITY = 82;
/** Images already below this size are left untouched. */
export const IMAGE_COMPRESS_MIN_BYTES = 400 * 1024;

/** Types we downscale + re-encode ourselves. GIF is excluded (re-encoding would drop animation). */
const COMPRESSIBLE_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** HEIC/HEIF: converted to JPEG first, then optimised. */
const HEIC_MIME = new Set(['image/heic', 'image/heif']);

/** The mime a HEIC/HEIF becomes once converted (a viewable JPEG). */
export const HEIC_OUTPUT_MIME = 'image/jpeg';

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

/** A still raster image we can downscale + re-encode (jpeg/png/webp). */
export function isCompressibleImage(mime: string): boolean {
  return COMPRESSIBLE_IMAGE_MIME.has(mime);
}

/** A HEIC/HEIF image, which must be converted before it can be stored as a viewable JPEG. */
export function isHeic(mime: string): boolean {
  return HEIC_MIME.has(mime);
}

/** True for a type the optimiser may rewrite (a compressible image, or HEIC to convert first). */
export function mayCompress(mime: string): boolean {
  return isCompressibleImage(mime) || isHeic(mime);
}

/**
 * Whether an image is worth re-encoding: larger than the byte floor, or wider/taller than the edge
 * cap. Pure so the browser and server paths agree and it is unit-testable.
 */
export function shouldCompressImage(input: {
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
}): boolean {
  if (!isCompressibleImage(input.mimeType)) return false;
  const longEdge = Math.max(input.width ?? 0, input.height ?? 0);
  return input.bytes > IMAGE_COMPRESS_MIN_BYTES || longEdge > IMAGE_MAX_EDGE;
}

/**
 * Output mime when re-encoding. WebP stays WebP; PNG stays PNG only when it carries transparency
 * (JPEG would flatten the alpha); everything else becomes JPEG.
 */
export function compressedImageMime(mime: string, hasAlpha = false): string {
  if (mime === 'image/webp') return 'image/webp';
  if (mime === 'image/png' && hasAlpha) return 'image/png';
  return 'image/jpeg';
}

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/**
 * Defence-in-depth content sniffing: checks the file's magic bytes against its declared type.
 * Text/spreadsheet types have no reliable signature and are treated as matching.
 */
export function sniffMatches(mime: string, bytes: Buffer): boolean {
  switch (mime) {
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/gif':
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]); // "GIF8"
    case 'image/webp':
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case 'application/pdf':
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]); // "%PDF"
    case 'image/heic':
    case 'image/heif':
      return startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
    default:
      return true;
  }
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
