// Deep asset check: multi-page atlases (are all page PNGs present?), PNG pixel
// dimensions (max texture size), and skeleton feature usage that spine-player
// can choke on (sequences, physics is fine, etc.).
const BASE = 'http://127.0.0.1:8877'
import fs from 'node:fs'

function pngSize(buf) {
  if (buf.length < 24) return null
  if (buf.readUInt32BE(0) !== 0x89504e47) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

const manifest = await (await fetch(`${BASE}/viewer-studio/manifest.json`)).json()
const rows = []
for (const it of manifest.items) {
  const dir = `${BASE}/skins/${it.path}`
  const row = { id: it.id, name: it.name, pages: [], missingPages: [], dims: null, jsonBytes: 0, err: '' }
  try {
    const atlas = await (await fetch(`${dir}/${it.atlas}`)).text()
    const lines = atlas.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (/\.png\s*$/.test(lines[i]) && /size:/.test(lines[i + 1] ?? '')) row.pages.push(lines[i].trim())
    }
    for (const page of row.pages) {
      const r = await fetch(`${dir}/${page}`, { method: 'HEAD' })
      if (!r.ok) row.missingPages.push(page)
    }
    // main texture dims + json size
    if (it.png) {
      const r = await fetch(`${dir}/${it.png}`)
      if (r.ok) row.dims = pngSize(Buffer.from(await r.arrayBuffer()))
    }
    const jr = await fetch(`${dir}/${it.json}`, { method: 'HEAD' })
    row.jsonBytes = Number(jr.headers.get('content-length') || 0)
  } catch (e) { row.err = String(e).slice(0, 120) }
  rows.push(row)
}

const multiPage = rows.filter((r) => r.pages.length > 1)
const withMissing = rows.filter((r) => r.missingPages.length)
const MAXDIM = 8192
const oversize = rows.filter((r) => r.dims && (r.dims.w > MAXDIM || r.dims.h > MAXDIM))
const hugest = [...rows].sort((a, b) => (b.dims?.w * b.dims?.h || 0) - (a.dims?.w * a.dims?.h || 0)).slice(0, 8)

const report = {
  total: rows.length,
  multiPageCount: multiPage.length,
  multiPageSample: multiPage.slice(0, 15).map((r) => ({ name: r.name, pages: r.pages, missing: r.missingPages })),
  itemsWithMissingPages: withMissing.length,
  missingSample: withMissing.slice(0, 20).map((r) => ({ name: r.name, missing: r.missingPages, pages: r.pages })),
  oversizeTextures: oversize.length,
  oversizeSample: oversize.slice(0, 15).map((r) => ({ name: r.name, dims: r.dims })),
  largestTextures: hugest.map((r) => ({ name: r.name, dims: r.dims, jsonBytes: r.jsonBytes })),
  errors: rows.filter((r) => r.err),
}
console.log(JSON.stringify(report, null, 2))
fs.writeFileSync('D:/AIHOME/Mimo/viewer-studio/asset-deep-audit.json', JSON.stringify({ report, rows }, null, 2), 'utf8')
