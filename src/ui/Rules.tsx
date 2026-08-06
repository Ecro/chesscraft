import type { ContentSet } from '@content/load'
import type { Side } from '@engine/types'
import { type Translate, useTranslate } from './i18n'
import { resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'
import { MarkBody } from './art/MarkBody'

/**
 * The reference screen: everything this content set contains, in the player's
 * words (PLAN Phase 3).
 *
 * Generated from the loaded `ContentSet`, never from a written-down list. That
 * is not tidiness — it is the property that makes the screen survive the
 * editor. A piece someone authors appears here with no code change, and a
 * hand-maintained list would go stale the first time anyone used the feature
 * this whole product is built around. It also keeps ADR-011 intact: this file
 * names no piece, card or square type, it only knows there are four kinds of
 * thing and that each carries a name key and a text key.
 */

type Entry = { id: string; nameKey: string; textKey: string; iconKey?: string | undefined; artKey?: string | undefined }

/** Art if the catalogue has it, else the glyph, else nothing — the same chain
 *  the board uses, so this screen and the square agree on what a type looks
 *  like. Nothing rather than a monogram: this is a reference list, and an
 *  invented mark beside every unmarked entry would decode nothing.
 *
 *  `side` matters even though a reference list has no sides. Piece art is
 *  ALWAYS a sided entry (ADR-007), and a sided entry read with no side falls
 *  through to the glyph — so omitting this would mean no piece could ever show
 *  its art on the one screen built to decode the icon vocabulary. One side has
 *  to be picked; white is the one the board starts from. */
function markOf(t: Translate, e: Entry, side?: Side) {
  return resolveMark(t, e, { registry: artRegistry, side, fallback: 'none' })
}

function Group({
  id,
  titleKey,
  entries,
  open,
  side,
}: { id: string; titleKey: string; entries: Entry[]; open?: boolean; side?: Side }) {
  const t = useTranslate()
  return (
    <details className="rules-group" data-testid={`rules-${id}`} open={open}>
      <summary>
        <h3>{t(titleKey)}</h3>
      </summary>
      {entries.length === 0 ? (
        <p className="empty">{t('ui.rules.empty')}</p>
      ) : (
        <ul>
          {entries.map((e) => {
            const mark = markOf(t, e, side)
            return (
            <li key={e.id} data-entry={e.id}>
              {/* The lookup surface for the icon vocabulary. Without it a child
                  who sees a mark on a square during a match can only learn what
                  it means DURING that match, from the legend — this screen is
                  the one place to find out beforehand. Resolved through the
                  same `translate` as everything else, and `aria-hidden` because
                  the name sits immediately beside it. */}
              <span className="entry-head">
                {mark.kind !== 'none' && (
                  <span className="legend-icon" aria-hidden="true">
                    <MarkBody mark={mark} />
                  </span>
                )}
                <strong>{t(e.nameKey)}</strong>
              </span>
              <span>{t(e.textKey)}</span>
            </li>
            )
          })}
        </ul>
      )}
    </details>
  )
}

export function Rules({ content, onClose }: { content: ContentSet; onClose: () => void }) {
  const t = useTranslate()
  // `textKey` is REQUIRED here on purpose. It is the only compile-time guard
  // keeping this screen to the four collections that carry player-facing prose:
  // `boards` and `presets` have no textKey at all, and with the property
  // optional they were structurally assignable — a fifth Group added by
  // copy-paste would have listed them silently, every description blank.
  const entries = (m: Map<string, Entry>): Entry[] =>
    [...m.values()].map((v) => ({ id: v.id, nameKey: v.nameKey, textKey: v.textKey, iconKey: v.iconKey, artKey: v.artKey }))

  return (
    <section className="rules" data-testid="rules">
      <div className="rules-head">
        <h2>{t('ui.rules.title')}</h2>
        <button data-testid="rules-close" onClick={onClose}>
          {t('ui.rules.close')}
        </button>
      </div>

      <p className="rules-intro">{t('ui.rules.intro')}</p>

      {/* `side` only here: piece art is always a sided entry (ADR-007), and a
          sided entry read with no side falls through to the glyph — so without
          this the one screen built to decode the icon vocabulary would be the
          one screen that never shows piece art. */}
      <Group id="piece" titleKey="ui.rules.pieces" entries={entries(content.pieces)} open side="white" />
      <Group id="square" titleKey="ui.rules.squares" entries={entries(content.squareTypes)} />
      <Group id="rule" titleKey="ui.rules.ruleCards" entries={entries(content.ruleCards)} />
      <Group id="skill" titleKey="ui.rules.skillCards" entries={entries(content.skillCards)} />
    </section>
  )
}
