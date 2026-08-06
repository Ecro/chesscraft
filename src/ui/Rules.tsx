import type { ContentSet } from '@content/load'
import { translate } from './i18n'

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

type Entry = { id: string; nameKey: string; textKey: string }

function Group({ id, titleKey, entries, open }: { id: string; titleKey: string; entries: Entry[]; open?: boolean }) {
  return (
    <details className="rules-group" data-testid={`rules-${id}`} open={open}>
      <summary>
        <h3>{translate(titleKey)}</h3>
      </summary>
      {entries.length === 0 ? (
        <p className="empty">{translate('ui.rules.empty')}</p>
      ) : (
        <ul>
          {entries.map((e) => (
            <li key={e.id} data-entry={e.id}>
              <strong>{translate(e.nameKey)}</strong>
              <span>{translate(e.textKey)}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

export function Rules({ content, onClose }: { content: ContentSet; onClose: () => void }) {
  // `textKey` is REQUIRED here on purpose. It is the only compile-time guard
  // keeping this screen to the four collections that carry player-facing prose:
  // `boards` and `presets` have no textKey at all, and with the property
  // optional they were structurally assignable — a fifth Group added by
  // copy-paste would have listed them silently, every description blank.
  const entries = (m: Map<string, Entry>): Entry[] =>
    [...m.values()].map((v) => ({ id: v.id, nameKey: v.nameKey, textKey: v.textKey }))

  return (
    <section className="rules" data-testid="rules">
      <div className="rules-head">
        <h2>{translate('ui.rules.title')}</h2>
        <button data-testid="rules-close" onClick={onClose}>
          {translate('ui.rules.close')}
        </button>
      </div>

      <p className="rules-intro">{translate('ui.rules.intro')}</p>

      <Group id="piece" titleKey="ui.rules.pieces" entries={entries(content.pieces)} open />
      <Group id="square" titleKey="ui.rules.squares" entries={entries(content.squareTypes)} />
      <Group id="rule" titleKey="ui.rules.ruleCards" entries={entries(content.ruleCards)} />
      <Group id="skill" titleKey="ui.rules.skillCards" entries={entries(content.skillCards)} />
    </section>
  )
}
