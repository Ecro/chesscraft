import { type Page, expect, test } from '@playwright/test'
import { useSliceContent } from './content'
import { chooseRoom, goEditor, startMatch } from './nav'

/**
 * PLAN Phase 5 exit criterion — the content editor, end to end.
 *
 * Every test here is shaped the same way, because the criterion is: create or
 * edit on the `edit` tab, then switch to `play` and observe the change in the
 * SAME session with no reload (AC-014). Asserting that a save succeeded is not
 * the criterion — `built-but-not-wired` is a failure this project has already
 * shipped once, and the only assertion that catches it is one made from the
 * board.
 */

/**
 * Phase 9a moved every selector in this file (ADR-016). The record forms did
 * not change — the ADR-006 coverage gate proves that — but they now live behind
 * the editor's 재료 창고 tab, because the editor's front door is the room list.
 * One helper absorbs the move for the whole suite.
 */
async function openEditor(page: Page, kind: string) {
  await useSliceContent(page)
  await goEditor(page)
  await page.getByTestId('editor-tab-library').click()
  await page.getByTestId('editor-kind').selectOption(kind)
}

/**
 * Phase 9a: the child types TEXT and the editor derives the key (ADR-020), so
 * these fills go through the name/description inputs. The values are still the
 * old key strings on purpose — every assertion downstream watches for
 * `<id>.name` on the screen, and before this phase that string appeared because
 * the key was unresolved, while now it appears because it is the authored text.
 * Same sentinel, so the specs stay honest about what moved and what did not.
 */
async function fillIdentity(page: Page, id: string, opts: { text?: boolean } = {}) {
  await page.getByTestId('editor-id').fill(id)
  await page.getByTestId('editor-name').fill(`${id}.name`)
  if (opts.text !== false) await page.getByTestId('editor-text').fill(`${id}.text`)
}

async function save(page: Page) {
  await page.getByTestId('editor-save').click()
  await expect(page.getByTestId('editor-errors')).toHaveCount(0)
  await expect(page.getByTestId('editor-saved')).toBeVisible()
}

async function play(page: Page, presetId?: string) {
  // tab-play lands on the home screen since Phase 2, and the preset picker
  // moved there with it — choosing what to play is a before-the-match decision.
  await page.getByTestId('tab-play').click()
  if (presetId) await chooseRoom(page, presetId)
  await startMatch(page)
}

/**
 * Clears the opening draft for both sides.
 *
 * AC-005 gates every board action until each player has picked, so a test that
 * asserts on move legality has to get past the draft first — otherwise every
 * square reads `data-legal="false"` and the assertion fails for a reason that
 * has nothing to do with what was authored.
 */
async function resolveOpeningDrafts(page: Page) {
  const offers = page.locator('[data-testid^="offer-"]')
  for (let guard = 0; guard < 4; guard += 1) {
    if ((await offers.count()) === 0) break
    await offers.first().click()
  }
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'play')
}

/** Collects the ids currently on offer, for the skill-pool coverage argument. */
async function offerIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="offer-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card') ?? ''))
}

/**
 * The PLAN's declared test id for AC-014. It is deliberately the shortest
 * possible create-then-play loop: authoring one square type and seeing it on
 * the board is the whole claim, and the per-axis suites below extend it rather
 * than restate it.
 */
test('authored content is playable in the same session', async ({ page }) => {
  await openEditor(page, 'squareType')
  await fillIdentity(page, 'square.quicksand')
  await page.getByTestId('editor-add-effect').click()
  await page.getByTestId('vocab-trigger-on_enter').click()
  await page.getByTestId('vocab-action-freeze_piece').click()
  await page.getByTestId('vocab-target-entering').click()
  await save(page)

  await page.getByTestId('editor-kind').selectOption('board')
  await page.getByTestId('library-open-board.slice').click()
  await page.getByTestId('paint-type').selectOption('square.quicksand')
  await page.getByTestId('paint-d3').click()
  await save(page)

  // No reload between authoring and playing — that is the AC.
  await play(page)
  await expect(page.getByTestId('sq-d3')).toHaveAttribute('data-square-type', 'square.quicksand')
})

