// Is the page running my current source? Print function bodies and test
// setViewportBox directly.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://127.0.0.1:8877/viewer-studio/index.html', { waitUntil: 'load' })
await page.waitForTimeout(3000)

const out = await page.evaluate(() => {
  const p = player
  const before = { w: Math.round(p.currentViewport.width), h: Math.round(p.currentViewport.height) }
  setViewportBox(p, { x: 0, y: 0, width: 1234, height: 567 }, false)
  const after = { w: Math.round(p.currentViewport.width), h: Math.round(p.currentViewport.height), pads: [p.currentViewport.padLeft, p.currentViewport.padRight, p.currentViewport.padTop, p.currentViewport.padBottom] }
  return {
    hasFocusCharacter: typeof focusCharacter,
    focusCharacterSrc: typeof focusCharacter === 'function' ? focusCharacter.toString().slice(0, 160) : null,
    characterBoundsSrc: typeof characterBounds === 'function' ? characterBounds.toString().slice(0, 120) : null,
    viewportBoxSrc: typeof viewportBox === 'function' ? viewportBox.toString().slice(0, 120) : null,
    setViewportBoxSrc: typeof setViewportBox === 'function' ? setViewportBox.toString().slice(0, 240) : null,
    test: { before, after },
    applyViewportStillDefined: typeof applyViewport,
  }
})
console.log(JSON.stringify(out, null, 2))
await browser.close()
