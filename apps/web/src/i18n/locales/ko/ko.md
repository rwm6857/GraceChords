# GraceChords Glossary — `ko`

Locked-in terminology and convention decisions for the Korean locale. Future revisions and translators should follow these unless Ryan explicitly changes them.

**Locale:** `ko`
**Last updated:** 2026-05-03
**Reviewer:** Ryan

## Brand and product names

| English | Korean | Note |
|---|---|---|
| GraceChords | GraceChords | Brand — never translate |
| Worship Mode | 예배 모드 | |
| Song of the Day | 오늘의 찬양 | |
| Daily Word | 오늘의 말씀 | **Kept as native term** — unlike Turkish (where literal failed). 오늘의 말씀 is the established Korean Protestant phrase for daily devotional. Do **not** change to 성경. |
| Quiet Time | 큐티 | Universally established loanword in Korean evangelical churches |
| High Energy Hit | 힘찬 찬양 | 힘찬 = "energetic / vigorous" — better match than 강력한 (powerful) for the energy aspect |
| Celebration Set | 축하 셋리스트 | Use 셋리스트, never bare 셋 |
| Build a 3-Song Flow | 3곡 흐름 만들기 | |
| Random Theme Set | 랜덤 주제 셋리스트 | |
| Random 10-Song Collection | 랜덤 10곡 모음 | 모음 (collection) for "Collection" terms; 셋리스트 for "Set" terms |
| "Send Me" Songbook | "나를 보내소서" 송북 | -소서 honorific is the standard Korean Bible rendering of Isaiah 6:8 |
| GraceChords Songbook | GraceChords 송북 | |
| Contribute | 기여하기 | Not 참여하기 (which means "participate") |
| Song Library | 찬양곡 라이브러리 | |
| Setlist Builder | 셋리스트 빌더 | |
| Songbook Tool | 송북 도구 | |
| Editor Portal | 편집자 포털 | 편집자 = the person (an editor) |
| Admin Portal | 관리자 포털 | |

## Worship and ministry vocabulary

| English | Korean | Note |
|---|---|---|
| God | 하나님 | Standard in Korean Protestant Bibles. Do **not** use 하느님 (Catholic / secular) |
| Holy Spirit | 성령 | Use the honorific 인도하심 etc. when describing the Spirit's actions |
| Word / Word of God | 말씀 / 하나님의 말씀 | 말씀 alone is understood as God's Word in Christian Korean |
| Bible | 성경 | |
| Bible verse | 성경 구절 | |
| Worship (act / service) | 예배 | |
| Praise / worship song | 찬양 / 찬양곡 | 찬양곡 for "songs" specifically. Do not use generic 노래 |
| Setlist | 셋리스트 | Established loanword. Never bare 셋 |
| Songbook | 송북 | Loanword. Acceptable for contemporary worship app context. Traditional 찬송가 (hymnbook) is a different concept |
| Hymn (traditional) | 찬송가 | Not used in this app |
| Sheet music vs. chord chart | 악보 vs. 코드 악보 | Use **코드 악보** for chord charts. 악보 alone implies sheet music with full notation |
| Cross | 십자가 | |
| Missions | 선교 | |
| Commitment / Dedication | 헌신 | |

## UI conventions

| Pattern | Decision |
|---|---|
| Politeness register | Mix: 합쇼체 (formal `~습니다`) for system messages, 해요체 (polite `~세요/~해요`) for user-directed instructions. Matches mainstream Korean SaaS (Google, Naver, Microsoft) |
| Button voice | Bare nouns (`저장`, `취소`, `삭제`) or noun phrases (`계정 만들기`, `로그인하기`) |
| Loading state | `~중…` (e.g., `불러오는 중…`, `로그인 중…`, `계정 만드는 중…`). Always with U+2026 ellipsis |
| Polite imperatives | `~세요` / `~해 주세요` (e.g., `확인해 주세요`, `선택하세요`) |
| Numerals | Use figures, never spelled out (`8자 이상` not `여덟 자 이상`; `1단으로`, `2단으로`) |
| Length | Korean is generally more compact than English in CJK display width. Matches or shortens English in nearly all cases. |

## Word-choice preferences

| Concept | Use | Avoid | Why |
|---|---|---|---|
| At least N | **N 이상** | 최소 N 이상 | 최소 (minimum) + 이상 (or more) is redundant |
| Create / creating (account) | **만들기 / 만드는** | 생성 / 생성 중 | Match register within file. 만들기 is friendlier and matches the source's "Create" |
| Contribute | **기여하기** | 참여하기 | 참여하기 means "participate"; 기여하기 is "contribute (back)" |
| Set (as in song-set) | **셋리스트** | bare 셋 | Bare 셋 is awkward; 셋리스트 is the established loanword |
| Energetic praise | **힘찬 찬양** | 강력한 찬양 | 강력한 = "powerful/mighty" (solemn); 힘찬 = "energetic" (matches "high energy") |
| Modern conversational | **봐요** | 보아요 | 보아요 is older/literary; 봐요 is contemporary UI register |

## Decisions worth preserving

- **`nav.dailyWord` stays "오늘의 말씀"** — opposite outcome from the Turkish locale. In Korean, this phrase is the authentic native term Korean Protestants use for daily devotional verses; it doesn't carry the awkwardness "Günün Sözü" had in Turkish. Don't localize away from it.
- **`home.actions.threeSongFlow.title` keeps the verb 만들기.** Unlike Turkish where the imperative was dropped, Korean reads more naturally as "3곡 흐름 만들기" (Build a 3-Song Flow) than bare "3곡 흐름." Length is still shorter than English in display width.
- **Spirit / Holy Spirit:** 성령 with honorific verb forms (`인도하심`, `~하시는`) when describing the Spirit's action. Don't drop the honorific — Korean Christian register requires it.
- **편집자 vs 편집기 distinction is intentional.** 편집자 = the person (Editor Portal). 편집기 = the tool/interface (Song Editor, Post Editor). Korean disambiguates where English uses "editor" for both.

## Items currently flagged for human review

- **`auth.welcomeBack`** — "다시 오신 것을 환영합니다" is grammatically correct but slightly ceremonial. Modern apps sometimes use shorter forms ("어서 오세요", "다시 만나서 반가워요"). Not changed; matches the formal register of the rest of the file.
- **`home.actions.highEnergy.desc`** — "찬양의 함성을 올려요!" uses 해요체 ending while neighboring strings use 해주세요/하세요. Minor register inconsistency. Both grammatical; flagging for next pass.
- **`home.actions.songOfDay.desc`** — "매일의 예배에 함께해 보세요" reads slightly literal. Native phrasing might be "매일 예배에 함께하세요" (drop 의 + 보). Flagging.
