// The World in One Image — Wednesday 25 November 2026.
// A deterministic, standard-library-only program that draws a newspaper
// front page summing up the day's world news and writes it to
// $MAKEFUN_OUTPUT_DIR/entry.png (1024x1024 PNG, no network, no clock,
// no randomness: the same bytes on every run).
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const px = new Uint8Array(W * H * 3);

type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 234];
const INK: RGB = [26, 26, 30];
const NAVY: RGB = [18, 38, 74];
const RED: RGB = [178, 30, 32];
const DARKRED: RGB = [128, 22, 26];
const GOLD: RGB = [198, 148, 42];
const GREY: RGB = [110, 108, 100];
const LGREY: RGB = [214, 208, 194];
const WHITE: RGB = [255, 255, 255];
const SKY: RGB = [168, 198, 224];
const SEA: RGB = [64, 110, 158];

function setP(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; i += 3; }
  }
}
function hline(x: number, y: number, w: number, c: RGB, t = 1): void { fillRect(x, y, w, t, c); }
function vline(x: number, y: number, h: number, c: RGB, t = 1): void { fillRect(x, y, t, h, c); }
function rect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  hline(x, y, w, c, t); hline(x, y + h - t, w, c, t); vline(x, y, h, c, t); vline(x + w - t, y, h, c, t);
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + (dx * s) / steps), y = Math.round(y0 + (dy * s) / steps);
    if (t === 1) setP(x, y, c); else fillRect(x - (t >> 1), y - (t >> 1), t, t, c);
  }
}
function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    if (x * x + y * y <= r * r) setP(cx + x, cy + y, c);
}
function ring(cx: number, cy: number, r: number, c: RGB, t = 1): void {
  for (let y = -r - t; y <= r + t; y++) for (let x = -r - t; x <= r + t; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d <= r && d > r - t) setP(cx + x, cy + y, c);
  }
}
function poly(pts: number[][], c: RGB): void {
  // scanline fill of a polygon given as [x,y] pairs
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const n = pts.length;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) hline(Math.round(xs[i]), y, Math.round(xs[i + 1] - xs[i]), c);
  }
}
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  poly([[x0, y0], [x1, y1], [x2, y2]], c);
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) setP(cx + x, cy + y, c);
}

// ---- clip region (scenes draw inside their own box) ----
let clipX0 = 0, clipY0 = 0, clipX1 = W, clipY1 = H;
function setClip(x: number, y: number, w: number, h: number): void {
  clipX0 = x; clipY0 = y; clipX1 = x + w; clipY1 = y + h;
}
function clearClip(): void { clipX0 = 0; clipY0 = 0; clipX1 = W; clipY1 = H; }
function csetP(x: number, y: number, c: RGB): void {
  if (x < clipX0 || y < clipY0 || x >= clipX1 || y >= clipY1) return;
  setP(x, y, c);
}
function cfill(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(clipX0, Math.floor(x)), y0 = Math.max(clipY0, Math.floor(y));
  const x1 = Math.min(clipX1, Math.ceil(x + w)), y1 = Math.min(clipY1, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setP(xx, yy, c);
}
function cline(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + (dx * s) / steps), y = Math.round(y0 + (dy * s) / steps);
    if (t === 1) csetP(x, y, c); else cfill(x - (t >> 1), y - (t >> 1), t, t, c);
  }
}
function ccircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    if (x * x + y * y <= r * r) csetP(cx + x, cy + y, c);
}
function cpoly(pts: number[][], c: RGB): void {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const n = pts.length;
  for (let y = Math.max(clipY0, Math.floor(minY)); y <= Math.min(clipY1 - 1, Math.ceil(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2)
      cfill(Math.round(xs[i]), y, Math.round(xs[i + 1] - xs[i]), 1, c);
  }
}
function cellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) csetP(cx + x, cy + y, c);
}

