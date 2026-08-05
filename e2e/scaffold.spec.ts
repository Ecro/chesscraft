import { expect, test } from '@playwright/test'

// Boot check: Playwright reaches the dev server and the app mounts. Phase 0
// asserted a placeholder marker; Phase 3 replaced the placeholder with the real
// harness, so the boot signal is now the board itself.
test('app shell loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('board')).toBeVisible()
})
