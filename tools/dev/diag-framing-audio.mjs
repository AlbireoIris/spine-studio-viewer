// 1) How small is the character *now* on the user's screen size, for the items
//    they are most likely looking at (the boot item + CG-like scenes).
// 2) How many skins could be matched to an audio file by character name.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

// ---------- part 2: audio matching coverage (offline) ----------
const manifest = JSON.parse(fs.readFileSync('D:/AIHOME/Mimo/viewer-studio/manifest.json', 'utf8'))
const audioDir = 'D:/AIHOME/Mimo/audio'
const audio = fs.readdirSync(audioDir).filter((f) => /\.(wav|mp3|ogg)$/i.test(f)).map((f) => ({ file: f, base: f.replace(/\.[^.]+$/, '') }))
const audioLower = audio.map((a) => ({ ...a, low: a.base.toLowerCase() }))

function tokenOf(item) {
  const n = item.name.toLowerCase()
  let m = /^(\d+)_skin_?([a-z]+?)\d*$/.exec(n)
  if (m) return m[2]
  m = /^(\d+)_break_?([a-z]+?)\d*$/.exec(n)
  if (m) return m[2]
  m = /prefabs_spine_(\d+)_skin_?([a-z]+?)\d*/.exec(n)
  if (m) return m[2]
  m = /^([a-z][a-z_]+?)\d*$/.exec(item.name.toLowerCase())
  return m ? m[1].replace(/_(spine|break|skin)$/, '') : null
}

const coverage = []
for (const item of manifest.items) {
  const token = tokenOf(item)
  const stem = item.json.replace(/\.json$/i, '')
  let cands = audioLower.filter((a) => a.low === stem.toLowerCase())
  let how = 'exact'
  if (!cands.length && token && token.length >= 3) {
    cands = audioLower.filter((a) => a.low === token || a.low.startsWith(token + '_') || a.low.startsWith(token))
    how = 'token'
  }
  coverage.push({ name: item.name, token, how, n: cands.length, first: cands[0]?.file || null })
}
const hits = coverage.filter((c) => c.n > 0)
const summary = {
  skins: coverage.length,
  matched: hits.length,
  matchRate: +(hits.length / coverage.length * 100).toFixed(1) + '%',
  byHow: { exact: coverage.filter((c) => c.n && c.how === 'exact').length, token: coverage.filter((c) => c.n && c.how === 'token').length },
  examples: hits.slice(0, 10).map((h) => ({ skin: h.name, token: h.token, candidates: h.n, first: h.first })),
  unmatchedExamples: coverage.filter((c) => !c.n).slice(0, 10).map((c) => ({ skin: c.name, token: c.token })),
}
console.log('AUDIO COVERAGE')
console.log(JSON.stringify(summary, null, 2))

// ---------- part 1: framing at the user's window size ----------
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1536, height: 920 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)
await page.addScriptTag({
  content: `
    window.__share = () => {
      const p = player;
      if (!p || !p.skeleton) return null;
      const b = characterBounds(p);
      const cw = p.canvas.clientWidth, ch = p.canvas.clientHeight, cam = p.sceneRenderer.camera;
      const xs = [], ys = [];
      for (const [x, y] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]) {
        const s = cam.worldToScreen(new spine.Vector3(x, y, 0), cw, ch);
        xs.push(s.x); ys.push(s.y);
      }
      return {
        stage: { w: cw, h: ch },
        charPx: { w: Math.round(Math.max(...xs)-Math.min(...xs)), h: Math.round(Math.max(...ys)-Math.min(...ys)) },
        shareW: +(((Math.max(...xs)-Math.min(...xs))/cw)*100).toFixed(1),
        shareH: +(((Math.max(...ys)-Math.min(...ys))/ch)*100).toFixed(1),
        offX: +((Math.max(...xs)+Math.min(...xs))/2 - cw/2).toFixed(1),
        offY: +((Math.max(...ys)+Math.min(...ys))/2 - ch/2).toFixed(1),
      };
    };
  `,
})
const rows = []
for (const name of ['78050_skin_osiris03a', '10010_skin_alps03', '20110_skin_arpeggio03', 'cg00011_starrynight', '60110_skin_burtgang03']) {
  const ok = await page.evaluate((n) => {
    const item = MANIFEST.items.find((i) => i.name === n)
    if (!item) return false
    selectSkin(item)
    return true
  }, name)
  if (!ok) { rows.push({ name, error: 'not in manifest' }); continue }
  for (let w = 0; w < 40; w++) {
    const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
    if (ready) break
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(900)
  const s = await page.evaluate(() => window.__share())
  rows.push({ name, ...(s || { error: 'no skeleton' }) })
}
console.log('FRAMING AT 1536x920 (stage size in brackets)')
console.log(JSON.stringify(rows, null, 2))
await browser.close()
