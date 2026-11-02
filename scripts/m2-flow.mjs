import { chromium } from 'playwright-core'

const edge =
  process.env.BROWSER_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const browser = await chromium.launch({ executablePath: edge, headless: true })

const errors = []
function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
}

async function assertNoOverflow(label, page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  console.log(label, metrics)
  if (metrics.scrollWidth > metrics.innerWidth || metrics.bodyScrollWidth > metrics.innerWidth) {
    throw new Error(`${label} has horizontal overflow`)
  }
}

const hostContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})
const host = await hostContext.newPage()
watch(host)
await host.goto(base, { waitUntil: 'networkidle' })
await host.getByRole('link', { name: /开一桌/ }).click()
await host.waitForURL('**/create')
await host.locator('button[type="submit"]').click()
await host.waitForURL('**/room/**')
await host.locator('.lobby h1').waitFor()
const code = (await host.locator('.lobby h1').innerText()).trim()
console.log('room:', code)

const playerContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
})
const player = await playerContext.newPage()
watch(player)
await player.goto(`${base}/r/${code}`, { waitUntil: 'networkidle' })
await player.locator('input').nth(1).fill('小美')
await player.getByRole('button', { name: /加入房间/ }).click()
await player.waitForURL('**/room/**')
await player.locator('.player-row').nth(1).waitFor()
await host.waitForFunction(() => document.querySelectorAll('.player-row').length >= 2)

await host.getByRole('button', { name: /开始游戏/ }).click()
await host.waitForURL('**/ledger')
await host.locator('.ledger h1').waitFor()
await host.screenshot({ path: 'docs/images/m2-ledger-host-1440.png', fullPage: true })

await player.getByRole('button', { name: /进入我的账本/ }).click()
await player.waitForURL('**/ledger')
await player.locator('.ledger h1').waitFor()
await player.screenshot({ path: 'docs/images/m2-ledger-player-390.png', fullPage: true })

await host.locator('.ledger-actions .primary-button').click()
await host.waitForURL(/\/pay/)
await host.locator('.pay-form').waitFor()
await host.locator('input[type="number"]').fill('200')
await host.screenshot({ path: 'docs/images/m2-pay-1440.png', fullPage: true })
await host.getByRole('button', { name: /确认付款/ }).click()
await host.locator('.success-card').waitFor()
await host.waitForURL('**/ledger')

await host.locator('.ledger-actions .secondary-button', { hasText: '银行台' }).click()
await host.waitForURL('**/bank')
await host.locator('.bank-page h1').waitFor()
await host.screenshot({ path: 'docs/images/m2-bank-1440.png', fullPage: true })

await host.getByRole('button', { name: /确认记账/ }).click()
await host.locator('.form-success').waitFor()
await host.screenshot({ path: 'docs/images/m2-bank-after-1440.png', fullPage: true })

await player.waitForFunction(
  () => document.querySelector('.balance-value')?.textContent?.includes('2,400'),
  undefined,
  { timeout: 8_000 },
)
await player.screenshot({ path: 'docs/images/m2-ledger-player-after-390.png', fullPage: true })

await assertNoOverflow('host ledger', host)
await assertNoOverflow('player ledger', player)

const mobileHostContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  storageState: await hostContext.storageState(),
})
const mobileHost = await mobileHostContext.newPage()
watch(mobileHost)

await mobileHost.goto(`${base}/room/${code}/pay?to=player`, { waitUntil: 'networkidle' })
await mobileHost.locator('.pay-form').waitFor()
await assertNoOverflow('mobile pay', mobileHost)
await mobileHost.screenshot({ path: 'docs/images/m2-pay-390.png', fullPage: true })

await mobileHost.goto(`${base}/room/${code}/bank`, { waitUntil: 'networkidle' })
await mobileHost.locator('.bank-page h1').waitFor()
await assertNoOverflow('mobile bank', mobileHost)
await mobileHost.screenshot({ path: 'docs/images/m2-bank-390.png', fullPage: true })

console.log('host transactions:', await host.locator('.tx-row').count())
console.log('player balance:', await player.locator('.balance-value').innerText())
console.log('errors:', errors)

await browser.close()
if (errors.length) process.exit(1)
