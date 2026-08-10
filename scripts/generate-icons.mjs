/**
 * Rasterises the Closfa mark (the two circles from components/layout/Logo.tsx)
 * into the PNG assets that SVG can't cover: the iOS home-screen icon and the
 * Open Graph card image, which unfurl crawlers refuse to read as SVG.
 *
 * Hand-rolled PNG encoding via zlib rather than adding sharp/canvas — this runs
 * once when the brand changes, and a native image dependency is a poor trade
 * for two static files. 4× supersampling gives clean edges.
 *
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const ACCENT = [0x68, 0xb9, 0x86] // oklch(0.72 0.110 155) — the light-theme accent
const SS = 4 // supersampling factor

/** Circles in a normalised 32×32 space, matching public/favicon.svg. */
const CIRCLES = [
  { cx: 12.5, cy: 19, r: 10, alpha: 1 },
  { cx: 21, cy: 11, r: 7, alpha: 0.62 },
]

function render({ width, height, bg, scale, offsetX, offsetY }) {
  const px = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    px[i * 3] = bg[0]
    px[i * 3 + 1] = bg[1]
    px[i * 3 + 2] = bg[2]
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Coverage per circle, accumulated with source-over compositing so the
      // overlap matches the SVG's fill-opacity rather than doubling up.
      for (const c of CIRCLES) {
        let hits = 0
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const ux = (x + (sx + 0.5) / SS - offsetX) / scale
            const uy = (y + (sy + 0.5) / SS - offsetY) / scale
            if ((ux - c.cx) ** 2 + (uy - c.cy) ** 2 <= c.r ** 2) hits++
          }
        }
        if (hits === 0) continue
        const a = (hits / (SS * SS)) * c.alpha
        const i = (y * width + x) * 3
        for (let ch = 0; ch < 3; ch++) {
          px[i + ch] = Math.round(px[i + ch] * (1 - a) + ACCENT[ch] * a)
        }
      }
    }
  }
  return px
}

function encodePng(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0 // filter: none
    Buffer.from(rgb.subarray(y * width * 3, (y + 1) * width * 3)).copy(
      raw,
      y * (width * 3 + 1) + 1,
    )
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

// Apple touch icon: opaque white plate (iOS ignores transparency and composites
// onto black otherwise), mark inset to ~72% so it clears the rounded corners.
{
  const size = 180
  const scale = (size * 0.72) / 32
  const offset = (size - 32 * scale) / 2
  writeFileSync(
    'public/apple-touch-icon.png',
    encodePng(size, size, render({
      width: size, height: size, bg: [255, 255, 255], scale, offsetX: offset, offsetY: offset,
    })),
  )
  console.log('wrote public/apple-touch-icon.png')
}

// Default OG card, used for every page that isn't an individual post.
{
  const w = 1200
  const h = 630
  const scale = (h * 0.5) / 32
  writeFileSync(
    'public/og-default.png',
    encodePng(w, h, render({
      width: w, height: h, bg: [255, 255, 255], scale,
      offsetX: (w - 32 * scale) / 2, offsetY: (h - 32 * scale) / 2,
    })),
  )
  console.log('wrote public/og-default.png')
}
