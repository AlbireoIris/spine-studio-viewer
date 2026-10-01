// Debug one item: print the character box, the live viewport, the camera and
// the projection, so the screen-share number can be trusted.
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

const info = await page.evaluate(() => {
  const p = player
  const skel = p.skeleton
  skel.updateWorldTransform(2)
  const clip = p.sceneRenderer.skeletonRenderer.getSkeletonClipping()
  const off = new spine.Vector2(), size = new spine.Vector2()
  skel.getBounds(off, size, new Array(2), clip)
  const cam = p.sceneRenderer.camera
  const cw = p.canvas.clientWidth, ch = p.canvas.clientHeight
  const project = (x, y) => cam.worldToScreen(new spine.Vector3(x, y, 0), cw, ch)
  const c1 = project(off.x, off.y)
  const c2 = project(off.x + size.x, off.y + size.y)
  const view = { x: p.viewport.x, y: p.viewport.y, w: p.viewport.width, h: p.viewport.height }
  const cur = { x: p.currentViewport.x, y: p.currentViewport.y, w: p.currentViewport.width, h: p.currentViewport.height }
  return {
    item: document.getElementById('now-name').textContent,
    anim: p.animationState.getCurrent(0).animation.name,
    canvas: { w: cw, h: ch },
    boundsAll: { x: off.x, y: off.y, w: size.x, h: size.y },
    charBox: window.__charBox ? window.__charBox() : null,
    currentViewport: cur,
    scratchViewport: view,
    camera: { zoom: cam.zoom, x: cam.position.x, y: cam.position.y },
    projected: { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, w: Math.abs(c2.x - c1.x), h: Math.abs(c2.y - c1.y) },
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
