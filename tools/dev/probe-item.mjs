// Focused probe: select one skin by name, wait up to N seconds, capture every
// console message (spine-player reports load errors there) and the player state.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const target = process.argv[2] || '10070_skin_cinnabar03b'
const maxMs = Number(process.argv[3] || 60000)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const logs = []
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 300)}`))
page.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 300)}`))
page.on('response', (r) => { if (r.url().includes(target) && r.status() >= 400) logs.push(`http${r.status()}: ${r.url()}`) })

await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)

const clicked = await page.evaluate((name) => {
  const nodes = [...document.querySelectorAll('.skin-item')]
  const hit = nodes.find((n) => n.querySelector('.n')?.textContent === name)
  if (!hit) return false
  hit.click()
  return true
}, target)
if (!clicked) { console.log(JSON.stringify({ error: 'item not found', target })); await browser.close(); process.exit(0) }

const t0 = Date.now()
let state = null
while (Date.now() - t0 < maxMs) {
  state = await page.evaluate(() => {
    const p = typeof player !== 'undefined' ? player : null
    const s = p && p.skeleton
    return { has: !!s, anims: s && s.data ? s.data.animations.length : 0, bones: s ? s.bones.length : 0, name: document.getElementById('now-name').textContent }
  })
  if (state.has && state.anims > 0) break
  await page.waitForTimeout(500)
}
console.log(JSON.stringify({ target, readyMs: state.has ? Date.now() - t0 : -1, state, logs }, null, 2))
await browser.close()
