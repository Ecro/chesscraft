// @vitest-environment jsdom
/**
 * AC-010 — a card starts from a filled-in template.
 *
 * Quantified over the WHOLE template set rather than a sampled one, using
 * `readRecipe`'s own rejection as the decider. A template the four-slot view
 * cannot open is exactly the failure this guards: it would drop the child into
 * the 45-control detailed form on their first card, which is the thing the
 * gallery exists to avoid.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { blankDraft, editorContext } from '@editor/draft'
import { CARD_TEMPLATES, applyTemplate, templatesFor } from '@editor/templates'
import { optionsFor, readRecipe } from '@ui/CardRecipe'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

const ctx = () => editorContext(bundledContentSource)

function mount(kind: 'ruleCard' | 'skillCard') {
  const committed: { value: ContentSource | null } = { value: null }
  render(
    React.createElement(Edit, {
      source: structuredClone(bundledContentSource),
      onCommit: (next: ContentSource) => {
        committed.value = next
      },
    }),
  )
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: kind } })
  return committed
}

describe('AC-010 — every template opens in the recipe view', () => {
  it('offers at least one template for each card kind', () => {
    // Guards the quantifications below against going vacuous on an empty set.
    expect(templatesFor('ruleCard').length).toBeGreaterThan(0)
    expect(templatesFor('skillCard').length).toBeGreaterThan(0)
  })

  it.each(CARD_TEMPLATES)('$stem produces a recipe with every slot filled', (tpl) => {
    const draft = applyTemplate(blankDraft(tpl.host), tpl, ctx())
    const recipe = readRecipe(draft)
    expect(recipe, `${tpl.stem} is a template the four-slot view refuses`).not.toBeNull()
    if (!recipe) return
    expect(recipe.when).toBe(tpl.when)
    expect(recipe.cond).toBe(tpl.cond)
    expect(recipe.then).toBe(tpl.then)
    expect(recipe.who).toBe(tpl.who)
  })

  it.each(CARD_TEMPLATES)('$stem is a well-formed effect on its own terms', (tpl) => {
    // Read STRUCTURALLY, not back through `readRecipe`. `applyTemplate` builds
    // with `writeRecipe`, so a round-trip through its partner is close to a
    // tautology: any kind that has a maker at all survives it. What that cannot
    // see is an effect shaped wrongly for the schema — two actions, a stray
    // `forEach`, a missing trigger.
    const draft = applyTemplate(blankDraft(tpl.host), tpl, ctx()) as {
      effects?: Array<{ trigger?: unknown; condition?: unknown; actions?: unknown[]; forEach?: unknown }>
    }
    const effects = draft.effects ?? []
    expect(effects).toHaveLength(1)
    const effect = effects[0]!
    expect(effect.trigger).toBe(tpl.when)
    expect(effect.forEach).toBeUndefined()
    expect(effect.actions).toHaveLength(1)
    expect((effect.condition as { kind?: unknown }).kind).toBe(tpl.cond)
    expect((effect.actions![0] as { kind?: unknown }).kind).toBe(tpl.then)
    if (tpl.who === '') expect('target' in (effect.actions![0] as object)).toBe(false)
    else expect(((effect.actions![0] as { target?: { kind?: unknown } }).target ?? {}).kind).toBe(tpl.who)
  })

  it.each(CARD_TEMPLATES)('$stem only uses values its slots actually offer', (tpl) => {
    // A template naming a value the slot does not list would render as a select
    // with no matching option — present, and unusable.
    for (const [slot, value] of [
      ['when', tpl.when],
      ['cond', tpl.cond],
      ['then', tpl.then],
    ] as const) {
      expect(optionsFor(slot, tpl.host), `${tpl.stem}.${slot}`).toContain(value)
    }
    if (tpl.who !== '') expect(optionsFor('who', tpl.host)).toContain(tpl.who)
  })

  it.each(['ruleCard', 'skillCard'] as const)('the %s gallery hands the form a filled recipe', (kind) => {
    mount(kind)
    const first = templatesFor(kind)[0]
    if (!first) throw new Error(`no templates for ${kind}`)

    expect(screen.getByTestId('gallery-templates')).toBeTruthy()
    fireEvent.click(screen.getByTestId(`gallery-template-${first.stem}`))

    // The four-slot view opened rather than the refusal note.
    expect(screen.queryByTestId('editor-recipe-complex')).toBeNull()
    expect(screen.getByTestId('editor-recipe')).toBeTruthy()

    const draft = JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')
    const recipe = readRecipe(draft)
    expect(recipe).not.toBeNull()
    expect(recipe?.then).toBe(first.then)
    // Not blank: the whole point is that the card already says something.
    expect(Array.isArray(draft.effects) && draft.effects.length).toBe(1)
  })

  it('a templated card saves and re-opens as the same card', () => {
    const committed = mount('skillCard')
    const first = templatesFor('skillCard')[0]!
    fireEvent.click(screen.getByTestId(`gallery-template-${first.stem}`))
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '내 카드' } })
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: '상대 기물 하나를 없앤다.' } })

    const authored = JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')?.textContent ?? '', 'the templated card was rejected').toBe('')
    expect(committed.value).not.toBeNull()

    const saved = (committed.value!.skillCards as Array<{ id?: unknown }>).find((c) => c.id === authored.id)
    expect(saved).toBeTruthy()
    expect(readRecipe(saved as Record<string, unknown>)).toEqual(readRecipe(authored))
  })
})
