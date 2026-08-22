// 生成符合 macOS 规范的应用图标（无第三方依赖：node zlib 手写 PNG 编码）
//
// macOS 图标规范：画布 1024×1024，图形居中 824×824（四边 100px 边距），
// 连续圆角 squircle（超级椭圆 n≈5），Dock 中与系统应用一致。
//
// 设计：蓝色渐变底 + 白色粗体「M」，M 下方一条左粗右细的锥形笔触线
//（书写的收笔，暗示"记录/写作"），单一主体，克制干净。
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const S = 1024;
const HALF = 412;
const N = 5;

function inSquircle(x, y) {
  const dx = (x - 512) / HALF;
  const dy = (y - 512) / HALF;
  return Math.pow(Math.abs(dx), N) + Math.pow(Math.abs(dy), N) <= 1;
}

// ---------- M：两竖 + V（居中略偏上） ----------
const M = { top: 330, bot: 626, xl: 396, xr: 630, mid: 513, notchY: 522, lw: 66 };
function distToSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
function inM(x, y) {
  const { top, bot, xl, xr, mid, notchY, lw } = M;
  if (x >= xl - lw / 2 && x <= xl + lw / 2 && y >= top && y <= bot) return true;
  if (x >= xr - lw / 2 && x <= xr + lw / 2 && y >= top && y <= bot) return true;
  if (distToSeg(x, y, xl, top + lw / 2, mid, notchY) <= lw / 2) return true;
  if (distToSeg(x, y, mid, notchY, xr, top + lw / 2) <= lw / 2) return true;
  return false;
}

// ---------- 下划线：锥形笔触（左厚右薄，收笔感） ----------
const UL = { x0: 352, x1: 684, cy: 716, h0: 19, h1: 6 };
function inUnderline(x, y) {
  if (x < UL.x0 || x > UL.x1) return false;
  const t = (x - UL.x0) / (UL.x1 - UL.x0);
  const half = UL.h0 + (UL.h1 - UL.h0) * t;
  return Math.abs(y - UL.cy) <= half;
}

function inSymbol(x, y) {
  return inM(x, y) || inUnderline(x, y);
}

// ---------- 背景：清爽蓝渐变 + 顶部高光 ----------
const C0 = [96, 165, 250]; // #60A5FA 左上
const C1 = [37, 99, 235]; // #2563EB 右下
function background(x, y) {
  const t = Math.min(1, Math.max(0, (x + y - 200) / (2 * 824)));
  let r = C0[0] + (C1[0] - C0[0]) * t;
  let g = C0[1] + (C1[1] - C0[1]) * t;
  let b = C0[2] + (C1[2] - C0[2]) * t;
  const hy = y - 100;
  if (hy < 300) {
    const k = 0.12 * (1 - hy / 300);
    r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
  }
  return [r, g, b];
}

// ---------- 2×2 超采样渲染 ----------
const px = new Uint8Array(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    let r = 0, g = 0, b = 0, a = 0;
    for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const sx = x + ox, sy = y + oy;
      if (!inSquircle(sx, sy)) continue;
      a += 0.25;
      const c = inSymbol(sx, sy) ? [255, 255, 255] : background(sx, sy);
      r += c[0] * 0.25; g += c[1] * 0.25; b += c[2] * 0.25;
    }
    if (a === 0) { px[i + 3] = 0; continue; }
    px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a;
    px[i + 3] = Math.round(a * 255);
  }
}

// ---------- PNG 编码 ----------
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}
const crcTable = [...Array(256)].map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const bb of buf) c = crcTable[(c ^ bb) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("build", { recursive: true });
writeFileSync("build/icon-1024.png", png);
console.log("icon written:", png.length, "bytes");