// ---- PNG encoding (zlib from the standard library) ----
function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcData[i] = type.charCodeAt(i);
  crcData.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcData));
  return out;
}
function encodePNG(): Uint8Array {
  const raw = new Uint8Array((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (W * 3 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ---- 5x7 bitmap font (uppercase; text() uppercases its input) ----
const GLYPHS: Record<string, string[]> = {
  "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  "C": [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  "G": [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "J": ["..###", "....#", "....#", "....#", "....#", "#...#", ".###."],
  "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  "N": ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  "X": ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],
  "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "%": ["##..#", "##.#.", "....#", "...#.", "..#..", ".#...", "#..##"],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  '"': [".#.#.", ".#.#.", ".#.#.", ".....", ".....", ".....", "....."],
  "<": ["....#", "...#.", "..#..", ".#...", "..#..", "...#.", "....#"],
  ">": ["#....", ".#...", "..#..", "...#.", "..#..", ".#...", "#...."],
  "@": [".###.", "#...#", "#.###", "#.#.#", "#.##.", "#....", ".####"],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "_": [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "·": [".....", ".....", ".....", ".##..", ".##..", ".....", "....."],
  "—": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "–": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
};
function glyph(ch: string): string[] {
  return GLYPHS[ch] || GLYPHS["?"];
}
// draw text with top-left at (x,y); scale s => each glyph cell is 6*s wide, 7*s tall.
// bold draws a second pass offset by s in x.
function text(x: number, y: number, str: string, s: number, c: RGB, bold = false): number {
  const up = str.toUpperCase();
  let cx = x;
  for (const ch of up) {
    const g = glyph(ch);
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) {
      if (g[r][col] === "#") {
        fillRect(cx + col * s, y + r * s, s, s, c);
        if (bold) fillRect(cx + col * s + s, y + r * s, s, s, c);
      }
    }
    cx += 6 * s + (bold ? s : 0);
  }
  return cx - x;
}
function textW(str: string, s: number, bold = false): number {
  return str.length * (6 * s + (bold ? s : 0));
}
function textC(cxCenter: number, y: number, str: string, s: number, c: RGB, bold = false): void {
  text(cxCenter - Math.floor(textW(str, s, bold) / 2), y, str, s, c, bold);
}
function textR(xRight: number, y: number, str: string, s: number, c: RGB, bold = false): void {
  text(xRight - textW(str, s, bold), y, str, s, c, bold);
}
// word-wrap: greedy line breaking computed up front, then at most
// maxLines lines are drawn (a hard stop, so text can never spill).
function wrap(x: number, y: number, str: string, s: number, c: RGB, maxW: number, lineH: number, bold = false, maxLines = 99): number {
  const words = str.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textW(trial, s, bold) > maxW && cur) { lines.push(cur); cur = w; }
    else cur = trial;
  }
  if (cur) lines.push(cur);
  let cy = y;
  for (const ln of lines.slice(0, maxLines)) { text(x, cy, ln, s, c, bold); cy += lineH; }
  return cy;
}

// ---- world map: simplified continent outlines in [lon, lat] ----
// Hand-drawn poster geography: recognisable shapes, not survey data.
const LAND: number[][][] = [
  // North America
  [[-168, 66], [-152, 70], [-140, 70], [-128, 70], [-115, 68], [-102, 68], [-95, 69], [-88, 66], [-82, 62], [-79, 58], [-85, 55], [-92, 52], [-95, 49], [-89, 47], [-84, 46], [-79, 43], [-76, 43], [-70, 42], [-70, 44], [-66, 45], [-70, 42], [-73, 40], [-75, 38], [-76, 35], [-79, 33], [-81, 30], [-81, 26], [-84, 30], [-87, 30], [-91, 29], [-95, 28], [-97, 26], [-97, 22], [-95, 19], [-92, 15], [-87, 13], [-83, 9], [-79, 9], [-82, 13], [-86, 15], [-91, 14], [-96, 15], [-101, 17], [-104, 19], [-107, 23], [-110, 24], [-113, 29], [-116, 32], [-120, 34], [-122, 37], [-124, 42], [-124, 47], [-128, 51], [-133, 56], [-140, 60], [-152, 59], [-160, 58], [-166, 60]],
  // Greenland
  [[-46, 60], [-42, 63], [-52, 64], [-54, 68], [-56, 71], [-58, 76], [-52, 79], [-40, 80], [-28, 79], [-20, 76], [-22, 71], [-28, 68], [-32, 66], [-40, 61]],
  // South America
  [[-79, 9], [-77, 7], [-80, 1], [-81, -4], [-79, -8], [-76, -14], [-72, -18], [-70, -20], [-70, -25], [-70, -30], [-71, -35], [-72, -40], [-73, -46], [-73, -51], [-70, -54], [-67, -54], [-66, -50], [-65, -45], [-62, -41], [-59, -38], [-55, -34], [-51, -30], [-48, -26], [-42, -23], [-39, -20], [-39, -15], [-36, -9], [-35, -7], [-40, -3], [-44, -2], [-50, 0], [-53, 3], [-58, 6], [-62, 9], [-67, 11], [-71, 12], [-75, 11], [-77, 8]],
  // Africa
  [[-9, 31], [-13, 28], [-16, 23], [-17, 17], [-16, 13], [-13, 8], [-8, 5], [-3, 5], [2, 6], [6, 4], [9, 4], [10, -1], [13, -7], [12, -13], [13, -18], [15, -24], [17, -30], [19, -34], [25, -34], [29, -32], [32, -28], [33, -24], [35, -20], [36, -16], [39, -11], [40, -6], [41, -1], [42, 3], [46, 6], [51, 11], [48, 11], [43, 12], [41, 14], [39, 18], [37, 22], [35, 24], [33, 27], [32, 30], [30, 31], [25, 32], [20, 32], [15, 32], [11, 34], [10, 37], [5, 37], [0, 36], [-5, 36]],
  // Europe
  [[-9, 37], [-9, 40], [-9, 43], [-4, 44], [-2, 46], [-1, 48], [-5, 48], [-2, 49], [0, 50], [2, 51], [5, 53], [7, 54], [8, 56], [8, 57], [11, 56], [16, 56], [19, 55], [21, 56], [24, 58], [23, 60], [25, 60], [24, 63], [22, 65], [19, 64], [16, 62], [13, 60], [10, 59], [6, 58], [5, 60], [6, 62], [11, 64], [15, 66], [19, 68], [24, 70], [30, 70], [38, 68], [46, 68], [55, 68], [64, 69], [60, 66], [50, 65], [42, 64], [36, 63], [33, 60], [34, 56], [36, 52], [34, 50], [31, 49], [29, 46], [30, 43], [28, 41], [26, 39], [23, 36], [22, 37], [20, 39], [18, 40], [16, 38], [16, 40], [13, 42], [10, 44], [6, 43], [3, 42], [1, 39], [0, 37], [-2, 37], [-5, 36]],
  // Britain
  [[-5, 50], [-3, 51], [-1, 52], [0, 54], [-1, 56], [-3, 58], [-5, 57], [-6, 55], [-4, 54], [-5, 52]],
  // Italy
  [[8, 44], [10, 44], [13, 45], [14, 43], [16, 41], [18, 40], [16, 39], [15, 40], [13, 42], [10, 43]],
  // Asia (incl. Arabia, India, SE Asia mainland)
  [[27, 37], [30, 36], [33, 36], [36, 33], [39, 29], [41, 22], [43, 15], [44, 12], [49, 12], [53, 15], [57, 18], [59, 22], [57, 24], [53, 25], [50, 26], [49, 29], [51, 30], [48, 30], [50, 28], [54, 27], [56, 27], [57, 30], [58, 32], [54, 35], [51, 37], [49, 40], [48, 43], [46, 47], [48, 51], [46, 54], [44, 56], [48, 58], [54, 60], [60, 62], [67, 66], [74, 68], [82, 70], [92, 72], [102, 71], [112, 70], [122, 72], [132, 71], [142, 72], [152, 70], [162, 69], [172, 66], [178, 65], [170, 60], [162, 58], [157, 52], [149, 50], [142, 50], [141, 45], [137, 41], [131, 38], [128, 39], [126, 41], [122, 39], [120, 35], [121, 31], [120, 27], [116, 24], [110, 20], [108, 16], [109, 13], [106, 9], [104, 6], [102, 6], [100, 9], [98, 13], [96, 16], [93, 17], [91, 22], [89, 22], [87, 21], [85, 19], [82, 16], [80, 13], [78, 8], [76, 10], [74, 14], [72, 19], [70, 22], [67, 25], [62, 25], [58, 26], [54, 28], [50, 29], [48, 30], [44, 29], [41, 30], [37, 33], [33, 35], [30, 36]],
  // Sumatra
  [[95, 5], [99, 2], [103, -2], [106, -6], [102, -4], [98, 1], [95, 4]],
  // Borneo
  [[109, 1], [111, 3], [114, 4], [117, 3], [118, 0], [116, -3], [112, -3], [110, -1]],
  // Java
  [[106, -6], [110, -7], [113, -7], [113, -9], [107, -8]],
  // New Guinea
  [[131, -1], [135, -2], [139, -3], [143, -4], [147, -6], [150, -9], [147, -9], [143, -8], [139, -7], [135, -4], [132, -3]],
  // Japan
  [[130, 31], [132, 33], [134, 34], [137, 35], [139, 36], [140, 38], [141, 41], [142, 44], [140, 43], [139, 39], [137, 36], [134, 34], [131, 32]],
  // Philippines (Luzon + Mindanao, stylised)
  [[120, 14], [121, 16], [122, 18], [121, 17], [120, 15]],
  [[122, 7], [124, 8], [126, 9], [124, 10], [122, 9]],
  // Australia
  [[114, -22], [113, -26], [115, -32], [118, -35], [124, -33], [130, -32], [133, -32], [135, -35], [138, -36], [140, -38], [144, -38], [147, -39], [150, -37], [152, -33], [153, -28], [152, -24], [149, -20], [146, -19], [143, -15], [142, -11], [141, -14], [143, -16], [142, -19], [140, -21], [137, -16], [136, -12], [133, -11], [130, -12], [127, -14], [123, -17], [119, -20], [116, -21]],
  // New Zealand
  [[167, -45], [169, -44], [171, -42], [173, -41], [175, -39], [176, -37], [174, -37], [172, -40], [170, -43], [168, -46]],
];
const MAPX = 16, MAPY = 484, MAPW = 630, MAPH = 166;
function proj(lon: number, lat: number): [number, number] {
  const x = MAPX + ((lon + 180) / 360) * MAPW;
  const y = MAPY + ((82 - lat) / 142) * MAPH;
  return [x, y];
}
function drawMap(): void {
  fillRect(MAPX, MAPY, MAPW, MAPH, [196, 216, 232]);
  rect(MAPX, MAPY, MAPW, MAPH, NAVY, 2);
  // graticule
  for (let lon = -150; lon <= 150; lon += 30) {
    const [x] = proj(lon, 0);
    for (let y = MAPY + 4; y < MAPY + MAPH - 2; y += 5) setP(Math.round(x), y, [176, 198, 218]);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, y] = proj(0, lat);
    for (let x = MAPX + 4; x < MAPX + MAPW - 2; x += 5) setP(x, Math.round(y), [176, 198, 218]);
  }
  const landC: RGB = [233, 224, 198];
  const edgeC: RGB = [120, 110, 84];
  for (const shape of LAND) {
    const pts = shape.map(([lo, la]) => proj(lo, la));
    poly(pts, landC);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), edgeC);
    }
  }
  text(MAPX + 8, MAPY + 6, "THE WORLD TODAY — STORY NUMBERS ON THE MAP", 1, NAVY, true);
}
// numbered teardrop pin at a lon/lat; number drawn in white inside the head
function pin(lon: number, lat: number, num: number, c: RGB): void {
  const [x0, y0] = proj(lon, lat);
  const x = Math.round(x0), y = Math.round(y0);
  tri(x - 5, y - 5, x + 5, y - 5, x, y + 8, c);
  circle(x, y - 7, 8, c);
  ring(x, y - 7, 8, WHITE, 1);
  const s = String(num);
  text(x - Math.floor(textW(s, 1) / 2), y - 10, s, 1, WHITE, true);
}

