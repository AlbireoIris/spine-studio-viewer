// Build viewer-studio/audio-index.json: the flat list of decodable audio files
// under D:\AIHOME\Mimo\audio, so the viewer can pair voices with a skin without
// a directory listing (plain http.server cannot list a directory as JSON).
import fs from 'node:fs'
import path from 'node:path'

const AUDIO_DIR = 'D:/AIHOME/Mimo/audio'
const OUT = 'D:/AIHOME/Mimo/viewer-studio/audio-index.json'
const EXT = /\.(wav|mp3|ogg|m4a)$/i

const files = fs.readdirSync(AUDIO_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && EXT.test(e.name))
  .map((e) => {
    const base = e.name.replace(EXT, '')
    return { file: e.name, base, low: base.toLowerCase(), size: fs.statSync(path.join(AUDIO_DIR, e.name)).size }
  })
  .sort((a, b) => a.low.localeCompare(b.low))

const index = {
  generated: new Date().toISOString(),
  dir: 'audio',
  count: files.length,
  files,
}
fs.writeFileSync(OUT, JSON.stringify(index), 'utf8')
const exts = files.reduce((m, f) => ((m[path.extname(f.file).slice(1)] = (m[path.extname(f.file).slice(1)] || 0) + 1), m), {})
console.log(JSON.stringify({ out: OUT, count: files.length, byExt: exts, sample: files.slice(0, 5).map((f) => f.file) }, null, 2))
