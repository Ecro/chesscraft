import { expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { goEditor, move, startBlank } from './nav'

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
    await move(page, from, to)
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
  await goEditor(page)

  // Phase 9a moved the record forms behind the library tab; PLAN Phase 7 of
  // unified-create-ux then deleted the raw key slot entirely, so a literal name is
  // no longer something an author can write at all — ADR-020's point, reached by
  // removal rather than by friction. What a child CAN still get wrong is the id,
  // and that is what this now checks: the refusal is anchored to the field that
  // caused it, which is the claim this test was always about.
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption('skillCard')
  await startBlank(page)
  await page.getByTestId('editor-id').fill('Smokescreen')
  await page.getByTestId('editor-save').click()

  await expect(page.getByTestId('editor-field-error-id')).toBeVisible()
})
