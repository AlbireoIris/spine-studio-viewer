// Capture the call stack of pause() during a pan drag.
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

await page.evaluate(() => {
  const p = player
  window.__stacks = []
  const op = p.pause.bind(p)
  p.pause = function (...a) {
    window.__stacks.push(new Error().stack.split('\n').slice(1, 6).map((s) => s.trim().slice(0, 110)))
    return op(...a)
  }
})

const b = await page.locator('#player-container canvas').boundingBox()
const sx = b.x + b.width / 2, sy = b.y + b.height / 2
await page.mouse.move(sx, sy)
await page.mouse.down()
await page.mouse.move(sx + 150, sy + 80, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(500)
console.log(JSON.stringify(await page.evaluate(() => ({ paused: player.paused, stacks: window.__stacks })), null, 2))
await browser.close()
