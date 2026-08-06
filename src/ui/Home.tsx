import type { ContentSet } from '@content/load'
import { translate } from './i18n'

/**
 * The screen the app opens on (PLAN Phase 2, RESEARCH #4).
 *
 * Before this the app booted straight into a live board under a bare `<h1>` and
 * two lowercase tab buttons, so a first visitor's opening move was a chess
 * position with no statement of what the app is or how to leave it.
 *
 * The preset picker lives here rather than above the board because choosing
 * what to play is a before-the-match decision — changing it mid-match restarts
 * the match anyway, which was never communicated when the control sat next to
 * the pieces.
 */
export function Home({
  content,
  presetId,
  onPresetChange,
  onStart,
}: {
  content: ContentSet
  presetId: string
  onPresetChange: (id: string) => void
  onStart: () => void
}) {
  const presets = [...content.presets.entries()]

  return (
    <section className="home" data-testid="home">
      <p className="tagline">{translate('ui.home.tagline')}</p>

      <label>
        {translate('ui.preset.label')}
        <select data-testid="preset-select" value={presetId} onChange={(e) => onPresetChange(e.target.value)}>
          {presets.map(([id, preset]) => (
            // #17 — the id is the value the tests and storage use; the label is
            // the name the content already carries and the player can read.
            <option key={id} value={id}>
              {translate(preset.nameKey)}
            </option>
          ))}
        </select>
      </label>

      <button className="primary" data-testid="start-match" onClick={onStart}>
        {translate('ui.action.start-match')}
      </button>
    </section>
  )
}
