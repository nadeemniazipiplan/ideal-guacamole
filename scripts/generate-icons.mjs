#!/usr/bin/env node
/**
 * Generates the PWA icon PNGs from code (no binary assets in the repo and no
 * image-processing dependency). Run with `npm run icons`.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

function drawIcon(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const pad = maskable ? size * 0.16 : 0;
  const radius = maskable ? size * 0.5 : size * 0.22;
  const cx = size / 2;
  const cy = size / 2;
  const ringOuter = (size - pad * 2) * 0.34;
  const ringInner = ringOuter * 0.74;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      // Rounded-square (or circle) mask with 1px antialiasing.
      const dx = Math.max(pad + radius - x, 0, x - (size - pad - radius));
      const dy = Math.max(pad + radius - y, 0, y - (size - pad - radius));
      const corner = Math.hypot(dx, dy);
      const inside = corner <= radius ? 1 : Math.max(0, 1 - (corner - radius));
      if (inside <= 0) continue;

      const t = y / size;
      let r = mix(124, 244, t);
      let g = mix(58, 114, t);
      let b = mix(237, 182, t);

      // Progress ring, open at the top-right like the dashboard rings.
      const d = Math.hypot(x - cx, y - cy);
      const angle = Math.atan2(y - cy, x - cx);
      const inRing = d <= ringOuter && d >= ringInner;
      const gap = angle > -1.35 && angle < -0.35;
      if (inRing && !gap) { r = 255; g = 255; b = 255; }

      // Three ascending bars inside the ring.
      const barW = ringInner * 0.26;
      const bars = [
        { x0: cx - barW * 1.7, h: ringInner * 0.55 },
        { x0: cx - barW * 0.5, h: ringInner * 0.9 },
        { x0: cx + barW * 0.7, h: ringInner * 1.2 },
      ];
      for (const bar of bars) {
        if (x >= bar.x0 && x <= bar.x0 + barW && y <= cy + ringInner * 0.62 && y >= cy + ringInner * 0.62 - bar.h) {
          r = 255; g = 255; b = 255;
        }
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.round(255 * inside);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(outDir, { recursive: true });
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];
for (const [name, size, maskable] of targets) {
  writeFileSync(resolve(outDir, name), drawIcon(size, { maskable }));
  process.stdout.write(`wrote icons/${name} (${size}px)\n`);
}
