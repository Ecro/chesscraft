// @vitest-environment jsdom
import { fireEvent, render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { EditorLibrary } from '../../src/ui/EditorLibrary'
import { EditorRooms } from '../../src/ui/EditorRooms'
import { MakerGallery } from '../../src/ui/MakerGallery'
import { RecordForm } from '../../src/ui/RecordForm'
import { RoomDetail } from '../../src/ui/RoomDetail'
import { makeTranslate } from '../../src/ui/i18n'

/**
 * PLAN-content-provenance-and-room-delete Phase 2 / ADR-002 — no content id
 * ever reaches the screen.
 *
 * The audience is a Korean-speaking child; `piece.king` is developer output.
 *
 * **This test is scoped to FIVE surfaces on purpose, and the picker mounts are
 * the reason it exists.** The first version of the plan guarded `recordLabel`
 * with a required `kind` argument and tested the two browse lists — and
 * `src/ui/RecordForm.tsx` turned out to carry its own private `label()` with
 * the same raw-id fallback, never importing `recordLabel` at all, backing the
 * room composition picker. A compiler guard cannot see a duplicate that never
 * calls the guarded function, and a test scoped to the lists would have passed
 * against that exact defect. So the assertion is made where the pixels are, on
 * every surface that renders a record's name.
 *
 * `src/ui/MakerGallery.tsx` is the third: it resolved names through
 * `source.strings` alone, which bundled records do not use (their text lives in
 * `src/i18n/ko.ts`), so every shipped record in the gallery rendered as its id.
 */

/** An id as the schema writes them — `<kind>.<slug>` (src/content/schema.ts). */
const CONTENT_ID = /\b[a-z]+\.[a-z0-9-]+\b/g

/**
 * Every content id the document mentions — records AND references to records
 * that are gone.
 *
 * The assertion hunts for THESE strings rather than for anything id-shaped, and
 * the difference is what makes it usable. Three legitimate id-shaped strings
 * exist on these screens and none of them is a leak:
 *
 * - `ui.editor.field.id-hint` reads 「…예: piece.rabbit」. The id is the SUBJECT
 *   there — it is help text for the id input — and `piece.rabbit` is in no
 *   document, so it is not matched.
 * - `art.king` and friends are `artId`s, which `src/content/schema.ts:149`
 *   defines as "exactly one segment, never a content id". They reach a screen
 *   reader through `aria-label` on the sprite picker; see the PLAN's Phase 2
 *   notes for why that is recorded rather than fixed here.
 * - `editor-draft-json` is a `hidden` `<pre>` test affordance, excluded below.
 *
 * Hunting for the document's OWN ids is also strictly stronger on the real
 * cases: it catches an id embedded in a longer sentence, which is exactly the
 * shape of the two renders this phase removes (`${id} (지워진 것)`).
 */
function mentionedIds(source: ContentSource): string[] {
  const found = new Set<string>()
  for (const match of JSON.stringify(source).matchAll(CONTENT_ID)) {
    // `ui.*` and `art.*` are key namespaces, not record ids.
    if (!match[0].startsWith('ui.') && !match[0].startsWith('art.')) found.add(match[0])
  }
  return [...found]
}

/**
 * Every string a person can read under `root`.
 *
 * Text nodes AND the attributes that reach a reader — an `aria-label` is spoken
 * by a screen reader and a `title` is shown on hover, so a leak there is a leak.
 * `data-testid` is deliberately NOT in the list: it carries ids by design and is
 * invisible to everyone but the test suite.
 */
const READABLE_ATTRS = ['aria-label', 'title', 'alt', 'placeholder', 'aria-description']

/** Is this node inside a subtree the browser does not show? */
function isHidden(node: Node): boolean {
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node.parentElement ?? null)
  while (el !== null) {
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true
    el = el.parentElement
  }
  return false
}

function texts(root: HTMLElement): string[] {
  const out: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node !== null) {
    const value = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
    // `hidden` is what the browser hides and what Playwright refuses to click —
    // the editor shell relies on exactly that to keep the inactive panel mounted
    // and unreachable. A `hidden` test affordance is not something a child reads.
    if (value !== '' && !isHidden(node)) out.push(value)
    node = walker.nextNode()
  }
  for (const el of root.querySelectorAll('*')) {
    if (isHidden(el)) continue
    for (const attr of READABLE_ATTRS) {
      const value = el.getAttribute(attr)
      if (value !== null && value.trim() !== '') out.push(value.trim())
    }
  }
  return out
}

function expectNoRawIds(root: HTMLElement, where: string, source: ContentSource) {
  const ids = mentionedIds(source)
  expect(ids.length, `${where}: the fixture mentions no ids, so this asserts nothing`).toBeGreaterThan(0)
  const leaked = texts(root).filter((text) => ids.some((id) => text.includes(id)))
  expect(leaked, `${where} rendered a raw content id`).toEqual([])
}

