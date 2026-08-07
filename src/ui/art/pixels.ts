/**
 * The 12x12 pixel sprite sheet (Chess Craft redesign).
 *
 * Every mark this app draws — piece, painted square, rule card, skill card, tab
 * bar icon — is twelve rows of twelve characters in here. The redesign retires
 * the emoji glyphs for one reason that is not taste: an emoji is drawn from a
 * colour font, so it ignores `color` and `font-weight`, and ADR-007 spends both
 * of those separating the two armies. Two archers rendered identically, and
 * `ko.ts` already carried a paragraph apologising for it. A sprite the app owns
 * inherits whatever tint it is handed.
 *
 * **A sprite is data, not a picture file.** `artRegistry` still maps an art id
 * to an asset for raster entries; a pixel entry names a key in here instead, so
 * nothing has to be emitted by the bundler, precached by the service worker or
 * enumerated in `vite-plugin-sw.ts`. Offline is free.
 *
 * **Characters.** `.` is transparent, `$` takes the caller's tint, and every
 * other character indexes `PIXEL_PALETTE`. An unknown character is drawn in
 * magenta rather than skipped — a missing colour should be loud in review, not
 * a hole in a king's crown.
 */

/** One sprite: exactly 12 rows of exactly 12 characters. `pixels.test.ts` pins both. */
export type PixelSprite = readonly string[]

/**
 * The shared ramp. Deliberately small and reused across all 41 sprites — a
 * per-sprite colour would make the sheet look like 41 unrelated drawings, and
 * the whole point of a sheet is that a bomb and a crown read as the same world.
 */
export const PIXEL_PALETTE: Readonly<Record<string, string>> = {
  o: '#0e0f14', // outline — every sprite is drawn against it
  s: '#9aa2b4',
  S: '#d5dbe6',
  w: '#7a4f22',
  // Lightened from the mock's #a9713a, which is 3.04:1 against the raised panel
  // a card face sits on — just under the 3.30:1 floor. Two sprites (the snare
  // and the recall) are mostly this tone and were the ones that failed.
  W: '#b87c40',
  K: '#23262f',
  H: '#5b6273',
  y: '#ffb23a',
  Y: '#ffd98a',
  P: '#7b52c9',
  c: '#c9a4ff',
  B: '#2a4fa8',
  b: '#8ab4ff',
  G: '#e0a52c',
  g: '#ffe089',
  C: '#7fe3ff',
  R: '#a72a1c',
  r: '#e8ded0',
  n: '#5b8f3e',
  N: '#86bd63',
  e: '#e83a1f',
  E: '#ff9b86',
  d: '#4a3b2a',
  D: '#6f5839',
}

/**
 * What a `$` cell becomes when the caller names no tint.
 *
 * A custom property with a literal fallback, not a bare colour. ADR-021 keeps
 * every colour in `tokens.css` so a re-skin is a data change, and a sprite drawn
 * on an untinted surface has to obey that too — but jsdom and a bare
 * screenshot have no stylesheet, and a sprite that renders invisible under test
 * is worse than one that names a default. The fallback is the theme's own value.
 */
export const DEFAULT_TINT = 'var(--pix-tint, #8ab4ff)'

