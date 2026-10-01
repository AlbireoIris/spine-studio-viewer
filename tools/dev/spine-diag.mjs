// Headless diagnostic for viewer-studio: captures console/page errors, failed
// requests, HTTP >= 400 and the live SpinePlayer state, then screenshots.
import { createRequire } from 'node:module'
import fs from 'node:fs'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const url = process.argv[2] || 'http://127.0.0.1:8877/viewer-studio/index.html'
const shot = process.argv[3] || 'D:/AIHOME/Mimo/viewer-studio/diag-shot.png'
const out = process.argv[4] || 'D:/AIHOME/Mimo/viewer-studio/diag.json'

const logs = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => logs.push({ t: m.type(), text: m.text() }))
page.on('pageerror', (e) => logs.push({ t: 'pageerror', text: String((e && e.stack) || e) }))
page.on('requestfailed', (r) => logs.push({ t: 'requestfailed', text: `${r.url()} :: ${r.failure()?.errorText}` }))
page.on('response', (r) => { if (r.status() >= 400) logs.push({ t: `http${r.status()}`, text: r.url() }) })

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(6000)

const state = await page.evaluate(() => {
  const host = document.getElementById('player-container')
  const canvases = [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }))
  let info = null
  try {
    const p = typeof player !== 'undefined' ? player : null
    if (p) {
      const skel = p.skeleton || null
      info = {
        hasSkeleton: !!skel,
        animations: skel && skel.data && skel.data.animations ? skel.data.animations.length : null,
        bones: skel && skel.bones ? skel.bones.length : null,
        loading: p.loading ?? null,
        error: p.error ? String(p.error && (p.error.message || p.error)) : null,
        currentAnimation: p.currentAnimation || null,
        viewport: p.viewport || null,
      }
    }
  } catch (e) {
    info = { evalError: String(e) }
  }
  return {
    canvases,
    hostHTML: host ? host.innerHTML.slice(0, 800) : null,
    player: info,
    spineGlobal: typeof window.spine,
    spinePlayerType: window.spine ? typeof window.spine.SpinePlayer : null,
    listCount: document.getElementById('list-count')?.textContent ?? null,
    nowName: document.getElementById('now-name')?.textContent ?? null,
    animButtons: [...document.querySelectorAll('.anim-btn')].slice(0, 12).map((b) => b.textContent),
  }
})

await page.screenshot({ path: shot })
const result = { url, state, logs }
fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf8')
console.log(JSON.stringify(result, null, 2))
await browser.close()
