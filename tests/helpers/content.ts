import { loadContentSet, type ContentSet } from '@content/load'
import { cloneValid, validContentSource } from '../content/fixtures/valid-set'

/** Loads the reference fixture set, failing loudly if it stops being valid. */
export function referenceContent(): ContentSet {
  const result = loadContentSet(validContentSource)
  if (!result.ok) throw new Error(`reference fixture is invalid: ${JSON.stringify(result.errors, null, 2)}`)
  return result.set
}

/**
 * Loads a mutated copy of the reference set. The mutator receives the raw
 * source, so a test can add a piece / card / square type without touching the
 * shared fixture.
 */
export function contentWith(mutate: (src: ReturnType<typeof cloneValid>) => void): ContentSet {
  const src = cloneValid()
  mutate(src)
  const result = loadContentSet(src)
  if (!result.ok) throw new Error(`mutated fixture is invalid: ${JSON.stringify(result.errors, null, 2)}`)
  return result.set
}
