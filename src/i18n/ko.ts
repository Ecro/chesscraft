/**
 * The `ko` locale bundle (AC-016).
 *
 * Content carries keys, never literals, so this file is the only place player-
 * facing wording lives — which is what lets the same card set ship in another
 * language without touching content. Phase 6b fills this out for the full card
 * set; Phase 4 covers the slice.
 *
 * Wording target is 초/중학생: short sentences, no jargon, and every card's text
 * says what it *does* rather than what it is called.
 */
export const ko: Record<string, string> = {
  // --- pieces ---
  'piece.king.name': '왕',
  'piece.king.text': '어느 방향으로든 한 칸씩 움직인다. 왕이 잡히면 그 자리에서 게임이 끝난다.',
  'piece.archer.name': '궁수',
  'piece.archer.text':
    '어느 방향으로든 한 칸 움직이지만, 그렇게는 잡지 못한다. 대신 상하좌우로 두 칸 떨어진 상대를 쏘아 잡는다. 궁수 바로 옆에 붙어 있는 우리 편은 잡히지 않는다.',

  // --- special squares ---
  'square.beacon.name': '봉화대',
  'square.beacon.text': '이 칸에 들어온 기물은 곧바로 d4로 날아간다.',

  // --- rule cards ---
  'rule.beacon-rush.name': '봉화 쟁탈전',
  'rule.beacon-rush.text': '내 기물이 d4에 서 있는 채로 턴이 끝나면 그 즉시 이긴다.',

  // --- skill cards ---
  'skill.warp.name': '순간이동',
  'skill.warp.text': '우리 편 기물 하나를 빈 칸으로 옮긴다.',
  'skill.hold.name': '결박',
  'skill.hold.text': '상대 기물 하나를 두 번의 차례 동안 묶어 둔다.',
  'skill.rally.name': '증원',
  'skill.rally.text': '빈 칸에 우리 편 궁수를 한 명 불러낸다.',
  'skill.volley.name': '일제사격',
  'skill.volley.text': '상대 기물 하나를 없앤다.',
  'skill.snare.name': '올가미',
  'skill.snare.text': '상대 기물 하나를 한 번의 차례 동안 묶어 둔다.',
  'skill.ascend.name': '대관식',
  'skill.ascend.text': '우리 편 기물 하나를 왕으로 세운다. 왕이 둘이 되지만, 잃으면 안 되는 기물도 둘이 된다.',

  // --- boards and presets ---
  'board.slice.name': '봉화 보드',
  'preset.slice.name': '봉화 쟁탈전',
}
