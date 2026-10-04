// 按格式的链式解析（快）：从数据起始 4072 出发，严格解码 off += consumed 推进；
// 坏块处用"严格解码≈1MB"判据在 64KB 内重同步。每块做 严格+容错 双解并采条目。
import fs from 'node:fs'
const file = process.argv[2] || 'work/raw-pull/luascripts.bin'
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const OUT = opt('--out', 'work/evidence/entries-walk.json')
const START = Number(opt('--start', 4072))
const RESYNC = Number(opt('--resync', 65536))
const ranges = opt('--ranges', '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [a, b] = s.split('-').map(Number); return { lo: a, hi: b }
})
const inRange = (id) => ranges.some((r) => id >= r.lo && id <= r.hi)
const b = fs.readFileSync(file)
const dec = new TextDecoder('utf-8', { fatal: false })

function dect(off, maxOut, tolerant) {
  const dst = Buffer.allocUnsafe(maxOut)
  let s = off, d = 0, bad = 0
  while (s < b.length) {
    const token = b[s++]
    let lit = token >> 4
    if (lit === 15) { let x; do { x = b[s++]; lit += x } while (x === 255 && s < b.length) }
    if (s + lit > b.length || d + lit > maxOut) break
    b.copy(dst, d, s, s + lit); s += lit; d += lit
    if (s + 2 > b.length) break
    const back = b[s] | (b[s + 1] << 8); s += 2
    let ml = token & 15
    if (ml === 15) { let x; do { x = b[s++]; ml += x } while (x === 255 && s < b.length) }
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
const ok1MB = (r) => r && r.out.length >= 1048560

let off = START, blocks = 0, resyncs = 0, badBlocks = 0, chars = 0
const t0 = Date.now()
while (off < b.length - 64) {
  const r = dect(off, 1 << 20, false)
  if (ok1MB(r)) {
    blocks++; chars += r.out.length
    harvest(r, off)
    const t = dect(off, 1 << 20, true)
    if (t && t.bad) { badBlocks++; harvest(t, off) }
    const next = off + Math.max(1, r.consumed)
    off = next > off ? next : off + 1
    if (blocks % 20 === 0) console.log(`  块 ${blocks} @${(off / 1048576).toFixed(2)}M 坏块 ${badBlocks} 命中 ${found.size}`)
    continue
  }
  let moved = false
  for (let k = 1; k <= RESYNC; k++) { if (ok1MB(dect(off + k, 1 << 20, false))) { off += k; resyncs++; moved = true; break } }
  if (!moved) off += RESYNC
}
console.log(`\n[链式解析] 块 ${blocks}（坏块 ${badBlocks}）重同步 ${resyncs} 次 文本 ${(chars / 1048576).toFixed(1)}M 字符  用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const list = [...found.values()].sort((a, b2) => a.id - b2.id)
fs.writeFileSync(OUT, JSON.stringify(list, null, 1))
console.log(`[条目] ${list.length} → ${OUT}`)
const missSk = [3, 7, 11, 15, 19, 23, 24, 25, 26].map((n) => 70240600 + n)
const missOs = [9, 13, 21, 25, 33, 37, 41].map((n) => 78050300 + n)
for (const [label, ids] of [['斯卡蒂缺口', missSk], ['奥西里斯缺口', missOs]]) {
  const got = ids.filter((i) => found.has(i))
  console.log(`  ${label}: ${got.length}/${ids.length}  ${got.map((i) => i % 100).join(',')}`)
  got.forEach((i) => { const e = found.get(i); console.log(`     ${i} cue=${e.cue || '(受损)'} name=${e.name || '-'} 文本=${(e.script || '').slice(0, 34)}`) })
}
