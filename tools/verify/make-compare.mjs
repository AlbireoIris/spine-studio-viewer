// Produce a before/after pair for one skin, at the user's window size:
//   before = the original hard-coded viewport (6000x7000 world units, pads 0)
//   after  = the current figure framing
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const name = process.argv[2] || '78050_skin_osiris03a'
const outDir = 'D:/AIHOME/Mimo/viewer-studio/verify'
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
const settle = async () => {
  let last = null
  for (let i = 0; i < 30; i++) {
    const now = await page.evaluate(() => Math.round(player.sceneRenderer.camera.zoom * 1000))
    if (last !== null && now === last) break
    last = now
    await page.waitForTimeout(250)
  }
}
await settle()
const stage = await page.locator('#stage').boundingBox()
await page.screenshot({ path: `${outDir}/compare-${name}-after.png`, clip: stage })

// reproduce the shipped-before behaviour
await page.evaluate(() => {
  const p = player
  const anim = p.animationState.getCurrent(0).animation.name
  p.config.viewport = Object.assign({}, p.config.viewport, { x: -3000, y: -5000, width: 6000, height: 7000, transitionTime: 0 })
  p.setViewport(anim)
  p.previousViewport = null
  p.viewportTransitionStart = performance.now()
  p.currentViewport = { x: -3000, y: -5000, width: 6000, height: 7000, padLeft: 0, padRight: 0, padTop: 0, padBottom: 0 }
})
await settle()
await page.screenshot({ path: `${outDir}/compare-${name}-before.png`, clip: stage })
console.log(JSON.stringify({
  name,
  before: `${outDir}/compare-${name}-before.png`,
  after: `${outDir}/compare-${name}-after.png`,
  beforeBytes: fs.statSync(`${outDir}/compare-${name}-before.png`).size,
  afterBytes: fs.statSync(`${outDir}/compare-${name}-after.png`).size,
}))
await browser.close()
