// Renders the app icons (PNG + SVG) from the "cat" picture puzzle.
// Usage: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const load = require('./load');
const { Pictures } = load('rng', 'solver', 'pictures');

const BG = '#fff6ec';
const pic = Pictures.fromPicture(Pictures.PICTURES.find((p) => p.id === 'cat'));
const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, fraction) {
  const cell = Math.floor((size * fraction) / Math.max(pic.w, pic.h));
  const ox = Math.floor((size - cell * pic.w) / 2), oy = Math.floor((size - cell * pic.h) / 2);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const bg = hex(BG);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = bg;
      const cx = Math.floor((x - ox) / cell), cy = Math.floor((y - oy) / cell);
      if (x >= ox && y >= oy && cx < pic.w && cy < pic.h && pic.sol[cy * pic.w + cx]) col = hex(pic.colors[cy * pic.w + cx]);
      raw.set(col, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.writeFileSync(path.join(outDir, 'icon-192.png'), png(192, 0.7));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), png(512, 0.7));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), png(180, 0.72));

let rects = '';
for (let i = 0; i < pic.w * pic.h; i++) {
  if (pic.sol[i]) rects += `<rect x="${(i % pic.w) + 3}" y="${Math.floor(i / pic.w) + 3}" width="1.02" height="1.02" fill="${pic.colors[i]}"/>`;
}
fs.writeFileSync(path.join(outDir, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" rx="3.5" fill="${BG}"/>${rects}</svg>\n`);
console.log('icons written to', outDir);
