import type { ContentSource, ValidationError } from '@content/load'
import type { BundleStamp } from '@content/merge'
import { importContent } from './io'

/**
 * Browser-local persistence for authored content.
 *
 * The decision the PLAN recorded is the one this file implements: exceeding the
 * quota REFUSES the save and reports it. Swallowing the exception would lose an
 * author's work behind a success-looking UI, and that is the one failure here
 * that cannot be undone afterwards.
 *
 * `Storage` is a parameter rather than a global. Two reasons, and the second is
 * the important one: the quota case becomes testable at all, and a browser that
 * denies storage entirely (private mode, blocked third-party context) throws on
 * the very first access — a module that grabbed `localStorage` at import time
 * would take the whole app down instead of reporting it.
 */

export const STORAGE_KEY = 'strange-chess.content.v1'

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable'; message: string }

export type LoadResult =
  | { ok: true; source: ContentSource }
  | { ok: false; reason: 'absent' | 'corrupt' | 'unavailable'; message: string }
  | { ok: false; reason: 'invalid'; message: string; errors: ValidationError[] }

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const name = (e as { name?: unknown }).name
  // Firefox and Safari report their own names for the same condition.
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || name === 'QUOTA_EXCEEDED_ERR'
}

export function saveContent(storage: Storage, source: ContentSource): SaveResult {
  try {
    // Written in one call: clearing first would make a failing write destroy
    // the last content that fit, which is the loss this whole path avoids.
    storage.setItem(STORAGE_KEY, JSON.stringify(source))
    return { ok: true }
  } catch (e) {
    if (isQuotaError(e)) {
      return {
        ok: false,
        reason: 'quota',
        message: 'browser storage is full — this content was not saved. Export it to a file, or remove some content.',
      }
    }
    return { ok: false, reason: 'unavailable', message: `browser storage is unavailable: ${String(e)}` }
  }
}

export function loadStoredContent(storage: Storage): LoadResult {
  let stored: string | null
  try {
    stored = storage.getItem(STORAGE_KEY)
  } catch (e) {
    return { ok: false, reason: 'unavailable', message: `browser storage is unavailable: ${String(e)}` }
  }
  if (stored === null) return { ok: false, reason: 'absent', message: 'nothing saved yet' }

  const result = importContent(stored)
  if (result.ok) return { ok: true, source: result.source }

  const jsonFailure = result.errors.some((e) => e.message.startsWith('not valid JSON'))
  if (jsonFailure) return { ok: false, reason: 'corrupt', message: result.errors[0]!.message }
  return {
    ok: false,
    reason: 'invalid',
    message: 'saved content no longer validates against this build',
    errors: result.errors,
  }
}

/**
 * Which bundled ids existed when the author last saved
 * (PLAN-bundled-content-merge ADR-002).
 *
 * Its own key, deliberately. The obvious home is a field on the saved document
 * and it does not survive one round trip: `loadStoredContent` below reads through
 * `importContent`, which rebuilds the source field by field, so an unknown
 * top-level field is silently dropped on the very next read.
 */
export const STAMP_KEY = 'strange-chess.bundle-stamp.v1'

/**
 * The stored stamp, or null when there isn't a usable one.
 *
 * Every failure — absent, corrupt, wrong shape, storage denied — resolves to
 * null, and the caller then synthesises a stamp from the current bundle
 * (ADR-003), which adds nothing. That direction is the safe one. The unsafe
 * direction is a stamp read too permissively: a stamp naming ids the saved
 * document does not have makes records the author can still see look like
 * records they deleted (ADR-001 row 6), and they vanish. Hence the shape check
 * rather than a cast — the stamp may lag the content, never lead it.
 */
export function loadStamp(storage: Storage): BundleStamp | null {
  let raw: string | null
  try {
    raw = storage.getItem(STAMP_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const ids = (parsed as { ids?: unknown }).ids
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return null
  return { ids: ids as string[] }
}

/**
 * Advance the stamp. Never throws.
 *
 * The one call site is the editor's save path, and only on the branch where
 * `saveContent` returned ok — so this write is always the second of a pair whose
 * first half already succeeded. Letting it throw would turn a full quota into a
 * crash on a save that had just worked, and losing a stamp write costs the author
 * nothing: the merge recomputes from a stale stamp safely (the affected ids
 * become ADR-001 row 5, so the saved records are kept) and the next accepted save
 * re-synchronises.
 */
export function saveStamp(storage: Storage, stamp: BundleStamp): void {
  try {
    storage.setItem(STAMP_KEY, JSON.stringify(stamp))
  } catch {
    // Intentionally silent — see above. The content is already stored.
  }
}

/**
 * Forget everything this browser has saved, so the next load is a first run.
 *
 * The escape hatch. The merge decides what an install receives from a stamp and
 * a saved document, and both of those are inferences about what the author
 * meant — when they are wrong, or when a device is simply stuck, there has to be
 * one action a person can take that is not an inference. This is it: drop both
 * keys and the app falls back to the shipped set, whole.
 *
 * BOTH keys, and that is the load-bearing part. Clearing the content while
 * leaving the stamp behind would be worse than doing nothing: the next save
 * would write a fresh document under an old stamp, and every record the stamp
 * names and the document lacks reads as a deletion the author never made. A
 * stamp without its content is the one state the invariant forbids.
 *
 * Never throws — a browser that denies storage has nothing to clear anyway, and
 * this is the button a person presses when things are already going wrong.
 */
export function clearStoredContent(storage: Storage): void {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to report: the caller's next load reads storage directly.
  }
  try {
    storage.removeItem(STAMP_KEY)
  } catch {
    // Separate try so a failure on the first key cannot skip the second — that
    // asymmetry is exactly the stamp-without-content state described above.
  }
}

/** `localStorage`, or null when the browser refuses to hand it over. */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