test.describe('piece axis', () => {
  test('creates a piece with the visual movement grid and places it on the board', async ({ page }) => {
    await openEditor(page, 'piece')
    await fillIdentity(page, 'piece.hopper')
    await page.getByTestId('vocab-movement-jump').click()
    // Two squares up, one across — authored by clicking the grid, not by typing
    // a vector, because the grid IS the control ADR-006 promised.
    await page.getByTestId('move-cell-1_2').click()
    await save(page)

    // Put it on the board and into the preset, so a match can reach it.
    await page.getByTestId('editor-kind').selectOption('board')
    await page.getByTestId('library-open-board.slice').click()
    await page.getByTestId('place-piece').selectOption('piece.hopper')
    await page.getByTestId('place-side').selectOption('white')
    await page.getByTestId('place-a3').click()
    await save(page)

    await page.getByTestId('editor-kind').selectOption('preset')
    await page.getByTestId('library-open-preset.slice').click()
    await page.getByTestId('preset-piece-piece.hopper').check()
    await save(page)

    await play(page)
    await expect(page.getByTestId('sq-a3')).toHaveAttribute('data-piece', 'piece.hopper')
  })

  test('edits an existing piece and the new movement decides what is legal', async ({ page }) => {
    await openEditor(page, 'piece')
    await page.getByTestId('library-open-piece.archer').click()

    await page.getByTestId('editor-clear-movement').click()
    await page.getByTestId('vocab-movement-jump').click()
    await page.getByTestId('move-cell-0_2').click()
    await save(page)

    await play(page)
    await resolveOpeningDrafts(page)
    await page.getByTestId('sq-b1').click()
    await expect(page.getByTestId('sq-b3')).toHaveAttribute('data-legal', 'true')
    // The one-square step it used to have is gone — otherwise the edit only
    // added, and the test would pass on an editor that never removes anything.
    await expect(page.getByTestId('sq-b2')).toHaveAttribute('data-legal', 'false')
  })
})

test.describe('special-square axis', () => {
  test('creates a standalone square type, paints it, and the board shows it', async ({ page }) => {
    await openEditor(page, 'squareType')
    await fillIdentity(page, 'square.lava')
    await page.getByTestId('editor-add-effect').click()
    await page.getByTestId('vocab-trigger-on_enter').click()
    await page.getByTestId('vocab-action-destroy_piece').click()
    await page.getByTestId('vocab-target-entering').click()
    await save(page)

    await page.getByTestId('editor-kind').selectOption('board')
    await page.getByTestId('library-open-board.slice').click()
    await page.getByTestId('paint-type').selectOption('square.lava')
    await page.getByTestId('paint-e5').click()
    await save(page)

    await play(page)
    await expect(page.getByTestId('sq-e5')).toHaveAttribute('data-square-type', 'square.lava')
    await expect(page.getByTestId('square-legend')).toContainText('square.lava')
  })

  test('edits a shipped square type and the board legend follows', async ({ page }) => {
    await openEditor(page, 'squareType')
    await page.getByTestId('library-open-square.beacon').click()
    await page.getByTestId('editor-text').fill('square.beacon.revised')
    await save(page)

    await play(page)
    // Past the draft first: the sheet is opaque and sits over the bottom of the
    // play area, which is where the legend lives.
    await resolveOpeningDrafts(page)
    // The legend is a row of chips now — a name and its mark — with the ability
    // text one tap away in the same sheet the dex uses. AC-018 asks for the text
    // to be reachable during the match, not for it to be on the board at all
    // times, and a paragraph per painted type does not fit a screen that no
    // longer scrolls.
    await page.getByTestId('square-legend').getByRole('button').first().click()
    await expect(page.getByTestId('peek-sheet')).toContainText('square.beacon.revised')
  })
})

test.describe('rule-card axis', () => {
  test('creates a rule card and it is the card the match draws', async ({ page }) => {
    await openEditor(page, 'ruleCard')
    await fillIdentity(page, 'rule.sudden-death')
    await page.getByTestId('editor-cost').fill('3')
    await page.getByTestId('editor-add-effect').click()
    await page.getByTestId('vocab-trigger-end_of_ply').click()
    await page.getByTestId('vocab-condition-check_count_at_least').click()
    await page.getByTestId('vocab-action-win').click()
    await save(page)

    // A preset that offers exactly one rule card makes the draw deterministic.
    await page.getByTestId('editor-kind').selectOption('preset')
    await page.getByTestId('library-open-preset.slice').click()
    await page.getByTestId('preset-rule-rule.beacon-rush').uncheck()
    await page.getByTestId('preset-rule-rule.sudden-death').check()
    await save(page)

    await play(page)
    await expect(page.getByTestId('rule-card')).toHaveAttribute('data-rule', 'rule.sudden-death')
  })

  test('edits a rule card and the edit is what the match plays with', async ({ page }) => {
    await openEditor(page, 'ruleCard')
    await page.getByTestId('library-open-rule.beacon-rush').click()
    await page.getByTestId('editor-text').fill('rule.beacon-rush.revised')
    await save(page)

    await play(page)
    // The rule's NAME is always up; its prose is behind the bar's own
    // disclosure, because the board needs the room and the name is what a
    // player checks mid-match. AC-004's display clause is about the card staying
    // on screen for the whole match, which it does.
    await page.getByTestId('rule-card').click()
    await expect(page.locator('.rule-text')).toContainText('rule.beacon-rush.revised')
  })
})

