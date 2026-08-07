import { expect, test } from '@playwright/test'
import { awaitAiReply, startAiMatch, startMatch } from './nav'

/**
 * Single-player, in a real browser.
 *
 * Three of these claims cannot be made anywhere else. Whether the interface
 * still responds while a search runs is a statement about an event loop, and a
 * jsdom test has no worker to be blocked by. Whether the worker was bundled at
 * all is a statement about the build. And whether a mid-search abort reaches the
 * confirm dialog is a statement about the browser's own `confirm`.
 */

test.describe('a match against the computer', () => {
  test('starts, names its mode, and keeps the seed shareable', async ({ page }) => {
    await page.goto('/')
    await startAiMatch(page, 'hard')

    const play = page.locator('.play')
    await expect(play).toHaveAttribute('data-mode', 'single')
    await expect(play).toHaveAttribute('data-ai-side', 'black')
    await expect(play).toHaveAttribute('data-difficulty', 'hard')

    // The seed lives in the settings sheet, and it must still be there: a
    // single-player match is reproducible from it (AC-003), which is the whole
    // reason the budget is nodes rather than milliseconds.
    await page.getByTestId('match-settings').click()
    await expect(page.getByTestId('match-seed')).toBeVisible()
  })

  test('announces thinking instead of handing the phone over', async ({ page }) => {
    await page.goto('/')
    await startAiMatch(page)

    // The human drafts first, which is what puts the computer on the clock.
    await page.getByTestId('draft-offer').locator('button[data-card]').first().click()

    await expect(page.getByTestId('ai-thinking')).toBeVisible()
    // There is nobody to hand the phone to. The hot-seat banner says exactly
    // that and must not appear.
    await expect(page.getByTestId('hand-off')).toHaveCount(0)
    await awaitAiReply(page)
  })

  test('stays responsive while the computer searches', async ({ page }) => {
    await page.goto('/')
    await startAiMatch(page)
    await page.getByTestId('draft-offer').locator('button[data-card]').first().click()
    await expect(page.getByTestId('ai-thinking')).toBeVisible()

    // A control activated DURING the search must produce its effect promptly.
    // This is the observable form of "the search is not on the main thread";
    // asserting the worker exists would test the implementation instead.
    const flip = page.getByTestId('flip-board')
    await expect(flip).toHaveAttribute('data-flipped', 'false')
    const started = Date.now()
    await flip.click()
    await expect(flip).toHaveAttribute('data-flipped', 'true', { timeout: 2_000 })
    expect(Date.now() - started).toBeLessThan(2_000)
    await awaitAiReply(page)
  })

  test('the computer answers, and the match advances', async ({ page }) => {
    await page.goto('/')
    await startAiMatch(page)
    const before = await page.getByTestId('phase').getAttribute('data-phase')
    await page.getByTestId('draft-offer').locator('button[data-card]').first().click()
    await awaitAiReply(page)
    // Something happened: the computer made its own draft pick, which is a
    // first-class action rather than a special case (AC-002).
    await expect(page.getByTestId('phase')).not.toHaveAttribute('data-phase', before ?? '')
  })

  test('abandoning mid-search asks first, and the guard is the existing one', async ({ page }) => {
    await page.goto('/')
    await startAiMatch(page)
    await page.getByTestId('draft-offer').locator('button[data-card]').first().click()
    await expect(page.getByTestId('ai-thinking')).toBeVisible()

    // "The computer is thinking" is a mode, and a mode owes a way out —
    // `mode-with-no-way-out`, recorded in this repo on 2026-08-07.
    let asked = false
    page.on('dialog', (dialog) => {
      asked = true
      void dialog.dismiss()
    })
    await page.getByTestId('new-match').click()
    await expect.poll(() => asked).toBe(true)

    // Dismissed, so the match continues and the computer still answers.
    await awaitAiReply(page)
    await expect(page.locator('.play')).toHaveAttribute('data-mode', 'single')
  })

  test('hot-seat is untouched by any of this', async ({ page }) => {
    await page.goto('/')
    await startMatch(page)
    await expect(page.locator('.play')).toHaveAttribute('data-mode', 'hotseat')
    await expect(page.getByTestId('ai-thinking')).toHaveCount(0)
  })
})
