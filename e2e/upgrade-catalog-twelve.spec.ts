import { expect, test } from '@playwright/test'

test('forges a new family variant, reloads and equips only its chosen square', async ({ page }, info) => {
  await page.goto('/dex')
  await page.evaluate(() => localStorage.setItem('chess-craft.progression.v1', JSON.stringify({
    version: 1, sparks: 5, ownedUpgradeIds: ['piece.pawn-plus', 'piece.knight-plus', 'piece.bishop-plus', 'piece.rook-plus'],
    equipped: {}, nextOfferNonce: 4, recentClaimIds: [],
  })))
  await page.reload()
  await expect(page.getByTestId('upgrade-collection-count')).toContainText('4 / 12')
  await expect(page.locator('[data-testid^="upgrade-album-"]')).toHaveCount(12)
  await page.getByTestId('upgrade-album-piece.rook-scout').scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('twelve-album.png') })
  await page.locator('[data-entry="piece.pawn"] button').click()
  await page.getByTestId('upgrade-family-choice').selectOption('piece.pawn-scout')
  await page.getByTestId('upgrade-practice-piece.pawn-scout').click()
  await page.getByTestId('practice-square-b4').click()
  await expect(page.getByTestId('practice-square-b4')).toHaveAttribute('data-piece', 'piece.pawn-scout')
  await page.getByTestId('upgrade-forge-piece.pawn-scout').click()
  await expect(page.getByTestId('upgrade-acquired')).toContainText('정찰 병사')
  await page.reload()
  await expect(page.getByTestId('upgrade-collection-count')).toContainText('5 / 12')
  await expect(page.getByTestId('progression-sparks')).toContainText('0')
  await page.getByTestId('rules-close').click()
  await page.getByTestId('start-match').click()
  await page.getByTestId('equipment-white-upgrade').selectOption('piece.pawn-scout')
  await page.getByTestId('equipment-white-square').selectOption('b2')
  await expect(page.getByTestId('eligibility-status')).toHaveAttribute('data-eligible', 'true')
  await page.getByTestId('lobby-start').click()
  await expect(page.getByTestId('sq-b2')).toHaveAttribute('data-piece', 'piece.pawn-scout')
  await expect(page.getByTestId('sq-a2')).toHaveAttribute('data-piece', 'piece.pawn')
})