test.describe('skill-card axis', () => {
  test('creates a skill card and it reaches a player hand in the same session', async ({ page }) => {
    await openEditor(page, 'skillCard')
    await fillIdentity(page, 'skill.smokescreen')
    await page.getByTestId('editor-cost').fill('2')
    await page.getByTestId('editor-uses').fill('1')
    await page.getByTestId('editor-add-effect').click()
    await page.getByTestId('vocab-trigger-on_play').click()
    await page.getByTestId('vocab-action-freeze_piece').click()
    await page.getByTestId('vocab-target-chosen_enemy').click()
    await save(page)

    // Narrow the pool to exactly three, including the new card. An offer is
    // three DISTINCT cards (AC-005), so a pool of three IS the offer — the new
    // card is forced into the very first offer by counting, with no golden RNG
    // value to go stale and no turns to play first.
    await page.getByTestId('editor-kind').selectOption('preset')
    await page.getByTestId('library-open-preset.slice').click()
    for (const id of ['skill.rally', 'skill.volley', 'skill.snare', 'skill.ascend']) {
      await page.getByTestId(`preset-skill-${id}`).uncheck()
    }
    await page.getByTestId('preset-skill-skill.smokescreen').check()
    await save(page)

    await play(page)
    await expect(page.locator('[data-testid^="offer-"]')).toHaveCount(3)
    expect((await offerIds(page)).sort()).toEqual(['skill.hold', 'skill.smokescreen', 'skill.warp'])
    await expect(page.getByTestId('offer-skill.smokescreen')).toContainText('skill.smokescreen.name')
  })

  test('edits a skill card and the change shows on the card the player holds', async ({ page }) => {
    await openEditor(page, 'skillCard')
    await page.getByTestId('library-open-skill.warp').click()
    await page.getByTestId('editor-name').fill('skill.warp.renamed')
    await save(page)

    // Same counting argument as the create test: a three-card pool IS the
    // offer, so the edited card is reachable without a seed assumption and
    // without a fallback branch that would assert the value it just typed.
    await page.getByTestId('editor-kind').selectOption('preset')
    await page.getByTestId('library-open-preset.slice').click()
    for (const id of ['skill.volley', 'skill.snare', 'skill.ascend']) {
      await page.getByTestId(`preset-skill-${id}`).uncheck()
    }
    await save(page)

    await play(page)
    await expect(page.locator('[data-testid^="offer-"]')).toHaveCount(3)
    await expect(page.getByTestId('offer-skill.warp')).toContainText('skill.warp.renamed')

    // Held cards carry the edit too, which is the clause the test name makes.
    // The hotbar slot is a mark, so the name lives in its accessible name and in
    // the detail line under it — both read from the same record, and the
    // accessible name is the one a condensed hand must never lose.
    await page.getByTestId('offer-skill.warp').click()
    await expect(page.getByTestId('hand-white-skill.warp')).toHaveAttribute('aria-label', 'skill.warp.renamed')
    await expect(page.getByTestId('slot-detail')).toContainText('skill.warp.renamed')
  })
})

test.describe('board axis', () => {
  test('creates a board with painted squares and a preset that plays on it', async ({ page }) => {
    await openEditor(page, 'board')
    await page.getByTestId('editor-id').fill('board.duel')
    await page.getByTestId('editor-name').fill('board.duel.name')
    await page.getByTestId('place-piece').selectOption('piece.king')
    await page.getByTestId('place-side').selectOption('white')
    await page.getByTestId('place-a1').click()
    await page.getByTestId('place-side').selectOption('black')
    await page.getByTestId('place-a6').click()
    await page.getByTestId('paint-type').selectOption('square.beacon')
    await page.getByTestId('paint-d4').click()
    await save(page)

    await page.getByTestId('editor-kind').selectOption('preset')
    await page.getByTestId('editor-id').fill('preset.duel')
    await page.getByTestId('editor-name').fill('preset.duel.name')
    await page.getByTestId('preset-board').selectOption('board.duel')
    for (const id of ['piece.king', 'piece.archer']) await page.getByTestId(`preset-piece-${id}`).check()
    await page.getByTestId('preset-rule-rule.beacon-rush').check()
    for (const id of ['skill.warp', 'skill.hold', 'skill.rally', 'skill.volley', 'skill.snare', 'skill.ascend']) {
      await page.getByTestId(`preset-skill-${id}`).check()
    }
    await save(page)

    await play(page, 'preset.duel')
    await expect(page.getByTestId('sq-a1')).toHaveAttribute('data-piece', 'piece.king')
    await expect(page.getByTestId('sq-a6')).toHaveAttribute('data-piece', 'piece.king')
    await expect(page.getByTestId('sq-d4')).toHaveAttribute('data-square-type', 'square.beacon')
    await expect(page.getByTestId('sq-b1')).toHaveAttribute('data-piece', '')
  })

  test('edits the shipped board by painting another square', async ({ page }) => {
    await openEditor(page, 'board')
    await page.getByTestId('library-open-board.slice').click()
    await page.getByTestId('paint-type').selectOption('square.beacon')
    await page.getByTestId('paint-e5').click()
    await save(page)

    await play(page)
    await expect(page.getByTestId('sq-e5')).toHaveAttribute('data-square-type', 'square.beacon')
    await expect(page.getByTestId('sq-c3')).toHaveAttribute('data-square-type', 'square.beacon')
  })
})

