// Generate media/icon.png without ImageMagick: the PNG is assembled by hand via zlib.
// Design = media/beacon.svg in color: dark rounded tile, amber beacon with rays.
// Size via argument (node scripts/make-icon.mjs [size]), default 256 (Marketplace/Retina);
// all geometry is defined in a 128 base and scaled by S.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const SIZE = Number(process.argv[2] ?? 256)
const S = SIZE / 128
const W = SIZE, H = SIZE, CX = SIZE / 2, CY = SIZE / 2

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const smooth = (edge0, edge1, v) => {
  const t = clamp01((v - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// colors
const BG = [15, 18, 22]        // dark tile
const AMBER = [255, 180, 84]   // beacon
const RAY = [232, 238, 246]    // rays

const px = new Uint8Array(W * H * 4)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - CX, dy = y - CY
    const d = Math.hypot(dx, dy)

    // rounded tile (corner radius 24 in 128 base)
    const rr = 24 * S
    const qx = Math.max(Math.abs(x - (W - 1) / 2) - (W / 2 - rr), 0)
    const qy = Math.max(Math.abs(y - (H - 1) / 2) - (H / 2 - rr), 0)
    const cornerD = Math.hypot(qx, qy)
    const shapeA = 1 - smooth(rr - 1.5 * S, rr + 0.5 * S, cornerD)

    let r = BG[0], g = BG[1], b = BG[2]

    // warm glow around the center
    const glow = clamp01(1 - d / (58 * S)) ** 2 * 0.38
    r = r + (AMBER[0] - r) * glow
    g = g + (AMBER[1] - g) * glow
    b = b + (AMBER[2] - b) * glow

    // 4 axial rays: from 20 to 50 from center (128 base), fading toward the tip
    const alongY = Math.abs(dx) <= 2.6 * S && Math.abs(dy) >= 20 * S && Math.abs(dy) <= 50 * S
    const alongX = Math.abs(dy) <= 2.6 * S && Math.abs(dx) >= 20 * S && Math.abs(dx) <= 50 * S
    if (alongX || alongY) {
      const t = ((alongX ? Math.abs(dx) : Math.abs(dy)) - 20 * S) / (30 * S)
      const a = 0.95 * (1 - t * 0.55)
      r = r + (RAY[0] - r) * a
      g = g + (RAY[1] - g) * a
      b = b + (RAY[2] - b) * a
    }

    // beacon core
    const core = 1 - smooth(12 * S, 14.5 * S, d)
    if (core > 0) {
      r = r + (AMBER[0] - r) * core
      g = g + (AMBER[1] - g) * core
      b = b + (AMBER[2] - b) * core
    }

    const i = (y * W + x) * 4
    px[i] = Math.round(r)
    px[i + 1] = Math.round(g)
    px[i + 2] = Math.round(b)
    px[i + 3] = Math.round(255 * shapeA)
  }
}

// PNG encoding
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8   // bits per channel
ihdr[9] = 6   // RGBA
const scanlines = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) {
  scanlines[y * (1 + W * 4)] = 0 // filter: none
  Buffer.from(px.buffer, y * W * 4, W * 4).copy(scanlines, y * (1 + W * 4) + 1)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(new URL('../media/icon.png', import.meta.url), png)
console.log(`media/icon.png: ${png.length} bytes`)
