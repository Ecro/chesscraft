// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBundledContent } from '@content/sets/bundled'
import { emptyProgression } from '@progression/model'
import { UpgradeFamily } from '../../src/ui/UpgradeFamily'
import { UpgradeReward } from '../../src/ui/UpgradeReward'

afterEach(cleanup)

describe('progression screen-reader landmarks', () => {
  it('names the reward region and announces the current Spark balance politely', () => {
    render(
      <UpgradeReward
        profile={{ ...emptyProgression(), sparks: 3 }}
        eligibility={{ eligible: true }}
        notice="none"
        onProgressionChange={() => true}
      />,
    )

    expect(screen.getByRole('region', { name: '강화 기물 획득' })).toBeTruthy()
    expect(screen.getByTestId('progression-sparks').getAttribute('role')).toBe('status')
    expect(screen.getByTestId('progression-sparks').getAttribute('aria-live')).toBe('polite')
  })

  it('names an upgrade family region with the exact target piece', () => {
    render(
      <UpgradeFamily
        content={loadBundledContent()}
        basePieceId="piece.pawn"
        profile={{ ...emptyProgression(), sparks: 5 }}
        onProgressionChange={() => true}
      />,
    )

    expect(screen.getByRole('region', { name: '재빠른 병사 강화' })).toBeTruthy()
  })
})
