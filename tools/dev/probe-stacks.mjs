// Record who calls mountPlayer() repeatedly: aggregate call stacks.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const target = process.argv[2] || '10070_skin_cinnabar03b'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)

await page.evaluate(() => {
  window.__stacks = []
  const om = mountPlayer
  mountPlayer = function (...a) {
    if (window.__stacks.length < 12) {
      const st = new Error().stack.split('\n').slice(1, 5).map((s) => s.trim().replace(/^at\s+/, '').slice(0, 90))
      window.__stacks.push(st)
    }
    return om.apply(this, a)
  }
})

await page.evaluate((name) => {
  const hit = [...document.querySelectorAll('.skin-item')].find((n) => n.querySelector('.n')?.textContent === name)
  hit?.click()
}, target)
await page.waitForTimeout(6000)
console.log(JSON.stringify(await page.evaluate(() => ({ stacks: window.__stacks })), null, 2))
await browser.close()
