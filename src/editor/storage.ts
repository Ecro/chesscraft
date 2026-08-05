import type { ContentSource, ValidationError } from '@content/load'
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

/** `localStorage`, or null when the browser refuses to hand it over. */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
