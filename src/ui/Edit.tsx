import { useState } from 'react'
import type { ContentSource, ValidationError } from '@content/load'
import { type DraftKind, EDITABLE_KINDS, blankDraft, commitDraft } from '@editor/draft'

/**
 * The editor's first pass (PLAN Phase 3), over the four kinds the slice uses.
 *
 * The scalar fields get real inputs; the structured ones (movement patterns,
 * effect lists) are edited as JSON here, because the visual grid and effect
 * builders are Phase 5's job and faking them now would set a shape Phase 5 has
 * to undo. What matters at this phase is that the save path is the real
 * validator and that a rejected save shows the offending field.
 */
export function Edit({ source, onCommit }: { source: ContentSource; onCommit: (next: ContentSource) => void }) {
  const [kind, setKind] = useState<DraftKind>('piece')
  const [id, setId] = useState('')
  const [nameKey, setNameKey] = useState('')
  const [textKey, setTextKey] = useState('')
  const [fields, setFields] = useState(() => structuredFieldsJson('piece'))
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [saved, setSaved] = useState<string | null>(null)

  const changeKind = (next: DraftKind) => {
    setKind(next)
    setFields(structuredFieldsJson(next))
    setErrors([])
    setSaved(null)
  }

  const save = () => {
    setSaved(null)
    let structured: Record<string, unknown>
    try {
      structured = JSON.parse(fields) as Record<string, unknown>
    } catch (e) {
      setErrors([{ contentId: id || '(new)', path: 'fields', message: `not valid JSON: ${String(e)}` }])
      return
    }

    const result = commitDraft(source, kind, { ...structured, id, nameKey, textKey })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors([])
    setSaved(id)
    onCommit(result.source)
  }

  return (
    <section>
      <label>
        kind
        <select data-testid="editor-kind" value={kind} onChange={(e) => changeKind(e.target.value as DraftKind)}>
          {EDITABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      <label>
        id
        <input data-testid="editor-id" value={id} onChange={(e) => setId(e.target.value)} />
      </label>
      <label>
        nameKey
        <input data-testid="editor-nameKey" value={nameKey} onChange={(e) => setNameKey(e.target.value)} />
      </label>
      <label>
        textKey
        <input data-testid="editor-textKey" value={textKey} onChange={(e) => setTextKey(e.target.value)} />
      </label>
      <label>
        fields
        <textarea data-testid="editor-fields" value={fields} onChange={(e) => setFields(e.target.value)} rows={8} />
      </label>

      <button data-testid="editor-save" onClick={save}>
        save
      </button>

      {saved && <p data-testid="editor-saved">{saved}</p>}

      {errors.length > 0 && (
        <ul data-testid="editor-errors">
          {errors.map((e, i) => (
            <li key={`${e.path}-${i}`}>
              {e.path} — {e.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The kind's non-text fields, as the JSON the textarea starts from. */
function structuredFieldsJson(kind: DraftKind): string {
  const { id: _id, nameKey: _nameKey, textKey: _textKey, ...rest } = blankDraft(kind)
  return JSON.stringify(rest, null, 2)
}
