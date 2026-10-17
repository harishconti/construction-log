// Minimal ambient types for `heic-convert` (it ships no declarations). Its default export decodes a
// HEIC/HEIF buffer to JPEG or PNG using a pure-JS WASM decoder — no native libheif needed.
declare module 'heic-convert' {
  export interface ConvertOptions {
    buffer: ArrayBuffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    /** 0–1, for JPEG output. */
    quality?: number;
  }
  export default function convert(options: ConvertOptions): Promise<ArrayBuffer>;
}
