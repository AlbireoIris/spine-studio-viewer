// Audit every manifest item over HTTP: are the json/atlas/png the viewer builds
// actually served? Also reports skeleton spine version and atlas page/PNG match.
const BASE = 'http://127.0.0.1:8877'
const fs = await import('node:fs')

const manifest = await (await fetch(`${BASE}/viewer-studio/manifest.json`)).json()
const rows = []
for (const it of manifest.items) {
  const dir = `${BASE}/skins/${it.path}`
  const row = { id: it.id, path: it.path, json: 0, atlas: 0, png: 0, spine: null, atlasPage: null, pageMatchesPng: null, note: '' }
  for (const [key, file] of [['json', it.json], ['atlas', it.atlas], ['png', it.png]]) {
    if (!file) { row[key] = -1; continue }
    try {
      const r = await fetch(`${dir}/${file}`, { method: 'HEAD' })
      row[key] = r.status
    } catch (e) { row[key] = -2; row.note += ` ${key}:${e.message}` }
  }
  if (row.json === 200) {
    try {
      const txt = await (await fetch(`${dir}/${it.json}`)).text()
      const v = /"spine"\s*:\s*"([^"]+)"/.exec(txt)
      row.spine = v ? v[1] : '?'
    } catch (e) { row.spine = 'ERR' }
  }
  if (row.atlas === 200) {
    try {
      const txt = await (await fetch(`${dir}/${it.atlas}`)).text()
      const page = txt.split(/\r?\n/)[0].trim()
      row.atlasPage = page
      row.pageMatchesPng = page === it.png
    } catch (e) { row.atlasPage = 'ERR' }
  }
  rows.push(row)
}

const bad = rows.filter((r) => r.json !== 200 || r.atlas !== 200 || r.png !== 200)
const versionHist = {}
for (const r of rows) versionHist[r.spine] = (versionHist[r.spine] ?? 0) + 1
const pageMismatch = rows.filter((r) => r.pageMatchesPng === false)

const report = {
  total: rows.length,
  ok: rows.length - bad.length,
  broken: bad.length,
  spineVersions: versionHist,
  atlasPageMismatch: pageMismatch.length,
  brokenSample: bad.slice(0, 40),
  pageMismatchSample: pageMismatch.slice(0, 20),
}
fs.writeFileSync('D:/AIHOME/Mimo/viewer-studio/asset-audit.json', JSON.stringify({ report, rows }, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))
