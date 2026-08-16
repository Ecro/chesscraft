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
  // The `.icon` entries are gone (Chess Craft redesign). Every bundled record
  // now carries an `artKey` into the app's own 12x12 sprite sheet, and the note
  // that used to sit on the archer is why: an emoji is drawn from a colour font
  // that ignores `color` and `font-weight`, so it inherits neither of the two
  // cues ADR-007 spends separating the armies, and both sides' archers rendered
  // identically. A sprite takes whatever tint it is handed.
  //
  // The `iconKey` axis itself stays in the schema — an author can still reach
  // for a glyph, and `resolveMark` still falls through to one.
  'piece.king.name': '왕',
  'piece.king.text': '어느 방향으로든 한 칸씩 움직인다. 왕이 잡히면 그 자리에서 게임이 끝난다.',
  'piece.queen.name': '여왕',
  'piece.queen.text': '가로, 세로, 대각선으로 원하는 만큼 쭉 간다. 가장 강한 기물이다.',
  'piece.rook.name': '성',
  'piece.rook.text': '가로와 세로로 원하는 만큼 쭉 간다.',
  'piece.knight.name': '기사',
  'piece.knight.text': 'ㄱ자로 뛴다. 사이에 기물이 있어도 넘어갈 수 있다.',
  'piece.bishop.name': '비숍',
  'piece.bishop.text': '대각선으로 원하는 만큼 쭉 간다. 한 색 칸만 계속 다닌다.',
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
  'square.shrine.text': '승격 구역에서 이 칸에 들어온 병사는 비숍이 된다.',
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
  /* Two -> four in PLAN Phase 6, matching the engine. The old number was reachable in 1% of
     matches, so the sentence promised a win route that almost never existed. */
  'rule.sudden-death.text': '상대 기물이 네 개 이하로 줄어들면 그 즉시 이긴다.',
  'rule.fast-promotion.name': '빠른 승격',
  'rule.fast-promotion.text': '내 병사가 끝줄 바로 앞까지만 가도 여왕이 된다.',
  'rule.royal-bodyguard.name': '왕의 호위',
  'rule.royal-bodyguard.text': '왕 바로 옆에 붙어 있는 기물은 잡히지 않는다. 양쪽 모두에게 적용된다.',
  'rule.last-stand.name': '최후의 저항',
  'rule.last-stand.text': '내 기물이 셋 이하로 줄어들면, 내 왕이 여왕처럼 쭉 움직일 수 있다.',
  'rule.conscription.name': '징집령',
  'rule.conscription.text': '내 기물이 셋 이하일 때 턴이 끝나면, 내 뒷줄 빈 칸에 병사가 한 명 나타난다.',
  'rule.recoil.name': '반동',
  'rule.recoil.text': '기물을 잡은 기물은 숨을 고른다. 바로 다음 자기 차례에 움직이지 못한다.',
  'rule.democracy.name': '민주주의',
  'rule.democracy.text': '나라를 지탱하는 건 왕이 아니라 병사다. 병사를 모두 잃은 쪽이 진다.',
  'rule.blitz.name': '속결',
  'rule.blitz.text': '상대를 두 번 체크하면 그 즉시 이긴다.',
  'rule.knights-honour.name': '기사의 명예',
  'rule.knights-honour.text': '모든 기사가 ㄱ자 대신 아무 방향으로 한 칸 움직일 수도 있다.',
  'rule.duel.name': '결투',
  'rule.duel.text': '상대 기물이 여덟 이하로 줄면 그 즉시 이긴다.',

  // --- skill cards ---
  'skill.teleport.name': '순간이동',
  'skill.teleport.text': '왕이 아닌 우리 기물을 우리 진영의 빈 칸으로 옮기고, 다음 차례에는 움직일 수 없다.',
  'skill.swap.name': '자리바꿈',
  'skill.swap.text': '우리 편 기물 둘의 자리를 서로 맞바꾼다.',
  'skill.revive.name': '부활',
  'skill.revive.text': '잃었던 내 기물 하나를 뒷줄 빈 칸에 되살린다. 왕과 여왕은 돌아오지 않는다.',
  'skill.freeze.name': '결박',
  'skill.freeze.text': '상대 기물 하나를 두 번의 차례 동안 꽁꽁 묶어 둔다.',
  'skill.snare.name': '올가미',
  'skill.snare.text': '상대 기물 하나를 한 번의 차례 동안 묶어 둔다. 값이 싸다.',
  'skill.coronation.name': '대관식',
  'skill.coronation.text': '승격 구역에 있는 내 병사 하나를 그 자리에서 여왕으로 만든다.',
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
  'skill.volley.text': '상대 왕과 여왕을 제외한 기물 하나를 그 자리에서 없앤다.',
  'skill.sacrifice.name': '희생',
  'skill.sacrifice.text': '왕이 아닌 내 기물을 버리는 대신, 바로 옆의 왕·여왕이 아닌 상대 기물을 없앤다.',

  // --- expansion pieces (PLAN-preset-content-expansion) ---
  'piece.lancer.name': '창기병',
  'piece.lancer.text': '대각선으로 최대 두 칸까지 미끄러진다. 주교와 달리 판을 한 번에 가로지르지는 못한다.',
  'piece.marksman.name': '사수',
  'piece.marksman.text': '상하좌우로 한 칸 움직이지만 그렇게는 잡지 못한다. 대각선으로 두 칸 떨어진 상대를 쏘아 잡는다.',
  'piece.charger.name': '돌격기병',
  'piece.charger.text': '앞으로만 최대 세 칸까지 달린다. 잡을 때는 대각선 앞 한 칸으로 간다. 물러설 수 없다.',
  'piece.warden.name': '수문장',
  'piece.warden.text': '상하좌우로 최대 두 칸 미끄러진다. 수문장 바로 옆에 붙어 있는 우리 편은 잡히지 않는다.',
  'piece.acolyte.name': '시종',
  'piece.acolyte.text': '대각선으로 한 칸 간다. 끝줄에 닿으면 여왕이 아니라 성이 된다.',
  'piece.shade.name': '그림자',
  'piece.shade.text': '기사보다 한 칸 더 긴 ㄱ자로 뛴다. 그래서 늘 다른 색 칸에 내려앉는다.',

  // --- expansion squares ---
  'square.geyser.name': '분출구',
  'square.geyser.text': '이 칸에 들어온 기물은 제 진영 끝줄에 빈 칸이 있으면 그리로 되돌려 보내진다. 끝줄이 가득 차 있으면 아무 일도 일어나지 않는다.',
  'square.thorns.name': '가시밭',
  'square.thorns.text': '이 칸에 들어온 병사는 사라진다. 병사가 아닌 기물은 아무렇지 않다.',
  'square.mist.name': '안개',
  'square.mist.text': '이 칸에 들어온 기물은 세 수 동안 잡히지 않는다.',
  'square.springboard.name': '발판',
  'square.springboard.text': '이 칸에 서 있는 동안에는 기사처럼 ㄱ자로도 뛸 수 있다. 칸을 벗어나면 원래대로 돌아간다.',
  'square.levy.name': '징병소',
  // The inert branch is in the text on purpose — the `square.geyser` lesson.
  'square.levy.text': '이 칸을 밟으면 내 끝줄 빈 칸에 병사가 하나 나타난다. 끝줄이 가득 차 있으면 아무 일도 일어나지 않는다.',
  'square.altar.name': '제단',
  'square.altar.text': '이 칸에 들어온 기물은 무엇이든 기사가 된다. 병사에게는 이득이지만 여왕에게는 손해다.',
  'square.pit.name': '구덩이',
  'square.pit.text': '이 칸에 들어온 기물은 두 수 동안 움직일 수 없다.',
  'square.spikes.name': '창 바닥',
  'square.spikes.text': '병사가 이 칸에 들어오면 사라진다. 다른 기물은 지나갈 수 있다.',
  'square.water.name': '얕은 물',
  'square.water.text': '이 칸에 서 있는 동안에는 대각선으로 한 칸도 움직일 수 있다.',
  'square.brambles.name': '덤불',
  'square.brambles.text': '이 칸에 들어온 기물은 한 수 동안 발이 묶인다.',
  'square.rune.name': '이동 룬',
  'square.rune.text': '이 칸에 서 있는 동안에는 대각선으로 최대 두 칸까지 간다.',
  'square.ember.name': '불씨',
  'square.ember.text': '이 칸에 들어온 기물은 두 수 동안 잡히지 않는다.',

  // --- expansion rule cards ---
  'rule.beacon.name': '봉화',
  'rule.beacon.text': '내 왕이 상대 끝줄에 닿은 채로 턴이 끝나면 그 즉시 이긴다.',
  'rule.tribute.name': '공물',
  'rule.tribute.text': '무언가를 잡을 때마다 내 끝줄에 병사가 하나 새로 선다.',
  'rule.eclipse.name': '월식',
  'rule.eclipse.text': '양쪽 여왕 모두 제자리에서 움직이지 못한다.',
  'rule.oath.name': '서약',
  'rule.oath.text': '양쪽 병사 모두 잡히지 않는다.',
  'rule.siege.name': '공성',
  'rule.siege.text': '양쪽 성이 대각선으로도 미끄러진다.',
  'rule.harvest.name': '수확',
  'rule.harvest.text': '내 병사가 중앙 네 칸 중 하나에 선 채로 턴이 끝나면 그 자리에서 기사가 된다.',
  'rule.march.name': '전진 명령',
  'rule.march.text': '양쪽 병사는 잡을 때는 그대로지만, 움직일 때는 앞으로 두 칸까지 갈 수 있다.',
  'rule.steadfast.name': '굳건한 방패',
  'rule.steadfast.text': '양쪽 왕 바로 옆의 아군 기물은 상대에게 잡히지 않는다.',
  'rule.scarcity.name': '고갈',
  'rule.scarcity.text': '상대 기물이 다섯 개 이하로 줄어든 뒤 턴을 끝내면 그 즉시 이긴다.',
  'rule.diagonal-court.name': '대각 법정',
  'rule.diagonal-court.text': '비숍은 가로와 세로로도 한 칸 움직일 수 있다.',
  'rule.fallen-banner.name': '쓰러진 깃발',
  'rule.fallen-banner.text': '기물을 잡은 기물은 다음 자기 차례에 한 번 쉬어야 한다.',
  'rule.heartland.name': '고향의 부름',
  'rule.heartland.text': '내 기물이 셋 이하라면 턴이 끝날 때 뒷줄 빈 칸에 병사가 나타난다.',

  // --- expansion skill cards ---
  'skill.leash.name': '결박',
  'skill.leash.text': '고른 상대 기물이 세 수 동안 움직이지 못한다. 잡히지 않는 것은 아니다.',
  'skill.blink.name': '순보',
  'skill.blink.text': '고른 내 기물이 세 수 동안 상하좌우로 두 칸을 뛰어넘을 수 있다. 사이에 무엇이 있어도 상관없다.',
  'skill.mend.name': '수선',
  'skill.mend.text': '잃은 기물 하나를 내 끝줄에 되살린다. 왕과 여왕과 성은 돌아오지 않는다.',
  'skill.quake.name': '지진',
  'skill.quake.text': '왕이 아닌 상대 기물을 고른 자리 주변의 빈 칸으로 던진다. 도착 뒤의 자동 보호는 없다.',
  'skill.veil.name': '장막',
  'skill.veil.text': '고른 내 기물이 세 수 동안 잡히지 않는다.',
  'skill.dart.name': '표창',
  'skill.dart.text': '고른 내 기물이 세 수 동안 대각선 두 칸을 뛰어넘을 수 있다.',
  'skill.tide.name': '밀물',
  'skill.tide.text': '고른 내 기물이 세 수 동안 상하좌우로 두 칸까지 미끄러진다.',
  'skill.brand.name': '각인',
  'skill.brand.text': '고른 내 병사를 창기병으로 바꾼다.',
  'skill.echo.name': '메아리',
  'skill.echo.text': '내 끝줄에 병사를 하나 새로 세운다.',
  'skill.scout.name': '정찰',
  'skill.scout.text': '왕이 아닌 내 기물 하나가 두 수 동안 기사처럼 뛸 수 있다.',
  'skill.guard.name': '호위',
  'skill.guard.text': '왕이 아닌 내 기물 하나가 두 수 동안 잡히지 않는다.',
  'skill.hinder.name': '방해',
  'skill.hinder.text': '왕이 아닌 상대 기물 하나를 두 수 동안 움직이지 못하게 한다.',
  'skill.reinforce.name': '집결',
  'skill.reinforce.text': '내 뒷줄에 빈 칸이 있으면 그곳에 병사 하나를 세운다.',
  'skill.sprint.name': '질주',
  'skill.sprint.text': '왕이 아닌 내 기물 하나가 두 수 동안 가로세로 두 칸까지 간다.',
  'skill.bridge.name': '가교',
  'skill.bridge.text': '왕이 아닌 내 기물 하나가 두 수 동안 가로세로 두 칸까지 건너간다.',
  'skill.anchor.name': '닻',
  'skill.anchor.text': '왕이 아닌 상대 기물 하나를 두 수 동안 얼려 둔다.',
  'skill.ward.name': '수호막',
  'skill.ward.text': '왕이 아닌 내 기물 하나가 세 수 동안 잡히지 않는다.',
  'skill.salve.name': '응급 치료',
  'skill.salve.text': '잃은 기물 하나를 뒷줄에 되살린다. 왕과 여왕과 성은 돌아오지 않는다.',
  'skill.courier.name': '전령',
  'skill.courier.text': '왕이 아닌 내 기물 하나를 내 진영의 빈 칸으로 옮긴다. 다음 차례에는 움직일 수 없다.',
  'skill.feint.name': '허위 기동',
  'skill.feint.text': '왕과 여왕을 제외한 우리 기물 둘의 자리를 맞바꾼다.',
  'skill.surge.name': '파도타기',
  'skill.surge.text': '내 병사들이 두 수 동안 대각선으로 한 칸 움직일 수 있다.',
  'ui.card.awarded.by': '{name}에게 새 스킬이 도착했다',

  // --- boards and presets ---
  'board.los-alamos.name': '로스앨러모스 6x6',
  'board.grand.name': '대전장 8x8',
  'board.frontier.name': '변경의 전선 10x10',
  'board.colossus.name': '거인들의 벌판 12x12',
  'board.gate6a.name': '검증용 보드',
  'board.slice.name': '봉화 보드',
  'preset.default.name': '기본 변형 체스',
  'preset.grand.name': '대전장 8x8',
  'preset.frontier.name': '변경의 전선 10x10',
  'preset.colossus.name': '거인들의 벌판 12x12',
  'board.bastion.name': '성채 6x6',
  'board.cavalry.name': '기병대 6x6',
  'board.covenant.name': '서약의 땅 6x6',
  'preset.bastion.name': '성채 농성전',
  'preset.cavalry.name': '기병 돌격전',
  'preset.covenant.name': '서약의 땅',
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
  'ui.content.broken': '내용을 불러오지 못했어요.',
  // The reachable failure, as opposed to the one above: the app started fine on
  // the shipped set, but the child's own saved content did not load and without
  // this they would just find their work missing.
  'ui.content.notice.title': '저장한 내용을 불러오지 못했어요',
  'ui.content.notice.body': '기본 놀이로 시작했어요. 만들기에서 다시 불러오거나 새로 만들 수 있어요.',
  'ui.content.notice.dismiss': '알겠어요',
  'ui.content.notice.open-editor': '만들기 열기',
  'ui.update.title': '새 버전이 준비됐어요',
  'ui.update.body': '지금 받으면 화면이 한 번 새로고침돼요. 두던 판이 있으면 끝내고 눌러요.',
  'ui.update.apply': '지금 받기',
  'ui.update.later': '나중에',
  'ui.action.undo': '한 수 무르기',
  'ui.action.settings': '소리·진동',
  'ui.status.ply': '차례',
  'ui.status.turn': '둘 차례',
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
  // '소리 끔' read as either "sound is off" or "turn sound off" — the classic
  // toggle ambiguity, and for this audience the wrong reading means tapping and
  // hearing nothing happen. The colon makes it a status, unambiguously.
  'ui.sound.on': '소리: 켜짐',
  'ui.sound.off': '소리: 꺼짐',
  'ui.haptics.on': '진동: 켜짐',
  'ui.haptics.off': '진동: 꺼짐',
  'ui.action.flip': '보드 돌리기',
  'ui.board.label': '체스판',
  'ui.board.empty': '빈 칸',
  'ui.board.reachable': '갈 수 있음',
  'ui.board.in-check': '왕이 체크 상태',
  'ui.check.warning': '{name}의 왕이 체크됐어요! 안전한 곳으로 움직이세요.',
  'ui.check.both': '두 왕이 동시에 위험해요!',
  'ui.capture.king-caught': '왕이 잡혔어요!',
  'ui.capture.move': '{attacker}의 {action}이(가) {from}에서 {to}로 움직여 {captured}을(를) 잡았어요.',
  'ui.capture.card': '{attacker}가 {action}을(를) 사용해 {captured}을(를) 없앴어요.',
  'ui.capture.result-next': '마지막 수를 확인한 뒤 결과를 보여줄게요.',
  'ui.piece.unknown': '기물',
  'ui.card.unknown': '스킬',
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
  'ui.rules.intro': '왕은 스킬의 영향을 받지 않아요. 일부 스킬로 새로 열린 왕 포획은 같은 차례에 할 수 없어요. 새로 만든 것도 여기에 바로 나와요.',
  'ui.rules.close': '닫기',
  'ui.rules.pieces': '기물',
  'ui.rules.squares': '특별한 칸',
  'ui.rules.ruleCards': '규칙 카드',
  'ui.rules.skillCards': '스킬 카드',
  'ui.rules.empty': '아직 없어요',
  'ui.result.win': '승리',
  'ui.result.draw': '무승부',

  // --- the editor (PLAN Phase 9a, RESEARCH #39) ---
  // The editor spoke schema until this phase: its labels were `kind`,
  // `nameKey`, `pieceIds`. Those are words from the document FORMAT, and the
  // document format is not something a nine-year-old agreed to learn. The
  // wording target is the same as the rest of the bundle — name the thing the
  // child is doing, not the field it lands in.
  //
  // A `preset` is called 방 everywhere here, because that is what it is: the
  // room you assemble, keep and play in. `ui.preset.label` used to say
  // 놀이 고르기 on the home screen, which reads as "choose a different game" —
  // what it actually selects is one configuration of the same game.
  'ui.room.label': '어느 방에서 놀까요',
  'ui.editor.tab.rooms': '내 방',
  'ui.editor.tab.library': '재료 창고',
  'ui.editor.transfer.legend': '주고받기',
  'ui.editor.transfer.export': '내 것 꺼내기',
  'ui.editor.transfer.import': '받은 것 넣기',
  'ui.editor.transfer.hint': '아래 글자를 복사해서 친구에게 보내면, 친구도 똑같이 만들 수 있어요.',
  'ui.editor.transfer.reset': '처음 상태로 되돌리기',
  'ui.editor.transfer.reset-confirm':
    '이 기기에 저장한 내가 만든 것이 모두 사라지고, 처음 들어 있던 방과 조각만 남아요. 되돌릴 수 없어요. 남기고 싶으면 먼저 「내 것 꺼내기」로 글자를 복사해 두세요. 그래도 되돌릴까요?',
  'ui.editor.transfer.reset-done': '처음 상태로 되돌렸어요.',

  'ui.editor.rooms.title': '내가 만든 방',
  'ui.editor.rooms.intro': '방마다 판과 기물, 나오는 카드가 달라요. 하나 골라서 고치거나 새로 만들어요.',
  'ui.editor.rooms.new': '새 방 만들기',
  'ui.editor.rooms.empty': '아직 만든 방이 없어요.',
  'ui.editor.room.unnamed': '이름 없는 방',
  'ui.editor.room.name': '방 이름',
  'ui.editor.room.name-hint': '한글로 마음대로 지어요. 놀러 갈 때 이 이름이 보여요.',
  'ui.editor.room.board': '어떤 판에서 놀까요',
  'ui.editor.room.pieces': '이 방에 넣을 기물',
  'ui.editor.room.rules': '이 방에서 나올 규칙 카드',
  'ui.editor.room.skills': '이 방에서 나올 스킬 카드',
  'ui.editor.room.new-piece': '새 기물 만들기',
  'ui.editor.room.new-rule': '새 규칙 카드 만들기',
  'ui.editor.room.new-skill': '새 스킬 카드 만들기',
  'ui.editor.room.loadout': '내 기물과 내 스킬',
  'ui.lobby.loadout-measuring': '가져갈 기물과 스킬의 세기를 아직 세는 중이에요. 잠깐만요.',
  'ui.lobby.loadout-refused': '가져갈 기물과 스킬이 이 방의 규칙에 맞지 않아요. 방을 열어 다시 골라 주세요.',
  'ui.lobby.loadout-unscaled': '이 방은 세기를 재는 기준을 아직 안 정했어요. 방을 열어 기물과 스킬을 다시 골라 주세요.',
  'ui.editor.loadout.side-white': '흰쪽',
  'ui.editor.loadout.side-black': '검은쪽',
  'ui.editor.loadout.piece': '내가 데려갈 기물',
  'ui.editor.loadout.replaces': '대신 빠질 기물',
  'ui.editor.loadout.skill': '내가 가져갈 스킬 카드',
  'ui.editor.loadout.none': '안 가져가요',
  'ui.editor.loadout.measuring': '세는 중…',
  'ui.editor.loadout.unmeasurable': '셀 수 없었어요',
  'ui.editor.loadout.grade': '{stars}',
  'ui.editor.loadout.too-strong': '이건 이 방에 데려가기엔 너무 세요. 조금 약하게 고쳐 주세요.',
  'ui.editor.loadout.budget': '별 {spent} / {budget} 만큼 썼어요',
  'ui.editor.loadout.no-cards': '이 방은 스킬 카드를 모두 함께 나눠 써요. 내 것으로 가져가려면 위에서 새 스킬 카드를 만들거나, 카드 하나를 함께 쓰는 목록에서 빼 주세요.',
  'ui.editor.loadout.no-budget': '이 방은 아직 한도를 안 정했어요.',
  'ui.editor.loadout.mismatch': '별 개수가 다른 기물끼리는 바꿔 넣을 수 없어요. 같은 별끼리만 돼요.',
  'ui.editor.loadout.over-budget': '둘을 합치면 한도를 넘어요. 하나를 더 약한 걸로 바꿔 보세요.',
  /*
   * Rewritten in PLAN Phase 9. It used to read "세기는 컴퓨터가 아무렇게나 두는 대국을 여러 번
   * 해 보고 잰 값이에요" — a description of the self-play measurement rig that ADR-012 deleted.
   * The price is read off the declaration now, so that sentence was telling a player something
   * about the product that had stopped being true, and it sat directly under the term-by-term
   * arithmetic this phase added, contradicting it. Same class as
   * `[fail:design] comment-claims-unbuilt-safeguard`, one layer out: player-facing text
   * outliving the mechanism it describes.
   */
  'ui.editor.loadout.caveat': '이 값은 기물이 할 수 있는 일을 보고 셈한 거예요. 사람이 잘 쓰면 더 셀 수 있어요.',
  'ui.editor.room.save': '이 방 저장하기',
  'ui.editor.room.saved': '저장했어요',
  'ui.editor.room.back': '방 목록으로',
  // The guard the schema's `.min(1)` cannot explain to a child: a room with no
  // pieces is a document that will not load, and the validator's word for that
  // is `pieceIds`, which helps nobody.
  'ui.editor.room.last-piece': '기물이 하나도 없는 방은 만들 수 없어요. 다른 기물을 먼저 넣어 주세요.',

  'ui.editor.library.title': '재료 창고',
  'ui.editor.library.intro': '만든 것이 모두 여기 있어요. 하나를 고르면 고칠 수 있어요.',
  'ui.editor.library.kind': '무엇을 볼까요',
  'ui.editor.library.empty': '아직 없어요.',
  // What an open screen says when the thing it is showing is gone. 9a answered
  // the SAVE half of that question (refuse, and say the document moved); these
  // are the display half, so the child is told at the moment it happens rather
  // than by a staleness error on their next save.
  'ui.editor.form.deleted': '이건 지워졌어요. 여기서 고친 건 저장되지 않아요.',
  'ui.editor.room.deleted': '이 방은 지워졌어요. 방 목록으로 돌아가 주세요.',
  'ui.editor.room.missing-entry': '지워진 것',
  'ui.editor.delete.label': '지우기',
  // Official content is tucked away, not destroyed (ADR-004). Different word
  // from 지우기 on purpose: the two controls do different things to the child's
  // work, and one word for both would make that invisible.
  'ui.home.manage-rooms': '방 정리하기',
  'ui.editor.hide.label': '숨기기',
  'ui.editor.hide.restore-legend': '숨긴 것 되돌리기',
  'ui.editor.hide.restore-hint': '숨긴 것은 없어지지 않아요. 누르면 다시 나와요.',
  'ui.editor.hide.restore-unknown': '지금은 없는 것',
  // Two headings rather than a per-item badge (interview round 2, Q6). A child
  // reads a heading; a badge has to be decoded. Generic across all six kinds —
  // the list already says which kind you are looking at.
  'ui.editor.section.official': '처음부터 들어 있는 것',
  'ui.editor.section.authored': '내가 만든 것',
  'ui.editor.section.official-empty': '지금은 하나도 없어요.',
  'ui.editor.section.authored-empty': '아직 만든 게 없어요.',
  'ui.editor.delete.authored': '이건 내가 만든 거예요. 숨기는 대신 지울 수 있어요.',
  'ui.editor.delete.confirm': '정말 지울까요? 되돌릴 수 없어요.',
  // Names the rooms, because the room is the thing the child can go and
  // change. "참조되고 있습니다" is true and tells them nothing.
  'ui.editor.delete.referenced': '이 방들이 쓰고 있어서 지울 수 없어요:',
  'ui.editor.delete.last-room': '방이 하나뿐이에요. 마지막 방은 지울 수 없어요.',
  'ui.editor.delete.missing': '이미 없어졌어요.',
  'ui.editor.delete.invalid': '이걸 지우면 다른 것이 망가져서 놀이가 안 열려요.',
  'ui.editor.library.unused': '어느 방에도 안 들어감',

  'ui.editor.kind.piece': '기물',
  'ui.editor.kind.squareType': '특별한 칸',
  'ui.editor.kind.ruleCard': '규칙 카드',
  'ui.editor.kind.skillCard': '스킬 카드',
  'ui.editor.kind.board': '판',
  'ui.editor.kind.preset': '방',

  // What a record is called when its name will not resolve (ADR-002). The id
  // used to be shown here, which is developer output. Same vocabulary as
  // `ui.editor.kind.*` above, so the two never drift into different words for
  // the same thing.
  'ui.record.unnamed.piece': '이름 없는 기물',
  'ui.record.unnamed.squareType': '이름 없는 칸',
  'ui.record.unnamed.ruleCard': '이름 없는 규칙 카드',
  'ui.record.unnamed.skillCard': '이름 없는 스킬 카드',
  'ui.record.unnamed.board': '이름 없는 판',
  'ui.record.unnamed.preset': '이름 없는 방',

  'ui.editor.form.new': '새로 만들기',
  'ui.editor.form.summary': '지금 만드는 것',
  'ui.editor.form.summary-empty': '아직 아무것도 정하지 않았어요.',
  'ui.editor.form.save': '저장하기',
  'ui.editor.form.saved': '저장했어요',
  'ui.editor.form.close': '닫기',
  'ui.editor.form.errors': '아직 저장할 수 없어요',
  // The document moved under an open form — after an import, or after the
  // other tab saved the same thing. Naming both causes, because the child
  // did one of them a moment ago and will recognise it.
  'ui.editor.form.stale': '이 사이에 내용이 바뀌었어요. 방금 받은 것을 덮어쓰지 않으려고 저장을 멈췄어요. 다시 열어서 고쳐 주세요.',
  // Clearing a name means "cancel the name I gave it", and what shows then is
  // whatever came in the box. A thing nobody else ever named has nothing to
  // fall back to, so the editor asks for a name instead of showing its key.
  'ui.editor.form.discard-confirm': '만들던 것이 아직 저장되지 않았어요. 그냥 두고 새로 만들까요?',
  'ui.editor.form.name-needed': '이건 이름이 꼭 있어야 해요. 지우면 부를 이름이 없어져요.',
  'ui.editor.field.id': '구분 이름표',
  'ui.editor.field.id-hint': '영어와 점으로 짧게 써요. 예: piece.rabbit',
  'ui.editor.field.name': '이름',
  'ui.editor.field.text': '설명',
  'ui.editor.field.cost': '값',
  'ui.editor.field.uses': '쓸 수 있는 횟수',
  'ui.editor.field.royal-follow-up': '카드 뒤 왕 포획',
  'ui.editor.royal-follow-up.preserve': '그대로 허용',
  'ui.editor.royal-follow-up.preserve-existing': '카드 전부터 가능했던 포획만',
  'ui.editor.field.protect-relocated': '옮긴 기물을 이번 차례 동안 보호',
  'ui.editor.field.lock-relocated': '옮긴 기물은 이번 차례에 못 움직임',
  'ui.editor.field.paired': '짝이 있는 칸',
  'ui.editor.field.royal': '잃으면 지는 기물',
  'ui.editor.field.promotion-rank': '몇 번째 줄에서 승급하나요',
  'ui.editor.field.promotion-to': '무엇으로 승급하나요',

  'ui.editor.board.width': '가로 칸 수',
  'ui.editor.board.height': '세로 칸 수',
  'ui.editor.board.territory-depth': '진영 깊이',
  'ui.editor.board.promotion-depth': '승급 구역 깊이',
  'ui.editor.board.pair-hint': '이 칸과 이어질 칸을 하나 더 골라요.',
  'ui.editor.board.none': '고르지 않음',
  'ui.editor.storage.saved': '이 기기에 저장했어요.',
  'ui.editor.storage.unavailable': '이 브라우저에는 저장할 수 없어요. 「내 것 꺼내기」로 글자를 복사해 두세요.',

  'ui.editor.param.duration': '몇 차례 동안',
  'ui.editor.param.plies': '몇 수 동안',
  'ui.editor.param.to': '무엇으로',
  'ui.editor.param.pieceId': '어떤 기물',
  'ui.editor.param.side': '어느 편',
  'ui.editor.param.square': '어떤 칸',
  'ui.editor.param.df': '옆으로 몇 칸',
  'ui.editor.param.dr': '앞으로 몇 칸',
  'ui.editor.param.forward': '편에 따라 앞뒤가 바뀌어요',
  'ui.editor.param.except': '되살리지 않을 기물',
  'ui.editor.param.pattern': '주는 움직임',
  'ui.editor.param.squares': '어떤 칸들',
  'ui.editor.param.n': '몇 개',
  'ui.editor.param.any': '아무나',
  'ui.editor.param.target-filter': '고른 기물 제한',
  'ui.editor.param.relation': '앞서 고른 기물과의 관계',
  'ui.editor.param.destination-region': '도착 지역 제한',

  // The vocabulary palette. These are the ADR-006 buttons, whose labels were
  // the raw grammar words (`teleport_piece`, `piece_count_at_most`). The
  // control ids are unchanged — only what is printed on them.
  'ui.editor.vocab.trigger.generate_moves': '갈 곳을 찾을 때',
  'ui.editor.vocab.trigger.on_enter': '칸에 들어올 때',
  'ui.editor.vocab.trigger.on_leave': '칸에서 나갈 때',
  'ui.editor.vocab.trigger.on_capture': '잡을 때',
  'ui.editor.vocab.trigger.on_promote': '승급할 때',
  'ui.editor.vocab.trigger.on_remove': '없어질 때',
  'ui.editor.vocab.trigger.end_of_ply': '한 수가 끝날 때',
  'ui.editor.vocab.trigger.on_play': '카드를 낼 때',
  'ui.editor.vocab.target.self': '자기 자신',
  'ui.editor.vocab.target.mover': '둔 쪽 기물',
  'ui.editor.vocab.target.entering': '들어온 기물',
  'ui.editor.vocab.target.occupant': '그 칸에 있던 기물',
  'ui.editor.vocab.target.adjacent_friendly': '옆에 있는 우리 편',
  'ui.editor.vocab.target.chosen_friendly': '고른 우리 편',
  'ui.editor.vocab.target.chosen_enemy': '고른 상대 편',
  'ui.editor.vocab.targetFilter.non_royal': '왕이 아닌 기물만',
  'ui.editor.vocab.targetFilter.exclude_piece_ids': '이 기물은 빼기',
  'ui.editor.vocab.targetFilter.allowed_piece_ids': '이 기물만 허용',
  'ui.editor.vocab.relation.adjacent_to_choice': '앞서 고른 기물 옆',
  'ui.editor.vocab.destination.paired_square': '짝이 된 칸',
  'ui.editor.vocab.destination.chosen_empty': '고른 빈 칸',
  'ui.editor.vocab.destination.square': '정해진 칸',
  'ui.editor.vocab.destination.own_back_rank': '우리 편 맨 뒷줄',
  'ui.editor.vocab.destination.offset': '몇 칸 떨어진 곳',
  'ui.editor.vocab.destinationRegion.any': '어디든',
  'ui.editor.vocab.destinationRegion.own_territory': '우리 진영 안',
  'ui.editor.vocab.destinationRegion.opponent_territory': '상대 진영 안',
  'ui.editor.vocab.destinationRegion.local': '현재 지역 안',
  'ui.editor.vocab.condition.always': '언제나',
  'ui.editor.vocab.condition.piece_is': '이 기물이면',
  'ui.editor.vocab.condition.piece_side': '이 편이면',
  'ui.editor.vocab.condition.in_promotion_zone': '승급 구역에 있으면',
  'ui.editor.vocab.condition.on_square': '이 칸에 있으면',
  'ui.editor.vocab.condition.on_own_rank': '자기 진영에서 몇 번째 줄에 있으면',
  'ui.editor.vocab.condition.check_count_at_least': '왕이 몇 번 넘게 위험했으면',
  // The two counts sit next to each other in the picker, so the labels have to
  // do the disambiguating: "기물이" (any piece) vs "이 기물이" (this kind).
  'ui.editor.vocab.condition.piece_count_at_most': '기물이 모두 몇 개 아래면',
  'ui.editor.vocab.condition.piece_kind_count_at_most': '이 기물이 몇 개 아래면',
  'ui.editor.vocab.condition.not': '반대면',
  'ui.editor.vocab.condition.all': '모두 맞으면',
  'ui.editor.vocab.condition.any': '하나라도 맞으면',
  'ui.editor.vocab.action.destroy_piece': '없애기',
  'ui.editor.vocab.action.teleport_piece': '옮기기',
  'ui.editor.vocab.action.promote_piece': '승급시키기',
  'ui.editor.vocab.action.spawn_piece': '새로 불러내기',
  'ui.editor.vocab.action.block_capture': '못 잡게 막기',
  'ui.editor.vocab.action.freeze_piece': '묶어 두기',
  'ui.editor.vocab.action.grant_movement': '움직임 주기',
  'ui.editor.vocab.action.forbid_movement': '움직임 막기',
  'ui.editor.vocab.action.swap_pieces': '자리 바꾸기',
  'ui.editor.vocab.action.revive_piece': '되살리기',
  'ui.editor.vocab.action.win': '이기기',
  'ui.editor.vocab.movement.slide': '쭉 미끄러지기',
  'ui.editor.vocab.movement.step': '한 칸씩',
  'ui.editor.vocab.movement.jump': '뛰어넘기',
  'ui.editor.vocab.forEach.piece': '기물마다',

  // ============================================================================
  // Chess Craft redesign
  //
  // Placeholders are `{name}` / `{n}` and are filled by `String.replace` at the
  // call site rather than by a formatting library. Korean word order puts the
  // verb last, so a sentence assembled from fragments in English order reads
  // wrong — the whole sentence has to live here, with the holes in it.
  // ============================================================================

  // --- shell ---
  'ui.app.wordmark': 'CHESS\nCRAFT',
  'ui.tab.dex': '도감',
  'ui.tab.label': '갈 곳',
  'ui.action.back': '뒤로',
  'ui.action.close': '닫기',

  // --- onboarding ---
  // Three cards, and each says something a child cannot find out by looking at
  // the board: that they can change it, that the rules move, and that this is
  // for two people on one phone.
  'ui.boot.label': '처음 오셨네요',
  'ui.boot.build.title': '블록으로 체스를 짓자',
  'ui.boot.build.body': '판을 칠하고 기물을 만들고 카드를 끼우면\n나만의 체스가 됩니다.',
  'ui.boot.rules.title': '판마다 규칙이 달라져요',
  'ui.boot.rules.body': '시작할 때 규칙 카드가 한 장 뽑혀요.\n같은 방도 매번 다르게 흘러갑니다.',
  'ui.boot.hotseat.title': '폰 하나로 둘이',
  'ui.boot.hotseat.body': '친구와 번갈아 두세요.\n내 방을 통째로 보내 줄 수도 있어요.',
  'ui.boot.next': '다음',
  'ui.boot.skip': '건너뛰기',
  'ui.boot.done': '시작하기',

  // The first board a player opens. `Boot` says what the app is; this says what
  // a turn is, next to the board it is talking about.
  'ui.intro.title': '이렇게 두면 돼요',
  'ui.intro.rule.label': '이번 판의 규칙',
  'ui.intro.turn.title': '카드를 써도 한 수는 그대로',
  'ui.intro.turn.body': '스킬 카드를 쓰고 나서도 기물을 한 번 움직입니다.\n카드만 쓰고 차례를 넘길 수는 없어요.',
  'ui.intro.opponent.title': '상대가 쓴 카드는 알려줘요',
  'ui.intro.opponent.body': '누가 어떤 카드를 썼는지 화면 위에 잠깐 뜨고,\n카드가 닿은 칸이 함께 반짝입니다.',
  'ui.intro.start': '알겠어요',

  // The card that just fired. `{name}` is the player, not the card — the card
  // has the line below it, where it can be read.
  'ui.card.played.by': '{name} 카드 사용!',

  // --- title screen ---
  'ui.home.prev-room': '이전 방',
  'ui.home.next-room': '다음 방',
  'ui.home.edit-room': '이 방 고치기',
  'ui.home.new-room': '새 방 만들기',
  'ui.home.no-rooms': '아직 방이 하나도 없어요. 하나 만들면 여기에 나와요.',
  'ui.home.tag.pieces': '기물',
  'ui.home.tag.cards': '카드',
  'ui.home.tag.painted': '특별한 칸',

  // --- lobby ---
  'ui.lobby.title': '친구와 놀기',
  'ui.lobby.intro': '폰 하나로 번갈아 둡니다. 이름을 정하고 시작하세요.',
  'ui.lobby.role.white': '파란 편 · 먼저 둠',
  'ui.lobby.role.black': '빨간 편 · 나중에 둠',
  // Between the two player cards. Kept as the Latin 'VS' because that is what
  // this audience reads on every phone game they already play — but it goes
  // through the bundle like everything else, so a locale that wants '대'
  // can have it without a source edit. It shipped as a literal and the chrome
  // scan could not see it: `Lobby.tsx` was missing from that guard's file list.
  'ui.lobby.versus': 'VS',
  'ui.lobby.room': '놀 방',
  'ui.lobby.change-room': '바꾸기',
  'ui.lobby.start': '시작!',
  // Single-player. The mode toggle sits above the two name fields because it
  // decides whether the second one is a person at all.
  'ui.lobby.mode': '누구랑 할까?',
  'ui.lobby.mode.human': '둘이서',
  'ui.lobby.mode.ai': '컴퓨터랑',
  'ui.lobby.difficulty': '컴퓨터 실력',
  'ui.lobby.difficulty.easy': '쉬움',
  'ui.lobby.difficulty.medium': '보통',
  'ui.lobby.difficulty.hard': '어려움',
  'ui.lobby.ai-name': '컴퓨터',
  // Refusal, not a silent disable. The author wrote this content in the editor
  // this app ships, so "왜" is the part that lets them do something about it.
  'ui.lobby.ai-refused.title': '이 방은 컴퓨터랑 할 수 없어',
  'ui.lobby.ai-refused.card_target_product': '카드가 고를 자리가 너무 많아서 컴퓨터가 생각을 못 끝내. 카드에서 고르는 자리를 줄여봐.',
  'ui.lobby.ai-refused.piece_reach': '기물이 갈 수 있는 칸이 너무 많아서 컴퓨터가 생각을 못 끝내.',
  'ui.lobby.ai-refused.board_area': '판이 너무 커서 컴퓨터가 생각을 못 끝내.',
  'ui.lobby.ai-refused.unscoreable': '이 방을 읽을 수 없어서 컴퓨터가 준비를 못 해.',
  'ui.lobby.ai-refused.hint': '둘이서는 그대로 할 수 있어.',
  // The share control hands over the whole room as text. It is long, and saying
  // so up front is better than a child pasting half of it — see the note in
  // `Lobby.tsx` on why this is not a short code.
  // Says "everything I made", not "this room". What travels is the whole
  // document — every room, piece and card in it — because a room points at
  // pieces and cards that would be missing on the friend's phone otherwise.
  // Promising one room and sending all of them is the kind of small lie a child
  // finds out about by being confused.
  'ui.lobby.share.title': '내가 만든 것 주고받기',
  'ui.lobby.share.hint': '내가 만든 방과 기물, 카드가 통째로 넘어가요. 복사한 글자를 전부 보내세요 — 길어요, 잘라 보내면 안 열려요.',
  'ui.lobby.share.copy': '통째로 복사',
  'ui.lobby.share.copied': '복사했어요',
  'ui.lobby.share.copy-failed': '복사할 수 없어요',
  'ui.lobby.share.paste-label': '받은 글자 붙여넣기',
  'ui.lobby.share.warning': '넣으면 지금 내가 만든 것이 친구 것으로 바뀌어요.',
  'ui.lobby.share.paste': '넣기',
  'ui.lobby.share.accepted': '친구가 만든 것을 받았어요.',
  'ui.lobby.share.rejected': '이 글자로는 못 열었어요. 통째로 붙여넣었는지 봐 주세요.',

  // --- the board ---
  'ui.status.whose-turn': '{name} 차례',
  // Replaces the hand-off banner in single-player: there is nobody to hand the
  // phone to, and "생각 중" is the thing that is actually true.
  'ui.ai.thinking': '{name} 생각 중…',
  'ui.ai.degraded': '이 판은 오래 걸려서, 같은 시드로 다시 만들어도 똑같이 재현되지 않아.',
  'ui.status.waiting': '{name} (기다리는 중)',
  'ui.status.taken': '잡은 기물 {n}개',
  'ui.rule.this-match': '이 판의 규칙',
  'ui.draft.hint': '가져간 카드는 대국 중 아무 때나 쓸 수 있어요.',
  'ui.hint.tap-piece': '기물을 눌러 움직이세요',
  // Names the way out as well as the way forward. A pending card used to have
  // no exit but completing it.
  'ui.hint.choose-target': '카드를 쓸 곳을 고르세요. 카드를 다시 누르면 취소돼요.',
  // A card that quantifies over your own pieces, or that places one at your
  // home rank, has no square to point at. Saying "고르세요" there sent the
  // player hunting the board for a target the card never wanted.
  'ui.hint.card-ready': '고를 곳이 없는 카드예요. 아래 버튼을 누르면 바로 써요.',
  'ui.match.use-card': '이 카드 쓰기',

  /*
   * Why this record costs what it costs (PLAN Phase 9, ADR-009).
   *
   * One line per term of the actual arithmetic, in the author's language. The card lines are
   * the ones that need saying out loud: a card's parts do NOT add up to its price, because a
   * card fires and is gone where a piece stays on the board, so the total is divided and
   * rounded. Hiding that step would make the numbers look wrong to anyone who added them.
   */
  /*
   * The two things one map cannot say by itself (PLAN Phase 8, ADR-007 / ADR-008).
   *
   * The first was never said anywhere, and it is the whole reason some settings looked like
   * they disagreed with the preview: a lit cell JUMPS OVER whatever is in the way, a slide
   * STOPS at it. Put an enemy in the path and the two behave differently on purpose.
   *
   * The second explains a promotion the editor has always done and never mentioned: a piece
   * with no capture squares takes wherever it walks, so its move cells come back marked as
   * both. Tapping "이동" and watching the cell say "둘 다" looked like the tap misfired.
   */
  /* "바깥 화살표" in the first draft of this line, from the ring layout that was reverted.
     A sentence that points at something not on screen is the defect this line exists to fix,
     wearing the other hat. */

  /* Shown when a draft cannot be priced yet. Silence here used to mean the SAVED record's price
     stayed on screen describing a declaration the author had already edited away. */
  'ui.editor.cost.unpriceable': '지금은 값을 셈할 수 없어요. 위에 빨간 글씨가 있으면 먼저 고쳐 주세요.',
  'ui.editor.cost.total': '값 {n}',
  'ui.editor.cost.term.walk': '걸어가는 칸 {n}',
  'ui.editor.cost.term.take': '잡을 수 있는 칸 {n} (잡기는 두 배로 셈)',
  'ui.editor.cost.term.separate-attack': '가는 길과 잡는 길이 달라서 {n}',
  'ui.editor.cost.term.promotion': '승급할 수 있어서 {n}',
  'ui.editor.cost.term.effect': '특별한 힘 {n}',
  'ui.editor.cost.step.times-uses': '쓸 수 있는 횟수만큼 {n}배',
  'ui.editor.cost.step.card-divisor': '카드는 한 번 쓰고 사라지니 {n}로 나눔',
  'ui.editor.cost.step.rounded': '가까운 수로 맞춤',
  'ui.editor.cost.step.floor': '아무리 작아도 {n}',

  /*
   * Why a tap was refused (PLAN Phase 4, ADR-010).
   *
   * `describeRejection` returns a code and these are the words. It used to return English
   * prose that the hint bar printed as-is, so a child playing in Korean was shown "that card
   * cannot target those squares".
   *
   * The three protection lines carry the weight. A capture blocked by a painted square, a
   * passive or a blockade used to be reported as "그 칸에는 갈 수 없어요", which is false —
   * the piece could reach it, and something else refused. Each says WHAT refused, because a
   * player who is told the truth can play around it and a player who is told a lie cannot.
   */
  'ui.match.reject.match-over': '이 판은 이미 끝났어요.',
  'ui.match.reject.draft-first': '먼저 카드를 한 장 고르세요.',
  'ui.match.reject.card-not-held': '그 카드는 지금 내 카드가 아니에요.',
  'ui.match.reject.card-spent': '그 카드는 이미 썼어요.',
  'ui.match.reject.card-already-played': '이번 차례에 카드를 벌써 썼어요. 이제 기물을 움직이세요.',
  'ui.match.reject.card-bad-targets': '그 카드는 거기에 쓸 수 없어요.',
  'ui.match.reject.royal-skill-immune': '왕은 스킬의 대상이 되거나 스킬 효과를 받지 않아요.',
  'ui.match.reject.card-not-offered': '그 카드는 지금 고를 수 있는 카드가 아니에요.',
  'ui.match.reject.empty-square': '그 칸에는 기물이 없어요.',
  'ui.match.reject.not-your-piece': '그건 상대 기물이에요.',
  'ui.match.reject.piece-frozen': '이 기물은 얼어 있어서 지금은 못 움직여요.',
  'ui.match.reject.piece-forbidden': '이 기물은 지금 움직일 수 없게 막혀 있어요.',
  'ui.match.reject.target-protected': '그 기물은 보호받고 있어서 잡을 수 없어요.',
  'ui.match.reject.royal-followup-blocked': '이 스킬로 새로 열린 왕 포획은 같은 차례에 할 수 없어요.',
  'ui.match.reject.unreachable': '이 기물은 그 칸까지 갈 수 없어요.',
  'ui.match.reject.move-owed': '아직 기물을 움직여야 해요.',
  'ui.match.reject.card-owed': '이번 차례에 카드를 쓰지 않았어요. 기물을 움직이세요.',
  // The turn no longer ends with the card (ADR-001), so the hint has to say
  // what is left to do — a player who reads "카드를 쓸 곳을 고르세요" and then
  // sees their own turn still on the clock has been told the wrong thing.
  'ui.hint.now-move': '카드를 썼어요. 이제 기물을 움직이세요.',
  // Shown only when the card left nothing that can move (ADR-003). Named as a
  // consequence rather than as a choice, because it is not one.
  'ui.hint.no-moves': '움직일 수 있는 기물이 없어요. 차례를 넘기세요.',
  'ui.action.end-turn': '차례 넘기기',

  // --- effects standing on the board (ADR-005) ---
  'ui.effect.frozen': '얼어붙음',
  'ui.effect.granted': '새 움직임',
  'ui.effect.forbidden': '묶임',
  'ui.effect.shielded': '보호막',
  // The badge shows a number; this is what it means when read aloud or shown in
  // the sheet. Plies, not turns, because that is what the engine counts.
  'ui.effect.remaining': '{n}수 남음',
  'ui.effect.caused-by': '{name} 때문이에요',
  'ui.hand.owner': '{name}의 카드',
  'ui.hand.no-cards': '스킬 카드를 뽑으면 여기에 들어와요.',
  'ui.dex.more': '도감 ▸',
  // The hand-off used to be a full-screen curtain with its own three strings
  // ('폰을 넘겨 주세요' / '차례예요' / '눌러서 시작'). It is a brief banner now,
  // and it reuses `ui.status.whose-turn` — the same sentence the turn bar shows,
  // which is the point: one way of saying whose turn it is, in two places.

  // --- result ---
  'ui.result.winner': '{name} 승리!',
  'ui.result.stat.plies': '둔 수',
  'ui.result.stat.took': '{name} 잡음',

  // --- 기물 정보 (piece info affordances) ---
  // The undrawable notice is a SENTENCE, not an apology or an empty box: a
  // piece whose movement `readGrid` cannot round-trip still has to tell the
  // player something they can act on, and "read the words above" is that.
  'ui.piece-info.undrawable': '이 기물은 움직임이 복잡해서 그림으로 못 보여줘요. 위 설명을 읽어 보세요.',
  'ui.piece-info.grid-label': '이 기물이 갈 수 있는 칸',
  'ui.piece-info.legend.move': '· 갈 수 있어요',
  'ui.piece-info.legend.capture': '× 잡을 수 있어요',
  'ui.piece-info.legend.both': '✳ 가거나 잡아요',
  'ui.piece-info.slides': '{dirs} 쪽으로 {reach}',
  'ui.piece-info.reach.1': '한 칸 미끄러져요',
  'ui.piece-info.reach.2': '두 칸까지 미끄러져요',
  'ui.piece-info.reach.edge': '끝까지 쭉 미끄러져요',
  'ui.piece-info.press-hint': '기물을 꾹 누르면 무슨 기물인지 볼 수 있어요.',
  'ui.piece-info.side-name': '{side} {name}',

  // --- 도감 ---
  'ui.dex.kind.piece': '기물',
  'ui.dex.kind.square': '특별한 칸',
  'ui.dex.kind.rule': '규칙 카드',
  'ui.dex.kind.skill': '스킬 카드',

  // --- the room builder's five steps ---
  'ui.editor.step.board': '판 칠하기',
  'ui.editor.step.pieces': '기물',
  'ui.editor.step.place': '배치',
  'ui.editor.step.cards': '카드',
  'ui.editor.step.name': '이름',
  'ui.editor.step.board-hint': '아래에서 블록을 고른 다음 판을 눌러 칠하세요. 같은 칸을 다시 누르면 지워져요.',
  'ui.editor.step.pieces-hint': '이 방에 넣을 기물을 고르세요. 최소 하나는 있어야 해요.',
  'ui.editor.step.place-hint': '편과 기물을 고른 다음 판을 눌러 세우세요. 세운 자리를 다시 누르면 치워져요.',
  'ui.editor.step.rules-hint': '판이 시작될 때 여기서 한 장이 뽑혀 그 판의 규칙이 돼요.',
  'ui.editor.step.skills-hint': '대국 시작 전에 두 사람이 여기서 한 장씩 골라 가져요.',
  'ui.editor.step.loadout-hint': '두 사람이 각자 기물 하나와 스킬 카드 하나를 자기 것으로 가져갈 수 있어요. 기물은 같은 세기끼리만 바꿔 넣을 수 있고, 둘을 합친 세기가 방의 한도를 넘으면 안 돼요.',
  'ui.editor.paint.palette': '블록 고르기',
  'ui.editor.paint.erase': '지우개',
  'ui.editor.paint.erase-hint': '칠한 블록을 지웁니다.',
  // Paired types need a symmetric partner or the board will not load, so the
  // tool paints them in two taps rather than saving something invalid.
  'ui.editor.paint.paired-hint': '이 블록은 둘씩 짝을 지어요. 두 칸을 차례로 누르세요.',
  'ui.editor.paint.pair-pending': '짝이 될 칸을 하나 더 누르세요. 같은 칸을 다시 누르면 그만둬요.',
  'ui.editor.place.count': '파란 편 {white} · 빨간 편 {black}',
  'ui.editor.place.clear': '전부 치우기',
  'ui.editor.room.summary': '기물 {pieces} · 규칙 카드 {rules} · 스킬 카드 {skills}',
  'ui.editor.room.play': '바로 해보기',

  // --- the piece maker ---
  'ui.editor.field.art': '그림',
  'ui.editor.piece.how': '어디로 뛰어가나요',
  'ui.editor.piece.how-hint': '가운데가 이 기물이에요. 칸을 누르면 안 감 → 뛰어감 순으로 바뀌어요. 가운데에서 곧게 뻗은 칸은 한 번 더 누르면 미끄러짐이 돼요. 뛰어감은 가는 길에 기물이 있어도 넘어가고, 미끄러짐은 거기서 멈춰요. 맨 바깥 칸을 미끄러짐으로 켜면 끝까지 가요.',
  'ui.editor.piece.dir.n': '위',
  'ui.editor.piece.dir.ne': '오른쪽 위',
  'ui.editor.piece.dir.e': '오른쪽',
  'ui.editor.piece.dir.se': '오른쪽 아래',
  'ui.editor.piece.dir.s': '아래',
  'ui.editor.piece.dir.sw': '왼쪽 아래',
  'ui.editor.piece.dir.w': '왼쪽',
  'ui.editor.piece.dir.nw': '왼쪽 위',
  'ui.editor.piece.clear': '움직임 모두 지우기',
  'ui.editor.piece.forward': '앞쪽 기준으로 뒤집기',
  'ui.editor.piece.forward-hint': '켜면 검은 편에서는 위아래가 뒤집혀요. 병사처럼 앞으로만 가는 기물에 써요.',
  // The summary counts DIRECTIONS for the sliding half and SQUARES for the
  // hopping half. The version before this counted lit cells for both, which
  // under a `slide` travel kind was a number that meant nothing — four lit cells
  // were never four moves.
  'ui.editor.piece.summary.reach.1': '한 칸씩',
  'ui.editor.piece.summary.reach.2': '두 칸까지',
  'ui.editor.piece.summary.reach.edge': '끝까지',
  'ui.editor.piece.summary.reach.mixed': '방향마다 다르게',
  'ui.editor.piece.summary.hop': '{moves}곳으로 뛴다. 잡을 수 있는 곳은 {takes}곳.',
  'ui.editor.piece.summary.slide': '{dirs}갈래로 {reach} 쭉 간다. 잡을 수 있는 곳은 {takes}곳.',
  'ui.editor.piece.summary.both': '{dirs}갈래로 {reach} 쭉 가고, {moves}곳으로 뛴다. 잡을 수 있는 곳은 {takes}곳.',
  'ui.editor.piece.mode.move': '움직이기',
  'ui.editor.piece.mode.capture': '잡기',
  'ui.editor.piece.clear-capture': '잡는 자리 지우기',
  'ui.editor.piece.capture-follows': '따로 안 정하면 움직이는 대로 잡아요. 지금 잡는 자리가 켜져 있어요.',
  'ui.editor.piece.no-moves': '갈 수 있는 칸이 하나도 없어요. 이동 칸을 적어도 하나 골라 주세요.',
  // Omitting `attack` means captures fall back to the movement — so "moves but
  // never captures" is not something the schema can say, and pretending
  // otherwise would ship a piece that takes when the child said it would not.
  'ui.editor.piece.no-takes': '잡기 칸을 따로 고르지 않으면, 갈 수 있는 칸에서 그대로 잡아요.',
  'ui.editor.gallery.title': '무엇부터 시작할까요',
  'ui.editor.gallery.hint': '이미 있는 걸 골라서 조금만 바꾸면 가장 쉬워요. 원본은 그대로 있고, 고른 것을 본뜬 새것이 만들어져요.',
  'ui.editor.gallery.blank': '아무것도 없이 시작하기',
  'ui.editor.template.zap': '상대 기물 하나 없애기',
  'ui.editor.template.hold': '상대 기물 하나 묶어 두기',
  'ui.editor.template.hop': '내 기물 하나 옮기기',
  'ui.editor.template.toll': '잡은 기물도 함께 사라지기',
  'ui.editor.template.tar': '들어온 기물 발 묶기',
  'ui.editor.template.guard': '움직인 기물 지켜 주기',

  // --- the card maker ---
  'ui.editor.card.recipe': '이 카드가 하는 일',
  'ui.editor.card.recipe-hint': '빈 자리를 골라 블록을 끼우세요. 끼운 대로 카드가 만들어집니다.',
  'ui.editor.card.slot.when': '언제',
  'ui.editor.card.slot.cond': '이럴 때만',
  'ui.editor.card.slot.then': '그러면',
  'ui.editor.card.slot.who': '누구에게',
  'ui.editor.card.slot.none': '고를 것 없음',
  'ui.editor.card.reads-as': '이렇게 됩니다',
  'ui.editor.card.sentence.skill': '카드를 내면, {cond}일 때 {who}에게 「{then}」을 한다.',
  'ui.editor.card.sentence.rule': '{when}에, {cond}일 때 {who}에게 「{then}」을 한다.',
  // The `ui.editor.form.tab.*`, `*.complex*`, `ui.editor.movement.*`,
  // `ui.editor.palette.*` and `ui.editor.effects.*` keys are gone with the surfaces
  // that used them (PLAN Phase 7 of unified-create-ux). A key that outlives its
  // referent is worse than a missing one: it reads as copy someone still ships.

  // --- a record this screen cannot edit (read-only) ---
  'ui.editor.readonly.title': '이건 여기서 고칠 수 없어요',
  'ui.editor.readonly.hint': '이 기록은 지금 화면이 문장으로 보여줄 수 없는 모양이에요. 하는 일은 아래에 그대로 있고, 내용은 하나도 바뀌지 않아요. 이름과 그림은 그대로 고칠 수 있어요.',
  'ui.editor.readonly.moves-title': '이 기물의 움직임은 여기서 그릴 수 없어요',
  'ui.editor.readonly.moves-line': '{kind} — {count}군데',
  'ui.editor.readonly.unknown': '이 부분은 아직 문장으로 풀어 쓸 수 없어요.',

  // --- the sentence maker (one screen) ---
  'ui.editor.card.sentence-hint': '한 줄씩 눌러서 골라요. 고른 대로 아래에 이 카드가 하는 일이 문장으로 나와요.',
  'ui.editor.card.sentence-incomplete': '아직 이 카드가 할 일을 안 골랐어요.',
  'ui.editor.card.slot.each': '누구마다',
  'ui.editor.card.slot.cond2': '여기에 더해',
  'ui.editor.card.slot.op': '두 조건은',
  'ui.editor.card.slot.then2': '그리고 또',
  'ui.editor.card.slot.whoB': '그리고 누구와',
  'ui.editor.card.slot.where': '어디로',
  'ui.editor.card.slot.not': '아닐 때',
  'ui.editor.card.slot.pick': '고르기',
  // Relative roles, not colours. `mover` / `opponent` are resolved per event — the
  // side that triggered it and the other one — so naming them '파란 편' / '빨간 편'
  // (which is what `ui.side.*` says) tells the author the opposite thing half the
  // time. Phrasing follows `ui.editor.vocab.target.mover`, which already said it right.
  'ui.editor.vocab.side.mover': '둔 쪽',
  'ui.editor.vocab.side.opponent': '상대 쪽',
  'ui.editor.vocab.op.all': '둘 다 맞을 때',
  'ui.editor.vocab.op.any': '하나만 맞아도',
  'ui.editor.card.line.skill': '카드를 내면, {each}{cond}일 때 {body}.',
  'ui.editor.card.line.rule': '{when}에, {each}{cond}일 때 {body}.',
  'ui.editor.card.line.each': '해당하는 기물마다 ',
  'ui.editor.card.line.not': '{cond}이 아닐 때',
  'ui.editor.card.line.all': '{a}이고 {b}',
  'ui.editor.card.line.any': '{a}이거나 {b}',
  'ui.editor.card.line.clause': '{who}에게 「{then}」을 한다',
  'ui.editor.card.line.clause-dest': '{who}를 {where}로 「{then}」한다',
  'ui.editor.card.line.clause-two': '{who}와 {whoB}를 「{then}」한다',
  'ui.editor.card.line.clause-bare': '「{then}」을 한다',
  'ui.editor.card.line.and': ', 그리고 ',

}
