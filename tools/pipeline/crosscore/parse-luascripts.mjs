// 正式解析器：按 luascripts 的容器格式解析（不再硬破解）
// 结构： [0..146] Unity 序列化(ABCustom) | [152..] UnityFS 头 | [204..204+cbi] 块表 | [dataStart..] 连续 1MB 数据块(LZ4HC)
// 用法: node tools/parse-luascripts.mjs <blob> --ranges A-B,C-D --out entries.json
import fs from 'node:fs'

const file = process.argv[2] || 'work/raw-pull/luascripts.bin'
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const OUT = opt('--out', 'work/evidence/entries-parsed.json')
const ranges = opt('--ranges', '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [a, b] = s.split('-').map(Number); return { lo: a, hi: b }
})
const inRange = (id) => ranges.some((r) => id >= r.lo && id <= r.hi)
const b = fs.readFileSync(file)
const dec = new TextDecoder('utf-8', { fatal: false })
const align16 = (x) => (x + 15) & ~15

/* ---------- 1) 解析外层与 bundle 头 ---------- */
const sigAt = b.indexOf(Buffer.from('nityFS', 'latin1')) - 1
const readCStr = (off) => { let e = off; while (e < b.length && b[e] !== 0) e++; return { s: b.subarray(off, e).toString('utf8'), next: e + 1 } }
let p = sigAt + 8
const version = b.readUInt32BE(p); p += 4
const u1 = readCStr(p); p = u1.next
const u2 = readCStr(p); p = u2.next
const size = Number(b.readBigInt64BE(p)); p += 8
const cbiSize = b.readUInt32BE(p); p += 4
const ubiSize = b.readUInt32BE(p); p += 4
const flags = b.readUInt32BE(p); p += 4
const compType = flags & 0x3f
const dataStart = p + cbiSize            // 块表紧随头部（0x80 未置位）
console.log(`[头] bundle@${sigAt} ver=${version} size=${size} 块表=${cbiSize}/${ubiSize} flags=0x${flags.toString(16)}`)
console.log(`     压缩=${compType === 3 ? 'LZ4HC' : compType === 1 ? 'LZ4' : compType}  blocks+dir合并=${!!(flags & 0x40)}  归档加密=${!!(flags & 0x200)}`)
console.log(`[布局] 块表: ${p}..${dataStart}   数据块起始: ${dataStart}`)

/* ---------- 2) 逐块解码（容错；块连续，1MB/块） ---------- */
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
const found = new Map()
let blocks = 0, textTotal = 0, badTotal = 0
function harvest(r, at) {
  if (!r) return
  const text = dec.decode(r.out); textTotal += text.length
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
    const cand = { id: idn, cue: field(body, 'cue_name'), sheet: field(body, 'cue_sheet'), name: field(body, 'name'), script: (field(body, 'script1') || field(body, 'script2') || '').trim(), raw: body.length > 900 ? body.slice(0, 900) : body, at, bad: r.bad || 0 }
    const score = (x) => (x.cue ? 2 : 0) + (/[\u4e00-\u9fff]/.test(x.script || '') ? 3 : 0) + (x.name ? 1 : 0) - (x.bad ? 1 : 0)
    const prev = found.get(idn)
    if (!prev || score(cand) > score(prev)) found.set(idn, cand)
    i = end
  }
}

let off = dataStart
while (off < b.length - 64 && blocks < 200) {
  const strict = dect(off, 1 << 20, false)
  const tol = dect(off, 1 << 20, true)
  if (!tol) break
  blocks++; badTotal += tol.bad
  harvest(strict, off)          // 严格解（干净）
  harvest(tol, off)             // 容错解（覆盖受损块）
  const next = off + Math.max(1, tol.consumed)
  if (blocks % 20 === 0) console.log(`  块 ${blocks} @${(off / 1048576).toFixed(2)}M 文本 ${(textTotal / 1048576).toFixed(1)}M 字符 命中 ${found.size}`)
  off = next > off ? next : off + 1
}
console.log(`\n[解码] 块 ${blocks}（每块≈1MB），文本合计 ${(textTotal / 1048576).toFixed(1)}M 字符，坏引用 ${badTotal}`)
const list = [...found.values()].sort((a, b2) => a.id - b2.id)
fs.writeFileSync(OUT, JSON.stringify(list, null, 1))
console.log(`[条目] 区间命中 ${list.length} → ${OUT}`)
const missSk = [3, 7, 11, 15, 19, 23, 24, 25, 26].map((n) => 70240600 + n)
const missOs = [9, 13, 21, 25, 33, 37, 41].map((n) => 78050300 + n)
for (const [label, ids] of [['斯卡蒂缺口', missSk], ['奥西里斯缺口', missOs]]) {
  const got = ids.filter((i) => found.has(i))
  console.log(`  ${label}: ${got.length}/${ids.length}  ${got.map((i) => i % 100).join(',')}`)
  got.forEach((i) => { const e = found.get(i); console.log(`     ${i} cue=${e.cue || '(受损)'} name=${e.name || '-'} 文本=${(e.script || '').slice(0, 36)}`) })
}
