import { expect, test } from '@playwright/test'
import { useSliceContent } from './content'

/**
 * PLAN Phase 3 exit criterion (b), through the UI — a match is playable end to
 * end using only slice content.
 *
 * The harness itself is throwaway (Phase 4 owns the real board, draft screens
 * and card tray). What must hold here is that nothing in the slice needs a code
 * path outside the content vocabulary to be played.
 */

test('a match plays to a result using only slice content', async ({ page }) => {
  await useSliceContent(page)

  // The drawn rule card is visible before the first pick. Phase 4 localizes the
  // display text, so the machine-readable identity moved to the attribute.
  await expect(page.getByTestId('rule-card')).toHaveAttribute('data-rule', 'rule.beacon-rush')

  // Both players resolve their opening draft before any board action. The offer
  // is drawn from a six-card pool, so which cards appear is not fixed here.
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'draft')
  await page.locator('[data-testid^="offer-"]').first().click()
  await page.locator('[data-testid^="offer-"]').first().click()
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'play')

  // White walks an archer onto the beacon at c3. The beacon carries it to d4
  // ahead of the archer's volley, and the rule card ends the match — the Phase 3
  // four-layer line, driven through the UI.
  const step = async (from: string, to: string) => {
    await page.getByTestId(`sq-${from}`).click()
    await page.getByTestId(`sq-${to}`).click()
  }
  await step('c1', 'c2')
  await step('d6', 'd5')
  await step('c2', 'c3')

  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'result')
  await expect(page.getByTestId('result')).toHaveAttribute('data-winner', 'white')
  await expect(page.getByTestId('sq-d4')).toHaveAttribute('data-piece', 'piece.archer')
})

test('the editor refuses to save content that fails validation', async ({ page }) => {
  await useSliceContent(page)
  await page.getByTestId('tab-edit').click()

  // Phase 9a moved the record forms behind the library tab, and the raw key
  // slot behind 고급 설정 — a literal name is now something the editor makes an
  // author go out of their way to write, which is the point of ADR-020.
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption('skillCard')
  await page.getByTestId('editor-id').fill('skill.smokescreen')
  await page.getByTestId('editor-advanced').locator('summary').click()
  await page.getByTestId('editor-nameKey').fill('Smokescreen')
  await page.getByTestId('editor-save').click()

  await expect(page.getByTestId('editor-field-error-nameKey')).toBeVisible()
})
