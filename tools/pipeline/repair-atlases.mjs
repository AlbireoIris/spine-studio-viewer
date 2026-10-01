// Repair extracted Spine atlases:
//   * strip the Unity TextAsset NUL padding + name header that AssetStudio leaves
//     at the top (spine-player reads the first non-empty line as the page name,
//     so a polluted header makes it request "<name>.atlas" as a texture and the
//     whole skin fails to load);
//   * make every page name match a texture that actually exists next to it,
//     matching by the size the atlas declares.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.argv[2] || 'D:/AIHOME/Mimo/skins'
const APPLY = !process.argv.includes('--dry')

function pngSize(file) {
  const b = fs.readFileSync(file).subarray(0, 24)
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

function* atlases(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* atlases(p)
    else if (entry.name.toLowerCase().endsWith('.atlas')) yield p
  }
}

const report = { scanned: 0, nulFixed: 0, headerTrimmed: 0, pageRenamed: 0, unchanged: 0, problems: [] }

for (const file of atlases(ROOT)) {
  report.scanned++
  const dir = path.dirname(file)
  let raw = fs.readFileSync(file, 'utf8')
  const hadNul = raw.includes('\u0000')
  let text = raw.replace(/\u0000/g, '')
  let lines = text.split(/\r?\n/)

  // drop anything before the first real page header (Unity name header, blanks)
  const isPage = (l, i) => /^\S.*\.png$/i.test(l) && (i + 1 >= lines.length || /^\s*size\s*:/i.test(lines[i + 1] || ''))
  const firstPage = lines.findIndex((l, i) => isPage(l, i))
  if (firstPage < 0) {
    report.problems.push({ file, why: 'no page header found' })
    continue
  }
  const trimmed = firstPage > 0
  lines = lines.slice(firstPage)

  // page name -> existing texture, matched on the declared size
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'))
  const used = new Set()
  const sizes = new Map(files.map((f) => [f, pngSize(path.join(dir, f))]))
  let renamed = false
  for (let i = 0; i < lines.length; i++) {
    if (!isPage(lines[i], i)) continue
    const name = lines[i].trim()
    if (fs.existsSync(path.join(dir, name))) { used.add(name); continue }
    const m = /^\s*size\s*:\s*(\d+)\s*,\s*(\d+)/i.exec(lines[i + 1] || '')
    const want = m ? [Number(m[1]), Number(m[2])] : null
    let pick = want ? files.find((f) => !used.has(f) && sizes.get(f) && sizes.get(f)[0] === want[0] && sizes.get(f)[1] === want[1]) : null
    if (!pick) pick = files.find((f) => !used.has(f))
    if (!pick) { report.problems.push({ file, why: `page "${name}" missing and no texture to map` }); continue }
    used.add(pick)
    lines[i] = pick
    renamed = true
  }

  const out = lines.join('\n')
  const changed = hadNul || trimmed || renamed
  if (!changed) { report.unchanged++; continue }
  if (hadNul) report.nulFixed++
  if (trimmed) report.headerTrimmed++
  if (renamed) report.pageRenamed++
  if (APPLY) fs.writeFileSync(file, out.endsWith('\n') ? out : out + '\n', 'utf8')
}

console.log(JSON.stringify(report, null, 2))
