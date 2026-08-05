import { expect, test } from '@playwright/test'

// Phase 0 only proves Playwright can boot the dev server and reach the app.
// The real hot-seat and editor specs arrive in Phases 4 and 5.
test('app shell loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('scaffold-marker')).toHaveText('scaffold')
})
