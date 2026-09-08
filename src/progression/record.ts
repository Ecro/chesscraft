import { emptyProgression, parseProgressionProfile, type ProgressionProfileV1 } from './model'

export const PROGRESSION_KEY = 'chess-craft.progression.v1'

export type LoadProgressionResult =
  | { ok: true; profile: ProgressionProfileV1 }
  | { ok: false; reason: 'absent' | 'corrupt' | 'future' | 'invalid' | 'unavailable'; profile: ProgressionProfileV1 }

export type PersistProgressionResult =
  | { ok: true; profile: ProgressionProfileV1 }
  | { ok: false; reason: 'quota' | 'unavailable' | 'verification' | 'invalid'; profile: ProgressionProfileV1 }

function quotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: unknown }).name
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || name === 'QUOTA_EXCEEDED_ERR'
}

export function loadProgression(storage: Storage): LoadProgressionResult {
  let raw: string | null
  try {
    raw = storage.getItem(PROGRESSION_KEY)
  } catch {
    return { ok: false, reason: 'unavailable', profile: emptyProgression() }
  }
  if (raw === null) return { ok: false, reason: 'absent', profile: emptyProgression() }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'corrupt', profile: emptyProgression() }
  }
  const parsed = parseProgressionProfile(value)
  return parsed.ok
    ? parsed
    : { ok: false, reason: parsed.reason, profile: emptyProgression() }
}

/** One setItem, followed by verification; failures retain the caller's current snapshot. */
export function persistProgression(
  storage: Storage,
  current: ProgressionProfileV1,
  requested: ProgressionProfileV1,
): PersistProgressionResult {
  const parsed = parseProgressionProfile(requested)
  if (!parsed.ok) return { ok: false, reason: 'invalid', profile: current }
  const payload = JSON.stringify(parsed.profile)
  try {
    storage.setItem(PROGRESSION_KEY, payload)
  } catch (error) {
    return { ok: false, reason: quotaError(error) ? 'quota' : 'unavailable', profile: current }
  }
  try {
    if (storage.getItem(PROGRESSION_KEY) !== payload) {
      return { ok: false, reason: 'verification', profile: current }
    }
  } catch {
    return { ok: false, reason: 'unavailable', profile: current }
  }
  return { ok: true, profile: parsed.profile }
}
