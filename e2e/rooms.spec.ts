import { type Page, expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { buildStep, chooseRoom, fillRoom, goEditor, startMatch } from './nav'

/**
 * PLAN Phase 9a exit criterion — the editor is a place a child assembles a
 * room, names it in their own words, keeps several, and plays one.
 *
 * Every assertion here is made from OUTSIDE the editor wherever it can be. A
 * room that saves is not the claim; a room that saves and then decides what the
 * match deals is. `built-but-not-wired` is a failure this project has shipped
 * once already, and the editor's own success message cannot see it.
 */

async function openEditor(page: Page) {
  await useSliceContent(page)
  await goEditor(page)
}

async function openLibrary(page: Page, kind: string) {
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption(kind)
}

test('a child builds a room, names it in Korean, and plays it from home', async ({ page }) => {
  await openEditor(page)

  await page.getByTestId('room-new').click()
  // No board picker any more: a new room starts on a copy of the document's
  // first board — the slice's, here — and is painted in place. The child's own
  // board is what the paint and place steps edit.
  await fillRoom(page, {
    name: '토끼네 방',
    pieces: ['piece.king', 'piece.archer'],
    rules: ['rule.beacon-rush'],
    // Exactly three skill cards, because an opening offer IS three distinct
    // cards (AC-005). A pool of three therefore forces the offer, with no seed
    // to go stale — and it makes the assertion below about THIS ROOM'S pool
    // rather than about the shipped one, which a room that saved but never
    // reached the match would still satisfy.
    skills: ['skill.warp', 'skill.hold', 'skill.rally'],
  })

  await page.getByTestId('tab-play').click()
  await chooseRoom(page, 'preset.room-1')
  // The Korean name the child typed reached the one control the whole product
  // funnels through — half of what ADR-020 bought.
  await expect(page.getByTestId('room-card')).toContainText('토끼네 방')
  await startMatch(page)

  await expect(page.getByTestId('sq-d1')).toHaveAttribute('data-piece', 'piece.king')
  await expect(page.getByTestId('sq-b1')).toHaveAttribute('data-piece', 'piece.archer')

  await expect(page.locator('[data-testid^="offer-"]')).toHaveCount(3)
  const offered = await page
    .locator('[data-testid^="offer-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card') ?? ''))
  expect(offered.sort()).toEqual(['skill.hold', 'skill.rally', 'skill.warp'])
  await expect(page.getByTestId('rule-card')).toHaveAttribute('data-rule', 'rule.beacon-rush')
})

test('a room refuses to give up its last piece', async ({ page }) => {
  // `pieceIds` carries `.min(1)`, so an empty room is a document that will not
  // load. The form refuses BEFORE the save rather than after, because a
  // validator message about `pieceIds` is not something a child can act on.
  await openEditor(page)
  await page.getByTestId('room-open-preset.slice').click()
  await buildStep(page, 'pieces')

  // Toggle buttons rather than checkboxes since the rebuild, so the state is
  // `aria-pressed` and both of these are plain clicks.
  await page.getByTestId('room-piece-piece.archer').click()
  await page.getByTestId('room-piece-piece.king').click()

  await expect(page.getByTestId('room-piece-piece.king')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('room-last-piece-notice')).toBeVisible()
})

test('the library lists a record no room uses, and says so', async ({ page }) => {
  await openEditor(page)
  await openLibrary(page, 'skillCard')

  await page.getByTestId('editor-new').click()
  await page.getByTestId('editor-id').fill('skill.orphan')
  await page.getByTestId('editor-name').fill('외톨이')
  await page.getByTestId('editor-text').fill('아무 방에도 없어요')
  await page.getByTestId('editor-uses').fill('1')
  await page.getByTestId('editor-add-effect').click()
  await page.getByTestId('vocab-trigger-on_play').click()
  await page.getByTestId('vocab-action-win').click()
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-errors')).toHaveCount(0)

  // Listed — the black hole ADR-026 guards against is a record that exists and
  // appears nowhere, which no error message would ever mention.
  await expect(page.getByTestId('library-open-skill.orphan')).toBeVisible()
  await expect(page.getByTestId('library-unused-skill.orphan')).toBeVisible()
  // And the badge discriminates: a card the shipped room draws from is not
  // badged, so the assertion above cannot pass on a badge painted on every row.
  await expect(page.getByTestId('library-unused-skill.warp')).toHaveCount(0)
})

