// A/B framing measure with the metric that matches the complaint: project the
// CHARACTER's bounds (decorative layers excluded) into screen space and report
// what share of the stage it occupies.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)

await page.addScriptTag({
  content: `
    window.__charBox = () => {
      const p = player, skel = p.skeleton;
      const decor = /^(BackGround|effect|bg_)/i;
      const hidden = [];
      skel.slots.forEach((slot) => {
        const sn = (slot.data && slot.data.name) || '';
        const bn = (slot.bone && slot.bone.data && slot.bone.data.name) || '';
        if (decor.test(sn) || decor.test(bn)) { hidden.push([slot, slot.getAttachment()]); slot.setAttachment(null); }
      });
      const clip = p.sceneRenderer.skeletonRenderer.getSkeletonClipping();
      const off = new spine.Vector2(), size = new spine.Vector2();
      skel.updateWorldTransform(2);
      skel.getBounds(off, size, new Array(2), clip);
      hidden.forEach(([s, a]) => { try { s.setAttachment(a) } catch (e) {} });
      skel.updateWorldTransform(2);
      return { x: off.x, y: off.y, w: size.x, h: size.y };
    };
    // fraction of the stage the character's bounds cover on screen
    window.__screenShare = () => {
      const p = player, cam = p.sceneRenderer.camera;
      const cw = p.canvas.clientWidth, ch = p.canvas.clientHeight;
      const b = window.__charBox();
      const xs = [], ys = [];
      for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
        const s = cam.worldToScreen(new spine.Vector3(px, py, 0), cw, ch);
        xs.push(s.x); ys.push(s.y);
      }
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      return {
        charPxW: w, charPxH: h,
        shareW: w / cw, shareH: h / ch,
        centreOffsetX: (cx - cw / 2) / cw, // 0 = horizontally centred
        centreOffsetY: (cy - ch / 2) / ch, // 0 = vertically centred
        charWorld: b,
      };
    };
  `,
})

const rows = []
for (const idx of [0, 4, 6, 9, 30, 60]) {
  await page.$$eval('.skin-item', (els, i) => els[i].click(), idx)
  for (let w = 0; w < 30; w++) {
    const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
    if (ready) break
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(800)
  const item = await page.evaluate(() => document.getElementById('now-name').textContent)

  // A: old hard-coded viewport (what shipped before)
  await page.evaluate(() => {
    const p = player
    const anim = p.animationState.getCurrent(0).animation.name
    p.config.viewport = Object.assign({}, p.config.viewport, { x: -3000, y: -5000, width: 6000, height: 7000, transitionTime: 0 })
    p.setViewport(anim)
    p.previousViewport = null
    p.viewportTransitionStart = performance.now()
  })
  await page.waitForTimeout(600)
  const a = await page.evaluate(() => window.__screenShare())

  // B: the new default (animation fit + live-pose character framing)
  await page.evaluate(() => {
    const p = player
    const v = p.config.viewport
    delete v.x; delete v.y; delete v.width; delete v.height
    focusMode = 'role'
    frameCharacter(p, 0.12) // exactly what mountPlayer does by default
  })
  await page.waitForTimeout(600)
  const b = await page.evaluate(() => window.__screenShare())

  rows.push({
    item,
    old: { shareW: +(a.shareW * 100).toFixed(1), shareH: +(a.shareH * 100).toFixed(1), offX: +(a.centreOffsetX * 100).toFixed(1), offY: +(a.centreOffsetY * 100).toFixed(1) },
    now: { shareW: +(b.shareW * 100).toFixed(1), shareH: +(b.shareH * 100).toFixed(1), offX: +(b.centreOffsetX * 100).toFixed(1), offY: +(b.centreOffsetY * 100).toFixed(1) },
    gainW: +(b.shareW / (a.shareW || 1e-9)).toFixed(2),
  })
}
console.log(JSON.stringify({ characterShareOfStage: rows }, null, 2))
await browser.close()
