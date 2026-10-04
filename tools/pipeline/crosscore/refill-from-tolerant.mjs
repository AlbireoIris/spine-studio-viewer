// 容错扫描结果 → 抢救清洗 → 按 id 回填两个词表
// 用法: node tools/refill-from-tolerant.mjs [evidence.json]
import fs from 'node:fs'
import path from 'node:path'

const SRC = process.argv[2] || 'work/evidence/entries-tolerant.json'
const rows = JSON.parse(fs.readFileSync(SRC, 'utf8'))
console.log('容错扫描条目:', rows.length)

/* 抢救清洗：保留中文/常见标点/数字字母，取最长的一段"像台词"的连续文本 */
const seg = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef，。！？…、—～：；（）「」『』《》·0-9A-Za-z~!?.,:;\-]{6,}/g
const dirty = /(skin\d+[a-z]?|_skin\d+|cv_skin|\.acb|\[\d+\]|\d{6,})/gi
function salvage(raw, script) {
  const clean = (s) => s.replace(dirty, '').replace(/[\uFFFD]+/g, '').replace(/^[，。、；：\s_~-]+/, '').trim()
  const good = script && /[\u4e00-\u9fff]/.test(script) && !/\uFFFD/.test(script) ? clean(script) : ''
  if (good.length >= 6) return good                       // 字段完整、直接用
  const parts = []
  let m
  seg.lastIndex = 0
  while ((m = seg.exec(String(raw || '')))) parts.push(m[0])
  parts.sort((a, b) => [...b].filter((c) => c >= '\u4e00' && c <= '\u9fff').length - [...a].filter((c) => c >= '\u4e00' && c <= '\u9fff').length)
  return clean(parts[0] || '')
}

const byId = new Map()
for (const r of rows) {
  const text = salvage(r.raw, r.script)
  const prev = byId.get(r.id)
  if (!prev || text.length > prev.text.length) byId.set(r.id, { id: r.id, cue: r.cue, name: r.name, text })
}
console.log('清洗后有文本的条目:', [...byId.values()].filter((x) => x.text.length >= 6).length)

const fill = (gallery, base, pat, label) => {
  const g = JSON.parse(fs.readFileSync(gallery, 'utf8'))
  let added = 0
  for (const row of g.rows) {
    const i = Number(pat.exec(path.basename(row.cue, '.wav'))?.[1])
    if (!i) continue
    const e = byId.get(base + i)
    if (e && e.text.length >= 6) {
      if (!row.text) added++
      row.text = e.text
      if (e.name && /（/.test(e.name)) row.label = e.name.replace(/（.*?）/g, '').trim() || row.label
      row.source = '游戏脚本表（受损块容错解码+抢救）'
    }
  }
  fs.writeFileSync(gallery, JSON.stringify(g, null, 1))
  const filled = g.rows.filter((r) => r.text).length
  console.log(`  ${label}: ${filled}/${g.rows.length}（本次新增 ${added}）`)
  console.log(`     仍缺: ${g.rows.filter((r) => !r.text).map((r) => r.n).join(',') || '（无）'}`)
  return filled === g.rows.length
}
const ok1 = fill('skadi-preview/data/voice-lines.json', 70240600, /Skadi141_(\d+)/, '斯卡蒂')
const ok2 = fill('skadi-preview/data/voice-lines-osiris.json', 78050300, /Osiris139_(\d+)/, '奥西里斯')
console.log(ok1 && ok2 ? '\n✅ 两个词表均已 100% 补全' : '\n⚠️ 仍有缺口（见上）')
