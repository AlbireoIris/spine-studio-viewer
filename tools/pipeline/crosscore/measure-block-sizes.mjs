// 量块大小分布：从已知起点严格解码连续走 N 块，统计每块的 compressed size（consumed）
// 若分布高度集中（例如都≈128KB），说明块近似定长 → 可推算全部块边界 → 覆盖问题可解
import fs from 'node:fs'
const file = process.argv[2] || 'work/raw-pull/luascripts.bin'
const START = Number(process.argv[3] || 240695)
const N = Number(process.argv[4] || 400)
const b = fs.readFileSync(file)
const dec = new TextDecoder('utf-8', { fatal: false })

function strict(src, off, maxOut) {
  const dst = Buffer.allocUnsafe(maxOut)
  let s = off, d = 0
  while (s < src.length) {
    const token = src[s++]
    let lit = token >> 4
    if (lit === 15) { let x; do { x = src[s++]; lit += x } while (x === 255 && s < src.length) }
    if (s + lit > src.length || d + lit > maxOut) break
    src.copy(dst, d, s, s + lit); s += lit; d += lit
    if (s + 2 > src.length) break
    const back = src[s] | (src[s + 1] << 8); s += 2
    if (back === 0 || back > d) return null
    let ml = token & 15
    if (ml === 15) { let x; do { x = src[s++]; ml += x } while (x === 255 && s < src.length) }
    ml += 4
    if (d + ml > maxOut) break
    for (let i = 0; i < ml; i++) { dst[d] = dst[d - back]; d++ }
    if (d >= maxOut - 8) break
  }
  return d > 0 ? { out: dst.subarray(0, d), consumed: s - off } : null
}

const sizes = [], unc = []
let off = START, gaps = 0
while (off < b.length - 64 && sizes.length < N) {
  const r = strict(b, off, 1 << 20)
  if (!r) {
    // 记录一次失配，并小步重同步（≤4096）
    let moved = false
    for (let k = 1; k <= 4096; k++) { if (strict(b, off + k, 4096)) { off += k; gaps++; moved = true; break } }
    if (!moved) off += 4096
    continue
  }
  sizes.push(r.consumed); unc.push(r.out.length)
  off += r.consumed
}
const stat = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const sum = s.reduce((p, c) => p + c, 0)
  return { n: s.length, min: s[0], p25: s[Math.floor(s.length * 0.25)], med: s[Math.floor(s.length / 2)], p75: s[Math.floor(s.length * 0.75)], max: s[s.length - 1], sum }
}
const cs = stat(sizes), us = stat(unc)
console.log(`走了 ${sizes.length} 块，重同步 ${gaps} 次`)
console.log('压缩后大小 consumed:', JSON.stringify(cs))
console.log('解压后大小        :', JSON.stringify(us))
const freq = {}
sizes.forEach((x) => { const k = Math.round(x / 1024) + 'KB'; freq[k] = (freq[k] || 0) + 1 })
const top = Object.entries(freq).sort((a, b2) => b2[1] - a[1]).slice(0, 10)
console.log('压缩大小分布（Top10）:', top.map(([k, v]) => `${k}×${v}`).join('  '))
const ufreq = {}
unc.forEach((x) => { const k = Math.round(x / 1024) + 'KB'; ufreq[k] = (ufreq[k] || 0) + 1 })
console.log('解压大小分布（Top10）:', Object.entries(ufreq).sort((a, b2) => b2[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}×${v}`).join('  '))
console.log(`覆盖进度：走到偏移 ${off} / ${b.length}（${(off / b.length * 100).toFixed(1)}%）`)
