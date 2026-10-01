// Which layers dominate a skin's bounds? Prints slot names with attachment
// sizes (world units) so the decor heuristic can be based on data.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const items = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)

const out = {}
for (const name of items) {
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
  await page.waitForTimeout(700)
  out[name] = await page.evaluate(() => {
    const p = player, skel = p.skeleton
    skel.updateWorldTransform(2)
    const clip = p.sceneRenderer.skeletonRenderer.getSkeletonClipping()
    const off = new spine.Vector2(), size = new spine.Vector2()
    skel.getBounds(off, size, new Array(2), clip)
    const layers = []
    skel.slots.forEach((slot) => {
      const att = slot.getAttachment()
      if (!att) return
      const w = att.width || 0, h = att.height || 0
      layers.push({
        slot: (slot.data && slot.data.name) || '',
        type: att.type || (att.constructor && att.constructor.name) || '?',
        w: Math.round(w), h: Math.round(h),
        scale: +((w * h) ).toFixed(0),
      })
    })
    layers.sort((a, b) => b.scale - a.scale)
    return {
      anim: p.animationState.getCurrent(0).animation.name,
      fullBounds: { w: Math.round(size.x), h: Math.round(size.y) },
      slotCount: skel.slots.length,
      topLayers: layers.slice(0, 14),
      decorish: layers.filter((l) => /bg|back|effect|decor|背景|底|框|光/i.test(l.slot)).slice(0, 10),
    }
  })
}

console.log(JSON.stringify(out, null, 1))
await browser.close()
