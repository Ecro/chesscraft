/** Compass movement primitives shared by the schema, engine, and accounting. */

export type CompassVector = readonly [number, number]

const COMPASS_VECTORS = new Set([
  '0,1',
  '1,1',
  '1,0',
  '1,-1',
  '0,-1',
  '-1,-1',
  '-1,0',
  '-1,1',
])

function vectorKey([df, dr]: CompassVector): string {
  return `${df},${dr}`
}

/** Whether a vector is one of the eight unit compass directions. */
export function isCompassVector(vector: CompassVector): boolean {
  return COMPASS_VECTORS.has(vectorKey(vector))
}

/** Whether two vectors describe a real ordered turn rather than straight/U-turn travel. */
export function isValidTurnPair(first: CompassVector, second: CompassVector): boolean {
  if (!isCompassVector(first) || !isCompassVector(second)) return false
  const same = first[0] === second[0] && first[1] === second[1]
  const opposite = first[0] === -second[0] && first[1] === -second[1]
  return !same && !opposite
}

/** A conservative maximum total path distance for a rectangular board. */
export function boardTurnDistance(width: number, height: number): number {
  return Math.max(2, width + height - 2)
}

/** The same conservative distance when consumers only know the board's longest side. */
export function boardTurnDistanceFromMax(boardMax: number): number {
  return Math.max(2, boardMax * 2 - 2)
}

/** Resolve an authored cap against the dimension-aware board bound. */
export function turningPathDistance(maxDistance: number | undefined, width: number, height: number): number {
  const bound = boardTurnDistance(width, height)
  return Math.min(maxDistance ?? bound, bound)
}

/** Direct first-leg endpoints plus all positive one-bend split endpoints. */
export function turningEndpointUpperBound(distance: number): number {
  return distance + (distance * (distance - 1)) / 2
}
