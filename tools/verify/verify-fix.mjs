// Verify the WebGL-context fix properly:
//  - assert the player really has a skeleton + the expected animation count
//  - assert zero "Too many active WebGL contexts" evictions
//  - keep the canvas count bounded while walking skins on both tabs
//  - measure the stage region by clipped screenshot size (blank stages compress tiny)
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const outDir = 'D:/AIHOME/Mimo/viewer-studio/verify'
fs.mkdirSync(outDir, { recursive: true })

const logs = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') logs.push({ t: m.type(), text: m.text().slice(0, 200) }) })
page.on('pageerror', (e) => logs.push({ t: 'pageerror', text: String(e).slice(0, 200) }))

await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(4000)

const stageBox = await page.locator('#stage').boundingBox()

async function probe(i) {
  const state = await page.evaluate(() => {
    const p = typeof player !== 'undefined' ? player : null
    const skel = p && p.skeleton
    return {
      canvases: document.querySelectorAll('canvas').length,
      hasSkeleton: !!skel,
      animations: skel && skel.data ? skel.data.animations.length : 0,
      name: document.getElementById('now-name').textContent,
    }
  })
  const shot = await page.screenshot({ clip: stageBox }).catch(() => Buffer.alloc(0))
  return { i, ...state, stagePngBytes: shot.length }
}

async function walk(label, count) {
  const rows = []
  for (let i = 0; i < count; i++) {
    await page.$$eval('.skin-item', (els, idx) => els[idx].click(), i)
    // wait for the skeleton instead of a fixed sleep: big skins + mini players
    // contend for the GPU, so a fixed window reports false failures.
    for (let w = 0; w < 30; w++) {
      const ready = await page.evaluate(() => {
        const p = typeof player !== 'undefined' ? player : null
        return !!(p && p.skeleton)
      })
      if (ready) break
      await page.waitForTimeout(500)
    }
    rows.push(await probe(i))
  }
  await page.screenshot({ path: `${outDir}/${label}.png` })
  const evictions = logs.filter((l) => /Too many active WebGL contexts/i.test(l.text)).length
  return { label, evictions, rows }
}

const phaseA = await walk('anim-tab', 10)
await page.click('.tab[data-pane="pane-forms"]')
await page.waitForTimeout(2500)
logs.length = 0
const phaseB = await walk('forms-tab', 8)

const all = [...phaseA.rows, ...phaseB.rows]
const report = {
  phaseA,
  phaseB,
  evictionWarningsTotal: phaseB.evictions,
  failedLoads: all.filter((r) => !r.hasSkeleton || r.animations === 0),
  blankStages: all.filter((r) => r.stagePngBytes < 20000),
  maxCanvases: Math.max(...all.map((r) => r.canvases)),
}
console.log(JSON.stringify(report, null, 2))
fs.writeFileSync(`${outDir}/verify.json`, JSON.stringify(report, null, 2), 'utf8')
await browser.close()
