import type { ContentSet } from '@content/load'
import { ko } from '../i18n/ko'

/**
 * Key -> text resolution (AC-016).
 *
 * The content schema already refuses literal strings in text fields, so every
 * name and ability line reaching the screen comes through here. That is the
 * whole point of the constraint: a card is data, and its wording is a separate
 * artifact that a translator can own.
 */

export type Locale = 'ko'
export const DEFAULT_LOCALE: Locale = 'ko'

const BUNDLES: Record<Locale, Record<string, string>> = { ko }

/**
 * Resolves a key, falling back to the key itself.
 *
 * Loud on purpose. An empty string would render an untranslated card as a card
 * with no text, which looks like a content bug rather than a missing string —
 * and AC-016 is checked by `missingKeys`, not by squinting at the screen.
 */
export function translate(key: string, locale: Locale = DEFAULT_LOCALE): string {
  return BUNDLES[locale][key] ?? key
}

/** Every player-facing text key a content set declares, in declaration order. */
export function textKeysOf(set: ContentSet): string[] {
  const keys: string[] = []
  const add = (key: string | undefined) => {
    if (key && !keys.includes(key)) keys.push(key)
  }

  for (const piece of set.pieces.values()) {
    add(piece.nameKey)
    add(piece.textKey)
  }
  for (const type of set.squareTypes.values()) {
    add(type.nameKey)
    add(type.textKey)
  }
  for (const card of set.ruleCards.values()) {
    add(card.nameKey)
    add(card.textKey)
  }
  for (const card of set.skillCards.values()) {
    add(card.nameKey)
    add(card.textKey)
  }
  for (const board of set.boards.values()) add(board.nameKey)
  for (const preset of set.presets.values()) add(preset.nameKey)

  return keys
}

/** AC-016's second clause: which declared keys the locale bundle cannot resolve. */
export function missingKeys(set: ContentSet, locale: Locale = DEFAULT_LOCALE): string[] {
  return textKeysOf(set).filter((key) => BUNDLES[locale][key] === undefined)
}
