// 从导出的 cfgSound.lua 抽取两个皮肤的语音表，回填两个词表（收尾）
import fs from 'node:fs'
import path from 'node:path'

const SRC = 'work/lua/cfgSound.lua'
const raw = fs.readFileSync(SRC, 'utf8')
console.log(`数据源: ${SRC}  ${(raw.length / 1048576).toFixed(1)}M 字符`)

// 括号配平解析（与既有工具同法）
const field = (body, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*\'([^\']*)\'').exec(body); return r ? r[1] : null }
const numf = (body, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*(\\d+)').exec(body); return r ? Number(r[1]) : null }
const clean = (s) => (s || '').replace(/\uFFFD+/g, '').trim()

const found = new Map()
const n = raw.length
for (let i = 0; i < n; i++) {
  if (raw[i] !== '[') continue
  let j = i + 1, id = ''
  while (j < n && raw[j] >= '0' && raw[j] <= '9' && id.length < 12) { id += raw[j]; j++ }
  if (id.length < 6 || raw[j] !== ']') continue
  let k = j + 1
  while (k < n && (raw[k] === ' ' || raw[k] === '\t')) k++
  if (raw[k] !== '=') continue
  k++
  while (k < n && (raw[k] === ' ' || raw[k] === '\t')) k++
  if (raw[k] !== '{') continue
  let depth = 0, q = null, end = -1
  for (let m = k; m < n; m++) {
    const c = raw[m]
    if (q) { if (c === q && raw[m - 1] !== '\\') q = null; continue }
    if (c === "'" || c === '"') { q = c; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) { end = m; break } }
  }
  if (end < 0) { i = j; continue }
  const body = raw.slice(k + 1, end)
  const cue = field(body, 'cue_name')
  if (cue && /^(Skadi_skin141|Osiris_skin139)_/.test(cue)) {
    found.set(cue, {
      id: Number(id), cue, name: field(body, 'name'),
      script: clean(field(body, 'script1') || field(body, 'script2')),
      sheet: field(body, 'cue_sheet'), group: numf(body, 'group'),
    })
  }
  i = end
}
const all = [...found.values()].sort((a, b) => a.cue.localeCompare(b.cue))
console.log(`抽到条目: ${all.length}（斯卡蒂 ${all.filter((e) => e.cue.startsWith('Skadi')).length} / 奥西里斯 ${all.filter((e) => e.cue.startsWith('Osiris')).length}）`)
fs.writeFileSync('work/evidence/cfgsound-entries.json', JSON.stringify(all, null, 1))

const fill = (gallery, prefix, pat, label) => {
  const g = JSON.parse(fs.readFileSync(gallery, 'utf8'))
  const byCue = new Map(all.filter((e) => e.cue.startsWith(prefix)).map((e) => [e.cue, e]))
  let added = 0
  for (const row of g.rows) {
    const i = Number(pat.exec(path.basename(row.cue, '.wav'))?.[1])
    if (!i) continue
    const e = byCue.get(`${prefix}_${String(i).padStart(2, '0')}`)
    if (e && e.script) {
      if (!row.text) added++
      row.text = e.script
      if (e.name) row.label = e.name.replace(/（.*?）/g, '').trim() || row.label
      row.source = 'cfgSound.lua（AssetBundleTools/AssetsTools.NET 解密导出）'
    }
  }
  g.note = '台词取自游戏 cfgSound.lua（经 AssestBundleTools 的 AssetsTools.NET 解密导出）；' + g.rows.filter((r) => r.text).length + '/' + g.rows.length + ' 条已填。'
  fs.writeFileSync(gallery, JSON.stringify(g, null, 1))
  const filled = g.rows.filter((r) => r.text).length
  console.log(`  ${label}: ${filled}/${g.rows.length}（本次新增 ${added}）`)
  if (filled < g.rows.length) console.log(`     仍缺: ${g.rows.filter((r) => !r.text).map((r) => r.n).join(',')}`)
  return filled === g.rows.length
}
const ok1 = fill('skadi-preview/data/voice-lines.json', 'Skadi_skin141', /Skadi141_(\d+)/, '斯卡蒂')
const ok2 = fill('skadi-preview/data/voice-lines-osiris.json', 'Osiris_skin139', /Osiris139_(\d+)/, '奥西里斯')
console.log(ok1 && ok2 ? '\n*** 两个词表均已 100% 补全 ***' : '\n仍有缺口（见上）')
