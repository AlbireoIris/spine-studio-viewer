// B 方案：全文件穷举"真块起点"（判据：严格解码 ≈1MB）→ 每块独立解码并采条目（不依赖相位/连续性）
// 用法: node tools/hunt-blocks-full.mjs <blob> --ranges A-B,C-D --out file [--from 0] [--to 0]
import fs from 'node:fs'

const file = process.argv[2]
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const OUT = opt('--out', 'work/evidence/hunt-blocks.json')
const FROM = Number(opt('--from', 204))
const TO = Number(opt('--to', 0))
const ranges = opt('--ranges', '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [a, b] = s.split('-').map(Number); return { lo: a, hi: b }
})
const inRange = (id) => ranges.some((r) => id >= r.lo && id <= r.hi)
const b = fs.readFileSync(file)
const dec = new TextDecoder('utf-8', { fatal: false })
const END = TO > 0 ? Math.min(TO, b.length) : b.length
/* 任务特异判据：解出文本必须含目标 id 字面量，才算真块（排除从错起点乱解出的 1MB 垃圾）*/
const TARGET_IDS = []
for (const r of ranges) for (let n = r.lo; n <= r.hi; n++) TARGET_IDS.push(String(n))

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
const field = (body, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*\'([^\']*)\'').exec(body); return r ? r[1] : null }
const score = (x) => (x.cue ? 2 : 0) + (/[\u4e00-\u9fff]/.test(x.script || '') ? 3 : 0) + (x.name ? 1 : 0) - (x.bad ? 1 : 0)
const found = new Map()
function harvest(r, at) {
  const text = dec.decode(r.out), n = text.length
  let hit = 0
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
    const prev = found.get(idn)
    if (!prev || score(cand) > score(prev)) found.set(idn, cand)
    i = end; hit++
  }
  return hit
}

let blocks = 0, lastLog = Date.now()
for (let off = FROM; off < END - 64; off++) {
  const r = dect(b, off, 1 << 20, false)
  if (!r || r.out.length < 1048560) continue          // 判据1：真正 1MB 块
  const txt0 = dec.decode(r.out)
  if (!TARGET_IDS.some((s) => txt0.includes(s))) continue   // 判据2：含目标 id（任务特异，排除垃圾块）
  blocks++
  harvest(r, off)
  const t = dect(b, off, 1 << 20, true)
  if (t && t.bad) harvest(t, off)
  if (Date.now() - lastLog > 30000) { lastLog = Date.now(); console.log(`  @${(off / 1048576).toFixed(2)}M 块=${blocks} 命中=${found.size}`) }
}
const list = [...found.values()].sort((a, b2) => a.id - b2.id)
fs.writeFileSync(OUT, JSON.stringify(list, null, 1))
console.log(`\nB 方案完成：遍历到 ${END}，找到 1MB 块 ${blocks} 个，区间条目 ${list.length} → ${OUT}`)
const missSk = [3, 7, 11, 15, 19, 23, 24, 25, 26].map((n) => 70240600 + n)
const missOs = [9, 13, 21, 25, 33, 37, 41].map((n) => 78050300 + n)
for (const [label, ids] of [['斯卡蒂缺口', missSk], ['奥西里斯缺口', missOs]]) {
  const got = ids.filter((i) => found.has(i))
  console.log(`  ${label}: ${got.length}/${ids.length}  ${got.map((i) => i % 100).join(',')}`)
}