// ---- scene illustrations (drawn inside a clipped box) ----
type Scene = (x: number, y: number, w: number, h: number) => void;
function person(cx: number, base: number, s: number, suit: RGB, skin: RGB): void {
  ccircle(Math.round(cx), Math.round(base - 26 * s), Math.max(2, Math.round(6 * s)), skin);
  cpoly([[cx - 9 * s, base], [cx + 9 * s, base], [cx + 6 * s, base - 19 * s], [cx - 6 * s, base - 19 * s]], suit);
}
function flagCN(x: number, y: number, w: number, h: number): void {
  cfill(x, y, w, h, [222, 41, 45]);
  ccircle(Math.round(x + w * 0.22), Math.round(y + h * 0.3), Math.max(1, Math.round(h * 0.1)), [250, 220, 60]);
  ccircle(Math.round(x + w * 0.45), Math.round(y + h * 0.2), 1, [250, 220, 60]);
  ccircle(Math.round(x + w * 0.48), Math.round(y + h * 0.42), 1, [250, 220, 60]);
}
function flagUS(x: number, y: number, w: number, h: number): void {
  cfill(x, y, w, h, WHITE);
  for (let i = 0; i < 7; i++) if (i % 2 === 0) cfill(x, y + (h / 7) * i, w, Math.ceil(h / 7), [178, 34, 52]);
  cfill(x, y, w * 0.45, h * 0.55, [60, 59, 110]);
}
const sceneSummit: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, SKY);
  // Shenzhen skyline silhouette
  const base = y + h * 0.62;
  const towers: [number, number][] = [[0.02, 0.30], [0.10, 0.42], [0.19, 0.34], [0.28, 0.50], [0.38, 0.38], [0.47, 0.44], [0.56, 0.33], [0.64, 0.48], [0.73, 0.36], [0.82, 0.43], [0.90, 0.31]];
  for (const [fx, fh] of towers) cfill(x + w * fx, base - h * fh, w * 0.07, h * fh, [86, 110, 140]);
  cfill(x + w * 0.28, base - h * 0.56, w * 0.03, h * 0.06, [86, 110, 140]); // Ping An spire tip
  cfill(x, base, w, h * 0.38, [240, 236, 226]);
  // flags
  flagCN(x + w * 0.06, y + h * 0.08, w * 0.13, h * 0.16);
  flagUS(x + w * 0.81, y + h * 0.08, w * 0.13, h * 0.16);
  cfill(x + w * 0.40, y + h * 0.06, w * 0.20, h * 0.13, NAVY);
  // conference table + three leaders
  cellipse(x + w * 0.5, y + h * 0.97, w * 0.44, h * 0.20, [122, 84, 52]);
  cellipse(x + w * 0.5, y + h * 0.94, w * 0.44, h * 0.20, [146, 104, 66]);
  const s = h / 180;
  person(x + w * 0.30, y + h * 0.86, s, [30, 30, 34], [232, 190, 150]);
  person(x + w * 0.50, y + h * 0.84, s * 1.1, [24, 34, 58], [238, 200, 160]);
  person(x + w * 0.70, y + h * 0.86, s, [40, 40, 44], [240, 205, 165]);
};
const sceneTower: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [206, 190, 168]);
  cfill(x, y + h * 0.78, w, h * 0.22, [168, 148, 118]);
  // neighbouring blocks
  cfill(x + w * 0.04, y + h * 0.45, w * 0.16, h * 0.35, [150, 138, 120]);
  cfill(x + w * 0.80, y + h * 0.38, w * 0.16, h * 0.42, [150, 138, 120]);
  // the tower: tapered twin slabs (PIF tower likeness)
  cpoly([[x + w * 0.36, y + h * 0.80], [x + w * 0.42, y + h * 0.10], [x + w * 0.47, y + h * 0.10], [x + w * 0.47, y + h * 0.80]], [96, 110, 128]);
  cpoly([[x + w * 0.53, y + h * 0.80], [x + w * 0.53, y + h * 0.10], [x + w * 0.58, y + h * 0.10], [x + w * 0.64, y + h * 0.80]], [110, 124, 142]);
  cfill(x + w * 0.47, y + h * 0.10, w * 0.06, h * 0.70, [70, 82, 100]);
  for (let i = 0; i < 9; i++) cfill(x + w * 0.385, y + h * (0.16 + i * 0.07), w * 0.05, h * 0.02, [210, 220, 230]);
  // impact smoke, twice in a week: two plumes
  cellipse(x + w * 0.44, y + h * 0.20, w * 0.10, h * 0.07, [70, 66, 62]);
  cellipse(x + w * 0.50, y + h * 0.13, w * 0.13, h * 0.08, [96, 92, 88]);
  cellipse(x + w * 0.58, y + h * 0.44, w * 0.08, h * 0.06, [110, 104, 98]);
  ccircle(Math.round(x + w * 0.44), Math.round(y + h * 0.22), Math.max(2, Math.round(h * 0.02)), [240, 120, 40]);
  // alarm arcs
  for (const r of [0.10, 0.16, 0.22]) {
    for (let a = 0; a <= 50; a += 4) {
      const t = (a / 50) * Math.PI * 0.7 - Math.PI * 0.85;
      csetP(Math.round(x + w * 0.86 + Math.cos(t) * w * r), Math.round(y + h * 0.16 + Math.sin(t) * w * r), RED);
    }
  }
};
const sceneChip: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [24, 28, 38]);
  // circuit traces
  for (let i = 0; i < 6; i++) {
    const yy = y + h * (0.12 + i * 0.15);
    cline(x + w * 0.04, yy, x + w * 0.30, yy, [52, 90, 70], 2);
    cline(x + w * 0.70, yy, x + w * 0.96, yy, [52, 90, 70], 2);
    ccircle(Math.round(x + w * 0.30), Math.round(yy), 2, [52, 90, 70]);
    ccircle(Math.round(x + w * 0.70), Math.round(yy), 2, [52, 90, 70]);
  }
  // the chip
  cfill(x + w * 0.32, y + h * 0.16, w * 0.36, h * 0.62, [38, 42, 54]);
  cfill(x + w * 0.32, y + h * 0.16, w * 0.36, h * 0.62, [38, 42, 54]);
  for (let i = 0; i < 8; i++) {
    cfill(x + w * (0.335 + i * 0.042), y + h * 0.10, w * 0.018, h * 0.06, [170, 175, 185]);
    cfill(x + w * (0.335 + i * 0.042), y + h * 0.78, w * 0.018, h * 0.06, [170, 175, 185]);
  }
  cfill(x + w * 0.40, y + h * 0.30, w * 0.20, h * 0.34, [16, 20, 28]);
  // falling chart across the die
  const pts: [number, number][] = [[0.36, 0.34], [0.44, 0.38], [0.50, 0.36], [0.56, 0.48], [0.62, 0.58], [0.66, 0.68]];
  for (let i = 0; i + 1 < pts.length; i++)
    cline(x + w * pts[i][0], y + h * pts[i][1], x + w * pts[i + 1][0], y + h * pts[i + 1][1], RED, 3);
  cpoly([[x + w * 0.66, y + h * 0.68], [x + w * 0.615, y + h * 0.655], [x + w * 0.655, y + h * 0.615]], RED);
};
const sceneStocks: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [16, 22, 34]);
  for (let i = 1; i < 5; i++) cline(x, y + (h / 5) * i, x + w, y + (h / 5) * i, [40, 52, 74], 1);
  // bars sinking
  const bars: [number, number][] = [[0.06, 0.42], [0.20, 0.50], [0.34, 0.58], [0.48, 0.63], [0.62, 0.72], [0.76, 0.80]];
  for (const [fx, fb] of bars) cfill(x + w * fx, y + h * fb, w * 0.10, h * (0.95 - fb), [150, 40, 44]);
  const pts: [number, number][] = [[0.04, 0.18], [0.18, 0.28], [0.30, 0.24], [0.44, 0.40], [0.58, 0.50], [0.72, 0.60], [0.86, 0.76], [0.95, 0.84]];
  for (let i = 0; i + 1 < pts.length; i++)
    cline(x + w * pts[i][0], y + h * pts[i][1], x + w * pts[i + 1][0], y + h * pts[i + 1][1], [255, 90, 80], 3);
  cpoly([[x + w * 0.95, y + h * 0.84], [x + w * 0.885, y + h * 0.815], [x + w * 0.935, y + h * 0.765]], [255, 90, 80]);
};
const sceneHostage: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [188, 200, 214]);
  cfill(x, y + h * 0.72, w, h * 0.28, [120, 124, 130]);
  // supermarket block + awning
  cfill(x + w * 0.14, y + h * 0.22, w * 0.72, h * 0.52, [226, 224, 216]);
  for (let i = 0; i < 6; i++) cpoly([[x + w * (0.14 + i * 0.12), y + h * 0.22], [x + w * (0.20 + i * 0.12), y + h * 0.22], [x + w * (0.185 + i * 0.12), y + h * 0.32], [x + w * (0.155 + i * 0.12), y + h * 0.32]], i % 2 ? WHITE : RED);
  for (let i = 0; i < 4; i++) cfill(x + w * (0.20 + i * 0.16), y + h * 0.44, w * 0.11, h * 0.20, [70, 90, 110]);
  cfill(x + w * 0.44, y + h * 0.44, w * 0.12, h * 0.30, [52, 58, 66]);
  // police car
  cfill(x + w * 0.08, y + h * 0.70, w * 0.34, h * 0.10, [34, 44, 66]);
  cfill(x + w * 0.15, y + h * 0.63, w * 0.18, h * 0.08, [34, 44, 66]);
  cfill(x + w * 0.215, y + h * 0.60, w * 0.05, h * 0.035, RED);
  ccircle(Math.round(x + w * 0.15), Math.round(y + h * 0.815), Math.max(2, Math.round(h * 0.045)), INK);
  ccircle(Math.round(x + w * 0.35), Math.round(y + h * 0.815), Math.max(2, Math.round(h * 0.045)), INK);
  // cordon tape
  for (let i = 0; i < 10; i++) cfill(x + w * (0.52 + i * 0.045), y + h * 0.66, w * 0.045, h * 0.035, i % 2 ? GOLD : INK);
  cline(x + w * 0.52, y + h * 0.66, x + w * 0.97, y + h * 0.60, INK, 1);
};
const sceneProbe: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [214, 208, 196]);
  // government building
  cfill(x + w * 0.10, y + h * 0.30, w * 0.62, h * 0.48, [238, 234, 226]);
  cpoly([[x + w * 0.06, y + h * 0.30], [x + w * 0.76, y + h * 0.30], [x + w * 0.41, y + h * 0.14]], [150, 60, 56]);
  for (let i = 0; i < 5; i++) cfill(x + w * (0.16 + i * 0.115), y + h * 0.34, w * 0.05, h * 0.38, [196, 190, 178]);
  cfill(x + w * 0.10, y + h * 0.74, w * 0.62, h * 0.05, [150, 60, 56]);
  // magnifying glass over it
  const cx = x + w * 0.68, cy = y + h * 0.52, r = w * 0.17;
  for (let yy = -Math.round(r); yy <= r; yy++) for (let xx = -Math.round(r); xx <= r; xx++)
    if (xx * xx + yy * yy <= r * r) csetP(Math.round(cx + xx), Math.round(cy + yy), [255, 246, 200]);
  for (let yy = -Math.round(r); yy <= r; yy++) for (let xx = -Math.round(r); xx <= r; xx++) {
    const d = Math.sqrt(xx * xx + yy * yy);
    if (d <= r && d > r - 3) csetP(Math.round(cx + xx), Math.round(cy + yy), NAVY);
  }
  cline(cx + r * 0.7, cy + r * 0.7, cx + r * 1.5, cy + r * 1.5, NAVY, Math.max(2, Math.round(h * 0.03)));
  // red seal stamp
  cfill(x + w * 0.16, y + h * 0.40, w * 0.10, h * 0.14, RED);
};
const sceneCourt: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [206, 210, 218]);
  cfill(x + w * 0.06, y + h * 0.26, w * 0.56, h * 0.56, [240, 238, 232]);
  cpoly([[x + w * 0.03, y + h * 0.26], [x + w * 0.65, y + h * 0.26], [x + w * 0.34, y + h * 0.10]], NAVY);
  for (let i = 0; i < 4; i++) cfill(x + w * (0.11 + i * 0.125), y + h * 0.30, w * 0.055, h * 0.44, [206, 202, 194]);
  cfill(x + w * 0.06, y + h * 0.76, w * 0.56, h * 0.06, NAVY);
  // gavel
  cline(x + w * 0.16, y + h * 0.60, x + w * 0.30, y + h * 0.46, [122, 84, 52], Math.max(2, Math.round(h * 0.025)));
  cfill(x + w * 0.26, y + h * 0.40, w * 0.11, h * 0.05, [122, 84, 52]);
  // smartphone defendant
  cfill(x + w * 0.70, y + h * 0.16, w * 0.20, h * 0.62, [30, 32, 40]);
  cfill(x + w * 0.725, y + h * 0.21, w * 0.15, h * 0.46, [90, 140, 190]);
  ccircle(Math.round(x + w * 0.80), Math.round(y + h * 0.72), Math.max(1, Math.round(h * 0.02)), [200, 204, 210]);
};
const sceneFlood: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [150, 168, 188]);
  // rain
  for (let i = 0; i < 40; i++) {
    const rx = x + ((i * 37) % 100) / 100 * w, ry = y + ((i * 53) % 55) / 100 * h;
    cline(rx, ry, rx - w * 0.02, ry + h * 0.07, [220, 232, 244], 1);
  }
  // houses half under water
  for (const fx of [0.08, 0.42, 0.72]) {
    cfill(x + w * fx, y + h * 0.42, w * 0.22, h * 0.30, [232, 226, 214]);
    cpoly([[x + w * (fx - 0.02), y + h * 0.42], [x + w * (fx + 0.24), y + h * 0.42], [x + w * (fx + 0.11), y + h * 0.28]], [140, 60, 50]);
    cfill(x + w * (fx + 0.07), y + h * 0.50, w * 0.05, h * 0.08, [70, 90, 110]);
  }
  // water
  cfill(x, y + h * 0.66, w, h * 0.34, SEA);
  for (let i = 0; i < 8; i++) {
    const wy = y + h * (0.70 + (i % 3) * 0.09);
    for (let sxx = 0; sxx < 8; sxx++) {
      const sx = x + w * ((i * 0.13 + sxx * 0.11) % 0.95);
      cline(sx, wy, sx + w * 0.05, wy, [170, 205, 235], 2);
    }
  }
  // palm bent by wind
  cline(x + w * 0.90, y + h * 0.66, x + w * 0.86, y + h * 0.34, [90, 74, 50], 3);
  for (const [ex, ey] of [[0.78, 0.30], [0.82, 0.26], [0.88, 0.28], [0.92, 0.33]] as [number, number][])
    cline(x + w * 0.86, y + h * 0.33, x + w * ex, y + h * ey, [60, 110, 60], 2);
};
const sceneBoat: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [172, 200, 224]);
  ccircle(Math.round(x + w * 0.86), Math.round(y + h * 0.16), Math.max(2, Math.round(h * 0.06)), [246, 200, 90]);
  cfill(x, y + h * 0.55, w, h * 0.45, SEA);
  for (let i = 0; i < 7; i++) {
    const wy = y + h * (0.60 + (i % 3) * 0.12);
    for (let sxx = 0; sxx < 6; sxx++) cline(x + w * ((i * 0.17 + sxx * 0.15) % 0.92), wy, x + w * ((i * 0.17 + sxx * 0.15) % 0.92) + w * 0.06, wy, [170, 205, 235], 2);
  }
  // long pirogue, crowded
  cpoly([[x + w * 0.16, y + h * 0.56], [x + w * 0.84, y + h * 0.56], [x + w * 0.76, y + h * 0.68], [x + w * 0.24, y + h * 0.68]], [146, 96, 54]);
  cpoly([[x + w * 0.16, y + h * 0.56], [x + w * 0.10, y + h * 0.47], [x + w * 0.20, y + h * 0.53]], [146, 96, 54]);
  for (let i = 0; i < 7; i++) {
    const pxp = x + w * (0.24 + i * 0.085);
    ccircle(Math.round(pxp), Math.round(y + h * 0.47), Math.max(1, Math.round(h * 0.028)), [60, 44, 32]);
    cfill(pxp - w * 0.016, y + h * 0.495, w * 0.032, h * 0.065, [120 + (i % 3) * 40, 70, 60]);
  }
  // dashed route fading out (contact lost)
  for (let i = 0; i < 5; i++) ccircle(Math.round(x + w * (0.86 + i * 0.025)), Math.round(y + h * (0.44 - i * 0.03)), 1, NAVY);
};
const sceneCandles: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [30, 28, 44]);
  cfill(x, y + h * 0.80, w, h * 0.20, [18, 16, 28]);
  const cols: RGB[] = [[240, 238, 230], [226, 120, 120], [240, 238, 230], [150, 170, 220], [240, 238, 230], [226, 120, 120], [240, 238, 230]];
  for (let i = 0; i < 7; i++) {
    const cxp = x + w * (0.10 + i * 0.13), ch = h * (0.30 + (i % 3) * 0.07);
    cfill(cxp - w * 0.028, y + h * 0.82 - ch, w * 0.056, ch, cols[i]);
    cellipse(Math.round(cxp), Math.round(y + h * 0.82 - ch - h * 0.055), Math.max(1, Math.round(w * 0.012)), Math.max(2, Math.round(h * 0.05)), [250, 190, 80]);
    ccircle(Math.round(cxp), Math.round(y + h * 0.82 - ch - h * 0.045), 1, [255, 240, 200]);
  }
  // ribbon
  cpoly([[x + w * 0.44, y + h * 0.10], [x + w * 0.50, y + h * 0.22], [x + w * 0.56, y + h * 0.10], [x + w * 0.53, y + h * 0.06], [x + w * 0.47, y + h * 0.06]], [196, 90, 150]);
};
const sceneCricket204: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [104, 160, 92]);
  cellipse(x + w * 0.5, y + h * 0.96, w * 0.46, h * 0.30, [196, 178, 130]);
  // batter
  const bx = x + w * 0.34, by = y + h * 0.80;
  ccircle(Math.round(bx), Math.round(by - h * 0.34), Math.max(2, Math.round(h * 0.05)), [240, 205, 170]);
  cfill(bx - w * 0.015, by - h * 0.30, w * 0.03, h * 0.20, [40, 70, 160]);
  cline(bx, by - h * 0.10, bx - w * 0.07, by, [40, 70, 160], 3);
  cline(bx, by - h * 0.10, bx + w * 0.06, by, [40, 70, 160], 3);
  cline(bx + w * 0.01, by - h * 0.26, bx + w * 0.17, by - h * 0.40, [214, 186, 130], 3); // bat swung high
  // ball flying out
  ccircle(Math.round(x + w * 0.66), Math.round(y + h * 0.22), Math.max(2, Math.round(h * 0.03)), [200, 40, 40]);
  for (let i = 0; i < 4; i++) ccircle(Math.round(x + w * (0.58 + i * 0.02)), Math.round(y + h * (0.30 - i * 0.018)), 1, [240, 240, 240]);
  // stumps
  for (let i = 0; i < 3; i++) cfill(x + w * (0.20 + i * 0.025), y + h * 0.62, w * 0.008, h * 0.16, [240, 220, 150]);
};
const sceneT20: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [26, 34, 58]);
  // floodlights
  for (const fx of [0.10, 0.88]) {
    cline(x + w * fx, y + h * 0.55, x + w * fx, y + h * 0.14, [150, 156, 168], 3);
    for (let r = 0; r < 2; r++) for (let cix = 0; cix < 3; cix++)
      ccircle(Math.round(x + w * (fx - 0.03 + cix * 0.03)), Math.round(y + h * (0.10 + r * 0.05)), Math.max(1, Math.round(h * 0.018)), [255, 246, 200]);
  }
  cfill(x, y + h * 0.55, w, h * 0.45, [74, 128, 74]);
  cellipse(x + w * 0.5, y + h * 0.99, w * 0.4, h * 0.24, [196, 178, 130]);
  // scoreboard
  cfill(x + w * 0.33, y + h * 0.06, w * 0.34, h * 0.20, [10, 12, 18]);
  // batter mid-shot
  const bx = x + w * 0.48, by = y + h * 0.86;
  ccircle(Math.round(bx), Math.round(by - h * 0.30), Math.max(2, Math.round(h * 0.045)), [240, 205, 170]);
  cfill(bx - w * 0.014, by - h * 0.26, w * 0.028, h * 0.18, [200, 40, 46]);
  cline(bx, by - h * 0.08, bx - w * 0.06, by, [200, 40, 46], 3);
  cline(bx, by - h * 0.08, bx + w * 0.05, by, [240, 240, 240], 3);
  cline(bx + w * 0.01, by - h * 0.22, bx + w * 0.15, by - h * 0.34, [214, 186, 130], 3);
  ccircle(Math.round(x + w * 0.70), Math.round(y + h * 0.30), Math.max(1, Math.round(h * 0.022)), WHITE);
};
const sceneReef: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [38, 110, 150]);
  cfill(x, y + h * 0.82, w, h * 0.18, [214, 196, 150]);
  // light rays
  for (let i = 0; i < 4; i++) cpoly([[x + w * (0.12 + i * 0.22), y], [x + w * (0.20 + i * 0.22), y], [x + w * (0.30 + i * 0.22), y + h * 0.6], [x + w * (0.16 + i * 0.22), y + h * 0.6]], [70, 140, 180]);
  // corals
  const coral = (cxp: number, base: number, s: number, c: RGB) => {
    cline(cxp, base, cxp, base - h * 0.22 * s, c, 3);
    cline(cxp, base - h * 0.10 * s, cxp - w * 0.06 * s, base - h * 0.24 * s, c, 2);
    cline(cxp, base - h * 0.14 * s, cxp + w * 0.06 * s, base - h * 0.28 * s, c, 2);
    cline(cxp - w * 0.06 * s, base - h * 0.24 * s, cxp - w * 0.09 * s, base - h * 0.32 * s, c, 2);
    cline(cxp + w * 0.06 * s, base - h * 0.28 * s, cxp + w * 0.10 * s, base - h * 0.34 * s, c, 2);
  };
  coral(x + w * 0.24, y + h * 0.86, 1.0, [240, 110, 90]);
  coral(x + w * 0.52, y + h * 0.88, 1.3, [250, 150, 80]);
  coral(x + w * 0.78, y + h * 0.86, 0.9, [230, 90, 130]);
  // fish
  for (const [fx, fy, fc] of [[0.36, 0.30, [250, 200, 60]], [0.62, 0.22, [120, 220, 200]], [0.70, 0.42, [250, 200, 60]]] as [number, number, RGB][]) {
    cellipse(x + w * fx, y + h * fy, w * 0.045, h * 0.028, fc);
    cpoly([[x + w * (fx + 0.04), y + h * fy], [x + w * (fx + 0.075), y + h * (fy - 0.03)], [x + w * (fx + 0.075), y + h * (fy + 0.03)]], fc);
  }
  // turtle
  cellipse(x + w * 0.30, y + h * 0.55, w * 0.06, h * 0.04, [90, 140, 90]);
  ccircle(Math.round(x + w * 0.365), Math.round(y + h * 0.54), Math.max(1, Math.round(h * 0.018)), [90, 140, 90]);
};
const sceneGavel: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [188, 198, 210]);
  // housing blocks (the 'ghetto' list neighbourhoods)
  for (const [fx, fw, fh] of [[0.06, 0.24, 0.52], [0.36, 0.26, 0.62], [0.68, 0.24, 0.46]] as [number, number, number][]) {
    cfill(x + w * fx, y + h * (0.82 - fh), w * fw, h * fh, [168, 120, 96]);
    for (let r = 0; r < 4; r++) for (let cix = 0; cix < 3; cix++)
      cfill(x + w * (fx + 0.03 + cix * 0.07), y + h * (0.82 - fh + 0.08 + r * 0.11), w * 0.04, h * 0.06, [240, 230, 190]);
  }
  cfill(x, y + h * 0.82, w, h * 0.18, [130, 134, 140]);
  // gavel over the rooftops
  cline(x + w * 0.60, y + h * 0.16, x + w * 0.78, y + h * 0.34, [110, 76, 44], Math.max(2, Math.round(h * 0.03)));
  cfill(x + w * 0.52, y + h * 0.08, w * 0.17, h * 0.07, [110, 76, 44]);
  cfill(x + w * 0.52, y + h * 0.08, w * 0.03, h * 0.07, [80, 54, 30]);
  cfill(x + w * 0.66, y + h * 0.08, w * 0.03, h * 0.07, [80, 54, 30]);
  cfill(x + w * 0.55, y + h * 0.42, w * 0.30, h * 0.035, [110, 76, 44]);
};
const sceneAsteroid: Scene = (x, y, w, h) => {
  cfill(x, y, w, h, [8, 10, 22]);
  // stars (fixed pattern)
  for (let i = 0; i < 46; i++) {
    const sx = x + ((i * 61) % 97) / 97 * w, sy = y + ((i * 43) % 93) / 93 * h;
    setP(Math.round(sx), Math.round(sy), [220, 226, 240]);
    if (i % 7 === 0) setP(Math.round(sx) + 1, Math.round(sy), [160, 168, 190]);
  }
  // sun rays from left
  for (let i = 0; i < 5; i++) cline(x, y + h * (0.2 + i * 0.15), x + w * 0.30, y + h * (0.30 + i * 0.10), [120, 110, 70], 1);
  // big asteroid Didymos
  cellipse(x + w * 0.44, y + h * 0.52, w * 0.20, h * 0.30, [150, 138, 124]);
  cellipse(x + w * 0.38, y + h * 0.42, w * 0.05, h * 0.07, [120, 108, 96]);
  cellipse(x + w * 0.50, y + h * 0.62, w * 0.06, h * 0.08, [126, 114, 100]);
  // moonlet Dimorphos crossing in front, casting the shadow
  cellipse(x + w * 0.30, y + h * 0.44, w * 0.075, h * 0.11, [176, 164, 148]);
  cpoly([[x + w * 0.335, y + h * 0.36], [x + w * 0.335, y + h * 0.52], [x + w * 0.42, y + h * 0.58], [x + w * 0.42, y + h * 0.30]], [40, 36, 34]);
  // spacecraft with panel
  cfill(x + w * 0.78, y + h * 0.66, w * 0.07, h * 0.09, [210, 214, 220]);
  cfill(x + w * 0.70, y + h * 0.675, w * 0.07, h * 0.06, [70, 100, 180]);
  cfill(x + w * 0.86, y + h * 0.675, w * 0.07, h * 0.06, [70, 100, 180]);
  cline(x + w * 0.80, y + h * 0.66, x + w * 0.72, y + h * 0.55, [240, 200, 90], 1);
};

