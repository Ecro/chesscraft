/**
 * The `ko` locale bundle (AC-016).
 *
 * Content carries keys, never literals, so this file is the only place player-
 * facing wording lives — which is what lets the same card set ship in another
 * language without touching content.
 *
 * Wording target is 초/중학생: short sentences, no jargon, and every card's text
 * says what it DOES rather than restating its name. `bundled.test.ts` enforces
 * the last part — a description that merely repeats the title teaches nothing.
 */
export const ko: Record<string, string> = {
  // --- pieces ---
  'piece.king.name': '왕',
  'piece.king.text': '어느 방향으로든 한 칸씩 움직인다. 왕이 잡히면 그 자리에서 게임이 끝난다.',
  'piece.queen.name': '여왕',
  'piece.queen.text': '가로, 세로, 대각선으로 원하는 만큼 쭉 간다. 가장 강한 기물이다.',
  'piece.rook.name': '성',
  'piece.rook.text': '가로와 세로로 원하는 만큼 쭉 간다.',
  'piece.knight.name': '기사',
  'piece.knight.text': 'ㄱ자로 뛴다. 사이에 기물이 있어도 넘어갈 수 있다.',
  'piece.pawn.name': '병사',
  'piece.pawn.text': '앞으로 한 칸 가고, 잡을 때만 대각선 앞으로 간다. 끝줄에 닿으면 여왕이 된다.',
  'piece.archer.name': '궁수',
  'piece.archer.text':
    '어느 방향으로든 한 칸 움직이지만 그렇게는 잡지 못한다. 대신 상하좌우로 두 칸 떨어진 상대를 쏘아 잡는다. 궁수 바로 옆에 붙어 있는 우리 편은 잡히지 않는다.',

  // --- special squares ---
  'square.bomb.name': '폭탄칸',
  'square.bomb.text': '이 칸에 들어온 기물은 편을 가리지 않고 그 자리에서 사라진다.',
  'square.portal.name': '차원문',
  'square.portal.text': '이 칸에 들어온 기물은 짝이 되는 차원문으로 곧장 날아간다.',
  'square.shrine.name': '신전',
  'square.shrine.text': '이 칸에 들어온 병사는 그 자리에서 여왕이 된다.',
  'square.sanctuary.name': '성역',
  'square.sanctuary.text': '이 칸에 서 있는 기물은 상대가 잡을 수 없다.',
  'square.mire.name': '수렁',
  'square.mire.text': '이 칸에 들어온 기물은 두 번의 차례 동안 발이 묶인다.',

  // --- rule cards ---
  'rule.king-of-the-hill.name': '언덕의 왕',
  'rule.king-of-the-hill.text': '상대 기물이 여덟 이하로 줄어든 뒤, 내 왕이 가운데 네 칸 중 하나에 서 있는 채로 턴이 끝나면 그 즉시 이긴다.',
  'rule.three-check.name': '삼세판 체크',
  'rule.three-check.text': '상대 왕을 세 번 체크하면 그 즉시 이긴다. 잡지 않아도 된다.',
  'rule.sudden-death.name': '전멸전',
  'rule.sudden-death.text': '상대 기물이 두 개 이하로 줄어들면 그 즉시 이긴다.',
  'rule.fast-promotion.name': '빠른 승격',
  'rule.fast-promotion.text': '내 병사가 끝줄 바로 앞까지만 가도 여왕이 된다.',
  'rule.royal-bodyguard.name': '왕의 호위',
  'rule.royal-bodyguard.text': '왕 바로 옆에 붙어 있는 기물은 잡히지 않는다. 양쪽 모두에게 적용된다.',
  'rule.last-stand.name': '최후의 저항',
  'rule.last-stand.text': '내 기물이 셋 이하로 줄어들면, 내 왕이 여왕처럼 쭉 움직일 수 있다.',
  'rule.conscription.name': '징집령',
  'rule.conscription.text': '내 기물이 셋 이하일 때 턴이 끝나면, 내 뒷줄 빈 칸에 병사가 한 명 나타난다.',
  'rule.blood-toll.name': '피의 대가',
  'rule.blood-toll.text': '기물을 잡은 기물도 함께 사라진다. 함부로 잡을 수 없게 된다.',
  'rule.blitz.name': '속결',
  'rule.blitz.text': '상대를 두 번 체크하면 그 즉시 이긴다.',
  'rule.knights-honour.name': '기사의 명예',
  'rule.knights-honour.text': '모든 기사가 ㄱ자 대신 아무 방향으로 한 칸 움직일 수도 있다.',
  'rule.duel.name': '결투',
  'rule.duel.text': '상대 기물이 여덟 이하로 줄면 그 즉시 이긴다.',

  // --- skill cards ---
  'skill.teleport.name': '순간이동',
  'skill.teleport.text': '우리 편 기물 하나를 아무 빈 칸으로 옮긴다.',
  'skill.swap.name': '자리바꿈',
  'skill.swap.text': '우리 편 기물 둘의 자리를 서로 맞바꾼다.',
  'skill.revive.name': '부활',
  'skill.revive.text': '잃었던 내 기물 하나를 뒷줄 빈 칸에 되살린다. 왕과 여왕은 돌아오지 않는다.',
  'skill.freeze.name': '결박',
  'skill.freeze.text': '상대 기물 하나를 두 번의 차례 동안 꽁꽁 묶어 둔다.',
  'skill.snare.name': '올가미',
  'skill.snare.text': '상대 기물 하나를 한 번의 차례 동안 묶어 둔다. 값이 싸다.',
  'skill.coronation.name': '대관식',
  'skill.coronation.text': '내 병사 하나를 그 자리에서 곧바로 여왕으로 만든다.',
  'skill.knight-leap.name': '기사의 도약',
  'skill.knight-leap.text': '우리 편 기물 하나가 잠시 기사처럼 ㄱ자로 뛸 수 있게 된다.',
  'skill.charge.name': '돌진 나팔',
  'skill.charge.text': '내 병사 전부가 잠시 앞으로 두 칸까지 갈 수 있게 된다.',
  'skill.bulwark.name': '방벽',
  'skill.bulwark.text': '우리 편 기물 하나가 잠시 아무에게도 잡히지 않는다.',
  'skill.shackle.name': '족쇄',
  'skill.shackle.text': '상대 기물 하나가 잠시 한 발짝도 움직이지 못한다.',
  'skill.recall.name': '귀환',
  'skill.recall.text': '우리 편 기물 하나를 내 뒷줄 빈 칸으로 불러들인다.',
  'skill.shove.name': '밀치기',
  'skill.shove.text': '상대 기물 하나를 자기 진영 쪽으로 한 칸 밀어낸다.',
  'skill.recruit.name': '징집',
  'skill.recruit.text': '내 뒷줄 빈 칸에 새 병사를 한 명 세운다.',
  'skill.volley.name': '일제사격',
  'skill.volley.text': '상대 기물 하나를 그 자리에서 없앤다.',
  'skill.sacrifice.name': '희생',
  'skill.sacrifice.text': '내 기물 하나를 버리는 대신, 상대 기물 하나를 없앤다.',

  // --- boards and presets ---
  'board.los-alamos.name': '로스앨러모스 6x6',
  'board.gate6a.name': '검증용 보드',
  'board.slice.name': '봉화 보드',
  'preset.default.name': '기본 변형 체스',
  'preset.gate6a.name': '검증용 구성',
  'preset.slice.name': '봉화 쟁탈전',

  // --- slice-only content (Phase 3 harness) ---
  'square.beacon.name': '봉화대',
  'square.beacon.text': '이 칸에 들어온 기물은 곧바로 d4로 날아간다.',
  'rule.beacon-rush.name': '봉화 쟁탈전',
  'rule.beacon-rush.text': '내 기물이 d4에 서 있는 채로 턴이 끝나면 그 즉시 이긴다.',
  'skill.warp.name': '차원 도약',
  'skill.warp.text': '우리 편 기물 하나를 빈 칸으로 옮긴다.',
  'skill.hold.name': '붙잡기',
  'skill.hold.text': '상대 기물 하나를 두 번의 차례 동안 묶어 둔다.',
  'skill.rally.name': '증원',
  'skill.rally.text': '빈 칸에 우리 편 궁수를 한 명 불러낸다.',
  'skill.ascend.name': '대관식 (봉화)',
  'skill.ascend.text': '우리 편 기물 하나를 왕으로 세운다. 잃으면 안 되는 기물이 둘이 된다.',

  // --- UI chrome (PLAN Phase 1) ---
  // The app's own words, kept here rather than in the components for the same
  // reason the cards' words are: a translator should own one file, not grep
  // through JSX. Wording target is the same as the content bundle — 초·중학생,
  // short, and naming the action rather than the widget.
  'ui.app.title': '이상한 체스',
  'ui.tab.play': '놀기',
  'ui.tab.edit': '만들기',
  'ui.preset.label': '놀이 고르기',
  'ui.content.broken': '내용을 불러오지 못했어요.',
  'ui.action.undo': '한 수 무르기',
  'ui.status.ply': '차례',
  'ui.rule.none': '규칙 카드 없음',
  'ui.draft.prompt': '스킬 카드를 한 장 고르세요',
  'ui.tray.empty': '아직 없음',
  'ui.card.spent': '(다 씀)',
  'ui.phase.play': '두는 중',
  'ui.phase.draft': '카드 고르는 중',
  'ui.phase.result': '끝',
  // Named for the colours actually on the board. tokens.css renders the two
  // sides blue and red on purpose (a red/green pair would fail one player in
  // twelve), so '흰편/검은편' described a board nobody sees — review found the
  // localisation pass reintroducing the very mismatch the palette removed.
  'ui.side.white': '파란 편',
  'ui.side.black': '빨간 편',
  'ui.home.tagline': '친구와 번갈아 두는 이상한 체스. 판마다 규칙이 달라져요.',
  'ui.action.start-match': '놀러 가기',
  'ui.action.new-match': '새 판',
  'ui.action.rematch': '한 판 더',
  'ui.action.home': '처음으로',
  'ui.seed.label': '판 번호',
  'ui.seed.hint': '이 번호를 알려주면 똑같은 판을 다시 할 수 있어요.',
  'ui.seed.copy': '번호 복사',
  'ui.seed.copied': '복사했어요',
  'ui.seed.copy-failed': '복사할 수 없어요',
  'ui.confirm.discard': '지금 두던 판이 사라져요. 새로 시작할까요?',
  // Why the match ended. The engine's own codes are king_capture / win_action /
  // material_cap, and printing those was what a player saw before Phase 2.
  'ui.result.reason.king_capture': '왕을 잡았어요',
  'ui.result.reason.win_action': '카드로 이겼어요',
  'ui.result.reason.material_cap': '기물이 더 많아요',
  // --- rules reference (Phase 3) ---
  'ui.rules.title': '무엇이 있나요',
  'ui.rules.intro': '이 놀이에 들어 있는 것들이에요. 새로 만든 것도 여기에 바로 나와요.',
  'ui.rules.close': '닫기',
  'ui.rules.pieces': '기물',
  'ui.rules.squares': '특별한 칸',
  'ui.rules.ruleCards': '규칙 카드',
  'ui.rules.skillCards': '스킬 카드',
  'ui.rules.empty': '아직 없어요',
  'ui.action.rules': '무엇이 있나 보기',
  // --- first-visit coach marks (Phase 3) ---
  // '여기' pointed at nothing — the coach is a card beside the button, not a
  // spotlight on it — so the button is named by the label a child can read.
  'ui.coach.start': '놀이를 고른 다음 「놀러 가기」를 누르면 시작해요.',
  'ui.coach.rules': '기물이나 카드가 뭐 하는 건지 모르겠으면 언제든 여기서 볼 수 있어요.',
  'ui.coach.next': '다음',
  'ui.coach.skip': '건너뛰기',
  'ui.coach.done': '알겠어요',
  'ui.result.win': '승리',
  'ui.result.draw': '무승부',
}
