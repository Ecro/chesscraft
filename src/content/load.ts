import {
  type BoardDef,
  COLLECTIONS,
  type CollectionName,
  type ContentStrings,
  contentStrings,
  type PieceDef,
  type PresetDef,
  type RuleCardDef,
  type SkillCardDef,
  type SquareTypeDef,
} from './schema'

/**
 * Fail-closed content loading (AC-011).
 *
 * The load is ATOMIC: any error anywhere means no `ContentSet` is produced at
 * all, and none of the valid subset is exposed. Per-record validation that
 * registers records as it goes would pass the per-record tests while still
 * leaking a partially-loaded set onto the board, which is the exact failure
 * this boundary prohibits.
 */

export interface ValidationError {
  /** The offending content's id, or the collection name when the id is unusable. */
  contentId: string
  /** Dotted JSON path from the source root, e.g. `pieces.piece.pawn.movement`. */
  path: string
  message: string
}

export interface ContentSet {
  schemaVersion: number
  /**
   * The document's own text (ADR-020), always present — `{}` for a document
   * that declares none. Defaulted rather than optional because every consumer
   * would otherwise write the same `?? {}`, and the one that forgot would
   * silently take the bundle-only path for authored content.
   */
  strings: ContentStrings
  pieces: Map<string, PieceDef>
  squareTypes: Map<string, SquareTypeDef>
  ruleCards: Map<string, RuleCardDef>
  skillCards: Map<string, SkillCardDef>
  boards: Map<string, BoardDef>
  presets: Map<string, PresetDef>
}

export type LoadResult = { ok: true; set: ContentSet } | { ok: false; errors: ValidationError[] }

/**
 * An unvalidated content document — what a bundled set, a file on disk and an
 * editor buffer all are before `loadContentSet` has had its say. Records are
 * `unknown` on purpose: the Zod schemas are the only thing allowed to decide
 * whether a record is well-formed, so nothing upstream can assert it into shape.
 */
export interface ContentSource {
  schemaVersion: number
  /**
   * Authored text (ADR-020). Optional, and its ABSENT case is the common one:
   * every document written before schema v6 lacks it entirely.
   *
   * Typed rather than `unknown` — unlike the record arrays, which stay `unknown`
   * so nothing upstream can assert a record into shape past the Zod schemas.
   * This is a plain string map with no cross-references to check, and the editor
   * writes into it directly, so a type here buys real safety at the one call
   * site that matters instead of a cast.
   */
  strings?: ContentStrings
  pieces: unknown[]
  squareTypes: unknown[]
  ruleCards: unknown[]
  skillCards: unknown[]
  boards: unknown[]
  presets: unknown[]
}

/**
 * Does any of these effects end the match by fiat?
 *
 * Walks the actions rather than pattern-matching a card id — `win` is ordinary
 * vocabulary (ADR-012) and a record can carry it anywhere among its effects, so
 * anything that named specific content here would miss the next card written.
 */
function hasWinAction(effects: ReadonlyArray<{ actions: ReadonlyArray<{ kind: string }> }>): boolean {
  return effects.some((effect) => effect.actions.some((action) => action.kind === 'win'))
}

