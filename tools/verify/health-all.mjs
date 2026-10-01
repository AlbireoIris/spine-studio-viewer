// Health check over EVERY manifest item: load each skin in the real viewer and
// report which ones never produce a skeleton (or log an asset load error).
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const outDir = 'D:/AIHOME/Mimo/viewer-studio/verify'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
let assetErrors = []
page.on('console', (m) => {
  const t = m.text()
  if (/could not be loaded|Assets could not/i.test(t)) assetErrors.push(t.slice(0, 200))
})
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)

const items = await page.evaluate(() => MANIFEST.items.map((i) => ({ name: i.name, anims: i.anims, path: i.path })))
console.log(`checking ${items.length} items`)
const results = []
for (let i = 0; i < items.length; i++) {
  assetErrors = []
  const t0 = Date.now()
  await page.evaluate((idx) => { selectSkin(MANIFEST.items[idx]) }, i)
  let state = null
  for (let w = 0; w < 40; w++) {
    state = await page.evaluate(() => {
      const p = typeof player !== 'undefined' ? player : null
      const s = p && p.skeleton
      return { has: !!s, anims: s && s.data ? s.data.animations.length : 0, name: document.getElementById('now-name').textContent }
    })
    if (state.has) break
    await page.waitForTimeout(300)
  }
  results.push({
    i,
    name: items[i].name,
    ok: state.has && state.anims > 0,
    anims: state.anims,
    ms: Date.now() - t0,
    assetErrors: assetErrors.slice(0, 1),
  })
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${items.length} … failures so far: ${results.filter((r) => !r.ok).length}`)
}

const failed = results.filter((r) => !r.ok)
const report = {
  total: results.length,
  ok: results.length - failed.length,
  failed: failed.length,
  failedItems: failed.map((f) => ({ i: f.i, name: f.name, anims: f.anims, ms: f.ms, error: f.assetErrors[0] || null })),
  slowest: [...results].sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => ({ name: r.name, ms: r.ms })),
}
console.log(JSON.stringify(report, null, 2))
fs.writeFileSync(`${outDir}/library-health.json`, JSON.stringify({ report, results }, null, 2), 'utf8')
await browser.close()
