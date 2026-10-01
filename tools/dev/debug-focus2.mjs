// Instrument focusCharacter: log the box it actually receives and the box it writes.
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
  const snap = () => ({ x: Math.round(p.currentViewport.x), y: Math.round(p.currentViewport.y), w: Math.round(p.currentViewport.width), h: Math.round(p.currentViewport.height) })
  const stop = (v) => (v === null ? null : { x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.width), h: Math.round(v.height) })

  const direct = stop(characterBounds(p)) // before any setViewport call

  refitToBounds(p, false, anim)
  const afterRefit = snap()

  // intercept what focusCharacter passes to characterBounds
  const orig = characterBounds
  let seen = []
  characterBounds = function (pl) { const r = orig(pl); seen.push(stop(r)); return r }
  let ret = null
  try { ret = focusCharacter(p, 0.12) } catch (e) { ret = 'threw: ' + String(e).slice(0, 120) }
  characterBounds = orig
  const afterFocus = snap()

  return {
    item: document.getElementById('now-name').textContent,
    anim,
    charBoxDirect: direct,
    afterRefit,
    focusReturned: ret,
    charBoxInsideFocus: seen,
    afterFocus,
    pads: [p.currentViewport.padLeft, p.currentViewport.padTop],
  }
})
console.log(JSON.stringify(out, null, 2))
await browser.close()
