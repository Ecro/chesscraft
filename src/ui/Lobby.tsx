import { useMemo, useState } from 'react'
import { checkLoadoutGrades } from '@balance/legal'
import { withinEnvelope } from '@engine/ai/complexity'
import { DIFFICULTIES, type Difficulty } from '@engine/ai/difficulty'
import type { ContentSet, ContentSource } from '@content/load'
import { exportContent, importContent } from '@editor/io'
import type { Side } from '@engine/types'
import { ART_ASSETS, BRAND_ART } from './art/assets'
import { ImageMark } from './art/ImageMark'
import { MiniBoard } from './MiniBoard'
import { MAX_NAME_LENGTH } from './settings'
import { useTranslate } from './i18n'
import { recordLabel } from './recordLabel'
import type { EffectiveEquipment } from '@engine/loadout'
import { emptyProgression, type ProgressionProfileV1 } from '@progression/model'
import { resolveEquipment } from '@progression/equipment'
import { standardEligibility, type StandardEligibility } from '@progression/eligibility'
import { UpgradeEquipment } from './UpgradeEquipment'

/**
 * Who is playing, in which room, and how to give that room away.
 *
 * The screen that did not exist. Two children shared one phone and the app never
 * asked their names, so the turn bar named a colour and the hand-off between turns
 * said nothing at all — ADR-018 chose one shared board over an automatic
 * rotation precisely because the two players are looking at the same thing, and
 * that decision only pays off if the board can say WHO is looking.
 *
 * ## The share control is not a nine-character code
 *
 * The design shows `CRAFT-7K2M9`. A short code is a handle into a server that
 * holds the room, and this app has no server and is built not to need one — it
 * is installable, precached, and works with the network gone. So what travels is
 * the room ITSELF: the document, as text, which is long.
 *
 * That is a real downgrade from the mock and it is the honest version. Faking
 * the short code would mean either inventing a backend or generating a code that
 * decodes to nothing on the friend's phone, and the second is worse than a long
 * string because it fails after the child has already sent it.
 *
 * It reuses `editor/io.ts` rather than serialising here. A second encoder would
 * be a second thing to keep in step with the schema, and the failure mode is a
 * room that exports from the lobby and refuses to import in the editor.
 */
/**
 * Who the second player is.
 *
 * A union rather than a boolean plus a difficulty, so "human" cannot carry a
 * difficulty and "ai" cannot be missing one — the absent-case that a pair of
 * loose fields invites.
 */
export type Opponent = { kind: 'human' } | { kind: 'ai'; difficulty: Difficulty }

export interface MatchSetup {
  effectiveEquipment: EffectiveEquipment
  eligibility: StandardEligibility
}

