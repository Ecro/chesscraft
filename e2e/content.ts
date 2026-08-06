import { type Page, expect } from '@playwright/test'
import { sliceContentSource } from '../src/content/sets/slice'

/**
 * Loads the Phase 3 slice into a running app.
 *
 * Phase 7 pointed the app at the bundled set (AC-010's product clause), which
 * left the Phase 3 and Phase 4 specs — and most of Phase 5's — pinned to
 * content the app no longer serves. The two documents cannot simply be merged:
 * `piece.king`, `piece.archer`, `skill.snare` and `skill.volley` exist in both
 * with different definitions.
 *
 * So the specs bring their own content in through the editor's REAL import
 * control rather than through a test-only hook. Two things follow, and the
 * second is why this is better than a backdoor: no product surface exists only
 * for tests, and AC-015's import path is exercised on every one of these runs
 * instead of only in its own spec.
 */
export async function useSliceContent(page: Page) {
  await page.goto('/')
  await page.getByTestId('tab-edit').click()
  await page.getByTestId('editor-json').fill(JSON.stringify(sliceContentSource))
  await page.getByTestId('editor-import').click()
  // Fail here rather than in whatever assertion happens to come first.
  await expect(page.getByTestId('editor-errors')).toHaveCount(0)
  await page.getByTestId('tab-play').click()
  await expect(page.getByTestId('preset-select')).toHaveValue('preset.slice')
  // Phase 2 put a home screen in front of the board; the specs that used this
  // helper expected to be mid-match when it returned, so it starts one.
  await page.getByTestId('start-match').click()
}
