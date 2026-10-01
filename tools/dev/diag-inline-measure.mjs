// Same run: measure, then screenshot, then measure again — to tell "the metric
// is wrong" from "the frame drifts after load".
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const name = process.argv[2] || '78050_skin_osiris03a'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1536, height: 920 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)
await page.evaluate((n) => { const i = MANIFEST.items.find((x) => x.name === n); if (i) selectSkin(i) }, name)
for (let w = 0; w < 40; w++) {
  const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
  if (ready) break
  await page.waitForTimeout(300)
}

const snapshot = () => page.evaluate(() => {
  const p = player
  if (!p || !p.skeleton) return null
  const r = (b) => (b ? `${Math.round(b.width)}x${Math.round(b.height)}` : 'null')
  const cb = characterBounds(p)
  const v = p.currentViewport
  const cam = p.sceneRenderer.camera
  const cw = p.canvas.clientWidth, ch = p.canvas.clientHeight
  const visW = cw * cam.zoom, visH = ch * cam.zoom
  return {
    anim: p.animationState.getCurrent(0).animation.name,
    charBounds: r(cb),
    charBoundsCentre: cb ? `${Math.round(cb.x + cb.width / 2)},${Math.round(cb.y + cb.height / 2)}` : null,
    baseBox: baseBox ? r(baseBox) : null,
    viewport: `${Math.round(v.width)}x${Math.round(v.height)} padL=${Math.round(v.padLeft)} padT=${Math.round(v.padTop)}`,
    visibleWorld: `${Math.round(visW)}x${Math.round(visH)}`,
    charShareOfVisible: cb ? `${(cb.width / visW * 100).toFixed(1)}%W ${(cb.height / visH * 100).toFixed(1)}%H` : null,
    camPos: `${Math.round(cam.position.x)},${Math.round(cam.position.y)}`,
    camZoom: +cam.zoom.toFixed(4),
    canvas: `${cw}x${ch}`,
  }
})

const t1 = await snapshot()
await page.waitForTimeout(1500)
const t2 = await snapshot()
await page.waitForTimeout(3000)
const t3 = await snapshot()
const stage = await page.locator('#stage').boundingBox()
await page.screenshot({ path: `D:/AIHOME/Mimo/viewer-studio/verify/inline-${name}.png`, clip: stage })
console.log(JSON.stringify({ t1, t2, t3 }, null, 2))
await browser.close()
