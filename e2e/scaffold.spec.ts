import { expect, test } from '@playwright/test'

// Boot check: Playwright reaches the dev server and the app mounts. Phase 0
// asserted a placeholder marker; Phase 3 replaced the placeholder with the real
// harness, so the boot signal is now the board itself.
test('app shell loads', async ({ page }) => {
  await page.goto('/')
  // The shell opens on the home screen now, not on a live board (RESEARCH #4).
  await expect(page.getByTestId('home')).toBeVisible()
  await page.getByTestId('start-match').click()
  await expect(page.getByTestId('board')).toBeVisible()
})
