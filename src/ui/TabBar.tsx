import { PIXEL_SPRITES } from './art/pixels'
import { Pix } from './art/Pix'
import { useTranslate } from './i18n'

/**
 * The three places this app can be, at the bottom of the screen.
 *
 * It replaces two lowercase text buttons in a top nav. The change is not
 * cosmetic: the third destination — the reference screen — used to be reachable
 * only from a button on the home screen, so a child who had gone into the editor
 * had to come back out to look a piece up. Everything reachable is reachable
 * from everywhere, which is the one thing a tab bar is actually for.
 *
 * A sprite AND a word on every tab. The icon alone would be a guess for a
 * seven-year-old and the word alone would be a wall of Korean at 11px; together
 * they are what every phone game this audience already plays looks like.
 */
const TABS = [
  // `testid` is not `id`. The route is `home` and the tab has always been called
  // `tab-play` — the e2e suite drives it by that name, and renaming a selector
  // to match an internal route is churn a spec has to absorb for nothing.
  { id: 'home', testid: 'tab-play', sprite: PIXEL_SPRITES['nav-play'], labelKey: 'ui.tab.play' },
  { id: 'edit', testid: 'tab-edit', sprite: PIXEL_SPRITES['nav-build'], labelKey: 'ui.tab.edit' },
  { id: 'dex', testid: 'tab-dex', sprite: PIXEL_SPRITES['nav-dex'], labelKey: 'ui.tab.dex' },
] as const

export type TabId = (typeof TABS)[number]['id']

export function TabBar({ active, onNavigate }: { active: TabId; onNavigate: (id: TabId) => void }) {
  const t = useTranslate()
  return (
    // `<nav>` with a label, because a document with one landmark nav does not
    // need naming and this app now has the notice stack above it — an unlabelled
    // second landmark is what makes a screen reader's landmark list useless.
    <nav className="tabbar" aria-label={t('ui.tab.label')}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tab"
          data-testid={tab.testid}
          data-selected={tab.id === active}
          // The visible label is right there, so this is about STATE, not name:
          // without it the only thing marking the current tab is a colour and a
          // 4px top edge, neither of which reaches assistive tech.
          aria-current={tab.id === active ? 'page' : undefined}
          onClick={() => onNavigate(tab.id)}
        >
          <span className="tab-icon">
            <Pix sprite={tab.sprite} />
          </span>
          <span className="tab-label">{t(tab.labelKey)}</span>
        </button>
      ))}
    </nav>
  )
}
