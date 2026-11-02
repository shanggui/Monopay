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
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') {
      await dialog.accept('M3 测试修正')
    } else {
      await dialog.accept()
    }
  })
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
await player.getByRole('button', { name: /进入我的账本/ }).click()
await player.waitForURL('**/ledger')

// Host pays player, so the player becomes the payee and can refund.
await host.locator('.ledger-actions .primary-button').click()
await host.waitForURL(/\/pay/)
await host.locator('input[type="number"]').fill('200')
await host.getByRole('button', { name: /确认付款/ }).click()
await host.locator('.success-card').waitFor()
await host.waitForURL('**/ledger')

await player.getByRole('button', { name: /全部流水/ }).click()
await player.waitForURL('**/transactions')
await player.locator('.tx-row-button').first().click()
await player.locator('.detail-card').waitFor()
await player.getByRole('button', { name: /全额退款/ }).click()
await player.locator('.detail-card').waitFor({ state: 'detached' })
await player.screenshot({ path: 'docs/images/m3-transactions-390.png', fullPage: true })

await host.getByRole('button', { name: /银行台/ }).click()
await host.waitForURL('**/bank')
await host.locator('.bank-page h1').waitFor()
await host.getByRole('button', { name: '标记破产' }).last().click()
await host.getByRole('button', { name: '取消破产' }).first().waitFor()
await host.screenshot({ path: 'docs/images/m3-bank-bankrupt-1440.png', fullPage: true })

await host.getByRole('button', { name: /结束游戏/ }).click()
await host.waitForURL('**/settlement')
await host.locator('.settlement-page h1').waitFor()

const cards = host.locator('.asset-card')
for (let index = 0; index < (await cards.count()); index += 1) {
  const card = cards.nth(index)
  await card.locator('input[type="number"]').nth(0).fill('500')
  await card.locator('input[type="number"]').nth(1).fill('100')
  await card.getByRole('button', { name: /保存/ }).click()
  await host.locator('.form-success').waitFor()
}

await host.screenshot({ path: 'docs/images/m3-settlement-settling-1440.png', fullPage: true })

await host.getByRole('button', { name: /确认结算/ }).click()
await host.locator('.rankings').waitFor()
await host.screenshot({ path: 'docs/images/m3-settlement-settled-1440.png', fullPage: true })

await player.goto(`${base}/room/${code}/settlement`, { waitUntil: 'networkidle' })
await player.locator('.rankings').waitFor()
await player.screenshot({ path: 'docs/images/m3-settlement-390.png', fullPage: true })

await assertNoOverflow('host settlement', host)
await assertNoOverflow('player settlement', player)
console.log('rank rows:', await host.locator('.ranking-row').count())
console.log('errors:', errors)

await browser.close()
if (errors.length) process.exit(1)
