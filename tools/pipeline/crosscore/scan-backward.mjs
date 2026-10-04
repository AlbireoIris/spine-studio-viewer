// 锚点回溯枚举块起点：在锚点前的窗口内找"严格解码 consumed 正好落在锚点"的起点（强校验）
// 用法: node tools/scan-backward.mjs <blob> --anchor 11997678 --window 1048576 [--ranges ...] [--out ...]
import fs from 'node:fs'

const file = process.argv[2]
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const ANCHOR = Number(opt('--anchor', 11997678))
const WINDOW = Number(opt('--window', 1048576))
const OUT = opt('--out', 'work/evidence/entries-backward.json')
const MAXOUT = 1 << 20
const ranges = opt('--ranges', '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [a, b] = s.split('-').map(Number); return { lo: a, hi: b }
})
const inRange = (id) => ranges.some((r) => id >= r.lo && id <= r.hi)
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
function tolerant(src, off, maxOut) {
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
    if (back === 0 || back > d) { for (let i = 0; i < ml; i++) dst[d + i] = 0x20; d += ml; bad++; continue }
    for (let i = 0; i < ml; i++) { dst[d] = dst[d - back]; d++ }
    if (d >= maxOut - 8) break
  }
  return d > 0 ? { out: dst.subarray(0, d), bad, consumed: s - off } : null
}
const field = (body, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*\'([^\']*)\'').exec(body); return r ? r[1] : null }
const score = (x) => (x.cue ? 2 : 0) + (/[\u4e00-\u9fff]/.test(x.script || '') ? 3 : 0) + (x.name ? 1 : 0) - (x.bad ? 1 : 0)
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
    const prev = found.get(idn)
    if (!prev || score(cand) > score(prev)) found.set(idn, cand)
    i = end
  }
}

/* 从锚点向后回溯：找起点 s 使 strict(s).consumed 正好落在已知起点上 */
const anchors = [ANCHOR]
let cur = ANCHOR
for (let hop = 0; hop < 400 && cur > WINDOW; hop++) {
  let prevStart = -1
  for (let s = Math.max(0, cur - WINDOW); s < cur; s++) {
    const r = strict(b, s, MAXOUT)
    if (r && s + r.consumed === cur) { prevStart = s; break }
  }
  if (prevStart < 0) { console.log(`  回溯中断：锚点 ${cur} 前 ${(WINDOW / 1024).toFixed(0)}KB 内找不到精确前驱`); break }
  anchors.push(prevStart)
  cur = prevStart
  if (hop % 5 === 0) console.log(`  回溯 #${hop} → ${cur}`)
}
console.log(`\n枚举到 ${anchors.length} 个精确块起点，范围 ${Math.min(...anchors)} .. ${ANCHOR}`)

/* 对每个起点做 严格 + 容错 解码并 harvest */
const found = new Map()
let blocks = 0, badBlocks = 0
for (const st of anchors.reverse()) {
  const s1 = strict(b, st, MAXOUT)
  if (s1) { blocks++; harvest(s1, st, found) }
  const s2 = tolerant(b, st, MAXOUT)
  if (s2) { if (s2.bad) badBlocks++; harvest(s2, st, found) }
}
const list = [...found.values()].sort((a, b2) => a.id - b2.id)
fs.writeFileSync(OUT, JSON.stringify(list, null, 1))
console.log(`解码块 ${blocks}（含坏引用块 ${badBlocks}），区间条目 ${list.length} → ${OUT}`)
const missSk = [3, 7, 11, 15, 19, 23, 24, 25, 26].map((n) => 70240600 + n)
const missOs = [9, 13, 21, 25, 33, 37, 41].map((n) => 78050300 + n)
for (const [label, ids] of [['斯卡蒂缺口', missSk], ['奥西里斯缺口', missOs]]) {
  const got = ids.filter((i) => found.has(i))
  console.log(`  ${label}: ${got.length}/${ids.length}  ${got.map((i) => i % 100).join(',')}`)
  got.forEach((i) => { const e = found.get(i); console.log(`     ${i} cue=${e.cue || '(受损)'} name=${e.name || '-'} 文本=${(e.script || '').slice(0, 32)}`) })
}
