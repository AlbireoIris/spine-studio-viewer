// Verify the three fixes + the stale-page watchdog, with measurements.
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const outDir = 'D:/AIHOME/Mimo/viewer-studio/verify'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1536, height: 920 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)))
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3500)

await page.addScriptTag({
  content: `
    window.__figure = () => {
      const p = player;
      if (!p || !p.skeleton) return null;
      const b = characterBounds(p);
      if (!b) return null;
      const cw = p.canvas.clientWidth, ch = p.canvas.clientHeight, cam = p.sceneRenderer.camera;
      const xs = [], ys = [];
      for (const [x, y] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]) {
        const s = cam.worldToScreen(new spine.Vector3(x, y, 0), cw, ch);
        xs.push(s.x); ys.push(s.y);
      }
      const inRole = roleSubtreeBones(p.skeleton);
      return {
        boxWorld: { w: Math.round(b.width), h: Math.round(b.height) },
        usedRoleSubtree: !!inRole,
        shareW: +(((Math.max(...xs)-Math.min(...xs))/cw)*100).toFixed(1),
        shareH: +(((Math.max(...ys)-Math.min(...ys))/ch)*100).toFixed(1),
        offX: +((Math.max(...xs)+Math.min(...xs))/2 - cw/2).toFixed(1),
        offY: +((Math.max(...ys)+Math.min(...ys))/2 - ch/2).toFixed(1),
        zoom: +viewState.zoom.toFixed(3),
        panX: +viewState.panX.toFixed(3),
        panY: +viewState.panY.toFixed(3),
      };
    };
  `,
})

async function select(name) {
  const ok = await page.evaluate((n) => {
    const item = MANIFEST.items.find((i) => i.name === n)
    if (!item) return false
    selectSkin(item)
    return true
  }, name)
  for (let w = 0; w < 40; w++) {
    const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
    if (ready) break
    await page.waitForTimeout(300)
  }
  // wait for the camera to actually apply the new viewport: sampling between
  // frameCharacter's rAF and the player's next draw frame reports the previous
  // (much wider) frame and made the framing look wrong.
  let last = null
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate(() => {
      const p = player
      if (!p || !p.skeleton) return null
      const cam = p.sceneRenderer.camera
      return { zoom: Math.round(cam.zoom * 1000), w: Math.round(p.canvas.clientWidth * cam.zoom) }
    })
    if (now && last && now.zoom === last.zoom && now.w === last.w) break
    last = now
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(300)
  return ok
}

// ---- 1. framing on the figure ----
const framing = []
for (const name of ['78050_skin_osiris03a', '10010_skin_alps03', '20110_skin_arpeggio03', 'cg00011_starrynight', '60110_skin_burtgang03']) {
  await select(name)
  framing.push({ name, ...(await page.evaluate(() => window.__figure())) })
}
await page.screenshot({ path: `${outDir}/figure-framing.png` })

// ---- 2. view state survives skin switches ----
await select('78050_skin_osiris03a')
const base0 = await page.evaluate(() => ({ ...viewState }))
await page.evaluate(() => { document.getElementById('btn-zoom-in').click(); document.getElementById('btn-zoom-in').click() })
const box = await page.locator('#player-container canvas').boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(400)
const adjusted = await page.evaluate(() => ({ ...viewState }))
const onSame = await page.evaluate(() => window.__figure())
await select('10010_skin_alps03')
const afterSwitch = await page.evaluate(() => ({ ...viewState }))
const onOther = await page.evaluate(() => window.__figure())
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('spineStudio.view') || 'null'))
await page.evaluate(() => document.getElementById('btn-reset-view').click())
await page.waitForTimeout(500)
const afterReset = await page.evaluate(() => ({ ...viewState, figure: window.__figure() }))

// ---- 3. audio pairing ----
await select('10010_skin_alps03')
const audioAlps = await page.evaluate(async () => {
  const a = document.getElementById('audio')
  for (let i = 0; i < 20 && a.readyState < 2; i++) await new Promise((r) => setTimeout(r, 150))
  return {
    matchText: document.getElementById('audio-match').textContent,
    candidates: document.querySelectorAll('#audio-list .anim-btn').length,
    src: decodeURIComponent((a.currentSrc || a.src || '').split('/').slice(-1)[0]),
    readyState: a.readyState,
    durationSec: +(a.duration || 0).toFixed(1),
  }
})
await select('78050_skin_osiris03a')
const audioOsiris = await page.evaluate(() => ({
  matchText: document.getElementById('audio-match').textContent,
  candidates: document.querySelectorAll('#audio-list .anim-btn').length,
  src: decodeURIComponent((document.getElementById('audio').currentSrc || '').split('/').slice(-1)[0]),
}))
const searchHits = await page.evaluate(() => {
  renderAudioSearch('acheron')
  return document.querySelectorAll('#audio-search-list .anim-btn').length
})
const indexCount = await page.evaluate(() => AUDIO_INDEX.length)

// ---- 4. stale page watchdog (touch index.html, wait for the banner) ----
const before = await page.evaluate(() => document.getElementById('reload-banner').classList.contains('show'))
fs.utimesSync('D:/AIHOME/Mimo/viewer-studio/index.html', new Date(), new Date())
await page.waitForTimeout(17000)
const after = await page.evaluate(() => document.getElementById('reload-banner').classList.contains('show'))

const report = {
  framing,
  viewPersistence: { initial: base0, adjusted, onSameSkin: onSame, afterSwitch, onOtherSkin: onOther, stored, afterReset: { zoom: afterReset.zoom, panX: afterReset.panX, panY: afterReset.panY } },
  audio: { indexCount, alps: audioAlps, osiris: audioOsiris, searchHitsForAcheron: searchHits },
  stalePageWatchdog: { bannerBefore: before, bannerAfterTouchingIndex: after },
  consoleErrors: errors,
}
console.log(JSON.stringify(report, null, 2))
fs.writeFileSync(`${outDir}/fix-report.json`, JSON.stringify(report, null, 2), 'utf8')
await browser.close()
