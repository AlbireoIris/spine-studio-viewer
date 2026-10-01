// Verify the viewport fixes with measurements, not eyeballing:
//   1. default fit  -> how much of the visible viewport the skeleton bounds occupy
//   2. zoom buttons -> the world point at the canvas center must not drift
//   3. pan          -> drag must shift the world rect by the same delta the
//                      cursor travelled, and the grabbed point must follow
//   4. hide decor   -> decorative slots really go transparent and restore
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const outDir = 'D:/AIHOME/Mimo/viewer-studio/verify'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)

// helper injected into the page: bounds size vs viewport size + center point
await page.addScriptTag({
  content: `
    window.__probe = () => {
      const p = player;
      if (!p || !p.skeleton) return null;
      const skel = p.skeleton;
      skel.updateWorldTransform(2);
      const offset = new spine.Vector2(), size = new spine.Vector2();
      skel.getBounds(offset, size, new Array(2), p.sceneRenderer.skeletonRenderer.getSkeletonClipping());
      const v = p.currentViewport || {};
      const cam = p.sceneRenderer.camera;
      const cw = p.canvas.clientWidth, ch = p.canvas.clientHeight;
      const center = cam.screenToWorld(new spine.Vector3(cw / 2, ch / 2, 0), cw, ch);
      const corners = [];
      for (const [sx, sy] of [[0,0],[cw,0],[0,ch],[cw,ch]]) {
        const w = cam.screenToWorld(new spine.Vector3(sx, sy, 0), cw, ch);
        corners.push([w.x, w.y]);
      }
      const wx = corners.map(c => c[0]), wy = corners.map(c => c[1]);
      const visW = Math.max(...wx) - Math.min(...wx), visH = Math.max(...wy) - Math.min(...wy);
      return {
        anim: (p.animationState.getCurrent(0) || {}).animation ? p.animationState.getCurrent(0).animation.name : null,
        bounds: { x: offset.x, y: offset.y, w: size.x, h: size.y },
        viewport: { x: v.x, y: v.y, w: v.width, h: v.height },
        fillW: size.x / visW, fillH: size.y / visH,
        centerWorld: { x: center.x, y: center.y },
        canvas: { w: cw, h: ch },
      };
    };
    window.__click = (id) => { document.getElementById(id).click(); };
  `,
})

async function selectItem(idx) {
  await page.$$eval('.skin-item', (els, i) => els[i].click(), idx)
  for (let w = 0; w < 30; w++) {
    const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
    if (ready) break
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(900) // let the 0.15s viewport tween settle
}

const picks = [0, 4, 6, 9, 30, 60]
const fit = []
for (const idx of picks) {
  await selectItem(idx)
  const s = await page.evaluate(() => {
    const r = window.__probe()
    return r ? { anim: r.anim, bounds: r.bounds, viewport: r.viewport, fillW: r.fillW, fillH: r.fillH } : null
  })
  if (s) fit.push({ idx, ...s })
}

// ---- zoom centering ----
await selectItem(0)
const before = await page.evaluate(() => window.__probe().centerWorld)
await page.evaluate(() => { window.__click('btn-zoom-in'); window.__click('btn-zoom-in'); window.__click('btn-zoom-in') })
await page.waitForTimeout(600)
const afterIn = await page.evaluate(() => window.__probe().centerWorld)
const vpAfterIn = await page.evaluate(() => window.__probe().viewport)
await page.evaluate(() => { window.__click('btn-zoom-out'); window.__click('btn-zoom-out'); window.__click('btn-zoom-out') })
await page.waitForTimeout(600)
const afterOut = await page.evaluate(() => window.__probe().centerWorld)
const vpAfterOut = await page.evaluate(() => window.__probe().viewport)

// ---- pan ----
const canvasBox = await page.locator('#player-container canvas').boundingBox()
const start = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 }
const preDrag = await page.evaluate(() => {
  const r = window.__probe()
  return { viewport: r.viewport, centerWorld: r.centerWorld, grabWorld: null }
})
// world point under the grab position (before dragging)
const grabWorldBefore = await page.evaluate(([sx, sy]) => {
  const p = player, cam = p.sceneRenderer.camera
  const rect = p.canvas.getBoundingClientRect()
  const w = cam.screenToWorld(new spine.Vector3(sx - rect.left, sy - rect.top, 0), p.canvas.clientWidth, p.canvas.clientHeight)
  return { x: w.x, y: w.y }
}, [start.x, start.y])

