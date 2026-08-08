import type { ContentSource } from '@content/load'
import { type DraftKind, type EditorContext, blankDraft, editorContext, openDraft } from '@editor/draft'
import { deriveKey, readString } from '@editor/strings'
import { applyTemplate, templatesFor } from '@editor/templates'
import { DEFAULT_LOCALE, type Translate } from './i18n'

/**
 * What a new record starts from.
 *
 * A blank form asks the hardest question first — "what do you want?" — with
 * nothing on screen to react to. The documented cure is the same everywhere it
 * has been tried: open on something that already works and let the author change
 * it. So a new piece opens on the pieces the document already has, a new card
 * opens on filled-in templates, and "start from nothing" is one option among
 * them rather than the only door.
 *
 * A remix produces a NEW record. The source is read and never written — not even
 * its text: the copy gets its own derived `nameKey`/`textKey` and the source's
 * words are pre-filled into the form's own inputs, so saving the copy under a
 * new name cannot rename the original. Sharing the source's key would have been
 * one line shorter and would have made "rename my copy" silently rename the
 * piece it came from, everywhere it is used.
 */

export interface Picked {
  draft: Record<string, unknown>
  /** Pre-filled into the name input, and marked as typed so a save writes it. */
  name: string
  text: string
}

/** A free id of the form `<kind>.<stem>`, `-2`, `-3`, … until one is unused. */
export function freshId(source: ContentSource, kind: DraftKind, stem: string): string {
  const taken = new Set(
    (source[COLLECTION[kind]] as unknown[]).flatMap((r) => {
      const id = (r as { id?: unknown }).id
      return typeof id === 'string' ? [id] : []
    }),
  )
  const base = `${PREFIX[kind]}.${stem}`
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

const PREFIX: Record<DraftKind, string> = {
  piece: 'piece',
  squareType: 'square',
  ruleCard: 'rule',
  skillCard: 'skill',
  board: 'board',
  preset: 'preset',
}

const COLLECTION: Record<DraftKind, keyof ContentSource> = {
  piece: 'pieces',
  squareType: 'squareTypes',
  ruleCard: 'ruleCards',
  skillCard: 'skillCards',
  board: 'boards',
  preset: 'presets',
}

/**
 * The stem of an id — everything after the dot — so a copy reads as one.
 *
 * No worked example here on purpose: `tests/structure/no-content-in-engine.test.ts`
 * scans this file for content ids and does not care whether one is in a comment,
 * which is the right call. A UI file that knows a record's name is one edit away
 * from switching on it (ADR-011).
 */
function stemOf(id: string): string {
  const dot = id.indexOf('.')
  return dot < 0 ? id : id.slice(dot + 1)
}

function textFor(source: ContentSource, record: Record<string, unknown> | null, slot: 'nameKey' | 'textKey'): string {
  const key = String(record?.[slot] ?? '')
  if (key === '') return ''
  return readString(source.strings, DEFAULT_LOCALE, key) ?? ''
}

/** A copy of `id`, carrying its own keys rather than borrowing the source's. */
export function remixOf(source: ContentSource, kind: DraftKind, id: string): Picked | null {
  const record = openDraft(source, kind, id)
  if (!record) return null
  const name = textFor(source, record, 'nameKey')
  const text = textFor(source, record, 'textKey')

  const draft = structuredClone(record)
  draft.id = freshId(source, kind, stemOf(id))
  draft.nameKey = deriveKey(String(draft.id), 'name')
  if ('textKey' in draft) draft.textKey = deriveKey(String(draft.id), 'text')
  return { draft, name, text }
}

function blankPick(source: ContentSource, kind: DraftKind): Picked {
  return { draft: { ...blankDraft(kind), id: freshId(source, kind, 'new') }, name: '', text: '' }
}

function templatePicks(source: ContentSource, kind: DraftKind, ctx: EditorContext) {
  return templatesFor(kind).map((tpl) => ({
    key: tpl.stem,
    labelKey: tpl.labelKey,
    pick: (): Picked => ({
      draft: { ...applyTemplate(blankDraft(kind), tpl, ctx), id: freshId(source, kind, tpl.stem) },
      name: '',
      text: '',
    }),
  }))
}

export interface MakerGalleryProps {
  source: ContentSource
  kind: DraftKind
  t: Translate
  onPick: (picked: Picked) => void
}

export function MakerGallery({ source, kind, t, onPick }: MakerGalleryProps) {
  const ctx = editorContext(source)
  const templates = templatePicks(source, kind, ctx)

  const existing = (source[COLLECTION[kind]] as unknown[]).flatMap((r) => {
    const id = (r as { id?: unknown }).id
    return typeof id === 'string' && id !== '' ? [id] : []
  })

  return (
    <section className="maker-gallery" data-testid="maker-gallery">
      <h3>{t('ui.editor.gallery.title')}</h3>
      <p className="hint">{t('ui.editor.gallery.hint')}</p>

      {templates.length > 0 && (
        <div className="gallery-row" data-testid="gallery-templates">
          {templates.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              data-testid={`gallery-template-${tpl.key}`}
              onClick={() => onPick(tpl.pick())}
            >
              {t(tpl.labelKey)}
            </button>
          ))}
        </div>
      )}

      {existing.length > 0 && (
        <div className="gallery-row" data-testid="gallery-existing">
          {existing.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`gallery-remix-${id}`}
              onClick={() => {
                const picked = remixOf(source, kind, id)
                if (picked) onPick(picked)
              }}
            >
              {textFor(source, openDraft(source, kind, id), 'nameKey') || id}
            </button>
          ))}
        </div>
      )}

      {/* Last, and present. "Start from nothing" is a real answer — it is just
          not the one a child should have to give before they have seen
          anything. */}
      <button type="button" data-testid="gallery-blank" onClick={() => onPick(blankPick(source, kind))}>
        {t('ui.editor.gallery.blank')}
      </button>
    </section>
  )
}
