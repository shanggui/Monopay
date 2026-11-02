import { chromium } from 'playwright-core'

const edge =
  process.env.BROWSER_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const url = process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:3000/'
const browser = await chromium.launch({ executablePath: edge, headless: true })

for (const [name, viewport] of [
  ['390', { width: 390, height: 844 }],
  ['1440', { width: 1440, height: 900 }],
]) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: name === '390',
    hasTouch: name === '390',
  })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  const metrics = await page.evaluate(() => {
    const hero = document.querySelector('.hero')
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      heroWidth: hero?.getBoundingClientRect().width,
      heroColumns: hero ? getComputedStyle(hero).gridTemplateColumns : null,
    }
  })
  console.log(name, metrics)
  await page.screenshot({ path: `artifacts/m0-home-${name}.png`, fullPage: true })
  await context.close()
}

await browser.close()