/**
 * A document whose records have NO resolvable name — the state that drives the
 * fallback.
 *
 * Empty `nameKey` rather than a missing one: both reach the fallback, and an
 * empty string is what the editor writes for a record the author has not named.
 */
function namelessSource(): ContentSource {
  return {
    schemaVersion: 10,
    pieces: [
      { id: 'piece.alpha', nameKey: '', movement: [{ kind: 'step', vectors: [[0, 1]] }] },
      { id: 'piece.beta', nameKey: '', movement: [{ kind: 'step', vectors: [[0, 1]] }] },
    ],
    squareTypes: [],
    ruleCards: [{ id: 'rule.alpha', nameKey: '', textKey: '', effects: [] }],
    skillCards: [{ id: 'skill.alpha', nameKey: '', textKey: '', effects: [], uses: 1 }],
    boards: [
      {
        id: 'board.alpha',
        nameKey: '',
        width: 4,
        height: 4,
        placements: [
          { square: 'a1', pieceId: 'piece.alpha', side: 'white' },
          { square: 'd4', pieceId: 'piece.beta', side: 'black' },
        ],
        squares: [],
      },
    ],
    presets: [
      {
        id: 'preset.alpha',
        nameKey: '',
        boardId: 'board.alpha',
        pieceIds: ['piece.alpha', 'piece.beta'],
        ruleCardIds: ['rule.alpha'],
        skillCardIds: ['skill.alpha'],
      },
      {
        id: 'preset.beta',
        nameKey: '',
        boardId: 'board.alpha',
        pieceIds: ['piece.alpha', 'piece.beta'],
        ruleCardIds: [],
        skillCardIds: [],
      },
    ],
  }
}

/** The same document, with a reference to a record that no longer exists. */
function danglingSource(): ContentSource {
  const source = namelessSource()
  ;(source.presets[0] as { pieceIds: string[] }).pieceIds.push('piece.deleted')
  ;(source.presets[0] as { skillCardIds: string[] }).skillCardIds.push('skill.deleted')
  return source
}

const noop = () => {}
/** Phase 4 props. Nothing hidden and nothing official: this file is about labels. */
/** An empty bundle: nothing is official, so nothing hides and nothing forks. */
const emptyBundle: ContentSource = {
  schemaVersion: 10,
  pieces: [],
  squareTypes: [],
  ruleCards: [],
  skillCards: [],
  boards: [],
  presets: [],
}
const noHiding = {
  hidden: new Set<string>() as ReadonlySet<string>,
  official: new Set<string>() as ReadonlySet<string>,
  bundle: emptyBundle,
  onHide: () => ({ ok: true }) as { ok: true },
}

describe('ADR-002 — no raw content id reaches the screen', () => {
  it('room list (EditorRooms)', () => {
    const source = namelessSource()
    const { container } = render(<EditorRooms source={source} commit={noop} onCreateRecord={noop} {...noHiding} />)
    expectNoRawIds(container, 'EditorRooms', source)
  })

  it('library list (EditorLibrary)', () => {
    const source = namelessSource()
    const { container } = render(
      <EditorLibrary
        source={source}
        open={{ kind: 'piece', id: null, seq: 0 }}
        onOpen={() => true}
        onDirtyChange={noop}
        commit={noop}
        errors={[]}
        setErrors={noop}
        {...noHiding}
      />,
    )
    expectNoRawIds(container, 'EditorLibrary', source)
  })

  it('room builder, default step (RoomDetail)', () => {
    const source = danglingSource()
    const { container } = render(
      <RoomDetail
        source={source}
        roomId="preset.alpha"
        commit={noop}
        onBack={noop}
        onCreateRecord={noop}
      />,
    )
    expectNoRawIds(container, 'RoomDetail step=board', source)
  })

  /**
   * The two steps below are separate `it`s, and the click is not optional.
   *
   * `RoomDetail` mounts on `step='board'` (`:153`), and the two renders this
   * phase exists to fix live behind other steps: `VanishedRows` (`:941`) inside
   * `step === 'pieces'`, and the `ChipList` tail (`:999`) inside
   * `step === 'cards'`. A mount that never clicks asserts against neither, goes
   * green the moment the room's own header name resolves, and leaves both lines
   * shipping `${id} (지워진 것)` — which is what the first draft of this file did.
   * One `it` per step so a failure names the line it guards.
   */
  it('room builder, pieces step — a piece that is gone (RoomDetail VanishedRows)', () => {
    const source = danglingSource()
    const { container } = render(
      <RoomDetail
        source={source}
        roomId="preset.alpha"
        commit={noop}
        onBack={noop}
        onCreateRecord={noop}
      />,
    )
    fireEvent.click(within(container).getByTestId('room-step-pieces'))
    // The premise, asserted rather than assumed: the vanished row IS on screen.
    // Without this the no-raw-id check would pass on an empty step.
    expect(container.querySelector('.tile.vanished')).not.toBeNull()
    expectNoRawIds(container, 'RoomDetail step=pieces', source)
  })

  it('room builder, cards step — a card that is gone (RoomDetail ChipList tail)', () => {
    const source = danglingSource()
    const { container } = render(
      <RoomDetail
        source={source}
        roomId="preset.alpha"
        commit={noop}
        onBack={noop}
        onCreateRecord={noop}
      />,
    )
    fireEvent.click(within(container).getByTestId('room-step-cards'))
    expect(container.querySelector('.chip.vanished')).not.toBeNull()
    expectNoRawIds(container, 'RoomDetail step=cards', source)
  })

  it('room composition picker (RecordForm, kind=preset)', () => {
    const source = namelessSource()
    const { container } = render(
      <RecordForm
        source={source}
        kind="preset"
        initialId="preset.alpha"
        commit={noop}
        errors={[]}
        setErrors={noop}
      />,
    )
    expectNoRawIds(container, 'RecordForm preset picker', source)
  })

  it('remix gallery (MakerGallery)', () => {
    const source = namelessSource()
    const { container } = render(
      <MakerGallery source={source} kind="piece" t={makeTranslate()} onPick={noop} />,
    )
    expectNoRawIds(container, 'MakerGallery', source)
  })

  it('the SHIPPED document, unmodified — the case the product actually ships', () => {
    // Not a fixture. A fixture that gives every record a name deletes the case
    // the product ships, and a fixture that gives none of them one deletes the
    // case where a name exists but the surface fails to resolve it — which is
    // exactly what MakerGallery did for every bundled record, because it read
    // `source.strings` and bundled names live in `src/i18n/ko.ts`.
    const shipped = structuredClone(bundledContentSource)
    const gallery = render(
      <MakerGallery source={shipped} kind="piece" t={makeTranslate()} onPick={noop} />,
    )
    expectNoRawIds(gallery.container, 'MakerGallery on the shipped bundle', shipped)

    const rooms = render(<EditorRooms source={shipped} commit={noop} onCreateRecord={noop} {...noHiding} />)
    expectNoRawIds(rooms.container, 'EditorRooms on the shipped bundle', shipped)
  })
})

