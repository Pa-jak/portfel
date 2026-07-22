#!/usr/bin/env node
// Generates placeholder PWA icons (192, 512, maskable 512) and a 32x32 favicon
// as solid rounded-square PNGs with a wallet/coin glyph. No external deps.

const zlib = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(__dirname, "..", "web", "public");
fs.mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function hexToRGB(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

// RGBA buffer for a rounded-square icon with a wallet/coin glyph.
function renderIcon(size, maskable) {
  const bg = hexToRGB("#1f6feb");
  const accent = hexToRGB("#ffd24a");
  const out = Buffer.alloc(size * size * 4);

  // Safe area inset for maskable (10% padding so glyph stays inside).
  const pad = maskable ? size * 0.1 : 0;
  const innerR = maskable ? size * 0.42 : size * 0.22;

  const cx = size / 2, cy = size / 2;
  const corner = maskable ? size / 2 : size * 0.18; // outer corner radius

  // Wallet body rectangle (rounded)
  const bodyX = pad + size * 0.18;
  const bodyW = size - pad * 2 - size * 0.36;
  const bodyY = pad + size * 0.26;
  const bodyH = size - pad * 2 - size * 0.50;

  function roundedInside(px, py, x, y, w, h, r) {
    if (px < x || px > x + w || py < y || py > y + h) return false;
    const dx = Math.max(x + r - px, px - (x + w - r), 0);
    const dy = Math.max(y + r - py, py - (y + h - r), 0);
    if (dx === 0 || dy === 0) return true;
    return dx * dx + dy * dy <= r * r;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inBg =
        (maskable
          ? (x - cx) ** 2 + (y - cy) ** 2 <= (size / 2 - (size * 0.04)) ** 2
          : roundedInside(x, y, size * 0.04, size * 0.04, size * 0.92, size * 0.92, corner));
      if (inBg) {
        out[i] = bg[0]; out[i + 1] = bg[1]; out[i + 2] = bg[2]; out[i + 3] = 255;
      } else {
        out[i] = 13; out[i + 1] = 17; out[i + 2] = 23;
        out[i + 3] = maskable ? 0 : 0;
      }
    }
  }

  // Draw wallet body (rounded rect, lighter)
  const bodyR = bodyW * 0.18;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (roundedInside(x, y, bodyX, bodyY, bodyW, bodyH, bodyR)) {
        const i = (y * size + x) * 4;
        out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 245;
      }
    }
  }

  // Draw wallet flap (top strip)
  const flapY = bodyY - bodyH * 0.08;
  const flapH = bodyH * 0.28;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (roundedInside(x, y, bodyX, flapY, bodyW, flapH, bodyR)) {
        const i = (y * size + x) * 4;
        out[i] = lerp(out[i], 70, 0.25);
        out[i + 1] = lerp(out[i + 1], 90, 0.25);
        out[i + 2] = lerp(out[i + 2], 130, 0.25);
        out[i + 3] = 255;
      }
    }
  }

  // Coin (accent circle) with "zł"-like notch — drawn as filled circle
  const coinCx = bodyX + bodyW * 0.5;
  const coinCy = bodyY + bodyH * 0.58;
  const coinR = bodyH * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - coinCx) ** 2 + (y - coinCy) ** 2);
      if (d <= coinR) {
        const i = (y * size + x) * 4;
        const border = d > coinR - 2.2;
        if (border) {
          out[i] = lerp(accent[0], 0, 0.4);
          out[i + 1] = lerp(accent[1], 0, 0.4);
          out[i + 2] = lerp(accent[2], 0, 0.4);
        } else {
          out[i] = accent[0]; out[i + 1] = accent[1]; out[i + 2] = accent[2];
        }
        out[i + 3] = 255;
      }
    }
  }

  // Inner coin ring (smaller) for "wallet/PLN glyph" feel
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - coinCx) ** 2 + (y - coinCy) ** 2);
      if (d <= coinR * 0.6 && d >= coinR * 0.46) {
        const i = (y * size + x) * 4;
        out[i] = lerp(accent[0], 0, 0.35);
        out[i + 1] = lerp(accent[1], 0, 0.35);
        out[i + 2] = lerp(accent[2], 0, 0.35);
        out[i + 3] = 255;
      }
    }
  }

  return out;
}

function writePng(file, size, maskable) {
  const rgba = renderIcon(size, maskable);
  fs.writeFileSync(path.join(OUT, file), encodePNG(size, size, rgba));
  console.log("wrote", file, size + "x" + size);
}

writePng("icon-192.png", 192, false);
writePng("icon-512.png", 512, false);
writePng("icon-maskable-512.png", 512, true);
writePng("favicon.ico", 32, false);
console.log("done");