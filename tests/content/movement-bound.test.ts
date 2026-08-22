import { describe, expect, it } from 'vitest'
import {
  boardTurnDistance,
  boardTurnDistanceFromMax,
  automaticTurningEndpointUpperBound,
  isCompassVector,
  isValidTurnPair,
  turningEndpointUpperBound,
  turningPathDistance,
} from '@content/movement'

describe('turning-slide geometry contract', () => {
  it('uses the rectangular board bound and clamps authored caps', () => {
    expect(boardTurnDistance(6, 6)).toBe(10)
    expect(boardTurnDistance(3, 8)).toBe(9)
    expect(boardTurnDistanceFromMax(1)).toBe(2)
    expect(boardTurnDistanceFromMax(6)).toBe(10)
    expect(boardTurnDistanceFromMax(8)).toBe(14)
    expect(turningPathDistance(undefined, 6, 6)).toBe(10)
    expect(turningPathDistance(4, 6, 6)).toBe(4)
    expect(turningPathDistance(99, 6, 6)).toBe(10)
  })

  it.each([
    [2, 3],
    [3, 6],
    [4, 10],
  ])('counts direct endpoints plus every positive split for D=%s', (distance, expected) => {
    expect(turningEndpointUpperBound(distance)).toBe(expected)
  })

  it('counts six automatic second-leg directions for each authored first vector', () => {
    expect(automaticTurningEndpointUpperBound(2)).toBe(8)
    expect(automaticTurningEndpointUpperBound(3, 2)).toBe(42)
  })

  it('accepts only compass unit vectors and a real ordered turn', () => {
    expect(isCompassVector([1, 0])).toBe(true)
    expect(isCompassVector([-1, -1])).toBe(true)
    expect(isCompassVector([2, 0])).toBe(false)
    expect(isCompassVector([1, 2])).toBe(false)
    expect(isValidTurnPair([1, 0], [0, 1])).toBe(true)
    expect(isValidTurnPair([1, 0], [1, 0])).toBe(false)
    expect(isValidTurnPair([1, 0], [-1, 0])).toBe(false)
  })
})