test('renaming a record through the form leaves one record, with its text', async ({ page }) => {
  await openEditor(page)
  await openLibrary(page, 'piece')

  // A record nothing references yet, because renaming one that IS referenced is
  // a broken cross-reference and the validator is right to refuse it — that is
  // 9b's guard, not this claim.
  await page.getByTestId('editor-new').click()
  await page.getByTestId('editor-id').fill('piece.rabbit')
  await page.getByTestId('editor-name').fill('토끼')
  await page.getByTestId('editor-text').fill('한 칸씩 콩콩 뛰어요')
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-errors')).toHaveCount(0)

  await page.getByTestId('editor-id').fill('piece.bunny')
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-errors')).toHaveCount(0)

  // Exactly one record: before Phase 8's rename primitive was threaded through
  // this form, a changed id APPENDED and orphaned the original (R10).
  await expect(page.getByTestId('library-open-piece.bunny')).toBeVisible()
  await expect(page.getByTestId('library-open-piece.rabbit')).toHaveCount(0)

  // The text moved with it, and the assertion is made from the PLAYER'S screen.
  // A `rekeyStrings` unit test cannot see this half: the overlay keys move, and
  // the record's own `nameKey` has to be re-derived to match, or the piece
  // renders a dotted key everywhere it appears.
  await page.getByTestId('tab-dex').click()
  await expect(page.getByTestId('rules')).toContainText('토끼')
  await expect(page.getByTestId('rules')).not.toContainText('piece.bunny.name')
})

test('the editor scrolls, and the room builder keeps its header while it does', async ({ page }, testInfo) => {
  /*
   * Mobile only, and the reason is a finding rather than a convenience.
   *
   * The `desktop` project (1280x900) was added in Phase 5, and this spec failed there on
   * its own premise guard: "the cards step fits on screen — pick a longer step for this
   * test". That guard doing its job is the useful part — the spec refuses to assert that a
   * sticky header survives scrolling in a box that does not scroll, rather than passing
   * vacuously the way `[fail:test] assertion-equals-its-own-default` describes.
   *
   * What it tells Phase 9, which owns the desktop editor: at desktop width the builder's
   * steps already fit, so the desktop editor is not "the mobile editor, wider" — the
   * scroll-and-sticky-header problem this spec exists for does not arise there, and
   * whatever layout Phase 9 builds needs its own claim rather than this one widened.
   * Skipped here rather than deleted so that claim has a marker to replace.
   */
  test.skip(testInfo.project.name === 'desktop', 'Phase 9 owns the desktop editor; nothing scrolls here yet')

  /*
   * Two defects, one screen, both invisible to every other assertion here.
   *
   * The shell had `min-height` and no `height`, so it grew to fit 4,700px of
   * forms instead of clipping them — the editor's own `overflow-y: auto` had an
   * unbounded parent and simply never engaged. And `.editor > div` set a
   * `display`, which outranks the UA's `[hidden] { display: none }`, so the
   * library panel `Edit` believed it had hidden was rendering underneath the
   * rooms panel the whole time.
   *
   * Driven rather than measured in CSS (`shell-layout.test.ts` has that half):
   * whether a box scrolls is a question about a real layout, and the two rules
   * that broke it are two files apart.
   */
  await openEditor(page)

  const hiddenPanels = await page.locator('.editor > div[hidden]').evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).display),
  )
  expect(hiddenPanels.length, 'the editor no longer keeps both panels mounted').toBeGreaterThan(0)
  for (const display of hiddenPanels) expect(display, 'a hidden editor panel is still rendering').toBe('none')

  await page.getByTestId('room-open-preset.slice').click()
  await buildStep(page, 'cards')

  const editor = page.getByTestId('editor')
  const overflowing = await editor.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
  expect(overflowing, 'the cards step fits on screen — pick a longer step for this test').toBe(true)

  await editor.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  expect(await editor.evaluate((el) => el.scrollTop), 'the editor did not scroll').toBeGreaterThan(0)

  // And the save button came with it. The builder scrolls inside the editor
  // rather than owning the viewport, so its header and step tabs are sticky —
  // without that, reaching the card pool takes both off the top of the screen.
  await expect(page.getByTestId('room-save')).toBeInViewport()
  await expect(page.getByTestId('room-step-board')).toBeInViewport()
})
