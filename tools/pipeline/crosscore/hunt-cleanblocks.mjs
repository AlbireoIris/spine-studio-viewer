// 真块起点穷举（强判据版）：严格解码恰好≈1MB **且** 解出文本里 `["` 出现 ≥ TH 次（真表密集、垃圾稀疏）
// 用法: node tools/hunt-cleanblocks.mjs <blob> --from X --to Y --ranges A-B,C-D --out file [--th 20]
import fs from 'node:fs'

const file = process.argv[2]
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const OUT = opt('--out', 'work/evidence/cleanblocks.json')
const FROM = Number(opt('--from', 4072))
const TO = Number(opt('--to', 0))
const TH = Number(opt('--th', 20))
const ranges = opt('--ranges', '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [a, b] = s.split('-').map(Number); return { lo: a, hi: b }
})
const inRange = (id) => ranges.some((r) => id >= r.lo && id <= r.hi)
const b = fs.readFileSync(file)
const dec = new TextDecoder('utf-8', { fatal: false })
const END = TO > 0 ? Math.min(TO, b.length) : b.length

function strict(off, maxOut) {
  const dst = Buffer.allocUnsafe(maxOut)
  let s = off, d = 0
  while (s < b.length) {
    const token = b[s++]
    let lit = token >> 4
    if (lit === 15) { let x; do { x = b[s++]; lit += x } while (x === 255 && s < b.length) }
    if (s + lit > b.length || d + lit > maxOut) break
    b.copy(dst, d, s, s + lit); s += lit; d += lit
    if (s + 2 > b.length) break
    const back = b[s] | (b[s + 1] << 8); s += 2
    if (back === 0 || back > d) return null
    let ml = token & 15
    if (ml === 15) { let x; do { x = b[s++]; ml += x } while (x === 255 && s < b.length) }
    ml += 4
    if (d + ml > maxOut) break
    for (let i = 0; i < ml; i++) { dst[d] = dst[d - back]; d++ }
    if (d >= maxOut - 8) break
  }
  return d > 0 ? { out: dst.subarray(0, d), consumed: s - off } : null
}
const field = (body, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*\'([^\']*)\'').exec(body); return r ? r[1] : null }
const score = (x) => (x.cue ? 2 : 0) + (/[\u4e00-\u9fff]/.test(x.script || '') ? 3 : 0) + (x.name ? 1 : 0)
const found = new Map()
function harvest(text, at) {
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
    const cand = { id: idn, cue: field(body, 'cue_name'), sheet: field(body, 'cue_sheet'), name: field(body, 'name'), script: (field(body, 'script1') || field(body, 'script2') || '').trim(), raw: body.length > 900 ? body.slice(0, 900) : body, at, bad: 0 }
    const prev = found.get(idn)
    if (!prev || score(cand) > score(prev)) found.set(idn, cand)
    i = end
  }
}

let hits = 0, lastLog = Date.now()
const starts = []
for (let off = FROM; off < END - 64; off++) {
  const r = strict(off, 1 << 20)
  if (!r || r.out.length < 1048560) continue
  const text = dec.decode(r.out)
  let cnt = 0, idx = 0
  while ((idx = text.indexOf('["', idx)) >= 0) { cnt++; idx += 2; if (cnt > TH) break }
  if (cnt < TH) continue
  hits++; starts.push(off)
  harvest(text, off)
  if (Date.now() - lastLog > 30000) { lastLog = Date.now(); console.log(`  @${(off / 1048576).toFixed(2)}M 真块=${hits} 命中=${found.size}`) }
}
const list = [...found.values()].sort((a, b2) => a.id - b2.id)
fs.writeFileSync(OUT, JSON.stringify({ starts, entries: list }, null, 1))
console.log(`\n完成：真块 ${hits} 个（起点已存），区间条目 ${list.length} → ${OUT}`)
console.log('真块起点:', starts.slice(0, 30).join(', '), starts.length > 30 ? '…' : '')
const missSk = [3, 7, 11, 15, 19, 23, 24, 25, 26].map((n) => 70240600 + n)
const missOs = [9, 13, 21, 25, 33, 37, 41].map((n) => 78050300 + n)
for (const [label, ids] of [['斯卡蒂缺口', missSk], ['奥西里斯缺口', missOs]]) {
  const got = ids.filter((i) => found.has(i))
  console.log(`  ${label}: ${got.length}/${ids.length}  ${got.map((i) => i % 100).join(',')}`)
  got.forEach((i) => { const e = found.get(i); console.log(`     ${i} cue=${e.cue || '(受损)'} name=${e.name || '-'} 文本=${(e.script || '').slice(0, 34)}`) })
}
