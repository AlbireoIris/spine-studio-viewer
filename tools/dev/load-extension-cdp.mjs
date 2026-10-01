// Load the (unpacked) chrome-mcp-bridge extension into an already-running
// Chrome via the DevTools Protocol Extensions domain, then report the result.
import { createRequire } from 'node:module'

const PW = 'C:/Users/水月林/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core'
const require = createRequire(import.meta.url)
const { chromium } = require(PW)

const extPath = process.argv[2] || 'D:\\AIHOME\\Mimo\\chrome-extension'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
const session = await browser.newBrowserCDPSession()
try {
  const res = await session.send('Extensions.loadUnpacked', { path: extPath })
  console.log('loadUnpacked OK', JSON.stringify(res))
} catch (e) {
  console.log('loadUnpacked FAILED:', String(e).slice(0, 400))
}
try {
  const targets = await session.send('Target.getTargets')
  const ext = targets.targetInfos.filter((t) => /chrome-extension:/.test(t.url) || t.type === 'service_worker')
  console.log('extension targets:', JSON.stringify(ext, null, 1))
} catch (e) {
  console.log('Target.getTargets failed:', String(e).slice(0, 200))
}
await browser.close()
