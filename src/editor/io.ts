import { SCHEMA_VERSION } from '@content/schema'
import { type ContentSource, type ValidationError, loadContentSet } from '@content/load'

/**
 * JSON export and import (AC-015).
 *
 * Export is deliberately not "serialize the loaded set". A `ContentSet` is a
 * set of Maps the loader built; round-tripping through it would silently drop
 * anything the loader does not keep, and the round trip would still look
 * successful. The document is the artifact, so the document is what leaves.
 *
 * Import is fail-closed for the same reason the loader is (AC-011): a file that
 * does not validate never becomes the session's content, and the caller is told
 * which field is at fault rather than being handed a half-loaded set.
 */

const COLLECTIONS = ['pieces', 'squareTypes', 'ruleCards', 'skillCards', 'boards', 'presets'] as const

export type ImportResult = { ok: true; source: ContentSource } | { ok: false; errors: ValidationError[] }

export function exportContent(source: ContentSource): string {
  return JSON.stringify(source, null, 2)
}

export function importContent(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [{ contentId: 'root', path: '', message: `not valid JSON: ${String(e)}` }] }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: [{ contentId: 'root', path: '', message: 'content must be a JSON object' }] }
  }
  const raw = parsed as Record<string, unknown>

  /**
   * A document from a future build parses, and every field this build knows
   * about may still validate — while the parts it does not know are silently
   * dropped on the next save. Refusing is the only honest answer: the
   * alternative is data loss disguised as a successful import.
   */
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        {
          contentId: 'root',
          path: 'schemaVersion',
          message: `this build understands schema version ${SCHEMA_VERSION}, but the file declares ${String(raw.schemaVersion)}`,
        },
      ],
    }
  }

  const result = loadContentSet(parsed)
  if (!result.ok) return { ok: false, errors: result.errors }

  const source: ContentSource = { schemaVersion: raw.schemaVersion, pieces: [], squareTypes: [], ruleCards: [], skillCards: [], boards: [], presets: [] }
  for (const collection of COLLECTIONS) {
    const list = raw[collection]
    source[collection] = Array.isArray(list) ? (list as unknown[]) : []
  }
  return { ok: true, source }
}
