// What is addressable in a skin? List slots (parts) with their attachment type,
// world size and whether the atlas actually carries that region.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const name = process.argv[2] || '78050_skin_osiris03a'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)
await page.evaluate((n) => { const i = MANIFEST.items.find((x) => x.name === n); if (i) selectSkin(i) }, name)
for (let w = 0; w < 40; w++) {
  const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
  if (ready) break
  await page.waitForTimeout(300)
}
await page.waitForTimeout(800)

const out = await page.evaluate(() => {
  const p = player, skel = p.skeleton
  const parts = []
  skel.slots.forEach((slot) => {
    const att = slot.getAttachment()
    if (!att) return
    const w = att.width || 0, h = att.height || 0
    parts.push({
      slot: (slot.data && slot.data.name) || '',
      bone: (slot.bone && slot.bone.data && slot.bone.data.name) || '',
      type: (att.constructor && att.constructor.name) || '?',
      region: att.name || '',
      w: Math.round(w), h: Math.round(h),
      alpha: +slot.color.a.toFixed(2),
      visible: slot.bone.active !== false,
    })
  })
  parts.sort((a, b) => b.w * b.h - a.w * a.h)
  const skinNames = (skel.data.skins || []).map((s) => s.name)
  return {
    item: document.getElementById('now-name').textContent,
    slotsTotal: skel.slots.length,
    withAttachment: parts.length,
    skins: skinNames.slice(0, 8),
    top: parts.slice(0, 16),
    byType: parts.reduce((m, x) => ((m[x.type] = (m[x.type] || 0) + 1), m), {}),
  }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
