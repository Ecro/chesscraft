import {
  type BoardDef,
  COLLECTIONS,
  type CollectionName,
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
  pieces: unknown[]
  squareTypes: unknown[]
  ruleCards: unknown[]
  skillCards: unknown[]
  boards: unknown[]
  presets: unknown[]
}

/** Best-effort id extraction so an error can name its record even when invalid. */
function idOf(record: unknown, collection: string, index: number): string {
  if (record && typeof record === 'object' && 'id' in record) {
    const id = (record as { id: unknown }).id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return `${collection}[${index}]`
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
      const result = schema.safeParse(record)
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
  }

  // --- Fail closed --------------------------------------------------------
  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    set: {
      schemaVersion: schemaVersion!,
      pieces,
      squareTypes,
      ruleCards,
      skillCards,
      boards,
      presets,
    },
  }
}
