import { chromium } from 'playwright-core'

const edge =
  process.env.BROWSER_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const browser = await chromium.launch({ executablePath: edge, headless: true })
const errors = []

for (const width of [390, 768, 1440]) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width === 390,
    hasTouch: width === 390,
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${width}: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`${width}: ${error.message}`))

  await page.goto(base, { waitUntil: 'networkidle' })
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  console.log(width, metrics)
  if (metrics.scrollWidth > metrics.innerWidth || metrics.bodyScrollWidth > metrics.innerWidth) {
    throw new Error(`${width}px home has horizontal overflow`)
  }
  await page.screenshot({ path: `docs/images/m5-home-${width}.png`, fullPage: true })
  await context.close()
}

console.log('errors:', errors)
await browser.close()
if (errors.length) process.exit(1)
