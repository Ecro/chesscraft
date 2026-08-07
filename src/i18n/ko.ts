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

  'ui.editor.form.new': '새로 만들기',
  'ui.editor.form.save': '저장하기',
  'ui.editor.form.saved': '저장했어요',
  'ui.editor.form.close': '닫기',
  'ui.editor.form.errors': '아직 저장할 수 없어요',
  // The document moved under an open form — after an import, or after the
  // other tab saved the same thing. Naming both causes, because the child
  // did one of them a moment ago and will recognise it.
  'ui.editor.form.stale': '이 사이에 내용이 바뀌었어요. 방금 받은 것을 덮어쓰지 않으려고 저장을 멈췄어요. 다시 열어서 고쳐 주세요.',
  'ui.editor.form.advanced': '고급 설정',
  // Clearing a name means "cancel the name I gave it", and what shows then is
  // whatever came in the box. A thing nobody else ever named has nothing to
  // fall back to, so the editor asks for a name instead of showing its key.
  'ui.editor.form.discard-confirm': '만들던 것이 아직 저장되지 않았어요. 그냥 두고 새로 만들까요?',
  'ui.editor.form.name-needed': '이건 이름이 꼭 있어야 해요. 지우면 부를 이름이 없어져요.',
  'ui.editor.field.id': '구분 이름표',
  'ui.editor.field.id-hint': '영어와 점으로 짧게 써요. 예: piece.rabbit',
  'ui.editor.field.name': '이름',
  'ui.editor.field.text': '설명',
  'ui.editor.field.name-slot': '이름 열쇠',
  'ui.editor.field.text-slot': '설명 열쇠',
  'ui.editor.field.cost': '값',
  'ui.editor.field.uses': '쓸 수 있는 횟수',
  'ui.editor.field.paired': '짝이 있는 칸',
  'ui.editor.field.royal': '잃으면 지는 기물',
  'ui.editor.field.promotion-rank': '몇 번째 줄에서 승급하나요',
  'ui.editor.field.promotion-to': '무엇으로 승급하나요',

  'ui.editor.movement.legend': '어떻게 움직이나요',
  'ui.editor.movement.clear': '움직임 모두 지우기',
  'ui.editor.movement.add': '움직임 더하기',
  'ui.editor.movement.max': '최대 몇 칸',
  'ui.editor.movement.forward': '편에 따라 앞뒤가 바뀌어요',
  'ui.editor.attack.legend': '어떻게 잡나요 (비워 두면 움직이는 대로 잡아요)',
  'ui.editor.effects.legend': '무슨 일이 일어나나요',
  'ui.editor.effects.add': '일 더하기',
  'ui.editor.effects.item': '일',
  'ui.editor.palette.trigger': '언제',
  'ui.editor.palette.condition': '이럴 때만',
  'ui.editor.palette.forEach': '누구마다',
  'ui.editor.palette.action': '그러면',
  'ui.editor.palette.target': '누구에게',
  'ui.editor.palette.destination': '어디로',
  'ui.editor.board.width': '가로 칸 수',
  'ui.editor.board.height': '세로 칸 수',
  'ui.editor.board.paint': '칠할 칸 종류',
  'ui.editor.board.place': '놓을 기물',
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
  'ui.editor.vocab.destination.paired_square': '짝이 된 칸',
  'ui.editor.vocab.destination.chosen_empty': '고른 빈 칸',
  'ui.editor.vocab.destination.square': '정해진 칸',
  'ui.editor.vocab.destination.own_back_rank': '우리 편 맨 뒷줄',
  'ui.editor.vocab.destination.offset': '몇 칸 떨어진 곳',
  'ui.editor.vocab.condition.always': '언제나',
  'ui.editor.vocab.condition.piece_is': '이 기물이면',
  'ui.editor.vocab.condition.piece_side': '이 편이면',
  'ui.editor.vocab.condition.on_square': '이 칸에 있으면',
  'ui.editor.vocab.condition.on_own_rank': '자기 진영에서 몇 번째 줄에 있으면',
  'ui.editor.vocab.condition.check_count_at_least': '왕이 몇 번 넘게 위험했으면',
  'ui.editor.vocab.condition.piece_count_at_most': '기물이 몇 개 아래면',
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
  'ui.editor.piece.how': '어떻게 움직이나요',
  'ui.editor.piece.how-hint': '칸을 누를 때마다 이동 → 잡기 → 둘 다 → 없음 순으로 바뀝니다. 가운데가 이 기물이에요.',
  'ui.editor.piece.summary.step': '갈 수 있는 칸 {moves}곳, 잡을 수 있는 칸 {takes}곳으로 한 칸씩 움직인다.',
  'ui.editor.piece.summary.slide': '갈 수 있는 방향 {moves}갈래, 잡을 수 있는 방향 {takes}갈래로 원하는 만큼 쭉 간다.',
  'ui.editor.piece.summary.jump': '갈 수 있는 칸 {moves}곳, 잡을 수 있는 칸 {takes}곳으로 뛴다. 사이에 기물이 있어도 넘어간다.',
  'ui.editor.piece.dex-preview': '도감에는 이렇게 적혀요',
  'ui.editor.piece.use-summary': '이 설명 쓰기',
  'ui.editor.piece.no-moves': '갈 수 있는 칸이 하나도 없어요. 이동 칸을 적어도 하나 골라 주세요.',
  // Omitting `attack` means captures fall back to the movement — so "moves but
  // never captures" is not something the schema can say, and pretending
  // otherwise would ship a piece that takes when the child said it would not.
  'ui.editor.piece.no-takes': '잡기 칸을 따로 고르지 않으면, 갈 수 있는 칸에서 그대로 잡아요.',
  'ui.editor.piece.complex': '이 기물은 자세히 설정으로 만들어졌어요',
  'ui.editor.piece.complex-hint': '움직임이 여러 가지라 격자 하나로는 못 그려요. 아래 자세한 칸에서 고쳐 주세요.',

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
  'ui.editor.card.complex': '이 카드는 자세히 설정으로 만들어졌어요',
  'ui.editor.card.complex-hint': '하는 일이 여러 가지라 블록 네 개로는 못 담아요. 아래 자세한 칸에서 고쳐 주세요.',
}
