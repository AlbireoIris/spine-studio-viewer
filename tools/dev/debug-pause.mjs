// Who toggles pause during a pan drag? Count pause()/play() calls around it.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)
await page.$$eval('.skin-item', (els) => els[0].click())
for (let i = 0; i < 30; i++) {
  const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
  if (ready) break
  await page.waitForTimeout(400)
}
await page.waitForTimeout(1500)

const state0 = await page.evaluate(() => {
  const p = player
  window.__calls = { pause: 0, play: 0, toggle: 0 }
  const op = p.pause ? p.pause.bind(p) : null
  const oplay = p.play ? p.play.bind(p) : null
  if (op) p.pause = function (...a) { window.__calls.pause++; return op(...a) }
  if (oplay) p.play = function (...a) { window.__calls.play++; return oplay(...a) }
  // also flag whether the player's own canvas input saw the mousedown
  const canvas = p.canvas
  window.__canvasDown = 0
  canvas.addEventListener('mousedown', () => { window.__canvasDown++ }, false)
  return { paused: p.paused, rect: canvas.getBoundingClientRect().toJSON() }
})

const b = await page.locator('#player-container canvas').boundingBox()
const sx = b.x + b.width / 2, sy = b.y + b.height / 2
await page.mouse.move(sx, sy)
await page.mouse.down()
await page.mouse.move(sx + 150, sy + 80, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(600)

const state1 = await page.evaluate(() => ({
  paused: player.paused,
  calls: window.__calls,
  canvasDownSeen: window.__canvasDown,
}))

// and a plain click (no movement) to see the built-in click-to-pause
await page.mouse.move(sx, sy)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(400)
const state2 = await page.evaluate(() => ({ paused: player.paused, calls: window.__calls, canvasDownSeen: window.__canvasDown }))

console.log(JSON.stringify({ before: state0.paused, afterDrag: state1, afterClick: state2 }, null, 2))
await browser.close()
