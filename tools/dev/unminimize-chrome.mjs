// Un-minimise the automation Chrome: a minimized/occluded window throttles
// requestAnimationFrame, which stalls spine-player's load loop (no network
// errors, skeleton never appears) even though the viewer is fine.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const session = await browser.newBrowserCDPSession()
const page = browser.contexts()[0].pages().find((p) => p.url().includes('viewer-studio')) || browser.contexts()[0].pages()[0]
const { windowId } = await session.send('Browser.getWindowForTarget', { targetId: (await session.send('Target.getTargets')).targetInfos.find((t) => t.url.includes('viewer-studio'))?.targetId })
console.log('windowId', windowId)
await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal', left: 40, top: 40, width: 1600, height: 1000 } })
const after = await session.send('Browser.getWindowBounds', { windowId })
console.log('bounds now', JSON.stringify(after.bounds))

await page.bringToFront().catch(() => {})
await page.waitForTimeout(1500)
const state = await page.evaluate(async () => {
  const item = MANIFEST.items.find((i) => i.name === '20110_skin_arpeggio03')
  selectSkin(item)
  await new Promise((r) => setTimeout(r, 5000))
  const p = player
  const out = { hasSkeleton: !!(p && p.skeleton), anims: p && p.skeleton ? p.skeleton.data.animations.length : 0 }
  if (p && p.skeleton) {
    const b = characterBounds(p)
    const cw = p.canvas.clientWidth, ch = p.canvas.clientHeight, cam = p.sceneRenderer.camera
    const xs = [], ys = []
    for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
      const s = cam.worldToScreen(new spine.Vector3(x, y, 0), cw, ch)
      xs.push(s.x); ys.push(s.y)
    }
    out.shareW = +(((Math.max(...xs) - Math.min(...xs)) / cw) * 100).toFixed(1)
    out.shareH = +(((Math.max(...ys) - Math.min(...ys)) / ch) * 100).toFixed(1)
    out.offsetFromCentrePx = { x: +((Math.max(...xs) + Math.min(...xs)) / 2 - cw / 2).toFixed(1), y: +((Math.max(...ys) + Math.min(...ys)) / 2 - ch / 2).toFixed(1) }
  }
  return out
})
console.log(JSON.stringify(state))
await browser.close()