// ---- the day's news: 43 stories, gathered from the wires on 25 Nov 2026 ----
// cred: true = confirmed by 2+ wires / official; false = single-wire report.
interface BigStory { scene: Scene; cat: string; head: string; sum: string; meta: string; pin: [number, number] | null; cred: boolean }
const BIG: BigStory[] = [
  {
    scene: sceneSummit, cat: "APEC · SHENZHEN", cred: true, pin: [114.06, 22.55],
    head: "XI-TRUMP TALKS IN SHENZHEN",
    sum: "It wrapped up the APEC summit; Xi set out four points on big-power ties.",
    meta: "SHENZHEN, CHINA",
  },
  {
    scene: sceneTower, cat: "MIDDLE EAST", cred: false, pin: [46.68, 24.71],
    head: "RIYADH TOWER HIT TWICE",
    sum: "Saudi condemned the attack on the PIF Tower, struck twice within a week.",
    meta: "RIYADH, SAUDI ARABIA",
  },
  {
    scene: sceneChip, cat: "TECH · MARKETS", cred: true, pin: [-122.03, 37.37],
    head: "NVIDIA COMEBACK FADES",
    sum: "Huang admitted 'terrible mistakes'; shares slid 6%.",
    meta: "SANTA CLARA, USA",
  },
];
interface MedStory { scene: Scene; head: string; det: string; pin: [number, number] | null; cred: boolean }
const MED: MedStory[] = [
  { scene: sceneStocks, cred: true, pin: [139.69, 35.69], head: "ASIA STOCKS TUMBLE", det: "Fresh US tariff threats: Asia-Pacific -2.3%, Seoul -5.3%, Nikkei -2.9%." },
  { scene: sceneHostage, cred: false, pin: [-74.08, 4.71], head: "25 HOSTAGES IN COLOMBIA", det: "Gunmen seized 25 at a supermarket; a car bomb wrecked buildings downtown." },
  { scene: sceneProbe, cred: false, pin: [121.47, 31.23], head: "SHANGHAI PROBE", det: "Politburo member Chen Jining, the city's party chief, is investigated (AP)." },
  { scene: sceneCourt, cred: false, pin: [-77.04, 38.90], head: "US CONVICTS HUAWEI", det: "A federal jury finds the Chinese tech giant stole trade secrets." },
  { scene: sceneFlood, cred: false, pin: [-121.49, 38.58], head: "EXTREME FLOODING", det: "A storm system puts California on flood alert in Thanksgiving week." },
  { scene: sceneBoat, cred: true, pin: [-17.45, 14.72], head: "175 MIGRANTS MISSING", det: "Contact lost with a Dakar boat bound for Europe; navy rescued 974 Monday." },
  { scene: sceneCandles, cred: true, pin: [-74.01, 40.71], head: "FIVE WOMEN KILLED", det: "UN: five women killed by kin or partners every hour of 2025." },
  { scene: sceneCricket204, cred: true, pin: [72.88, 19.08], head: "SOORYAVANSHI 204", det: "The teen's double century steers India A past UAE by 7 wickets." },
  { scene: sceneT20, cred: true, pin: [151.21, -33.87], head: "ENGLAND ROUT AUSTRALIA", det: "188/2 in 13.1 overs chases 184/8: 2nd T20I won by 8 wickets, Donald 85." },
  { scene: sceneReef, cred: false, pin: [145.77, -16.92], head: "12 CORALS RESURRECTED", det: "Genetics brings back 12 Acropora species on the Great Barrier Reef." },
  { scene: sceneGavel, cred: false, pin: [12.57, 55.68], head: "EVICTIONS UPHELD", det: "Denmark's top court backs the housing law for 'non-Western' districts." },
  { scene: sceneAsteroid, cred: false, pin: null, head: "ASTEROID ECLIPSE", det: "A spacecraft films Dimorphos crossing Didymos, casting its shadow." },
];
interface SmallStory { txt: string; pin: [number, number] | null; cred: boolean }
const SMALL: SmallStory[] = [
  { txt: "TRUMP PARDONS THE THANKSGIVING TURKEYS", pin: null, cred: true },
  { txt: "GIULIANI GETS MEDAL OF FREEDOM", pin: null, cred: false },
  { txt: "US SOLDIER ADMITS SELLING SECRETS", pin: null, cred: false },
  { txt: "SHEIN PAYS $100M TO SETTLE FTC CASE", pin: null, cred: true },
  { txt: "PUTIN INVITES EUROPE ENVOYS TO MOSCOW", pin: [37.62, 55.76], cred: false },
  { txt: "SEOUL: RUSSIAN JETS ENTERED AIR ZONE", pin: [126.98, 37.57], cred: true },
  { txt: "KOREA COURT EXTENDS HAN DETENTION", pin: null, cred: false },
  { txt: "HAMAS SECURITY CHIEF KILLED IN GAZA", pin: [34.45, 31.50], cred: false },
  { txt: "LANDMINE TOLL HITS 5-YEAR HIGH: 7,000", pin: [95.96, 21.92], cred: true },
  { txt: "COBALT RUSH TO BEAT DR CONGO BAN", pin: [15.27, -4.32], cred: false },
  { txt: "N.KOREA THREATENS SWISS OFFICE SHUT", pin: [125.75, 39.03], cred: false },
  { txt: "NATO EYES NUCLEAR SATELLITE REPORTS", pin: [4.35, 50.85], cred: false },
  { txt: "HASINA ASKS DEC 16 RETURN TO DHAKA", pin: [90.41, 23.81], cred: false },
  { txt: "TWO HURT IN SERBIA SCHOOL SHOOTING", pin: [20.46, 44.82], cred: false },
  { txt: "UAE BUS CRASH KILLS 13 IN RAK", pin: [55.94, 25.79], cred: false },
  { txt: "UAE SETS DH90.1BN 2027 BUDGET", pin: null, cred: false },
  { txt: "DUBAI VISITORS REACH 9.7 MILLION", pin: [55.27, 25.20], cred: false },
  { txt: "MANILA COURT JUNKS DUTERTE PETITIONS", pin: [120.98, 14.60], cred: false },
  { txt: "INDIA WOMEN BEAT CHINA 6-2 AT FOOTBALL", pin: null, cred: false },
  { txt: "MARKRAM'S 150 A SOUTH AFRICA RECORD", pin: [28.05, -26.20], cred: false },
  { txt: "BRENT $90.97 · BITCOIN NEAR $59,300", pin: null, cred: true },
  { txt: "GOLD EASES TO $3,544 BEFORE PCE DATA", pin: null, cred: true },
  { txt: "US CONSUMER CONFIDENCE NEAR 2-YR HIGH", pin: null, cred: true },
  { txt: "FED HIKE IN DECEMBER PRICED AT 97%", pin: null, cred: true },
  { txt: "MICROSOFT 'CODE RED' AFTER OUTAGE", pin: [-122.12, 47.64], cred: false },
  { txt: "MEXICO TO TRY 'EL CHAPO ISIDRO' AT HOME", pin: [-99.13, 19.43], cred: false },
  { txt: "PELICOT SLAMS BOOK PROMO IN FRANCE", pin: [2.35, 48.86], cred: false },
  { txt: "DALAI LAMA GIVEN A DELHI ADDRESS", pin: [77.10, 28.70], cred: false },
];
const NUMBERS: [string, string][] = [
  ["25", "HOSTAGES IN COLOMBIA"],
  ["175", "MIGRANTS MISSING AT SEA"],
  ["7000", "LANDMINE CASUALTIES, 2025"],
  ["$100M", "SHEIN SETTLEMENT"],
  ["204", "SOORYAVANSHI'S RUNS"],
  ["-5.3%", "SEOUL STOCKS AT WORST"],
];
const UTCROWS: string[] = [
  "0130 APEC LEADERS GATHER",
  "0210 XI-TRUMP TALKS END",
  "0245 ASIA CHIP STOCKS SLIDE",
  "0330 RIYADH CONDEMNS ATTACK",
  "0500 5 WOMEN KILLED HOURLY",
  "0740 COLOMBIA HOSTAGE ALERT",
  "1200 US PCE DATA DUE 1330",
  "1830 TURKEYS PARDONED IN DC",
];