test.describe('validation and transfer', () => {
  test('blocks a save that fails validation and names the offending field', async ({ page }) => {
    await openEditor(page, 'skillCard')
    await page.getByTestId('editor-id').fill('skill.broken')
    await page.getByTestId('editor-text').fill('skill.broken.text')
    // Reaching past the derived field on purpose: `editor-name` cannot produce
    // an invalid key any more, so the only way to author one — and the only way
    // this test still tests what it is named after — is the raw slot under
    // 고급 설정, which has to be opened first.
    await page.getByTestId('editor-advanced').locator('summary').click()
    await page.getByTestId('editor-nameKey').fill('Smokescreen')
    await page.getByTestId('editor-add-effect').click()
    await page.getByTestId('vocab-trigger-on_play').click()
    await page.getByTestId('vocab-action-freeze_piece').click()
    await page.getByTestId('editor-save').click()

    await expect(page.getByTestId('editor-errors')).toBeVisible()
    // The error is anchored to the control that caused it (#25) rather than
    // printed as a schema path — `presets.x.nameKey` names a field the author
    // has never seen, and Phase 9a's copy rule forbids putting it on screen.
    await expect(page.getByTestId('editor-field-error-nameKey')).toBeVisible()
    await expect(page.getByTestId('editor-saved')).toHaveCount(0)

    // The rejected save must not have half-landed.
    await play(page)
    await expect(page.getByTestId('rule-card')).toBeVisible()
  })

  test('exports and re-imports the whole content set (AC-015)', async ({ page }) => {
    await openEditor(page, 'skillCard')
    await fillIdentity(page, 'skill.mirror')
    await page.getByTestId('editor-cost').fill('1')
    await page.getByTestId('editor-uses').fill('1')
    await page.getByTestId('editor-add-effect').click()
    await page.getByTestId('vocab-trigger-on_play').click()
    await page.getByTestId('vocab-action-swap_pieces').click()
    await save(page)

    await page.getByTestId('editor-export').click()
    const exported = await page.getByTestId('editor-json').inputValue()
    expect(exported).toContain('skill.mirror')

    await page.reload()
    await goEditor(page)
    await page.getByTestId('editor-json').fill(exported)
    await page.getByTestId('editor-import').click()
    await expect(page.getByTestId('editor-errors')).toHaveCount(0)

    await page.getByTestId('editor-tab-library').click()
    await page.getByTestId('editor-kind').selectOption('skillCard')
    await page.getByTestId('library-open-skill.mirror').click()
    await expect(page.getByTestId('editor-id')).toHaveValue('skill.mirror')
  })

  test('refuses an import that is not valid content and says why', async ({ page }) => {
    await useSliceContent(page)
    await goEditor(page)
    await page.getByTestId('editor-json').fill('{"schemaVersion": 3, "pieces": "not a list"}')
    await page.getByTestId('editor-import').click()
    await expect(page.getByTestId('editor-errors')).toBeVisible()

    await play(page)
    await expect(page.getByTestId('sq-d1')).toHaveAttribute('data-piece', 'piece.king')
  })

  test('keeps authored content across a reload through browser-local storage', async ({ page }) => {
    await openEditor(page, 'skillCard')
    await fillIdentity(page, 'skill.keepsake')
    await page.getByTestId('editor-cost').fill('1')
    await page.getByTestId('editor-uses').fill('1')
    await page.getByTestId('editor-add-effect').click()
    await page.getByTestId('vocab-trigger-on_play').click()
    await page.getByTestId('vocab-action-win').click()
    await save(page)

    // The status is Korean copy now (#39), so this asserts it is not EMPTY
    // rather than matching an English word that no longer appears. The claim
    // the test is making lives in the reload below either way.
    await expect(page.getByTestId('editor-storage-status')).not.toBeEmpty()

    await page.reload()
    await goEditor(page)
    await page.getByTestId('editor-tab-library').click()
    await page.getByTestId('editor-kind').selectOption('skillCard')
    await expect(page.getByTestId('library-open-skill.keepsake')).toBeVisible()
  })
})
