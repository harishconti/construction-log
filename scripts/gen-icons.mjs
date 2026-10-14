#!/usr/bin/env node
/**
 * Generates PWA PNG icons (dependency-free) into public/.
 * Simple brand mark: primary-blue tile with a white "ledger/house" glyph.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve(process.cwd(), 'public');
const BG = [0x1f, 0x4f, 0xd1, 0xff];
const FG = [0xff, 0xff, 0xff, 0xff];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter none
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function rect(px, size, x, y, w, h, color, radius = 0) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (i < 0 || j < 0 || i >= size || j >= size) continue;
      if (radius > 0) {
        // round the corners of the overall tile only (handled by caller)
      }
      const o = (j * size + i) * 4;
      px[o] = color[0];
      px[o + 1] = color[1];
      px[o + 2] = color[2];
      px[o + 3] = color[3];
    }
  }
}

function roundedTile(size, corner) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      let inside = true;
      const cxs = [corner, size - 1 - corner];
      const cys = [corner, size - 1 - corner];
      if (x < corner && y < corner) inside = (x - corner) ** 2 + (y - corner) ** 2 <= corner * corner;
      else if (x > size - 1 - corner && y < corner) inside = (x - cxs[1]) ** 2 + (y - corner) ** 2 <= corner * corner;
      else if (x < corner && y > size - 1 - corner) inside = (x - corner) ** 2 + (y - cys[1]) ** 2 <= corner * corner;
      else if (x > size - 1 - corner && y > size - 1 - corner)
        inside = (x - cxs[1]) ** 2 + (y - cys[1]) ** 2 <= corner * corner;
      if (inside) {
        px[o] = BG[0];
        px[o + 1] = BG[1];
        px[o + 2] = BG[2];
        px[o + 3] = BG[3];
      }
    }
  }
  return px;
}

/** A simple house glyph: roof (steps) + body + door. */
function drawHouse(px, size, scale) {
  const s = size * scale;
  const ox = (size - s) / 2;
  const oy = (size - s) / 2;
  const stroke = Math.max(2, Math.round(size * 0.055));

  // roof as a stepped triangle
  const roofH = s * 0.42;
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const w = s * (i + 1) / steps;
    const h = stroke;
    const x = ox + (s - w) / 2;
    const y = oy + (roofH * i) / steps;
    rect(px, size, Math.round(x), Math.round(y), Math.round(w), h, FG);
  }
  // body outline
  const bodyTop = oy + roofH * 0.9;
  const bodyH = s * 0.5;
  const bodyW = s * 0.66;
  const bx = ox + (s - bodyW) / 2;
  rect(px, size, Math.round(bx), Math.round(bodyTop), stroke, Math.round(bodyH), FG);
  rect(px, size, Math.round(bx + bodyW - stroke), Math.round(bodyTop), stroke, Math.round(bodyH), FG);
  rect(px, size, Math.round(bx), Math.round(bodyTop + bodyH - stroke), Math.round(bodyW), stroke, FG);
  // door
  rect(px, size, Math.round(ox + s / 2 - stroke), Math.round(bodyTop + bodyH * 0.4), stroke * 2, Math.round(bodyH * 0.6), FG);
}

function build(size, { pad = 0.0 } = {}) {
  const px = roundedTile(size, Math.round(size * 0.22));
  drawHouse(px, size, 0.62 - pad);
  return encodePng(size, px);
}

const files = [
  ['icon-192.png', build(192)],
  ['icon-512.png', build(512)],
  ['icon-maskable-512.png', build(512, { pad: 0.14 })],
  ['apple-touch-icon.png', build(180)],
];

for (const [name, buf] of files) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.error(`wrote public/${name} (${buf.length} bytes)`);
}
