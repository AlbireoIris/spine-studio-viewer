// Validate every atlas the way spine-player's TextureAtlas parser does and
// report anything that makes a skin fail to load:
//   - a page header must be followed by attribute lines (size: ...)
//   - every referenced page PNG must exist
//   - region blocks must have a bounds line
const BASE = 'http://127.0.0.1:8877'
import fs from 'node:fs'

const manifest = await (await fetch(`${BASE}/viewer-studio/manifest.json`)).json()
const ATTR = /^(size|format|filter|repeat|pma|scale|rotate|xy|orig|offset|offsets|bounds|index|split|pad)\s*:?/i
const results = []

for (const it of manifest.items) {
  const dir = `${BASE}/skins/${it.path}`
  const issues = []
  let atlas = ''
  try { atlas = await (await fetch(`${dir}/${it.atlas}`)).text() } catch (e) { issues.push(`fetch failed: ${e.message}`) }
  const lines = atlas.split(/\r?\n/).map((l) => l.trimEnd())
  const pages = []
  let inPage = false
  let inRegion = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (!inPage) {
      // expect a page header
      if (/\.png$/i.test(line)) {
        pages.push(line)
        const next = lines[i + 1] ?? ''
        if (!/^size\s*:/i.test(next)) issues.push(`page "${line}" at line ${i + 1} is not followed by size: (next="${next.slice(0, 60)}")`)
        inPage = true
        inRegion = false
        continue
      }
      issues.push(`stray line ${i + 1} outside page: "${line.slice(0, 60)}"`)
      continue
    }
    if (/\.png$/i.test(line)) {
      // a new page header while still in a page block: only legal if previous
      // block ended; treat as a new page (spine would too)
      issues.push(`page header "${line.slice(0, 60)}" appears inside page block (line ${i + 1})`)
      pages.push(line)
      inRegion = false
      continue
    }
    if (ATTR.test(line)) continue
    if (/^-?\d/.test(line)) continue // rotate/count continuation values
    // otherwise a region name: the next non-empty value line should be bounds:
    const rest = lines.slice(i + 1).find((l) => l.trim())
    if (!inRegion) {
      if (rest && /^bounds\s*:/i.test(rest)) inRegion = true
      else issues.push(`region "${line.slice(0, 40)}" at line ${i + 1} has no bounds (next="${(rest || '').slice(0, 60)}")`)
    }
  }
  // page textures must exist
  const missing = []
  for (const p of pages) {
    const r = await fetch(`${dir}/${p}`, { method: 'HEAD' })
    if (!r.ok) missing.push(p)
  }
  if (missing.length) issues.push(`missing page PNG: ${missing.join(', ')}`)
  if (issues.length) results.push({ name: it.name, path: it.path, pages, issues })
}

const summary = { total: manifest.items.length, problemItems: results.length }
console.log(JSON.stringify({ summary, results: results.slice(0, 40) }, null, 2))
fs.writeFileSync('D:/AIHOME/Mimo/viewer-studio/atlas-validation.json', JSON.stringify({ summary, results }, null, 2), 'utf8')
