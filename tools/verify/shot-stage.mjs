// Screenshot the stage for a few skins so the framing can be judged visually.
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const outDir = 'D:/AIHOME/Mimo/viewer-studio/verify'
fs.mkdirSync(outDir, { recursive: true })
const items = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1536, height: 920 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)
for (const name of items) {
  await page.evaluate((n) => {
    const item = MANIFEST.items.find((i) => i.name === n)
    if (item) selectSkin(item)
  }, name)
  for (let w = 0; w < 40; w++) {
    const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
    if (ready) break
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(1200)
  const stage = await page.locator('#stage').boundingBox()
  const file = `${outDir}/frame-${name}.png`
  await page.screenshot({ path: file, clip: stage })
  console.log(`${name} -> ${file} (${fs.statSync(file).size} bytes)`)
}
await browser.close()
