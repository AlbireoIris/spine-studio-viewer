// 合并所有来源（多个目录的块文本 + 扫描落盘的条目 JSON）→ 回填两个皮肤的词表
import fs from 'node:fs'
import path from 'node:path'

const DIRS = ['work/skadi06', 'work/skadi06/b']
const one = (b, k) => { const r = new RegExp('\\["' + k + '"]\\s*=\\s*\'([^\']*)\'').exec(b); return r ? r[1] : null }
const clean = (s) => { const i = s.search(/\uFFFD/); return (i >= 0 ? s.slice(0, i) : s).trim() }
const OK = /^(Skadi_skin141|Osiris_skin139)_/

const map = new Map()
let blockCount = 0, jsonCount = 0
for (const d of DIRS) {
  let names = []
  try { names = fs.readdirSync(d) } catch (e) { continue }
  // 块文本
  for (const f of names.filter((x) => /\.block-\d+\.txt$/.test(x))) {
    const t = fs.readFileSync(path.join(d, f), 'utf8')
    const re = /\[(\d{6,12})\]\s*=\s*\{([^}]{20,1500})\}/g
    let m
    while ((m = re.exec(t))) {
      const b = m[2], cue = one(b, 'cue_name')
      if (!cue || !OK.test(cue)) continue
      map.set(cue, { id: Number(m[1]), cue, name: one(b, 'name'), script: (one(b, 'script1') || one(b, 'script2') || '').trim() })
    }
    blockCount++
  }
  // 扫描落盘的条目
  for (const jf of names.filter((x) => /^entries-.*\.json$/.test(x) || x === 'voice-entries-all.json' || x === 'merged-entries.json')) {
    try {
      for (const e of JSON.parse(fs.readFileSync(path.join(d, jf), 'utf8'))) {
        if (e.cue && e.script && OK.test(e.cue)) map.set(e.cue, { id: e.id, cue: e.cue, name: e.name, script: e.script })
      }
      jsonCount++
    } catch (e) {}
  }
}
const all = [...map.values()]
fs.writeFileSync('work/skadi06/merged-entries-all.json', JSON.stringify(all, null, 1))
const sk = all.filter((e) => e.cue.startsWith('Skadi_skin141')).sort((a, b) => a.cue.localeCompare(b.cue))
const os = all.filter((e) => e.cue.startsWith('Osiris_skin139')).sort((a, b) => a.cue.localeCompare(b.cue))
console.log(`来源：块文本 ${blockCount} 个 + 条目 JSON ${jsonCount} 个 → 斯卡蒂 ${sk.length} 条 / 奥西里斯 ${os.length} 条`)

const fill = (gallery, prefix, key, pat) => {
  const g = JSON.parse(fs.readFileSync(gallery, 'utf8'))
  let n = 0
  for (const row of g.rows) {
    const i = Number(pat.exec(path.basename(row.cue, '.wav'))?.[1])
    if (!i) continue
    const e = key.find((x) => x.cue === `${prefix}_${String(i).padStart(2, '0')}`)
    if (e && e.script) { row.text = clean(e.script); row.label = e.name || ''; row.source = '游戏脚本表（cue_name + script1）'; n++ }
  }
  g.note = `台词取自游戏脚本表（luascripts 的 LZ4 块解出的 [cue_name]=台词）；${n}/${g.rows.length} 条已填。`
  fs.writeFileSync(gallery, JSON.stringify(g, null, 1))
  console.log(`${path.basename(gallery)}: ${n}/${g.rows.length}`)
}
fill('skadi-preview/data/voice-lines.json', 'Skadi_skin141', sk, /Skadi141_(\d+)/)
fill('skadi-preview/data/voice-lines-osiris.json', 'Osiris_skin139', os, /Osiris139_(\d+)/)
console.log('\n斯卡蒂 cue:', sk.map((e) => e.cue.slice(-2)).join(','))
console.log('奥西里斯 cue:', os.map((e) => e.cue.slice(-2)).join(','))
