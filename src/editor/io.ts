import { SCHEMA_VERSION } from '@content/schema'
import { type ContentSource, type ValidationError, loadContentSet, normalizeBoard, normalizeSkillCard } from '@content/load'

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

  // Hoisted: the guard above narrowed this to a number, but the narrowing does
  // not survive into the closure below.
  const declaredVersion: number = raw.schemaVersion
  const source: ContentSource = { schemaVersion: SCHEMA_VERSION, pieces: [], squareTypes: [], ruleCards: [], skillCards: [], boards: [], presets: [] }
  for (const collection of COLLECTIONS) {
    const list = raw[collection]
    // The export re-stamps `schemaVersion` to this build's, so every record must
    // be brought up to it — through the loader's OWN normalizer, never a copy.
    // This branch was a copy until v12, and the copy going stale is exactly what
    // `[fail:design] shared-vocabulary-unshared-code-path` records.
    source[collection] = Array.isArray(list)
      ? collection === 'skillCards'
        ? list.map((record) => normalizeSkillCard(record, declaredVersion))
        : collection === 'boards'
          ? list.map((record) => normalizeBoard(record, declaredVersion))
        : (list as unknown[])
      : []
  }
  // The result is rebuilt field by field rather than passed through, so a field
  // missing from this function round-trips as `undefined` while every schema
  // test stays green. `strings` (ADR-020) is a field, not a collection, and it
  // is the whole of what an author typed — dropping it here would make an
  // export readable on the device that wrote it and nowhere else.
  // The cast is safe: `loadContentSet` above has already validated this shape.
  if (raw.strings !== undefined) source.strings = raw.strings as NonNullable<ContentSource['strings']>
  return { ok: true, source }
}
