// Measure how long the main player needs to reach "skeleton ready" after a
// click, on the current build of index.html.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const logs = []
page.on('console', (m) => { if (m.type() !== 'log') logs.push(`${m.type()}: ${m.text().slice(0, 120)}`) })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })

async function waitReady(label, maxMs) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < maxMs) {
    const s = await page.evaluate(() => {
      const p = typeof player !== 'undefined' ? player : null
      const skel = p && p.skeleton
      return { has: !!skel, anims: skel && skel.data ? skel.data.animations.length : 0, name: document.getElementById('now-name').textContent }
    })
    last = s
    if (s.has && s.anims > 0) return { label, ms: Date.now() - t0, ...s }
    await page.waitForTimeout(250)
  }
  return { label, ms: -1, ...last }
}

const first = await waitReady('initial-boot', 30000)
const rows = [first]
for (const idx of [3, 7, 20]) {
  await page.$$eval('.skin-item', (els, i) => els[i].click(), idx)
  rows.push(await waitReady(`click#${idx}`, 30000))
}
console.log(JSON.stringify({ rows, logs: logs.slice(-8) }, null, 2))
await browser.close()
