import { expect, test } from '@playwright/test'

/**
 * PLAN Phase 7 — the app after the network goes away, and the manifest that
 * lets it be installed in the first place.
 *
 * Run against a real build served by `vite preview` (see
 * `playwright.pwa.config.ts` for why the dev server cannot answer this).
 *
 * The offline assertion is deliberately about PLAYING, not about the document
 * responding. A service worker that returns a cached `index.html` while every
 * hashed script 404s gives a white screen and a green test — the shell loaded,
 * after all. So what is checked is that a match still starts and the board
 * still renders, which cannot be true unless the JS, the CSS and the content
 * all came out of the cache.
 */

/** The SW has to be installed and controlling before the network is cut. */
async function waitForController(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 })
}

test('a second visit plays with the network switched off', async ({ page, context }) => {
  await page.goto('/')
  await waitForController(page)

  await context.setOffline(true)
  await page.reload()

  // Not `expect(page).toHaveTitle(...)`: a cached shell with dead assets would
  // satisfy that while showing nothing. Reaching the board proves the bundle,
  // the stylesheet and the content set all came from the cache.
  // Onboarding, which a browser that has never been here opens on. Reached and
  // dismissed rather than skipped past with a storage seed: this spec's whole
  // subject is a SECOND visit to a real browser, and seeding its storage would
  // be describing a different visit.
  await page.getByTestId('boot-skip').click()
  await page.getByTestId('start-match').click()
  await page.getByTestId('lobby-start').click()
  await expect(page.getByTestId('board')).toBeVisible()
  await expect(page.locator('[data-testid^="sq-"]').first()).toBeVisible()

  // And the board is actually painted — a stylesheet that failed to load leaves
  // the markup intact and every square transparent.
  const painted = await page.getByTestId('board').evaluate((el) => {
    const sq = el.querySelector('.square')
    return sq ? getComputedStyle(sq).backgroundColor : ''
  })
  expect(painted, 'squares have no background — the stylesheet did not come from cache').not.toBe('rgba(0, 0, 0, 0)')

  /*
   * And the font came with it.
   *
   * Half a megabyte of Korean pixel font is now the one non-code asset the
   * bundle carries, and it is the thing an offline app most visibly loses: the
   * markup, the colours and the sprites all survive a missing font, and the app
   * simply stops looking like itself. `document.fonts.check` answers from the
   * font set the page actually loaded, so a cached-but-corrupt file fails here
   * rather than passing a URL check.
   */
  const hasFont = await page.evaluate(() => document.fonts.check('12px Galmuri11'))
  expect(hasFont, 'Galmuri did not come from the cache — the offline app has no pixel font').toBe(true)

  /*
   * And the art is on the board, offline.
   *
   * This used to measure an `<img>`'s `naturalWidth`, because a broken image is
   * still a visible element with a layout box and `toBeVisible()` passes on
   * exactly the failure the line existed for. There is no image any more: every
   * mark is a sprite the bundle draws, so the failure mode it guarded against —
   * an asset that fell out of the precache list — cannot happen to the art. It
   * can still happen to the font, which is why the check above replaced it.
   *
   * What is left worth asserting is that the marks reached the board at all. A
   * sprite that fails to render leaves the square empty rather than broken, so
   * this counts rects: an SVG with no children is the sprite equivalent of a
   * broken image, and it is invisible to every other assertion in this file.
   */
  const rects = await page.locator('.square .piece svg.pix rect').count()
  expect(rects, 'no sprite rects on the board — the marks did not render offline').toBeGreaterThan(0)
  // Unconditional, not `if (count > 0)`. The bundled board paints a marked
  // square, so a count of zero means the square marks stopped rendering —
  // which is a finding, not a reason to skip.
  await expect(page.locator('.square-mark svg.pix').first()).toBeAttached()
})

test('ships a manifest an installable app needs', async ({ page, request }) => {
  await page.goto('/')

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href, 'no <link rel="manifest">').toBeTruthy()

  const res = await request.get(href!)
  expect(res.ok(), `manifest did not load from ${href}`).toBe(true)
  const manifest = await res.json()

  expect(manifest.name, 'name').toBeTruthy()
  expect(manifest.short_name, 'short_name').toBeTruthy()
  expect(manifest.start_url, 'start_url').toBeTruthy()
  // `standalone` (or fullscreen) is what makes an installed app open without
  // browser chrome; `browser` would install a bookmark.
  expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display)

  // The two sizes every installability checklist requires, and at least one
  // maskable so Android does not letterbox the icon inside its own shape.
  const sizes = (manifest.icons ?? []).map((i: { sizes: string }) => i.sizes)
  expect(sizes, 'a 192x192 icon').toContain('192x192')
  expect(sizes, 'a 512x512 icon').toContain('512x512')
  expect(
    (manifest.icons ?? []).some((i: { purpose?: string }) => (i.purpose ?? '').includes('maskable')),
    'at least one maskable icon',
  ).toBe(true)

  /*
   * HTTPS-readiness, as far as localhost can honestly answer it.
   *
   * The exit criterion lists it, and most of it is not assertable here — this
   * suite's own origin is `http://127.0.0.1:4173`, so `location.protocol` would
   * be a permanent false negative and the certificate half is a deploy concern.
   * What IS checkable from here, and is the way a build actually breaks it, is
   * an absolute `http:` URL baked into the manifest: an installed app fetching
   * one over HTTPS gets it blocked as mixed content. The rest is recorded as a
   * post-deploy manual check rather than dropped — see the PLAN's Phase 7.
   */
  const absolute = JSON.stringify(manifest).match(/"http:\/\/[^"]+"/g) ?? []
  expect(absolute, 'manifest contains absolute http: URLs — mixed content once installed').toEqual([])

  // Declared icons that 404 are the most common way this checklist passes on
  // paper and fails on a phone.
  for (const icon of manifest.icons ?? []) {
    const iconRes = await request.get(new URL(icon.src, new URL(href!, 'http://127.0.0.1:4173')).toString())
    expect(iconRes.ok(), `icon ${icon.src} did not load`).toBe(true)
  }
})

test('registers a service worker that controls the page', async ({ page }) => {
  await page.goto('/')
  await waitForController(page)
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope ?? '')
  // Scoped to the origin root, or it cannot serve `start_url` offline.
  expect(scope).toMatch(/\/$/)
})
