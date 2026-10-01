// Call the page's own framing helpers step by step and print each result.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const name = process.argv[2] || '10010_skin_alps03'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)
await page.evaluate((n) => {
  document.getElementById('q').value = ''
  renderList('')
  const hit = [...document.querySelectorAll('.skin-item')].find((x) => x.querySelector('.n')?.textContent === n)
  hit?.click()
}, name)
for (let i = 0; i < 30; i++) {
  const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
  if (ready) break
  await page.waitForTimeout(400)
}
await page.waitForTimeout(1200)

const out = await page.evaluate(() => {
  const p = player
  const anim = p.animationState.getCurrent(0).animation.name
  const snap = () => {
    const v = p.currentViewport
    return { x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.width), h: Math.round(v.height) }
  }
  const decor = /^(BackGround|effect|bg_)/i
  const decorSlots = (p.skeleton.slots || []).filter((s) => {
    const sn = (s.data && s.data.name) || ''
    const bn = (s.bone && s.bone.data && s.bone.data.name) || ''
    return decor.test(sn) || decor.test(bn)
  }).map((s) => (s.data && s.data.name) || '')

  const cb = characterBounds(p)
  const cbRounded = cb ? { x: Math.round(cb.x), y: Math.round(cb.y), w: Math.round(cb.width), h: Math.round(cb.height) } : null

  refitToBounds(p, false, anim)
  const afterRefit = snap()
  focusCharacter(p, 0.12)
  const afterFocus = snap()

  // how many slots carry an attachment at all
  let withAttachment = 0
  p.skeleton.slots.forEach((s) => { if (s.getAttachment()) withAttachment++ })

  return {
    item: document.getElementById('now-name').textContent,
    anim,
    decorSlots,
    decorSlotCount: decorSlots.length,
    characterBounds: cbRounded,
    afterRefit,
    afterFocus,
    slotsTotal: p.skeleton.slots.length,
    slotsWithAttachment: withAttachment,
  }
})
console.log(JSON.stringify(out, null, 2))
await browser.close()
