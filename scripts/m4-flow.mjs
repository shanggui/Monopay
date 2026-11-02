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

await host.getByRole('button', { name: '外观与声音' }).click()
await host.getByRole('button', { name: /咖啡与电光青/ }).click()
await host.waitForFunction(() => document.documentElement.dataset.theme === 'coffee')
await host.waitForTimeout(350)
await host.screenshot({ path: 'docs/images/m4-home-coffee-1440.png', fullPage: true })

for (const theme of ['oats', 'graphite', 'lilac', 'salt', 'cobalt']) {
  await host.getByRole('button', { name: '外观与声音' }).click()
  await host
    .getByRole('button', {
      name: new RegExp(
        theme === 'oats'
          ? '燕麦'
          : theme === 'graphite'
            ? '石墨'
            : theme === 'lilac'
              ? '雾紫'
              : theme === 'salt'
                ? '海盐'
                : '奶油',
      ),
    })
    .click()
  await host.waitForFunction((value) => document.documentElement.dataset.theme === value, theme)
}
await host.reload({ waitUntil: 'networkidle' })
await host.waitForFunction(() => document.documentElement.dataset.theme === 'cobalt')
console.log('theme persisted:', await host.evaluate(() => document.documentElement.dataset.theme))

await host.getByRole('button', { name: '外观与声音' }).click()
await host.getByRole('button', { name: /咖啡与电光青/ }).click()
await host.getByRole('button', { name: '外观与声音' }).click()
await host.getByRole('button', { name: /音效/ }).click()
await host.getByRole('button', { name: '外观与声音' }).click()

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
await player.addInitScript(() => localStorage.setItem('monopay-theme', 'coffee'))
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

await host.locator('.ledger-actions .primary-button').click()
await host.waitForURL(/\/pay/)
await host.locator('.money-keypad').waitFor()
await host.getByRole('button', { name: '清零' }).click()
await host.getByRole('button', { name: '2', exact: true }).click()
await host.getByRole('button', { name: '0', exact: true }).click()
await host.getByRole('button', { name: '0', exact: true }).click()
await host.screenshot({ path: 'docs/images/m4-pay-keypad-1440.png', fullPage: true })
await assertNoOverflow('pay keypad', host)
await host.getByRole('button', { name: /确认付款/ }).click()
await host.locator('.success-card').waitFor()
await host.waitForURL('**/ledger')

await player.locator('.ledger-actions .primary-button').click()
await player.waitForURL(/\/pay/)
await player.getByRole('button', { name: '50', exact: true }).click()
await player.getByRole('button', { name: /确认付款/ }).click()
await player.locator('.success-card').waitFor()
await player.waitForURL('**/ledger')

await host.locator('.arrival-toast').waitFor()
await host.waitForTimeout(300)
await host.screenshot({ path: 'docs/images/m4-arrival-toast-1440.png', fullPage: true })
await player.waitForTimeout(350)
await player.screenshot({ path: 'docs/images/m4-player-coffee-390.png', fullPage: true })

await assertNoOverflow('host ledger coffee', host)
await assertNoOverflow('player ledger coffee', player)
console.log('theme:', await host.evaluate(() => document.documentElement.dataset.theme))
console.log('errors:', errors)

await browser.close()
if (errors.length) process.exit(1)
