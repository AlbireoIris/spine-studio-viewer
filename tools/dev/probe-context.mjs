// Instrument the stage: count mounts (canvas insertions in #player-container)
// and webglcontextlost events over time for a given skin.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const target = process.argv[2] || '10070_skin_cinnabar03b'
const seconds = Number(process.argv[3] || 30)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(2500)

await page.evaluate(() => {
  window.__mounts = 0
  window.__lost = 0
  window.__restored = 0
  const host = document.getElementById('player-container')
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.tagName === 'DIV' || n.tagName === 'CANVAS') window.__mounts++
  }).observe(host, { childList: true, subtree: true })
  host.addEventListener('webglcontextlost', () => { window.__lost++ }, true)
  host.addEventListener('webglcontextrestored', () => { window.__restored++ }, true)
})

await page.evaluate((name) => {
  const hit = [...document.querySelectorAll('.skin-item')].find((n) => n.querySelector('.n')?.textContent === name)
  hit?.click()
}, target)

const samples = []
for (let i = 0; i < seconds; i++) {
  await page.waitForTimeout(1000)
  const s = await page.evaluate(() => ({
    mounts: window.__mounts,
    lost: window.__lost,
    restored: window.__restored,
    hasSkeleton: !!(typeof player !== 'undefined' && player && player.skeleton),
    canvases: document.querySelectorAll('#player-container canvas').length,
  }))
  samples.push({ t: i + 1, ...s })
  if (s.hasSkeleton) break
}
console.log(JSON.stringify({ target, samples }, null, 2))
await browser.close()
