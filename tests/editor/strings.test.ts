import { describe, expect, it } from 'vitest'
import { deriveKey, readString, rekeyStrings, writeString } from '@editor/strings'

/**
 * PLAN Phase 8, ADR-020 — the editor derives the key; the child types the text.
 *
 * The derivation is deliberately not a new naming scheme. Content ids are
 * already `<kind>.<slug>` and the shipped bundle already keys its text
 * `piece.king.name` / `piece.king.text` / `piece.king.icon`, so deriving
 * `${id}.${field}` means an authored record and a bundled one are indexed the
 * same way — and a bundled record's text can later be overridden by an overlay
 * entry rather than living in a parallel namespace.
 *
 * Every function here is pure. The editor's undo story is "hold the previous
 * source", which only works while nothing edits an overlay in place.
 */

describe('key derivation', () => {
  it('derives the three text keys from a record id', () => {
    expect(deriveKey('piece.rabbit', 'name')).toBe('piece.rabbit.name')
    expect(deriveKey('piece.rabbit', 'text')).toBe('piece.rabbit.text')
    expect(deriveKey('piece.rabbit', 'icon')).toBe('piece.rabbit.icon')
  })

  it('derives keys that match what the shipped bundle already uses', () => {
    // If these diverged, an authored piece and a bundled piece would need two
    // different lookups — and `translate` only performs one.
    expect(deriveKey('piece.king', 'name')).toBe('piece.king.name')
    expect(deriveKey('skill.warp', 'text')).toBe('skill.warp.text')
  })
})

describe('writing a string into the overlay', () => {
  it('creates the overlay when the document has none', () => {
    const next = writeString(undefined, 'ko', 'piece.rabbit.name', '토끼')
    expect(next.ko?.['piece.rabbit.name']).toBe('토끼')
  })

  it('does not mutate the overlay it was given', () => {
    const before = { ko: { 'piece.rabbit.name': '토끼' } }
    const snapshot = structuredClone(before)
    const next = writeString(before, 'ko', 'piece.rabbit.text', '깡충 뛴다.')
    expect(before).toEqual(snapshot)
    expect(next.ko?.['piece.rabbit.text']).toBe('깡충 뛴다.')
    expect(next.ko?.['piece.rabbit.name']).toBe('토끼')
  })

  it('reads back what it wrote, and nothing for a key it did not', () => {
    const strings = writeString(undefined, 'ko', 'piece.rabbit.name', '토끼')
    expect(readString(strings, 'ko', 'piece.rabbit.name')).toBe('토끼')
    expect(readString(strings, 'ko', 'piece.rabbit.text')).toBeUndefined()
    expect(readString(undefined, 'ko', 'piece.rabbit.name')).toBeUndefined()
  })
})

describe('re-keying an overlay when a record id changes', () => {
  const strings = {
    ko: {
      'piece.rabbit.name': '토끼',
      'piece.rabbit.text': '깡충 뛴다.',
      'piece.rabbitfoot.name': '토끼발',
      'piece.king.name': '왕',
    },
  }

  it('moves every key belonging to the record, across every locale', () => {
    const next = rekeyStrings({ ...strings, en: { 'piece.rabbit.name': 'Rabbit' } }, 'piece.rabbit', 'piece.hare')
    expect(next?.ko?.['piece.hare.name']).toBe('토끼')
    expect(next?.ko?.['piece.hare.text']).toBe('깡충 뛴다.')
    expect(next?.en?.['piece.hare.name']).toBe('Rabbit')
    expect(next?.ko?.['piece.rabbit.name']).toBeUndefined()
    expect(next?.ko?.['piece.rabbit.text']).toBeUndefined()
  })

  it('leaves a record whose id merely starts with the old one alone', () => {
    // A prefix match on `piece.rabbit` also matches `piece.rabbitfoot`, which
    // would silently rename a DIFFERENT record's text. The boundary is the dot.
    const next = rekeyStrings(strings, 'piece.rabbit', 'piece.hare')
    expect(next?.ko?.['piece.rabbitfoot.name']).toBe('토끼발')
    expect(next?.ko?.['piece.harefoot.name']).toBeUndefined()
  })

  it('leaves other records alone and does not mutate its input', () => {
    const snapshot = structuredClone(strings)
    const next = rekeyStrings(strings, 'piece.rabbit', 'piece.hare')
    expect(strings).toEqual(snapshot)
    expect(next?.ko?.['piece.king.name']).toBe('왕')
  })

  it('is a no-op on a document with no overlay', () => {
    expect(rekeyStrings(undefined, 'piece.rabbit', 'piece.hare')).toBeUndefined()
  })

  it('is a no-op when the id did not actually change', () => {
    expect(rekeyStrings(strings, 'piece.rabbit', 'piece.rabbit')).toEqual(strings)
  })
})

