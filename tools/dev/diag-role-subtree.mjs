// Is the character body actually a subtree of the "Role" bone? Compare:
//   all bounds | decor-free bounds | Role-subtree bounds
// for scene-heavy skins, plus the bone-hierarchy overview.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const items = process.argv.slice(2).length ? process.argv.slice(2) : ['78050_skin_osiris03a', '10010_skin_alps03', '20110_skin_arpeggio03']
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1536, height: 920 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)

await page.addScriptTag({
  content: `
    window.__measure = (mode) => {
      const p = player, skel = p.skeleton;
      const decor = /^(BackGround|effect|bg_)/i;
      const role = findBone(skel, ['Role','role','body1','root1_0.635']);
      const inRole = new Set();
      if (role) skel.bones.forEach((b) => { let n = b; while (n) { if (n === role) { inRole.add(b); return } n = n.parent } });
      const hidden = [];
      skel.slots.forEach((slot) => {
        let hide = false;
        if (mode === 'decor') {
          const sn = (slot.data && slot.data.name) || '';
          const bn = (slot.bone && slot.bone.data && slot.bone.data.name) || '';
          hide = decor.test(sn) || decor.test(bn);
        } else if (mode === 'role') {
          hide = !inRole.has(slot.bone);
        }
        if (hide) { hidden.push([slot, slot.getAttachment()]); slot.setAttachment(null) }
      });
      const clip = p.sceneRenderer.skeletonRenderer.getSkeletonClipping();
      const off = new spine.Vector2(), size = new spine.Vector2();
      skel.updateWorldTransform(2);
      skel.getBounds(off, size, new Array(2), clip);
      hidden.forEach(([s, a]) => { try { s.setAttachment(a) } catch (e) {} });
      skel.updateWorldTransform(2);
      const ok = isFinite(off.x) && isFinite(size.x) && size.x > 0;
      return ok ? { x: off.x, y: off.y, w: size.x, h: size.y } : null;
    };
    window.__hierarchy = () => {
      const skel = player.skeleton;
      const roots = skel.bones.filter((b) => !b.parent);
      return {
        total: skel.bones.length,
        roots: roots.map((r) => {
          const stack = [r]; let n = 0;
          while (stack.length) { const b = stack.pop(); n++; (b.children || []).forEach((c) => stack.push(c)) }
          return { name: r.data.name, subtree: n };
        }).sort((a, b) => b.subtree - a.subtree).slice(0, 8),
        roleFound: !!findBone(skel, ['Role','role','body1','root1_0.635']),
      };
    };
  `,
})

const out = []
for (const name of items) {
  const ok = await page.evaluate((n) => {
    const item = MANIFEST.items.find((i) => i.name === n)
    if (!item) return false
    selectSkin(item)
    return true
  }, name)
  if (!ok) { out.push({ name, error: 'not in manifest' }); continue }
  for (let w = 0; w < 40; w++) {
    const ready = await page.evaluate(() => !!(typeof player !== 'undefined' && player && player.skeleton))
    if (ready) break
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(800)
  const r = await page.evaluate(() => ({
    hierarchy: window.__hierarchy(),
    all: window.__measure('all'),
    decorOff: window.__measure('decor'),
    roleOnly: window.__measure('role'),
  }))
  const fmt = (b) => (b ? `${Math.round(b.w)}x${Math.round(b.h)}` : 'none')
  out.push({
    name,
    bones: r.hierarchy.total,
    roots: r.hierarchy.roots,
    roleFound: r.hierarchy.roleFound,
    all: fmt(r.all),
    decorFree: fmt(r.decorOff),
    roleSubtree: fmt(r.roleOnly),
    roleShareOfDecorFree: r.roleOnly && r.decorOff ? +(r.roleOnly.w / r.decorOff.w).toFixed(2) : null,
  })
}
console.log(JSON.stringify(out, null, 2))
await browser.close()
