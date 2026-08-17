/**
 * Rasterises the Chess Craft brand crest to the PNG sizes an installable PWA
 * needs. The crest is generated once as a transparent WebP and reused here,
 * in the app shell, and in the install surfaces so the brand never drifts.
 *
 * Run: `node scripts/make-icons.mjs`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'icons')
const BRAND = join(ROOT, 'src', 'ui', 'art', 'assets', 'chrome-brand.webp')

const TARGETS = [
  { size: 192, scale: 0.72, background: '#f2efe9', name: 'icon-192.png' },
  { size: 512, scale: 0.72, background: '#f2efe9', name: 'icon-512.png' },
  { size: 512, scale: 0.52, background: '#6d4d9c', name: 'icon-512-maskable.png' },
]

const crest = `data:image/webp;base64,${readFileSync(BRAND).toString('base64')}`
const browser = await chromium.launch()
const page = await browser.newPage()
mkdirSync(OUT, { recursive: true })

for (const { size, scale, background, name } of TARGETS) {
  const markSize = Math.round(size * scale)
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`
    <style>
      html, body { width: ${size}px; height: ${size}px; margin: 0; padding: 0; overflow: hidden; background: ${background}; }
      img { display: block; width: ${markSize}px; height: ${markSize}px; margin: ${(size - markSize) / 2}px; object-fit: contain; }
    </style>
    <img src="${crest}" alt="">
  `)
  const shot = await page.screenshot({ omitBackground: false })
  writeFileSync(join(OUT, name), shot)
  console.log(`${name} ${size}x${size}`)
}

await browser.close()
