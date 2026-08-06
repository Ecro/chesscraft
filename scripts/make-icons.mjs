/**
 * Rasterises the app mark to the PNG sizes an installable PWA needs.
 *
 * No image library. The mark is drawn as vector paths here and painted onto a
 * canvas the browser already ships — Playwright's chromium is a build
 * dependency of this repo already, so this adds nothing to `package.json`. That
 * matters more than convenience: the whole project is react + zod at runtime,
 * and pulling in an imaging stack to draw one rook would be the largest
 * dependency in the tree by an order of magnitude.
 *
 * Run: `node scripts/make-icons.mjs`. The outputs are committed, so a normal
 * build never needs chromium — this is a design-time tool, not a build step.
 * That is deliberate: a build that shells out to a browser is a build that
 * breaks in CI for reasons unrelated to the code.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'icons')

/**
 * The mark: a rook on the board's own violet, which is the colour the app uses
 * for "something happens here". Deliberately ONE piece rather than a board —
 * a 6x6 checker is illegible at the 48px an Android launcher actually draws.
 *
 * `maskable` needs its content inside a circle of 80% of the canvas, because
 * Android crops the icon to whatever shape the launcher uses. So the padded
 * variant draws the same mark at 60% scale on a full-bleed background, and the
 * plain variant fills more of the square.
 */
function svg(size, maskable) {
  const scale = maskable ? 0.56 : 0.74
  const inset = (1 - scale) / 2
  // These three hexes are copies of `--color-board-painted-a` and
  // `--color-board-light` in src/ui/tokens.css. They cannot read the token file
  // (this runs outside the app, and the PNGs are committed rather than built),
  // so a re-skin has to touch here, index.html's theme-color, and the manifest
  // as well. Grep the hex to find all four.
  const bg = maskable ? '#6d4d9c' : '#f2efe9'
  const fg = maskable ? '#f2efe9' : '#6d4d9c'
  const radius = maskable ? 0 : size * 0.22
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${(radius / size) * 100}" fill="${bg}"/>
  <g transform="translate(${inset * 100} ${inset * 100}) scale(${scale})">
    <path fill="${fg}" d="M22 12h12v9h11v-9h10v9h11v-9h12v22l-8 8v25l8 9v7H22v-7l8-9V42l-8-8z"/>
  </g>
</svg>`
}

const TARGETS = [
  { size: 192, maskable: false, name: 'icon-192.png' },
  { size: 512, maskable: false, name: 'icon-512.png' },
  { size: 512, maskable: true, name: 'icon-512-maskable.png' },
]

const browser = await chromium.launch()
const page = await browser.newPage()
mkdirSync(OUT, { recursive: true })

for (const { size, maskable, name } of TARGETS) {
  const markup = svg(size, maskable)
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;padding:0}img{display:block;width:${size}px;height:${size}px}</style><img src="${dataUrl}">`,
  )
  const shot = await page.locator('img').screenshot({ omitBackground: false })
  writeFileSync(join(OUT, name), shot)
  console.log(`${name} ${size}x${size}${maskable ? ' (maskable)' : ''}`)
}

writeFileSync(join(OUT, 'icon.svg'), svg(512, false))
console.log('icon.svg (source of truth for the three PNGs above)')

await browser.close()