/** Best-effort id extraction so an error can name its record even when invalid. */
function idOf(record: unknown, collection: string, index: number): string {
  if (record && typeof record === 'object' && 'id' in record) {
    const id = (record as { id: unknown }).id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return `${collection}[${index}]`
}

/**
 * Fills in the skill-card fields a document's declared version predates.
 *
 * **Exported, and there is exactly one of these.** The editor's import path used
 * to carry its own copy of this logic, which is `[fail:design]
 * shared-vocabulary-unshared-code-path` (count 4): the v12 bump made the copy
 * wrong while the original was right, and the only symptom was two round-trip
 * tests going red. One vocabulary, one code path.
 *
 * **Two independent predicates, not one widened predicate**, and the spread
 * order is why: these defaults come LAST, so they override whatever the document
 * declares. Widening `<= 10` to `<= 11` would reset every v11 card's
 * `royalFollowUp` and `protectRelocatedAfterPlay` to the defaults — disabling
 * shipped protection and every follow-up disposition in v11 author content —
 * and the fields would be present and well-typed, so nothing would error. Each
 * version's injection covers only the fields that version could not carry.
 */
export function normalizeSkillCard(record: unknown, schemaVersion: number | null): unknown {
  if (schemaVersion === null || !record || typeof record !== 'object') return record
  return {
    ...record,
    ...(schemaVersion <= 10 ? { royalFollowUp: 'preserve', protectRelocatedAfterPlay: false } : {}),
    ...(schemaVersion <= 11 ? { lockRelocatedAfterPlay: false } : {}),
  }
}

/**
 * Fills the board-relative fields introduced by schema v13.
 *
 * Defaults are written LAST for v12 for the same reason as the skill-card
 * normalizer above: the declared version, not an accidental field on an old
 * record, owns the migration. A v13 record is left byte-for-byte intact so an
 * editor round-trip cannot erase an authored zone or depth.
 */
export function normalizeBoard(record: unknown, schemaVersion: number | null): unknown {
  if (schemaVersion === null || !record || typeof record !== 'object') return record
  const height = (record as { height?: unknown }).height
  const defaultTerritoryDepth = typeof height === 'number' && Number.isInteger(height) ? Math.floor(height / 2) : 1
  return {
    ...record,
    ...(schemaVersion <= 12
      ? { territoryDepth: defaultTerritoryDepth, promotionDepth: 1, zones: {} }
      : {}),
  }
}

export function loadContentSet(source: unknown): LoadResult {
  const errors: ValidationError[] = []

  if (!source || typeof source !== 'object') {
    return { ok: false, errors: [{ contentId: 'root', path: '', message: 'content source must be an object' }] }
  }
  const raw = source as Record<string, unknown>

  const schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : null
  if (schemaVersion === null) {
    errors.push({ contentId: 'root', path: 'schemaVersion', message: 'schemaVersion is required' })
  }

  /**
   * The document's own text (ADR-020). Absent is not an error — it is what
   * every document written before schema v6 looks like — but present-and-wrong
   * is, and it is reported with the same field-level path AC-011 requires of
   * the records.
   */
  let strings: ContentStrings = {}
  if (raw.strings !== undefined) {
    const parsedStrings = contentStrings.safeParse(raw.strings)
    if (parsedStrings.success) {
      strings = parsedStrings.data
    } else {
      for (const issue of parsedStrings.error.issues) {
        errors.push({
          contentId: 'root',
          path: ['strings', ...issue.path.map(String)].join('.'),
          message: issue.message,
        })
      }
    }
  }

  // --- Pass 1: per-record shape ------------------------------------------
  const parsed: Record<string, Map<string, unknown>> = {}
  for (const [name, schema] of Object.entries(COLLECTIONS) as Array<[CollectionName, (typeof COLLECTIONS)[CollectionName]]>) {
    const list = raw[name]
    const bucket = new Map<string, unknown>()
    parsed[name] = bucket

    if (!Array.isArray(list)) {
      errors.push({ contentId: 'root', path: name, message: `${name} must be an array` })
      continue
    }

    list.forEach((record, index) => {
      const id = idOf(record, name, index)
      const normalized =
        name === 'skillCards'
          ? normalizeSkillCard(record, schemaVersion)
          : name === 'boards'
            ? normalizeBoard(record, schemaVersion)
            : record
      const result = schema.safeParse(normalized)
      if (!result.success) {
        for (const issue of result.error.issues) {
          // An unrecognized-key issue points at the *object*, and carries the
          // offending keys separately. AC-011 requires the field path, so each
          // key becomes its own error rather than one vague object-level one.
          const leaves =
            issue.code === 'unrecognized_keys' && issue.keys.length > 0
              ? issue.keys.map((k) => [...issue.path.map(String), k])
              : [issue.path.map(String)]
          for (const leaf of leaves) {
            errors.push({
              contentId: id,
              path: [name, id, ...leaf].join('.'),
              message: issue.message,
            })
          }
        }
        return
      }
      if (bucket.has(id)) {
        errors.push({ contentId: id, path: `${name}.${id}`, message: `duplicate id ${id}` })
        return
      }
      bucket.set(id, result.data)
    })
  }

  // --- Pass 2: cross-references ------------------------------------------
  // Only runs against records that individually parsed; a record that failed
  // pass 1 simply is not in the bucket, so it cannot produce cascading noise.
  const pieces = parsed.pieces as Map<string, PieceDef>
  const squareTypes = parsed.squareTypes as Map<string, SquareTypeDef>
  const ruleCards = parsed.ruleCards as Map<string, RuleCardDef>
  const skillCards = parsed.skillCards as Map<string, SkillCardDef>
  const boards = parsed.boards as Map<string, BoardDef>
  const presets = parsed.presets as Map<string, PresetDef>

  for (const [id, card] of skillCards) {
    if (!card.protectRelocatedAfterPlay) continue
    const teleports = card.effects.flatMap((effect) =>
      effect.actions
        .filter((action) => action.kind === 'teleport_piece')
        .map((action) => ({ effect, action })),
    )
    const valid =
      teleports.length === 1 &&
      !card.effects.some((effect) => effect.actions.some((action) => action.kind === 'swap_pieces')) &&
      teleports[0]!.effect.forEach === undefined &&
      teleports[0]!.effect.condition.kind === 'always' &&
      (teleports[0]!.action.target.kind === 'chosen_friendly' || teleports[0]!.action.target.kind === 'chosen_enemy')
    if (!valid) {
      errors.push({
        contentId: id,
        path: `skillCards.${id}.protectRelocatedAfterPlay`,
        message: 'requires exactly one unconditional, unquantified, single-subject teleport and no other relocation',
      })
    }
  }

  // The relocation lock's own grammar (v12, ADR-002) — deliberately NOT the one
  // above. It accepts `swap_pieces`, which that grammar rejects outright, and it
  // accepts a quantified or conditional relocation: the lock attaches to every
  // subject the settlement step resolves, so more subjects is not a problem the
  // way it is for a single protected square.
  //
  // What it refuses is the absent case: a card declaring the flag with nothing
  // to relocate. That card would validate, draw, play and do nothing, which is
  // this project's most-recurring failure and the reason the check exists.
  for (const [id, card] of skillCards) {
    if (!card.lockRelocatedAfterPlay) continue
    const relocates = card.effects.some((effect) =>
      effect.actions.some((action) => action.kind === 'teleport_piece' || action.kind === 'swap_pieces'),
    )
    if (!relocates) {
      errors.push({
        contentId: id,
        path: `skillCards.${id}.lockRelocatedAfterPlay`,
        message: 'requires at least one relocation action (teleport_piece or swap_pieces) for the lock to attach to',
      })
    }
  }

  const requireRef = (
    exists: boolean,
    contentId: string,
    path: string,
    refKind: string,
    refId: string,
  ) => {
    if (!exists) {
      errors.push({ contentId, path, message: `references unknown ${refKind} ${refId}` })
    }
  }

  /** Piece ids an effect names, across every place a v2 effect can name one. */
  const checkEffectRefs = (
    collection: string,
    id: string,
    effects: ReadonlyArray<{
      forEach?: { pieceId?: string | undefined } | undefined
      actions: ReadonlyArray<Record<string, unknown>>
    }>,
  ) => {
    effects.forEach((effect, ei) => {
      const quantified = effect.forEach?.pieceId
      if (quantified !== undefined) {
        requireRef(pieces.has(quantified), id, `${collection}.${id}.effects.${ei}.forEach.pieceId`, 'piece', quantified)
      }
      effect.actions.forEach((act, ai) => {
        const base = `${collection}.${id}.effects.${ei}.actions.${ai}`
        if (act.kind === 'promote_piece') {
          requireRef(pieces.has(act.to as string), id, `${base}.to`, 'piece', act.to as string)
        }
        if (act.kind === 'spawn_piece') {
          requireRef(pieces.has(act.pieceId as string), id, `${base}.pieceId`, 'piece', act.pieceId as string)
        }
        if (act.kind === 'revive_piece' && Array.isArray(act.except)) {
          ;(act.except as string[]).forEach((refId, xi) => {
            requireRef(pieces.has(refId), id, `${base}.except.${xi}`, 'piece', refId)
          })
        }
      })
    })
  }

  for (const [id, piece] of pieces) {
    if (piece.promotion) {
      requireRef(pieces.has(piece.promotion.to), id, `pieces.${id}.promotion.to`, 'piece', piece.promotion.to)
    }
    checkEffectRefs('pieces', id, piece.effects)
  }

  for (const [id, type] of squareTypes) checkEffectRefs('squareTypes', id, type.effects)

  for (const [collection, cards] of [
    ['ruleCards', ruleCards],
    ['skillCards', skillCards],
  ] as const) {
    for (const [id, card] of cards as Map<string, RuleCardDef | SkillCardDef>) {
      checkEffectRefs(collection, id, card.effects)
    }
  }

  for (const [id, board] of boards) {
    board.placements.forEach((p, i) => {
      requireRef(pieces.has(p.pieceId), id, `boards.${id}.placements.${i}.pieceId`, 'piece', p.pieceId)
    })

    const painted = new Map(board.squares.map((s) => [s.square, s]))
    board.squares.forEach((s, i) => {
      const type = squareTypes.get(s.typeId)
      requireRef(type !== undefined, id, `boards.${id}.squares.${i}.typeId`, 'square type', s.typeId)
      if (!type) return

      // ADR-010: a paired square type needs a partner that points back.
      if (type.paired) {
        if (!s.pairedWith) {
          errors.push({
            contentId: id,
            path: `boards.${id}.squares.${i}.pairedWith`,
            message: `square type ${s.typeId} is paired, so pairedWith is required and must be symmetric`,
          })
          return
        }
        const partner = painted.get(s.pairedWith)
        if (!partner) {
          errors.push({
            contentId: id,
            path: `boards.${id}.squares.${i}.pairedWith`,
            message: `pairedWith ${s.pairedWith} is not a painted square; pairing must be symmetric`,
          })
          return
        }
        if (partner.pairedWith !== s.square) {
          errors.push({
            contentId: id,
            path: `boards.${id}.squares.${i}.pairedWith`,
            message: `pairing with ${s.pairedWith} is not symmetric — it points at ${partner.pairedWith ?? 'nothing'}`,
          })
        }
      } else if (s.pairedWith) {
        errors.push({
          contentId: id,
          path: `boards.${id}.squares.${i}.pairedWith`,
          message: `square type ${s.typeId} is not paired, so pairedWith must be omitted`,
        })
      }
    })
  }

  for (const [id, preset] of presets) {
    requireRef(boards.has(preset.boardId), id, `presets.${id}.boardId`, 'board', preset.boardId)
    preset.pieceIds.forEach((refId, i) => {
      requireRef(pieces.has(refId), id, `presets.${id}.pieceIds.${i}`, 'piece', refId)
    })
    preset.ruleCardIds.forEach((refId, i) => {
      requireRef(ruleCards.has(refId), id, `presets.${id}.ruleCardIds.${i}`, 'rule card', refId)
    })
    preset.skillCardIds.forEach((refId, i) => {
      requireRef(skillCards.has(refId), id, `presets.${id}.skillCardIds.${i}`, 'skill card', refId)
    })

    // --- v8 loadout ----------------------------------------------------
    //
    // Two kinds of rule live here and one kind deliberately does not. Reference
    // checks and the STRUCTURAL duel-legal rules are decidable from the document
    // alone, so they belong with every other fail-closed check. Band matching
    // and the budget SUM need measured grades — 600 self-play matches per arm —
    // and a synchronous validator cannot run twenty thousand matches, so those
    // live in `@balance/legal` and run where the grade cache is (ADR-011).
    const declaresLoadout = preset.loadout?.white !== undefined || preset.loadout?.black !== undefined
    if (declaresLoadout && preset.loadoutBudget === undefined) {
      // ADR-010, fail-closed. A room that declares a loadout without a budget is
      // refused rather than defaulted or waved through: an optional field a gate
      // activates on is this repo's most-recurring failure, and fail-open here
      // means the room that forgot the number is the unconstrained one.
      errors.push({
        contentId: id,
        path: `presets.${id}.loadoutBudget`,
        message: 'a preset that declares a loadout must also declare loadoutBudget',
      })
    }

    for (const side of ['white', 'black'] as const) {
      const slot = preset.loadout?.[side]
      if (!slot) continue
      const at = `presets.${id}.loadout.${side}`
      requireRef(pieces.has(slot.pieceId), id, `${at}.pieceId`, 'piece', slot.pieceId)
      requireRef(pieces.has(slot.replaces), id, `${at}.replaces`, 'piece', slot.replaces)
      requireRef(skillCards.has(slot.skillCardId), id, `${at}.skillCardId`, 'skill card', slot.skillCardId)

      const brought = pieces.get(slot.pieceId)
      const replaced = pieces.get(slot.replaces)
      const card = skillCards.get(slot.skillCardId)

      // ADR-003 — the ban attaches to the SLOT, not to where a record came from.
      // `win` and `royal` stay perfectly legal in the library and in the shared
      // draft pool; they simply cannot be what a side brings of its own. That is
      // what makes a provenance flag unnecessary, and a provenance flag is a
      // thing an imported document could forge.
      if (brought && hasWinAction(brought.effects)) {
        errors.push({ contentId: id, path: `${at}.pieceId`, message: `${slot.pieceId} wins the match outright, so it cannot be brought as a loadout` })
      }
      if (card && hasWinAction(card.effects)) {
        errors.push({ contentId: id, path: `${at}.skillCardId`, message: `${slot.skillCardId} wins the match outright, so it cannot be brought as a loadout` })
      }
      if (brought?.royal) {
        errors.push({ contentId: id, path: `${at}.pieceId`, message: `${slot.pieceId} is royal, so it cannot be brought as a loadout` })
      }
      // ADR-008 — replacing a royal piece would move the losing condition, which
      // is a different game rather than a customised army.
      if (replaced?.royal) {
        errors.push({ contentId: id, path: `${at}.replaces`, message: `${slot.replaces} is royal and cannot be replaced` })
      }

      // A loadout card the room ALSO deals to everyone is not a loadout. Both
      // sides draw from `skillCardIds`, so the overlap hands the other side the
      // card this side brought as its own — silently, and only for some rooms,
      // which is the worst version of the failure. Refused rather than papered
      // over in `skillPoolFor`, because stripping a shared card from the OTHER
      // side's pool would punish them for a choice they did not make.
      if (preset.skillCardIds.includes(slot.skillCardId)) {
        errors.push({
          contentId: id,
          path: `${at}.skillCardId`,
          message: `${slot.skillCardId} is already in this room's shared pool, so it cannot also be ${side}'s own card`,
        })
      }

      const board = boards.get(preset.boardId)
      if (board && replaced && !board.placements.some((p) => p.side === side && p.pieceId === slot.replaces)) {
        errors.push({
          contentId: id,
          path: `${at}.replaces`,
          message: `${slot.replaces} does not stand on ${side}'s side of board ${preset.boardId}, so there is nothing to replace`,
        })
      }
    }
  }

  // --- Fail closed --------------------------------------------------------
  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    set: {
      schemaVersion: schemaVersion!,
      strings,
      pieces,
      squareTypes,
      ruleCards,
      skillCards,
      boards,
      presets,
    },
  }
}
