import { expect, test } from '@playwright/test'

/**
 * PLAN Phase 3 exit criterion (b), through the UI — a match is playable end to
 * end using only slice content.
 *
 * The harness itself is throwaway (Phase 4 owns the real board, draft screens
 * and card tray). What must hold here is that nothing in the slice needs a code
 * path outside the content vocabulary to be played.
 */

test('a match plays to a result using only slice content', async ({ page }) => {
  await page.goto('/')

  // The drawn rule card is visible before the first pick and stays visible.
  await expect(page.getByTestId('rule-card')).toContainText('rule.beacon-rush')

  // Both players resolve their opening draft before any board action.
  await expect(page.getByTestId('phase')).toHaveText('draft')
  await page.getByTestId('offer-skill.warp').click()
  await page.getByTestId('offer-skill.hold').click()
  await expect(page.getByTestId('phase')).toHaveText('play')

  // White warps an archer onto the beacon at c3. The beacon carries it to d4,
  // the archer's volley finds an empty c3, and the rule card ends the match.
  await page.getByTestId('hand-skill.warp').click()
  await page.getByTestId('sq-c1').click()
  await page.getByTestId('sq-c3').click()

  await expect(page.getByTestId('phase')).toHaveText('result')
  await expect(page.getByTestId('result')).toContainText('white')
  await expect(page.getByTestId('sq-d4')).toContainText('piece.archer')
})

test('the editor refuses to save content that fails validation', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('tab-edit').click()

  await page.getByTestId('editor-kind').selectOption('skillCard')
  await page.getByTestId('editor-id').fill('skill.smokescreen')
  await page.getByTestId('editor-nameKey').fill('Smokescreen')
  await page.getByTestId('editor-save').click()

  await expect(page.getByTestId('editor-errors')).toContainText('nameKey')
})
