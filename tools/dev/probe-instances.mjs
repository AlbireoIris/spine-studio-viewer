// Count real SpinePlayer instantiations and mountPlayer() calls while loading a
// skin, to tell "slow single load" from "reload loop".
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const target = process.argv[2] || '10070_skin_cinnabar03b'
const seconds = Number(process.argv[3] || 30)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const logs = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) logs.push(m.text().slice(0, 200)) })

await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)

await page.evaluate(() => {
  window.__inst = 0
  window.__mountCalls = 0
  window.__selectCalls = 0
  const Orig = spine.SpinePlayer
  spine.SpinePlayer = class extends Orig {
    constructor(...args) { window.__inst++; super(...args) }
  }
  const om = mountPlayer
  mountPlayer = function (...a) { window.__mountCalls++; return om.apply(this, a) }
  const os = selectSkin
  selectSkin = function (...a) { window.__selectCalls++; return os.apply(this, a) }
})

await page.evaluate((name) => {
  const hit = [...document.querySelectorAll('.skin-item')].find((n) => n.querySelector('.n')?.textContent === name)
  hit?.click()
}, target)

const samples = []
for (let i = 0; i < seconds; i++) {
  await page.waitForTimeout(1000)
  const s = await page.evaluate(() => ({
    inst: window.__inst,
    mounts: window.__mountCalls,
    selects: window.__selectCalls,
    hasSkeleton: !!(typeof player !== 'undefined' && player && player.skeleton),
    anims: typeof player !== 'undefined' && player && player.skeleton ? player.skeleton.data.animations.length : 0,
  }))
  samples.push({ t: i + 1, ...s })
  if (s.hasSkeleton && s.anims > 0) break
}
console.log(JSON.stringify({ target, samples, errors: logs.slice(0, 10) }, null, 2))
await browser.close()
