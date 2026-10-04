// 决定性实验：穷尽全扫（逐字节、不跳块）+ 按 **id 区间** 收集条目（不要求有 cue_name 字段）
// 动机：缺口的 cue 名从未出现，但它们的 id 可由规律算出（Skadi=70240600+n, Osiris=78050300+n）。
//      若这些 id 的行存在、只是字段结构不同（无 cue_name），此脚本就能把它们捞出来。
// 用法: node tools/scan-by-id.mjs <blob> --ranges 70240601-70240633,78050301-78050342 --out file
import fs from 'node:fs'

const file = process.argv[2]
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const OUT = opt('--out', 'work/evidence/entries-by-id.json')
const MAXOUT = Number(opt('--maxout', 1 << 20))
const ranges = opt('--ranges', '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [a, b] = s.split('-').map(Number)
  return { lo: a, hi: b }
})
const inRange = (id) => ranges.some((r) => id >= r.lo && id <= r.hi)

const b = fs.readFileSync(file)
const dec = new TextDecoder('utf-8', { fatal: false })

function lz4(src, off, maxOut) {
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
  return d > 0 ? dst.subarray(0, d) : null
}
const field = (body, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*\'([^\']*)\'').exec(body); return r ? r[1] : null }

const found = new Map()
let decoded = 0, scanned = 0
for (let off = 0; off < b.length; off++) {
  const out = lz4(b, off, MAXOUT)
  if (!out || out.length < 1024) continue
  const text = dec.decode(out)
  if (!/skin141|skin139|cv_skin|780503|702406/.test(text)) continue   // 放宽：受损块的键名会变花，认内容不认键名
  decoded++
  const n = text.length
  for (let i = 0; i < n; i++) {
    if (text[i] !== '[') continue
    let j = i + 1, id = ''
    while (j < n && text[j] >= '0' && text[j] <= '9' && id.length < 12) { id += text[j]; j++ }
    if (id.length < 6 || text[j] !== ']') continue
    const idn = Number(id)
    if (!inRange(idn)) continue
    let k = j + 1
    while (k < n && (text[k] === ' ' || text[k] === '\t')) k++
    if (text[k] !== '=') continue
    k++
    while (k < n && (text[k] === ' ' || text[k] === '\t')) k++
    if (text[k] !== '{') continue
    let depth = 0, q = null, end = -1
    for (let m = k; m < n; m++) {
      const c = text[m]
      if (q) { if (c === q && text[m - 1] !== '\\') q = null; continue }
      if (c === "'" || c === '"') { q = c; continue }
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { end = m; break } }
    }
    if (end < 0) { i = j; continue }
    const body = text.slice(k + 1, end)
    scanned++
    found.set(idn, { id: idn, cue: field(body, 'cue_name'), sheet: field(body, 'cue_sheet'), name: field(body, 'name'), script: (field(body, 'script1') || field(body, 'script2') || '').trim(), raw: body.length > 900 ? body.slice(0, 900) : body, at: off })
    i = end
  }
  if (decoded % 20 === 0) console.log(`  offset ${(off / 1048576).toFixed(1)}M / 块 ${decoded} / 命中区间条目 ${found.size}`)
}
const list = [...found.values()].sort((a, b2) => a.id - b2.id)
fs.writeFileSync(OUT, JSON.stringify(list, null, 1))
console.log(`\n完成：解出块 ${decoded}，扫描到区间条目 ${scanned}，去重后 ${list.length} → ${OUT}`)
list.forEach((e) => console.log(`  ${e.id}  cue=${e.cue || '(无 cue_name)'}  sheet=${e.sheet || '-'}  name=${e.name || '-'}  台词=${(e.script || '').slice(0, 40)}`))
