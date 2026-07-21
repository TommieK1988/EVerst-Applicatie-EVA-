// Genereert EVA-app-iconen als echte PNG's: groene achtergrond (#009439) met een
// witte E. Zonder externe dependencies — alleen Node's zlib.
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const BG = [0x00, 0x94, 0x39] // #009439
const FG = [0xff, 0xff, 0xff]

// CRC32 (PNG-variant)
const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** Tekent de E als vier rechthoeken, geschaald op een canvas van `size`. */
function isForeground(x, y, size) {
  const u = (v) => v * size // relatieve coordinaten → pixels
  // Veilige zone voor maskable: mark binnen de middelste ~62%.
  const stemL = u(0.34), stemR = u(0.43)
  const left = u(0.34), rightLong = u(0.66), rightShort = u(0.60)
  const top = u(0.25), bottom = u(0.75)
  const armH = u(0.09)
  const midTop = u(0.455), midBot = midTop + armH

  if (y >= top && y < bottom && x >= stemL && x < stemR) return true          // stam
  if (y >= top && y < top + armH && x >= left && x < rightLong) return true    // bovenarm
  if (y >= midTop && y < midBot && x >= left && x < rightShort) return true    // middenarm
  if (y >= bottom - armH && y < bottom && x >= left && x < rightLong) return true // onderarm
  return false
}

function maakPng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const c = isForeground(x, y, size) ? FG : BG
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2]; raw[p++] = 0xff
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bitdiepte
  ihdr[9] = 6   // kleurtype RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = process.argv[2]
for (const [naam, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-icon.png', 180], ['favicon-32.png', 32]]) {
  const bestand = path.join(outDir, naam)
  fs.writeFileSync(bestand, maakPng(size))
  console.log('geschreven:', naam, fs.statSync(bestand).size, 'bytes')
}