export const PIXEL_SPRITES = {
  /* Pieces. `$` cells take the side tint — ADR-007 asks the two armies to differ
 * by more than hue, and the outline plus the fill do that at 12px. */
  'king': [
    '............',
    '.oo......oo.',
    '.oGo.oo.oGo.',
    '.oGooGGooGo.',
    '.oGGGGGGGGo.',
    '.oGGGGGGGGo.',
    '.oGGgGGgGGo.',
    '.oGGGGGGGGo.',
    '.oooooooooo.',
    '.o$$$$$$$$o.',
    '.o$$$$$$$$o.',
    '.oooooooooo.',
  ],
  'queen': [
    '.o...oo...o.',
    '.oo..oo..oo.',
    '.o$o.$$.o$o.',
    '.o$oo$$oo$o.',
    '.o$$$$$$$$o.',
    '.o$$$$$$$$o.',
    '..o$$$$$$o..',
    '..o$$$$$$o..',
    '.o$$$$$$$$o.',
    '.o$$$$$$$$o.',
    '.oooooooooo.',
    '............',
  ],
  'rook': [
    '............',
    '.oooooooooo.',
    '.o$$o$$o$$o.',
    '.o$$o$$o$$o.',
    '.o$$$$$$$$o.',
    '..o$$$$$$o..',
    '..o$$$$$$o..',
    '..o$$$$$$o..',
    '.o$$$$$$$$o.',
    '.o$$$$$$$$o.',
    '.oooooooooo.',
    '............',
  ],
  'knight': [
    '.....ooo....',
    '....o$$$o...',
    '...o$$$$$o..',
    '..o$o$$$$o..',
    '.oo$$$$$$o..',
    'o$$$$$$$$o..',
    'o$$oo$$$$o..',
    'oo..o$$$$o..',
    '....o$$$$o..',
    '...o$$$$$$o.',
    '..o$$$$$$$$o',
    '..oooooooooo',
  ],
  'pawn': [
    '.....oo.....',
    '....o$$o....',
    '....o$$o....',
    '.....oo.....',
    '....o$$o....',
    '...o$$$$o...',
    '...o$$$$o...',
    '..o$$$$$$o..',
    '.o$$$$$$$$o.',
    '.o$$$$$$$$o.',
    '.oooooooooo.',
    '............',
  ],
  'archer': [
    '...oo.......',
    '..o$$o......',
    '.o$$o.o.....',
    '.o$o...o....',
    '.o$o....o...',
    'o$$o..oSSSSo',
    'o$$o..oSSSSo',
    '.o$o....o...',
    '.o$o...o....',
    '.o$$o.o.....',
    '..o$$o......',
    '...oo.......',
  ],
  /* Special square types. */
  'bomb': [
    '.........o..',
    '........os..',
    '.......oso..',
    '....oo.so...',
    '...oKKo.....',
    '..oKHKKo....',
    '.oKHKKKKo...',
    '.oKKKKKKo...',
    '.oKKKKKKo...',
    '..oKKKKo....',
    '...oooo.....',
    '............',
  ],
  'portal': [
    '...oooooo...',
    '..oPPPPPPo..',
    '.oPPccccPPo.',
    '.oPcc..ccPo.',
    '.oPc....cPo.',
    '.oPc....cPo.',
    '.oPc....cPo.',
    '.oPcc..ccPo.',
    '.oPPccccPPo.',
    '..oPPPPPPo..',
    '...oooooo...',
    '............',
  ],
  'shrine': [
    '.oooooooooo.',
    '.oRRRRRRRRo.',
    '..oRRRRRRo..',
    '...oooooo...',
    '...oRoooRo..',
    '...oRoooRo..',
    '...oRoooRo..',
    '...oRoooRo..',
    '...oRoooRo..',
    '..oRRooRRo..',
    '.oRRRooRRRo.',
    '.oooooooooo.',
  ],
  'sanctuary': [
    '..oooooooo..',
    '.oBBBBBBBBo.',
    '.oBbbbbbbBo.',
    '.oBbBBBBbBo.',
    '.oBbBbbBbBo.',
    '.oBbBbbBbBo.',
    '.oBbBBBBbBo.',
    '..oBbbbbBo..',
    '...oBBBBo...',
    '....oBBo....',
    '.....oo.....',
    '............',
  ],
  'mire': [
    '.....oo.....',
    '....o$$o....',
    '...o$oo$o...',
    '...o$..$o...',
    '....oo$o....',
    '......$o....',
    '.o....$o..o.',
    'o$o...$o.o$o',
    'o$$oooooo$$o',
    '.o$$$$$$$$o.',
    '..oooooooo..',
    '............',
  ],
  /* Rule cards. */
  'hill': [
    '............',
    '.....oo.....',
    '....oSSo....',
    '...oSSSSo...',
    '..oSSggSSo..',
    '.oSSgddgSSo.',
    '.oSggddggSo.',
    'oSggdddggSo.',
    'oSgddddddgSo',
    'oggddddddgSo',
    '.oooooooooo.',
    '............',
  ],
  'three': [
    '..oooooo....',
    '.oGGGGGGo...',
    '.oGooooGo...',
    '.oo....oGo..',
    '......oGGo..',
    '....ooGGo...',
    '....oGGo....',
    '.oo...oGGo..',
    '.oGo...oGo..',
    '.oGGooooGGo.',
    '..oGGGGGGo..',
    '...oooooo...',
  ],
  'skull': [
    '...oooooo...',
    '..oSSSSSSo..',
    '.oSSooooSSo.',
    '.oSoSooSoSo.',
    '.oSSooooSSo.',
    '.oSSSooSSSo.',
    '..oSoooooo..',
    '...oSSSSo...',
    '..oSoSoSoSo.',
    '..oSoSoSoSo.',
    '...oooooo...',
    '............',
  ],
  'upgrade': [
    '.....oo.....',
    '....oYYo....',
    '...oYYYYo...',
    '..oYYYYYYo..',
    '.oYYYYYYYYo.',
    'oooooYYooooo',
    '....oYYo....',
    '.....oo.....',
    '..oooooooo..',
    '.oYYYYYYYYo.',
    '.oYYYYYYYYo.',
    '..oooooooo..',
  ],
  'crest': [
    '..oooooooo..',
    '.oBBBBBBBBo.',
    '.oBGGGGGGBo.',
    '.oBGoooooBo.',
    '.oBGoGGoGBo.',
    '.oBGoGGoGBo.',
    '.oBGoooooBo.',
    '..oBGGGGBo..',
    '...oBBBBo...',
    '....oBBo....',
    '.....oo.....',
    '............',
  ],
  'flame': [
    '.....oo.....',
    '....oyyo....',
    '...oyeeyo...',
    '..oyeEEeyo..',
    '..oeEyyEeo..',
    '.oyeEyyEeyo.',
    '.oyeEEEEeyo.',
    '.oyeeEEeeyo.',
    '..oyeeeeyo..',
    '..ooyyyyoo..',
    '...oooooo...',
    '............',
  ],
  'ranks': [
    '....oo..oo..',
    '...o$$oo$$o.',
    '...o$$oo$$o.',
    '....oooooo..',
    '...o$$oo$$o.',
    '..o$$$oo$$$o',
    '..o$$$oo$$$o',
    '.o$$$$oo$$$o',
    '.o$$$$oo$$$o',
    '.o$$$$oo$$$o',
    '.oooooooooo.',
    '............',
  ],
  'blood': [
    '.....oo.....',
    '....oeeo....',
    '....oeeo....',
    '...oeEEeo...',
    '..oeEEEEeo..',
    '.oeEEEEEEeo.',
    '.oeEEEEEEeo.',
    '.oeEEEEEEeo.',
    '..oeEEEEeo..',
    '..ooeeeeoo..',
    '...oooooo...',
    '............',
  ],
  'bolt': [
    '......ooo...',
    '.....oyyo...',
    '....oyyo....',
    '...oyyo.....',
    '..oyyoooo...',
    '.oyyyyyyo...',
    '.ooooyyyo...',
    '....oyyo....',
    '...oyyo.....',
    '..oyyo......',
    '..oyo.......',
    '..oo........',
  ],
  'horse': [
    '.....ooo....',
    '....o$$$o...',
    '...o$$$$$o..',
    '..o$o$$$$o..',
    '.oo$$$$$$o..',
    'o$$$$$$$$o..',
    'o$$oo$$$$o..',
    'oo..o$$$$o..',
    '....o$$$$o..',
    '...o$$$$$$o.',
    '..o$$$$$$$$o',
    '..oooooooooo',
  ],
  'swords': [
    '.oo......oo.',
    '.oSo....oSo.',
    '..oSo..oSo..',
    '...oSooSo...',
    '....oSSo....',
    '.....oo.....',
    '....oSSo....',
    '...oSooSo...',
    '..oSo..oSo..',
    '.oSo....oSo.',
    '.oGo....oGo.',
    '.oo......oo.',
  ],
  /* Skill cards. */
  'warp': [
    '.....oo.....',
    '....oYYo....',
    '....oYYo....',
    '.o..oYYo..o.',
    '.oYooYYooYo.',
    '.oYYYYYYYYo.',
    '.oYYYYYYYYo.',
    '.oYooYYooYo.',
    '.o..oYYo..o.',
    '....oYYo....',
    '....oYYo....',
    '.....oo.....',
  ],
  'arrows': [
    '...oooooo...',
    '..oBBBBBBo..',
    '.oBBoooo....',
    '.oBBo.......',
    '.oBBo...oo..',
    '.oooo..oBBo.',
    '.oEEo..oBBo.',
    '.oEEo...oo..',
    '.oEEo.......',
    '.oEEoooo....',
    '..oEEEEEEo..',
    '...oooooo...',
  ],
  'sprout': [
    '............',
    '.....oo.....',
    '..oo.oNo....',
    '.oNNooNo....',
    '.oNNNNNo....',
    '..ooNNo.oo..',
    '....oNooNNo.',
    '....oNoNNNo.',
    '....oNooNo..',
    '..ooooNoooo.',
    '.oWWWWWWWWo.',
    '.oooooooooo.',
  ],
  'ice': [
    '.....oo.....',
    '..o..CC..o..',
    '..oC.CC.Co..',
    '...oCCCCo...',
    '.ooCCCCCCoo.',
    '.oCCCCCCCCo.',
    '.oCCCCCCCCo.',
    '.ooCCCCCCoo.',
    '...oCCCCo...',
    '..oC.CC.Co..',
    '..o..CC..o..',
    '.....oo.....',
  ],
  'trap': [
    '.oo......oo.',
    '.oWo....oWo.',
    '.oWWoooooWo.',
    '.oWWWWWWWWo.',
    '..oooooooo..',
    '...oWWWWo...',
    '....oWWo....',
    '...oWWWWo...',
    '..oWWWWWWo..',
    '.oWWWWWWWWo.',
    '.oooooooooo.',
    '............',
  ],
  'crown': [
    '............',
    '.oo......oo.',
    '.oGo.oo.oGo.',
    '.oGooGGooGo.',
    '.oGGGGGGGGo.',
    '.oGGGGGGGGo.',
    '.oGGgGGgGGo.',
    '.oGGGGGGGGo.',
    '.oooooooooo.',
    '..o$$$$$$o..',
    '..o$$$$$$o..',
    '..oooooooo..',
  ],
  'horse-leap': [
    '.....ooo....',
    '....o$$$o...',
    '...o$$$$$o..',
    '..o$o$$$$o..',
    '.oo$$$$$$o..',
    'o$$$$$$$$o..',
    'o$$oo$$$$oyo',
    'oo..o$$$$oyo',
    '....o$$$$oyo',
    '...o$$$$$$oo',
    '..o$$$$$$$oo',
    '..ooooooooo.',
  ],
  'horn': [
    '.o..oo..o...',
    '.oyooyyooyo.',
    '.oyyyyyyyyo.',
    '..oyyyyyyo..',
    '...oooooo...',
    '....o$$o....',
    '...o$$$$o...',
    '..o$$$$$$o..',
    '.o$$$$$$$$o.',
    '.o$$$$$$$$o.',
    '.oooooooooo.',
    '............',
  ],
  /* Stone, not brick. The mock drew this in `R` (a deep red), which is 2.10:1
     against the recessed slot a card sits in — the sprite was a dark shape on a
     dark square. `S` is the sheet's pale tone and clears 10:1 there.
     `art-contrast.test.ts` is what caught it. */
  'wall': [
    '.oooooooooo.',
    '.oSSoSSoSSo.',
    '.oSSoSSoSSo.',
    '.oooooooooo.',
    '.oSoSSoSSoSo',
    '.oSoSSoSSoSo',
    '.oooooooooo.',
    '.oSSoSSoSSo.',
    '.oSSoSSoSSo.',
    '.oooooooooo.',
    '............',
    '............',
  ],
  'chain': [
    '..oooo......',
    '.oSSSSo.....',
    '.oSooSo.....',
    '.oSo.oSo....',
    '.oSSSSo.....',
    '..oooo.oooo.',
    '.......oSSSo',
    '.oooo..oSooS',
    '.oSSSSo.oSSS',
    '.oSooSo.oooo',
    '.oSSSSo.....',
    '..oooo......',
  ],
  'homeward': [
    '.....oo.....',
    '....oRRo....',
    '...oRRRRo...',
    '..oRRRRRRo..',
    '.oRRRRRRRRo.',
    'oRRRRRRRRRRo',
    'ooooRWWRoooo',
    '...oRWWRo...',
    '...oRWWRo...',
    '...oRWWRo...',
    '...oooooo...',
    '............',
  ],
  'fist': [
    '............',
    '.....oo.....',
    '....oyyo....',
    '...oyyyyo...',
    '..oyyyyyyo..',
    '.oyyyyyyyyo.',
    '.ooooyyoooo.',
    '....oyyo....',
    '....oyyo....',
    '....oyyo....',
    '.....oo.....',
    '............',
  ],
  'plus': [
    '.....oo.....',
    '....oNNo....',
    '....oNNo....',
    '.oooooooooo.',
    '.oNNNNNNNNo.',
    '.oNNNNNNNNo.',
    '.oooooooooo.',
    '....oNNo....',
    '....oNNo....',
    '.....oo.....',
    '............',
    '............',
  ],
  'arrow': [
    '.........oo.',
    '........oSo.',
    '......ooSo..',
    '.....oySo...',
    '....oySo....',
    '.oo.oSo.....',
    '.oWooo......',
    '.oWWo.......',
    'oWooWo......',
    'oWo..oWo....',
    '.oo...oWo...',
    '.......oo...',
  ],
  'dagger': [
    '.....oo.....',
    '....oSSo....',
    '....oSSo....',
    '....oSSo....',
    '....oSSo....',
    '.oooSSSooo..',
    '.oGGGGGGGo..',
    '.ooooSooo...',
    '....oSSo....',
    '....oSSo....',
    '....oeeo....',
    '.....oo.....',
  ],
  /* The UI's own furniture — tab bar and the paint palette's eraser. These are
 * never content art ids; nothing in a document may point at them. */
  'nav-play': [
    '.........oo.',
    '........oSo.',
    '.......oSSo.',
    '......oSSo..',
    '.....oSSo...',
    '....oSSo....',
    '...oSSo.....',
    '.oooSo......',
    '.oGGo.......',
    'oGGGGo......',
    '.oo.oGo.....',
    '.....oo.....',
  ],
  'nav-build': [
    '..oo....oo..',
    '.osSo..oSso.',
    '.osSSooSSso.',
    '..osSSSSso..',
    '....oWwo....',
    '....oWwo....',
    '....oWwo....',
    '....oWwo....',
    '....oWwo....',
    '....oWwo....',
    '....oWwo....',
    '.....oo.....',
  ],
  'nav-dex': [
    '............',
    '.oooooooooo.',
    '.oRRRoRRRRo.',
    '.oRrrRoRrRo.',
    '.oRrrRoRrRo.',
    '.oRrrRoRrRo.',
    '.oRrrRoRrRo.',
    '.oRrrRoRrRo.',
    '.oRRRoRRRRo.',
    '.oooooooooo.',
    '............',
    '............',
  ],
  'erase': [
    '.......oooo.',
    '......oSSSSo',
    '.....oSSSSSo',
    '....oSSSSSo.',
    '...oSSSSSo..',
    '..oyyyyyo...',
    '.oyYYYYyo...',
    'oyYYYYyo....',
    'oyYYYyo.....',
    'oyYYyo......',
    'oyyyo.......',
    '.ooo........',
  ],
} as const satisfies Record<string, PixelSprite>