describe('the fallback names records by kind', () => {
  it('numbers unnamed siblings apart on the PICKER surfaces too, not only the lists', () => {
    /*
     * `recordLabel.ts` says every surface rendering more than one record goes
     * through `recordLabels`, which is what supplies the ordinal. Eleven picker
     * and grid sites did not, so two unnamed pieces both read as the same three
     * words in the room composition picker and in every grid on the room
     * builder — the label was unique on the two screens this file already
     * checked and duplicated everywhere else. Found by review; this is the
     * assertion that keeps it fixed.
     */
    const source = namelessSource()
    const form = render(
      <RecordForm
        source={source}
        kind="preset"
        initialId="preset.alpha"
        commit={noop}
        errors={[]}
        setErrors={noop}
      />,
    )
    const pickerLabels = texts(form.container).filter((text) => text.includes('이름 없는 기물'))
    expect(pickerLabels.length, 'the picker lists two unnamed pieces').toBeGreaterThanOrEqual(2)
    expect(new Set(pickerLabels).size, 'and they are tellable apart').toBe(pickerLabels.length)

    const room = render(
      <RoomDetail
        source={source}
        roomId="preset.alpha"
        commit={noop}
        onBack={noop}
        onCreateRecord={noop}
      />,
    )
    fireEvent.click(within(room.container).getByTestId('room-step-pieces'))
    const gridLabels = texts(room.container).filter((text) => text.includes('이름 없는 기물'))
    expect(gridLabels.length, 'the piece grid lists two unnamed pieces').toBeGreaterThanOrEqual(2)
    expect(new Set(gridLabels).size, 'and they are tellable apart').toBe(gridLabels.length)
  })

  it('handles a record with NO nameKey field at all, not only an empty one', () => {
    // The absent case, which the fixture above does not reach — it writes
    // `nameKey: ''`, the state the editor produces. A document that never had
    // the field (an older export, a hand-written set) is the one that predates
    // the feature, and `absent-case = feature black hole` is this repo's
    // most-recurring recorded failure (count:8).
    const source = namelessSource()
    for (const preset of source.presets) delete (preset as Record<string, unknown>)['nameKey']
    const { container } = render(<EditorRooms source={source} commit={noop} onCreateRecord={noop} {...noHiding} />)
    expectNoRawIds(container, 'EditorRooms with no nameKey field', source)
    const labels = texts(container).filter((text) => text.includes('이름 없는'))
    expect(labels.length).toBeGreaterThanOrEqual(2)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('names an unnamed record in Korean, by its kind', () => {
    const { container } = render(
      <EditorRooms source={namelessSource()} commit={noop} onCreateRecord={noop} {...noHiding} />,
    )
    // Two unnamed rooms. Both must be named, and they must be TELLABLE APART —
    // a list of identical labels is a different defect from a list of ids, not
    // a fix for it.
    const labels = texts(container).filter((text) => text.includes('이름 없는'))
    expect(labels.length).toBeGreaterThanOrEqual(2)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
