import type { ContentSet } from '@content/load'
import { MiniBoard, paintedCount } from './MiniBoard'
import { useTranslate } from './i18n'
import { recordLabel } from './recordLabel'

/**
 * The title screen (Chess Craft redesign).
 *
 * What changed from the Phase 2 home screen is the room picker, and the reason
 * is worth stating plainly: it was a `<select>`. A dropdown is the correct
 * control for choosing between options a user already understands, and a room is
 * the opposite of that — it is a thing a child MADE, whose whole identity is the
 * board they painted. Collapsed into a line of text in a native picker, every
 * room they build looks exactly like every room they did not.
 *
 * So the picker is a carousel of one room at a time, with the board drawn. It
 * costs a tap to reach the fourth room where the dropdown cost none, and that is
 * the trade: rooms are few (a child has three, not thirty), and the thing being
 * chosen is now visible.
 *
 * **`preset-select` is gone and nothing hides in its place.** The e2e suite drove
 * it directly; it now drives `room-next` / `room-prev`, which is what a player
 * does. A hidden `<select>` kept for the tests would be a control the suite
 * exercises and no human can reach, which is worse than an updated spec.
 */
export function Home({
  content,
  presetId,
  onPresetChange,
  onPlay,
  onEditRoom,
  onNewRoom,
}: {
  content: ContentSet
  presetId: string
  onPresetChange: (id: string) => void
  onPlay: () => void
  /** Open the room on the card. */
  onEditRoom: (roomId: string) => void
  /** Start a brand new one. A separate callback rather than a flag, because the
   *  two buttons sit side by side and "edit" and "create" landing on the same
   *  screen with different intents is exactly the pair that gets confused. */
  onNewRoom: () => void
}) {
  const t = useTranslate()
  const presets = [...content.presets.entries()]
  // Clamped rather than assumed: `App` already falls back when the active preset
  // was deleted, and reading -1 here would index past the end of the list.
  const index = Math.max(
    0,
    presets.findIndex(([id]) => id === presetId),
  )
  const entry = presets[index]

  // A document with no preset at all cannot be played, and the editor is the
  // only thing that can fix it — so that is the only thing this screen offers.
  if (!entry) {
    return (
      <section className="home" data-testid="home">
        <Wordmark />
        <p className="home-empty" data-testid="home-no-rooms">
          {t('ui.home.no-rooms')}
        </p>
        <button className="primary" data-testid="room-new" onClick={onNewRoom}>
          {t('ui.home.new-room')}
        </button>
      </section>
    )
  }

  const [id, preset] = entry
  const step = (delta: number) => {
    const next = presets[(index + delta + presets.length) % presets.length]
    if (next) onPresetChange(next[0])
  }

  return (
    <section className="home" data-testid="home">
      <Wordmark />

      <div className="room-carousel">
        <button
          type="button"
          className="carousel-arrow"
          data-testid="room-prev"
          // The visible label is a chevron, which names nothing. Disabled rather
          // than hidden when there is one room: a control that appears and
          // disappears as rooms are made is harder to learn than one that is
          // simply inert.
          aria-label={t('ui.home.prev-room')}
          disabled={presets.length < 2}
          onClick={() => step(-1)}
        >
          ‹
        </button>

        {/* `aria-live`, because the two arrows do not move and everything that
            changes is inside this card. */}
        <div className="room-card" data-testid="room-card" data-room={id} role="group" aria-live="polite">
          <MiniBoard content={content} boardId={preset.boardId} />
          <div className="room-meta">
            <strong className="room-name">{recordLabel(t, id, preset.nameKey)}</strong>
            <span className="room-tags">
              <span className="tag">
                {t('ui.home.tag.pieces')} {preset.pieceIds.length}
              </span>
              <span className="tag">
                {t('ui.home.tag.cards')} {preset.ruleCardIds.length + preset.skillCardIds.length}
              </span>
              <span className="tag">
                {t('ui.home.tag.painted')} {paintedCount(content, preset.boardId)}
              </span>
            </span>
          </div>
        </div>

        <button
          type="button"
          className="carousel-arrow"
          data-testid="room-next"
          aria-label={t('ui.home.next-room')}
          disabled={presets.length < 2}
          onClick={() => step(1)}
        >
          ›
        </button>
      </div>

      {/* Which of several, and where in the run. Dots alone would say the first
          without saying the second, so the count is in the label. */}
      <ol className="room-dots" aria-label={`${index + 1} / ${presets.length}`}>
        {presets.map(([dotId], i) => (
          <li key={dotId} data-on={i === index} />
        ))}
      </ol>

      <button className="primary xl" data-testid="start-match" onClick={onPlay}>
        {t('ui.action.start-match')}
      </button>

      <div className="home-secondary">
        <button data-testid="room-edit" onClick={() => onEditRoom(id)}>
          {t('ui.home.edit-room')}
        </button>
        <button className="positive" data-testid="room-new" onClick={onNewRoom}>
          {t('ui.home.new-room')}
        </button>
      </div>
    </section>
  )
}

/**
 * The app's name, drawn rather than headed.
 *
 * Not an `<h1>` — `App` already renders one, visually hidden, and a screen
 * reader given both would announce the app's name twice and offer two headings
 * for one thing. This is the picture of the name; the heading is the name.
 */
function Wordmark() {
  const t = useTranslate()
  return (
    <div className="wordmark" aria-hidden="true">
      <span className="wordmark-text">{t('ui.app.wordmark')}</span>
      <span className="wordmark-tagline">{t('ui.home.tagline')}</span>
    </div>
  )
}
