// Experiment: is the figure the dense bone cluster around the "Role" bone?
// Prints the bounds of the closest N% of bones to Role, for several N.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const items = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)

await page.addScriptTag({
  content: `
    window.__cluster = (pct) => {
      const p = player, skel = p.skeleton;
      skel.updateWorldTransform(2);
      const role = findBone(skel, ['Role','role','body1','root1_0.635']);
      if (!role) return null;
      const rx = (skel.x || 0) + role.worldX, ry = (skel.y || 0) + role.worldY;
      const bones = skel.bones.map((b) => ({ b, d: Math.hypot((skel.x||0)+b.worldX - rx, (skel.y||0)+b.worldY - ry) }));
      bones.sort((a, b) => a.d - b.d);
      const keep = bones.slice(0, Math.max(1, Math.round(bones.length * pct)));
      const xs = keep.map((k) => (skel.x||0)+k.b.worldX), ys = keep.map((k) => (skel.y||0)+k.b.worldY);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      return {
        w: Math.round(maxX - minX), h: Math.round(maxY - minY),
        centre: { x: Math.round((minX+maxX)/2), y: Math.round((minY+maxY)/2) },
        roleAt: { x: Math.round(rx), y: Math.round(ry) },
        kept: keep.length, total: bones.length,
        maxDist: Math.round(keep[keep.length-1].d),
      };
    };
    // per-slot attachment extents, to compare with the bone cluster
    window.__slotBox = (nameRe) => {
      const p = player, skel = p.skeleton;
      const rx = nameRe ? new RegExp(nameRe, 'i') : null;
      const keep = (slot) => {
        if (!rx) return true;
        const sn = (slot.data && slot.data.name) || '';
        return rx.test(sn);
      };
      const box = boundsOfSlots(p, keep);
      return box ? { w: Math.round(box.width), h: Math.round(box.height), x: Math.round(box.x), y: Math.round(box.y) } : null;
    };
  `,
})

const out = {}
for (const name of items) {
  await page.evaluate((n) => {
    const item = MANIFEST.items.find((i) => i.name === n)
    if (item) selectSkin(item)
  }, name)
  for (let w = 0; w < 40; w++) {
    const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
    if (ready) break
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(900)
  out[name] = await page.evaluate(() => ({
    all: window.__slotBox(null),
    cluster30: window.__cluster(0.3),
    cluster50: window.__cluster(0.5),
    cluster70: window.__cluster(0.7),
    roleSubtree: window.__slotBox('.*') && null,
  }))
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
