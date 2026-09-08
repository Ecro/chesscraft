import { useState } from 'react'
import type { ContentSet } from '@content/load'
import type { Side } from '@engine/types'
import { type Translate, useTranslate } from './i18n'
import { type Mark, resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'
import { type Collection, type Tier, emptyCollection, tierOf } from '../collection/record'
import { MarkBody } from './art/MarkBody'
import { Sheet } from './Sheet'
import { emptyProgression, type ProgressionProfileV1 } from '@progression/model'
import { exportProgressionBackup } from '@progression/io'
import { UpgradeReward } from './UpgradeReward'
import { UpgradeFamily } from './UpgradeFamily'

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
 * `side` matters even though a reference list has no sides. Piece art is shipped
 * as separate white/black images, and white is the side the board starts from.
 */
function markOf(t: Translate, e: Entry, side?: Side): Mark {
  return resolveMark(t, e, { registry: artRegistry, side, fallback: 'none' })
}

export function Rules({
  content,
  onClose,
  collection = emptyCollection(),
  official,
  progression = emptyProgression(),
  onProgressionChange = () => false,
  onRestoreProgression,
}: {
  content: ContentSet
  onClose: () => void
  /**
   * What this device has met. Defaults to empty so the dozen tests that mount
   * this screen to look at something else keep working, and so a browser whose
   * storage refused the read still gets a readable shelf.
   */
  collection?: Collection
  /**
   * The ids the running build ships. Anything outside it was made here.
   *
   * A prop rather than a module-level `officialIds(bundle)` call for the same
   * reason `Edit` takes one: it is what makes "official" injectable in a test
   * instead of a fact about whichever bundle happened to be imported.
   */
  official?: ReadonlySet<string>
  progression?: ProgressionProfileV1
  onProgressionChange?: (next: ProgressionProfileV1) => boolean
  onRestoreProgression?: (backup: string) => void
}) {
  const t = useTranslate()
  const [kind, setKind] = useState<KindId>('piece')
  const [open, setOpen] = useState<{ entry: Entry; kindKey: string; side: Side | undefined } | null>(null)
  const [backup, setBackup] = useState('')

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

  /**
   * What a child has reached on one entry.
   *
   * Authored records are never unmet, whatever the collection says, and that is
   * AC-004 rather than a courtesy: authorship comes from the loaded bundle
   * (`officialIds`) and not from the log, so a child who made twenty pieces
   * before this feature existed opens the shelf and finds all twenty already
   * theirs. It is also the whole migration story — there is nothing to migrate.
   */
  const isAuthored = (id: string): boolean => official !== undefined && !official.has(id)
  const tierFor = (id: string): Tier => {
    const stored = tierOf(collection, id)
    if (stored !== 'unencountered') return stored
    return isAuthored(id) ? 'seen' : 'unencountered'
  }

  // Per tab, never across the four kinds (ADR-005). A single total would be the
  // one number representing the child that this feature deliberately has not.
  const met = list.filter((e) => tierFor(e.id) !== 'unencountered').length

  return (
    <section className="dex" data-testid="rules">
      <header className="screen-head">
        <button type="button" className="back" data-testid="rules-close" aria-label={t('ui.action.back')} onClick={onClose}>
          ‹
        </button>
        <h2>{t('ui.rules.title')}</h2>
      </header>
      <p className="intro">{t('ui.rules.intro')}</p>

      <UpgradeReward
        profile={progression}
        eligibility={{ eligible: true }}
        notice="none"
        onProgressionChange={onProgressionChange}
      />

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

      <p
        className="dex-count"
        data-testid="dex-count"
        data-met={String(met)}
        data-total={String(list.length)}
        role="status"
      >
        {t('ui.dex.count').replace('{met}', String(met)).replace('{total}', String(list.length))}
      </p>

      <div className="screen-body">
        {list.length === 0 ? (
          <p className="empty">{t('ui.rules.empty')}</p>
        ) : (
          <ul className="dex-grid" aria-label={t(active.titleKey)}>
            {list.map((e) => {
              const mark = markOf(t, e, side)
              const tier = tierFor(e.id)
              const authored = isAuthored(e.id)
              return (
                <li key={e.id} data-entry={e.id} data-tier={tier} data-authored={String(authored)}>
                  <button type="button" onClick={() => setOpen({ entry: e, kindKey: active.kindKey, side })}>
                    {mark.kind !== 'none' && (
                      <span className="dex-icon" aria-hidden="true">
                        <MarkBody mark={mark} />
                      </span>
                    )}
                    <span className="dex-name">{t(e.nameKey)}</span>
                    {/* The tier and the authorship are TEXT, not only a
                        treatment. Colour and filter alone are not a cue this
                        project is allowed to rely on, and a screen reader gets
                        nothing from a CSS filter. */}
                    <span className="dex-tier">{t(`ui.dex.tier.${tier}`)}</span>
                    {authored && <span className="dex-authored">{t('ui.dex.authored')}</span>}
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
          {open.side && (
            <UpgradeFamily
              content={content}
              basePieceId={open.entry.id}
              profile={progression}
              onProgressionChange={onProgressionChange}
            />
          )}
          <button type="button" data-testid="dex-close" onClick={() => setOpen(null)}>
            {t('ui.action.close')}
          </button>
        </Sheet>
      )}

      <section className="progression-backup">
        <h3>{t('ui.progression.backup.title')}</h3>
        <textarea
          data-testid="progression-backup"
          value={backup}
          aria-label={t('ui.progression.backup.label')}
          onChange={(event) => setBackup(event.target.value)}
        />
        <div className="row-actions">
          <button type="button" data-testid="progression-export" onClick={() => setBackup(exportProgressionBackup(progression))}>
            {t('ui.progression.backup.export')}
          </button>
          <button
            type="button"
            data-testid="progression-restore"
            onClick={() => {
              if (!window.confirm(t('ui.progression.backup.confirm'))) return
              onRestoreProgression?.(backup)
            }}
          >
            {t('ui.progression.backup.restore')}
          </button>
        </div>
      </section>
    </section>
  )
}
