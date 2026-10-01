// Experiment: which slot-name filter isolates the *figure* from the scenery?
// Prints the resulting box for several candidate rules so the choice is based
// on numbers, not taste.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const items = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)

const RULES = {
  roleSubtree: null, // handled specially
  bodyWords: 'hair|head|face|eye|mouth|teeth|tongue|ear|horn|neck|shoulder|body|chest|breast|waist|hip|thigh|leg|foot|feet|toe|arm|hand|finger|nail|cloth|clothing|skirt|dress|shoe|boot|glove|sock|stocking|weapon|sword|gun|blade|tail|wing|skin|bj|bu_|gx',
  bodyPlus: 'hair|head|face|eye|mouth|teeth|tongue|ear|horn|neck|shoulder|body|chest|breast|waist|hip|thigh|leg|foot|feet|toe|arm|hand|finger|nail|cloth|clothing|skirt|dress|shoe|boot|glove|sock|stocking|weapon|sword|gun|blade|tail|wing|skin|bj|bu_|gx|face|yifu|tui|shou|tou',
}

await page.addScriptTag({
  content: `
    window.__rule = (re) => {
      const p = player, skel = p.skeleton;
      const rx = re ? new RegExp(re, 'i') : null;
      const inRole = roleSubtreeBones(skel) || new Set(skel.bones);
      const keep = (slot) => {
        const sn = (slot.data && slot.data.name) || '';
        const bn = (slot.bone && slot.bone.data && slot.bone.data.name) || '';
        if (!inRole.has(slot.bone)) return false;
        if (isDecorativeSlot(slot)) return false;
        if (!rx) return true;
        return rx.test(sn) || rx.test(bn);
      };
      let kept = 0, total = 0;
      skel.slots.forEach((s) => { if (s.getAttachment()) { total++; if (keep(s)) kept++; } });
      const box = boundsOfSlots(p, keep);
      return box ? { w: Math.round(box.width), h: Math.round(box.height), kept, total } : { w: 0, h: 0, kept, total };
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
  const res = {}
  res.pads = await page.evaluate(() => {
    const v = player.currentViewport
    return { w: Math.round(v.width), h: Math.round(v.height), padL: Math.round(v.padLeft), padT: Math.round(v.padTop) }
  })
  for (const [k, re] of Object.entries(RULES)) res[k] = await page.evaluate((r) => window.__rule(r), re)
  out[name] = res
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
