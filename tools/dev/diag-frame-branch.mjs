// Why is the frame still the whole scene? Report every candidate branch.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const name = process.argv[2] || '78050_skin_osiris03a'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => errs.push('pageerror ' + String(e).slice(0, 160)))
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)
await page.evaluate((n) => {
  const item = MANIFEST.items.find((i) => i.name === n)
  if (item) selectSkin(item)
}, name)
for (let w = 0; w < 40; w++) {
  const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
  if (ready) break
  await page.waitForTimeout(300)
}
await page.waitForTimeout(1000)

const out = await page.evaluate(() => {
  const p = player, skel = p.skeleton
  const r = (b) => (b ? `${Math.round(b.width)}x${Math.round(b.height)}` : 'null')
  const nonDecor = (slot) => !isDecorativeSlot(slot)
  const full = boundsOfSlots(p, nonDecor)
  const role = findBone(skel, ROLE_BONES)
  const steps = {}
  if (role) {
    for (const ratio of [0.45, 0.7]) {
      const cluster = clusterBones(skel, role, ratio)
      if (!cluster) { steps['cluster' + ratio] = 'no cluster'; continue }
      let total = 0, kept = 0
      skel.slots.forEach((s) => { if (s.getAttachment()) { total++; if (cluster.has(s.bone) && nonDecor(s)) kept++ } })
      const box = boundsOfSlots(p, (s) => cluster.has(s.bone) && nonDecor(s))
      steps['cluster' + ratio] = { box: r(box), kept, total, cover: +(kept / Math.max(1, total)).toFixed(2) }
    }
    const inRole = roleSubtreeBones(skel)
    if (inRole) {
      let total = 0, kept = 0
      skel.slots.forEach((s) => { if (s.getAttachment()) { total++; if (inRole.has(s.bone) && nonDecor(s)) kept++ } })
      const box = boundsOfSlots(p, (s) => inRole.has(s.bone) && nonDecor(s))
      steps.roleSubtree = { box: r(box), kept, total, cover: +(kept / Math.max(1, total)).toFixed(2) }
    } else steps.roleSubtree = 'no role subtree'
  } else steps.role = 'not found'
  const v = p.currentViewport
  return {
    anim: p.animationState.getCurrent(0).animation.name,
    roleBone: role ? role.data.name : null,
    full: r(full),
    steps,
    finalCharacterBounds: r(characterBounds(p)),
    viewport: { w: Math.round(v.width), h: Math.round(v.height), padL: Math.round(v.padLeft), padT: Math.round(v.padTop) },
    padRatio,
    baseBox: baseBox ? r(baseBox) : null,
    viewState,
    canvas: { w: p.canvas.clientWidth, h: p.canvas.clientHeight },
    camZoom: +p.sceneRenderer.camera.zoom.toFixed(4),
    visibleWorld: { w: Math.round(p.canvas.clientWidth * p.sceneRenderer.camera.zoom), h: Math.round(p.canvas.clientHeight * p.sceneRenderer.camera.zoom) },
  }
})
console.log(JSON.stringify(out, null, 2))
console.log('errors:', JSON.stringify(errs.slice(0, 6)))
await browser.close()