// ---- layout ----
function credMark(x: number, y: number, cred: boolean): void {
  if (cred) circle(x, y, 3, INK); else ring(x, y, 3, INK, 1);
}
function drawMasthead(): void {
  hline(16, 10, 992, RED, 3);
  hline(16, 17, 992, INK, 1);
  textC(512, 26, "WEDNESDAY 25 NOVEMBER 2026", 5, INK, true);
  textC(512, 68, "THE WORLD IN ONE IMAGE · 43 STORIES · 15 DRAWN SCENES · ALL TIMES UTC", 2, DARKRED, true);
  hline(16, 88, 992, INK, 1);
  hline(16, 92, 992, RED, 3);
}
function drawNumbers(): void {
  fillRect(16, 102, 992, 46, NAVY);
  const cw = 992 / 6;
  for (let i = 0; i < 6; i++) {
    const cx = 16 + cw * i + cw / 2;
    textC(cx, 108, NUMBERS[i][0], 3, [255, 214, 120], true);
    textC(cx, 134, NUMBERS[i][1], 1, WHITE);
    if (i > 0) vline(16 + cw * i, 108, 34, GOLD, 1);
  }
}
function drawBig(): void {
  const y = 156, w = 322, h = 320;
  BIG.forEach((s, i) => {
    const x = 16 + i * (w + 13);
    fillRect(x, y, w, h, WHITE);
    rect(x, y, w, h, INK, 1);
    fillRect(x, y, w, 20, NAVY);
    text(x + 8, y + 5, s.cat, 2, WHITE, true);
    textR(x + w - 8, y + 5, "NO. " + (i + 1), 2, [255, 214, 120], true);
    setClip(x + 5, y + 25, w - 10, 160);
    s.scene(x + 5, y + 25, w - 10, 160);
    clearClip();
    rect(x + 5, y + 25, w - 10, 160, INK, 1);
    circle(x + 24, y + 42, 11, RED);
    text(x + 24 - Math.floor(textW(String(i + 1), 2, true) / 2), y + 35, String(i + 1), 2, WHITE, true);
    wrap(x + 8, y + 194, s.head, 3, INK, w - 16, 23, true, 2);
    wrap(x + 8, y + 246, s.sum, 2, [52, 50, 46], w - 16, 15, false, 3);
    credMark(x + 11, y + h - 13, s.cred);
    text(x + 20, y + h - 17, s.meta + (s.cred ? " — CONFIRMED" : " — REPORTED"), 1, GREY);
  });
}
function drawMapBand(): void {
  drawMap();
  BIG.forEach((s, i) => { if (s.pin) pin(s.pin[0], s.pin[1], i + 1, RED); });
  MED.forEach((s, i) => { if (s.pin) pin(s.pin[0], s.pin[1], i + 4, NAVY); });
  SMALL.forEach((s, i) => { if (s.pin) pin(s.pin[0], s.pin[1], i + 16, [90, 90, 96]); });
  // right rail: the day in UTC
  const x = 658, y = 484, w = 350, h = 166;
  fillRect(x, y, w, h, WHITE);
  rect(x, y, w, h, INK, 1);
  fillRect(x, y, w, 24, RED);
  text(x + 8, y + 6, "THE DAY IN UTC", 2, WHITE, true);
  UTCROWS.forEach((r, i) => {
    const ry = y + 34 + i * 16;
    text(x + 10, ry, r.slice(0, 4), 2, RED, true);
    text(x + 74, ry, r.slice(5), 2, INK);
    if (i < UTCROWS.length - 1) hline(x + 10, ry + 13, w - 20, LGREY, 1);
  });
}
function drawMed(): void {
  const cw = 242, ch = 72;
  MED.forEach((s, i) => {
    const x = 16 + (i % 4) * (cw + 8), y = 658 + Math.floor(i / 4) * (ch + 6);
    fillRect(x, y, cw, ch, WHITE);
    rect(x, y, cw, ch, [170, 164, 148], 1);
    setClip(x + 3, y + 5, 60, 60);
    s.scene(x + 3, y + 5, 60, 60);
    clearClip();
    rect(x + 3, y + 5, 60, 60, INK, 1);
    circle(x + 11, y + 13, 8, NAVY);
    text(x + 11 - Math.floor(textW(String(i + 4), 1, true) / 2), y + 9, String(i + 4), 1, WHITE, true);
    credMark(x + cw - 10, y + 9, s.cred);
    wrap(x + 68, y + 4, s.head, 2, INK, cw - 72, 15, true, 2);
    wrap(x + 68, y + 37, s.det, 1, [52, 50, 46], cw - 72, 9, false, 3);
  });
}
function drawSmall(): void {
  hline(16, 890, 992, INK, 2);
  text(16, 898, "ALSO IN THE NEWS", 2, INK, true);
  text(240, 898, "— 28 MORE STORIES FROM THE WIRES", 2, GREY);
  hline(16, 918, 992, LGREY, 1);
  SMALL.forEach((s, i) => {
    const x = 16 + (i % 4) * 250, y = 926 + Math.floor(i / 4) * 11;
    credMark(x + 3, y + 3, s.cred);
    text(x + 10, y, (i + 16) + " " + s.txt, 1, [40, 38, 34]);
  });
}
function drawFooter(): void {
  hline(16, 1004, 992, INK, 1);
  textC(512, 1008, "SOURCES: REUTERS · AP · AFP · SCMP · CGTN · UN", 1, INK, true);
  textC(512, 1017, "CREDIBILITY MARKS: FILLED DOT = CONFIRMED BY 2+ WIRES · OPEN DOT = SINGLE-WIRE REPORT · DRAWN BY AN AI AGENT FOR MAKE.FUN", 1, GREY);
}
function grain(): void {
  // deterministic print grain: a fixed hash of the pixel position
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let hh = (x * 374761393 + y * 668265263) ^ ((x ^ y) * 974634211);
      hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
      const v = ((hh >>> 9) % 11) - 5;
      if (v === 0) continue;
      const i = (y * W + x) * 3;
      px[i] = Math.max(0, Math.min(255, px[i] + v));
      px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + v));
      px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + v));
    }
  }
}
function main(): void {
  fillRect(0, 0, W, H, PAPER);
  drawMasthead();
  drawNumbers();
  drawBig();
  drawMapBand();
  drawMed();
  drawSmall();
  drawFooter();
  grain();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePNG());
}
main();
