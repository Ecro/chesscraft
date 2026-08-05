import { type ContentSet, loadContentSet } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'

/**
 * The content the product actually ships (AC-010).
 *
 * Phase 7's statistical and property suites deliberately run against this
 * rather than against the hand-built test fixture. A median ply length or an
 * invariant walk measured on a fixture nobody plays answers a question nobody
 * asked — AC-012's bound is a claim about the game as shipped, and rule cards
 * are exactly the content most likely to change how long a match runs.
 */
export function shippedContent(): ContentSet {
  const result = loadContentSet(bundledContentSource)
  if (!result.ok) throw new Error(`the shipped content set is invalid: ${JSON.stringify(result.errors, null, 2)}`)
  return result.set
}
