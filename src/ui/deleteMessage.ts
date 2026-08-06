import type { ContentSource } from '@content/load'
import type { DeleteResult } from '@editor/draft'
import type { Translate } from './i18n'
import { recordLabel } from './recordLabel'

/**
 * Turns a refused delete into a sentence the child can act on (PLAN Phase 9b).
 *
 * The whole reason `deleteRecord` returns the referring room IDS instead of a
 * boolean is this function. "이 기물은 참조되고 있습니다" is true, is what the
 * data model would say, and tells a nine-year-old nothing about what to do
 * next; naming the room does, because the room is the thing they can go and
 * change. The ids are resolved through the same `recordLabel` the room list
 * uses, so the name in the refusal is the name on the button they will look for.
 *
 * Lives in its own module because BOTH panels raise it — the room list and the
 * library — and a refusal worded differently in the two places would read as two
 * different rules.
 */
export function deleteRefusal(
  t: Translate,
  source: ContentSource,
  result: Extract<DeleteResult, { ok: false }>,
): string {
  if (result.reason === 'referenced') {
    const names = result.rooms.map((id) => {
      const room = source.presets.find((p) => (p as { id?: unknown }).id === id) as { nameKey?: unknown } | undefined
      return recordLabel(t, id, room?.nameKey)
    })
    return `${t('ui.editor.delete.referenced')} ${names.join(', ')}`
  }
  return t(`ui.editor.delete.${result.reason}`)
}
