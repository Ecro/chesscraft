import { parseProgressionProfile, type ProgressionProfileV1 } from './model'
import { persistProgression } from './record'

export type RestoreResult =
  | { ok: true; profile: ProgressionProfileV1 }
  | { ok: false; reason: 'confirmation-required' | 'corrupt' | 'future' | 'invalid' | 'quota' | 'unavailable' | 'verification'; profile: ProgressionProfileV1 }

export function exportProgressionBackup(profile: ProgressionProfileV1): string {
  return JSON.stringify(profile, null, 2)
}

export function restoreProgressionBackup(
  storage: Storage,
  current: ProgressionProfileV1,
  backup: string,
  confirmed: boolean,
): RestoreResult {
  if (!confirmed) return { ok: false, reason: 'confirmation-required', profile: current }
  let value: unknown
  try {
    value = JSON.parse(backup)
  } catch {
    return { ok: false, reason: 'corrupt', profile: current }
  }
  const parsed = parseProgressionProfile(value)
  if (!parsed.ok) return { ok: false, reason: parsed.reason, profile: current }
  return persistProgression(storage, current, parsed.profile)
}
