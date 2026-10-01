// Sweep: click through skins and watch the main canvas. Detects WebGL context
// exhaustion (blank stage) as the list is explored.
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const outDir = 'D:/AIHOME/Mimo/viewer-studio/sweep'
fs.mkdirSync(outDir, { recursive: true })

const logs = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => { if (m.type() !== 'log') logs.push({ t: m.type(), text: m.text().slice(0, 300) }) })
page.on('pageerror', (e) => logs.push({ t: 'pageerror', text: String(e).slice(0, 300) }))

await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(4000)

const names = await page.$$eval('.skin-item .n', (ns) => ns.map((n) => n.textContent))
const picks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const rows = []
for (const idx of picks) {
  const before = logs.length
  await page.$$eval('.skin-item', (els, i) => els[i].click(), idx)
  await page.waitForTimeout(3500)
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length)
  // hide the mini-form hosts so the shot measures the main stage only
  await page.evaluate(() => {
    const g = document.getElementById('merge-grid')
    if (g) g.style.display = 'none'
  })
  const shot = await page.locator('#player-container canvas').screenshot({ path: `${outDir}/${String(idx).padStart(2, '0')}-${names[idx]}.png` }).catch(() => null)
  const bytes = shot ? shot.length : 0
  rows.push({ idx, name: names[idx], canvases, mainCanvasPngBytes: bytes, newLogs: logs.slice(before) })
  await page.evaluate(() => {
    const g = document.getElementById('merge-grid')
    if (g) g.style.display = ''
  })
}

const blankish = rows.filter((r) => r.mainCanvasPngBytes < 20000)
console.log(JSON.stringify({ rows, blankish, allLogs: logs.slice(0, 40) }, null, 2))
fs.writeFileSync(`${outDir}/sweep.json`, JSON.stringify({ rows, logs }, null, 2), 'utf8')
await browser.close()
