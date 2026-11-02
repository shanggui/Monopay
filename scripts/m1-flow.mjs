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
await host.screenshot({ path: 'docs/images/m1-home-1440.png', fullPage: true })

await host.getByRole('link', { name: /开一桌/ }).click()
await host.waitForURL('**/create')
await host.screenshot({ path: 'docs/images/m1-create-1440.png', fullPage: true })

await host.locator('button[type="submit"]').click()
await host.waitForURL('**/room/**')
await host.locator('.lobby h1').waitFor()
const code = (await host.locator('.lobby h1').innerText()).trim()
console.log('room:', code)

await host.locator('.player-row').first().waitFor()
await host.screenshot({ path: 'docs/images/m1-lobby-host-1440.png', fullPage: true })

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
await player.screenshot({ path: 'docs/images/m1-lobby-player-390.png', fullPage: true })

await host.waitForFunction(() => document.querySelectorAll('.player-row').length >= 2)
await host.screenshot({ path: 'docs/images/m1-lobby-host-joined-1440.png', fullPage: true })

await host.reload({ waitUntil: 'networkidle' })
await host.locator('.player-row').nth(1).waitFor()
await host.screenshot({ path: 'docs/images/m1-lobby-host-reloaded-1440.png', fullPage: true })

await assertNoOverflow('host lobby 1440', host)
await assertNoOverflow('player lobby 390', player)

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
})
const mobile = await mobileContext.newPage()
watch(mobile)

for (const [name, path] of [
  ['home', '/'],
  ['create', '/create'],
  ['join', '/join'],
]) {
  await mobile.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  await assertNoOverflow(`mobile ${name}`, mobile)
  await mobile.screenshot({ path: `docs/images/m1-${name}-390.png`, fullPage: true })
}

console.log('host players:', await host.locator('.player-row').count())
console.log('player players:', await player.locator('.player-row').count())
console.log('errors:', errors)

await browser.close()
if (errors.length) process.exit(1)