export type SpriteName = keyof typeof PIXEL_SPRITES

export function isSpriteName(name: string): name is SpriteName {
  return Object.hasOwn(PIXEL_SPRITES, name)
}

/**
 * A horizontal run of identical pixels, in sprite coordinates (0..11).
 *
 * The sprites are rendered as SVG rects rather than as the design prototype's
 * `box-shadow` pixel stack, and the runs are why. A 6x6 board shows up to 36
 * pieces; at one shadow per opaque pixel that is some five thousand shadows in
 * one `box-shadow` list per repaint, which is the kind of thing that is fine on
 * a laptop and visibly stutters on the household Android this app is for.
 * Merging each row into runs roughly halves it — 40 rects for the average
 * sprite, 57 for the worst — and `shape-rendering: crispEdges` keeps the
 * result pixel-identical to the box-shadow version.
 */
export interface PixelRun {
  readonly x: number
  readonly y: number
  readonly w: number
  /** A palette colour, or null for "the caller's tint" — a `$` cell. */
  readonly fill: string | null
}

const runCache = new Map<PixelSprite, readonly PixelRun[]>()

/**
 * The sprite as merged horizontal runs, memoised per sprite.
 *
 * Keyed on the sprite VALUE rather than on its name so a sprite that never
 * entered `PIXEL_SPRITES` — one an author will eventually draw in the editor —
 * caches on the same path as a bundled one.
 */
export function runsOf(sprite: PixelSprite): readonly PixelRun[] {
  const cached = runCache.get(sprite)
  if (cached) return cached

  const runs: PixelRun[] = []
  sprite.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]!
      let w = 1
      while (row[x + w] === ch) w++
      if (ch !== '.') {
        // Unknown characters render magenta rather than vanishing. A sprite with
        // a typo in it should be impossible to miss in review.
        runs.push({ x, y, w, fill: ch === '$' ? null : (PIXEL_PALETTE[ch] ?? '#ff00ff') })
      }
      x += w
    }
  })

  const frozen = Object.freeze(runs)
  runCache.set(sprite, frozen)
  return frozen
}