await page.mouse.move(start.x, start.y)
await page.mouse.down()
await page.mouse.move(start.x + 180, start.y + 90, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(400)

const postDrag = await page.evaluate(([sx, sy]) => {
  const p = player, cam = p.sceneRenderer.camera
  const r = window.__probe()
  const rect = p.canvas.getBoundingClientRect()
  const w = cam.screenToWorld(new spine.Vector3(sx - rect.left, sy - rect.top, 0), p.canvas.clientWidth, p.canvas.clientHeight)
  return { viewport: r.viewport, centerWorld: r.centerWorld, grabWorldNow: { x: w.x, y: w.y }, paused: p.paused }
}, [start.x + 180, start.y + 90])

// ---- hide decor ----
await selectItem(0)
const decorBefore = await page.evaluate(() => {
  const skel = player.skeleton
  let visible = 0, hidden = 0
  skel.slots.forEach((s) => {
    const n = (s.data && s.data.name) || ''
    if (/^(BackGround|effect|bg_)/i.test(n)) { s.color.a > 0 ? visible++ : hidden++ }
  })
  return { visible, hidden, total: skel.slots.length }
})
await page.evaluate(() => window.__click('btn-toggle-bg'))
await page.waitForTimeout(700)
const decorHidden = await page.evaluate(() => {
  const skel = player.skeleton
  let zeroed = 0
  skel.slots.forEach((s) => {
    const n = (s.data && s.data.name) || ''
    if (/^(BackGround|effect|bg_)/i.test(n) && s.color.a === 0) zeroed++
  })
  return { zeroed, tracked: (typeof hiddenSlots !== 'undefined' ? hiddenSlots.length : -1) }
})
await page.evaluate(() => window.__click('btn-toggle-bg'))
await page.waitForTimeout(700)
const decorRestored = await page.evaluate(() => {
  const skel = player.skeleton
  let zeroed = 0
  skel.slots.forEach((s) => {
    const n = (s.data && s.data.name) || ''
    if (/^(BackGround|effect|bg_)/i.test(n) && s.color.a === 0) zeroed++
  })
  return { stillZeroed: zeroed, tracked: (typeof hiddenSlots !== 'undefined' ? hiddenSlots.length : -1) }
})

await page.screenshot({ path: `${outDir}/viewport-after.png` })
const report = {
  defaultFit: fit,
  zoom: {
    centerBefore: before,
    centerAfterIn: afterIn,
    driftIn: { x: afterIn.x - before.x, y: afterIn.y - before.y },
    viewportAfterIn: vpAfterIn,
    driftOut: { x: afterOut.x - before.x, y: afterOut.y - before.y },
    viewportAfterOut: vpAfterOut,
  },
  pan: {
    viewportBefore: preDrag.viewport,
    viewportAfter: postDrag.viewport,
    dViewport: { x: postDrag.viewport.x - preDrag.viewport.x, y: postDrag.viewport.y - preDrag.viewport.y },
    grabWorldBefore,
    grabWorldNow: postDrag.grabWorldNow,
    grabDrift: { x: postDrag.grabWorldNow.x - grabWorldBefore.x, y: postDrag.grabWorldNow.y - grabWorldBefore.y },
    pausedAfterDrag: postDrag.paused,
  },
  hideDecor: { before: decorBefore, afterHide: decorHidden, afterRestore: decorRestored },
}
console.log(JSON.stringify(report, null, 2))
fs.writeFileSync(`${outDir}/viewport-verify.json`, JSON.stringify(report, null, 2), 'utf8')
await browser.close()
