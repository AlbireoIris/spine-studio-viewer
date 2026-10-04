// 用"括号配平"的方式解析语音表（替代会漏嵌套表/超长条目的正则）
// 思路：解出 LZ4 块 → 拼接文本 → 逐字符扫描，按 [id]={ ... } 的**花括号深度**切条目
// 用法: node tools/extract-voice-depth.mjs <blob> --keys A,B --out file
import fs from 'node:fs'

const file = process.argv[2]
const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d }
const KEYS = opt('--keys', 'Skadi_skin141,Osiris_skin').split(',').map((s) => s.trim()).filter(Boolean)
const OUT = opt('--out', 'work/evidence/voice-entries-depth.json')
const DUMPALL = opt('--dump-all', null)   // 把所有切出来的条目落盘（用于反查缺口命名）
const MAXOUT = 1 << 20
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
  return d > 0 ? { out: dst.subarray(0, d), consumed: s - off } : null
}

/* ---- 括号配平解析：从 text 里抽出所有 [id]={...} 条目（支持嵌套表与超长体）---- */
function parseEntries(text) {
  const out = []
  const n = text.length
  for (let i = 0; i < n; i++) {
    if (text[i] !== '[') continue
    let j = i + 1, id = ''
    while (j < n && text[j] >= '0' && text[j] <= '9' && id.length < 12) { id += text[j]; j++ }
    if (id.length < 6) continue
    if (text[j] !== ']') continue
    let k = j + 1
    while (k < n && (text[k] === ' ' || text[k] === '\t')) k++
    if (text[k] !== '=') continue
    k++
    while (k < n && (text[k] === ' ' || text[k] === '\t')) k++
    if (text[k] !== '{') continue
    // 配平扫描（跳过字符串）
    let depth = 0, q = null, end = -1
    for (let m = k; m < n; m++) {
      const c = text[m]
      if (q) { if (c === q && text[m - 1] !== '\\') q = null; continue }
      if (c === "'" || c === '"') { q = c; continue }
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { end = m; break } }
    }
    if (end < 0) { i = j; continue }
    out.push({ id: Number(id), body: text.slice(k + 1, end) })
    i = end
  }
  return out
}
const field = (body, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*\'([^\']*)\'').exec(body); return r ? r[1] : null }
const numf = (body, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*(\\d+)').exec(body); return r ? Number(r[1]) : null }

const found = new Map()
const allEntries = []
let off = 0, blocks = 0, chars = 0, entries = 0
while (off < b.length) {
  let hit = null
  for (let o = off; o < Math.min(b.length, off + 4 * 1024 * 1024); o++) {
    const r = lz4(b, o, MAXOUT)
    if (!r || r.out.length < 2048) continue
    const text = dec.decode(r.out)
    if (!text.includes('cue_sheet')) continue
    hit = { off: o, ...r, text }
    break
  }
  if (!hit) { off += 4 * 1024 * 1024; continue }
  blocks++; chars += hit.text.length
  for (const e of parseEntries(hit.text)) {
    entries++
    if (DUMPALL) allEntries.push({ id: e.id, cue: field(e.body, 'cue_name'), sheet: field(e.body, 'cue_sheet'), name: field(e.body, 'name'), script: (field(e.body, 'script1') || field(e.body, 'script2') || '').trim() })
    const cue = field(e.body, 'cue_name')
    if (!cue || !KEYS.some((k) => cue.startsWith(k))) continue
    found.set(cue, { id: e.id, cue, name: field(e.body, 'name'), sheet: field(e.body, 'cue_sheet'), script: (field(e.body, 'script1') || field(e.body, 'script2') || '').trim(), group: numf(e.body, 'group') })
  }
  if (blocks % 5 === 0) console.log(`  块 ${blocks} / ${found.size} 条命中 / 已切条目 ${entries}`)
  off = hit.off + Math.max(1, hit.consumed)
}
if (DUMPALL) { fs.writeFileSync(DUMPALL, JSON.stringify(allEntries, null, 1)); console.log(`已落盘全部条目 ${allEntries.length} 条 → ${DUMPALL}`) }
const list = [...found.values()]
fs.writeFileSync(OUT, JSON.stringify(list, null, 1))
console.log(`\n块 ${blocks}，共切成条目 ${entries} 条（配平解析），命中目标前缀 ${list.length} 条 → ${OUT}`)
for (const k of KEYS) {
  const sub = list.filter((e) => e.cue.startsWith(k)).sort((a, b2) => a.cue.localeCompare(b2.cue))
  console.log(`${k}: ${sub.length} 条 → cue ${sub.map((e) => e.cue.slice(-2)).join(',')}`)
}
