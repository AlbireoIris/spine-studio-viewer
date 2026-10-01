// Why does one specific skin never finish loading? Measure the page's own
// resource timings for that item and watch the player state.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const target = process.argv[2] || '10070_skin_cinnabar03b'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)

const clicked = await page.evaluate((name) => {
  const hit = [...document.querySelectorAll('.skin-item')].find((n) => n.querySelector('.n')?.textContent === name)
  if (!hit) return null
  hit.click()
  return document.getElementById('now-name').textContent
}, target)

await page.waitForTimeout(30000)

const info = await page.evaluate(() => {
  const res = performance.getEntriesByType('resource').map((r) => ({ name: r.name.split('/').slice(-1)[0], ms: Math.round(r.duration), size: r.transferSize, start: Math.round(r.startTime) }))
  const p = typeof player !== 'undefined' ? player : null
  return {
    nowName: document.getElementById('now-name').textContent,
    hasSkeleton: !!(p && p.skeleton),
    anims: p && p.skeleton && p.skeleton.data ? p.skeleton.data.animations.length : 0,
    slowest: res.sort((a, b) => b.ms - a.ms).slice(0, 10),
    count: res.length,
  }
})
console.log(JSON.stringify({ target, clicked, info }, null, 2))
await browser.close()
