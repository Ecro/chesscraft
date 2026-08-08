import type { Page } from '@playwright/test'

/**
 * Authoring an effect through the sentence, for the e2e specs.
 *
 * PLAN Phase 7 of unified-create-ux deleted the indexed palette these specs used
 * to click (`editor-add-effect` then a `vocab-<axis>-<kind>` button per axis). The
 * replacement is one chip per clause: tap the slot, choose the entry in its sheet.
 *
 * The helper exists rather than 30 inline three-line sequences because the mapping
 * from a vocabulary axis to the slot that owns it is one fact, and a fact repeated
 * per call site is a fact that drifts.
 */

/** Which sentence slot owns each vocabulary axis. */
const SLOT_OF: Readonly<Record<string, string>> = {
  trigger: 'when',
  condition: 'cond',
  action: 'then',
  target: 'who',
  destination: 'where',
  forEach: 'each',
}

/**
 * Chooses one vocabulary entry in the slot that owns its axis.
 *
 * The `Escape` at the end is load-bearing in a browser and was not in jsdom: the
 * sheet stays open after a choice (its parameters live there, ADR-004) and its
 * scrim swallows pointer events, so without dismissing it the NEXT slot's chip is
 * present, visible and unclickable. A test that omitted it would time out on an
 * element it can see, which is the least diagnosable failure available.
 */
export async function say(page: Page, axis: keyof typeof SLOT_OF | string, kind: string) {
  const slot = SLOT_OF[axis]
  if (slot === undefined) throw new Error(`no sentence slot owns the ${axis} axis`)
  await page.getByTestId(`slot-${slot}`).click()
  await page.getByTestId(`opt-${slot}-${kind}`).click()
  await page.keyboard.press('Escape')
}

/** Sets a parameter inside the currently addressed slot's sheet. */
export async function sayParam(page: Page, slot: string, testid: string, value?: string) {
  await page.getByTestId(`slot-${slot}`).click()
  const control = page.getByTestId(testid)
  if (value === undefined) await control.click()
  else await control.fill(value)
  await page.keyboard.press('Escape')
}
