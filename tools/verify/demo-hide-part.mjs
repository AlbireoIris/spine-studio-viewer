// Proof that parts are editable at runtime: hide one named slot and screenshot.
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const name = process.argv[2]
const slotName = process.argv[3]
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
await page.waitForTimeout(1200)
const stage = await page.locator('#stage').boundingBox()
await page.screenshot({ path: `${outDir}/part-${slotName}-before.png`, clip: stage })

const info = await page.evaluate((sn) => {
  const p = player, skel = p.skeleton
  const slot = skel.findSlot(sn)
  if (!slot) return { found: false }
  const att = slot.getAttachment()
  slot.color.a = 0 // same mechanism a UI toggle would use
  return { found: true, region: att ? att.name : null, type: att ? att.constructor.name : null }
}, slotName)
await page.waitForTimeout(600)
await page.screenshot({ path: `${outDir}/part-${slotName}-after.png`, clip: stage })
console.log(JSON.stringify({ name, slotName, ...info, before: `${outDir}/part-${slotName}-before.png`, after: `${outDir}/part-${slotName}-after.png` }))
await browser.close()