export function Lobby({
  content,
  bundle = content,
  source,
  presetId,
  names,
  onNamesChange,
  onImport,
  onStart,
  onBack,
  progression = emptyProgression(),
  onProgressionChange = () => {},
}: {
  content: ContentSet
  bundle?: ContentSet
  source: ContentSource
  presetId: string
  names: Record<Side, string>
  onNamesChange: (names: Record<Side, string>) => void
  onImport: (next: ContentSource) => void
  onStart: (opponent: Opponent, setup: MatchSetup) => void
  onBack: () => void
  progression?: ProgressionProfileV1
  onProgressionChange?: (next: ProgressionProfileV1) => void
}) {
  const t = useTranslate()
  const preset = content.presets.get(presetId)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [incoming, setIncoming] = useState('')
  // One channel for both outcomes of a paste. Two would mean an old success
  // message sitting under a new failure.
  const [importNote, setImportNote] = useState('')
  const [mode, setMode] = useState<'human' | 'ai'>('human')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')

  /**
   * Whether this room can be played against the computer at all (AC-011).
   *
   * Computed here rather than at start, so the answer is visible BEFORE the
   * choice — a mode that accepts the tap and then refuses is a worse version of
   * the same message.
   */
  const envelope = withinEnvelope(content, presetId)

  /**
   * Whether this room's loadout has been checked against its grades (ADR-011).
   *
   * The structural half of the duel-legal profile runs in `loadContentSet`, so a
   * room that reaches this screen already has no `win`, no `royal`, a declared
   * budget and a replaceable target. The half that needs MEASURED grades cannot
   * run in a synchronous validator — 600 self-play matches per record — so it
   * runs here, before the match starts, which is the last place it can.
   *
   * Computed before the choice for the same reason `envelope` is: a start button
   * that accepts the tap and then refuses is a worse version of the message.
   * A room with no loadout is trivially fine and is the common case.
   */
  /**
   * Whether this room's loadout is legal at the prices the picker showed.
   *
   * Computed before the choice for the same reason `envelope` is: a start button
   * that accepts the tap and then refuses is a worse version of the message. A
   * room with no loadout is trivially fine and is the common case.
   *
   * `load.ts` already refused everything decidable without a price — no `win`,
   * no `royal`, a declared budget, a replaceable target. This is the other half:
   * same-grade replacement and the budget sum.
   */
  /**
   * The mode that will actually be used, as opposed to the one last tapped.
   *
   * Disabling the radio is not enough: a player can choose the computer, then
   * import a room the envelope refuses — the import is on this screen — and
   * `mode` still reads `'ai'` while the control that set it has gone quiet.
   * Deriving the answer removes the stale state, so there is no path to miss.
   */
  const effectiveMode = envelope.ok ? mode : 'human'
  const humanSides: readonly Side[] = effectiveMode === 'ai' ? ['white'] : ['white', 'black']
  const resolvedEquipment = useMemo(
    () => resolveEquipment({ content, bundle, presetId, profile: progression, humanSides }),
    [bundle, content, humanSides, presetId, progression],
  )
  const eligibility = useMemo(
    () => standardEligibility({
      content,
      bundle,
      presetId,
      effectiveEquipment: resolvedEquipment.effectiveEquipment,
    }),
    [bundle, content, presetId, resolvedEquipment.effectiveEquipment],
  )

  const loadoutGate = useMemo(() => {
    if (!preset?.loadout?.white && !preset?.loadout?.black) return { ok: true as const }
    // Direct catalog placement is intentionally a playable sandbox case. Its
    // acquisition-specific explanation is clearer than the generic grade gate.
    if (!eligibility.eligible && eligibility.reasons.includes('curated-upgrade-requires-owned-equipment')) {
      return { ok: true as const }
    }
    const errors = checkLoadoutGrades(preset, content).filter((error) => {
      for (const side of ['white', 'black'] as const) {
        // A validated device piece replaces this side's authored piece axis for
        // the match. Its active-room ceiling and combined budget have already
        // been classified by `standardEligibility`; leaving the old authored
        // error here would block the match that the override made playable.
        if (resolvedEquipment.effectiveEquipment[side] && error.path.includes(`.loadout.${side}`)) return false
      }
      return true
    })
    return errors.length === 0 ? { ok: true as const } : { ok: false as const, reason: t('ui.lobby.loadout-refused') }
  }, [content, eligibility, preset, resolvedEquipment.effectiveEquipment, t])

  const share = () => {
    const text = exportContent(source)
    // Reporting success unconditionally is worse than not offering the button:
    // on an insecure context or an older mobile browser `clipboard` is
    // undefined, and a child taps it, reads the success label and shares nothing.
    const write = navigator.clipboard?.writeText(text)
    if (!write) return setCopyState('failed')
    write.then(
      () => setCopyState('copied'),
      () => setCopyState('failed'),
    )
  }

  const receive = () => {
    // An import REPLACES the document, so a child who taps this loses every room
    // they made. `window.confirm` is what this app already uses for its other
    // destructive moves — leaving a match, discarding a draft — and a third,
    // different-looking confirmation would teach them that some of them mean
    // less than others.
    if (!window.confirm(t('ui.lobby.share.warning'))) return
    const result = importContent(incoming)
    if (!result.ok) {
      // The child pasted something. Naming the first field at fault is more than
      // they can act on, so this says the one thing they can: it did not work,
      // check what you pasted. The editor's transfer panel is where the field
      // list lives, for whoever wants it.
      setImportNote(t('ui.lobby.share.rejected'))
      return
    }
    setImportNote(t('ui.lobby.share.accepted'))
    setIncoming('')
    onImport(result.source)
  }

  return (
    <section className="lobby" data-testid="lobby">
      <header className="screen-head">
        <button type="button" className="back" data-testid="lobby-back" aria-label={t('ui.action.back')} onClick={onBack}>
          ‹
        </button>
        <h2>{t('ui.lobby.title')}</h2>
      </header>

      <div className="screen-body">
        <div className="lobby-brand" aria-hidden="true">
          <ImageMark className="brand-mark" src={BRAND_ART.crest} />
        </div>
        <p className="hint">{t('ui.lobby.intro')}</p>

        <fieldset className="mode-picker" data-testid="mode-picker">
          <legend>{t('ui.lobby.mode')}</legend>
          {(['human', 'ai'] as const).map((option) => (
            <label key={option} className="mode-option">
              <input
                type="radio"
                name="opponent-mode"
                value={option}
                data-testid={`mode-${option}`}
                checked={effectiveMode === option}
                // The refusal disables the CHOICE, and the explanation below
                // says why. A disabled control with no reason is the version of
                // this that teaches a child their room is broken.
                disabled={option === 'ai' && !envelope.ok}
                onChange={() => setMode(option)}
              />
              <span>{t(`ui.lobby.mode.${option}`)}</span>
            </label>
          ))}
        </fieldset>

        {!envelope.ok && (
          <p className="hint" data-testid="ai-refused" data-reason={envelope.reason}>
            <strong>{t('ui.lobby.ai-refused.title')}</strong>{' '}
            {t(`ui.lobby.ai-refused.${envelope.reason}`)} {t('ui.lobby.ai-refused.hint')}
          </p>
        )}

        {effectiveMode === 'ai' && (
          <fieldset className="mode-picker" data-testid="difficulty-picker">
            <legend>{t('ui.lobby.difficulty')}</legend>
            {DIFFICULTIES.map((level) => (
              <label key={level} className="mode-option">
                <input
                  type="radio"
                  name="ai-difficulty"
                  value={level}
                  data-testid={`difficulty-${level}`}
                  checked={difficulty === level}
                  onChange={() => setDifficulty(level)}
                />
                <span>{t(`ui.lobby.difficulty.${level}`)}</span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="player-cards">
          <PlayerCard
            side="white"
            name={names.white}
            onChange={(value) => onNamesChange({ ...names, white: value })}
          />
          <span className="versus" aria-hidden="true">
            {t('ui.lobby.versus')}
          </span>
          <PlayerCard
            side="black"
            name={names.black}
            onChange={(value) => onNamesChange({ ...names, black: value })}
          />
        </div>

        {preset && (
          <div className="lobby-room" data-testid="lobby-room" data-room={presetId}>
            <MiniBoard content={content} boardId={preset.boardId} />
            <span className="lobby-room-meta">
              <span className="label">{t('ui.lobby.room')}</span>
              <strong>{recordLabel(t, 'preset', presetId, preset.nameKey)}</strong>
            </span>
            <button type="button" data-testid="lobby-change-room" onClick={onBack}>
              {t('ui.lobby.change-room')}
            </button>
          </div>
        )}

        <UpgradeEquipment
          content={content}
          bundle={bundle}
          presetId={presetId}
          profile={progression}
          humanSides={humanSides}
          onChange={onProgressionChange}
        />

        {!loadoutGate.ok && (
          <p className="refusal" data-testid="lobby-loadout-blocked" role="status">
            {loadoutGate.reason}
          </p>
        )}
        <button
          className="primary xl"
          data-testid="lobby-start"
          disabled={!loadoutGate.ok}
          onClick={() => onStart(
            effectiveMode === 'ai' ? { kind: 'ai', difficulty } : { kind: 'human' },
            { effectiveEquipment: resolvedEquipment.effectiveEquipment, eligibility },
          )}
        >
          {t('ui.lobby.start')}
        </button>

        <hr />

        <h3>{t('ui.lobby.share.title')}</h3>
        <p className="hint">{t('ui.lobby.share.hint')}</p>

        <div className="share-row">
          <button className="positive" data-testid="lobby-share" data-copy-state={copyState} onClick={share}>
            {t(
              copyState === 'copied'
                ? 'ui.lobby.share.copied'
                : copyState === 'failed'
                  ? 'ui.lobby.share.copy-failed'
                  : 'ui.lobby.share.copy',
            )}
          </button>
        </div>

        <p className="hint">{t('ui.lobby.share.warning')}</p>

        <div className="share-row">
          <label className="sr-only" htmlFor="lobby-receive">
            {t('ui.lobby.share.paste-label')}
          </label>
          <textarea
            id="lobby-receive"
            data-testid="lobby-receive"
            rows={3}
            placeholder={t('ui.lobby.share.paste-label')}
            value={incoming}
            onChange={(e) => {
              setIncoming(e.target.value)
              setImportNote('')
            }}
          />
          <button data-testid="lobby-receive-apply" disabled={incoming.trim() === ''} onClick={receive}>
            {t('ui.lobby.share.paste')}
          </button>
        </div>

        {/* `role="status"`, because both outcomes replace text in a node that was
            already there — a screen reader announces nothing for that otherwise,
            and "did my paste work" is the entire question this screen leaves a
            player with. */}
        {importNote && (
          <p className="share-note" data-testid="lobby-share-note" role="status">
            {importNote}
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * One player: their crest, and the name they answer to.
 *
 * The placeholder is the side's own name from the locale bundle, which is also
 * what every other screen falls back to when the field is left empty — so a
 * child who skips this sees the side's own word in the turn bar, so the placeholder was not
 * a promise the rest of the app broke.
 */
function PlayerCard({ side, name, onChange }: { side: Side; name: string; onChange: (value: string) => void }) {
  const t = useTranslate()
  const fallback = t(`ui.side.${side}`)
  const id = `player-${side}`
  return (
    <div className="player-card" data-side={side}>
      <span className="crest" aria-hidden="true">
        <ImageMark src={ART_ASSETS.piece['king'][side]} />
      </span>
      <span className="player-fields">
        <label className="player-role" htmlFor={id}>
          {t(`ui.lobby.role.${side}`)}
        </label>
        <input
          id={id}
          data-testid={`player-name-${side}`}
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder={fallback}
          // `enterKeyHint`, and the reason is the audience: this is a phone
          // keyboard, and the default 'go' on a bare input in a form-less screen
          // does nothing visible when pressed.
          enterKeyHint="done"
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </div>
  )
}
