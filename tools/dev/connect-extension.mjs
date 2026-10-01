// Trigger the chrome-mcp-bridge extension to connect to its native host:
// open the extension's popup page in the automation Chrome and send the same
// runtime message its "connect" button sends.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const EXT_ID = 'hbdgbgagpkpjffpklnamcljpakneikee'
const PORT = 12306

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const context = browser.contexts()[0]
const page = await context.newPage()
await page.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(1500)

const res = await page.evaluate(async (port) => {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'connectNative', port })
    return { ok: true, response: JSON.stringify(r).slice(0, 400) }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 400) }
  }
}, PORT)
console.log('connectNative ->', JSON.stringify(res))

// also ask the service worker for its view of the connection
await page.waitForTimeout(3000)
const status = await page.evaluate(async () => {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'get_native_status' })
    return JSON.stringify(r).slice(0, 300)
  } catch (e) { return 'status query failed: ' + String(e).slice(0, 120) }
})
console.log('native status ->', status)
await page.close()
await browser.close()
