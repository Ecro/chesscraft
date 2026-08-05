import { expect, test } from '@playwright/test'
import { BUNDLED_PRESET_ID, bundledContentSource } from '../src/content/sets/bundled'

/**
 * AC-010's product clause — the half the counting tests cannot see.
 *
 * `tests/content/bundled.test.ts` proves 11 rule cards, 15 skill cards and 5
 * square types exist and validate. It says nothing about whether a player ever
 * reaches one, and for two phases the answer was no: the bundle was complete,
 * fully tested, and loaded by nothing, while every count-based criterion read
 * as satisfied. This spec is the missing assertion, and it deliberately reads
 * markers ONLY the bundled document can produce rather than checking an import
 * statement — an import can be right while the thing it feeds is overridden
 * downstream.
 *
 * These tests take a FRESH page and do not import content, unlike the specs
 * that bootstrap the Phase 3 slice. That is the point: this is what a first
 * visitor gets.
 */

const ids = (records: unknown[]) => records.map((r) => (r as { id: string }).id)

test.describe('the app ships the bundled content set (AC-010)', () => {
  test('serves the bundled preset to a first visitor, with no content imported', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('preset-select')).toHaveValue(BUNDLED_PRESET_ID)
  })

  test('opens on the Los Alamos array — 24 pieces, both queens on the board', async ({ page }) => {
    await page.goto('/')
    const occupied = await page
      .locator('[data-testid^="sq-"]')
      .evaluateAll((els) => els.filter((e) => (e.getAttribute('data-piece') ?? '') !== '').length)
    expect(occupied).toBe(24)

    // The slice has no queen at all, so this cannot pass on the old content.
    const queens = await page
      .locator('[data-testid^="sq-"][data-piece="piece.queen"]')
      .evaluateAll((els) => els.length)
    expect(queens).toBe(2)
  })

  test('paints all five bundled square types, including the ADR-010 portal pair', async ({ page }) => {
    await page.goto('/')
    for (const [square, typeId] of [
      ['a3', 'square.bomb'],
      ['f3', 'square.shrine'],
      ['a4', 'square.sanctuary'],
      ['f4', 'square.mire'],
      ['b3', 'square.portal'],
      ['e4', 'square.portal'],
    ] as const) {
      await expect(page.getByTestId(`sq-${square}`)).toHaveAttribute('data-square-type', typeId)
    }
    // AC-018's readability clause, now over the shipped types rather than one.
    const legend = await page
      .getByTestId('square-legend')
      .locator('[data-square-type]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-square-type')))
    expect([...legend].sort()).toEqual([
      'square.bomb',
      'square.mire',
      'square.portal',
      'square.sanctuary',
      'square.shrine',
    ])
  })

  test('draws its rule card and skill offers from the bundled pools, not the slice', async ({ page }) => {
    await page.goto('/')

    const ruleId = await page.getByTestId('rule-card').getAttribute('data-rule')
    expect(ids(bundledContentSource.ruleCards)).toContain(ruleId)

    const offered = await page
      .locator('[data-testid^="offer-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-card') ?? ''))
    expect(offered).toHaveLength(3)
    for (const cardId of offered) expect(ids(bundledContentSource.skillCards)).toContain(cardId)
  })

  test('resolves every shipped name to real text rather than to a raw key', async ({ page }) => {
    // AC-016 in the product: a key that reached the screen means the ko bundle
    // is missing an entry for content the player can actually see.
    await page.goto('/')
    const ruleText = await page.getByTestId('rule-card').textContent()
    expect(ruleText).not.toMatch(/rule\.[a-z-]+\.(name|text)/)

    const offerTexts = await page
      .locator('[data-testid^="offer-"]')
      .evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    for (const text of offerTexts) expect(text).not.toMatch(/skill\.[a-z-]+\.(name|text)/)
  })
})
