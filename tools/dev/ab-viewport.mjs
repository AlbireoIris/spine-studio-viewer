// A/B measure of "how small is the character": same skin, same animation, old
// hard-coded viewport vs the new bounds fit — measured as the share of stage
// pixels that are not the flat viewer background.
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const outDir = 'D:/AIHOME/Mimo/viewer-studio/verify'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)

/** Share of stage pixels brighter than the flat viewer background, decoded in
    the page itself so no image library is needed on the Node side. */
async function contentShare(pngPath) {
  const b64 = fs.readFileSync(pngPath).toString('base64')
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + data
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const yLimit = Math.max(1, img.height - 60) // skip the player's control bar
    const px = ctx.getImageData(0, 0, img.width, yLimit).data
    let content = 0
    for (let i = 0; i < px.length; i += 4) {
      if ((px[i] + px[i + 1] + px[i + 2]) / 3 > 40) content++
    }
    return { share: content / (img.width * yLimit), w: img.width, h: img.height }
  }, b64)
}

const results = []
for (const idx of [0, 4, 6, 9, 30, 60]) {
  await page.$$eval('.skin-item', (els, i) => els[i].click(), idx)
  for (let w = 0; w < 30; w++) {
    const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
    if (ready) break
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(800)
  const stage = await page.locator('#stage').boundingBox()

  // --- A: reproduce the old hard-coded viewport for the same animation ---
  const nameA = await page.evaluate(() => {
    const p = player
    const anim = p.animationState.getCurrent(0).animation.name
    // keep the object's other fields (animations map, pads) — setViewport reads them
    p.config.viewport = Object.assign({}, p.config.viewport, {
      x: -3000, y: -5000, width: 6000, height: 7000, transitionTime: 0,
    })
    p.setViewport(anim)
    p.previousViewport = null
    p.viewportTransitionStart = performance.now()
    return anim
  })
  await page.waitForTimeout(700)
  const shotA = `${outDir}/ab-${idx}-old.png`
  await page.screenshot({ path: shotA, clip: stage })
  const a = await contentShare(shotA)

  // --- B: the new shipping default (bounds fit + decor-free character focus) ---
  await page.evaluate(() => {
    const p = player
    const v = p.config.viewport
    delete v.x; delete v.y; delete v.width; delete v.height
    p.setViewport(p.animationState.getCurrent(0).animation.name)
    p.previousViewport = null
    p.viewportTransitionStart = performance.now()
    focusMode = 'role'
    focusCharacter(p, 0.12) // exactly what mountPlayer does by default
  })
  await page.waitForTimeout(700)
  const shotB = `${outDir}/ab-${idx}-new.png`
  await page.screenshot({ path: shotB, clip: stage })
  const b = await contentShare(shotB)

  const item = await page.evaluate(() => document.getElementById('now-name').textContent)
  results.push({ idx, item, anim: nameA, oldShare: a.share, newShare: b.share, gain: b.share / (a.share || 1e-9) })
}

// ---- zoom centering drift, in *screen* terms (what the user sees) ----
await page.$$eval('.skin-item', (els, i) => els[i].click(), 0)
await page.waitForTimeout(2000)
const centerProbe = () => page.evaluate(() => {
  const p = player
  const cw = p.canvas.clientWidth, chh = p.canvas.clientHeight
  const cam = p.sceneRenderer.camera
  // world point that currently sits at the canvas centre
  const c = cam.screenToWorld(new spine.Vector3(cw / 2, chh / 2, 0), cw, chh)
  // where does that world point land on screen?
  const s = cam.worldToScreen(new spine.Vector3(c.x, c.y, 0), cw, chh)
  const rect = p.canvas.getBoundingClientRect()
  return { world: { x: c.x, y: c.y }, screen: { x: s.x + rect.left, y: s.y + rect.top }, cw, ch: chh }
})
const z0 = await centerProbe()
await page.evaluate(() => { for (let i = 0; i < 4; i++) document.getElementById('btn-zoom-in').click() })
await page.waitForTimeout(600)
const z1 = await centerProbe()
await page.evaluate(() => { for (let i = 0; i < 8; i++) document.getElementById('btn-zoom-out').click() })
await page.waitForTimeout(600)
const z2 = await centerProbe()
const centerScreen = { x: z0.screen.x, y: z0.screen.y }
const drift = (z) => ({ x: z.screen.x - z0.screen.x, y: z.screen.y - z0.screen.y })

// ---- pan: does the grabbed world point follow the cursor? ----
const canvasBox = await page.locator('#player-container canvas').boundingBox()
const sx = canvasBox.x + canvasBox.width / 2, sy = canvasBox.y + canvasBox.height / 2
const grabBefore = await page.evaluate(([px, py]) => {
  const p = player, cam = p.sceneRenderer.camera, rect = p.canvas.getBoundingClientRect()
  const w = cam.screenToWorld(new spine.Vector3(px - rect.left, py - rect.top, 0), p.canvas.clientWidth, p.canvas.clientHeight)
  return { x: w.x, y: w.y }
}, [sx, sy])
await page.mouse.move(sx, sy)
await page.mouse.down()
await page.mouse.move(sx + 200, sy + 120, { steps: 15 })
await page.mouse.up()
await page.waitForTimeout(400)
const grabAfter = await page.evaluate(([px, py]) => {
  const p = player, cam = p.sceneRenderer.camera, rect = p.canvas.getBoundingClientRect()
  const w = cam.screenToWorld(new spine.Vector3(px - rect.left, py - rect.top, 0), p.canvas.clientWidth, p.canvas.clientHeight)
  return { x: w.x, y: w.y }
}, [sx + 200, sy + 120])

const report = {
  stageArea: results.map((r) => ({ item: r.item, anim: r.anim, oldSharePct: +(r.oldShare * 100).toFixed(1), newSharePct: +(r.newShare * 100).toFixed(1), gainX: +r.gain.toFixed(1) })),
  zoomCenterDriftPx: { afterZoomIn: drift(z1), afterZoomOut: drift(z2) },
  pan: { grabWorldBefore: grabBefore, grabWorldNow: grabAfter, driftWorld: { x: grabAfter.x - grabBefore.x, y: grabAfter.y - grabBefore.y } },
}
console.log(JSON.stringify(report, null, 2))
fs.writeFileSync(`${outDir}/ab-report.json`, JSON.stringify(report, null, 2), 'utf8')
await browser.close()
