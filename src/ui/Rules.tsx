import { useState } from 'react'
import type { ContentSet } from '@content/load'
import type { Side } from '@engine/types'
import { type Translate, useTranslate } from './i18n'
import { type Mark, resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'
import { MarkBody } from './art/MarkBody'
import { Sheet } from './Sheet'

/**
 * The dex: everything this content set contains, in the player's words.
 *
 * Generated from the loaded `ContentSet`, never from a written-down list. That
 * is not tidiness — it is the property that makes the screen survive the editor.
 * A piece someone authors appears here with no code change, and a
 * hand-maintained list would go stale the first time anyone used the feature
 * this whole product is built around. It also keeps ADR-011 intact: this file
 * names no piece, card or square type; it knows only that there are four kinds
 * of thing and that each carries a name key and a text key.
 *
 * ## Tabs and tiles, not four stacked `<details>`
 *
 * The old shape put four collapsible groups on one scroll, and the bundled set
 * has 37 records in them. Opening the last group meant scrolling past everything
 * above it, every time, and a child looking up the mark they just saw on a
 * square had to read prose to find the picture.
 *
 * A tile grid inverts that: the MARK is the thing you scan for, four across, and
 * the prose is one tap away in the same sheet the match screen uses. The
 * `rules-<kind>` test ids survive on the tab buttons — the groups still exist,
 * they are just not all on screen at once.
 */

type Entry = { id: string; nameKey: string; textKey: string; iconKey?: string | undefined; artKey?: string | undefined }

const KINDS = [
  { id: 'piece', titleKey: 'ui.rules.pieces', kindKey: 'ui.dex.kind.piece' },
  { id: 'square', titleKey: 'ui.rules.squares', kindKey: 'ui.dex.kind.square' },
  { id: 'rule', titleKey: 'ui.rules.ruleCards', kindKey: 'ui.dex.kind.rule' },
  { id: 'skill', titleKey: 'ui.rules.skillCards', kindKey: 'ui.dex.kind.skill' },
] as const

type KindId = (typeof KINDS)[number]['id']

/**
 * Art if the catalogue has it, else the glyph, else nothing — the same chain the
 * board uses, so this screen and the square agree on what a type looks like.
 * Nothing rather than a monogram: this is a reference list, and an invented mark
 * beside every unmarked entry would decode nothing.
 *
 * `side` matters even though a reference list has no sides. A pixel piece sprite
 * tints its `$` cells from the side it is handed, and with none it falls to the
 * neutral tint — readable, but not the blue a player has been staring at all
 * match. White is the side the board starts from.
 */
function markOf(t: Translate, e: Entry, side?: Side): Mark {
  return resolveMark(t, e, { registry: artRegistry, side, fallback: 'none' })
}

export function Rules({ content, onClose }: { content: ContentSet; onClose: () => void }) {
  const t = useTranslate()
  const [kind, setKind] = useState<KindId>('piece')
  const [open, setOpen] = useState<{ entry: Entry; kindKey: string; side: Side | undefined } | null>(null)

  // `textKey` is REQUIRED here on purpose. It is the only compile-time guard
  // keeping this screen to the four collections that carry player-facing prose:
  // `boards` and `presets` have no textKey at all, and with the property
  // optional they were structurally assignable — a fifth kind added by
  // copy-paste would have listed them silently, every description blank.
  const entries = (m: Map<string, Entry>): Entry[] =>
    [...m.values()].map((v) => ({ id: v.id, nameKey: v.nameKey, textKey: v.textKey, iconKey: v.iconKey, artKey: v.artKey }))

  const sets: Record<KindId, Entry[]> = {
    piece: entries(content.pieces),
    square: entries(content.squareTypes),
    rule: entries(content.ruleCards),
    skill: entries(content.skillCards),
  }
  // Only pieces are sided; see the note on `markOf`.
  const side: Side | undefined = kind === 'piece' ? 'white' : undefined
  const active = KINDS.find((k) => k.id === kind) ?? KINDS[0]
  const list = sets[kind]

  return (
    <section className="dex" data-testid="rules">
      <header className="screen-head">
        <button type="button" className="back" data-testid="rules-close" aria-label={t('ui.action.back')} onClick={onClose}>
          ‹
        </button>
        <h2>{t('ui.rules.title')}</h2>
      </header>

      {/* `role="tablist"` is deliberately NOT claimed. The real pattern requires
          arrow-key roving focus and `aria-controls` onto a `tabpanel`, and a
          half-implemented tablist is worse than plain buttons: it promises
          keyboard behaviour that is not there. These are buttons that change
          what is below them, and `aria-pressed` says which one is on. */}
      <div className="dex-tabs">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            data-testid={`rules-${k.id}`}
            data-selected={k.id === kind}
            aria-pressed={k.id === kind}
            onClick={() => {
              setKind(k.id)
              setOpen(null)
            }}
          >
            {t(k.titleKey)}
          </button>
        ))}
      </div>

      <div className="screen-body">
        {list.length === 0 ? (
          <p className="empty">{t('ui.rules.empty')}</p>
        ) : (
          <ul className="dex-grid" aria-label={t(active.titleKey)}>
            {list.map((e) => {
              const mark = markOf(t, e, side)
              return (
                <li key={e.id} data-entry={e.id}>
                  <button type="button" onClick={() => setOpen({ entry: e, kindKey: active.kindKey, side })}>
                    {mark.kind !== 'none' && (
                      <span className="dex-icon" aria-hidden="true">
                        <MarkBody mark={mark} />
                      </span>
                    )}
                    <span className="dex-name">{t(e.nameKey)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {open && (
        // The same modal sheet the match screen uses — the `aria-modal` here was
        // the second copy of a claim neither call site implemented.
        <Sheet label={t(open.entry.nameKey)} onClose={() => setOpen(null)} scrimTestId="dex-sheet">
          <div className="sheet-head">
            <span className="sheet-icon" aria-hidden="true">
              <MarkBody mark={markOf(t, open.entry, open.side)} />
            </span>
            <span>
              <strong>{t(open.entry.nameKey)}</strong>
              <span className="sheet-kind">{t(open.kindKey)}</span>
            </span>
          </div>
          <p className="sheet-text">{t(open.entry.textKey)}</p>
          <button type="button" data-testid="dex-close" onClick={() => setOpen(null)}>
            {t('ui.action.close')}
          </button>
        </Sheet>
      )}
    </section>
  )
}
