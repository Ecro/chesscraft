import { createContext, useContext } from 'react'
import type { ContentSet } from '@content/load'
import type { ContentStrings } from '@content/schema'
import { ko } from '../i18n/ko'

/**
 * Key -> text resolution (AC-016, ADR-020).
 *
 * The content schema already refuses literal strings in text fields, so every
 * name and ability line reaching the screen comes through here. That is the
 * whole point of the constraint: a card is data, and its wording is a separate
 * artifact that a translator can own.
 *
 * Phase 8 adds the second source. A document carries its OWN text in a
 * `strings` overlay, and that overlay wins over the shipped bundle — which is
 * what lets a child rename a bundled piece as well as name one they authored.
 * Resolution is overlay -> bundle -> the key itself.
 *
 * `translate` is no longer exported as a bare function taking only a key. It
 * cannot be: a call site that resolved a key without the active document's
 * overlay would silently render the bundled text over the author's, and there
 * would be nothing on screen to say which one you were looking at. So the
 * overlay is bound up front — `makeTranslate` for anything outside React, the
 * context for anything inside it — and the compiler catches the call sites.
 */

export type Locale = 'ko'
export const DEFAULT_LOCALE: Locale = 'ko'

const BUNDLES: Record<Locale, Record<string, string>> = { ko }

/** A resolver already bound to a document's overlay and the active locale. */
export type Translate = (key: string) => string

/**
 * Binds an overlay (and a locale) into a resolver.
 *
 * Falls back to the key rather than to an empty string, loudly and on purpose.
 * An empty string would render an untranslated card as a card with no text,
 * which looks like a content bug rather than a missing string — and AC-016 is
 * checked by `missingKeys`, not by squinting at the screen.
 */
export function makeTranslate(strings?: ContentStrings, locale: Locale = DEFAULT_LOCALE): Translate {
  const overlay = strings?.[locale]
  return (key: string) => overlay?.[key] ?? BUNDLES[locale][key] ?? key
}

/**
 * The resolver the screens use.
 *
 * The default is the bundle-only resolver, which is exactly today's behaviour —
 * a component rendered outside the app's provider (in a unit test, say) resolves
 * shipped content and falls back to the key, rather than throwing. `App` is the
 * only thing that supplies a real overlay, because `App` is the only thing that
 * knows which document is loaded.
 */
export const TranslateContext = createContext<Translate>(makeTranslate())

export function useTranslate(): Translate {
  return useContext(TranslateContext)
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
    // Optional, so only counted when present — but counted, because `translate`
    // falls back to the key and an unresolved icon paints `piece.foo.icon`
    // across a square. AC-016 covers exactly this for the other two keys.
    add(piece.iconKey)
  }
  for (const type of set.squareTypes.values()) {
    add(type.nameKey)
    add(type.textKey)
    add(type.iconKey)
  }
  for (const card of set.ruleCards.values()) {
    add(card.nameKey)
    add(card.textKey)
    add(card.iconKey)
  }
  for (const card of set.skillCards.values()) {
    add(card.nameKey)
    add(card.textKey)
    add(card.iconKey)
  }
  for (const board of set.boards.values()) add(board.nameKey)
  for (const preset of set.presets.values()) add(preset.nameKey)

  return keys
}

/**
 * AC-016's second clause: which declared keys nothing can resolve.
 *
 * Reads the set's OWN overlay, not only the bundle. A set whose text lives
 * entirely in its own `strings` is fully translated, and reporting those keys
 * as missing would make this check fire on exactly the authored content ADR-020
 * exists to make possible.
 */
export function missingKeys(set: ContentSet, locale: Locale = DEFAULT_LOCALE): string[] {
  const resolve = makeTranslate(set.strings, locale)
  return textKeysOf(set).filter((key) => resolve(key) === key)
}
