// 精确枚举 1MB 定长块：判据=解出长度≈1048576；块间按 16 字节对齐推进
// 用法: node tools/enumerate-blocks.mjs <blob> --ranges ... --out file [--hunt 500000]
import fs from 'node:fs'

const file = process.argv[2]
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const OUT = opt('--out', 'work/evidence/entries-blocks-full.json')
const HUNT = Number(opt('--hunt', 500000))
const ranges = opt('--ranges', '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [a, b] = s.split('-').map(Number); return { lo: a, hi: b }
})
const inRange = (id) => ranges.some((r) => id >= r.lo && id <= r.hi)
const b = fs.readFileSync(file)
const dec = new TextDecoder('utf-8', { fatal: false })
const align16 = (x) => (x + 15) & ~15

function dect(src, off, maxOut, tolerant) {
  const dst = Buffer.allocUnsafe(maxOut)
  let s = off, d = 0, bad = 0
  while (s < src.length) {
    const token = src[s++]
    let lit = token >> 4
    if (lit === 15) { let x; do { x = src[s++]; lit += x } while (x === 255 && s < src.length) }
    if (s + lit > src.length || d + lit > maxOut) break
    src.copy(dst, d, s, s + lit); s += lit; d += lit
    if (s + 2 > src.length) break
    const back = src[s] | (src[s + 1] << 8); s += 2
    let ml = token & 15
    if (ml === 15) { let x; do { x = src[s++]; ml += x } while (x === 255 && s < src.length) }
    ml += 4
    if (d + ml > maxOut) break
    if (back === 0 || back > d) {
      if (!tolerant) return null
      for (let i = 0; i < ml; i++) dst[d + i] = 0x20
      d += ml; bad++
      continue
    }
    for (let i = 0; i < ml; i++) { dst[d] = dst[d - back]; d++ }
    if (d >= maxOut - 8) break
  }
  return d > 0 ? { out: dst.subarray(0, d), bad, consumed: s - off } : null
}
// 真块起点判据：严格解码得到 ≈1MB（1,048,576±8）
const isBlockStart = (off) => { const r = dect(b, off, 1 << 20, false); return r && r.out.length >= 1048560 ? r : null }

const field = (body, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*\'([^\']*)\'').exec(body); return r ? r[1] : null }
function harvest(r, at, found) {
  if (!r) return
  const text = dec.decode(r.out), n = text.length
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
    const cand = { id: idn, cue: field(body, 'cue_name'), sheet: field(body, 'cue_sheet'), name: field(body, 'name'), script: (field(body, 'script1') || field(body, 'script2') || '').trim(), raw: body.length > 900 ? body.slice(0, 900) : body, at, bad: r.bad || 0 }
    const score = (x) => (x.cue ? 2 : 0) + (/[\u4e00-\u9fff]/.test(x.script || '') ? 3 : 0) + (x.name ? 1 : 0) - (x.bad ? 1 : 0)
    const prev = found.get(idn)
    if (!prev || score(cand) > score(prev)) found.set(idn, cand)
    i = end
  }
}

// 1) 找第一块起点：头部之后逐字节找"解出≈1MB"的偏移
let first = -1
for (let o = 204; o < Math.min(b.length - 64, 204 + HUNT); o++) {
  if (isBlockStart(o)) { first = o; break }
  if (o % 50000 === 0) console.log(`  找首块 … ${o}`)
}
console.log('第一块起点:', first)

const found = new Map()
if (first > 0) {
  let off = first, blocks = 0, badBlocks = 0, misaligns = 0
  while (off < b.length - 64 && blocks < 200) {
    let r = isBlockStart(off)
    if (!r) {
      // 对齐修正 + 短距重同步：块间不是紧邻，用 1MB 判据在 4096 字节内找下一块起点
      let fixed = false
      for (let k = 1; k <= 4096; k++) { if (isBlockStart(off + k)) { off += k; misaligns++; fixed = true; break } }
      if (!fixed) {
        const t = dect(b, off, 1 << 20, true)
        if (!t) break
        off = align16(off + Math.max(1, t.consumed)); continue
      }
      continue
    }
    blocks++
    harvest(r, off, found)
    const t = dect(b, off, 1 << 20, true)
    if (t && t.bad) { badBlocks++; harvest(t, off, found) }
    off = align16(off + Math.max(1, r.consumed))
    if (blocks % 20 === 0) console.log(`  块 ${blocks} @${(off / 1048576).toFixed(2)}M 命中=${found.size}`)
  }
  console.log(`\n枚举块 ${blocks}（坏引用块 ${badBlocks}，对齐修正 ${misaligns}）`)
}
const list = [...found.values()].sort((a, b2) => a.id - b2.id)
fs.writeFileSync(OUT, JSON.stringify(list, null, 1))
console.log(`区间条目 ${list.length} → ${OUT}`)
const missSk = [3, 7, 11, 15, 19, 23, 24, 25, 26].map((n) => 70240600 + n)
const missOs = [9, 13, 21, 25, 33, 37, 41].map((n) => 78050300 + n)
for (const [label, ids] of [['斯卡蒂缺口', missSk], ['奥西里斯缺口', missOs]]) {
  const got = ids.filter((i) => found.has(i))
  console.log(`  ${label}: ${got.length}/${ids.length}  ${got.map((i) => i % 100).join(',')}`)
  got.forEach((i) => { const e = found.get(i); console.log(`     ${i} cue=${e.cue || '(受损)'} name=${e.name || '-'} 文本=${(e.script || '').slice(0, 34)}`) })
}
